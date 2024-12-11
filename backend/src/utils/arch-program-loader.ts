import { ArchDeployOptions, Message, Instruction, RuntimeTransaction, DeploymentResult } from './types';
import { createMessage, signMessage, createTransaction, sendTransaction } from './transaction-utils';

const CHUNK_SIZE = 900; // Adjust based on network limits
const SYSTEM_PROGRAM_ID = '0000000000000000000000000000000000000000000000000000000000000001';

export class ArchProgramLoader {
  static async load(options: ArchDeployOptions): Promise<DeploymentResult> {
    console.log('Starting program deployment...', {
      programId: options.keypair.pubkey,
      binarySize: options.programBinary.length
    });

    // Create program account
    console.log('Creating program account...');
    const createAccountInstruction = await this.createProgramAccountInstruction(
      options.keypair.pubkey,
      options.network,
      options.regtestConfig
    );

    const createAccountTxid = await this.sendInstruction(
      options.rpcUrl,
      createAccountInstruction,
      options.keypair
    );
    console.log('Program account created:', { txid: createAccountTxid });

    // Split binary into chunks
    const chunks = this.splitBinaryIntoChunks(options.programBinary);
    console.log(`Split program binary into ${chunks.length} chunks`);
    const uploadTxids: string[] = [];

    // Upload each chunk
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Uploading chunk ${i + 1}/${chunks.length}...`);
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
      console.log(`Chunk ${i + 1} uploaded:`, { txid });
    }

    // Make program executable
    console.log('Setting program as executable...');
    const executableInstruction = this.createExecutableInstruction(
      options.keypair.pubkey
    );

    const executableTxid = await this.sendInstruction(
      options.rpcUrl,
      executableInstruction,
      options.keypair
    );
    console.log('Program set as executable:', { txid: executableTxid });

    const result = {
      programId: options.keypair.pubkey,
      txids: [createAccountTxid, ...uploadTxids, executableTxid]
    };
    console.log('Deployment completed successfully:', result);

    return result;
  }

  private static async createProgramAccountInstruction(
    programId: string,
    network: string,
    regtestConfig?: { url: string; username: string; password: string }
  ): Promise<Instruction> {
    const address = await this.getAccountAddress(programId);
    console.log('Program\'s Bitcoin address:', address);

    const { txid, vout } = await this.sendUtxo(address, network, regtestConfig);

    // Create instruction with UTXO info
    const data = Buffer.alloc(37); // 1 byte for variant + 32 bytes txid + 4 bytes vout
    data[0] = 0; // CreateAccount variant

    // Convert txid hex string to bytes and copy to buffer
    Buffer.from(txid, 'hex').copy(data, 1);

    // Write vout as little-endian uint32
    data.writeUInt32LE(vout, 33);

    return {
      programId: SYSTEM_PROGRAM_ID,
      accounts: [
        {
          pubkey: programId,
          isSigner: true,
          isWritable: true
        }
      ],
      data
    };
  }

  // Helper method to get account address from RPC
  private static async getAccountAddress(pubkey: string): Promise<string> {
    const response = await fetch(NODE_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'id',
        method: 'get_account_address',
        params: [pubkey]
      })
    });

    const result = await response.json();
    return result.result;
  }

  // Helper method to send Bitcoin and get UTXO
  private static async sendUtxo(
    address: string,
    network: string,
    regtestConfig?: { url: string; username: string; password: string }
  ): Promise<{txid: string, vout: number}> {
    switch (network) {
      case 'devnet': {
        if (!regtestConfig) {
          throw new Error('Regtest configuration required for devnet');
        }

        // For devnet/regtest, use provided Bitcoin node configuration
        const response = await fetch(regtestConfig.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + btoa(`${regtestConfig.username}:${regtestConfig.password}`)
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'arch',
            method: 'sendtoaddress',
            params: [address, 0.00005] // 5000 sats
          })
        });

        const { result: txid } = await response.json();

        // Get transaction details to find vout
        const txResponse = await fetch(regtestConfig.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + btoa(`${regtestConfig.username}:${regtestConfig.password}`)
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
      case 'beta': {
        // For testnet/mainnet, prompt user to send Bitcoin using Sats Connect
        const connectResponse = await window.bitcoin.connect();

        // Show modal/UI element asking user to send 5000 sats
        const paymentInfo = {
          network: network === 'testnet' ? 'testnet' : 'mainnet',
          address: address,
          amount: 5000n // 5000 sats
        };

        // Wait for payment confirmation
        const paymentResult = await window.bitcoin.sendPayment(paymentInfo);

        // Monitor address for incoming transaction
        const utxo = await this.waitForUtxo(address, network);

        return {
          txid: utxo.txid,
          vout: utxo.vout
        };
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
      // Query appropriate API based on network
      const endpoint = network === 'testnet'
        ? `https://mempool.space/testnet/api/address/${address}/utxo`
        : `https://mempool.space/api/address/${address}/utxo`;

      const response = await fetch(endpoint);
      const utxos = await response.json();

      if (utxos.length > 0) {
        // Return most recent UTXO
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
    // ExtendBytes variant (1) + chunk data
    const data = Buffer.alloc(1 + chunk.length);
    data[0] = 1; // ExtendBytes variant
    chunk.copy(data, 1);

    return {
      programId: SYSTEM_PROGRAM_ID,
      accounts: [
        {
          pubkey: programId,
          isSigner: true,
          isWritable: true
        }
      ],
      data
    };
  }

  private static createExecutableInstruction(programId: string): Instruction {
    // MakeExecutable variant (2)
    const data = Buffer.alloc(1);
    data[0] = 2; // MakeExecutable variant

    return {
      programId: SYSTEM_PROGRAM_ID,
      accounts: [
        {
          pubkey: programId,
          isSigner: true,
          isWritable: true
        }
      ],
      data
    };
  }

  private static async sendInstruction(
    rpcUrl: string,
    instruction: Instruction,
    keypair: { privkey: string; pubkey: string }
  ): Promise<string> {
    console.log('Sending instruction:', {
      programId: instruction.programId,
      dataLength: instruction.data.length
    });

    const message = createMessage([keypair.pubkey], [instruction]);
    const signature = signMessage(message, keypair.privkey);
    const transaction = createTransaction(message, [signature]);

    try {
      console.log('Sending transaction:', transaction);
      const txid = await sendTransaction(rpcUrl, transaction);
      console.log('Transaction sent successfully:', { txid });
      return txid;
    } catch (error) {
      console.error('Failed to send transaction:', error);
      throw error;
    }
  }

  private static splitBinaryIntoChunks(binary: Buffer): Buffer[] {
    const chunks: Buffer[] = [];
    for (let i = 0; i < binary.length; i += CHUNK_SIZE) {
      chunks.push(binary.slice(i, Math.min(i + CHUNK_SIZE, binary.length)));
    }
    return chunks;
  }
}
