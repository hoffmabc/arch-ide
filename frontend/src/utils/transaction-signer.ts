/**
 * Transaction Signing Utility
 * Provides reusable functions for signing Arch Network transactions with BIP-322
 * Used by faucet, deployment, and other transaction operations
 */

import { Buffer } from 'buffer/';
import { sha256 } from 'js-sha256';
import { signMessage } from './bitcoin-signer';

/**
 * Serialize an Arch Network message for signing
 * This MUST match the Rust implementation exactly!
 *
 * Critical: All lengths are 4-byte little-endian u32 values, NOT single bytes
 */
export function serializeArchMessage(message: any): Uint8Array {
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
  message.account_keys.forEach((key: any) => {
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
    // For large arrays, push in chunks to avoid stack overflow
    if (dataBytes.length > 10000) {
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

/**
 * Hash a message for signing
 * Double SHA-256 hash matching Rust implementation
 */
export function hashMessage(serializedMessage: Uint8Array): Buffer {
  // First hash
  const firstHashHex = sha256(Buffer.from(serializedMessage));
  const firstHashBytes = Buffer.from(firstHashHex, 'utf8');

  // Second hash
  const secondHashHex = sha256(firstHashBytes);
  const messageHashBytes = Buffer.from(secondHashHex, 'utf8');

  return messageHashBytes;
}

/**
 * Sign a transaction message with BIP-322
 *
 * @param keypair - Object with privkey (hex) and pubkey (hex)
 * @param message - The message object to sign
 * @returns Buffer containing the 64-byte Schnorr signature
 */
export function signTransactionMessage(
  keypair: { privkey: string; pubkey: string },
  message: any
): Buffer {
  // Serialize the message
  const serializedMessage = serializeArchMessage(message);

  // Hash the message
  const messageHash = hashMessage(serializedMessage);

  // Sign with BIP-322
  const privateKeyBuffer = Buffer.from(keypair.privkey, 'hex');
  const signature = signMessage(privateKeyBuffer as any, messageHash as any);

  return signature;
}

/**
 * Sign and complete a partially-signed faucet transaction
 *
 * @param runtimeTx - Partially signed transaction from create_account_with_faucet
 * @param keypair - Keypair with privkey to sign with
 * @returns The fully-signed transaction ready for submission
 */
export function completeFaucetTransaction(
  runtimeTx: any,
  keypair: { privkey: string; pubkey: string }
): any {
  // Sign the transaction message
  const signature = signTransactionMessage(keypair, runtimeTx.message);

  // Add our signature to the transaction
  runtimeTx.signatures.push(Array.from(signature));

  return runtimeTx;
}

/**
 * Sign and submit a faucet transaction
 *
 * @param runtimeTx - Partially signed transaction from create_account_with_faucet
 * @param keypair - Keypair with privkey to sign with
 * @param rpcUrl - RPC endpoint URL
 * @returns Promise resolving to transaction ID
 */
export async function signAndSubmitFaucetTransaction(
  runtimeTx: any,
  keypair: { privkey: string; pubkey: string },
  rpcUrl: string
): Promise<string> {
  console.log('[Transaction Signer] Signing faucet transaction...');
  console.log('[Transaction Signer] Existing signatures:', runtimeTx.signatures.length);
  console.log('[Transaction Signer] Required signatures:', runtimeTx.message.header.num_required_signatures);

  // Complete the transaction with our signature
  const signedTx = completeFaucetTransaction(runtimeTx, keypair);

  console.log('[Transaction Signer] Total signatures after signing:', signedTx.signatures.length);
  console.log('[Transaction Signer] Submitting transaction...');

  // Submit the fully-signed transaction
  const sendPayload = {
    jsonrpc: '2.0',
    id: 'transaction-' + Date.now(),
    method: 'send_transaction',
    params: signedTx,
  };

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sendPayload),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error.message || JSON.stringify(result.error));
  }

  const txid = result.result;
  console.log('[Transaction Signer] Transaction submitted:', txid);

  return txid;
}
