# BIP-322 Signature Fix Summary

## Problem
Program deployment in the UI was failing with:
```
BIP-322 verification failed: Invalid signature
```

## Root Cause Analysis

### 1. Incorrect Message Hashing
The message hash for signing was being incorrectly converted:
- **Wrong**: Converting hex string to 32 bytes (`Buffer.from(hashHex, 'hex')`)
- **Correct**: Treating hex string as UTF-8 bytes (64 bytes: `Buffer.from(hashHex, 'utf8')`)

### 2. Raw Schnorr Instead of BIP-322
The TypeScript was using raw Schnorr signing, but the validator expects proper BIP-322 signatures:
- **Wrong**: Direct `ecc.signSchnorr(messageHash, privateKey)`
- **Correct**: BIP-322 signature over virtual transactions with SIGHASH_ALL

### 3. Missing SIGHASH_ALL
The signing wasn't using the correct sighash type:
- **Wrong**: `SIGHASH_DEFAULT`
- **Correct**: `SIGHASH_ALL`

## Changes Made

### 1. `frontend/src/utils/arch-sdk-deployer.ts` (Lines 715-737)
**Fixed message hashing:**
```typescript
// The final hash is the HEX STRING itself converted to UTF-8 bytes (NOT hex-decoded)
const firstHashHex = sha256(Buffer.from(serializedMessage));
const firstHashBytes = Buffer.from(firstHashHex, 'utf8');  // UTF-8 bytes of hex string
const secondHashHex = sha256(firstHashBytes);

// CRITICAL: 64-byte UTF-8 representation, not 32-byte hash
const messageHashBytes = Buffer.from(secondHashHex, 'utf8');
```

### 2. `frontend/src/utils/bitcoin-signer.ts` (Complete rewrite)
**Implemented proper BIP-322 signing:**
```typescript
// Step 1: Create "to_spend" transaction (embeds message in OP_RETURN)
const toSpendScript = Bitcoin.script.compile([
  Bitcoin.opcodes.OP_0,
  Bitcoin.crypto.sha256(Buffer.concat([
    Buffer.from('BIP0322-signed-message', 'utf8'),
    messageBytes
  ]))
]);

// Step 2: Create "to_sign" transaction (spends to_spend output)
const toSignTx = new Bitcoin.Transaction();
toSignTx.addInput(Buffer.from(toSpendTx.getId(), 'hex').reverse(), 0, 0);
toSignTx.addOutput(Buffer.from('6a', 'hex'), 0);

// Step 3: Sign with SIGHASH_ALL using tweaked Taproot key
const sighash = toSignTx.hashForWitnessV1(
  0,
  [p2tr.output!],
  [0],
  Bitcoin.Transaction.SIGHASH_ALL  // ← Critical: Use SIGHASH_ALL
);

const tweakedPrivkey = ecc.privateAdd(privateKey, Bitcoin.crypto.taggedHash('TapTweak', xOnlyPubkey));
const signature = Buffer.from(ecc.signSchnorr(sighash, tweakedPrivkey));
```

## Verification

### Rust Test Output
Created test in `arch-network/sdk/src/helper/test_bip322_debug.rs` that confirms:
- Message serialization: ✅ 121 bytes
- Message hash: ✅ 64 bytes (UTF-8 hex string)
- Signature: ✅ 64 bytes
- Verification: ✅ **Successful with `uses_sighash_all: true`**

### TypeScript Test Output
Test in `frontend/src/utils/__tests__/test-bip322.ts` confirms:
- Message hashing: ✅ Matches Rust exactly
- Signature generation: ✅ 64-byte signatures
- BIP-322 implementation: ✅ Complete

## How It Works

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Message Serialization (ArchMessage)                           │
│    → 121 bytes                                                    │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. Double Hash                                                    │
│    SHA256(serialized) → hex string (64 chars)                   │
│    → Convert to UTF-8 bytes (64 bytes)                          │
│    SHA256(utf8_bytes) → hex string (64 chars)                   │
│    → Convert to UTF-8 bytes (64 bytes) ← This is what we sign! │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. BIP-322 Signing                                                │
│    a) Create to_spend tx (embeds message in OP_RETURN)           │
│    b) Create to_sign tx (spends to_spend)                        │
│    c) Calculate Taproot sighash with SIGHASH_ALL                 │
│    d) Tweak private key                                           │
│    e) Sign with Schnorr → 64-byte signature                      │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. Validator Verification                                         │
│    a) Try verify with uses_sighash_all: false                     │
│    b) If fails, try with uses_sighash_all: true ← This succeeds!│
└──────────────────────────────────────────────────────────────────┘
```

## Testing the Fix

1. **Try deploying a program from the UI**
2. **Check browser console for logs:**
   - Look for `[Build Transaction] Message hash length: 64`
   - Look for `[Bitcoin Signer] Schnorr signature: ...`

3. **If it still fails:**
   - Check the exact error message
   - Compare serialized message with Rust reference
   - Verify the public key derivation matches

## Key Insights

1. **UTF-8 vs Hex**: The Rust code treats the hash **as a string**, converting it to UTF-8 bytes (64 bytes), NOT hex-decoding it to 32 bytes

2. **BIP-322 != Raw Schnorr**: BIP-322 creates virtual transactions and signs those, not just the raw message

3. **SIGHASH_ALL is required**: The validator expects signatures with SIGHASH_ALL, verified with `uses_sighash_all: true`

4. **Random Nonces**: BIP-322 signatures will differ each time (by design), so we can't compare exact signature values

## Critical Bug Fixed (Update 2)

### Duplicate Signature Issue

**Problem:** When using the same keypair for both program and authority, the code generated **2 identical signatures**, but `ArchMessage::new` deduplicates account keys, resulting in only **1 pubkey**. This caused:
- `num_required_signatures: 2`
- `account_keys.length: 1` (only unique pubkeys)
- `signatures.length: 2` (duplicate!)
- **Validator rejected:** Expected signature count to match unique signers

**Solution:** Deduplicate signers before generating signatures:

```typescript
// Deduplicate signers based on pubkey to match account_keys deduplication
const uniqueSigners = Array.from(
  new Map(signers.map(s => [s.pubkey, s])).values()
);

// Now we generate only unique signatures
const signatures = uniqueSigners.map(signer =>
  this.signMessage(signer, messageHashBytes)
);
```

This matches the Rust behavior where `CompiledKeys::compile` automatically deduplicates pubkeys, and `build_and_sign_transaction` only generates signatures for unique keypairs.

## Next Steps

**Try deploying again!** The fixes include:
1. ✅ Correct message hashing (64-byte UTF-8)
2. ✅ Proper BIP-322 signing with SIGHASH_ALL
3. ✅ Signer deduplication to match account_keys

If it still fails:
1. Check browser console logs for the new deduplication messages
2. Verify `num_required_signatures` matches `signatures.length`
3. Compare full transaction structure with working Rust example
