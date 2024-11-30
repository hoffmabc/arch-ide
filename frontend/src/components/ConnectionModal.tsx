import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
  } from "./ui/dialog";
  import { X } from "lucide-react";
  import { Button } from "./ui/button";
  
  interface ConnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
  }
  
  export const ConnectionModal = ({ isOpen, onClose }: ConnectionModalProps) => {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px] bg-[#1C1E26] border-gray-800">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-mono text-white">
                Connect to localnet
              </DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
  
          <div className="bg-[#15171E] text-red-400 p-4 rounded-md flex items-center gap-2 mt-4">
            <span className="text-2xl">☹</span>
            <span>Unable to connect to localnet</span>
          </div>
  
          <div className="mt-6">
            <h2 className="text-lg font-mono text-white mb-2">How to connect</h2>
            <p className="text-gray-400 mb-6">
              Here are the steps for connecting to localnet from playground.
            </p>
  
            <div className="space-y-6">
              <div>
                <h3 className="text-white font-mono mb-2">
                  1. Install Solana toolchain(MacOS)
                </h3>
                <p className="text-gray-400 mb-2">
                  Run the following command in your terminal:
                </p>
                <pre className="bg-[#15171E] p-4 rounded-md font-mono text-sm">
                  <code>
                    <span className="text-green-400">sh</span>{" "}
                    <span className="text-white">-c</span>{" "}
                    <span className="text-green-400">
                      "$(curl -sSfL https://release.solana.com/stable/install)"
                    </span>
                  </code>
                </pre>
                <button className="text-purple-400 text-sm mt-2">
                  Other installation methods
                </button>
              </div>
  
              <div>
                <h3 className="text-white font-mono mb-2">
                  2. Start a local test validator
                </h3>
                <pre className="bg-[#15171E] p-4 rounded-md font-mono text-sm">
                  <code>
                    <span className="text-green-400">solana-test-validator</span>
                  </code>
                </pre>
              </div>
            </div>
  
            <div className="mt-6">
              <button className="text-white font-mono flex items-center gap-2">
                <span>❯</span> Having issues?
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };