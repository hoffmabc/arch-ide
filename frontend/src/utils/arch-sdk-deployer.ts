/**
 * Arch Network Program Deployer
 *
 * This module replicates the exact deployment logic from the arch-network SDK
 * located at: sdk/src/helper/program_deployment.rs
 *
 * Key features:
 * - Creates program accounts with BPF Loader ownership
 * - Handles program redeployment (retraction)
 * - Dynamic account resizing (truncation)
 * - Chunked ELF upload with proper loader instructions
 * - Makes programs executable
 */

import { Buffer } from 'buffer/';
import { RpcConnection, Instruction, RuntimeTransaction, Message } from '@saturnbtcio/arch-sdk';
import { MessageUtil } from '@saturnbtcio/arch-sdk';
import { signMessage } from './bitcoin-signer';
import { bitcoinRpcRequest } from '../api/bitcoin/rpc';
import { getSmartRpcUrl } from './smartRpcConnection';
import { sha256 } from 'js-sha256';

// ============================================================================
// CONSTANTS (matching arch-network/program/src)
// ============================================================================

/** System Program ID - handles account creation and transfers */
const SYSTEM_PROGRAM_ID = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex');

/** BPF Loader ID - owns and manages program accounts */
// "BpfLoader11111111111111111111111" as ASCII bytes (matches Rust: Pubkey(*b"BpfLoader11111111111111111111111"))
const BPF_LOADER_ID = Buffer.from('BpfLoader11111111111111111111111', 'ascii');

// Verify BPF_LOADER_ID is correct (32 bytes)
console.log('[Constants] BPF_LOADER_ID:', BPF_LOADER_ID.toString('hex'), `(${BPF_LOADER_ID.length} bytes)`);
console.log('[Constants] BPF_LOADER_ID as ASCII:', BPF_LOADER_ID.toString('ascii'));

/** Size of LoaderState header (authority_address + status) */
const LOADER_STATE_SIZE = 33;

/** Maximum transaction size */
const RUNTIME_TX_SIZE_LIMIT = 240000;

// ============================================================================
// LOADER INSTRUCTION VARIANTS (bincode serialization)
// ============================================================================

enum LoaderInstruction {
  Write = 0,
  Truncate = 1,
  Deploy = 2,
  Retract = 3,
  TransferAuthority = 4,
}

// ============================================================================
// SYSTEM INSTRUCTION VARIANTS
// ============================================================================

enum SystemInstruction {
  CreateAccount = 0,
  CreateAccountWithAnchor = 1,
  Assign = 2,
  Transfer = 3,
  CreateAccountWithSeed = 4,
  AdvanceNonceAccount = 5,
  WithdrawNonceAccount = 6,
  InitializeNonceAccount = 7,
  AuthorizeNonceAccount = 8,
  Allocate = 9,
  AllocateWithSeed = 10,
  AssignWithSeed = 11,
  TransferWithSeed = 12,
}

// ============================================================================
// TYPES
// ============================================================================

interface DeployOptions {
  rpcUrl: string;
  network: 'testnet' | 'mainnet-beta' | 'devnet';
  programBinary: Buffer;
  programKeypair: {
    privkey: string;
    pubkey: string;
    address: string;
  };
  authorityKeypair: {
    privkey: string;
    pubkey: string;
    address: string;
  };
  regtestConfig?: {
    url: string;
    username: string;
    password: string;
  };
  utxoInfo?: {
    txid: string;
    vout: number;
  };
  onMessage?: (type: 'info' | 'success' | 'error', message: string) => void;
}

interface AccountInfo {
  lamports: number;
  owner: Buffer;
  data: Buffer;
  is_executable: boolean;
  utxo: string;
}

// ============================================================================
// BINCODE SERIALIZATION HELPERS
// ============================================================================

/** Serialize LoaderInstruction::Write { offset: u32, bytes: Vec<u8> } */
function serializeWriteInstruction(offset: number, bytes: Buffer): Buffer {
  const data = Buffer.alloc(1 + 4 + 4 + bytes.length);
  let pos = 0;

  // Write variant tag
  data.writeUInt8(LoaderInstruction.Write, pos);
  pos += 1;

  // Write offset (u32 little-endian)
  data.writeUInt32LE(offset, pos);
  pos += 4;

  // Write bytes length (u32 little-endian for Vec length)
  data.writeUInt32LE(bytes.length, pos);
  pos += 4;

  // Write bytes
  bytes.copy(data, pos);

  return data;
}

/** Serialize LoaderInstruction::Truncate { new_size: u32 } */
function serializeTruncateInstruction(newSize: number): Buffer {
  const data = Buffer.alloc(1 + 4);
  data.writeUInt8(LoaderInstruction.Truncate, 0);
  data.writeUInt32LE(newSize, 1);
  return data;
}

/** Serialize LoaderInstruction::Deploy */
function serializeDeployInstruction(): Buffer {
  return Buffer.from([LoaderInstruction.Deploy]);
}

/** Serialize LoaderInstruction::Retract */
function serializeRetractInstruction(): Buffer {
  return Buffer.from([LoaderInstruction.Retract]);
}

/** Serialize SystemInstruction::CreateAccount */
function serializeCreateAccountInstruction(
  lamports: number,
  space: number,
  owner: Buffer
): Buffer {
  const data = Buffer.alloc(1 + 8 + 8 + 32);
  let pos = 0;

  // Variant tag
  data.writeUInt8(SystemInstruction.CreateAccount, pos);
  pos += 1;

  // Lamports (u64 little-endian) - split into two u32s
  data.writeUInt32LE(lamports & 0xFFFFFFFF, pos);
  data.writeUInt32LE(Math.floor(lamports / 0x100000000), pos + 4);
  pos += 8;

  // Space (u64 little-endian) - split into two u32s
  data.writeUInt32LE(space & 0xFFFFFFFF, pos);
  data.writeUInt32LE(Math.floor(space / 0x100000000), pos + 4);
  pos += 8;

  // Owner (32 bytes)
  owner.copy(data, pos);

  return data;
}

/** Serialize SystemInstruction::Transfer */
function serializeTransferInstruction(lamports: number): Buffer {
  const data = Buffer.alloc(1 + 8);
  data.writeUInt8(SystemInstruction.Transfer, 0);
  // Lamports (u64 little-endian) - split into two u32s
  data.writeUInt32LE(lamports & 0xFFFFFFFF, 1);
  data.writeUInt32LE(Math.floor(lamports / 0x100000000), 5);
  return data;
}

// ============================================================================
// CHUNK SIZE CALCULATION (matches extend_bytes_max_len)
// ============================================================================

/**
 * Calculate maximum chunk size for ELF data
 * Matches the Rust SDK's extend_bytes_max_len() function
 */
function calculateMaxChunkSize(): number {
  // Create a dummy write instruction with 256 bytes
  const dummyInstruction: Instruction = {
    program_id: BPF_LOADER_ID,
    accounts: [
      { pubkey: SYSTEM_PROGRAM_ID, is_signer: false, is_writable: true },
      { pubkey: SYSTEM_PROGRAM_ID, is_signer: true, is_writable: false },
    ],
    data: serializeWriteInstruction(0, Buffer.alloc(256)),
  };

  // Create a dummy message
  const dummyMessage: Message = {
    signers: [SYSTEM_PROGRAM_ID],
    instructions: [dummyInstruction],
  };

  // Create a dummy transaction (using any to avoid type issues)
  const dummyTx: any = {
    version: 0,
    signatures: [Buffer.alloc(64)],
    message: dummyMessage,
  };

  // Estimate serialized size (rough estimate based on transaction structure)
  const signaturesSize = 64; // One 64-byte signature
  const signersSize = 32 * dummyMessage.signers.length;
  const instructionSize = 200; // Approximate size per instruction
  const txOverhead = 1 + signaturesSize + signersSize + instructionSize;

  // Calculate available space for data
  const availableSpace = RUNTIME_TX_SIZE_LIMIT - txOverhead;

  console.log('[Chunk Size] Calculated max chunk size:', availableSpace);
  return Math.max(availableSpace, 1000); // Minimum 1KB chunks
}

// ============================================================================
// RENT CALCULATION (matches arch_program::rent::minimum_rent)
// ============================================================================

/**
 * Calculate minimum rent for account
 * Simplified version - in production, this should match the on-chain rent calculation
 */
function calculateMinimumRent(dataSize: number): number {
  // Basic rent formula: base rent + per-byte rent
  const BASE_RENT = 890880; // Base lamports
  const RENT_PER_BYTE = 6960; // Lamports per byte

  return BASE_RENT + (dataSize * RENT_PER_BYTE);
}

// ============================================================================
// RPC HELPERS
// ============================================================================

class ArchDeployer {
  private connection: RpcConnection;
  private smartRpcUrl: string;
  private network: string;
  private onMessage: (type: 'info' | 'success' | 'error', message: string) => void;

  constructor(
    rpcUrl: string,
    network: string,
    onMessage?: (type: 'info' | 'success' | 'error', message: string) => void
  ) {
    this.smartRpcUrl = getSmartRpcUrl(rpcUrl);
    this.connection = new RpcConnection(this.smartRpcUrl);
    this.network = network;
    this.onMessage = onMessage || (() => {});
  }

  /** Read account info from the network */
  async readAccountInfo(pubkey: Buffer): Promise<AccountInfo | null> {
    try {
      const accountInfo = await this.connection.readAccountInfo(pubkey);

      return {
        lamports: accountInfo.lamports,
        owner: Buffer.from(accountInfo.owner),
        data: Buffer.from(accountInfo.data),
        is_executable: accountInfo.is_executable,
        utxo: accountInfo.utxo,
      };
    } catch (error) {
      console.log('[Account Info] Account does not exist:', pubkey.toString('hex'));
      return null;
    }
  }

  /** Get account address (Bitcoin address for UTXO) */
  async getAccountAddress(pubkey: Buffer): Promise<string> {
    return await this.connection.getAccountAddress(pubkey);
  }

  /** Get best finalized block hash for recent blockhash */
  async getBestBlockHash(): Promise<Buffer> {
    const hash = await this.connection.getBestBlockHash();
    return Buffer.from(hash, 'hex');
  }

  /** Request airdrop for testnet/devnet */
  async requestAirdrop(pubkeyHex: string): Promise<void> {
    try {
      const pubkey = Buffer.from(pubkeyHex, 'hex');
      await this.connection.requestAirdrop(pubkey as any);
      console.log(`[Airdrop] Requested for ${pubkeyHex}`);
    } catch (error) {
      console.warn('[Airdrop] Request failed:', error);
      throw error;
    }
  }

  /** Convert Buffers to plain arrays for JSON serialization */
  private bufferToArray(obj: any): any {
    // Handle undefined/null
    if (obj === undefined || obj === null) {
      console.warn('[bufferToArray] Encountered undefined/null value');
      return obj;
    }

    if (Buffer.isBuffer(obj)) {
      return Array.from(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.bufferToArray(item));
    }
    if (typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          result[key] = this.bufferToArray(obj[key]);
        }
      }
      return result;
    }
    return obj;
  }

  /** Send transaction and wait for confirmation */
  async sendAndConfirmTransaction(tx: RuntimeTransaction): Promise<string> {
    try {
      console.log('[Transaction] Sending transaction...');
      console.log('[Transaction] Transaction structure:', {
        version: tx.version,
        numSignatures: tx.signatures.length,
        numSigners: (tx.message as any).signers?.length,
        numInstructions: (tx.message as any).instructions?.length,
      });

      // Convert all Buffers to plain arrays
      const txPlain = this.bufferToArray(tx);

      // Build the RPC payload with transaction as params (NOT wrapped in array)
      const payload = {
        jsonrpc: '2.0',
        id: 'curlycurl',
        method: 'send_transaction',
        params: txPlain, // ← Transaction directly as params (not array)
      };

      console.log('[Transaction] Sending to RPC:', this.smartRpcUrl);

      // Log full payload structure for debugging
      const payloadStr = JSON.stringify(payload);
      console.log('[Transaction] Payload length:', payloadStr.length);
      console.log('[Transaction] Full payload:', payload);

      const response = await fetch(this.smartRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('[Transaction] RPC response:', result);

      if (result.error) {
        throw new Error(`Transaction failed: ${JSON.stringify(result.error)}`);
      }

      const txid = result.result;
      console.log('[Transaction] Sent successfully:', txid);

      // Wait for confirmation
      await new Promise(resolve => setTimeout(resolve, 3000));

      return txid;
    } catch (error) {
      console.error('[Transaction] Error sending transaction:', error);
      throw error;
    }
  }

  /** Send multiple transactions in batch */
  async sendBatchTransactions(txs: RuntimeTransaction[]): Promise<string[]> {
    const txids: string[] = [];

    // Send one at a time for now (can optimize later)
    for (let i = 0; i < txs.length; i++) {
      try {
        console.log(`[Batch] Sending transaction ${i + 1}/${txs.length}`);

        const txid = await this.sendAndConfirmTransaction(txs[i]);
        txids.push(txid);

        // Progress update every 10 transactions
        if ((i + 1) % 10 === 0 || i === txs.length - 1) {
          this.onMessage('info', `Uploaded ${i + 1}/${txs.length} chunks`);
        }

        // Small delay between transactions
        if (i < txs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`[Batch] Error sending transaction ${i + 1}:`, error);
        throw error;
      }
    }

    return txids;
  }

  /** Serialize ArchMessage (matches Rust's ArchMessage::serialize) */
  private serializeArchMessage(message: any): Uint8Array {
    const parts: number[] = [];

    // Serialize header (3 bytes)
    parts.push(message.header.num_required_signatures);
    parts.push(message.header.num_readonly_signed_accounts);
    parts.push(message.header.num_readonly_unsigned_accounts);

    // Serialize account_keys length (4 bytes, little-endian u32)
    const numKeys = message.account_keys.length;
    parts.push(numKeys & 0xFF);
    parts.push((numKeys >> 8) & 0xFF);
    parts.push((numKeys >> 16) & 0xFF);
    parts.push((numKeys >> 24) & 0xFF);

    // Serialize account_keys (each 32 bytes)
    message.account_keys.forEach((key: Buffer) => {
      const keyBytes = Buffer.isBuffer(key) ? Array.from(key) : key;
      parts.push(...keyBytes);
    });

    // Serialize recent_blockhash (32 bytes)
    const blockhashBytes = Buffer.isBuffer(message.recent_blockhash)
      ? Array.from(message.recent_blockhash)
      : message.recent_blockhash;
    parts.push(...blockhashBytes);

    // Serialize instructions length (4 bytes, little-endian u32)
    const numInstructions = message.instructions.length;
    parts.push(numInstructions & 0xFF);
    parts.push((numInstructions >> 8) & 0xFF);
    parts.push((numInstructions >> 16) & 0xFF);
    parts.push((numInstructions >> 24) & 0xFF);

    // Serialize each instruction
    message.instructions.forEach((ix: any) => {
      // program_id_index (1 byte)
      parts.push(ix.program_id_index);

      // accounts length (1 byte)
      parts.push(ix.accounts.length);

      // account indices (each 1 byte)
      parts.push(...ix.accounts);

      // data length (2 bytes, little-endian u16)
      const dataLen = ix.data.length;
      parts.push(dataLen & 0xFF);
      parts.push((dataLen >> 8) & 0xFF);

      // data bytes
      const dataBytes = Buffer.isBuffer(ix.data) ? Array.from(ix.data) : ix.data;
      parts.push(...dataBytes);
    });

    return new Uint8Array(parts);
  }

  /** Sign a message with BIP322 */
  signMessage(keypair: { privkey: string }, messageHash: Buffer): any {
    const privkeyBuffer = Buffer.from(keypair.privkey, 'hex');
    return signMessage(privkeyBuffer as any, messageHash as any);
  }

  /** Build and sign a transaction - creates proper ArchMessage with sanitized instructions */
  buildAndSignTransaction(
    instructions: Instruction[],
    signers: { privkey: string; pubkey: string }[],
    recentBlockhash: Buffer
  ): RuntimeTransaction {
    console.log('[Build Transaction] Building ArchMessage with:', {
      numInstructions: instructions.length,
      numSigners: signers.length,
      signerPubkeys: signers.map(s => s.pubkey),
    });

    // Step 1: Collect all unique account keys in correct order
    // Order: signers first, then other accounts, then program IDs
    const accountKeysMap = new Map<string, Buffer>();

    // Add signers first (they must be at the beginning)
    console.log('[Build Transaction] Adding signers to account_keys:');
    signers.forEach((signer, idx) => {
      console.log(`  [Signer ${idx}]:`, signer.pubkey);
      accountKeysMap.set(signer.pubkey, Buffer.from(signer.pubkey, 'hex'));
    });
    console.log('[Build Transaction] After adding signers, map size:', accountKeysMap.size);

    // Collect all accounts from instructions
    instructions.forEach((ix, idx) => {
      console.log(`[Build Transaction] Processing instruction ${idx}:`, {
        program_id: (ix.program_id as Buffer).toString('hex'),
        num_accounts: ix.accounts.length,
      });

      // Add instruction accounts
      ix.accounts.forEach((acc, accIdx) => {
        const pubkeyHex = (acc.pubkey as Buffer).toString('hex');
        console.log(`  [Account ${accIdx}]:`, pubkeyHex, acc.is_signer, acc.is_writable);
        if (!accountKeysMap.has(pubkeyHex)) {
          accountKeysMap.set(pubkeyHex, acc.pubkey as Buffer);
        }
      });

      // Add program ID
      const programIdHex = (ix.program_id as Buffer).toString('hex');
      console.log(`  [Program ID]:`, programIdHex);
      if (!accountKeysMap.has(programIdHex)) {
        console.log(`  [Program ID] Adding to account_keys:`, programIdHex);
        accountKeysMap.set(programIdHex, ix.program_id as Buffer);
      } else {
        console.log(`  [Program ID] Already in account_keys`);
      }
    });

    const account_keys = Array.from(accountKeysMap.values());

    const mapKeys = Array.from(accountKeysMap.keys());
    const mapValues = Array.from(accountKeysMap.values()).map(v => v.toString('hex'));
    const accountKeysHex = account_keys.map(k => k.toString('hex'));

    console.log('[Build Transaction] Final accountKeysMap:');
    console.log('  Map size:', accountKeysMap.size);
    console.log('  Map keys:', mapKeys);
    console.log('  Map values (hex):', mapValues);
    console.log('  Final account_keys array:', accountKeysHex);

    // Step 2: Build header (ArchMessage format)
    const header = {
      num_required_signatures: signers.length,
      num_readonly_signed_accounts: 0, // All signers are writable (fee payers)
      num_readonly_unsigned_accounts: 0, // Simplification: all accounts writable
    };

    // Step 3: Compile instructions to use indices (SanitizedInstruction format)
    const sanitized_instructions = instructions.map((ix, ixIdx) => {
      const program_id_hex = (ix.program_id as Buffer).toString('hex');
      const program_id_index = account_keys.findIndex(k => k.toString('hex') === program_id_hex);

      if (program_id_index === -1) {
        throw new Error(`Instruction ${ixIdx}: program_id not found in account_keys: ${program_id_hex}`);
      }

      if (program_id_index === 0) {
        throw new Error(`Instruction ${ixIdx}: program_id_index cannot be 0 (payer account)`);
      }

      const accounts = ix.accounts.map((acc, accIdx) => {
        const pubkeyHex = (acc.pubkey as Buffer).toString('hex');
        const accountIndex = account_keys.findIndex(k => k.toString('hex') === pubkeyHex);

        if (accountIndex === -1) {
          throw new Error(`Instruction ${ixIdx}, Account ${accIdx}: pubkey not found in account_keys: ${pubkeyHex}`);
        }

        return accountIndex;
      });

      return {
        program_id_index,
        accounts,
        data: ix.data as Buffer,
      };
    });

    // Step 4: Build ArchMessage with recent_blockhash
    const message = {
      header,
      account_keys,
      instructions: sanitized_instructions,
      recent_blockhash: recentBlockhash,  // 32-byte block hash
    };

    console.log('[Build Transaction] ArchMessage structure:');
    console.log('  Header:', header);
    console.log('  Account keys count:', account_keys.length);
    account_keys.forEach((key, idx) => {
      console.log(`    [${idx}]:`, key.toString('hex'));
    });
    console.log('  Recent blockhash:', (recentBlockhash as Buffer).toString('hex'));
    console.log('  Instructions count:', sanitized_instructions.length);
    sanitized_instructions.forEach((ix, idx) => {
      console.log(`    Instruction ${idx}:`);
      console.log(`      program_id_index: ${ix.program_id_index}`);
      console.log(`      accounts:`, ix.accounts);
      console.log(`      data_length: ${ix.data ? (ix.data as Buffer).length : 'UNDEFINED!'}`);
      if (ix.data) {
        console.log(`      data_sample: ${(ix.data as Buffer).toString('hex').substring(0, 40)}...`);
      }
    });

    // Validate all instruction data is defined
    sanitized_instructions.forEach((ix, idx) => {
      if (!ix.data) {
        console.error(`[Build Transaction] ERROR: Instruction ${idx} has undefined data!`);
      }
      if (ix.data && !(ix.data as Buffer).length) {
        console.error(`[Build Transaction] ERROR: Instruction ${idx} has zero-length data!`);
      }
    });

    // Step 5: Validate message structure before hashing
    console.log('[Build Transaction] Validating message structure before hashing...');

    // Check header
    if (!message.header) {
      throw new Error('Message header is undefined!');
    }
    console.log('  ✓ Header exists:', message.header);

    // Check account_keys
    if (!message.account_keys) {
      throw new Error('Message account_keys is undefined!');
    }
    if (!Array.isArray(message.account_keys)) {
      throw new Error('Message account_keys is not an array!');
    }
    console.log('  ✓ account_keys exists, length:', message.account_keys.length);

    // Check each account key
    message.account_keys.forEach((key, idx) => {
      if (!key) {
        throw new Error(`account_keys[${idx}] is undefined!`);
      }
      if (!Buffer.isBuffer(key) && !(key as any).length) {
        throw new Error(`account_keys[${idx}] has no length property!`);
      }
    });
    console.log('  ✓ All account_keys are valid');

    // Check recent_blockhash
    if (!message.recent_blockhash) {
      throw new Error('Message recent_blockhash is undefined!');
    }
    const blockhashLen = Buffer.isBuffer(message.recent_blockhash)
      ? message.recent_blockhash.length
      : (message.recent_blockhash as any).length;
    if (blockhashLen !== 32) {
      throw new Error(`recent_blockhash must be 32 bytes, got ${blockhashLen}!`);
    }
    console.log('  ✓ recent_blockhash exists and is 32 bytes');

    // Check instructions
    if (!message.instructions) {
      throw new Error('Message instructions is undefined!');
    }
    if (!Array.isArray(message.instructions)) {
      throw new Error('Message instructions is not an array!');
    }
    console.log('  ✓ instructions exists, length:', message.instructions.length);

    // Check each instruction
    message.instructions.forEach((ix, idx) => {
      if (ix.program_id_index === undefined) {
        throw new Error(`instructions[${idx}].program_id_index is undefined!`);
      }
      if (!ix.accounts) {
        throw new Error(`instructions[${idx}].accounts is undefined!`);
      }
      if (!ix.data) {
        throw new Error(`instructions[${idx}].data is undefined!`);
      }
    });
    console.log('  ✓ All instructions are valid');

    console.log('[Build Transaction] Message structure validated, serializing for hashing...');

    // Serialize ArchMessage (matches Rust's ArchMessage::serialize)
    const serializedMessage = this.serializeArchMessage(message);
    console.log('[Build Transaction] Serialized message length:', serializedMessage.length);
    console.log('[Build Transaction] Serialized message (hex):', Buffer.from(serializedMessage).toString('hex').substring(0, 100) + '...');

    // Double-hash (matches Rust's ArchMessage::hash)
    // sha256() returns hex string, so we hash the hex string then hash again
    const firstHashHex = sha256(Buffer.from(serializedMessage));
    const messageHashHex = sha256(firstHashHex);

    console.log('[Build Transaction] Message hash (hex):', messageHashHex);

    const signatures = signers.map((signer, idx) => {
      const sig = this.signMessage(signer, Buffer.from(messageHashHex, 'hex'));
      console.log(`[Build Transaction] Signature ${idx}:`, sig.toString('hex').substring(0, 20) + '...');
      return sig;
    });

    // Convert message to plain arrays for the transaction
    const messagePlain = this.bufferToArray(message);

    const tx: RuntimeTransaction = {
      version: 0,
      signatures: signatures as any,
      message: messagePlain as any,
    };

    console.log('[Build Transaction] RuntimeTransaction built successfully');

    return tx;
  }
}

// ============================================================================
// MAIN DEPLOYMENT LOGIC
// ============================================================================

/**
 * Deploy a program to Arch Network
 *
 * This follows the exact flow from sdk/src/helper/program_deployment.rs:
 * 1. Check if program account exists
 * 2. Create account if needed (with BPF_LOADER_ID as owner)
 * 3. If executable, retract it
 * 4. If size mismatch, truncate account
 * 5. Upload ELF in chunks using Write instructions
 * 6. Make program executable with Deploy instruction
 */
export async function deployProgram(options: DeployOptions): Promise<{
  programId: string;
  txids: string[];
}> {
  const {
    rpcUrl,
    network,
    programBinary,
    programKeypair,
    authorityKeypair,
    regtestConfig,
    utxoInfo,
    onMessage = () => {},
  } = options;

  onMessage('info', `Starting program deployment for ${programKeypair.pubkey}`);

  const deployer = new ArchDeployer(rpcUrl, network, onMessage);
  const programPubkey = Buffer.from(programKeypair.pubkey, 'hex');
  const authorityPubkey = Buffer.from(authorityKeypair.pubkey, 'hex');
  const allTxids: string[] = [];

  // ========== STEP 0: Ensure authority has funds (testnet/devnet only) ==========

  if (network === 'testnet' || network === 'devnet') {
    onMessage('info', 'Requesting airdrop for fee payer (testnet/devnet)');

    try {
      await deployer.requestAirdrop(authorityKeypair.pubkey);
      onMessage('success', `Airdrop successful for ${authorityKeypair.pubkey}`);

      // Wait a bit for the airdrop to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error: any) {
      // Don't fail if airdrop fails - the account might already have funds
      console.warn('[Airdrop] Failed (account may already have funds):', error.message);
      onMessage('info', 'Airdrop failed - continuing with existing funds');
    }
  }

  // ========== STEP 1: Check if program account exists ==========

  let accountInfo = await deployer.readAccountInfo(programPubkey);

  if (accountInfo) {
    onMessage('info', 'Program account exists, checking for redeployment');

    // Check if ELF matches
    const existingElf = accountInfo.data.slice(LOADER_STATE_SIZE);
    if (existingElf.equals(programBinary)) {
      onMessage('success', 'Same program already deployed!');

      // Make sure it's executable
      if (!accountInfo.is_executable) {
        onMessage('info', 'Making program executable');
        const txid = await makeExecutable(deployer, programPubkey, authorityPubkey, authorityKeypair);
        allTxids.push(txid);
      }

      return {
        programId: programKeypair.pubkey,
        txids: allTxids,
      };
    }

    onMessage('info', 'ELF mismatch detected, redeploying');
  } else {
    // ========== STEP 2: Create program account ==========

    onMessage('info', 'Creating program account');

    const accountSize = LOADER_STATE_SIZE + programBinary.length;
    const minimumRent = calculateMinimumRent(accountSize);
    const recentBlockhash = await deployer.getBestBlockHash();

    const createAccountIx: Instruction = {
      program_id: SYSTEM_PROGRAM_ID,
      accounts: [
        { pubkey: authorityPubkey, is_signer: true, is_writable: true },
        { pubkey: programPubkey, is_signer: true, is_writable: true },
      ],
      data: serializeCreateAccountInstruction(minimumRent, accountSize, BPF_LOADER_ID),
    };

    const createTx = deployer.buildAndSignTransaction(
      [createAccountIx],
      [authorityKeypair, programKeypair],
      recentBlockhash
    );

    const createTxid = await deployer.sendAndConfirmTransaction(createTx);
    allTxids.push(createTxid);
    onMessage('success', `Program account created: ${createTxid}`);

    // Refresh account info
    accountInfo = await deployer.readAccountInfo(programPubkey);
    if (!accountInfo) {
      throw new Error('Failed to create program account');
    }
  }

  // ========== STEP 3: Deploy ELF ==========

  const deployTxids = await deployProgramElf(
    deployer,
    programPubkey,
    programKeypair,
    authorityPubkey,
    authorityKeypair,
    programBinary,
    accountInfo,
    onMessage
  );

  allTxids.push(...deployTxids);

  // ========== STEP 4: Verify deployment ==========

  onMessage('info', 'Verifying deployed program');
  const finalAccountInfo = await deployer.readAccountInfo(programPubkey);

  if (!finalAccountInfo) {
    throw new Error('Program account disappeared after deployment');
  }

  const deployedElf = finalAccountInfo.data.slice(LOADER_STATE_SIZE);
  if (!deployedElf.equals(programBinary)) {
    throw new Error('ELF verification failed - deployed binary does not match');
  }

  onMessage('success', 'ELF verification successful');

  // ========== STEP 5: Make executable ==========

  if (!finalAccountInfo.is_executable) {
    onMessage('info', 'Making program executable');
    const execTxid = await makeExecutable(deployer, programPubkey, authorityPubkey, authorityKeypair);
    allTxids.push(execTxid);
    onMessage('success', 'Program is now executable');
  } else {
    onMessage('success', 'Program is already executable');
  }

  // ========== COMPLETE ==========

  onMessage('success', `Program deployed successfully: ${programKeypair.pubkey}`);

  return {
    programId: programKeypair.pubkey,
    txids: allTxids,
  };
}

/**
 * Deploy program ELF data
 * Matches sdk/src/helper/program_deployment.rs::deploy_program_elf
 */
async function deployProgramElf(
  deployer: ArchDeployer,
  programPubkey: Buffer,
  programKeypair: { privkey: string; pubkey: string },
  authorityPubkey: Buffer,
  authorityKeypair: { privkey: string; pubkey: string },
  elf: Buffer,
  accountInfo: AccountInfo,
  onMessage: (type: 'info' | 'success' | 'error', message: string) => void
): Promise<string[]> {
  const txids: string[] = [];
  const recentBlockhash = await deployer.getBestBlockHash();

  // ========== Retract if executable ==========

  if (accountInfo.is_executable) {
    onMessage('info', 'Retracting executable program');

    const retractIx: Instruction = {
      program_id: BPF_LOADER_ID,
      accounts: [
        { pubkey: programPubkey, is_signer: false, is_writable: true },
        { pubkey: authorityPubkey, is_signer: true, is_writable: false },
      ],
      data: serializeRetractInstruction(),
    };

    const retractTx = deployer.buildAndSignTransaction(
      [retractIx],
      [authorityKeypair],
      recentBlockhash
    );

    const retractTxid = await deployer.sendAndConfirmTransaction(retractTx);
    txids.push(retractTxid);
    onMessage('success', 'Program retracted');
  }

  // ========== Truncate if size mismatch ==========

  const requiredSize = LOADER_STATE_SIZE + elf.length;
  if (accountInfo.data.length !== requiredSize) {
    onMessage('info', `Resizing account to ${requiredSize} bytes`);

    // Check if we need to add lamports
    const minimumRent = calculateMinimumRent(requiredSize);
    const missingLamports = minimumRent - accountInfo.lamports;

    if (missingLamports > 0) {
      onMessage('info', `Transferring ${missingLamports} lamports for rent`);

      const transferIx: Instruction = {
        program_id: SYSTEM_PROGRAM_ID,
        accounts: [
          { pubkey: authorityPubkey, is_signer: true, is_writable: true },
          { pubkey: programPubkey, is_signer: false, is_writable: true },
        ],
        data: serializeTransferInstruction(missingLamports),
      };

      const transferTx = deployer.buildAndSignTransaction(
        [transferIx],
        [authorityKeypair],
        recentBlockhash
      );

      const transferTxid = await deployer.sendAndConfirmTransaction(transferTx);
      txids.push(transferTxid);
    }

    // Truncate account
    const truncateIx: Instruction = {
      program_id: BPF_LOADER_ID,
      accounts: [
        { pubkey: programPubkey, is_signer: true, is_writable: true },
        { pubkey: authorityPubkey, is_signer: true, is_writable: false },
      ],
      data: serializeTruncateInstruction(elf.length),
    };

    const truncateTx = deployer.buildAndSignTransaction(
      [truncateIx],
      [programKeypair, authorityKeypair],
      recentBlockhash
    );

    const truncateTxid = await deployer.sendAndConfirmTransaction(truncateTx);
    txids.push(truncateTxid);
    onMessage('success', 'Account resized');
  }

  // ========== Upload ELF in chunks ==========

  onMessage('info', 'Uploading program binary');

  const maxChunkSize = calculateMaxChunkSize();
  const chunks = [];

  for (let offset = 0; offset < elf.length; offset += maxChunkSize) {
    const chunk = elf.slice(offset, offset + maxChunkSize);
    chunks.push({ offset, chunk });
  }

  onMessage('info', `Splitting into ${chunks.length} chunks`);

  // Create write transactions
  const writeTxs: RuntimeTransaction[] = chunks.map(({ offset, chunk }) => {
    const writeIx: Instruction = {
      program_id: BPF_LOADER_ID,
      accounts: [
        { pubkey: programPubkey, is_signer: false, is_writable: true },
        { pubkey: authorityPubkey, is_signer: true, is_writable: false },
      ],
      data: serializeWriteInstruction(offset, chunk),
    };

    return deployer.buildAndSignTransaction(
      [writeIx],
      [authorityKeypair],
      recentBlockhash
    );
  });

  // Send in batches
  const writeTxids = await deployer.sendBatchTransactions(writeTxs);
  txids.push(...writeTxids);
  onMessage('success', `Uploaded ${chunks.length} chunks`);

  return txids;
}

/**
 * Make program executable
 * Matches sdk/src/helper/program_deployment.rs::make_program_executable
 */
async function makeExecutable(
  deployer: ArchDeployer,
  programPubkey: Buffer,
  authorityPubkey: Buffer,
  authorityKeypair: { privkey: string; pubkey: string }
): Promise<string> {
  const recentBlockhash = await deployer.getBestBlockHash();

  const deployIx: Instruction = {
    program_id: BPF_LOADER_ID,
    accounts: [
      { pubkey: programPubkey, is_signer: false, is_writable: true },
      { pubkey: authorityPubkey, is_signer: true, is_writable: false },
    ],
    data: serializeDeployInstruction(),
  };

  const deployTx = deployer.buildAndSignTransaction(
    [deployIx],
    [authorityKeypair],
    recentBlockhash
  );

  return await deployer.sendAndConfirmTransaction(deployTx);
}

// ============================================================================
// LEGACY COMPATIBILITY (optional - for existing code)
// ============================================================================

/**
 * Legacy interface for backward compatibility
 */
export class ArchProgramLoader {
  static async load(options: {
    rpcUrl: string;
    network: string;
    programBinary: Uint8Array;
    keypair: { privkey: string; pubkey: string; address: string };
    regtestConfig?: { url: string; username: string; password: string };
    utxoInfo?: { txid: string; vout: number };
  }, onMessage?: (type: 'info' | 'success' | 'error', message: string) => void) {

    // For now, use the same keypair as both program and authority
    // In production, these should be separate
    const result = await deployProgram({
      rpcUrl: options.rpcUrl,
      network: options.network as any,
      programBinary: Buffer.from(options.programBinary),
      programKeypair: options.keypair,
      authorityKeypair: options.keypair,
      regtestConfig: options.regtestConfig,
      utxoInfo: options.utxoInfo,
      onMessage,
    });

    return result;
  }
}
