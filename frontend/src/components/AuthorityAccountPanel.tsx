import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Copy, Download, Key, RefreshCw, AlertCircle, CheckCircle2, Wallet, RotateCcw, ExternalLink, Droplets } from 'lucide-react';
import { ProjectAccount, Project } from '../types';
import { generateArchKeypair, downloadKeypairJSON, formatAddress, formatPubkey } from '../utils/keypairGenerator';
import { RpcConnection } from '@saturnbtcio/arch-sdk';
import { getSmartRpcUrl } from '../utils/smartRpcConnection';
import { getExplorerUrls } from '../utils/explorerLinks';
import { hexToBase58 } from '../utils/base58';
import { requestFaucetFunds, isFaucetAvailable } from '../utils/faucet';
import { useToast } from './ui/use-toast';

interface AuthorityAccountPanelProps {
  project: Project | null;
  onAuthorityAccountChange: (account: ProjectAccount | null) => void;
  config: {
    network: 'mainnet-beta' | 'devnet' | 'testnet';
    rpcUrl: string;
  };
  isConnected: boolean;
}

export const AuthorityAccountPanel: React.FC<AuthorityAccountPanelProps> = ({
  project,
  onAuthorityAccountChange,
  config,
  isConnected
}) => {
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isRequestingFunds, setIsRequestingFunds] = useState(false);

  const { toast } = useToast();
  const authority = project?.authorityAccount;
  const networkDisplay = config.network === 'mainnet-beta' ? 'mainnet' : config.network;
  const isFaucetNetwork = config.network === 'testnet' || config.network === 'devnet';
  const explorerUrls = getExplorerUrls(config.network as 'testnet' | 'mainnet-beta' | 'devnet');
  const authorityBase58 = authority ? hexToBase58(authority.pubkey) : null;

  // Fetch balance when authority account changes or component mounts
  useEffect(() => {
    if (authority && isConnected) {
      fetchBalance();
    } else {
      setBalance(null);
      setBalanceError(null);
    }
  }, [authority?.pubkey, isConnected]);

  const fetchBalance = async () => {
    if (!authority || !isConnected) return;

    setIsLoadingBalance(true);
    setBalanceError(null);

    try {
      const smartRpcUrl = getSmartRpcUrl(config.rpcUrl);
      const connection = new RpcConnection(smartRpcUrl);
      const pubkeyBuffer = Buffer.from(authority.pubkey, 'hex');

      const accountInfo = await connection.readAccountInfo(pubkeyBuffer);

      if (accountInfo) {
        setBalance(accountInfo.lamports);
      } else {
        setBalance(0);
      }
    } catch (error: any) {
      console.log('Authority balance fetch error:', error?.message || error);
      // If account doesn't exist yet (not funded), treat as 0 balance
      if (error?.message?.includes('account is not in database') ||
          error?.message?.includes('not found')) {
        setBalance(0);
        setBalanceError(null);
      } else {
        console.error('Failed to fetch authority balance:', error);
        setBalanceError('Failed to fetch balance');
        setBalance(null);
      }
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const handleGenerate = () => {
    const networkType = config.network === 'mainnet-beta' ? 'mainnet' :
                       config.network === 'testnet' ? 'testnet' : 'devnet';
    const newAuthority = generateArchKeypair(networkType);
    onAuthorityAccountChange(newAuthority);
  };

  const handleExport = () => {
    if (!authority || !project) return;
    downloadKeypairJSON(authority, `${project.name}-authority.json`);
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleRequestFunds = async () => {
    if (!authority || !isConnected || !isFaucetNetwork) return;

    setIsRequestingFunds(true);

    try {
      const smartRpcUrl = getSmartRpcUrl(config.rpcUrl);
      const network = config.network as 'testnet' | 'devnet';

      toast({
        title: "Requesting Funds",
        description: `Requesting testnet funds from faucet...`,
      });

      const result = await requestFaucetFunds({
        pubkey: authority.pubkey,
        privkey: authority.privkey, // Pass private key to complete the transaction
        rpcUrl: smartRpcUrl,
        network,
      });

      if (result.success) {
        toast({
          title: "Funds Requested",
          description: result.message || "Airdrop successful! Refreshing balance...",
        });

        // Wait a bit for the transaction to be processed
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Refresh balance
        await fetchBalance();
      } else {
        // Check if it's because account already has funds
        if (result.error?.includes('already')) {
          toast({
            title: "Account Already Funded",
            description: "This account already has funds.",
            variant: "default",
          });
          // Still refresh balance to show current amount
          await fetchBalance();
        } else {
          throw new Error(result.error || 'Faucet request failed');
        }
      }
    } catch (error: any) {
      console.error('Faucet request error:', error);
      toast({
        title: "Faucet Request Failed",
        description: error.message || "Failed to request funds from faucet",
        variant: "destructive",
      });
    } finally {
      setIsRequestingFunds(false);
    }
  };

  const needsFunding = balance !== null && balance === 0;
  const hasSufficientFunds = balance !== null && balance > 5000; // Minimum for deployment

  // Convert lamports to ARCH (1 ARCH = 100,000,000 lamports)
  const formatBalance = (lamports: number): string => {
    const arch = lamports / 100_000_000;
    return arch.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    });
  };

  // Don't render if no project is loaded
  if (!project) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold">Authority Account</h3>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
          <p className="text-xs text-gray-500">No project loaded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">Authority Account</h3>

        {authority && (
          <div className="flex gap-1">
            {isFaucetNetwork && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRequestFunds}
                disabled={!isConnected || isRequestingFunds}
                className="h-6 px-1.5"
                title="Request testnet funds"
              >
                <Droplets className={`h-3 w-3 ${isRequestingFunds ? 'animate-pulse' : ''} text-blue-500`} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchBalance}
              disabled={!isConnected || isLoadingBalance}
              className="h-6 px-1.5"
              title="Refresh balance"
            >
              <RefreshCw className={`h-3 w-3 ${isLoadingBalance ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="h-6 px-1.5"
              title="Export keypair"
            >
              <Download className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGenerate}
              className="h-6 px-1.5"
              title="Regenerate keypair"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {!authority ? (
        <div className="bg-gray-800/40 border border-gray-700 rounded-md p-3">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-700">
              Required for deployment. Pays transaction fees.
            </p>
          </div>
          <Button
            onClick={handleGenerate}
            size="sm"
            className="w-full h-7"
          >
            <Key className="h-3 w-3 mr-2" />
            Generate Keypair
          </Button>
        </div>
      ) : (
        <div className="bg-gray-800/40 border border-gray-700 rounded-md p-2 space-y-2">
          {/* Balance & Network Display */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-300">Balance:</span>
              {isLoadingBalance ? (
                <span className="text-xs text-gray-500">Loading...</span>
              ) : balance !== null ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs font-mono font-semibold text-gray-100">{formatBalance(balance)} ARCH</span>
                  {hasSufficientFunds ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  ) : needsFunding && (
                    <AlertCircle className="h-3 w-3 text-orange-500" />
                  )}
                </div>
              ) : (
                <span className="text-xs text-gray-400">-</span>
              )}
            </div>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              config.network === 'mainnet-beta'
                ? 'bg-red-900/40 text-red-300'
                : config.network === 'testnet'
                  ? 'bg-yellow-900/30 text-yellow-300'
                  : 'bg-blue-900/40 text-blue-300'
            }`}>
              {networkDisplay.toUpperCase()}
            </span>
          </div>

          {/* Funding Warning (compact) */}
          {needsFunding && isFaucetNetwork && (
            <div className="bg-orange-900/20 border border-orange-800/40 rounded px-2 py-1.5 space-y-1.5">
              <p className="text-[10px] text-orange-300">
                ⚠️ Account needs funding for transactions
              </p>
              <Button
                onClick={handleRequestFunds}
                disabled={!isConnected || isRequestingFunds}
                size="sm"
                className="w-full h-6 text-[10px]"
              >
                <Droplets className="h-3 w-3 mr-1" />
                {isRequestingFunds ? 'Requesting...' : 'Request Testnet Funds'}
              </Button>
            </div>
          )}

          {/* Public Key (copyable input) */}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-300">Pubkey</span>
              <input
                readOnly
                value={authority.pubkey}
                className="flex-1 text-[10px] font-mono bg-gray-900 border border-gray-700 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-gray-500"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(authority.pubkey, 'pubkey')}
                className="h-6 px-1"
                title="Copy public key"
              >
                {copiedField === 'pubkey' ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
              {explorerUrls && authorityBase58 && (
                <a href={explorerUrls.account(authorityBase58)} target="_blank" rel="noopener noreferrer" className="text-[10px] underline">
                  Explorer
                </a>
              )}
            </div>
          </div>

          {/* Address (copyable input) */}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-300">Address</span>
              <input
                readOnly
                value={authority.address}
                className="flex-1 text-[10px] font-mono bg-gray-900 border border-gray-700 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-gray-500"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(authority.address, 'address')}
                className="h-6 px-1"
                title="Copy address"
              >
                {copiedField === 'address' ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
              {explorerUrls && authorityBase58 && (
                <a href={explorerUrls.account(authorityBase58)} target="_blank" rel="noopener noreferrer" className="text-[10px] underline">
                  Explorer
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthorityAccountPanel;
