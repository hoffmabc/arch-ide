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
import ResizeHandle from './ResizeHandle';
import Editor from "@monaco-editor/react";
import * as ts from 'typescript';
import { ArchConnection, RpcConnection, MessageUtil, PubkeyUtil } from '@saturnbtcio/arch-sdk';
import { url } from 'inspector';
import { ArchPgClient } from '../utils/archPgClient';

window.archSdk = {
  RpcConnection,
  MessageUtil,
  PubkeyUtil,
  // Add other properties as needed
};


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
  onUpdateTree: (operation: 'create' | 'delete' | 'rename', path: string[], type?: 'file' | 'directory', newName?: string) => void;
  onNewItem: (path: string[], type: 'file' | 'directory', fileName?: string, content?: string) => void;
  expandedFolders: Set<string>;
  onExpandedFoldersChange: (folders: Set<string>) => void;
  currentFile: FileNode | null;
  onNewProject?: () => void;
  addOutputMessage: (type: string, message: string) => void;
}

interface FileContextMenuProps {
  node: FileNode;
  onNewFile: () => void;
  onNewFolder: () => void;
  onDelete: () => void;
  onRename: () => void;
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
      onNewFile();
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
            <DropdownMenuItem onClick={() => onNewFile()}>
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
  onUpdateTree: (operation: 'create' | 'delete' | 'rename', path: string[], type?: 'file' | 'directory', newName?: string) => void;
  onNewItem: (path: string[], type: 'file' | 'directory', fileName?: string, content?: string) => void;
  expandedFolders: Set<string>;
  onExpandedFoldersChange: (folders: Set<string>) => void;
  currentFile: FileNode | null;
}) => {
  const [isInlineRenaming, setIsInlineRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await readFileContent(file);
      const currentPath = [...path, node.name];
      onNewItem(currentPath, 'file', file.name, content);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error reading file:', error.message);
      } else {
        console.error('Unknown error reading file:', error);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleNewFolder = () => {
    const currentPath = [...path, node.name];
    onNewItem(currentPath, 'directory');
  };

  const handleDelete = () => {
    const currentPath = [...path, node.name];
    onUpdateTree('delete', currentPath);
  };

  const handleRename = (newName: string) => {
    if (newName && newName !== node.name) {
      const currentPath = [...path, node.name];
      onUpdateTree('rename', currentPath, undefined, newName);
    }
    setIsInlineRenaming(false);
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
          >
            {isInlineRenaming ? (
              <input
                ref={fileInputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => handleRename(newName)}
                className="bg-gray-700 text-sm px-1 w-full outline-none border border-blue-500 rounded"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="text-sm">{node.name}</span>
            )}
          </div>
        </div>
        <FileContextMenu
          node={node}
          onNewFile={() => fileInputRef.current?.click()}
          onNewFolder={handleNewFolder}
          onDelete={handleDelete}
          onRename={() => setIsInlineRenaming(true)}
        />
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

const FileExplorer = ({
  hasProjects,
  files,
  onFileSelect,
  onUpdateTree,
  onNewItem,
  expandedFolders,
  onExpandedFoldersChange,
  currentFile,
  onNewProject,
  addOutputMessage
}: FileExplorerProps) => {
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [clientHeight, setClientHeight] = useState(300);

  useEffect(() => {
    // Create the worker once when the component mounts
    const newWorker = new Worker(new URL('../workers/clientWorker.ts', import.meta.url), { type: 'module' });

    // Listen for messages from the worker
    newWorker.onmessage = (event) => {
        const { type, message } = event.data;
        console.log('Worker message received yo:', event.data); // Debug log

        // Handle log messages
        switch (type) {
            case 'info':
                addOutputMessage('info', message);
                break;
            case 'error':
                addOutputMessage('error', message);
                break;
            case 'success':
                addOutputMessage('success', message);
                break;
            default:
                addOutputMessage('info', message);
        }
    };

    // Set the worker in state
    setWorker(newWorker);

    // Cleanup function to terminate the worker when the component unmounts
    return () => {
        newWorker.terminate();
    };
  }, [addOutputMessage]);

  // Group files by section
  const programFiles = files.filter(f => f.name === 'src');
  const clientFiles = files.filter(f => f.name === 'client');
  const otherFiles = files.filter(f => !['src', 'client'].includes(f.name));

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const fileNode: FileNode = {
      name: file.name,
      type: 'file',
      content: ''
    };
    onFileSelect(fileNode);
  };

  const runClientCode = async () => {
    try {
        if (!currentFile || !currentFile.name.endsWith('.ts')) {
            addOutputMessage('error', 'No TypeScript file selected');
            return;
        }

        const clientCode = currentFile.content;
        if (!clientCode) {
            addOutputMessage('error', 'Client code not found');
            return;
        }

        addOutputMessage('info', 'Executing code...');

        try {
            await ArchPgClient.execute({
                fileName: currentFile.name,
                code: clientCode,
                onMessage: (type, message) => {
                    console.log('onMessage called with:', { type, message });
                    addOutputMessage(type, message);
                }
            });
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error('Error:', error.message);
                addOutputMessage('error', error.message);
            } else {
                console.error('Unknown error:', error);
                addOutputMessage('error', 'An unknown error occurred');
            }
        }
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error('Error:', error.message);
            addOutputMessage('error', error.message);
        } else {
            console.error('Unknown error:', error);
            addOutputMessage('error', 'An unknown error occurred');
        }
    }
};

  return (
    <div className="bg-gray-800 w-full h-full flex flex-col">
      <div className="p-2 border-b border-gray-700 font-medium flex justify-between items-center">
        <span>EXPLORER</span>
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

      <div className="flex-1 overflow-y-auto">
        {!hasProjects ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
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
          <>
            {/* Program Section */}
            <div className="py-2">
              <div className="px-4 text-sm text-gray-400">Program</div>
              <div className="mt-1">
                {programFiles.map((file, i) => (
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
              </div>
            </div>

            {/* Client Section */}
            <div className="py-2">
              <div className="px-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">Client</span>
                  <button
                    className="hover:bg-gray-700 p-1 rounded"
                    onClick={() => {
                      // Create client directory if it doesn't exist
                      if (!clientFiles.length) {
                        onNewItem([], 'directory', 'client');
                        // Wait for directory creation
                        setTimeout(() => {
                          onNewItem(['client'], 'file', 'client.ts', '// Client code here');
                        }, 100);
                      } else {
                        onNewItem(['client'], 'file', 'client.ts', '// Client code here');
                      }
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => runClientCode()}>
                  Run
                </Button>
              </div>
              <div className="mt-1">
                {clientFiles.map((file, i) => (
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
              </div>
            </div>

            {/* Other Files */}
            {otherFiles.length > 0 && (
              <div className="py-2">
                <div className="mt-1">
                  {otherFiles.map((file, i) => (
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
                </div>
              </div>
            )}
          </>
        )}
      </div>
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

const findFileInProject = (projectFiles: FileNode[], targetPath: string): FileNode | null => {
  for (const file of projectFiles) {
    if (file.path === targetPath || (file.type === 'file' && file.name === targetPath)) {
      return file;
    }
    if (file.type === 'directory' && file.children) {
      const found = findFileInProject(file.children, targetPath);
      if (found) return found;
    }
  }
  return null;
};

export default FileExplorer;