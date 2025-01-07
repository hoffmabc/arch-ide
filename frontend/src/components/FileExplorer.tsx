// src/components/FileExplorer.tsx
import React, { useState, useRef, useEffect } from 'react';
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
import { Button } from '@/components/ui/button';

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
  hasProjects: boolean;
  files: FileNode[];
  onFileSelect: (file: FileNode) => void;
  onUpdateTree: (operation: 'create' | 'delete' | 'rename', path: string[], type?: 'file' | 'directory', newName?: string, children?: FileNode[]) => void;
  onNewItem: (path: string[], type: 'file' | 'directory', fileName?: string, content?: string) => void;
  expandedFolders: Set<string>;
  onExpandedFoldersChange: (folders: Set<string>) => void;
  currentFile: FileNode | null;
  onNewProject?: () => void;
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

  // Check if this is the src folder
  const isSrcFolder = node.type === 'directory' && node.name === 'src';

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onNewFile) return;

    try {
      const content = await readFileContent(file);
      onNewFile(file.name, content);
    } catch (error) {
      console.error('Failed to read file:', error);
    }
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
            <DropdownMenuItem onClick={() => onNewFile?.('', '')}>
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
        {/* Only show delete option if it's not the src folder */}
        {!isSrcFolder && (
          <DropdownMenuItem className="text-red-400" onClick={handleDelete}>
            <Trash2 size={16} className="mr-2" />
            Delete
          </DropdownMenuItem>
        )}
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
  onUpdateTree: (operation: 'create' | 'delete' | 'rename', path: string[], type?: 'file' | 'directory', newName?: string, children?: FileNode[]) => void;
  onNewItem: (path: string[], type: 'file' | 'directory', fileName?: string, content?: string) => void;
  expandedFolders: Set<string>;
  onExpandedFoldersChange: (folders: Set<string>) => void;
  currentFile: FileNode | null;
}) => {
  const [isInlineRenaming, setIsInlineRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if this is the top-level src folder
  const isTopLevelSrc = node.name === 'src' && path.length === 0;

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTopLevelSrc) {
      setIsInlineRenaming(true);
      setNewName(node.name);
    }
  };

  const handleRename = () => {
    if (newName && newName !== node.name) {
      onUpdateTree('rename', [...path, node.name], undefined, newName);
    }
    setIsInlineRenaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setIsInlineRenaming(false);
      setNewName(node.name);
    }
  };

  // Focus input when entering rename mode
  useEffect(() => {
    if (isInlineRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isInlineRenaming]);

  // Helper to ensure parent folders are expanded
  const ensureParentFoldersExpanded = (itemPath: string[]) => {
    const newExpandedFolders = new Set(expandedFolders);

    // Build paths for each level and add to expanded set
    let currentPath = '';
    for (const segment of itemPath) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      newExpandedFolders.add(currentPath);
    }

    onExpandedFoldersChange(newExpandedFolders);
  };

  const handleNewFile = async (fileName: string, content: string) => {
    console.log('handleNewFile called with:', { fileName, content });
    // Ensure the parent folder is expanded before creating the file
    const parentPath = [...path, node.name];
    ensureParentFoldersExpanded(parentPath);

    // Wait for the next render cycle to ensure folder is expanded
    setTimeout(() => {
      onNewItem(parentPath, 'file', fileName, content);
    }, 0);
  };

  const handleNewFolder = () => {
    console.log('handleNewFolder called with path:', path);
    // Ensure the parent folder is expanded before creating the folder
    const parentPath = [...path, node.name];
    ensureParentFoldersExpanded(parentPath);

    // Wait for the next render cycle to ensure folder is expanded
    setTimeout(() => {
      onNewItem(parentPath, 'directory');
    }, 0);
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
          <div
            className="ml-2 flex-1"
            onDoubleClick={handleDoubleClick}
          >
            {isInlineRenaming ? (
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={handleKeyDown}
                className="bg-gray-700 text-sm px-1 w-full outline-none border border-blue-500 rounded"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="text-sm">{node.name}</span>
            )}
          </div>
        </div>
        {!isInlineRenaming && (
          <div className="opacity-0 group-hover:opacity-100 pr-2">
            <FileContextMenu
              node={node}
              onNewFile={handleNewFile}
              onNewFolder={handleNewFolder}
              onDelete={() => {
                onUpdateTree('delete', [...path, node.name]);
              }}
              onRename={() => setIsInlineRenaming(true)}
            />
          </div>
        )}
      </div>
      {node.type === 'directory' && node.children && expandedFolders.has(getNodePath(node, path)) && (
        [...node.children]
          .sort((a, b) => {
            // First sort by type (directories first)
            if (a.type === 'directory' && b.type === 'file') return -1;
            if (a.type === 'file' && b.type === 'directory') return 1;
            // Then sort alphabetically
            return a.name.localeCompare(b.name);
          })
          .map((child: FileNode, i: number) => (
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

const FileExplorer = ({ hasProjects, files, onFileSelect, onUpdateTree, onNewItem, expandedFolders, onExpandedFoldersChange, currentFile, onNewProject }: FileExplorerProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    try {
      let srcNode: FileNode = {
        name: 'src',
        type: 'directory',
        children: []
      };

      for (const file of files) {
        // Skip non-Rust files
        if (!file.name.endsWith('.rs')) continue;

        // Get content
        const content = await readFileContent(file);

        // For directory imports
        if (file.webkitRelativePath) {
          const pathParts = file.webkitRelativePath.split('/');
          const srcIndex = pathParts.indexOf('src');

          // Skip files not in src directory
          if (srcIndex === -1) continue;

          // Get the path parts after src
          const relevantParts = pathParts.slice(srcIndex + 1);
          if (relevantParts.length === 0) continue;

          // Add file to appropriate location in src directory
          let currentLevel = srcNode.children!;

          // Create subdirectories if needed
          for (let i = 0; i < relevantParts.length - 1; i++) {
            const part = relevantParts[i];
            let dirNode = currentLevel.find(
              node => node.type === 'directory' && node.name === part
            );

            if (!dirNode) {
              dirNode = {
                name: part,
                type: 'directory',
                children: []
              };
              currentLevel.push(dirNode);
            }
            currentLevel = dirNode.children!;
          }

          // Add the file
          currentLevel.push({
            name: relevantParts[relevantParts.length - 1],
            type: 'file',
            content
          });
        } else {
          // For single file imports
          srcNode.children.push({
            name: file.name,
            type: 'file',
            content
          });
        }
      }

      // Only update if we have files
      if (srcNode.children && srcNode.children.length > 0) {
        onUpdateTree('create', [], 'directory', undefined, [srcNode]);
      }

    } catch (error) {
      console.error('Failed to read files:', error);
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
            className="hover:bg-gray-700 p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => onNewItem([], 'file')}
            disabled={!hasProjects}
          >
            <Plus size={16} />
          </button>
          <button
            className="hover:bg-gray-700 p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => onNewItem([], 'directory')}
            disabled={!hasProjects}
          >
            <Folder size={16} />
          </button>
          <button
            className="hover:bg-gray-700 p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => fileInputRef.current?.click()}
            disabled={!hasProjects}
          >
            <Upload size={16} />
          </button>
        </div>
      </div>

      {!hasProjects ? (
        <div className="flex flex-col items-center justify-center h-[calc(100%-48px)] gap-4 text-gray-400">
          <p className="text-sm">No projects found</p>
          <Button
            variant="default"
            onClick={onNewProject}
            className="bg-pink-500 hover:bg-pink-600 text-white"
          >
            Create New Project
          </Button>
        </div>
      ) : (
        [...files]
          .sort((a, b) => {
            // First sort by type (directories first)
            if (a.type === 'directory' && b.type === 'file') return -1;
            if (a.type === 'file' && b.type === 'directory') return 1;
            // Then sort alphabetically
            return a.name.localeCompare(b.name);
          })
          .map((file, i) => (
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
          ))
      )}

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        onChange={handleFileSelect}
        accept=".rs"
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