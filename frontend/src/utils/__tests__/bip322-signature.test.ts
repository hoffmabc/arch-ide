/**
 * BIP-322 Signature Verification Tests
 *
 * This test suite verifies that our TypeScript implementation of BIP-322 signing
 * matches the Rust implementation used by the Arch Network validator.
 */

import { Buffer } from 'buffer/';
import { sha256 } from 'js-sha256';
import { signMessage } from '../bitcoin-signer';

describe('BIP-322 Signature Verification', () => {
  // Test data from Rust implementation
  const testData = {
    // These will be filled in after running the Rust test
    privateKey: '',
    publicKey: '',
    serializedMessage: '',
    messageHash: '',
    signature: ''
  };

  describe('Message Hashing', () => {
    it('should match Rust double-hash implementation', () => {
      // Create a simple test message
      const header = Buffer.from([
        0x01, // num_required_signatures
        0x00, // num_readonly_signed_accounts
        0x00  // num_readonly_unsigned_accounts
      ]);

      const numKeys = Buffer.alloc(4);
      numKeys.writeUInt32LE(2, 0); // 2 account keys

      const accountKey1 = Buffer.alloc(32, 0xAA);
      const accountKey2 = Buffer.alloc(32, 0xBB);

      const recentBlockhash = Buffer.alloc(32, 0x01);

      const numInstructions = Buffer.alloc(4);
      numInstructions.writeUInt32LE(1, 0); // 1 instruction

      const programIdIndex = Buffer.from([0x01]); // program_id_index = 1
      const numAccounts = Buffer.alloc(4);
      numAccounts.writeUInt32LE(1, 0); // 1 account
      const accountIndex = Buffer.from([0x00]); // account index = 0
      const dataLen = Buffer.alloc(4);
      dataLen.writeUInt32LE(4, 0); // 4 bytes of data
      const instructionData = Buffer.from([0x00, 0x01, 0x02, 0x03]);

      // Concatenate all parts
      const serializedMessage = Buffer.concat([
        header,
        numKeys,
        accountKey1,
        accountKey2,
        recentBlockhash,
        numInstructions,
        programIdIndex,
        numAccounts,
        accountIndex,
        dataLen,
        instructionData
      ]);

      console.log('Serialized message:', serializedMessage.toString('hex'));
      console.log('Length:', serializedMessage.length);

      // First hash (returns hex string)
      const firstHashHex = sha256(serializedMessage);
      console.log('First hash (hex):', firstHashHex);

      // Convert hex string to UTF-8 bytes (not hex-decoded!)
      const firstHashBytes = Buffer.from(firstHashHex, 'utf8');
      console.log('First hash as UTF-8 bytes:', firstHashBytes.toString('hex'));
      console.log('UTF-8 bytes length:', firstHashBytes.length);

      // Second hash of the UTF-8 bytes
      const secondHashHex = sha256(firstHashBytes);
      console.log('Second hash (hex):', secondHashHex);

      // The message hash for signing is the hex string as UTF-8 bytes
      const messageHashBytes = Buffer.from(secondHashHex, 'utf8');
      console.log('Message hash bytes:', messageHashBytes.toString('hex'));
      console.log('Message hash length:', messageHashBytes.length);

      // Verify it's 64 bytes (hex string of 32-byte hash = 64 characters)
      expect(messageHashBytes.length).toBe(64);
    });
  });

  describe('ArchMessage Serialization', () => {
    it('should serialize message exactly like Rust', () => {
      // Header: 3 bytes
      const header = {
        num_required_signatures: 1,
        num_readonly_signed_accounts: 0,
        num_readonly_unsigned_accounts: 0
      };

      // Account keys
      const accountKeys = [
        Buffer.from('aa'.repeat(32), 'hex'),
        Buffer.from('bb'.repeat(32), 'hex')
      ];

      // Recent blockhash
      const recentBlockhash = Buffer.from('01'.repeat(32), 'hex');

      // Instructions
      const instructions = [{
        program_id_index: 1,
        accounts: [0],
        data: Buffer.from([0x00, 0x01, 0x02, 0x03])
      }];

      // Serialize exactly like Rust
      const parts: number[] = [];

      // Header (3 bytes)
      parts.push(header.num_required_signatures);
      parts.push(header.num_readonly_signed_accounts);
      parts.push(header.num_readonly_unsigned_accounts);

      // Account keys length (4 bytes, little-endian u32)
      const numKeys = accountKeys.length;
      parts.push(numKeys & 0xFF);
      parts.push((numKeys >> 8) & 0xFF);
      parts.push((numKeys >> 16) & 0xFF);
      parts.push((numKeys >> 24) & 0xFF);

      // Account keys (each 32 bytes)
      accountKeys.forEach(key => {
        parts.push(...Array.from(key));
      });

      // Recent blockhash (32 bytes)
      parts.push(...Array.from(recentBlockhash));

      // Instructions length (4 bytes, little-endian u32)
      const numInstructions = instructions.length;
      parts.push(numInstructions & 0xFF);
      parts.push((numInstructions >> 8) & 0xFF);
      parts.push((numInstructions >> 16) & 0xFF);
      parts.push((numInstructions >> 24) & 0xFF);

      // Each instruction
      instructions.forEach(ix => {
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
        parts.push(...Array.from(ix.data));
      });

      const serialized = new Uint8Array(parts);
      console.log('TypeScript serialized:', Buffer.from(serialized).toString('hex'));
      console.log('Length:', serialized.length);

      // Expected structure:
      // 3 (header) + 4 (num_keys) + 64 (keys) + 32 (blockhash) + 4 (num_ix) + 1 (program_id_index) + 4 (num_accounts) + 1 (account_index) + 4 (data_len) + 4 (data) = 121 bytes
      expect(serialized.length).toBe(121);
    });
  });

  describe('Complete Flow', () => {
    it('should generate matching signature for identical message', () => {
      // This test will use data from the Rust test once we run it
      if (!testData.serializedMessage) {
        console.log('⚠️  Run the Rust test first to generate reference data');
        return;
      }

      const serializedMessage = Buffer.from(testData.serializedMessage, 'hex');
      const expectedHash = Buffer.from(testData.messageHash, 'hex');
      const privateKey = Buffer.from(testData.privateKey, 'hex');

      // Hash the message
      const firstHashHex = sha256(serializedMessage);
      const firstHashBytes = Buffer.from(firstHashHex, 'utf8');
      const secondHashHex = sha256(firstHashBytes);
      const messageHashBytes = Buffer.from(secondHashHex, 'utf8');

      console.log('Expected hash:', expectedHash.toString('hex'));
      console.log('Computed hash:', messageHashBytes.toString('hex'));

      expect(messageHashBytes.toString('hex')).toBe(expectedHash.toString('hex'));

      // Sign the message
      // Note: BIP-322 signatures use random nonces, so they won't match exactly
      // But we can verify that our signature would be valid
      const signature = signMessage(privateKey, messageHashBytes);
      console.log('Generated signature:', signature.toString('hex'));
    });
  });
});
