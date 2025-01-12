import type { Config } from '../../types/config';

export async function bitcoinRpcRequest(
  config: { url: string; username: string; password: string },
  method: string,
  params: any[] = [],
  wallet?: string
) {
  try {
    const baseUrl = 'http://localhost:8010/proxy';
    const url = wallet ? `${baseUrl}/wallet/${wallet}` : baseUrl;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
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
      // Check if wallet needs to be loaded
      if (wallet && data.error.message.includes('not loaded')) {
        // Try to load wallet
        await fetch(baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + btoa(`${config.username}:${config.password}`)
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'arch',
            method: 'loadwallet',
            params: [wallet]
          })
        });

        // Retry original request
        return bitcoinRpcRequest(config, method, params, wallet);
      }
      throw new Error(data.error.message || 'Bitcoin RPC error');
    }

    return data;
  } catch (error) {
    console.error('Bitcoin RPC error:', error);
    throw error;
  }
}