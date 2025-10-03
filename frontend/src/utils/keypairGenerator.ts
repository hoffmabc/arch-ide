import * as bitcoin from 'bitcoinjs-lib';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { ProjectAccount } from '../types';

const ECPair = ECPairFactory(ecc);

/**
 * Generate a new keypair for Arch Network
 * Can be used for both program accounts and authority accounts
 */
export function generateArchKeypair(network: 'mainnet' | 'testnet' | 'devnet' = 'testnet'): ProjectAccount {
  // Generate random 32-byte private key
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const privkeyBytes = Buffer.from(randomBytes);

  // Determine Bitcoin network
  const btcNetwork = network === 'mainnet'
    ? bitcoin.networks.bitcoin
    : bitcoin.networks.testnet;

  // Create ECPair from private key
  const keypairBtc = ECPair.fromPrivateKey(privkeyBytes as any, { network: btcNetwork });

  // Get internal pubkey (x-only, 32 bytes)
  const internalPubkey = keypairBtc.publicKey.subarray(1, 33) as any;

  // Generate P2TR (Taproot) address
  const { address } = bitcoin.payments.p2tr({
    internalPubkey,
    network: btcNetwork,
  });

  return {
    privkey: privkeyBytes.toString('hex'),
    pubkey: internalPubkey.toString('hex'),
    address: address!,
  };
}

/**
 * Export keypair as JSON file (Solana/Arch CLI compatible format)
 */
export function exportKeypairToJSON(keypair: ProjectAccount): string {
  const privkeyBytes = Buffer.from(keypair.privkey, 'hex');
  const keypairArray = Array.from(privkeyBytes);
  return JSON.stringify(keypairArray, null, 2);
}

/**
 * Download keypair as JSON file
 */
export function downloadKeypairJSON(keypair: ProjectAccount, filename: string = 'keypair.json'): void {
  const json = exportKeypairToJSON(keypair);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Format address for display (truncated)
 */
export function formatAddress(address: string, chars: number = 8): string {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Format public key for display (truncated)
 */
export function formatPubkey(pubkey: string, chars: number = 8): string {
  if (pubkey.length <= chars * 2) return pubkey;
  return `${pubkey.slice(0, chars)}...${pubkey.slice(-chars)}`;
}
