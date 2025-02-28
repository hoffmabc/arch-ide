import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ChevronRight, ChevronLeft, Info, Loader2, Copy, ExternalLink, Check, AlertTriangle } from 'lucide-react';
import { RpcConnection } from '@saturnbtcio/arch-sdk';
import { getSmartRpcUrl } from '../utils/smartRpcConnection';

interface DeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeploy: (utxoInfo?: { txid: string; vout: number }) => Promise<void>;
  isConnected: boolean;
  isDeploying: boolean;
  network?: 'mainnet' | 'testnet' | 'regtest' | 'devnet'; // Network prop
  programId?: string; // Add programId prop for fetching address
  rpcUrl?: string; // Add rpcUrl prop for RPC connection
}

// Step definitions
type Step = 'select' | 'payment' | 'details' | 'confirm';

export const DeploymentModal = ({
  isOpen,
  onClose,
  onDeploy,
  isConnected,
  isDeploying,
  network = 'devnet', // Default to devnet if not specified
  programId,
  rpcUrl = 'http://localhost:9002' // Default RPC URL
}: DeploymentModalProps) => {
  // Step management
  const [currentStep, setCurrentStep] = useState<Step>('select');
  const [option, setOption] = useState<'existing' | 'new'>('new');
  const [txid, setTxid] = useState('');
  const [vout, setVout] = useState<number | ''>('');
  const [errors, setErrors] = useState<{ txid?: string; vout?: string }>({});
  const [bitcoinAddress, setBitcoinAddress] = useState<string>('');
  const [isAddressLoading, setIsAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  // Log the network for debugging purposes
  // console.log('Current network:', network);

  // Fetch address from RPC server
  const fetchBitcoinAddress = async () => {
    if (!isConnected) {
      setAddressError("Not connected to network. Please connect first.");
      return;
    }

    setIsAddressLoading(true);
    setAddressError(null);

    try {
      if (!programId) {
        throw new Error("No program ID available. Please compile your program first.");
      }

      console.log('Getting account address for program ID:', programId);

      // Get smart RPC URL for the current network
      const smartUrl = getSmartRpcUrl(rpcUrl);
      console.log('Using RPC URL:', smartUrl);

      // Create RPC connection
      const connection = new RpcConnection(smartUrl);

      // Convert program ID to Buffer
      console.log('Creating pubkey buffer from hex:', programId);
      const pubkeyBuffer = Buffer.from(programId, 'hex');

      // Get address from RPC connection
      console.log('Requesting account address from RPC...');
      const address = await connection.getAccountAddress(pubkeyBuffer);
      console.log('Received account address:', address);

      // Verify the address format matches the network
      verifyAddressFormat(address);

      setBitcoinAddress(address);
    } catch (error) {
      console.error('Error fetching Bitcoin address:', error);
      setAddressError(error instanceof Error ? error.message : 'Failed to fetch Bitcoin address');

      // Fall back to a network-specific example address
      const fallbackAddress = getNetworkSpecificAddress();
      setBitcoinAddress(fallbackAddress);
    } finally {
      setIsAddressLoading(false);
    }
  };

  // Effect to fetch the address when component mounts or when network changes
  useEffect(() => {
    if (isOpen && (option === 'existing' || currentStep === 'payment')) {
      fetchBitcoinAddress();
    }
  }, [isOpen, network, isConnected]); // Only re-run when these dependencies change

  // Bitcoin payment details - network specific fallback addresses
  const getNetworkSpecificAddress = () => {
    console.log('Getting fallback address for network:', network);
    switch (network) {
      case 'mainnet':
        return 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'; // Example mainnet address
      case 'testnet':
        return 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'; // Example testnet address
      case 'regtest':
      case 'devnet':
        return 'bcrt1qjrdns4f5zwkv29ln86plqzgj5zyukhut9mj5kz'; // Example regtest address
      default:
        // Default safely to testnet if unknown
        console.warn('Unknown network type:', network, 'defaulting to testnet address');
        return 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
    }
  };

  // Verify that the address format matches the network
  const verifyAddressFormat = (address: string) => {
    if (network === 'mainnet' && !address.startsWith('bc1')) {
      console.error('Address format does not match mainnet');
    } else if (network === 'testnet' && !address.startsWith('tb1')) {
      console.error('Address format does not match testnet');
    } else if ((network === 'regtest' || network === 'devnet') && !address.startsWith('bcrt1')) {
      console.error('Address format does not match regtest/devnet');
    }
  };

  // Get the explorer URL based on network
  const getExplorerUrl = () => {
    switch (network) {
      case 'mainnet':
        return 'https://mempool.space/tx/';
      case 'testnet':
        return 'https://mempool.space/testnet/tx/';
      case 'regtest':
      case 'devnet':
        // For regtest/devnet, typically there's no public explorer,
        // but could point to a local explorer if available
        return 'http://localhost:3002/tx/';
      default:
        return 'https://mempool.space/tx/';
    }
  };

  const satoshiAmount = 5000;
  const explorerBaseUrl = getExplorerUrl();

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here if desired
  };

  const openExplorer = (txid: string) => {
    if (txid && txid.length === 64) {
      window.open(`${explorerBaseUrl}${txid}`, '_blank');
    }
  };

  // Navigation functions
  const nextStep = () => {
    if (currentStep === 'select') {
      if (option === 'new' && isConnected) {
        // Skip intermediate steps for automatic option
        setCurrentStep('confirm');
      } else if (option === 'existing') {
        setCurrentStep('payment');
        // Fetch a new address when entering the payment step
        fetchBitcoinAddress();
      }
    } else if (currentStep === 'payment') {
      setCurrentStep('details');
    } else if (currentStep === 'details') {
      if (validateInputs()) {
        setCurrentStep('confirm');
      }
    }
  };

  const prevStep = () => {
    if (currentStep === 'payment') {
      setCurrentStep('select');
    } else if (currentStep === 'details') {
      setCurrentStep('payment');
      // Refresh the address when returning to payment step
      fetchBitcoinAddress();
    } else if (currentStep === 'confirm') {
      if (option === 'new') {
        setCurrentStep('select');
      } else {
        setCurrentStep('details');
      }
    }
  };

  // Get step title
  const getStepTitle = () => {
    switch (currentStep) {
      case 'select':
        return 'Deploy Program - Choose Method';
      case 'payment':
        return 'Deploy Program - Send Bitcoin';
      case 'details':
        return 'Deploy Program - Enter Transaction Details';
      case 'confirm':
        return 'Deploy Program - Confirm Deployment';
      default:
        return 'Deploy Program';
    }
  };

  // Progress indicator
  const renderProgress = () => {
    const steps = option === 'new' ? 2 : 4; // Fewer steps for automatic option
    const currentStepNumber =
      currentStep === 'select' ? 1 :
      currentStep === 'payment' ? 2 :
      currentStep === 'details' ? 3 : 4;

    const progress = option === 'new'
      ? (currentStep === 'select' ? 1 : 4) // Skip to final step for auto option
      : currentStepNumber;

    return (
      <div className="w-full bg-gray-200 h-1 rounded-full mb-6">
        <div
          className="bg-orange-500 h-1 rounded-full"
          style={{ width: `${(progress / steps) * 100}%` }}
        ></div>
      </div>
    );
  };

  // Render different content based on current step
  const renderStepContent = () => {
    switch (currentStep) {
      case 'select':
        return (
          <>
            <div className="bg-orange-50 border border-orange-100 p-4 rounded-md mb-6">
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
              className="space-y-5"
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

              {/* Option 2: Manual UTXO */}
              <div
                className={`border-2 ${option === 'existing' ? 'border-orange-300 bg-orange-50' : 'border-gray-200'} rounded-md p-4 cursor-pointer transition-colors shadow-sm`}
                onClick={() => setOption('existing')}
              >
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="existing" id="existing" className="mt-1" />
                  <div>
                    <Label htmlFor="existing" className="text-black font-semibold cursor-pointer">
                      Manually create a UTXO (Advanced)
                    </Label>
                    <p className="text-gray-600 mt-1">
                      Manually send Bitcoin and enter transaction details yourself.
                    </p>
                  </div>
                </div>
              </div>
            </RadioGroup>
          </>
        );

      case 'payment':
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-100 p-5 rounded-md">
              <h3 className="text-md font-medium text-blue-800 mb-4">Step 1: Send Bitcoin</h3>

              <div className="space-y-4">
                {/* Network badge */}
                <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                  network === 'mainnet'
                    ? 'bg-red-200 text-red-800'
                    : network === 'testnet'
                      ? 'bg-yellow-200 text-yellow-800'
                      : 'bg-blue-200 text-blue-800'
                }`}>
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {network === 'mainnet'
                    ? 'MAINNET (REAL BITCOIN)'
                    : network === 'testnet'
                      ? 'TESTNET'
                      : 'Development Network'}
                </div>

                <div>
                  <p className="text-sm text-blue-700 mb-2">
                    Send <span className="font-medium">{satoshiAmount} sats</span> to this Bitcoin address:
                  </p>
                  <div className="flex items-center gap-2">
                    {isAddressLoading ? (
                      <div className="bg-blue-100 p-3 rounded text-sm text-blue-900 break-all flex-grow flex items-center justify-center">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                          <span>Loading address...</span>
                        </div>
                      </div>
                    ) : addressError ? (
                      <div className="bg-red-100 p-3 rounded text-sm text-red-900 break-all flex-grow">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 mt-0.5 text-red-700 flex-shrink-0" />
                          <div>
                            <p className="font-semibold">Error loading address:</p>
                            <p>{addressError}</p>
                            <button
                              onClick={fetchBitcoinAddress}
                              className="mt-2 text-xs bg-red-200 hover:bg-red-300 text-red-800 px-2 py-1 rounded"
                            >
                              Try Again
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <code className="bg-blue-100 p-3 rounded text-sm text-blue-900 break-all flex-grow">{bitcoinAddress}</code>
                    )}
                    {!isAddressLoading && !addressError && (
                      <button
                        onClick={() => copyToClipboard(bitcoinAddress)}
                        className="p-2 rounded hover:bg-blue-200 text-blue-700"
                        title="Copy to clipboard"
                      >
                        <Copy className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 p-3 bg-blue-100 rounded-md">
                  <h4 className="text-sm font-semibold text-blue-800 mb-2">
                    Next steps after sending Bitcoin:
                  </h4>
                  <ol className="list-decimal pl-5 text-sm text-blue-700 space-y-1">
                    <li>Wait for at least 1 confirmation</li>
                    <li>Find your transaction ID (txid) and output index (vout) in your wallet</li>
                    <li>You'll enter these details in the next step</li>
                  </ol>
                </div>

                {(network === 'mainnet' || network === 'testnet') && (
                  <div>
                    <a
                      href={network === 'mainnet' ? 'https://mempool.space' : 'https://mempool.space/testnet'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-sm text-blue-600 hover:underline mt-2"
                    >
                      Check your transaction on Mempool.space <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </div>
                )}

                {(network === 'regtest' || network === 'devnet') && (
                  <div className="text-sm text-blue-700 mt-2">
                    <p>For a development network, you may need to mine a block to confirm your transaction.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'details':
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-100 p-5 rounded-md">
              <h3 className="text-md font-medium text-blue-800 mb-4">Step 2: Enter Transaction Details</h3>

              <div className="space-y-5">
                <div className="grid gap-2">
                  <Label htmlFor="txid" className="text-black font-medium">
                    Transaction ID (txid)
                  </Label>
                  <div className="relative">
                    <Input
                      id="txid"
                      value={txid}
                      onChange={(e) => setTxid(e.target.value)}
                      placeholder="e.g., 1a2b3c4d5e6f..."
                      className="border-gray-300 text-black pr-9"
                    />
                    {txid && (network === 'mainnet' || network === 'testnet') && (
                      <button
                        type="button"
                        onClick={() => openExplorer(txid)}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        title="View transaction in explorer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">The unique identifier of your Bitcoin transaction</p>
                  {errors.txid && <p className="text-red-500 text-xs mt-1">{errors.txid}</p>}
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
                  <p className="text-xs text-gray-500">Usually 0 for the first output in your transaction</p>
                  {errors.vout && <p className="text-red-500 text-xs mt-1">{errors.vout}</p>}
                </div>
              </div>
            </div>
          </div>
        );

      case 'confirm':
        return (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-100 p-5 rounded-md">
              <div className="flex items-center mb-4">
                <Check className="h-6 w-6 text-green-500 mr-2" />
                <h3 className="text-md font-medium text-green-800">Ready to Deploy</h3>
              </div>

              {/* Network badge */}
              <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                network === 'mainnet'
                  ? 'bg-red-200 text-red-800'
                  : network === 'testnet'
                    ? 'bg-yellow-200 text-yellow-800'
                    : 'bg-blue-200 text-blue-800'
              }`}>
                <AlertTriangle className="h-3 w-3 mr-1" />
                {network === 'mainnet'
                  ? 'MAINNET (REAL BITCOIN)'
                  : network === 'testnet'
                    ? 'TESTNET'
                    : 'Development Network'}
              </div>

              {option === 'new' ? (
                <p className="text-sm text-green-700">
                  Your program will be automatically deployed using a new UTXO created with your connected wallet.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-green-700">
                    Your program will be deployed using the following transaction:
                  </p>
                  <div className="bg-green-100 p-3 rounded-md">
                    <div className="grid grid-cols-3 gap-1 text-sm">
                      <div className="text-green-800 font-medium">Transaction ID:</div>
                      <div className="col-span-2 text-green-900 font-mono text-xs break-all">{txid}</div>

                      <div className="text-green-800 font-medium">Output Index:</div>
                      <div className="col-span-2 text-green-900">{vout}</div>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-sm text-green-700 mt-4">
                Click "Deploy Program" to complete the deployment process.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Render navigation buttons based on current step
  const renderNavButtons = () => {
    // Define button visibility based on current step
    const showBack = currentStep !== 'select';
    const showNext = currentStep !== 'confirm';
    const showDeploy = currentStep === 'confirm';

    // Determine if next button should be disabled
    const nextDisabled =
      (currentStep === 'select' && option === 'new' && !isConnected) ||
      (currentStep === 'details' && (!txid || vout === ''));

    return (
      <div className="flex justify-between w-full">
        <div>
          {showBack ? (
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={isDeploying}
              className="border-gray-300 text-black min-w-[80px]"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          ) : (
            <div className="min-w-[80px]"></div> // Spacer when back button is not shown
          )}
        </div>

        <div className="flex space-x-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isDeploying}
            className="border-gray-300 bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900 min-w-[80px]"
          >
            Cancel
          </Button>

          {showNext && (
            <Button
              type="button"
              onClick={nextStep}
              disabled={nextDisabled}
              className="bg-[#E05A1A] hover:bg-[#d14e12] text-white border-0 min-w-[80px]"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}

          {showDeploy && (
            <Button
              type="submit"
              onClick={handleSubmit}
              disabled={isDeploying}
              className="bg-[#E05A1A] hover:bg-[#d14e12] text-white border-0 min-w-[80px]"
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
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white max-w-xl p-0 overflow-hidden rounded-lg">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-black mb-2">{getStepTitle()}</h2>

          {renderProgress()}

          {renderStepContent()}
        </div>

        <div className="flex justify-end p-4 border-t border-gray-200">
          {renderNavButtons()}
        </div>
      </DialogContent>
    </Dialog>
  );
};