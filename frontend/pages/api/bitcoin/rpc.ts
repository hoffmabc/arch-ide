import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, username, password, method, params } = req.body;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'arch',
        method,
        params
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Bitcoin RPC error:', error);
    res.status(500).json({ error: 'Failed to connect to Bitcoin node' });
  }
}