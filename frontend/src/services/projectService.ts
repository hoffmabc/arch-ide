import { v4 as uuidv4 } from 'uuid';
import type { FileNode, Project } from '../types';
import JSZip from 'jszip';
import { StorageService } from './storage';
import { ProjectAccount } from '../types/types';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const CARGO_TOML_TEMPLATE = `[package]
name = "arch-ide"
version = "0.1.0"
edition = "2021"

[dependencies]
arch_program = "0.5.13"
apl-associated-token-account = "0.5.13"
apl-token = "0.5.13"
apl-token-metadata = "0.5.13"
borsh = { version = "1.5.1", features = ["derive"] }

[lib]
crate-type = ["cdylib", "lib"]`;

const DEFAULT_PROGRAM = `use arch_program::{
    account::AccountInfo,
    entrypoint, msg,
    helper::add_state_transition,
    input_to_sign::InputToSign,
    program::{
        get_bitcoin_block_height, next_account_info, set_transaction_to_sign,
    },
    program_error::ProgramError, pubkey::Pubkey,
    bitcoin::{self, Transaction, transaction::Version, absolute::LockTime}
};
use borsh::{BorshDeserialize, BorshSerialize};

entrypoint!(process_instruction);
pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> Result<(), ProgramError> {
    if accounts.len() != 1 {
        return Err(ProgramError::Custom(501));
    }

    let bitcoin_block_height = get_bitcoin_block_height();
    msg!("bitcoin_block_height {:?}", bitcoin_block_height);

    let account_iter = &mut accounts.iter();
    let account = next_account_info(account_iter)?;

    assert!(account.is_writable);
    assert!(account.is_signer);

    let params: HelloWorldParams = borsh::from_slice(instruction_data).unwrap();
    let fees_tx: Transaction = bitcoin::consensus::deserialize(&params.tx_hex).unwrap();

    let new_data = format!("Hello {}", params.name);

    // Extend the account data to fit the new data
    let data_len = account.data.try_borrow().unwrap().len();
    if new_data.as_bytes().len() > data_len {
        account.realloc(new_data.len(), true)?;
    }

    account
        .data
        .try_borrow_mut()
        .unwrap()
        .copy_from_slice(new_data.as_bytes());

    let mut tx = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![],
        output: vec![],
    };
    add_state_transition(&mut tx, account);
    tx.input.push(fees_tx.input[0].clone());

    let input_to_sign = InputToSign {
        index: 0,
        signer: account.key.clone(),
    };

    msg!("tx: {:?}", tx);
    set_transaction_to_sign(accounts, &tx, &[input_to_sign])
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct HelloWorldParams {
    pub name: String,
    pub tx_hex: Vec<u8>,
}
`;

const DEFAULT_CLIENT = String.raw`// ============================================================================
// Hello World Program Client Example
// ============================================================================
// This example demonstrates how to call the hello world program that:
// 1. Takes a name as input
// 2. Writes "Hello {name}" to an account
// 3. Returns a signed transaction
// ============================================================================

console.log("=== Arch Network Hello World Example ===\n");

// Try to connect to Arch Network RPC
let conn;
let blockCount;
let bestBlockHash;

try {
  console.log("Connecting to Arch Network...");
  conn = new RpcConnection("https://rpc-beta.test.arch.network");

  // Test connection with a simple call (with timeout protection)
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Connection timeout')), 5000)
  );

  blockCount = await Promise.race([
    conn.getBlockCount(),
    timeout
  ]);

  console.log("✓ Connected to Arch Network");
  console.log("Block Count:", blockCount);

  // Get best (latest) block hash
  bestBlockHash = await conn.getBestBlockHash();
  console.log("Best Block Hash:", bestBlockHash.slice(0, 16) + "...\n");
} catch (error) {
  console.error("✗ Failed to connect to Arch Network RPC");
  console.error("Error:", error.message || error);
  console.log("\n⚠️  The Arch Network testnet might be down or unreachable");
  console.log("\n💡 This example requires a working RPC connection.");
  console.log("   Check https://docs.arch.network for current RPC endpoints");
  console.log("\n❌ Stopping execution - cannot proceed without RPC connection");
  // Don't throw - just exit gracefully
  return;
}

// ============================================================================
// Step 1: Setup account (use wallet if available, otherwise create new)
// ============================================================================
console.log("--- Step 1: Setting Up Account ---");

let accountPubkey;
let accountAddress;
let useWallet = false;

// Debug: Check if walletProxy is available
console.log("walletProxy available:", typeof walletProxy !== 'undefined');

// Check if a Bitcoin wallet is available via walletProxy
if (typeof walletProxy !== 'undefined') {
  console.log("Checking for wallet extensions...");

  try {
    const walletAvailable = await walletProxy.isAvailable();
    console.log("Wallet available:", walletAvailable);

    if (walletAvailable) {
      const walletType = await walletProxy.getWalletType();
      console.log("Wallet type:", walletType);
      console.log("✓ " + (walletType || 'Bitcoin') + " wallet detected");

      try {
        const accounts = await walletProxy.getAccounts();
        console.log("Accounts received:", accounts);

        if (accounts && accounts.length > 0) {
          accountAddress = accounts[0];
          let pubkey = await walletProxy.getPublicKey();

          // Bitcoin wallets return 33-byte compressed keys (66 hex chars)
          // Arch Network needs 32-byte x-only keys (64 hex chars)
          // Strip the first byte (02 or 03 prefix) to get the x-only key
          if (pubkey.length === 66) {
            pubkey = pubkey.slice(2); // Remove first byte
            console.log("✓ Converted compressed pubkey to x-only format");
          }

          accountPubkey = PubkeyUtil.fromHex(pubkey);
          useWallet = true;
          console.log("✓ Using wallet account");
          console.log("  Address:", accountAddress);
          console.log("  Pubkey:", pubkey.slice(0, 20) + "...");

          // Fund the account on testnet using the faucet
          console.log("");
          console.log("--- Funding Account on Testnet ---");
          try {
            console.log("Requesting funds from faucet...");
            const faucetPayload = {
              jsonrpc: '2.0',
              id: 'faucet-request',
              method: 'create_account_with_faucet',
              params: Array.from(accountPubkey),
            };

            const faucetResponse = await fetch(conn.url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(faucetPayload),
            });

            if (!faucetResponse.ok) {
              throw new Error("Faucet HTTP error: " + faucetResponse.status);
            }

            const faucetResult = await faucetResponse.json();

            if (faucetResult.error) {
              // Account might already have funds
              console.log("⚠️  Faucet note:", faucetResult.error.message);
              console.log("  (Account may already have funds)");
            } else {
              console.log("✓ Airdrop transaction submitted!");
              console.log("  Waiting for confirmation...");

              // Wait a bit for the transaction to be processed
              await new Promise(resolve => setTimeout(resolve, 2000));

              console.log("✓ Account funded!");
            }
          } catch (error) {
            console.log("⚠️  Airdrop failed:", error.message);
            console.log("  Continuing anyway (account may already have funds)");
          }
        }
      } catch (e) {
        console.log("⚠️  Could not connect to wallet:", e.message || e);
        console.log("Full error:", e);
      }
    } else {
      console.log("⚠️  No wallet extension detected in browser");
      console.log("💡 To use your wallet:");
      console.log("   1. Install Unisat (https://unisat.io) or Xverse wallet extension");
      console.log("   2. Refresh this page after installing");
      console.log("   3. Make sure the wallet is unlocked");
    }
  } catch (walletCheckError) {
    console.log("⚠️  Error checking wallet availability:", walletCheckError.message || walletCheckError);
    console.log("Will proceed with creating a new account instead");
  }
}

// Fallback: create a new account if no wallet
if (!useWallet) {
  console.log("Creating new account...");
  const archConn = ArchConnection(conn);
  const newAccount = await archConn.createNewAccount();
  accountPubkey = PubkeyUtil.fromHex(newAccount.pubkey);
  accountAddress = newAccount.address;

  console.log("✓ Account Created:");
  console.log("  Address:", accountAddress);
  console.log("  Pubkey (hex):", newAccount.pubkey.slice(0, 20) + "...");
  console.log("  Pubkey (base58):", toBase58(accountPubkey));

  // Request airdrop for the new account
  try {
    await conn.requestAirdrop(accountPubkey);
    console.log("✓ Airdrop requested successfully!");
  } catch(e) {
    console.log("✗ Airdrop error:", e.error ? e.error.message : e.message);
  }
}

console.log("");

// ============================================================================
// Step 2: Prepare instruction data using Borsh serialization
// ============================================================================
console.log("--- Step 2: Preparing Instruction Data ---");

// Helper function to serialize a string using Borsh format
function borshSerializeString(str) {
  const encoder = new TextEncoder();
  const strBytes = encoder.encode(str);
  const length = strBytes.length;

  // Borsh serializes strings as: length (4 bytes, little-endian) + bytes
  const buffer = new Uint8Array(4 + length);
  buffer[0] = length & 0xFF;
  buffer[1] = (length >> 8) & 0xFF;
  buffer[2] = (length >> 16) & 0xFF;
  buffer[3] = (length >> 24) & 0xFF;
  buffer.set(strBytes, 4);

  return buffer;
}

// Helper function to serialize Vec<u8> using Borsh format
function borshSerializeVecU8(vec) {
  const length = vec.length;

  // Borsh serializes Vec<u8> as: length (4 bytes, little-endian) + bytes
  const buffer = new Uint8Array(4 + length);
  buffer[0] = length & 0xFF;
  buffer[1] = (length >> 8) & 0xFF;
  buffer[2] = (length >> 16) & 0xFF;
  buffer[3] = (length >> 24) & 0xFF;
  buffer.set(vec, 4);

  return buffer;
}

// Create HelloWorldParams: { name: String, tx_hex: Vec<u8> }
const userName = "Arch Developer";
console.log("Creating greeting for:", userName);

// Create a dummy Bitcoin transaction for fees (32 byte txid + input data)
// In production, this would be a real Bitcoin transaction
const dummyTxHex = new Uint8Array(250).fill(0);

// Serialize the struct fields
const nameBytes = borshSerializeString(userName);
const txHexBytes = borshSerializeVecU8(dummyTxHex);

// Combine into instruction data
const instructionData = new Uint8Array(nameBytes.length + txHexBytes.length);
instructionData.set(nameBytes, 0);
instructionData.set(txHexBytes, nameBytes.length);

console.log("✓ Instruction data serialized:", instructionData.length, "bytes\n");

// ============================================================================
// Step 3: Call the Hello World program
// ============================================================================
console.log("--- Step 3: Calling Hello World Program ---");

// NOTE: Replace PROGRAM_ID_HEX with your deployed program's pubkey
// You can get this from the Deploy panel after building and deploying
const PROGRAM_ID_HEX = "YOUR_PROGRAM_ID_HERE";

// For this example to work, you need to:
// 1. Build the program using the Build panel
// 2. Deploy the program and copy the program ID
// 3. Replace PROGRAM_ID_HEX above with your actual program ID
// 4. Run this client code

if (PROGRAM_ID_HEX === "YOUR_PROGRAM_ID_HERE") {
  console.log("⚠️  Please deploy the program first and update PROGRAM_ID_HEX");
  console.log("\n📋 Quick Start Guide:");
  console.log("   1. Click 'Build' in the Build panel");
  console.log("   2. Click 'Deploy' and wait for completion");
  console.log("   3. Copy the Program ID from the Deploy panel");
  console.log("   4. Update PROGRAM_ID_HEX in this code (line 201)");
  console.log("   5. Run the client again");
  console.log("\n💡 The program will:");
  console.log("   - Accept your name as input");
  console.log("   - Write 'Hello {name}' to the account");
  console.log("   - Return a signed Bitcoin transaction");
} else {
  console.log("Program ID:", PROGRAM_ID_HEX.slice(0, 20) + "...");
  console.log("\n⚠️  Important: This client demonstrates the structure of calling");
  console.log("    the program. To fully execute the transaction, you would need");
  console.log("    to sign it with a BIP-322 signature using the account's private key.");
  console.log("\n📚 Transaction Structure:");

  try {
    const programId = PubkeyUtil.fromHex(PROGRAM_ID_HEX);

    // Create the instruction (using SDK format)
    const instruction = {
      program_id: programId,
      accounts: [
        {
          pubkey: accountPubkey,
          is_signer: true,
          is_writable: true
        }
      ],
      data: instructionData
    };

    console.log("✓ Instruction created");
    console.log("  - Program ID: " + PROGRAM_ID_HEX.slice(0, 16) + "...");
    console.log("  - Accounts: 1 (writable, signer)");
    console.log("  - Data: " + instructionData.length + " bytes");

    // Create a proper SanitizedMessage using MessageUtil
    // This will create the correct format with header, account_keys, etc.
    const unsanitizedMessage = {
      signers: [accountPubkey],
      instructions: [instruction]
    };

    console.log("\n✓ Message created");
    console.log("  - Signers: 1");
    console.log("  - Instructions: 1");

    // Hash the message (this is what gets signed)
    const messageHash = MessageUtil.hash(unsanitizedMessage);

    // Convert Uint8Array to hex string for display
    const hashHex = Array.from(messageHash)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    console.log("\n✓ Message hash: " + hashHex.slice(0, 32) + "...");

    // ============================================================================
    // Sign and send the transaction using browser wallet
    // ============================================================================
    console.log("\n--- Signing Transaction with Wallet ---");

    // Check if wallet proxy is available and wallet is connected
    if (typeof walletProxy !== 'undefined' && useWallet) {
      const walletType = await walletProxy.getWalletType();
      console.log("✓ Using " + (walletType || 'wallet') + " for signing");

      try {
        // Use wallet proxy to sign with BIP-322
        console.log("Requesting signature from wallet...");
        console.log("⚠️  Please approve the signature request in your wallet");

        const signatureBase64 = await walletProxy.signMessage(hashHex, 'bip322-simple');

        // Decode base64 signature to bytes
        let signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
        console.log("✓ Signature received from wallet");
        console.log("  - Raw signature length: " + signature.length + " bytes");
        console.log("  - Signature preview: " + Array.from(signature.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join('') + "...");

        // BIP322 signatures can be 65 bytes (64-byte sig + 1-byte recovery/sighash)
        // Arch Network expects 64-byte Schnorr signatures
        if (signature.length === 65) {
          console.log("  - Stripping extra byte from BIP322 signature (65 -> 64 bytes)");
          signature = signature.slice(0, 64);
        }

        // Adjust signature using SignatureUtil if available
        if (typeof SignatureUtil !== 'undefined') {
          console.log("  - Adjusting signature for Arch Network...");
          try {
            signature = SignatureUtil.adjustSignature(signature);
            console.log("✓ Signature adjusted for Arch Network");
            console.log("  - Adjusted signature length: " + signature.length + " bytes");
            console.log("  - Adjusted preview: " + Array.from(signature.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join('') + "...");
          } catch (e) {
            console.log("⚠️  Could not adjust signature:", e.message);
            console.log("  - Using raw signature instead");
          }
        }

        // Validate signature length (should be 64 bytes for Schnorr)
        if (signature.length !== 64) {
          console.log("⚠️  Warning: Signature length is " + signature.length + " bytes (expected 64 for Schnorr)");
          console.log("  - This might cause issues when sending the transaction");
        }

        // Get a recent blockhash for the transaction
        const bestBlockHash = await conn.getBestBlockHash();
        console.log("\n✓ Recent blockhash:", bestBlockHash.slice(0, 20) + "...");

        // Convert blockhash from hex string to bytes
        const blockhashBytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          blockhashBytes[i] = parseInt(bestBlockHash.slice(i * 2, i * 2 + 2), 16);
        }

        // Create a SanitizedMessage in the format the RPC expects
        // CRITICAL: The fee payer (accountPubkey) MUST be:
        // 1. First in account_keys (index 0)
        // 2. Marked as writable (num_readonly_signed_accounts: 0)
        // 3. A signer (counted in num_required_signatures: 1)
        const sanitizedMessage = {
          header: {
            num_required_signatures: 1,     // 1 signer (the fee payer)
            num_readonly_signed_accounts: 0, // 0 readonly signers (fee payer is writable)
            num_readonly_unsigned_accounts: 1  // 1 program ID (readonly)
          },
          account_keys: [
            Array.from(accountPubkey),  // Index 0: Fee payer (signer, writable)
            Array.from(programId)       // Index 1: Program ID (readonly)
          ],
          recent_blockhash: Array.from(blockhashBytes),  // Real blockhash
          instructions: [{
            program_id_index: 1,  // Index to programId in account_keys
            accounts: [0],         // Index to fee payer in account_keys
            data: Array.from(instructionData)
          }]
        };

        // Create the runtime transaction
        const transaction = {
          version: 0,
          signatures: [Array.from(signature)],
          message: sanitizedMessage
        };

        console.log("\n✓ Transaction created");
        console.log("  - Version: " + transaction.version);
        console.log("  - Signatures: " + transaction.signatures.length);
        console.log("  - Signature length: " + signature.length + " bytes");

        // Send the transaction
        console.log("\n--- Sending Transaction ---");
        const txid = await conn.sendTransaction(transaction);
        console.log("✅ Transaction sent!");
        console.log("Transaction ID: " + txid);

        // Wait a bit for the transaction to be processed
        console.log("\n⏳ Waiting for transaction to be processed...");
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Try to get the processed transaction
        try {
          const processedTx = await conn.getProcessedTransaction(txid);
          if (processedTx) {
            console.log("✓ Transaction processed");
            console.log("  - Status:", processedTx.status);
            if (processedTx.bitcoin_txid) {
              console.log("  - Bitcoin TXID:", processedTx.bitcoin_txid);
            }
          }
        } catch (e) {
          console.log("⚠️  Transaction submitted but confirmation pending");
        }

      } catch (error) {
        console.error("✗ Error signing/sending transaction:", error.message || error);
        console.log("\n💡 Troubleshooting:");
        console.log("   - Make sure your wallet is unlocked");
        console.log("   - Check that you have BTC for fees");
        console.log("   - Try connecting your wallet to the dApp");
        console.log("   - Approve the signature request in your wallet");
      }

    } else {
      console.log("⚠️  No wallet connected");
      console.log("\n💡 To complete this transaction:");
      console.log("   1. Install Unisat (https://unisat.io) or Xverse wallet");
      console.log("   2. Connect your wallet to this site");
      console.log("   3. Run this script again");
      console.log("\n📝 Transaction was prepared successfully:");
      console.log("   - Message hash: " + hashHex.slice(0, 32) + "...");
      console.log("   - You can sign this manually with BIP-322");
      console.log("   - Then create RuntimeTransaction and call conn.sendTransaction()");
    }

  } catch (error) {
    console.error("✗ Error preparing transaction:", error);
  }
}

// ============================================================================
// Step 4: Read account data to verify
// ============================================================================
console.log("\n--- Step 4: Verifying Account Data ---");
try {
  const accountInfo = await conn.readAccountInfo(accountPubkey);
  console.log("✓ Account found!");
  console.log("  Owner:", toBase58(accountInfo.owner));
  console.log("  Data length:", accountInfo.data.length, "bytes");

  // Decode the account data (it should contain "Hello Arch Developer")
  if (accountInfo.data.length > 0) {
    const decoder = new TextDecoder();
    const greeting = decoder.decode(accountInfo.data);
    console.log("  📝 Greeting:", greeting);

    if (greeting.includes("Hello")) {
      console.log("\n🎉 Success! The program executed correctly!");
    }
  } else {
    console.log("  (No data yet - transaction may still be processing)");
  }
} catch(e) {
  console.log("⚠️  Account not found or no data yet");
  console.log("   This is normal if the transaction hasn't been sent or is still processing");
}

console.log("\n=== Example Complete ===");
`;

const PROGRAM_TEMPLATE: FileNode[] = [
  {
    name: 'src',
    type: 'directory',
    children: [
      {
        name: 'lib.rs',
        type: 'file',
        content: DEFAULT_PROGRAM
      }
    ]
  },
  {
    name: 'client',
    type: 'directory',
    children: [
      {
        name: 'client.ts',
        type: 'file',
        content: DEFAULT_CLIENT
      }
    ]
  }
];

const addPathsToNodes = (nodes: FileNode[], parentPath: string = ''): FileNode[] => {
    return nodes.map(node => {
      const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      if (node.type === 'directory' && node.children) {
        return {
          ...node,
          path: currentPath,
          children: addPathsToNodes(node.children, currentPath)
        };
      }
      return { ...node, path: currentPath };
    });
  };

export class ProjectService {
  private storage = new StorageService();

  constructor() {
    // Initialize the storage service when ProjectService is created
    this.storage.init().catch(console.error);
  }

  async createProject(name: string, description?: string): Promise<Project> {
    const uniqueName = await this.getUniqueProjectName(name);
    const project: Project = {
      id: uuidv4(),
      name: uniqueName,
      description,
      files: addPathsToNodes([...PROGRAM_TEMPLATE]),
      created: new Date(),
      lastModified: new Date(),
      account: undefined
    };

    await this.storage.saveProject(project);
    return project;
  }

  async updateProjectAccount(projectId: string, account: ProjectAccount): Promise<void> {
    const project = await this.storage.getProject(projectId);
    if (project) {
      project.account = account;
      project.lastModified = new Date();
      await this.storage.saveProject(project);
    }
  }

  async saveProject(project: Project): Promise<void> {
    // Prevent auto-saving during development hot reload
    if (import.meta.env.DEV && document.visibilityState === 'hidden') {
      return;
    }

    await this.storage.saveProject(project);
  }

  async getProject(id: string): Promise<Project | null> {
    return (await this.storage.getProject(id)) || null;
  }

  async getAllProjects(): Promise<Project[]> {
    return await this.storage.getAllProjects();
  }

  async deleteProject(id: string): Promise<void> {
    await this.storage.deleteProject(id);
  }

  async compileProject(project: Project) {
    const files: { path: string, content: string }[] = [];
    // Find the program directory
    const programDir = project.files.find((node: FileNode) =>
      node.type === 'directory' && node.name === 'program'
    );

    if (!programDir || programDir.type !== 'directory' || !programDir.children) {
      throw new Error('Program directory not found or invalid');
    }

    // Only collect required files from the program directory
    const requiredFiles = [
      'src/lib.rs',
      'Cargo.toml'
    ];

    const collectRequiredFiles = (nodes: FileNode[], currentPath = '') => {
      for (const node of nodes) {
        const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;

        if (node.type === 'file' && requiredFiles.includes(nodePath)) {
          if (typeof node.content === 'string') {
            files.push({
              path: nodePath,
              content: node.content
            });
          } else {
            throw new Error(`Invalid content type for file: ${nodePath}`);
          }
        } else if (node.type === 'directory' && node.children) {
          collectRequiredFiles(node.children, nodePath);
        }
      }
    };

    collectRequiredFiles(programDir.children);
    // Verify we have all required files
    for (const requiredFile of requiredFiles) {
      if (!files.some(f => f.path === requiredFile)) {
        throw new Error(`Missing required file: ${requiredFile}`);
      }
    }

    // Make API call to compile
    const response = await fetch(`${API_URL}/compile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files })
      });

    return response.json();
  }

  exportProject(project: Project): Blob {
    // Convert project to a JSON string with proper formatting
    const projectData = JSON.stringify(project, null, 2);
    return new Blob([projectData], { type: 'application/json' });
  }

  async importProject(files: FileList): Promise<Project> {
    const fileNodes: FileNode[] = [];
    const fileMap = new Map<string, FileNode>();

    console.log('Starting import with files:', Array.from(files).map(f => f.webkitRelativePath));

    // Convert FileList to array and sort by path
    const fileArray = Array.from(files).sort((a, b) =>
      a.webkitRelativePath.localeCompare(b.webkitRelativePath)
    );

    console.log('Sorted file array:', fileArray.map(f => f.webkitRelativePath));

    // Get base project name from first file
    const baseProjectName = files[0].webkitRelativePath.split('/')[0];
    const projectName = await this.getUniqueProjectName(baseProjectName);

    console.log('Project name:', projectName);

    // Process each file
    for (const file of fileArray) {
      console.log('\nProcessing file:', file.webkitRelativePath);
      const pathParts = file.webkitRelativePath.split('/');
      console.log('Path parts:', pathParts);
      let currentPath = '';

      // Skip the first part as it's the root folder name
      for (let i = 1; i < pathParts.length; i++) {
        const part = pathParts[i];
        const isFile = i === pathParts.length - 1;
        const fullPath = currentPath + part;

        console.log(`Processing part: ${part} (${isFile ? 'file' : 'directory'})`);
        console.log('Current path:', currentPath);
        console.log('Full path:', fullPath);

        if (!fileMap.has(fullPath)) {
          const node: FileNode = {
            name: part,
            type: isFile ? 'file' : 'directory',
            path: fullPath,
            ...(isFile ? { content: await this.readFileContent(file) } : { children: [] })
          };

          console.log('Created node:', {
            name: node.name,
            type: node.type,
            path: node.path,
            hasContent: isFile ? 'yes' : 'no',
            hasChildren: !isFile ? 'yes' : 'no'
          });

          fileMap.set(fullPath, node);

          if (currentPath === '') {
            console.log('Adding to root fileNodes:', node.name);
            fileNodes.push(node);
          } else {
            const parent = fileMap.get(currentPath.slice(0, -1));
            if (parent && parent.children) {
              console.log(`Adding to parent "${parent.name}":`, node.name);
              parent.children.push(node);
            } else {
              console.warn('Could not find parent for path:', currentPath.slice(0, -1));
            }
          }
        }

        if (!isFile) {
          currentPath += part + '/';
        }
      }
    }

    console.log('\nFinal file structure:', {
      fileNodes: fileNodes.map(node => ({
        name: node.name,
        type: node.type,
        children: node.children?.map(child => child.name)
      }))
    });

    // Transform the structure to ensure src/lib.rs layout
    const transformedFiles = this.transformToSrcStructure(fileNodes);

    const project = {
      id: uuidv4(),
      name: projectName,
      files: transformedFiles,
      created: new Date(),
      lastModified: new Date()
    };

    await this.saveProject(project);
    return project;
  }

  private async getUniqueProjectName(baseName: string): Promise<string> {
    const projects = await this.storage.getAllProjects();
    let name = baseName;
    let counter = 1;

    while (projects.some(p => p.name === name)) {
      name = `${baseName} (${counter})`;
      counter++;
    }

    return name;
  }

  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      // Use the storage service's isTextFile check instead of relying on MIME type
      const isText = this.storage.isTextFile(file.name) ||
                    file.type.startsWith('text/') ||
                    ['application/json', 'application/javascript', 'application/typescript']
                      .includes(file.type);

      reader.onload = (e) => {
        if (isText) {
          resolve(e.target?.result as string);
        } else {
          // Only use data URL for actual binary files
          resolve(e.target?.result as string);
        }
      };

      if (isText) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });
  }

  async importProjectAsZip(file: File): Promise<Project> {
    const zip = await JSZip.loadAsync(file);
    const fileNodes: FileNode[] = [];
    const fileMap = new Map<string, FileNode>()

    // Get the root directory name from the zip
    const rootDirName = Object.keys(zip.files)[0].split('/')[0];
    const projectName = rootDirName || file.name.replace('.zip', '');
    const uniqueName = await this.getUniqueProjectName(projectName);

    for (const [path, zipEntry] of Object.entries(zip.files)) {
      if (!zipEntry.dir) {
        const content = await zipEntry.async('text');
        const parts = path.split('/');
        let currentPath = '';

        for (const [index, part] of parts.entries()) {
          const isFile = index === parts.length - 1;
          const fullPath = currentPath + part;

          if (!fileMap.has(fullPath)) {
            const node: FileNode = {
              name: part,
              type: isFile ? 'file' : 'directory',
              path: fullPath,
              ...(isFile ? { content } : { children: [] })
            };

            fileMap.set(fullPath, node);

            if (currentPath === '') {
              fileNodes.push(node);
            } else {
              const parent = fileMap.get(currentPath.slice(0, -1));
              parent?.children?.push(node);
            }
          }

          if (!isFile) {
            currentPath += part + '/';
          }
        }
      }
    }

    const project = {
      id: uuidv4(),
      name: uniqueName,
      files: fileNodes,
      created: new Date(),
      lastModified: new Date()
    };

    // Save to IndexedDB
    await this.saveProject(project);
    return project;
  }

  private transformToSrcStructure(fileNodes: FileNode[]): FileNode[] {
    console.group('File Structure Transformation');

    // Log initial state
    console.log('Initial structure:', fileNodes.map(n => ({
      name: n.name,
      type: n.type,
      hasContent: !!n.content
    })));

    // Find or create src directory if it doesn't exist
    let srcNode = fileNodes.find(node => node.name === 'src' && node.type === 'directory');
    if (!srcNode) {
      srcNode = {
        name: 'src',
        type: 'directory',
        children: []
      };
      // Only add src directory if we have Rust files that should go in it
      const hasRustFiles = fileNodes.some(node =>
        node.type === 'file' && node.name.endsWith('.rs')
      );
      if (hasRustFiles) {
        fileNodes.push(srcNode);
      }
    }

    // Only move lib.rs to src directory if it exists at root and src exists
    const libRs = fileNodes.find(node => node.name === 'lib.rs' && node.type === 'file');
    if (libRs && srcNode) {
      srcNode.children = srcNode.children || [];
      // Only move if not already in src
      if (!srcNode.children.find(n => n.name === 'lib.rs')) {
        srcNode.children.push(libRs);
        fileNodes = fileNodes.filter(node => node !== libRs);
      }
    }

    // Log final state
    console.log('Transformed structure:', fileNodes.map(n => ({
      name: n.name,
      type: n.type,
      children: n.children?.map(c => c.name)
    })));

    console.groupEnd();
    return fileNodes;
  }

  async importFromFolder(files: FileList): Promise<Project> {
    const fileNodes: FileNode[] = [];
    const fileMap = new Map<string, FileNode>();

    // Get base project name from first file
    const baseProjectName = files[0].webkitRelativePath.split('/')[0];
    const projectName = await this.getUniqueProjectName(baseProjectName);

    // Process each file
    for (const file of Array.from(files)) {
      const pathParts = file.webkitRelativePath.split('/');
      let currentPath = '';

      // Skip the first part as it's the root folder name
      for (let i = 1; i < pathParts.length; i++) {
        const part = pathParts[i];
        const isFile = i === pathParts.length - 1;
        const fullPath = currentPath + part;

        if (!fileMap.has(fullPath)) {
          const node: FileNode = {
            name: part,
            type: isFile ? 'file' : 'directory',
            path: fullPath,
            ...(isFile ? { content: await this.readFileContent(file) } : { children: [] })
          };

          fileMap.set(fullPath, node);

          if (currentPath === '') {
            fileNodes.push(node);
          } else {
            const parent = fileMap.get(currentPath.slice(0, -1));
            if (parent && parent.children) {
              parent.children.push(node);
            }
          }
        }

        if (!isFile) {
          currentPath += part + '/';
        }
      }
    }

    const project = {
      id: uuidv4(),
      name: projectName,
      files: fileNodes,
      created: new Date(),
      lastModified: new Date()
    };

    await this.saveProject(project);
    return project;
  }

  async exportProjectAsZip(project: Project): Promise<Blob> {
    const zip = new JSZip();

    const addToZip = (nodes: FileNode[], currentPath: string = '') => {
      for (const node of nodes) {
        const path = currentPath ? `${currentPath}/${node.name}` : node.name;
        if (node.type === 'file' && node.content) {
          zip.file(path, node.content);
        } else if (node.type === 'directory' && node.children) {
          addToZip(node.children, path);
        }
      }
    };

    addToZip(project.files);
    return await zip.generateAsync({ type: 'blob' });
  }
}

export const projectService = new ProjectService();