import type { Config } from '../../types/config';

export async function bitcoinRpcRequest(
  config: { url: string; username: string; password: string },
  method: string,
  params: any[] = [],
  wallet?: string
) {
  try {
    console.log('wallet', wallet);
    console.log('config', config);
    const response = await fetch('http://localhost:8010/proxy', {
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
      throw new Error(data.error.message || 'Bitcoin RPC error');
    }

    return data;
  } catch (error) {
    console.error('Bitcoin RPC error:', error);
    throw error;
  }
}