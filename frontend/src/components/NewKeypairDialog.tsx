import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { AlertTriangle, WifiOff } from "lucide-react";
import { useState } from "react";
import { useToast } from "./ui/use-toast";

interface NewKeypairDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isConnected: boolean;
}

export const NewKeypairDialog = ({
  isOpen,
  onClose,
  onConfirm,
  isConnected
}: NewKeypairDialogProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    if (!isConnected) {
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: "Cannot generate new keypair. Please check your RPC connection and try again.",
      });
      return;
    }

    setIsGenerating(true);
    try {
      await onConfirm();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to generate new keypair. Please try again.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl font-mono text-gray-900">Create a new program keypair?</DialogTitle>
          <DialogDescription className="pt-4">
            This will create a brand new keypair for your program.
          </DialogDescription>
        </DialogHeader>

        {!isConnected && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 rounded-md">
            <WifiOff className="h-5 w-5 text-red-500" />
            <p className="text-sm text-red-500">
              No RPC connection available. Please check your connection and try again.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 p-3 bg-yellow-500/10 rounded-md">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          <p className="text-sm text-yellow-500">
            The old keypair will be lost if you don't save it.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="text-gray-900 border-gray-300">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isConnected || isGenerating}
          >
            {isGenerating ? "Generating..." : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};