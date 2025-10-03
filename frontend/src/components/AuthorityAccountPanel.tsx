import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Copy, Download, Key, RefreshCw, AlertCircle, CheckCircle2, Wallet, RotateCcw } from 'lucide-react';
import { ProjectAccount, Project } from '../types';
import { generateArchKeypair, downloadKeypairJSON, formatAddress, formatPubkey } from '../utils/keypairGenerator';
import { RpcConnection } from '@saturnbtcio/arch-sdk';
import { getSmartRpcUrl } from '../utils/smartRpcConnection';

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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold">Authority Account</h3>
        </div>

        {authority && (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchBalance}
              disabled={!isConnected || isLoadingBalance}
              className="h-7 px-2"
              title="Refresh balance"
            >
              <RefreshCw className={`h-3 w-3 ${isLoadingBalance ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="h-7 px-2"
              title="Export keypair as JSON"
            >
              <Download className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGenerate}
              className="h-7 px-2"
              title="Regenerate authority keypair"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {!authority ? (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
          <div className="flex items-start gap-3 mb-3">
            <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-2 text-xs text-gray-700">
              <p className="font-medium">No Authority Account</p>
              <p>
                An authority account is required to deploy and manage programs on Arch Network.
                This account pays for transaction fees and program deployment.
              </p>
            </div>
          </div>
          <Button
            onClick={handleGenerate}
            size="sm"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Key className="h-3 w-3 mr-2" />
            Generate Authority Keypair
          </Button>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3 space-y-3">
          {/* Balance Display */}
          <div className="flex items-center justify-between pb-2 border-b border-gray-200">
            <span className="text-xs font-medium text-gray-600">Balance</span>
            <div className="flex items-center gap-2">
              {isLoadingBalance ? (
                <span className="text-xs text-gray-500">Loading...</span>
              ) : balanceError ? (
                <span className="text-xs text-red-600">{balanceError}</span>
              ) : balance !== null ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-gray-900">{formatBalance(balance)} ARCH</span>
                  {hasSufficientFunds && (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  )}
                  {needsFunding && (
                    <AlertCircle className="h-3 w-3 text-orange-500" />
                  )}
                </div>
              ) : (
                <span className="text-xs text-gray-400">Not connected</span>
              )}
            </div>
          </div>

          {/* Funding Warning */}
          {needsFunding && (
            <div className="bg-orange-50 border border-orange-200 rounded p-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-3 w-3 text-orange-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-orange-800">
                  {isFaucetNetwork ? (
                    <p>Account has no funds. The faucet will automatically fund it during deployment.</p>
                  ) : (
                    <p>Account needs funding before deployment. Send funds to the address below.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Network Badge */}
          <div>
            <span className="text-xs text-gray-600">Network:</span>
            <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded ${
              config.network === 'mainnet-beta'
                ? 'bg-red-100 text-red-800'
                : config.network === 'testnet'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-blue-100 text-blue-800'
            }`}>
              {networkDisplay.toUpperCase()}
            </span>
          </div>

          {/* Public Key */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">Public Key</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(authority.pubkey, 'pubkey')}
                className="h-5 px-1 hover:bg-gray-200"
              >
                {copiedField === 'pubkey' ? (
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
            <code className="text-[10px] font-mono text-gray-900 bg-white border border-gray-200 rounded px-2 py-1 block break-all">
              {authority.pubkey}
            </code>
          </div>

          {/* Address */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">Address</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(authority.address, 'address')}
                className="h-5 px-1 hover:bg-gray-200"
              >
                {copiedField === 'address' ? (
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
            <code className="text-[10px] font-mono text-gray-900 bg-white border border-gray-200 rounded px-2 py-1 block break-all">
              {authority.address}
            </code>
          </div>

          {/* Info about authority reuse */}
          <div className="pt-2 border-t border-gray-200">
            <p className="text-[10px] text-gray-500 leading-relaxed">
              💡 This authority account can be used to deploy and manage multiple programs.
              Export it to use with CLI tools or other projects.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthorityAccountPanel;
