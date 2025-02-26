import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NewItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  type: 'file' | 'directory';
}

const NewItemDialog = ({ isOpen, onClose, onSubmit, type }: NewItemDialogProps) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    // Validate file/folder name
    const isValid = /^[a-zA-Z0-9_.-]+$/.test(name);
    if (!isValid) {
      setError('Invalid name. Use only letters, numbers, underscore, dot, or dash');
      return;
    }

    onSubmit(name);
    setName('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-background text-foreground border-input">
        <DialogHeader>
          <DialogTitle className="text-foreground">New {type === 'file' ? 'File' : 'Folder'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                placeholder={type === 'file' ? 'filename.rs' : 'folder-name'}
                autoFocus
                className="bg-background text-foreground border-input"
              />
              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="text-foreground">
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewItemDialog;