// src/components/FileExplorer.tsx
import React, { useState } from 'react';
import { Folder, File, ChevronRight, ChevronDown, MoreVertical, Plus, Trash2 } from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

interface FileNode {
  name: string;
  type: 'file' | 'directory';
  content?: string;
  children?: FileNode[];
}

const getNodePath = (node: FileNode): string[] => {
  // This would need to be implemented to track the full path
  // You'd likely want to pass the full path down through props
  return [node.name];
};

interface FileExplorerProps {
  files: FileNode[];
  onFileSelect: (file: FileNode) => void;
  onUpdateTree: (operation: 'create' | 'delete', path: string[], type?: 'file' | 'directory') => void;
}

interface FileContextMenuProps {
  node: FileNode;
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onDelete?: () => void;
}

const FileContextMenu = ({ node, onNewFile, onNewFolder, onDelete }: FileContextMenuProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="hover:bg-gray-700 p-1 rounded">
          <MoreVertical size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {node.type === 'directory' && (
          <>
            <DropdownMenuItem onClick={onNewFile}>
              <Plus size={16} className="mr-2" />
              New File
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onNewFolder}>
              <Folder size={16} className="mr-2" />
              New Folder
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem className="text-red-400" onClick={onDelete}>
          <Trash2 size={16} className="mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const FileExplorerItem = ({ 
  node, 
  depth = 0, 
  onSelect,
  onUpdateTree 
}: { 
  node: FileNode; 
  depth?: number; 
  onSelect: (node: FileNode) => void;
  onUpdateTree: (operation: 'create' | 'delete', path: string[], type?: 'file' | 'directory') => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  const handleNewItem = (type: 'file' | 'directory') => {
    setIsCreating(true);
    setIsOpen(true);
  };

  const handleCreateItem = (type: 'file' | 'directory') => {
    if (newItemName) {
      onUpdateTree('create', [...getNodePath(node), newItemName], type);
      setIsCreating(false);
      setNewItemName('');
    }
  };

  return (
    <div className="select-none">
      <div className="flex items-center group">
        <div 
          className="flex-1 flex items-center hover:bg-gray-700 px-2 py-1 cursor-pointer"
          style={{ paddingLeft: `${depth * 12}px` }}
          onClick={() => {
            if (node.type === 'directory') {
              setIsOpen(!isOpen);
            } else {
              onSelect(node);
            }
          }}
        >
          {node.type === 'directory' && (
            isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
          )}
          {node.type === 'directory' ? (
            <Folder size={16} className="ml-1 text-blue-400" />
          ) : (
            <File size={16} className="ml-1 text-gray-400" />
          )}
          <span className="ml-2 text-sm">{node.name}</span>
        </div>
        <div className="opacity-0 group-hover:opacity-100 pr-2">
          <FileContextMenu
            node={node}
            onNewFile={() => handleNewItem('file')}
            onNewFolder={() => handleNewItem('directory')}
            onDelete={() => onUpdateTree('delete', getNodePath(node))}
          />
        </div>
      </div>
      {isCreating && (
        <div className="flex items-center px-2 py-1" style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
          <input
            autoFocus
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateItem('file');
              } else if (e.key === 'Escape') {
                setIsCreating(false);
                setNewItemName('');
              }
            }}
            className="bg-gray-700 px-2 py-1 text-sm rounded"
          />
        </div>
      )}
      {isOpen && node.children?.map((child, i) => (
        <FileExplorerItem 
          key={i} 
          node={child} 
          depth={depth + 1} 
          onSelect={onSelect}
          onUpdateTree={onUpdateTree}
        />
      ))}
    </div>
  );
};

const FileExplorer = ({ files, onFileSelect, onUpdateTree }: FileExplorerProps) => {
  return (
    <div className="bg-gray-800 w-64 h-full overflow-y-auto border-r border-gray-700">
      <div className="p-2 border-b border-gray-700 font-medium">Explorer</div>
      {files.map((file, i) => (
        <FileExplorerItem 
          key={i} 
          node={file} 
          onSelect={onFileSelect}
          onUpdateTree={onUpdateTree}
        />
      ))}
    </div>
  );
};

export default FileExplorer;