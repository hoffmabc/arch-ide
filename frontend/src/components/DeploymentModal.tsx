import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Info, Check, AlertTriangle } from 'lucide-react';

interface DeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeploy: (utxoInfo?: { txid: string; vout: number }) => Promise<void>;
  isConnected: boolean;
  isDeploying: boolean;
  network?: 'mainnet' | 'testnet' | 'regtest' | 'devnet';
  programId?: string;
  rpcUrl?: string;
}

export const DeploymentModal = ({
  isOpen,
  onClose,
  onDeploy,
  isConnected,
  isDeploying,
  network = 'testnet'
}: DeploymentModalProps) => {

  const handleDeploy = async () => {
    // Close the modal immediately so user can see the logs
    onClose();
    // Start deployment
    await onDeploy();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white max-w-xl p-0 overflow-hidden rounded-lg">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-black mb-4">Deploy Program</h2>

          <div className="space-y-4">
            {/* Network badge */}
            <div className={`inline-flex items-center px-3 py-1.5 rounded text-sm font-medium ${
              network === 'mainnet'
                ? 'bg-red-100 text-red-800 border border-red-200'
                : network === 'testnet'
                  ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                  : 'bg-blue-100 text-blue-800 border border-blue-200'
            }`}>
              <AlertTriangle className="h-4 w-4 mr-2" />
              {network === 'mainnet'
                ? 'MAINNET'
                : network === 'testnet'
                  ? 'TESTNET'
                  : 'DEVNET'}
            </div>

            {/* Info panel */}
            <div className="bg-green-50 border border-green-200 p-4 rounded-md">
              <div className="flex items-start gap-3">
                <Check className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-green-900">Ready to Deploy</h3>
                  <p className="text-sm text-green-800">
                    Your program will be deployed to the {network} network. The deployment process will:
                  </p>
                  <ul className="text-sm text-green-800 list-disc list-inside space-y-1 ml-2">
                    <li>Create and fund a temporary authority account using the network faucet</li>
                    <li>Create your program account on-chain</li>
                    <li>Upload your compiled program binary</li>
                    <li>Mark the program as executable</li>
                  </ul>
                  <p className="text-sm text-green-800 mt-2">
                    Check the console below for deployment progress and transaction IDs.
                  </p>
                </div>
              </div>
            </div>

            {!isConnected && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-md">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-red-900">Not Connected</h3>
                    <p className="text-sm text-red-800 mt-1">
                      Please connect to the network before deploying.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isDeploying}
            className="border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleDeploy}
            disabled={!isConnected || isDeploying}
            className="bg-[#E05A1A] hover:bg-[#d14e12] text-white border-0"
          >
            Deploy Program
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};