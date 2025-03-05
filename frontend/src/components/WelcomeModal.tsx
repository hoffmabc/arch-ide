import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";

interface WelcomeModalProps {
  isOpen: boolean;
  onStart: () => void;
  onSkip: () => void;
}

export const WelcomeModal = ({ isOpen, onStart, onSkip }: WelcomeModalProps) => {
  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Welcome to Arch Network!</DialogTitle>
          <DialogDescription>
            Would you like to walk through a quick tutorial to learn the basics?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onSkip}>Skip Tutorial</Button>
          <Button onClick={onStart}>Start Tutorial</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};