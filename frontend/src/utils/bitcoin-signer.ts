import * as Bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";
import BIP322Signer from "bip322-js/dist/Signer";
import * as wif from 'wif';

Bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

/**
 * Sign a message using BIP-322 (Simple)
 * This matches Arch SDK's sign_message_bip322 behavior
 *
 * @param privateKey - 32-byte private key
 * @param messageBytes - Message bytes to sign (for Arch: 64-byte UTF-8 representation of hex hash)
 * @returns 64-byte Schnorr signature (from BIP-322 witness)
 */
export const signMessage = (privateKey: Buffer, messageBytes: Buffer): Buffer => {
  if (privateKey.length !== 32) {
    throw new Error(`Expected 32 bytes of private key, got ${privateKey.length}`);
  }

  console.log('[Bitcoin Signer] Signing message with BIP-322');
  console.log('[Bitcoin Signer] Message length:', messageBytes.length);
  console.log('[Bitcoin Signer] Message (hex):', messageBytes.toString('hex').substring(0, 40) + '...');

  try {
    // Ensure privateKey is a Uint8Array for compatibility
    const privKeyArray = privateKey instanceof Uint8Array ? privateKey : new Uint8Array(privateKey);

    // Create keypair from private key
    const keyPair = ECPair.fromPrivateKey(Buffer.from(privKeyArray), {
      compressed: true,
      network: Bitcoin.networks.testnet
    });

    // Get x-only public key for Taproot
    const xOnlyPubkey = Buffer.from(ecc.xOnlyPointFromPoint(keyPair.publicKey));

    console.log('[Bitcoin Signer] X-only pubkey:', xOnlyPubkey.toString('hex'));

    // Create Taproot address (P2TR)
    const { address } = Bitcoin.payments.p2tr({
      internalPubkey: xOnlyPubkey,
      network: Bitcoin.networks.testnet
    });

    if (!address) {
      throw new Error('Failed to derive Taproot address');
    }

    console.log('[Bitcoin Signer] P2TR address:', address);

    // Convert private key to WIF format (required by bip322-js)
    const privateKeyWIF = wif.encode(128, Buffer.from(privKeyArray), true); // 128 = testnet, true = compressed
    console.log('[Bitcoin Signer] Private key converted to WIF format');

    // Use the bip322-js library to sign the message
    // The library's Signer.sign() is a static method
    // BIP322 needs the message as a string - convert the bytes to binary string
    const messageBinaryString = Array.from(messageBytes)
      .map(byte => String.fromCharCode(byte))
      .join('');

    console.log('[Bitcoin Signer] Message as binary string length:', messageBinaryString.length);

    // Sign using BIP-322 static method with WIF private key
    const signatureResult = BIP322Signer.sign(
      privateKeyWIF,
      address,
      messageBinaryString
    );

    console.log('[Bitcoin Signer] BIP-322 signature result:', signatureResult);

    // The signature is a witness in base64 (can be string or Buffer)
    // Decode and extract the Schnorr signature (first element)
    let witnessBytes: Buffer;
    if (typeof signatureResult === 'string') {
      witnessBytes = Buffer.from(signatureResult, 'base64');
    } else {
      witnessBytes = signatureResult;
    }

    console.log('[Bitcoin Signer] Witness bytes length:', witnessBytes.length);
    console.log('[Bitcoin Signer] Witness bytes (hex):', witnessBytes.toString('hex'));

    // BIP-322 witness format:
    // 1. Number of witness stack items (varint)
    // 2. For each item: length (varint) + data
    let offset = 0;

    // Read number of witness items
    const numItems = witnessBytes.readUInt8(offset);
    offset += 1;
    console.log('[Bitcoin Signer] Number of witness items:', numItems);

    if (numItems === 0) {
      throw new Error('Empty witness stack');
    }

    // Read first witness item (the signature)
    const signatureLength = witnessBytes.readUInt8(offset);
    offset += 1;
    console.log('[Bitcoin Signer] Signature length:', signatureLength);

    let signature = witnessBytes.slice(offset, offset + signatureLength);
    console.log('[Bitcoin Signer] Raw signature length:', signature.length);
    console.log('[Bitcoin Signer] Raw signature (hex):', signature.toString('hex'));

    // For Taproot (Schnorr), BIP-322 may include SIGHASH_ALL byte (0x01) at the end
    // Remove it if present
    if (signature.length === 65 && signature[64] === 0x01) {
      console.log('[Bitcoin Signer] Removing SIGHASH_ALL byte');
      signature = signature.slice(0, 64);
    }

    if (signature.length !== 64) {
      throw new Error(`Expected 64-byte Schnorr signature, got ${signature.length}. Raw hex: ${signature.toString('hex')}`);
    }

    console.log('[Bitcoin Signer] Extracted signature:', signature.toString('hex').substring(0, 40) + '...');

    return signature;
  } catch (error) {
    console.error('[Bitcoin Signer] BIP-322 signing failed:', error);
    throw new Error(`BIP-322 signing failed: ${error}`);
  }
};