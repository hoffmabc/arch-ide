// React hook for Bitcoin Wallet - Similar to Solana Playground's useWallet
import { useState, useEffect } from 'react';
import { walletManager } from '../utils/wallet/walletManager';
import { BitcoinWalletState } from '../types/wallet';

export function useBitcoinWallet() {
  const [state, setState] = useState<BitcoinWalletState>(walletManager.getState());

  useEffect(() => {
    // Subscribe to wallet state changes
    const unsubscribe = walletManager.subscribe(() => {
      setState(walletManager.getState());
    });

    // Cleanup subscription on unmount
    return unsubscribe;
  }, []);

  return {
    // State
    wallet: state.currentWallet,
    account: state.currentAccount,
    connected: walletManager.isConnected,
    connecting: state.state === 'connecting',
    disconnected: state.state === 'disconnected',
    availableWallets: state.availableWallets,
    show: state.show,

    // Actions
    connect: (walletName: string, network?: 'mainnet' | 'testnet' | 'regtest') =>
      walletManager.connect(walletName, network),
    disconnect: () => walletManager.disconnect(),
    signMessage: (message: string) => walletManager.signMessage(message),
    sendBitcoin: (toAddress: string, amount: number) =>
      walletManager.sendBitcoin(toAddress, amount),
    signPsbt: (psbtHex: string) => walletManager.signPsbt(psbtHex),

    // UI controls
    showWallet: () => walletManager.show(),
    hideWallet: () => walletManager.hide(),
    toggleWallet: () => walletManager.toggle(),
  };
}
