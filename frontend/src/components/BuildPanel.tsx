import { ClipboardIcon, Plus, Import, Save } from 'lucide-react';
import { Button } from './ui/button';
import { useState } from 'react';
import { ArchConnection, RpcConnection } from '@saturnbtcio/arch-sdk';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "./ui/tooltip";

interface BuildPanelProps {
  onBuild: () => void;
  onDeploy: () => void;
  isBuilding: boolean;
  isDeploying: boolean;
  programId?: string;
}

export const BuildPanel = ({ onBuild, onDeploy, isBuilding, isDeploying, programId }: BuildPanelProps) => {
    const [currentAccount, setCurrentAccount] = useState<{
      privkey: string;
      pubkey: string;
      address: string;
    }>();
  
    const handleNewKeypair = async () => {
      const connection = ArchConnection(new RpcConnection('http://localhost:9002'));
      const account = await connection.createNewAccount();
      setCurrentAccount(account);
    };
  
    const handleExportKeypair = () => {
      if (!currentAccount) return;
      const blob = new Blob([JSON.stringify(currentAccount, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'program-keypair.json';
      a.click();
      URL.revokeObjectURL(url);
    };
  
    const handleImportKeypair = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
  
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const account = JSON.parse(e.target?.result as string);
          setCurrentAccount(account);
        } catch (error) {
          console.error('Failed to import keypair:', error);
        }
      };
      reader.readAsText(file);
    };
  
    return (
      <div className="w-64 bg-gray-800 border-r border-gray-700 p-4">
        <h2 className="text-lg font-semibold mb-4">BUILD & DEPLOY</h2>
        
        <Button 
          className="w-full mb-4 bg-pink-500 hover:bg-pink-600"
          onClick={onBuild}
          disabled={isBuilding}
        >
          {isBuilding ? 'Building...' : 'Build'}
        </Button>
  
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">Program ID</h3>
            <div className="flex gap-1">
            <TooltipProvider>
                <Tooltip>
                <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" onClick={handleNewKeypair}>
                    <Plus className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Generate new program ID</p>
                </TooltipContent>
                </Tooltip>

                <Tooltip>
                <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" onClick={() => document.getElementById('import-keypair')?.click()}>
                    <Import className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Import program keypair</p>
                </TooltipContent>
                </Tooltip>

                <Tooltip>
                <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" onClick={handleExportKeypair} disabled={!currentAccount}>
                    <Save className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Save program keypair</p>
                </TooltipContent>
                </Tooltip>
            </TooltipProvider>
            </div>
          </div>
          <input
            type="file"
            id="import-keypair"
            className="hidden"
            accept="application/json"
            onChange={handleImportKeypair}
          />
          <div className="flex items-center space-x-2">
            <code className="text-xs bg-gray-900 p-2 rounded flex-1 overflow-hidden">
              {currentAccount ? currentAccount.address : 'Not deployed'}
            </code>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => currentAccount && navigator.clipboard.writeText(currentAccount.address)}
                        disabled={!currentAccount}
                    >
                        <ClipboardIcon className="h-4 w-4" />
                    </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                    <p>Copy program ID</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
          </div>
        </div>
  
        <Button 
          className="w-full"
          onClick={onDeploy}
          disabled={isDeploying || !currentAccount}
        >
          {isDeploying ? 'Deploying...' : 'Deploy'}
        </Button>
      </div>
    );
  };