// Test program to generate reference BIP-322 signatures for comparison with TypeScript
use arch_program::hash::Hash;
use arch_program::pubkey::Pubkey;
use arch_program::sanitized::{ArchMessage, MessageHeader, SanitizedInstruction};
use arch_sdk::helper::sign_message_bip322;
use bitcoin::key::{Keypair, UntweakedKeypair};
use bitcoin::secp256k1::Secp256k1;
use bitcoin::Network;
use std::str::FromStr;

pub fn test_message_hashing() {
    println!("=== Testing ArchMessage Hashing ===\n");

    // Create a test keypair
    let secp = Secp256k1::new();
    let (secret_key, _public_key) = secp.generate_keypair(&mut rand::thread_rng());
    let keypair = UntweakedKeypair::from_secret_key(&secp, &secret_key);
    let xpubkey = keypair.x_only_public_key().0;
    let pubkey = Pubkey::from_slice(&xpubkey.serialize());

    println!("Test Keypair:");
    println!("  Private key: {}", hex::encode(secret_key.secret_bytes()));
    println!("  Public key: {}", hex::encode(pubkey.serialize()));
    println!();

    // Create a simple test message
    let recent_blockhash = Hash::from([1u8; 32]);
    let program_id = Pubkey::from([2u8; 32]);
    let instruction_data = vec![0x00, 0x01, 0x02, 0x03];

    let message = ArchMessage {
        header: MessageHeader {
            num_required_signatures: 1,
            num_readonly_signed_accounts: 0,
            num_readonly_unsigned_accounts: 0,
        },
        account_keys: vec![pubkey, program_id],
        recent_blockhash,
        instructions: vec![SanitizedInstruction {
            program_id_index: 1,
            accounts: vec![0],
            data: instruction_data.clone(),
        }],
    };

    // Serialize the message
    let serialized = message.serialize();
    println!("Serialized message ({} bytes):", serialized.len());
    println!("  Hex: {}", hex::encode(&serialized));
    println!();

    // Hash the message
    let message_hash = message.hash();
    println!("Message hash ({} bytes):", message_hash.len());
    println!("  Hex: {}", hex::encode(&message_hash));
    println!();

    // Let's manually show the double-hash process
    let first_hash_hex = sha256::digest(&serialized);
    println!("First hash (hex string): {}", first_hash_hex);

    let first_hash_bytes = first_hash_hex.as_bytes();
    println!("First hash as UTF-8 bytes ({} bytes): {}", first_hash_bytes.len(), hex::encode(first_hash_bytes));

    let second_hash_hex = sha256::digest(first_hash_bytes);
    println!("Second hash (hex string): {}", second_hash_hex);

    let second_hash_bytes = second_hash_hex.as_bytes();
    println!("Second hash as UTF-8 bytes ({} bytes): {}", second_hash_bytes.len(), hex::encode(second_hash_bytes));
    println!();

    // Sign the message
    let signature = sign_message_bip322(&keypair, &message_hash, Network::Testnet);
    println!("BIP-322 Signature:");
    println!("  Hex: {}", hex::encode(&signature));
    println!();

    // Verify the signature
    match arch_sdk::verify_message_bip322(
        &message_hash,
        pubkey.serialize(),
        signature,
        false,
        Network::Testnet,
    ) {
        Ok(_) => println!("✓ Signature verification successful!"),
        Err(e) => println!("✗ Signature verification failed: {}", e),
    }
    println!();

    // Output JSON for TypeScript testing
    println!("JSON Test Data:");
    println!("{{");
    println!("  \"privateKey\": \"{}\",", hex::encode(secret_key.secret_bytes()));
    println!("  \"publicKey\": \"{}\",", hex::encode(pubkey.serialize()));
    println!("  \"serializedMessage\": \"{}\",", hex::encode(&serialized));
    println!("  \"messageHash\": \"{}\",", hex::encode(&message_hash));
    println!("  \"signature\": \"{}\"", hex::encode(&signature));
    println!("}}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_test() {
        test_message_hashing();
    }
}
