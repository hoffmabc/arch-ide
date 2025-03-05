// src/utils/smartRpcConnection.ts
import { RpcConnection } from '@saturnbtcio/arch-sdk';

// Get URLs from environment or config
export function getSmartRpcUrl(rpcUrl: string): string {
  if (!rpcUrl) {
    console.error('No RPC URL provided');
    return '';
  }

  // Check if we're running on production (non-localhost)
  const isProduction = typeof window !== 'undefined' &&
    !window.location.hostname.includes('localhost') &&
    !window.location.hostname.includes('127.0.0.1');

  // Check if this is a localhost URL
  const isLocalhostUrl = rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1');

  console.log('Smart RPC URL detection:', {
    rpcUrl,
    isProduction,
    isLocalhostUrl,
    hostname: window.location.hostname
  });

  // For production environment, use direct URLs
  if (isProduction) {
    return rpcUrl;
  }

  // For local development
  if (!isProduction) {
    // If it's already a localhost URL, use it directly
    if (isLocalhostUrl) {
      return rpcUrl;
    }

    // For external URLs in local development, use the proxy
    return `/api/proxy?url=${encodeURIComponent(rpcUrl)}`;
  }

  return rpcUrl;
}

export function createSmartRpcConnection(baseUrl: string): RpcConnection {
  const smartUrl = getSmartRpcUrl(baseUrl);
  return new RpcConnection(smartUrl);
}