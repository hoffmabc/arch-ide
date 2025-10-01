// src/utils/smartRpcConnection.ts
import { RpcConnection } from '@saturnbtcio/arch-sdk';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// Get URLs from environment or config
export function getSmartRpcUrl(rpcUrl: string): string {
  if (!rpcUrl) {
    console.error('No RPC URL provided');
    return '';
  }

  // Check if this is a localhost URL (from config)
  const isLocalhostUrl = rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1');

  // Check if we're running in localhost dev environment
  const isRunningOnLocalhost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  console.log('Smart RPC URL detection:', {
    rpcUrl,
    isLocalhostUrl,
    isRunningOnLocalhost,
    hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown'
  });

  // If the RPC URL is localhost, use it directly (e.g., local devnet)
  if (isLocalhostUrl) {
    return rpcUrl;
  }

  // For external RPC endpoints (https://):
  // - On localhost dev: Use Vite's /rpc proxy (it handles CORS and forwards to RPC server)
  // - On deployed: Use backend API /rpc proxy
  if (isRunningOnLocalhost) {
    console.log('Using Vite dev proxy: /rpc');
    return '/rpc';
  } else {
    console.log(`Using backend proxy: ${API_URL}/rpc`);
    return `${API_URL}/rpc`;
  }
}

export function createSmartRpcConnection(baseUrl: string): RpcConnection {
  const smartUrl = getSmartRpcUrl(baseUrl);
  return new RpcConnection(smartUrl);
}