import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
  } from "./ui/dialog";
  import { Button } from "./ui/button";
  import { Copy } from "lucide-react";
  import { useEffect, useState } from "react";
  import { X } from "lucide-react";

  const MODAL_PREFERENCE_KEY = 'connection-modal-dismissed';

  interface ConnectionErrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    network: string;
    persistDismissal?: boolean;
  }

  export const ConnectionErrorModal = ({
    isOpen,
    onClose,
    network,
    persistDismissal = true
  }: ConnectionErrorModalProps) => {
    const isLocalnet = network === 'devnet';
    const [os, setOs] = useState<'mac' | 'linux' | 'windows' | 'unknown'>('unknown');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
      // Detect operating system
      const platform = window.navigator.platform.toLowerCase();
      if (platform.includes('mac')) {
        setOs('mac');
      } else if (platform.includes('linux')) {
        setOs('linux');
      } else if (platform.includes('win')) {
        setOs('windows');
      }
    }, []);

    const getInstallInstructions = () => {
      switch (os) {
        case 'mac':
          return {
            title: "Install Arch Network local validator (MacOS)",
            command: "$(curl -sSfL https://release.arch.network/latest/install.sh)"
          };
        case 'linux':
          return {
            title: "Install Arch Network local validator (Linux)",
            command: "$(curl -sSfL https://release.arch.network/latest/install.sh)"
          };
        default:
          return {
            title: "Install Arch Network local validator",
            command: "Installation instructions not available for your operating system"
          };
      }
    };

    const instructions = getInstallInstructions();

    const handleCopy = async () => {
      await navigator.clipboard.writeText(`sh -c "${instructions.command}"`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const handleClose = () => {
      if (persistDismissal) {
        localStorage.setItem(MODAL_PREFERENCE_KEY, 'true');
      }
      onClose();
    };

    // Check if modal was previously dismissed
    const shouldShow = () => {
      if (!persistDismissal) return isOpen;
      const dismissed = localStorage.getItem(MODAL_PREFERENCE_KEY);
      return isOpen && !dismissed;
    };

    if (!shouldShow()) return null;

    return (
      <Dialog open={true} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px] bg-[#1C1E26] border-gray-800">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="text-xl font-mono text-white">
              Connect to {network}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 hover:bg-gray-700 text-gray-400 hover:text-white absolute right-4 top-4"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>

          <div className="bg-[#15171E] text-red-400 p-4 rounded-md flex items-center gap-2 mt-4">
            <span className="text-2xl">☹</span>
            <span>Unable to connect to {network}</span>
          </div>

          <div className="mt-6">
            <h2 className="text-lg font-mono text-white mb-2">
              {isLocalnet ? 'How to connect' : 'Connection Issues'}
            </h2>
            <p className="text-gray-400 mb-6">
              {isLocalnet
                ? 'Here are the steps for connecting to localnet from playground.'
                : `Common solutions for connecting to ${network}:`}
            </p>

            <div className="space-y-6">
              {isLocalnet ? (
                <>
                  <div>
                    <h3 className="text-white font-mono mb-2">
                      1. {instructions.title}
                    </h3>
                    <p className="text-gray-400 mb-2">
                      Run the following command in your terminal:
                    </p>
                    <div className="bg-[#15171E] p-4 rounded-md font-mono text-sm whitespace-pre-wrap overflow-x-auto relative group">
                      <code>
                        {os !== 'unknown' ? (
                          <>
                            <span className="text-green-400">sh</span>{" "}
                            <span className="text-white">-c</span>{" "}
                            <span className="text-green-400">
                              "{instructions.command}"
                            </span>
                          </>
                        ) : (
                          <span className="text-yellow-400">
                            {instructions.command}
                          </span>
                        )}
                      </code>
                      {os !== 'unknown' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-2 bg-gray-700/50 hover:bg-gray-600 text-gray-300 hover:text-white"
                          onClick={handleCopy}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {copied && (
                      <p className="text-sm text-green-400 mt-1">Copied to clipboard!</p>
                    )}
                    {/* {os !== 'unknown' && (
                      <button className="text-purple-400 text-sm mt-2">
                        Other installation methods
                      </button>
                    )} */}
                  </div>

                  <div>
                    <h3 className="text-white font-mono mb-2">
                      2. Start the local validator
                    </h3>
                    <div className="bg-[#15171E] p-4 rounded-md font-mono text-sm">
                      <code>
                        <span className="text-green-400">arch-local-validator</span>
                        <span className="text-white"> --bitcoin-rpc-endpoint </span>
                        <span className="text-green-400">[bitcoin-rpc-endpoint]</span>
                        <span className="text-white"> --bitcoin-rpc-port </span>
                        <span className="text-green-400">[bitcoin-rpc-port]</span>
                        <span className="text-white"> --bitcoin-rpc-username </span>
                        <span className="text-green-400">[bitcoin-rpc-username]</span>
                        <span className="text-white"> --bitcoin-rpc-password </span>
                        <span className="text-green-400">[bitcoin-rpc-password]</span>
                      </code>
                    </div>
                  </div>
                </>
              ) : (
                <ul className="list-disc pl-4 space-y-3 text-gray-300">
                  <li>Check your internet connection</li>
                  <li>Verify the RPC endpoint is correct</li>
                  <li>Make sure the {network} is currently operational</li>
                  <li>Try switching to a different RPC endpoint</li>
                </ul>
              )}
            </div>

            <div className="mt-6 text-gray-400 text-sm">
              {isLocalnet ? (
                <a href="https://docs.arch.network" target="_blank" rel="noopener noreferrer" className="text-white font-mono flex items-center gap-2">
                  <span>❯</span> Having issues?
                </a>
              ) : (
                <p>You can change your RPC endpoint in the configuration panel.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };