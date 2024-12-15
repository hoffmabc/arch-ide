// src/components/FileExplorer.tsx
import React, { useState, useRef } from 'react';
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
  Package,
  Upload
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import RenameDialog from './RenameDialog';
import { cn } from '../lib/utils';
import type { FileNode } from '../types';
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
  onUpdateTree: (operation: 'create' | 'delete' | 'rename', path: string[], type?: 'file' | 'directory', newName?: string) => void;
  onNewItem: (path: string[], type: 'file' | 'directory', fileName?: string, content?: string) => void;
  expandedFolders: Set<string>;
  onExpandedFoldersChange: (folders: Set<string>) => void;
  currentFile: FileNode | null;
}

interface FileContextMenuProps {
  node: FileNode;
  onNewFile?: (fileName: string, content: string) => void;
  onNewFolder?: () => void;
  onDelete?: () => void;
  onRename?: () => void;
}

const FileContextMenu = ({ node, onNewFile, onNewFolder, onDelete, onRename }: FileContextMenuProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onNewFile) return;

    try {
      const content = await readFileContent(file);
      console.log('File content read:', content);
      // Pass the original filename and content directly
      onNewFile(file.name, content);
    } catch (error) {
      console.error('Failed to read file:', error);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = () => {
    if (node.type === 'directory') {
      const message = `Are you sure you want to delete the folder "${node.name}" and all its contents?`;
      if (window.confirm(message)) {
        onDelete?.();
      }
    } else {
      onDelete?.();
    }
  };

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
            <DropdownMenuItem onClick={() => onNewFile?.('New File', '')}>
              <Plus size={16} className="mr-2" />
              New File
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onNewFolder}>
              <Folder size={16} className="mr-2" />
              New Folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} className="mr-2" />
              Import File
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onClick={onRename}>
          <Pencil size={16} className="mr-2" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem className="text-red-400" onClick={handleDelete}>
          <Trash2 size={16} className="mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileSelect}
      />
    </DropdownMenu>
  );
};

const FileExplorerItem = ({
  node,
  path = [],
  depth = 0,
  onSelect,
  onUpdateTree,
  onNewItem,
  expandedFolders,
  onExpandedFoldersChange,
  currentFile
}: {
  node: FileNode;
  path?: string[];
  depth?: number;
  onSelect: (file: FileNode) => void;
  onUpdateTree: (operation: 'create' | 'delete' | 'rename', path: string[], type?: 'file' | 'directory', newName?: string) => void;
  onNewItem: (path: string[], type: 'file' | 'directory', fileName?: string, content?: string) => void;
  expandedFolders: Set<string>;
  onExpandedFoldersChange: (folders: Set<string>) => void;
  currentFile: FileNode | null;
}) => {
  const [isRenaming, setIsRenaming] = useState(false);

  const handleNewFile = async (fileName: string, content: string) => {
    console.log('handleNewFile called with:', { fileName, content });
    onNewItem([...path, node.name], 'file', fileName, content);
  };

  const handleNewFolder = () => {
    console.log('handleNewFolder called with path:', path);
    onNewItem([...path, node.name], 'directory');
  };

  const handleRename = (newName: string) => {
    onUpdateTree('rename', [...path, node.name], undefined, newName);
    setIsRenaming(false);
  };

  const isSelected = currentFile?.path === getNodePath(node, path);

  return (
    <div className="select-none">
      <div className="flex items-center group">
        <div
          className={cn(
            "flex-1 flex items-center hover:bg-gray-700 px-2 py-1 cursor-pointer",
            isSelected && "bg-gray-700"
          )}
          style={{ paddingLeft: `${depth * 12}px` }}
          onClick={() => {
            if (node.type === 'directory') {
              const nodePath = getNodePath(node, path);
              const newExpandedFolders = new Set(expandedFolders);
              if (expandedFolders.has(nodePath)) {
                newExpandedFolders.delete(nodePath);
              } else {
                newExpandedFolders.add(nodePath);
              }
              onExpandedFoldersChange(newExpandedFolders);
            } else {
              const nodePath = getNodePath(node, path);
              onSelect({
                ...node,
                path: nodePath
              });
            }
          }}
        >
          {node.type === 'directory' && (
            expandedFolders.has(getNodePath(node, path))
              ? <ChevronDown size={16} />
              : <ChevronRight size={16} />
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
            onDelete={() => {
              console.log('Delete triggered for path:', [...path, node.name]);
              onUpdateTree('delete', [...path, node.name]);
            }}
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
      {node.type === 'directory' && node.children && expandedFolders.has(getNodePath(node, path)) && (
        node.children.map((child: FileNode, i: number) => (
          <FileExplorerItem
            key={i}
            node={child}
            path={[...path, node.name]}
            depth={depth + 1}
            onSelect={onSelect}
            onUpdateTree={onUpdateTree}
            onNewItem={onNewItem}
            expandedFolders={expandedFolders}
            onExpandedFoldersChange={onExpandedFoldersChange}
            currentFile={currentFile}
          />
        ))
      )}
    </div>
  );
};

const FileExplorer = ({ files, onFileSelect, onUpdateTree, onNewItem, expandedFolders, onExpandedFoldersChange, currentFile }: FileExplorerProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await readFileContent(file);
      onNewItem([], 'file', file.name, content);
    } catch (error) {
      console.error('Failed to read file:', error);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-gray-800 w-full h-full overflow-y-auto border-r border-gray-700">
      <div className="p-2 border-b border-gray-700 font-medium flex justify-between items-center">
        <span>Explorer</span>
        <div className="flex gap-1">
          <button
            className="hover:bg-gray-700 p-1 rounded"
            onClick={() => onNewItem([], 'file')}
          >
            <Plus size={16} />
          </button>
          <button
            className="hover:bg-gray-700 p-1 rounded"
            onClick={() => onNewItem([], 'directory')}
          >
            <Folder size={16} />
          </button>
          <button
            className="hover:bg-gray-700 p-1 rounded"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} />
          </button>
        </div>
      </div>
      {files.map((file, i) => (
        <FileExplorerItem
          key={i}
          node={file}
          path={[]}
          onSelect={onFileSelect}
          onUpdateTree={onUpdateTree}
          onNewItem={onNewItem}
          expandedFolders={expandedFolders}
          onExpandedFoldersChange={onExpandedFoldersChange}
          currentFile={currentFile}
        />
      ))}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
};

const readFileContent = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as string);
      } else {
        reject(new Error('Failed to read file'));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

const getFileType = (fileName: string): 'text' | 'image' | 'video' | 'audio' | 'svg' => {
  const extension = fileName.split('.').pop()?.toLowerCase();

  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'];
  const videoExtensions = ['mp4', 'webm', 'ogg', 'mov'];
  const audioExtensions = ['mp3', 'wav', 'ogg', 'aac'];

  if (extension === 'svg') return 'svg';
  if (imageExtensions.includes(extension || '')) return 'image';
  if (videoExtensions.includes(extension || '')) return 'video';
  if (audioExtensions.includes(extension || '')) return 'audio';
  return 'text';
};

export default FileExplorer;