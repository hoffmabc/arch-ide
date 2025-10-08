// Wallet connection button - shows in the UI like Solana Playground
import React from 'react';
import { Wallet, ChevronDown, LogOut } from 'lucide-react';
import { Button } from '../ui/button';
import { useBitcoinWallet } from '../../hooks/useBitcoinWallet';
import { useToast } from '../ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

// Wallet icon component - using styled badges
const WalletIcon: React.FC<{ name: string }> = ({ name }) => {
  const getWalletStyle = () => {
    switch (name) {
      case 'Unisat':
        return { bg: 'bg-orange-600', text: 'U' };
      case 'Xverse':
        return { bg: 'bg-purple-600', text: 'X' };
      default:
        return { bg: 'bg-gray-600', text: name[0] };
    }
  };

  const style = getWalletStyle();

  return (
    <div className={`${style.bg} w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold`}>
      {style.text}
    </div>
  );
};

interface WalletButtonProps {
  network?: 'mainnet' | 'testnet' | 'regtest';
  rpcUrl?: string;
}

export const WalletButton: React.FC<WalletButtonProps> = ({
  network = 'testnet',
}) => {
  const {
    wallet,
    account,
    connected,
    connecting,
    availableWallets,
    connect,
    disconnect
  } = useBitcoinWallet();

  const { toast } = useToast();

  const handleConnect = async (walletName: string) => {
    try {
      await connect(walletName, network);
      toast({
        title: "Wallet Connected",
        description: `Successfully connected to ${walletName} on ${network}`,
      });
    } catch (error: any) {
      console.error('Connection error:', error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect wallet",
        variant: "destructive",
      });
    }
  };

  // Truncate address for display
  const formatAddress = (address?: string) => {
    if (!address) return 'Unknown';
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  if (connecting) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2 bg-gray-800 border-gray-600 text-gray-300">
        <Wallet className="h-4 w-4 animate-pulse text-[#F7931A]" />
        <span>Connecting...</span>
      </Button>
    );
  }

  if (connected && account && account.address) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 bg-gray-800 border-gray-600 hover:bg-gray-700 text-white">
            <Wallet className="h-4 w-4 text-[#F7931A]" />
            <span className="font-mono text-xs font-medium">{formatAddress(account.address)}</span>
            <ChevronDown className="h-3 w-3 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 bg-gray-900 border-gray-700">
          <DropdownMenuLabel className="text-white">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[#F7931A]" />
              <span className="font-semibold">{wallet?.name}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-gray-700" />
          <div className="px-3 py-3 text-sm bg-gray-800/50">
            <div className="text-gray-400 text-xs font-medium mb-1.5">Address</div>
            <div className="font-mono text-sm text-white break-all leading-relaxed">{account.address}</div>
          </div>
          {account.publicKey && (
            <div className="px-3 py-3 text-sm bg-gray-800/30 border-t border-gray-700">
              <div className="text-gray-400 text-xs font-medium mb-1.5">Public Key</div>
              <div className="font-mono text-sm text-white break-all leading-relaxed">{account.publicKey}</div>
            </div>
          )}
          <DropdownMenuSeparator className="bg-gray-700" />
          <DropdownMenuItem
            onClick={() => disconnect()}
            className="text-red-400 hover:text-red-300 hover:bg-red-950/30 font-medium cursor-pointer flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            <span>Disconnect</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Not connected - show wallet selection
  if (availableWallets.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2 bg-gray-800 border-gray-600 hover:bg-gray-700 text-white"
        onClick={() => window.open('https://unisat.io', '_blank')}
      >
        <Wallet className="h-4 w-4" />
        <span>Install Wallet</span>
      </Button>
    );
  }

  if (availableWallets.length === 1) {
    // Only one wallet available - direct connect
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2 bg-gray-800 border-gray-600 hover:bg-gray-700 text-white"
        onClick={() => handleConnect(availableWallets[0].name)}
      >
        <Wallet className="h-4 w-4" />
        <span>Connect {availableWallets[0].name}</span>
      </Button>
    );
  }

  // Multiple wallets available - show dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-gray-800 border-gray-600 hover:bg-gray-700 text-white">
          <Wallet className="h-4 w-4" />
          <span>Connect Wallet</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
        <DropdownMenuLabel className="text-white font-semibold">Select Wallet</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gray-700" />
        {availableWallets.map((w) => (
          <DropdownMenuItem
            key={w.name}
            onClick={() => handleConnect(w.name)}
            className="gap-2 text-white hover:bg-gray-800 cursor-pointer"
          >
            <WalletIcon name={w.name} />
            <span>{w.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
