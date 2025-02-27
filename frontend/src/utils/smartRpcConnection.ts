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

  // For special case with /rpc endpoint
  if (rpcUrl === '/rpc') {
    // Always use the /rpc endpoint without redirecting
    // This relies on the vercel.json rewrite
    return '/rpc';
  }

  // For local development with other localhost URLs
  if (!isProduction && isLocalhostUrl) {
    // Keep using /rpc for localhost URLs
    return '/rpc';
  }

  // For external URLs on production, use the API proxy to avoid CORS issues
  if (isProduction) {
    // Don't try to proxy localhost URLs in production
    if (isLocalhostUrl) {
      console.warn('Cannot access localhost from production deployment');
      // Return the built-in /rpc endpoint which will use the default URL
      return '/rpc';
    }

    // For external URLs, use our proxy
    return `/api/proxy?url=${encodeURIComponent(rpcUrl)}`;
  }

  // For local development with external URLs
  // We can either proxy through the local server or just use it directly
  // For most reliable behavior, let's proxy it
  if (!isProduction && !isLocalhostUrl) {
    return `/api/proxy?url=${encodeURIComponent(rpcUrl)}`;
  }

  // Otherwise use the original URL
  return rpcUrl;
}

export function createSmartRpcConnection(baseUrl: string): RpcConnection {
  const smartUrl = getSmartRpcUrl(baseUrl);
  return new RpcConnection(smartUrl);
}