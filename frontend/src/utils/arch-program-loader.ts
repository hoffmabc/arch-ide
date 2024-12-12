import { Buffer } from 'buffer';
import { ArchConnection, RpcConnection, Message, Instruction, RuntimeTransaction } from '@saturnbtcio/arch-sdk';

declare global {
  interface Window {
    bitcoin: {
      connect: () => Promise<void>;
      sendPayment: (info: {
        network: string;
        address: string;
        amount: bigint;
      }) => Promise<any>;
    };
  }
}

const CHUNK_SIZE = 900;
const SYSTEM_PROGRAM_ID = '0000000000000000000000000000000000000000000000000000000000000001';

interface ArchDeployOptions {
  rpcUrl: string;
  network: string;
  programBinary: Buffer;
  keypair: {
    privkey: string;
    pubkey: string;
    address: string;
  };
  regtestConfig?: {
    url: string;
    username: string;
    password: string;
  };
}

export class ArchProgramLoader {
  static async load(options: ArchDeployOptions) {
    // Create program account
    const createAccountInstruction = await this.createProgramAccountInstruction(
      options.keypair.pubkey,
      options.network,
      options.rpcUrl,
      options.regtestConfig
    );

    const createAccountTxid = await this.sendInstruction(
      options.rpcUrl,
      createAccountInstruction,
      options.keypair
    );

    // Split binary into chunks and upload
    const chunks = this.splitBinaryIntoChunks(options.programBinary);
    const uploadTxids: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const uploadInstruction = this.createUploadInstruction(
        options.keypair.pubkey,
        chunks[i],
        i * CHUNK_SIZE
      );

      const txid = await this.sendInstruction(
        options.rpcUrl,
        uploadInstruction,
        options.keypair
      );
      uploadTxids.push(txid);
    }

    // Make program executable
    const executableInstruction = this.createExecutableInstruction(
      options.keypair.pubkey
    );

    const executableTxid = await this.sendInstruction(
      options.rpcUrl,
      executableInstruction,
      options.keypair
    );

    return {
      programId: options.keypair.pubkey,
      txids: [createAccountTxid, ...uploadTxids, executableTxid]
    };
  }

  private static async createProgramAccountInstruction(
    programId: string,
    network: string,
    rpcUrl: string,
    regtestConfig?: { url: string; username: string; password: string }
  ): Promise<Instruction> {
    const address = await this.getAccountAddress(programId, rpcUrl);
    const { txid, vout } = await this.sendUtxo(address, network, regtestConfig);

    // Create instruction with UTXO info
    const data = Buffer.alloc(37); // 1 byte for variant + 32 bytes txid + 4 bytes vout
    data[0] = 0; // CreateAccount variant

    // Convert txid hex string to bytes and copy to buffer
    Buffer.from(txid, 'hex').copy(data, 1);

    // Write vout as little-endian uint32
    data.writeUInt32LE(vout, 33);

    return {
      program_id: Buffer.from(SYSTEM_PROGRAM_ID, 'hex'),
      accounts: [
        {
          pubkey: Buffer.from(programId, 'hex'),
          is_signer: true,
          is_writable: true
        }
      ],
      data: Buffer.from(data)
    };
  }

  private static async getAccountAddress(pubkey: string, rpcUrl: string): Promise<string> {
    const rpc = new RpcConnection(rpcUrl);
    const pubkeyBuffer = Buffer.from(pubkey, 'hex');
    const address = await rpc.getAccountAddress(pubkeyBuffer);
    return address;
  }

  private static async sendUtxo(
    address: string,
    network: string,
    regtestConfig?: { url: string; username: string; password: string }
  ): Promise<{ txid: string; vout: number }> {
    if (!address) {
      throw new Error('Bitcoin address is required');
    }

    switch (network) {
        case 'devnet': {
            if (!regtestConfig) {
              throw new Error('Regtest configuration required for devnet');
            }

            // Direct call to Bitcoin node with CORS headers
            const response = await fetch(regtestConfig.url + '/wallet/testwallet', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + btoa(`${regtestConfig.username}:${regtestConfig.password}`),
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'arch',
                method: 'sendtoaddress',
                params: [address, 0.00005]
              })
            });

            const { result: txid } = await response.json();

            // Similar modification for getting transaction details
            const txResponse = await fetch(regtestConfig.url + '/wallet/testwallet', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + btoa(`${regtestConfig.username}:${regtestConfig.password}`),
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'arch',
                method: 'getrawtransaction',
                params: [txid, true]
              })
            });

            const { result: tx } = await txResponse.json();
            const vout = tx.vout.findIndex((output: any) => output.scriptPubKey.address === address);

            return { txid, vout };
          }
      case 'testnet':
      case 'mainnet-beta': {
        // For testnet/mainnet, prompt user to send Bitcoin using Sats Connect
        await window.bitcoin.connect();

        // Show modal/UI element asking user to send 5000 sats
        const paymentInfo = {
          network: network === 'testnet' ? 'testnet' : 'mainnet',
          address: address,
          amount: BigInt(5000)
        };

        // Wait for payment confirmation
        await window.bitcoin.sendPayment(paymentInfo);

        // Monitor address for incoming transaction
        return await this.waitForUtxo(address, network);
      }

      default:
        throw new Error(`Unsupported network: ${network}`);
    }
  }

  private static async waitForUtxo(address: string, network: string): Promise<{txid: string, vout: number}> {
    const POLLING_INTERVAL = 5000; // 5 seconds
    const TIMEOUT = 300000; // 5 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < TIMEOUT) {
      const endpoint = network === 'testnet'
        ? `https://mempool.space/testnet/api/address/${address}/utxo`
        : `https://mempool.space/api/address/${address}/utxo`;

      const response = await fetch(endpoint);
      const utxos = await response.json();

      if (utxos.length > 0) {
        return {
          txid: utxos[0].txid,
          vout: utxos[0].vout
        };
      }

      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }

    throw new Error('Timeout waiting for UTXO');
  }

  private static createUploadInstruction(
    programId: string,
    chunk: Buffer,
    offset: number
  ): Instruction {
    const data = Buffer.alloc(1 + chunk.length);
    data[0] = 1; // ExtendBytes variant
    chunk.copy(data, 1);

    return {
      program_id: Buffer.from(SYSTEM_PROGRAM_ID, 'hex'),
      accounts: [
        {
          pubkey: Buffer.from(programId, 'hex'),
          is_signer: true,
          is_writable: true
        }
      ],
      data
    };
  }

  private static createExecutableInstruction(programId: string): Instruction {
    const data = Buffer.alloc(1);
    data[0] = 2; // MakeExecutable variant

    return {
      program_id: Buffer.from(SYSTEM_PROGRAM_ID, 'hex'),
      accounts: [
        {
          pubkey: Buffer.from(programId, 'hex'),
          is_signer: true,
          is_writable: true
        }
      ],
      data
    };
  }

  private static splitBinaryIntoChunks(binary: Buffer): Buffer[] {
    const chunks: Buffer[] = [];
    for (let i = 0; i < binary.length; i += CHUNK_SIZE) {
      chunks.push(binary.slice(i, Math.min(i + CHUNK_SIZE, binary.length)));
    }
    return chunks;
  }

  private static async sendInstruction(
    rpcUrl: string,
    instruction: Instruction,
    keypair: { privkey: string; pubkey: string }
  ): Promise<string> {
    const message: Message = {
      signers: [Buffer.from(keypair.pubkey, 'hex')],
      instructions: [instruction]
    };

    const signature = Buffer.from(keypair.privkey, 'hex');

    const transaction: RuntimeTransaction = {
      version: 0,
      signatures: [signature],
      message
    };

    const rpc = new RpcConnection(rpcUrl);
    return await rpc.sendTransaction(transaction);
  }
}