/**
 * Faucet utility for requesting testnet/devnet funds
 * This utility helps fund accounts on Arch Network test environments
 *
 * NOTE: create_account_with_faucet returns a partially-signed transaction
 * that requires the user's signature before submission. For wallet-based
 * accounts (where we don't have the private key), we cannot complete this
 * transaction automatically.
 */

export interface FaucetRequestOptions {
  pubkey: string; // Hex string
  rpcUrl: string;
  network: 'testnet' | 'devnet';
  privkey?: string; // Optional: hex string of private key for auto-signing
}

export interface FaucetResponse {
  success: boolean;
  txid?: string;
  error?: string;
  message?: string;
  requiresSignature?: boolean;
  partialTransaction?: any;
}

/**
 * Request funds from the Arch Network faucet
 *
 * NOTE: For wallet accounts (without privkey), this will return a partially-signed
 * transaction that needs to be signed by the wallet. For keypair accounts (with privkey),
 * this will complete the signing and submission automatically.
 *
 * @param options - Configuration for the faucet request
 * @returns FaucetResponse with success status and optional txid/error
 */
export async function requestFaucetFunds(
  options: FaucetRequestOptions
): Promise<FaucetResponse> {
  const { pubkey, rpcUrl, network, privkey } = options;

  // Validate network
  if (network !== 'testnet' && network !== 'devnet') {
    return {
      success: false,
      error: 'Faucet only available on testnet and devnet'
    };
  }

  try {
    // Convert hex pubkey to byte array
    const pubkeyBytes = [];
    for (let i = 0; i < pubkey.length; i += 2) {
      pubkeyBytes.push(parseInt(pubkey.slice(i, i + 2), 16));
    }

    // Prepare RPC payload
    const payload = {
      jsonrpc: '2.0',
      id: 'faucet-request-' + Date.now(),
      method: 'create_account_with_faucet',
      params: pubkeyBytes,
    };

    console.log('[Faucet] Requesting funds for pubkey:', pubkey.slice(0, 16) + '...');
    console.log('[Faucet] Using RPC URL:', rpcUrl);

    // Make the request
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP error: ${response.status} ${response.statusText}`
      };
    }

    const result = await response.json();

    // Handle RPC errors
    if (result.error) {
      const errorMessage = result.error.message || JSON.stringify(result.error);

      // Check for specific error cases
      if (errorMessage.includes('already exists') ||
          errorMessage.includes('already has funds') ||
          errorMessage.includes('account is already initialized')) {
        return {
          success: true,
          message: 'Account already has funds',
          error: errorMessage
        };
      }

      return {
        success: false,
        error: errorMessage
      };
    }

    const runtimeTx = result.result;

    // If we have a private key, sign and submit the transaction
    if (privkey && runtimeTx) {
      console.log('[Faucet] Completing transaction with provided private key...');

      // Import the reusable transaction signer
      const { signAndSubmitFaucetTransaction } = await import('./transaction-signer');

      try {
        const keypair = { privkey, pubkey };
        const txid = await signAndSubmitFaucetTransaction(runtimeTx, keypair, rpcUrl);

        return {
          success: true,
          message: 'Funds requested and transaction submitted',
          txid
        };
      } catch (signError: any) {
        console.error('[Faucet] Failed to sign/submit transaction:', signError);
        return {
          success: false,
          error: `Failed to complete transaction: ${signError.message}`,
          partialTransaction: runtimeTx
        };
      }
    }

    // If no private key provided (wallet scenario), return info about partial transaction
    console.log('[Faucet] No private key provided - wallet signing required');

    return {
      success: false,
      requiresSignature: true,
      message: 'Transaction requires wallet signature',
      error: 'For wallet accounts, the transaction must be signed through the wallet interface. This faucet method requires a keypair with private key access.',
      partialTransaction: runtimeTx
    };

  } catch (error: any) {
    console.error('[Faucet] Request failed:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}

/**
 * Check if faucet is available for the given network
 */
export function isFaucetAvailable(network: string): boolean {
  return network === 'testnet' || network === 'devnet';
}
