// src/utils/smartRpcConnection.ts
import { RpcConnection } from '@saturnbtcio/arch-sdk';

export function getSmartRpcUrl(baseUrl: string): string {
  // If we're in development (localhost) and the URL is not already a localhost URL
  if (window.location.hostname === 'localhost' && !baseUrl.includes('localhost')) {
    // Use the proxy with the target parameter
    return `/rpc?target=${encodeURIComponent(baseUrl)}`;
  }

  // For localhost URLs, use them directly or through the /rpc endpoint
  if (baseUrl.includes('localhost')) {
    // Check if we need to use the proxy (if cross-origin)
    const baseUrlHost = new URL(baseUrl).hostname;
    if (baseUrlHost !== window.location.hostname) {
      return `/rpc?target=${encodeURIComponent(baseUrl)}`;
    }
  }

  // For all other cases, use the URL directly
  return baseUrl;
}

export function createSmartRpcConnection(baseUrl: string): RpcConnection {
  const smartUrl = getSmartRpcUrl(baseUrl);
  return new RpcConnection(smartUrl);
}