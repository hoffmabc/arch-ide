import type { Config } from '../../types/config';

export async function bitcoinRpcRequest(config: Config, method: string, params: any[] = []) {
  try {
    const response = await fetch('/api/bitcoin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'arch',
        method,
        params
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || 'Bitcoin RPC error');
    }

    return data;
  } catch (error) {
    console.error('Bitcoin RPC error:', error);
    throw error;
  }
}