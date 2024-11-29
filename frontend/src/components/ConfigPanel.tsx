import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { X } from 'lucide-react';
import { Button } from './ui/button';

interface ConfigPanelProps {
    isOpen: boolean;
    onClose: () => void;
    config: Config;
    onConfigChange: (config: Config) => void;
  }
  

interface ConfigOption {
  network: 'mainnet-beta' | 'devnet' | 'testnet';
  showTransactionDetails: boolean;
  improveErrors: boolean;
  automaticAirdrop: boolean;
}

export const ConfigPanel = ({ isOpen, onClose, config, onConfigChange }: ConfigPanelProps) => {
    if (!isOpen) return null;
  

  return (
    <div className="fixed bottom-0 right-0 w-80 bg-gray-800 border-l border-t border-gray-700 p-4 rounded-tl-lg shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-sm font-medium">Configuration</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label>Network</Label>
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
          <p className="text-xs text-gray-400">Select the network to deploy your program</p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Show Transaction Details</Label>
              <Switch
                    checked={config.showTransactionDetails}
                    onCheckedChange={(checked) => 
                    onConfigChange({ ...config, showTransactionDetails: checked })}
                />
            </div>
            <p className="text-xs text-gray-400">Display detailed transaction information in the output</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Improve Build Errors</Label>
              <Switch
                checked={config.improveErrors}
                onCheckedChange={(checked) => 
                  setConfig({ ...config, improveErrors: checked })}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
            <p className="text-xs text-gray-400">Show enhanced error messages during build</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Automatic Airdrop</Label>
              <Switch
                checked={config.automaticAirdrop}
                onCheckedChange={(checked) => 
                  setConfig({ ...config, automaticAirdrop: checked })}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
            <p className="text-xs text-gray-400">Automatically request an airdrop when balance is low</p>
          </div>
        </div>
      </div>
    </div>
  );
};