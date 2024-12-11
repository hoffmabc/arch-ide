import { sign } from '@bitcoinerlab/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { RuntimeTransaction, Message, Instruction } from './types';

export function createMessage(signers: string[], instructions: Instruction[]): Message {
  return {
    signers,
    instructions
  };
}

export function signMessage(message: Message, privateKey: string): string {
  const messageHash = sha256(Buffer.from(JSON.stringify(message)));
  const signature = sign(messageHash, Buffer.from(privateKey, 'hex'));
  return Buffer.from(signature).toString('hex');
}

export function createTransaction(
  message: Message,
  signatures: string[]
): RuntimeTransaction {
  return {
    version: 0,
    signatures,
    message
  };
}

export async function sendTransaction(
  rpcUrl: string,
  transaction: RuntimeTransaction
): Promise<string> {
  const response = await fetch(`${rpcUrl}/send_transaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(transaction),
  });

  if (!response.ok) {
    throw new Error(`Failed to send transaction: ${await response.text()}`);
  }

  return response.text();
}
