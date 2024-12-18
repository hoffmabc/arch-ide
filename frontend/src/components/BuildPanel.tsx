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
  import { NewKeypairDialog } from './NewKeypairDialog';
  import { useEffect } from 'react';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
  import { IdlPanel } from './IdlPanel';
  import { ArchIdl } from '../types/idl';
  import { Config } from '../types/config';
  import { ConnectionStatus } from './ConnectionStatus';
  import { Project, ProjectAccount } from '../types';

  interface BuildPanelProps {
    hasProjects: boolean;
    onBuild: () => void;
    onDeploy: () => void;
    isBuilding: boolean;
    isDeploying: boolean;
    programId?: string;
    programBinary?: string | null;
    onProgramBinaryChange?: (binary: string | null) => void;
    config: Config;
    onConfigChange?: (config: Config) => void;
    onConnectionStatusChange?: (connected: boolean) => void;
    onProgramIdChange?: (programId: string) => void;
    currentAccount: {
      privkey: string;
      pubkey: string;
      address: string;
    } | null;
    onAccountChange: (account: { privkey: string; pubkey: string; address: string; } | null) => void;
    project: Project;
    onProjectAccountChange: (account: ProjectAccount) => void;
  }

  const BuildPanel = ({
    hasProjects,
    onBuild,
    onDeploy,
    isBuilding,
    isDeploying,
    programId,
    programBinary,
    onProgramBinaryChange,
    config,
    onConnectionStatusChange,
    idl,
    onProgramIdChange,
    currentAccount,
    onAccountChange,
    project,
    onProjectAccountChange
  }: BuildPanelProps & { idl: ArchIdl | null }) => {
      const [isNewKeypairDialogOpen, setIsNewKeypairDialogOpen] = useState(false);
      const [binaryFileName, setBinaryFileName] = useState<string | null>(null);

      // Update effect to handle both uploaded and compiled binaries
      useEffect(() => {
          if (programBinary) {
              setBinaryFileName('arch_program.so');
          }
      }, [programBinary]);

      useEffect(() => {
        if (project?.account && !currentAccount) {
          onAccountChange(project.account);
          onProgramIdChange?.(project.account.pubkey);
        }
        // Clear binary filename when project changes
        setBinaryFileName(null);
      }, [project, currentAccount, onAccountChange, onProgramIdChange]);

      const handleImportBinary = (event: React.ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          if (!file) return;

          if (!file.name.endsWith('.so')) {
              console.error('Only .so files are allowed');
              return;
          }

          const reader = new FileReader();
          reader.onload = (e) => {
              try {
                  const binary = e.target?.result as string;
                  onProgramBinaryChange?.(binary);
                  setBinaryFileName(file.name);
              } catch (error) {
                  console.error('Failed to import binary:', error);
              }
          };
          reader.readAsDataURL(file);
      };

    const handleExportBinary = () => {
        if (!programBinary || !binaryFileName) {
            console.error('Missing binary or filename');
            return;
        }

        try {
            let binaryData: Uint8Array;

            // If it's a data URL
            if (programBinary.startsWith('data:')) {
                // Extract the base64 part after the comma
                const base64Content = programBinary.split(',')[1];
                // Convert base64 to binary string
                const binaryString = window.atob(base64Content);
                // Convert binary string to Uint8Array
                binaryData = Uint8Array.from(binaryString, c => c.charCodeAt(0));
            } else {
                // Handle raw base64 string
                try {
                    const binaryString = window.atob(programBinary);
                    binaryData = Uint8Array.from(binaryString, c => c.charCodeAt(0));
                } catch (error) {
                    console.error('Failed to decode base64:', error);
                    return;
                }
            }

            // Create and download the blob
            const blob = new Blob([binaryData], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = binaryFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Failed to export binary:', error);
        }
    };

    const handleNewKeypair = async () => {
      const connection = ArchConnection(new RpcConnection(config.rpcUrl));
      const account = await connection.createNewAccount();
      onAccountChange(account);
      onProgramIdChange?.(account.pubkey);
      onProjectAccountChange(account);
      setIsNewKeypairDialogOpen(false);
    };

    // Update the Plus button click handler
    const handleNewKeypairClick = () => {
      setIsNewKeypairDialogOpen(true);
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
          onAccountChange(account);
          onProgramIdChange?.(account.pubkey);
          onProjectAccountChange(account);
        } catch (error) {
          console.error('Failed to import keypair:', error);
        }
      };
      reader.readAsText(file);
    };

    return (
        <div className="w-full bg-gray-800 border-r border-gray-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">BUILD & DEPLOY</h2>
          </div>

          <Button
            className="w-full mb-4 bg-pink-500 hover:bg-pink-600"
            onClick={onBuild}
            disabled={isBuilding || !hasProjects}
          >
            {isBuilding ? 'Building...' : 'Build'}
          </Button>

          <Tabs defaultValue="binary" className="w-full">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="binary" className="flex-1">Binary</TabsTrigger>
              <TabsTrigger value="idl" className="flex-1">IDL</TabsTrigger>
            </TabsList>

            <TabsContent value="binary">
              {/* Program ID Section */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Program ID</h3>
                  <div className="flex gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" onClick={handleNewKeypairClick}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Generate new program ID</p>
                        </TooltipContent>
                      </Tooltip>

                      <NewKeypairDialog
                        isOpen={isNewKeypairDialogOpen}
                        onClose={() => setIsNewKeypairDialogOpen(false)}
                        onConfirm={handleNewKeypair}
                      />

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
                    {currentAccount ? currentAccount.pubkey : 'Not deployed'}
                  </code>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => currentAccount && navigator.clipboard.writeText(currentAccount.pubkey)}
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

              {/* Program Binary Section */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Program binary</h3>
                  <div className="flex gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => document.getElementById('import-binary')?.click()}
                          >
                            <Import className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Import program binary (.so)</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleExportBinary}
                            disabled={!programBinary}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Save program binary</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                <input
                  type="file"
                  id="import-binary"
                  className="hidden"
                  accept=".so"
                  onChange={handleImportBinary}
                />
                <div className="text-xs bg-gray-900 p-2 rounded">
                  {binaryFileName || 'Import your program binary (.so)'}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="idl">
              <IdlPanel idl={idl} />
            </TabsContent>
          </Tabs>

          <Button
            className="w-full mt-4"
            onClick={onDeploy}
            disabled={isDeploying || !currentAccount || !hasProjects}
          >
            {isDeploying ? 'Deploying...' : 'Deploy'}
          </Button>
        </div>
      );
  };

export default BuildPanel;