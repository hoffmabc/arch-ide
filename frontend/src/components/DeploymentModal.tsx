import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ChevronDown, ChevronUp, Info, Loader2 } from 'lucide-react';

interface DeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeploy: (utxoInfo?: { txid: string; vout: number }) => Promise<void>;
  isConnected: boolean;
  isDeploying: boolean;
}

export const DeploymentModal = ({
  isOpen,
  onClose,
  onDeploy,
  isConnected,
  isDeploying
}: DeploymentModalProps) => {
  const [option, setOption] = useState<'existing' | 'new'>('new');
  const [txid, setTxid] = useState('');
  const [vout, setVout] = useState<number | ''>('');
  const [errors, setErrors] = useState<{ txid?: string; vout?: string }>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleOptionChange = (value: string) => {
    setOption(value as 'existing' | 'new');
    // Clear errors when switching options
    setErrors({});
  };

  const validateInputs = () => {
    const newErrors: { txid?: string; vout?: string } = {};

    if (option === 'existing') {
      if (!txid) {
        newErrors.txid = 'Transaction ID is required';
      } else if (!/^[a-fA-F0-9]{64}$/.test(txid)) {
        newErrors.txid = 'Transaction ID must be a valid 64-character hex string';
      }

      if (vout === '') {
        newErrors.vout = 'Output index is required';
      } else if (Number.isNaN(Number(vout)) || Number(vout) < 0) {
        newErrors.vout = 'Output index must be a valid non-negative number';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateInputs()) return;

    if (option === 'existing') {
      await onDeploy({ txid, vout: Number(vout) });
    } else {
      await onDeploy();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white max-w-xl p-0 overflow-hidden rounded-lg">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-black mb-2">Deploy Program</h2>
          <p className="text-gray-500 mb-4">
            Select a UTXO (Unspent Transaction Output) method for program deployment
          </p>

          <div className="space-y-6">
            <div className="bg-orange-50 border border-orange-100 p-4 rounded-md">
              <div className="flex gap-3">
                <div className="mt-0.5">
                  <Info className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-orange-800">UTXO Requirement</h3>
                  <p className="text-sm mt-1 text-orange-700">
                    Deploying an Arch program requires a UTXO (Unspent Transaction Output) to identify the program
                    account. This requires a small Bitcoin transaction of approximately 5,000 sats.
                  </p>
                </div>
              </div>
            </div>

            <RadioGroup
              value={option}
              onValueChange={handleOptionChange}
              className="space-y-4"
            >
              {/* Option 1: New UTXO (Recommended) */}
              <div
                className={`border-2 ${option === 'new' ? 'border-orange-300 bg-orange-50' : 'border-gray-200'} rounded-md p-4 cursor-pointer transition-colors shadow-sm`}
                onClick={() => setOption('new')}
              >
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="new" id="new" className="mt-1" />
                  <div>
                    <Label htmlFor="new" className="text-black font-semibold cursor-pointer">
                      Automatically create a new UTXO (Recommended)
                    </Label>
                    <p className="text-gray-600 mt-1">
                      Use your connected Bitcoin wallet to create a new UTXO (5,000 sats).
                    </p>
                    {!isConnected && option === 'new' && (
                      <p className="text-red-500 mt-2 text-sm">
                        Requires RPC connection. Please connect first.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Advanced Options Toggle */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center text-gray-500 hover:text-gray-700 text-sm font-medium"
                >
                  {showAdvanced ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-1" />
                      Hide advanced options
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-1" />
                      Show advanced options
                    </>
                  )}
                </button>
              </div>

              {/* Option 2: Existing UTXO (Only shown when advanced options are expanded) */}
              {showAdvanced && (
                <div className={`border ${option === 'existing' ? 'border-orange-300 bg-orange-50' : 'border-gray-200'} rounded-md transition-colors`}>
                  <div className="p-4 cursor-pointer" onClick={() => setOption('existing')}>
                    <div className="flex items-start space-x-3">
                      <RadioGroupItem value="existing" id="existing" className="mt-1" />
                      <div>
                        <Label htmlFor="existing" className="text-black font-medium cursor-pointer">
                          Use an existing UTXO (Advanced)
                        </Label>
                        <p className="text-gray-600 mt-1">
                          Provide a transaction ID (txid) and output index (vout) that you've already created.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Show inputs only when this option is selected */}
                  {option === 'existing' && (
                    <div className="p-4 pt-0 mt-2 space-y-4 border-t border-orange-200">
                      <div className="grid gap-2">
                        <Label htmlFor="txid" className="text-black font-medium">
                          Transaction ID (txid)
                        </Label>
                        <Input
                          id="txid"
                          value={txid}
                          onChange={(e) => setTxid(e.target.value)}
                          placeholder="e.g., 1a2b3c4d5e6f..."
                          className="border-gray-300 text-black"
                        />
                        {errors.txid && <p className="text-red-500 text-xs">{errors.txid}</p>}
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="vout" className="text-black font-medium">
                          Output Index (vout)
                        </Label>
                        <Input
                          id="vout"
                          type="number"
                          min="0"
                          value={vout}
                          onChange={(e) => setVout(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="e.g., 0"
                          className="border-gray-300 text-black"
                        />
                        {errors.vout && <p className="text-red-500 text-xs">{errors.vout}</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </RadioGroup>
          </div>
        </div>

        <div className="flex justify-end p-4 border-t border-gray-200">
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isDeploying}
              className="border-gray-300 text-black"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleSubmit}
              disabled={
                isDeploying ||
                (option === 'new' && !isConnected) ||
                (option === 'existing' && (!txid || vout === ''))
              }
              className="bg-[#E05A1A] hover:bg-[#d14e12] text-white border-0"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                'Deploy Program'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};