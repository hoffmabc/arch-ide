import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Copy, Download, Key, RefreshCw, AlertCircle, CheckCircle2, Wallet, RotateCcw, ExternalLink } from 'lucide-react';
import { ProjectAccount, Project } from '../types';
import { generateArchKeypair, downloadKeypairJSON, formatAddress, formatPubkey } from '../utils/keypairGenerator';
import { RpcConnection } from '@saturnbtcio/arch-sdk';
import { getSmartRpcUrl } from '../utils/smartRpcConnection';
import { getExplorerUrls } from '../utils/explorerLinks';
import { hexToBase58 } from '../utils/base58';

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
        <h3 className="text-sm font-semibold">Authority Account</h3>

        {authority && (
          <div className="flex gap-1">
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
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-700">
              Required for deployment. Pays transaction fees.
            </p>
          </div>
          <Button
            onClick={handleGenerate}
            size="sm"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white h-7"
          >
            <Key className="h-3 w-3 mr-2" />
            Generate Keypair
          </Button>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-2 space-y-2">
          {/* Balance & Network Display */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-600">Balance:</span>
              {isLoadingBalance ? (
                <span className="text-xs text-gray-500">Loading...</span>
              ) : balance !== null ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs font-mono font-semibold text-gray-900">{formatBalance(balance)} ARCH</span>
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
                ? 'bg-red-100 text-red-800'
                : config.network === 'testnet'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-blue-100 text-blue-800'
            }`}>
              {networkDisplay.toUpperCase()}
            </span>
          </div>

          {/* Funding Warning (compact) */}
          {needsFunding && isFaucetNetwork && (
            <div className="bg-orange-50 border border-orange-200 rounded px-2 py-1">
              <p className="text-[10px] text-orange-800">
                ⚠️ Faucet will fund on deployment
              </p>
            </div>
          )}

          {/* Public Key (truncated) */}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-600">Pubkey:</span>
              {explorerUrls && authorityBase58 ? (
                <a
                  href={explorerUrls.account(authorityBase58)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] font-mono text-blue-600 hover:text-blue-800 bg-white border border-gray-200 hover:border-blue-300 rounded px-1 py-0.5 flex-1 truncate flex items-center gap-1 group"
                  title={`View ${authority.pubkey} in Explorer`}
                >
                  <span className="flex-1 truncate">{authority.pubkey.slice(0, 16)}...{authority.pubkey.slice(-8)}</span>
                  <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </a>
              ) : (
                <code className="text-[9px] font-mono text-gray-900 bg-white border border-gray-200 rounded px-1 py-0.5 flex-1 truncate">
                  {authority.pubkey.slice(0, 16)}...{authority.pubkey.slice(-8)}
                </code>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(authority.pubkey, 'pubkey')}
                className="h-5 w-5 p-0 hover:bg-gray-200"
                title="Copy full public key"
              >
                {copiedField === 'pubkey' ? (
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-2.5 w-2.5" />
                )}
              </Button>
            </div>
          </div>

          {/* Address (truncated) */}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-600">Address:</span>
              {explorerUrls && authorityBase58 ? (
                <a
                  href={explorerUrls.account(authorityBase58)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] font-mono text-blue-600 hover:text-blue-800 bg-white border border-gray-200 hover:border-blue-300 rounded px-1 py-0.5 flex-1 truncate flex items-center gap-1 group"
                  title={`View ${authority.address} in Explorer`}
                >
                  <span className="flex-1 truncate">{authority.address.slice(0, 12)}...{authority.address.slice(-8)}</span>
                  <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </a>
              ) : (
                <code className="text-[9px] font-mono text-gray-900 bg-white border border-gray-200 rounded px-1 py-0.5 flex-1 truncate">
                  {authority.address.slice(0, 12)}...{authority.address.slice(-8)}
                </code>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(authority.address, 'address')}
                className="h-5 w-5 p-0 hover:bg-gray-200"
                title="Copy full address"
              >
                {copiedField === 'address' ? (
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-2.5 w-2.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthorityAccountPanel;
