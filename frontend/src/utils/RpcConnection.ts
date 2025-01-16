export class RpcConnection {
    constructor(private rpcUrl: string) {}

    async request(method: string, params: any[] = []) {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        throw new Error(data.error.message || 'RPC error');
      }

      return data.result;
    }
  }