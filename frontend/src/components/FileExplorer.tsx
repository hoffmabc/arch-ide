// src/components/FileExplorer.tsx
import React, { useState } from 'react';
import { 
  Folder, 
  File,
  ChevronRight, 
  ChevronDown, 
  MoreVertical, 
  Plus, 
  Trash2,
  FileJson,
  FileText,
  Pencil,
  FileCode,
  FileType,
  Terminal,
  FileImage,
  FileVideo,
  FileAudio,
  FileCog,
  FileSearch,
  FileKey,
  FileSpreadsheet,
  Package
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import RenameDialog from './RenameDialog';


interface FileNode {
  name: string;
  type: 'file' | 'directory';
  content?: string;
  children?: FileNode[];
}

const getNodePath = (node: FileNode, path: string[] = []): string => {
  return [...path, node.name].join('/');
};

const getFileIcon = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    // Programming Languages
    case 'js':
    case 'jsx':
      return <FileCode size={16} className="ml-1 text-yellow-400" />;
    case 'ts':
    case 'tsx':
      return <FileCode size={16} className="ml-1 text-blue-400" />;
    case 'py':
      return <FileCode size={16} className="ml-1 text-green-500" />;
    case 'rs':
      return <FileType size={16} className="ml-1 text-orange-400" />;
    case 'go':
      return <FileCode size={16} className="ml-1 text-cyan-400" />;
    
    // Config files
    case 'json':
      return <FileJson size={16} className="ml-1 text-yellow-300" />;
    case 'yaml':
    case 'yml':
      return <FileCog size={16} className="ml-1 text-red-400" />;
    case 'toml':
      return <FileCog size={16} className="ml-1 text-blue-300" />;
    
    // Shell scripts
    case 'sh':
    case 'bash':
      return <Terminal size={16} className="ml-1 text-purple-400" />;
    
    // Documentation
    case 'md':
    case 'txt':
      return <FileText size={16} className="ml-1 text-blue-200" />;
    
    // Package files
    case 'lock':
      return <FileKey size={16} className="ml-1 text-red-300" />;
    case 'cargo':
      return <Package size={16} className="ml-1 text-orange-300" />;
    
    // Media files
    case 'jpg':
    case 'png':
    case 'gif':
    case 'svg':
      return <FileImage size={16} className="ml-1 text-pink-400" />;
    case 'mp4':
    case 'mov':
      return <FileVideo size={16} className="ml-1 text-purple-500" />;
    case 'mp3':
    case 'wav':
      return <FileAudio size={16} className="ml-1 text-green-400" />;
    
    // Default
    default:
      return <File size={16} className="ml-1 text-gray-400" />;
  }
};

interface FileExplorerProps {
  files: FileNode[];
  onFileSelect: (file: FileNode) => void;
  onUpdateTree: (
    operation: 'create' | 'delete' | 'rename',
    path: string[],
    type?: 'file' | 'directory',
    newName?: string
  ) => void;
  onNewItem: (path: string[], type: 'file' | 'directory') => void;
}

interface FileContextMenuProps {
  node: FileNode;
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onDelete?: () => void;
  onRename?: () => void;
}

const FileContextMenu = ({ node, onNewFile, onNewFolder, onDelete, onRename }: FileContextMenuProps) => {
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
        <DropdownMenuItem onClick={onRename}>
          <Pencil size={16} className="mr-2" />
          Rename
        </DropdownMenuItem>
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
  const [isRenaming, setIsRenaming] = useState(false);

  const handleNewFile = () => {
    console.log('handleNewFile called with path:', path);
    onNewItem([...path, node.name], 'file');
  };

  const handleNewFolder = () => {
    console.log('handleNewFolder called with path:', path);
    onNewItem([...path, node.name], 'directory');
  };

  const handleRename = (newName: string) => {
    onUpdateTree('rename', [...path, node.name], undefined, newName);
    setIsRenaming(false);
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
              onSelect({
                ...node,
                path: getNodePath(node, path)
              });
            }
          }}
        >
          {node.type === 'directory' && (
            isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
          )}
          {node.type === 'directory' ? (
            <Folder size={16} className="ml-1 text-blue-400" />
          ) : (
            getFileIcon(node.name)
          )}
          <span className="ml-2 text-sm">{node.name}</span>
        </div>
        <div className="opacity-0 group-hover:opacity-100 pr-2">
          <FileContextMenu
            node={node}
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            onDelete={() => onUpdateTree('delete', [...path, node.name])}
            onRename={() => setIsRenaming(true)}
          />
          <RenameDialog
            isOpen={isRenaming}
            onClose={() => setIsRenaming(false)}
            onRename={handleRename}
            currentName={node.name}
            type={node.type}
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
    <div className="bg-gray-800 w-full h-full overflow-y-auto border-r border-gray-700">
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