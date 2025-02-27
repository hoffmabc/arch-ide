import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (name: string, description: string) => void;
}

const NewProjectDialog = ({ isOpen, onClose, onCreateProject }: NewProjectDialogProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateProject(name, description);
    setName('');
    setDescription('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Create New Project</DialogTitle>
          <DialogDescription className="text-gray-500">
            Create a new Arch Network project with the basic template
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-gray-700">
                Project Name
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-gray-300 bg-white text-gray-900 focus:border-gray-400 focus:ring-gray-400"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="description" className="text-gray-700">
                Description
              </label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="border-gray-300 bg-white text-gray-900 focus:border-gray-400 focus:ring-gray-400"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}
              className="border-gray-300 bg-white text-gray-900 hover:bg-gray-50">
              Cancel
            </Button>
            <Button type="submit" className="bg-[#E05A1A] hover:bg-[#d14e12] text-white">
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewProjectDialog;