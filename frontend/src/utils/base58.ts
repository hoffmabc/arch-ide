import bs58 from 'bs58';

/**
 * Convert a hex string to base58 encoding (Solana/Arch format)
 */
export function hexToBase58(hex: string): string {
  try {
    const buffer = Buffer.from(hex, 'hex');
    return bs58.encode(buffer);
  } catch (error) {
    console.error('Failed to convert hex to base58:', error);
    return hex; // Fallback to original hex if conversion fails
  }
}

/**
 * Convert base58 to hex string
 */
export function base58ToHex(base58: string): string {
  try {
    const buffer = bs58.decode(base58);
    return Buffer.from(buffer).toString('hex');
  } catch (error) {
    console.error('Failed to convert base58 to hex:', error);
    return base58; // Fallback to original if conversion fails
  }
}
