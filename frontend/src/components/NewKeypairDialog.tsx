import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "./ui/dialog";
  import { Button } from "./ui/button";
  import { AlertTriangle } from "lucide-react";
  
  interface NewKeypairDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
  }
  
  export const NewKeypairDialog = ({ isOpen, onClose, onConfirm }: NewKeypairDialogProps) => {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new program keypair?</DialogTitle>
            <DialogDescription className="pt-4">
              This will create a brand new keypair for your program.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex items-center gap-2 p-3 bg-yellow-500/10 rounded-md">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <p className="text-sm text-yellow-500">
              The old keypair will be lost if you don't save it.
            </p>
          </div>
  
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onConfirm}>
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };