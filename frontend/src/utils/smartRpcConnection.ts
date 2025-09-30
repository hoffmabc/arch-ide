// src/utils/smartRpcConnection.ts
import { RpcConnection } from '@saturnbtcio/arch-sdk';

// Get URLs from environment or config
export function getSmartRpcUrl(rpcUrl: string): string {
  if (!rpcUrl) {
    console.error('No RPC URL provided');
    return '';
  }

  // Check if this is a localhost URL
  const isLocalhostUrl = rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1');

  // Check if this is an external HTTPS URL
  const isExternalHttps = rpcUrl.startsWith('https://');

  console.log('Smart RPC URL detection:', {
    rpcUrl,
    isLocalhostUrl,
    isExternalHttps,
    hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown'
  });

  // Always use localhost URLs directly
  if (isLocalhostUrl) {
    return rpcUrl;
  }

  // Always use external HTTPS URLs directly (they have CORS configured)
  if (isExternalHttps) {
    return rpcUrl;
  }

  // For other cases (http external URLs), we might need a proxy
  // but for now, try direct connection
  return rpcUrl;
}

export function createSmartRpcConnection(baseUrl: string): RpcConnection {
  const smartUrl = getSmartRpcUrl(baseUrl);
  return new RpcConnection(smartUrl);
}