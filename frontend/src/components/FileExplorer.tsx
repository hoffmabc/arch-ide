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
  onNewItem: (path: string[], type: 'file' | 'directory') => void;
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
  path = [],
  depth = 0, 
  onSelect,
  onUpdateTree,
  onNewItem
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleNewFile = () => {
    console.log('handleNewFile called with path:', path);
    onNewItem([...path, node.name], 'file');
  };

  const handleNewFolder = () => {
    console.log('handleNewFolder called with path:', path);
    onNewItem([...path, node.name], 'directory');
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
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            onDelete={() => onUpdateTree('delete', [...path, node.name])}
          />
        </div>
      </div>
      {isOpen && node.children?.map((child, i) => (
        <FileExplorerItem 
          key={i} 
          node={child} 
          path={[...path, node.name]}
          depth={depth + 1} 
          onSelect={onSelect}
          onUpdateTree={onUpdateTree}
          onNewItem={onNewItem}
        />
      ))}
    </div>
  );
};

const FileExplorer = ({ files, onFileSelect, onUpdateTree, onNewItem }: FileExplorerProps) => {
  return (
    <div className="bg-gray-800 w-64 h-full overflow-y-auto border-r border-gray-700">
      <div className="p-2 border-b border-gray-700 font-medium">Explorer</div>
      {files.map((file, i) => (
        <FileExplorerItem 
          key={i} 
          node={file} 
          path={[]}  // Add this line
          onSelect={onFileSelect}
          onUpdateTree={onUpdateTree}
          onNewItem={onNewItem}
        />
      ))}
    </div>
  );
};

export default FileExplorer;