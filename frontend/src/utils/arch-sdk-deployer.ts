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
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';

// Initialize bitcoinjs-lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

// ============================================================================
// CONSTANTS (matching arch-network/program/src)
// ============================================================================

/** System Program ID - handles account creation and transfers */
const SYSTEM_PROGRAM_ID = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex');

/** BPF Loader ID - owns and manages program accounts */
// "BpfLoader11111111111111111111111" as ASCII bytes (matches Rust: Pubkey(*b"BpfLoader11111111111111111111111"))
const BPF_LOADER_ID = Buffer.from('BpfLoader11111111111111111111111', 'ascii');

// Verify BPF_LOADER_ID is correct (32 bytes)
console.log('[Constants] BPF_LOADER_ID:', BPF_LOADER_ID.toString('hex'), `(${BPF_LOADER_ID.length} bytes)`);
console.log('[Constants] BPF_LOADER_ID as ASCII:', BPF_LOADER_ID.toString('ascii'));

/**
 * Size of LoaderState header
 * Matches program/src/bpf_loader.rs::LoaderState
 *
 * struct LoaderState {
 *   authority_address_or_next_version: Pubkey,  // 32 bytes
 *   status: LoaderStatus,                       // 8 bytes (#[repr(u64)])
 * }
 *
 * Total: 40 bytes
 */
const LOADER_STATE_SIZE = 40;

/** Maximum JSON RPC payload size (RPC enforces 10KB limit on HTTP POST body) */
const RPC_JSON_PAYLOAD_LIMIT = 10240; // 10KB HTTP body limit from RPC

/**
 * JSON serialization overhead multiplier
 * When a RuntimeTransaction is serialized to JSON:
 * - Each byte becomes "123," (avg 3-4 chars per byte)
 * - Arrays need brackets: [...]
 * - Objects need braces: {...}
 * - Field names: "version":, "signatures":, etc.
 * - JSON-RPC wrapper: {"jsonrpc":"2.0","id":"...","method":"send_transaction","params":{...}}
 * - Nested array structure adds significant overhead
 * Extremely conservative estimate: 8x overhead (ensures <10KB)
 */
const JSON_SERIALIZATION_OVERHEAD = 8.0;

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
  Anchor = 3,              // Was missing!
  SignInput = 4,           // Was missing!
  Transfer = 5,            // Fixed - was 3, should be 5!
  Allocate = 6,
  CreateAccountWithSeed = 7,
  AllocateWithSeed = 8,
  AssignWithSeed = 9,
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
  // Bincode 1.x serializes enum variants as u32 regardless of #[repr(u8)]
  const data = Buffer.alloc(4 + 4 + 8 + bytes.length); // variant(u32) + offset(u32) + length(u64) + data
  let pos = 0;

  // Write variant tag (u32 - bincode ignores #[repr(u8)])
  data.writeUInt32LE(LoaderInstruction.Write, pos);
  pos += 4;

  // Write offset (u32 little-endian)
  data.writeUInt32LE(offset, pos);
  pos += 4;

  // Write bytes length (u64 little-endian for Vec length - bincode 1.x default)
  // Split u64 into two u32 writes to avoid BigInt issues
  const lengthLow = bytes.length & 0xFFFFFFFF;
  const lengthHigh = Math.floor(bytes.length / 0x100000000);
  data.writeUInt32LE(lengthLow, pos);
  data.writeUInt32LE(lengthHigh, pos + 4);
  pos += 8;

  // Write bytes
  bytes.copy(data, pos);

  return data;
}

/** Serialize LoaderInstruction::Truncate { new_size: u32 } */
function serializeTruncateInstruction(newSize: number): Buffer {
  // Bincode 1.x serializes enum variants as u32 regardless of #[repr(u8)]
  const data = Buffer.alloc(4 + 4); // variant(u32) + new_size(u32)
  data.writeUInt32LE(LoaderInstruction.Truncate, 0);
  data.writeUInt32LE(newSize, 4);
  return data;
}

/** Serialize LoaderInstruction::Deploy */
function serializeDeployInstruction(): Buffer {
  // Bincode 1.x serializes enum variants as u32 regardless of #[repr(u8)]
  const data = Buffer.alloc(4); // variant(u32)
  data.writeUInt32LE(LoaderInstruction.Deploy, 0);
  return data;
}

/** Serialize LoaderInstruction::Retract */
function serializeRetractInstruction(): Buffer {
  // Bincode 1.x serializes enum variants as u32 regardless of #[repr(u8)]
  const data = Buffer.alloc(4); // variant(u32)
  data.writeUInt32LE(LoaderInstruction.Retract, 0);
  return data;
}

/** Serialize SystemInstruction::CreateAccount */
function serializeCreateAccountInstruction(
  lamports: number,
  space: number,
  owner: Buffer
): Buffer {
  // Bincode 1.x serializes enum variants as u32 (no #[repr(u8)] on SystemInstruction)
  const data = Buffer.alloc(4 + 8 + 8 + 32); // variant(u32) + lamports(u64) + space(u64) + owner(32)
  let pos = 0;

  // Variant tag (u32 - bincode 1.x default)
  data.writeUInt32LE(SystemInstruction.CreateAccount, pos);
  pos += 4;

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
  // Bincode 1.x serializes enum variants as u32 (no #[repr(u8)] on SystemInstruction)
  const data = Buffer.alloc(4 + 8); // variant(u32) + lamports(u64)
  data.writeUInt32LE(SystemInstruction.Transfer, 0);
  // Lamports (u64 little-endian) - split into two u32s
  data.writeUInt32LE(lamports & 0xFFFFFFFF, 4);
  data.writeUInt32LE(Math.floor(lamports / 0x100000000), 8);
  return data;
}

/** Serialize SystemInstruction::Assign */
function serializeAssignInstruction(owner: Buffer): Buffer {
  // Bincode 1.x serializes enum variants as u32 (no #[repr(u8)] on SystemInstruction)
  const data = Buffer.alloc(4 + 32); // variant(u32) + owner(32 bytes)
  data.writeUInt32LE(SystemInstruction.Assign, 0);
  owner.copy(data, 4);
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

  // Calculate RuntimeTransaction overhead more accurately:
  // - Version: 1 byte
  // - Signatures count: 4 bytes (u32)
  // - Signatures: 64 bytes per signature
  // - ArchMessage header: 3 bytes (num_required_signatures, num_readonly_signed, num_readonly_unsigned)
  // - Account keys count: 4 bytes (u32)
  // - Account keys: 32 bytes × 2 (program + loader)
  // - Recent blockhash: 32 bytes
  // - Instructions count: 4 bytes (u32)
  // - Instruction: program_id_index (1) + accounts_count (4) + accounts (2) + data_length (4)
  // - Write instruction data overhead: variant(4) + offset(4) + vec_length(8) = 16 bytes

  const versionSize = 1;
  const sigCountSize = 4;
  const signatureSize = 64; // One signature
  const headerSize = 3;
  const accountKeysCountSize = 4;
  const accountKeysSize = 32 * 2; // program + loader
  const blockhashSize = 32;
  const instructionsCountSize = 4;
  const instructionMetadataSize = 1 + 4 + 2 + 4; // program_id_index + accounts_count + accounts + data_length
  const writeInstructionOverhead = 4 + 4 + 8; // variant (u32 - bincode ignores #[repr(u8)]) + offset (u32) + length (u64)

  const txOverhead = versionSize + sigCountSize + signatureSize + headerSize +
                     accountKeysCountSize + accountKeysSize + blockhashSize +
                     instructionsCountSize + instructionMetadataSize + writeInstructionOverhead;

  // Calculate max chunk size accounting for JSON serialization overhead
  // The RPC limit is on the JSON payload size, not binary transaction size
  const binaryTxLimit = RPC_JSON_PAYLOAD_LIMIT / JSON_SERIALIZATION_OVERHEAD;
  const safetyMargin = 500; // Additional safety margin
  const availableSpace = Math.floor(binaryTxLimit - txOverhead - safetyMargin);

  console.log('[Chunk Size] Calculated max chunk size:', availableSpace);
  console.log('[Chunk Size] TX overhead:', txOverhead, 'Safety margin:', safetyMargin);
  console.log('[Chunk Size] Binary limit:', Math.floor(binaryTxLimit), 'JSON payload limit:', RPC_JSON_PAYLOAD_LIMIT);
  return Math.max(availableSpace, 1000); // Minimum 1KB chunks
}

// ============================================================================
// RENT CALCULATION (matches arch_program::rent::minimum_rent)
// ============================================================================

/**
 * Calculate minimum rent for account - matches program/src/rent.rs
 *
 * Rust formula:
 * pub const DEFAULT_LAMPORTS_PER_BYTE_YEAR: u64 = 2;
 * pub const ACCOUNT_STORAGE_OVERHEAD: u64 = 128;
 * pub fn minimum_rent(data_len: usize) -> u64 {
 *   (ACCOUNT_STORAGE_OVERHEAD + bytes) * DEFAULT_LAMPORTS_PER_BYTE_YEAR
 * }
 */
function calculateMinimumRent(dataSize: number): number {
  const ACCOUNT_STORAGE_OVERHEAD = 128;
  const DEFAULT_LAMPORTS_PER_BYTE_YEAR = 2;

  return (ACCOUNT_STORAGE_OVERHEAD + dataSize) * DEFAULT_LAMPORTS_PER_BYTE_YEAR;
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

  /** Create and fund authority account via faucet - matches arch-cli --fund-authority */
  async createAndFundAuthorityAccount(
    authorityKeypair: { privkey: string; pubkey: string }
  ): Promise<void> {
    const authorityPubkey = Buffer.from(authorityKeypair.pubkey, 'hex');

    // Check if account already exists
    try {
      const accountInfo = await this.readAccountInfo(authorityPubkey);
      if (accountInfo) {
        console.log('[Authority] Account already exists, lamports:', accountInfo.lamports);
        console.log('[Authority] Owner:', accountInfo.owner.toString('hex'));
        console.log('[Authority] Is executable:', accountInfo.is_executable);
        console.log('[Authority] Data length:', accountInfo.data.length);

        // CRITICAL: Check if account is owned by System Program
        // Fee payers MUST be system-owned accounts
        const isSystemOwned = accountInfo.owner.toString('hex') === SYSTEM_PROGRAM_ID.toString('hex');

        if (!isSystemOwned) {
          const ownerHex = accountInfo.owner.toString('hex');
          const ownerName = ownerHex === BPF_LOADER_ID.toString('hex') ? 'BPF Loader' : 'Unknown Program';

          throw new Error(
            `❌ CANNOT USE THIS KEYPAIR AS FEE PAYER!\n\n` +
            `The account already exists but is owned by ${ownerName}.\n` +
            `Fee payers MUST be owned by the System Program.\n\n` +
            `Expected owner: ${SYSTEM_PROGRAM_ID.toString('hex')}\n` +
            `Actual owner:   ${ownerHex}\n\n` +
            `SOLUTION: Please generate a NEW keypair for deployment.`
          );
        }

        return;
      }
    } catch (error: any) {
      // Re-throw owner validation errors
      if (error.message && error.message.includes('CANNOT USE THIS KEYPAIR')) {
        throw error;
      }
      // Account doesn't exist, continue to create it
      console.log('[Authority] Account does not exist, creating via faucet...');
    }

    // Use faucet to create and fund authority account
    // The faucet creates a transaction that we sign
    const payload = {
      jsonrpc: '2.0',
      id: 'curlycurl',
      method: 'create_account_with_faucet',
      params: Array.from(authorityPubkey),
    };

    const response = await fetch(this.smartRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Faucet HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(`Faucet RPC error: ${JSON.stringify(result.error)}`);
    }

    // Faucet returns a partially signed RuntimeTransaction - we need to sign it
    const runtimeTx = result.result;

    // Serialize and hash the message (matches buildAndSignTransaction logic)
    const serializedMessage = this.serializeArchMessage(runtimeTx.message);
    const firstHashHex = sha256(Buffer.from(serializedMessage));
    const firstHashBytes = Buffer.from(firstHashHex, 'utf8');
    const secondHashHex = sha256(firstHashBytes);
    const messageHashBytes = Buffer.from(secondHashHex, 'utf8');

    const signature = this.signMessage(authorityKeypair, messageHashBytes);

    // Add our signature to the transaction
    runtimeTx.signatures.push(Array.from(signature));

    // Send the signed transaction
    const sendPayload = {
      jsonrpc: '2.0',
      id: 'curlycurl',
      method: 'send_transaction',
      params: runtimeTx,
    };

    const sendResponse = await fetch(this.smartRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sendPayload),
    });

    if (!sendResponse.ok) {
      throw new Error(`Send transaction HTTP error! status: ${sendResponse.status}`);
    }

    const sendResult = await sendResponse.json();

    if (sendResult.error) {
      throw new Error(`Send transaction failed: ${JSON.stringify(sendResult.error)}`);
    }

    const txid = sendResult.result;
    console.log('[Authority] Account created via faucet:', txid);

    // Wait for transaction confirmation (poll until processed)
    console.log('[Authority] Waiting for transaction confirmation...');
    const maxAttempts = 20;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between polls

      const checkPayload = {
        jsonrpc: '2.0',
        id: 'curlycurl',
        method: 'get_processed_transaction',
        params: [txid],
      };

      const checkResponse = await fetch(this.smartRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkPayload),
      });

      if (checkResponse.ok) {
        const checkResult = await checkResponse.json();
        if (checkResult.result?.status === 'Processed') {
          console.log('[Authority] Transaction confirmed!');
          return;
        }
        if (checkResult.result?.status?.Failed) {
          throw new Error(`Faucet transaction failed: ${JSON.stringify(checkResult.result.status.Failed)}`);
        }
      }
    }

    console.warn('[Authority] Transaction not confirmed after 20 seconds, proceeding anyway...');
  }

  /** Check if an account has sufficient balance */
  async checkAccountBalance(pubkey: Buffer, purpose: string): Promise<void> {
    try {
      const accountInfo = await this.readAccountInfo(pubkey);
      if (!accountInfo) {
        throw new Error(`${purpose} account does not exist: ${pubkey.toString('hex')}`);
      }

      console.log(`[Balance Check] ${purpose} balance:`, accountInfo.lamports, 'lamports');

      if (accountInfo.lamports === 0) {
        throw new Error(`${purpose} account has zero balance`);
      }

      // Warn if balance is low (less than 100k lamports)
      if (accountInfo.lamports < 100_000) {
        console.warn(`[Balance Check] WARNING: ${purpose} has low balance:`, accountInfo.lamports);
      }
    } catch (error: any) {
      throw new Error(`Failed to check ${purpose} balance: ${error.message}`);
    }
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
        console.error('[Transaction] Full error details:', JSON.stringify(result.error, null, 2));
        console.error('[Transaction] Transaction header:', JSON.stringify(tx.message.header, null, 2));
        console.error('[Transaction] Account keys count:', tx.message.account_keys.length);
        console.error('[Transaction] Signatures count:', tx.signatures.length);
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

  /** Send multiple transactions in batch (matches Rust SDK's send_transactions) */
  async sendBatchTransactions(txs: RuntimeTransaction[]): Promise<string[]> {
    const MAX_BATCH_SIZE = 100; // Matches Rust SDK's MAX_TX_BATCH_SIZE
    const allTxids: string[] = [];

    // Send in batches of 100 (same as arch-cli)
    for (let i = 0; i < txs.length; i += MAX_BATCH_SIZE) {
      const batch = txs.slice(i, Math.min(i + MAX_BATCH_SIZE, txs.length));
      const batchNum = Math.floor(i / MAX_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(txs.length / MAX_BATCH_SIZE);

      console.log(`[Batch] Sending batch ${batchNum}/${totalBatches} (${batch.length} transactions)`);
      this.onMessage('info', `Sending batch ${batchNum}/${totalBatches} (${batch.length} chunks)`);

      try {
        // Convert all transactions to plain arrays (removes Buffer objects)
        const batchPlain = batch.map(tx => this.bufferToArray(tx));

        // send_transactions expects params to be the array of transactions directly
        const payload = {
          jsonrpc: '2.0',
          id: 'curlycurl',
          method: 'send_transactions',
          params: batchPlain,  // Array of transactions
        };

        const response = await fetch(this.smartRpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.error) {
          console.error('[Batch] Error sending batch:', result.error);
          throw new Error(`Batch failed: ${JSON.stringify(result.error)}`);
        }

        const batchTxids = result.result as string[];
        allTxids.push(...batchTxids);

        console.log(`[Batch] Batch ${batchNum} sent successfully, waiting for confirmations...`);

        // Wait for all transactions in this batch to confirm
        for (const txid of batchTxids) {
          await this.waitForConfirmation(txid);
        }

        console.log(`[Batch] Batch ${batchNum} confirmed`);
        this.onMessage('success', `Batch ${batchNum}/${totalBatches} confirmed (${allTxids.length}/${txs.length} chunks)`);

      } catch (error) {
        console.error(`[Batch] Error in batch ${batchNum}:`, error);
        throw error;
      }
    }

    return allTxids;
  }

  /** Wait for a transaction to be confirmed (polling) */
  private async waitForConfirmation(txid: string, maxAttempts: number = 30): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        const payload = {
          jsonrpc: '2.0',
          id: 'curlycurl',
          method: 'get_processed_transaction',
          params: txid,
        };

        const response = await fetch(this.smartRpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const result = await response.json();

          // Debug: Log the actual response structure
          if (attempt === 0) {
            console.log(`[Confirmation] Response structure for ${txid.slice(0, 8)}:`, JSON.stringify(result, null, 2));
          }

          // Transaction found - it's been processed
          if (result.result) {
            console.log(`[Confirmation] Transaction ${txid.slice(0, 8)} confirmed`);
            return;
          }

          // Check for error (transaction not found yet is okay, keep polling)
          if (result.error && result.error.code !== -32000) {
            console.warn(`[Confirmation] Error for ${txid.slice(0, 8)}:`, result.error);
          }
        }
      } catch (error) {
        // Continue polling on errors
      }
    }

    console.warn(`[Confirmation] Transaction ${txid} not confirmed after ${maxAttempts} seconds`);
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
      // Use concat for small arrays (32 bytes is fine)
      parts.push(...keyBytes);
    });

    // Serialize recent_blockhash (32 bytes)
    const blockhashBytes = Buffer.isBuffer(message.recent_blockhash)
      ? Array.from(message.recent_blockhash)
      : message.recent_blockhash;
    // Use concat for small arrays (32 bytes is fine)
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

      // accounts length (4 bytes, little-endian u32)
      const numAccounts = ix.accounts.length;
      parts.push(numAccounts & 0xFF);
      parts.push((numAccounts >> 8) & 0xFF);
      parts.push((numAccounts >> 16) & 0xFF);
      parts.push((numAccounts >> 24) & 0xFF);

      // account indices (each 1 byte)
      parts.push(...ix.accounts);

      // data length (4 bytes, little-endian u32)
      const dataLen = ix.data.length;
      parts.push(dataLen & 0xFF);
      parts.push((dataLen >> 8) & 0xFF);
      parts.push((dataLen >> 16) & 0xFF);
      parts.push((dataLen >> 24) & 0xFF);

      // data bytes
      const dataBytes = Buffer.isBuffer(ix.data) ? Array.from(ix.data) : ix.data;
      // For large arrays, avoid spread operator to prevent stack overflow
      // Use Array.prototype.push.apply with chunking for safety
      if (dataBytes.length > 10000) {
        // Push in chunks to avoid stack overflow
        for (let i = 0; i < dataBytes.length; i += 10000) {
          const chunk = dataBytes.slice(i, i + 10000);
          Array.prototype.push.apply(parts, chunk);
        }
      } else {
        parts.push(...dataBytes);
      }
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
    recentBlockhash: Buffer,
    feePayer?: string  // Optional fee payer pubkey (hex string) - if provided, it will be placed first in account_keys
  ): RuntimeTransaction {
    console.log('[Build Transaction] Building ArchMessage with:', {
      numInstructions: instructions.length,
      numSigners: signers.length,
      signerPubkeys: signers.map(s => s.pubkey),
      feePayer: feePayer || 'none',
    });

    // Step 1: Collect all unique account keys in correct order
    // Per CompiledKeys::compile - payer comes FIRST, then other writable signers, readonly signers, etc.
    const accountKeysMap = new Map<string, Buffer>();

    // Add fee payer FIRST if provided (CompiledKeys places payer first)
    if (feePayer) {
      console.log('[Build Transaction] Adding fee payer first:', feePayer);
      accountKeysMap.set(feePayer, Buffer.from(feePayer, 'hex'));
    }

    // Add remaining signers (excluding fee payer if already added)
    console.log('[Build Transaction] Adding signers to account_keys:');
    signers.forEach((signer, idx) => {
      if (signer.pubkey !== feePayer) {  // Skip if already added as fee payer
        console.log(`  [Signer ${idx}]:`, signer.pubkey);
        accountKeysMap.set(signer.pubkey, Buffer.from(signer.pubkey, 'hex'));
      }
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

    // Step 2: Determine which signers are writable vs readonly
    // A signer is writable if it appears as writable in ANY instruction
    const uniqueSigners = signers.filter((signer, idx, arr) =>
      arr.findIndex(s => s.pubkey === signer.pubkey) === idx
    );

    const signerWritableStatus = new Map<string, boolean>();
    uniqueSigners.forEach(signer => signerWritableStatus.set(signer.pubkey, false));

    // Check each instruction to see if signers are marked writable
    instructions.forEach(ix => {
      ix.accounts.forEach(acc => {
        const pubkeyHex = (acc.pubkey as Buffer).toString('hex');
        if (signerWritableStatus.has(pubkeyHex) && acc.is_writable) {
          signerWritableStatus.set(pubkeyHex, true);
        }
      });
    });

    // CRITICAL: The fee payer (account_keys[0]) is ALWAYS writable, regardless of instruction flags
    // This is enforced by Arch Network's sanitization: num_readonly_signed_accounts < num_required_signatures
    if (feePayer) {
      signerWritableStatus.set(feePayer, true);
    }

    // Count readonly signers (those that are signers but never writable)
    const readonlySigners = Array.from(signerWritableStatus.entries())
      .filter(([_, isWritable]) => !isWritable);

    const numReadonlySignedAccounts = readonlySigners.length;

    console.log('[Build Transaction] Original signers:', signers.length);
    console.log('[Build Transaction] Unique signers:', uniqueSigners.length);
    console.log('[Build Transaction] Readonly signers:', numReadonlySignedAccounts);

    // Step 2: Count program IDs (they are readonly unsigned accounts)
    const programIds = new Set<string>();
    instructions.forEach(ix => {
      programIds.add((ix.program_id as Buffer).toString('hex'));
    });
    const numReadonlyUnsignedAccounts = programIds.size;

    console.log('[Build Transaction] Program IDs (readonly):', Array.from(programIds));
    console.log('[Build Transaction] Readonly unsigned accounts:', numReadonlyUnsignedAccounts);

    // Step 2: Build header (ArchMessage format)
    const header = {
      num_required_signatures: uniqueSigners.length,
      num_readonly_signed_accounts: numReadonlySignedAccounts,
      num_readonly_unsigned_accounts: numReadonlyUnsignedAccounts,
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
    // Rust does: digest(serialized) → hex string, then digest(hex_string.as_bytes()) → hex string
    // The final hash is the HEX STRING itself converted to UTF-8 bytes (NOT hex-decoded)
    const firstHashHex = sha256(Buffer.from(serializedMessage));  // SHA256 → hex string
    console.log('[Build Transaction] First hash (hex):', firstHashHex);

    // Convert hex string to UTF-8 bytes (treat the hex string as a UTF-8 string, NOT hex-decode it)
    const firstHashBytes = Buffer.from(firstHashHex, 'utf8');  // Treat hex string as UTF-8 bytes
    const secondHashHex = sha256(firstHashBytes);  // SHA256 of the hex string bytes

    console.log('[Build Transaction] Second hash (hex):', secondHashHex);

    // CRITICAL: The message hash for BIP-322 signing is the second hex string as UTF-8 bytes
    // NOT the hex-decoded bytes! This is 64 bytes (hex string of 32-byte hash)
    const messageHashBytes = Buffer.from(secondHashHex, 'utf8');  // 64-byte UTF-8 representation
    console.log('[Build Transaction] Message hash for signing (64 bytes):', messageHashBytes.toString('hex').substring(0, 40) + '...');
    console.log('[Build Transaction] Message hash length:', messageHashBytes.length);

    // CRITICAL: Deduplicate signers based on pubkey to match account_keys deduplication
    // If program and authority use the same keypair, we should only generate ONE signature
    const signerMap = new Map(signers.map(s => [s.pubkey, s]));

    console.log('[Build Transaction] Unique signers:', signerMap.size);
    console.log('[Build Transaction] Account keys count:', account_keys.length);

    // Verify signature count matches the first N account_keys (which are the signers)
    const numRequiredSignatures = message.header.num_required_signatures;
    if (signerMap.size !== numRequiredSignatures) {
      throw new Error(`Mismatch: ${signerMap.size} unique signers but header requires ${numRequiredSignatures} signatures`);
    }

    // CRITICAL: Generate signatures in the SAME ORDER as account_keys!
    // The first N account_keys are the signers (where N = num_required_signatures)
    // Signatures must be in the same order as these signing accounts
    const signatures: Buffer[] = [];
    for (let i = 0; i < numRequiredSignatures; i++) {
      const accountPubkeyHex = account_keys[i].toString('hex');
      const signer = signerMap.get(accountPubkeyHex);

      if (!signer) {
        throw new Error(`No signer found for account at index ${i}: ${accountPubkeyHex}`);
      }

      console.log(`[Build Transaction] Generating signature ${i} for account[${i}]:`, accountPubkeyHex);
      const sig = this.signMessage(signer, messageHashBytes);
      console.log(`[Build Transaction] Signature ${i}:`, sig.toString('hex').substring(0, 20) + '...');
      signatures.push(sig);
    }

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

  // ========== STEP 0: Create and fund authority account (matches arch-cli --fund-authority) ==========

  if (network === 'testnet' || network === 'devnet') {
    onMessage('info', 'Creating and funding authority account...');

    try {
      await deployer.createAndFundAuthorityAccount(authorityKeypair);
      onMessage('success', `Authority account funded: ${authorityKeypair.pubkey}`);

      // Verify authority has funds before proceeding
      await deployer.checkAccountBalance(authorityPubkey, 'Authority');
    } catch (error: any) {
      // Re-throw critical validation errors that the user must fix
      if (error.message && error.message.includes('CANNOT USE THIS KEYPAIR')) {
        throw error;
      }
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

    // Check if the account has the correct owner
    const bpfLoaderIdHex = BPF_LOADER_ID.toString('hex');
    const accountOwnerHex = accountInfo.owner.toString('hex');

    if (accountOwnerHex !== bpfLoaderIdHex) {
      onMessage('info', `Account has wrong owner (${accountOwnerHex}), assigning to BPF Loader`);

      // Use SystemInstruction::Assign to change the owner
      const recentBlockhash = await deployer.getBestBlockHash();
      const assignIx: Instruction = {
        program_id: SYSTEM_PROGRAM_ID,
        accounts: [
          { pubkey: programPubkey, is_signer: true, is_writable: true },
        ],
        data: serializeAssignInstruction(BPF_LOADER_ID),
      };

      const assignTx = deployer.buildAndSignTransaction(
        [assignIx],
        [programKeypair],
        recentBlockhash,
        programPubkey.toString('hex')  // Program is the fee payer
      );

      const assignTxid = await deployer.sendAndConfirmTransaction(assignTx);
      allTxids.push(assignTxid);
      onMessage('success', `Account owner changed to BPF Loader: ${assignTxid}`);

      // Refresh account info
      accountInfo = await deployer.readAccountInfo(programPubkey);
      if (!accountInfo) {
        throw new Error('Failed to read account after assigning owner');
      }
    }
  }

  if (!accountInfo) {
    // ========== STEP 2: Create program account ==========

    onMessage('info', 'Creating program account');

    // Verify authority has funds before creating account
    await deployer.checkAccountBalance(authorityPubkey, 'Authority (fee payer)');

    const accountSize = LOADER_STATE_SIZE + programBinary.length;
    const minimumRent = calculateMinimumRent(accountSize);
    const recentBlockhash = await deployer.getBestBlockHash();

    // NOTE: Rust SDK passes space=0 here! The actual space allocation happens in Truncate
    const createAccountData = serializeCreateAccountInstruction(minimumRent, 0, BPF_LOADER_ID);
    console.log('[CreateAccount] Instruction data:', createAccountData.toString('hex'));
    console.log('[CreateAccount] Data length:', createAccountData.length, 'bytes');
    console.log('[CreateAccount] BPF_LOADER_ID in instruction:', BPF_LOADER_ID.toString('hex'));

    const createAccountIx: Instruction = {
      program_id: SYSTEM_PROGRAM_ID,
      accounts: [
        { pubkey: authorityPubkey, is_signer: true, is_writable: true },
        { pubkey: programPubkey, is_signer: true, is_writable: true },
      ],
      data: createAccountData,
    };

    const createTx = deployer.buildAndSignTransaction(
      [createAccountIx],
      [authorityKeypair, programKeypair],
      recentBlockhash,
      authorityPubkey.toString('hex')  // Authority is the fee payer
    );

    const createTxid = await deployer.sendAndConfirmTransaction(createTx);
    allTxids.push(createTxid);
    onMessage('success', `Program account created: ${createTxid}`);

    // Refresh account info
    accountInfo = await deployer.readAccountInfo(programPubkey);
    if (!accountInfo) {
      throw new Error('Failed to create program account');
    }

    // Verify the account has the correct owner
    const accountOwnerHex = accountInfo.owner.toString('hex');
    const expectedOwnerHex = BPF_LOADER_ID.toString('hex');
    onMessage('info', `Account owner: ${accountOwnerHex}`);
    onMessage('info', `Expected owner: ${expectedOwnerHex}`);

    if (accountOwnerHex !== expectedOwnerHex) {
      throw new Error(`Account created with wrong owner! Got ${accountOwnerHex}, expected ${expectedOwnerHex}`);
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
      recentBlockhash,
      authorityPubkey.toString('hex')  // Authority is the fee payer
    );

    const retractTxid = await deployer.sendAndConfirmTransaction(retractTx);
    txids.push(retractTxid);
    onMessage('success', 'Program retracted');
  }

  // ========== Truncate if size mismatch ==========

  const requiredSize = LOADER_STATE_SIZE + elf.length;
  if (accountInfo.data.length !== requiredSize) {
    onMessage('info', `Resizing account to ${requiredSize} bytes`);

    // Check if we need to add lamports (use saturating_sub to avoid negative numbers)
    const minimumRent = calculateMinimumRent(requiredSize);
    const missingLamports = Math.max(0, minimumRent - accountInfo.lamports); // saturating_sub

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
        recentBlockhash,
        authorityPubkey.toString('hex')  // Authority is the fee payer
      );

      const transferTxid = await deployer.sendAndConfirmTransaction(transferTx);
      txids.push(transferTxid);
    }

    // Truncate account - get fresh blockhash
    const truncateBlockhash = await deployer.getBestBlockHash();

    // Verify authority has funds before truncating
    await deployer.checkAccountBalance(authorityPubkey, 'Authority (truncate fee payer)');

    console.log('[Truncate] Account info before truncate:');
    console.log('  - Owner:', accountInfo.owner.toString('hex'));
    console.log('  - Data length:', accountInfo.data.length);
    console.log('  - Lamports:', accountInfo.lamports);
    console.log('  - Is executable:', accountInfo.is_executable);
    console.log('[Truncate] Program pubkey:', programPubkey.toString('hex'));
    console.log('[Truncate] Authority pubkey:', authorityPubkey.toString('hex'));

    const truncateData = serializeTruncateInstruction(elf.length);
    console.log('[Truncate] Instruction data:', truncateData.toString('hex'));
    console.log('[Truncate] Program ID (BPF_LOADER_ID):', BPF_LOADER_ID.toString('hex'));

    const truncateIx: Instruction = {
      program_id: BPF_LOADER_ID,
      accounts: [
        { pubkey: programPubkey, is_signer: true, is_writable: true },
        { pubkey: authorityPubkey, is_signer: true, is_writable: false },
      ],
      data: truncateData,
    };

    console.log('[Truncate] Building transaction with signers:', [programKeypair.pubkey, authorityKeypair.pubkey]);
    console.log('[Truncate] Fee payer:', authorityPubkey.toString('hex'));

    const truncateTx = deployer.buildAndSignTransaction(
      [truncateIx],
      [programKeypair, authorityKeypair],
      truncateBlockhash,
      authorityPubkey.toString('hex')  // Authority is the fee payer
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

  // Send chunks in smaller batches with fresh blockhash every N transactions
  // to avoid blockhash expiration
  const BLOCKHASH_REFRESH_INTERVAL = 5; // Refresh every 5 transactions
  const writeTxids: string[] = [];

  for (let i = 0; i < chunks.length; i += BLOCKHASH_REFRESH_INTERVAL) {
    // Get fresh blockhash for this batch
    const freshBlockhash = await deployer.getBestBlockHash();

    // Build transactions for this batch
    const batchEnd = Math.min(i + BLOCKHASH_REFRESH_INTERVAL, chunks.length);
    const batchTxs: RuntimeTransaction[] = [];

    for (let j = i; j < batchEnd; j++) {
      const { offset, chunk } = chunks[j];
      const writeIx: Instruction = {
        program_id: BPF_LOADER_ID,
        accounts: [
          { pubkey: programPubkey, is_signer: false, is_writable: true },
          { pubkey: authorityPubkey, is_signer: true, is_writable: false },
        ],
        data: serializeWriteInstruction(offset, chunk),
      };

      batchTxs.push(deployer.buildAndSignTransaction(
        [writeIx],
        [authorityKeypair],
        freshBlockhash,
        authorityPubkey.toString('hex')  // Authority is the fee payer
      ));
    }

    // Send this batch
    const batchTxids = await deployer.sendBatchTransactions(batchTxs);
    writeTxids.push(...batchTxids);

    // Progress update
    onMessage('info', `Uploaded ${Math.min(batchEnd, chunks.length)}/${chunks.length} chunks`);
  }

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
    recentBlockhash,
    authorityPubkey.toString('hex')  // Authority is the fee payer
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

    // Generate separate keypairs for program and authority (matches arch-cli --generate-if-missing behavior)
    // Generate a NEW random keypair for the program
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const programPrivkeyBytes = Buffer.from(randomBytes);
    const programKeypairBtc = ECPair.fromPrivateKey(programPrivkeyBytes as any, { network: bitcoin.networks.testnet });
    const internalPubkey = programKeypairBtc.publicKey.subarray(1, 33) as any;

    // Generate P2TR address for the program
    const { address: programAddress } = bitcoin.payments.p2tr({
      internalPubkey,
      network: bitcoin.networks.testnet,
    });

    const programKeypair = {
      privkey: programPrivkeyBytes.toString('hex'),
      pubkey: internalPubkey.toString('hex'),
      address: programAddress!,
    };

    console.log('[Deploy] Generated NEW program keypair:', programKeypair.pubkey);
    console.log('[Deploy] Using authority keypair:', options.keypair.pubkey);

    // The user's keypair becomes the authority (funder)
    const authorityKeypair = {
      privkey: options.keypair.privkey,
      pubkey: options.keypair.pubkey,
      address: options.keypair.address,
    };

    const result = await deployProgram({
      rpcUrl: options.rpcUrl,
      network: options.network as any,
      programBinary: Buffer.from(options.programBinary),
      programKeypair,
      authorityKeypair,
      regtestConfig: options.regtestConfig,
      utxoInfo: options.utxoInfo,
      onMessage,
    });

    return result;
  }
}
