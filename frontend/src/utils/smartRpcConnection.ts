// src/utils/smartRpcConnection.ts
import { RpcConnection } from '@saturnbtcio/arch-sdk';

// Get URLs from environment or config
export function getSmartRpcUrl(rpcUrl: string): string {
  if (!rpcUrl) {
    console.error('No RPC URL provided');
    return '';
  }

  // Check if we're running on Vercel
  const isVercel = typeof window !== 'undefined' &&
    window.location.hostname.includes('vercel.app');

  // Check if this is a localhost URL
  const isLocalhostUrl = rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1');

  // If we're on Vercel and trying to access localhost
  if (isVercel && isLocalhostUrl) {
    console.warn('Cannot access localhost from Vercel deployment');
    // Return empty to trigger proper error handling rather than falling back to hardcoded URL
    return '';
  }

  // For local development with local URLs
  if (window.location.hostname === 'localhost') {
    if (rpcUrl.startsWith('http://localhost') || rpcUrl === '/rpc') {
      return '/rpc';
    }
  }

  // For external URLs on Vercel, use the API proxy to avoid CORS issues
  if (isVercel && !isLocalhostUrl) {
    return `/api/proxy?url=${encodeURIComponent(rpcUrl)}`;
  }

  // Otherwise use the original URL
  return rpcUrl;
}

export function createSmartRpcConnection(baseUrl: string): RpcConnection {
  const smartUrl = getSmartRpcUrl(baseUrl);
  return new RpcConnection(smartUrl);
}