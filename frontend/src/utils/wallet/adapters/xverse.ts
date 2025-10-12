// Xverse Wallet Adapter
import { request, AddressPurpose } from 'sats-connect';
import { BitcoinWalletAdapter, BitcoinWalletAccount, SignMessageResponse, SendBitcoinResponse } from '../../../types/wallet';

export class XverseWalletAdapter implements BitcoinWalletAdapter {
  name = 'Xverse';
  icon = 'https://xverse.app/logo.svg';
  connected = false;
  connecting = false;
  accounts: BitcoinWalletAccount[] = [];
  network?: 'mainnet' | 'testnet' | 'regtest';

  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.XverseProviders?.BitcoinProvider;
  }

  async connect(targetNetwork?: 'mainnet' | 'testnet' | 'regtest'): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Xverse wallet not installed. Please install from https://www.xverse.app');
    }

    try {
      this.connecting = true;

      // Map network names for Xverse
      let xverseNetwork = 'Mainnet';
      if (targetNetwork === 'testnet') {
        xverseNetwork = 'Testnet4'; // Xverse uses Testnet4
        this.network = 'testnet';
      } else if (targetNetwork === 'mainnet') {
        xverseNetwork = 'Mainnet';
        this.network = 'mainnet';
      }

      console.log(`[Xverse] Connecting to ${xverseNetwork} with Taproot addresses...`);

      // Use sats-connect library to connect
      // Request Ordinals purpose which gives Taproot (P2TR) addresses for Schnorr signatures
      const response = await request('wallet_connect', {
        addresses: [AddressPurpose.Ordinals], // Ordinals addresses are Taproot
        message: 'Connect to Arch IDE',
        network: xverseNetwork as any
      });

      console.log('[Xverse] Connection response:', response);

      if (response.status === 'error') {
        throw new Error(response.error?.message || 'Failed to connect to Xverse wallet');
      }

      if (response.status !== 'success' || !response.result?.addresses) {
        throw new Error('No addresses received from Xverse wallet');
      }

      // Find the ordinals address (Taproot/P2TR for Schnorr signatures)
      const ordinalsAddress = response.result.addresses.find(
        (addr: any) => addr.purpose === AddressPurpose.Ordinals
      );

      if (!ordinalsAddress) {
        throw new Error('No ordinals address found in Xverse wallet');
      }

      // Xverse ordinals addresses are P2TR (Taproot) with Schnorr signatures
      this.accounts = [{
        address: ordinalsAddress.address,
        publicKey: ordinalsAddress.publicKey,
        type: 'p2tr' // Taproot
      }];

      console.log(`[Xverse] Successfully connected to ${xverseNetwork}:`, {
        address: this.accounts[0].address,
        type: this.accounts[0].type,
        network: this.network
      });

      this.connected = true;
      this.connecting = false;
    } catch (error: any) {
      this.connecting = false;
      this.connected = false;
      console.error('[Xverse] Connection error:', error);

      // Provide user-friendly error messages
      if (error.message?.includes('User rejected')) {
        throw new Error('Connection rejected. Please approve the connection in your Xverse wallet.');
      }

      throw error;
    }
  }

  async switchNetwork(network: 'mainnet' | 'testnet'): Promise<void> {
    // Xverse doesn't have a direct switchNetwork method
    // User needs to disconnect and reconnect with the new network
    throw new Error('Please disconnect and reconnect to switch networks in Xverse');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.accounts = [];
  }

  async getAccounts(): Promise<BitcoinWalletAccount[]> {
    if (!this.connected) {
      throw new Error('Xverse wallet not connected');
    }

    // Return already connected accounts
    return this.accounts;
  }

  async signMessage(message: string): Promise<SignMessageResponse> {
    if (!this.connected || !this.isAvailable()) {
      throw new Error('Wallet not connected');
    }

    try {
      // Use BIP-322 for Taproot addresses to get Schnorr signatures
      const response = await request('signMessage', {
        address: this.accounts[0].address,
        message,
        protocol: 'BIP322' as any // Explicitly request BIP-322 for Taproot/Schnorr signatures
      });

      if (response.status === 'error') {
        throw new Error(response.error?.message || 'Failed to sign message');
      }

      return {
        signature: response.result.signature,
        address: this.accounts[0].address
      };
    } catch (error: any) {
      throw new Error(`Failed to sign message: ${error.message}`);
    }
  }

  async sendBitcoin(toAddress: string, amount: number): Promise<SendBitcoinResponse> {
    if (!this.connected || !this.isAvailable()) {
      throw new Error('Wallet not connected');
    }

    try {
      const response = await request('sendTransfer', {
        recipients: [
          {
            address: toAddress,
            amount: amount
          }
        ]
      });

      if (response.status === 'error') {
        throw new Error(response.error?.message || 'Failed to send Bitcoin');
      }

      return { txid: response.result.txid };
    } catch (error: any) {
      throw new Error(`Failed to send Bitcoin: ${error.message}`);
    }
  }

  async signPsbt(psbtHex: string): Promise<string> {
    if (!this.connected || !this.isAvailable()) {
      throw new Error('Wallet not connected');
    }

    try {
      const response = await request('signPsbt', {
        psbt: psbtHex,
        signInputs: {},
        broadcast: false
      });

      if (response.status === 'error') {
        throw new Error(response.error?.message || 'Failed to sign PSBT');
      }

      return response.result.psbt;
    } catch (error: any) {
      throw new Error(`Failed to sign PSBT: ${error.message}`);
    }
  }
}
