import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { X, Globe, Link, Server, Key, Lock, Eye, AlertTriangle, Coins } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { Config } from '../types';

interface ConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
  config: Config;
  onConfigChange: (config: Config) => void;
}

export const ConfigPanel = ({ isOpen, onClose, config, onConfigChange }: ConfigPanelProps) => {
  if (!isOpen) return null;

  const handleRegtestChange = (field: 'url' | 'username' | 'password', value: string) => {
    onConfigChange({
      ...config,
      regtestConfig: {
        url: config.regtestConfig?.url || '',
        username: config.regtestConfig?.username || '',
        password: config.regtestConfig?.password || '',
        [field]: value
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-gray-800 rounded-lg shadow-xl w-[600px] max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <h3 className="text-lg font-medium">Configuration</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-8">
          {/* Network Settings Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Globe className="h-4 w-4 text-blue-400" />
              <h4 className="text-sm font-medium text-gray-200 uppercase">Network Settings</h4>
            </div>

            <div className="grid gap-6">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Link className="h-4 w-4 text-gray-400" />
                  Network
                </Label>
                <Select
                  value={config.network}
                  onValueChange={(value: any) => onConfigChange({ ...config, network: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mainnet-beta">Mainnet Beta</SelectItem>
                    <SelectItem value="devnet">Devnet</SelectItem>
                    <SelectItem value="testnet">Testnet</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-gray-400" />
                  RPC URL
                </Label>
                <Input
                  value={config.rpcUrl}
                  onChange={(e) => onConfigChange({ ...config, rpcUrl: e.target.value })}
                  placeholder="Enter RPC URL"
                />
              </div>

              {config.network === 'devnet' && (
                <div className="space-y-4 border-l-2 border-blue-500/30 pl-4 mt-2">
                  <div>
                    <h4 className="text-sm font-medium text-blue-400">Bitcoin Regtest Settings</h4>
                    <p className="text-xs text-gray-400 mt-1">
                      These settings allow direct interaction with a local Bitcoin node, enabling transactions without a web wallet.
                      Perfect for development and testing.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-gray-400" />
                        Bitcoin RPC URL
                      </Label>
                      <Input
                        value={config.regtestConfig?.url || ''}
                        onChange={(e) => handleRegtestChange('url', e.target.value)}
                        placeholder="http://localhost:18443"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-gray-400" />
                        RPC Username
                      </Label>
                      <Input
                        value={config.regtestConfig?.username || ''}
                        onChange={(e) => handleRegtestChange('username', e.target.value)}
                        placeholder="bitcoin"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-gray-400" />
                        RPC Password
                      </Label>
                      <Input type="password"
                        value={config.regtestConfig?.password || ''}
                        onChange={(e) => handleRegtestChange('password', e.target.value)}
                        placeholder="bitcoin"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Development Settings Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <h4 className="text-sm font-medium text-gray-200 uppercase">Development Settings</h4>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex items-center gap-3">
                  <Eye className="h-4 w-4 text-gray-400" />
                  <div>
                    <Label>Show Transaction Details</Label>
                    <p className="text-xs text-gray-400">Display detailed transaction information</p>
                  </div>
                </div>
                <Switch
                  checked={config.showTransactionDetails}
                  onCheckedChange={(checked) => onConfigChange({ ...config, showTransactionDetails: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex items-center gap-3">
                  <Coins className="h-4 w-4 text-gray-400" />
                  <div>
                    <Label>Improve Build Errors</Label>
                    <p className="text-xs text-gray-400">Show enhanced error messages</p>
                  </div>
                </div>
                <Switch
                  checked={config.improveErrors}
                  onCheckedChange={(checked) => onConfigChange({ ...config, improveErrors: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex items-center gap-3">
                  <Coins className="h-4 w-4 text-gray-400" />
                  <div>
                    <Label>Automatic Airdrop</Label>
                    <p className="text-xs text-gray-400">Request airdrop when balance is low</p>
                  </div>
                </div>
                <Switch
                  checked={config.automaticAirdrop}
                  onCheckedChange={(checked) => onConfigChange({ ...config, automaticAirdrop: checked })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};