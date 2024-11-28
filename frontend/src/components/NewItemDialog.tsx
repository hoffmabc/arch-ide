import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface NewItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  type: 'file' | 'directory';
}

const NewItemDialog = ({ isOpen, onClose, onSubmit, type }: NewItemDialogProps) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
      setName('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {type === 'file' ? 'File' : 'Folder'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Enter ${type === 'file' ? 'file' : 'folder'} name`}
            className="mt-4"
          />
          <DialogFooter className="mt-4">
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewItemDialog;