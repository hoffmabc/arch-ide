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
  Upload,
  Check,
  X,
  Hammer,
  Rocket,
  Play,
  FlaskConical,
  Loader2,
  Home
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import RenameDialog from './RenameDialog';
import { cn } from '../lib/utils';
import type { FileNode, Project, ProjectAccount } from '../types';
import { Button } from '@/components/ui/button';
import ResizeHandle from './ResizeHandle';
import Editor from "@monaco-editor/react";
import * as ts from 'typescript';
import { ArchConnection, RpcConnection, MessageUtil, PubkeyUtil } from '@saturnbtcio/arch-sdk';
import { url } from 'inspector';
import { ArchPgClient } from '../utils/archPgClient';
import NewItemDialog from './NewItemDialog';
import { Textarea } from '@/components/ui/textarea';
import { projectService } from '../services/projectService';

window.archSdk = {
  RpcConnection,
  MessageUtil,
  PubkeyUtil,
  // Add other properties as needed
};


const getNodePath = (node: FileNode, path: string[] = []): string => {
  // For top-level folders (src and client), just return their names
  if (path.length === 0 && ['src', 'client'].includes(node.name)) {
    return node.name;
  }
  // For other paths, join with '/'
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

interface ProjectInfoProps {
  project: Project | null;
  onProjectUpdate: (project: Project) => void;
}

const ProjectInfo = ({ project, onProjectUpdate }: ProjectInfoProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(project?.name || '');
  const [editedDescription, setEditedDescription] = useState(project?.description || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update local state when project changes
  useEffect(() => {
    console.log('🔔 ProjectInfo useEffect - project changed:', {
      projectId: project?.id,
      name: project?.name,
      description: project?.description,
      hasDescription: !!project?.description
    });
    setEditedName(project?.name || '');
    setEditedDescription(project?.description || '');
  }, [project]);

  const handleSave = async () => {
    if (!project) return;

    console.log('💾 ProjectInfo.handleSave called:', {
      oldName: project.name,
      newName: editedName,
      oldDescription: project.description,
      newDescription: editedDescription
    });

    const updatedProject = {
      ...project,
      name: editedName,
      description: editedDescription,
      lastModified: new Date()
    };

    console.log('💾 Saving project to storage...');
    await projectService.saveProject(updatedProject);
    console.log('✅ Project saved to storage');

    console.log('📢 Calling onProjectUpdate callback...');
    onProjectUpdate(updatedProject);
    console.log('✅ onProjectUpdate callback complete');

    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedName(project?.name || '');
    setEditedDescription(project?.description || '');
    setIsEditing(false);
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [isEditing, editedDescription]);

  const getPreviewText = (text: string) => {
    const lines = text.split('\n').slice(0, 1);
    const preview = lines.join('\n');
    return preview + (text.split('\n').length > 1 ? '...' : '');
  };

  return (
    <div className="border-b border-gray-700">
      <div
        className="flex items-center px-2 py-1 cursor-pointer hover:bg-gray-700 group"
        onClick={() => !isEditing && setIsExpanded(!isExpanded)}
      >
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="ml-1 text-sm font-medium">Project Info</span>
        {!isEditing && isExpanded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="ml-auto opacity-0 group-hover:opacity-100 hover:bg-gray-600 p-1 rounded"
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
      <div className="px-4 py-2 text-sm text-gray-400">
        <div className="mb-1">
          <span className="font-medium text-gray-300">Name: </span>
          <span className="text-gray-400">{project?.name || 'Loading...'}</span>
        </div>
        {project?.description && (
          <div>
            <span className="font-medium text-gray-300">Description: </span>
            <span className="text-gray-400 whitespace-pre-wrap">
              {isExpanded ? project.description : getPreviewText(project.description)}
            </span>
          </div>
        )}
      </div>
      {isExpanded && isEditing && (
        <div className="px-4 py-2 text-sm text-gray-400">
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-300"
            />
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Description</label>
            <Textarea
              ref={textareaRef}
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-300 min-h-[60px] resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-700"
            >
              <X size={14} />
              <span className="text-xs">Cancel</span>
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-2 py-1 rounded bg-blue-600 hover:bg-blue-700"
            >
              <Check size={14} />
              <span className="text-xs">Save</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
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
  onOpenHomeTab?: () => void;
  addOutputMessage: (type: string, message: string) => void;
  project: Project | null;
  onProjectAccountChange?: (account: ProjectAccount | null) => void;
  onProjectUpdate?: (project: Project) => void;
  onBuild?: () => void;
  onDeploy?: () => void;
  isBuilding?: boolean;
  isDeploying?: boolean;
}

interface SectionHeaderProps {
  title: string;
  icon: React.ReactNode;
  actions?: Array<{
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }>;
}

const SectionHeader = ({ title, icon, actions }: SectionHeaderProps) => {
  return (
    <div className="border-b border-gray-700">
      <div className="flex items-center justify-between px-2 py-1.5 hover:bg-gray-700 group">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
        {actions && actions.length > 0 && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
            {actions.map((action, idx) => (
              <button
                key={idx}
                className="hover:bg-gray-600 p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={action.onClick}
                disabled={action.disabled}
                title={action.label}
              >
                {action.icon}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface FileContextMenuProps {
  node: FileNode;
  onNewFile: () => void;
  onNewFolder: () => void;
  onDelete: () => void;
  onRename: () => void;
}

const FileContextMenu = ({ node, onNewFile, onNewFolder, onDelete, onRename }: FileContextMenuProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if this is a top-level folder (src or client)
  const isTopLevelFolder = node.type === 'directory' && ['src', 'client'].includes(node.name);

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
        {!isTopLevelFolder && (
          <>
            <DropdownMenuItem onClick={onRename}>
              <Pencil size={16} className="mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-400" onClick={handleDelete}>
              <Trash2 size={16} className="mr-2" />
              Delete
            </DropdownMenuItem>
          </>
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
  const nodePath = getNodePath(node, path);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!['src', 'client'].includes(node.name)) {
      setIsRenameDialogOpen(true);
    }
  };

  const handleNewFile = () => {
    onNewItem([...path, node.name], 'file');
  };

  const handleNewFolder = () => {
    onNewItem([...path, node.name], 'directory');
  };

  const handleDelete = () => {
    onUpdateTree('delete', [...path, node.name]);
  };

  const handleRename = () => {
    if (!['src', 'client'].includes(node.name)) {
      setIsRenameDialogOpen(true);
    }
  };

  const handleRenameSubmit = (newName: string) => {
    onUpdateTree('rename', [...path, node.name], node.type, newName);
    setIsRenameDialogOpen(false);
  };

  return (
    <div className="select-none">
      <div className="flex items-center group" onContextMenu={handleContextMenu}>
        <div
          className={cn(
            "flex-1 flex items-center hover:bg-gray-700 px-2 py-1 cursor-pointer",
            currentFile?.path === nodePath && "bg-gray-700"
          )}
          style={{ paddingLeft: `${depth * 12}px` }}
          onClick={() => {
            if (node.type === 'directory') {
              const newExpandedFolders = new Set(expandedFolders);
              if (expandedFolders.has(nodePath)) {
                newExpandedFolders.delete(nodePath);
              } else {
                newExpandedFolders.add(nodePath);
              }
              onExpandedFoldersChange(newExpandedFolders);
            } else {
              onSelect({
                ...node,
                path: nodePath
              });
            }
          }}
          onDoubleClick={handleDoubleClick}
        >
          {node.type === 'directory' && (
            expandedFolders.has(nodePath)
              ? <ChevronDown size={16} />
              : <ChevronRight size={16} />
          )}
          {node.type === 'directory' ? (
            <Folder size={16} className="ml-1 text-blue-400" />
          ) : (
            getFileIcon(node.name)
          )}
          <div className="ml-2 flex-1">
            <span className="text-sm">{node.name}</span>
          </div>
        </div>
        <FileContextMenu
          node={node}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onDelete={handleDelete}
          onRename={handleRename}
        />
      </div>
      <RenameDialog
        isOpen={isRenameDialogOpen}
        onClose={() => setIsRenameDialogOpen(false)}
        onRename={handleRenameSubmit}
        currentName={node.name}
        type={node.type}
      />
      {node.type === 'directory' && node.children && (
        <div style={{ display: expandedFolders.has(nodePath) ? 'block' : 'none' }}>
          {node.children
            .sort((a, b) => {
              // First sort by type (directories first)
              if (a.type === 'directory' && b.type === 'file') return -1;
              if (a.type === 'file' && b.type === 'directory') return 1;
              // Then sort alphabetically
              return a.name.localeCompare(b.name);
            })
            .map((child, i) => (
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
            ))}
        </div>
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
  onOpenHomeTab,
  addOutputMessage,
  project,
  onProjectAccountChange,
  onProjectUpdate,
  onBuild,
  onDeploy,
  isBuilding = false,
  isDeploying = false
}: FileExplorerProps) => {
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [clientHeight, setClientHeight] = useState(300);
  const [isNewItemDialogOpen, setIsNewItemDialogOpen] = useState(false);

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

  useEffect(() => {
    console.log('🔍 FileExplorer - expandedFolders changed:', Array.from(expandedFolders));
    console.log('🔍 FileExplorer - expandedFolders size:', expandedFolders.size);
  }, [expandedFolders]);

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

  const handleProjectUpdate = (updatedProject: Project) => {
    // Update the full project in the parent component
    // This will trigger a re-render with the new project info
    onProjectUpdate && onProjectUpdate(updatedProject);
    // Don't call onProjectAccountChange here - onProjectUpdate already handles the full project update
    // Calling it here causes a race condition where it uses stale state from fullCurrentProject
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center p-2 border-b border-gray-700">
        <h2 className="text-sm font-medium">Explorer</h2>
        <div className="flex gap-1">
          {onOpenHomeTab && (
            <button
              className="hover:bg-gray-700 p-1 rounded transition-colors"
              onClick={onOpenHomeTab}
              title="Open Home Tab"
            >
              <Home size={16} />
            </button>
          )}
          {/* <button
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
          </button> */}
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
            {project && <ProjectInfo project={project} onProjectUpdate={handleProjectUpdate} />}

            {/* Program Section */}
            {programFiles.length > 0 && (
              <>
                <SectionHeader
                  title="Program"
                  icon={<Hammer size={16} className="text-orange-400" />}
                  actions={[
                    {
                      icon: isBuilding ? <Loader2 size={16} className="animate-spin" /> : <Hammer size={16} />,
                      label: "Build",
                      onClick: () => onBuild?.(),
                      disabled: isBuilding || !hasProjects
                    },
                    {
                      icon: isDeploying ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />,
                      label: "Deploy",
                      onClick: () => onDeploy?.(),
                      disabled: isDeploying || !hasProjects
                    }
                  ]}
                />
                {programFiles.map((node, index) => (
                  <FileExplorerItem
                    key={`program-${index}`}
                    node={node}
                    onSelect={onFileSelect}
                    onUpdateTree={onUpdateTree}
                    onNewItem={onNewItem}
                    expandedFolders={expandedFolders}
                    onExpandedFoldersChange={onExpandedFoldersChange}
                    currentFile={currentFile}
                  />
                ))}
              </>
            )}

            {/* Client Section */}
            {clientFiles.length > 0 && (
              <>
                <SectionHeader
                  title="Client"
                  icon={<Play size={16} className="text-green-400" />}
                  actions={[
                    {
                      icon: <Play size={16} />,
                      label: "Run",
                      onClick: () => runClientCode()
                    },
                    {
                      icon: <FlaskConical size={16} />,
                      label: "Test",
                      onClick: () => {
                        // This will be handled by the parent component
                        console.log('Test clicked from FileExplorer');
                      }
                    }
                  ]}
                />
                {clientFiles.map((node, index) => (
                  <FileExplorerItem
                    key={`client-${index}`}
                    node={node}
                    onSelect={onFileSelect}
                    onUpdateTree={onUpdateTree}
                    onNewItem={onNewItem}
                    expandedFolders={expandedFolders}
                    onExpandedFoldersChange={onExpandedFoldersChange}
                    currentFile={currentFile}
                  />
                ))}
              </>
            )}

            {/* Other Files Section (if any) */}
            {otherFiles.length > 0 && otherFiles.map((node, index) => (
              <FileExplorerItem
                key={`other-${index}`}
                node={node}
                onSelect={onFileSelect}
                onUpdateTree={onUpdateTree}
                onNewItem={onNewItem}
                expandedFolders={expandedFolders}
                onExpandedFoldersChange={onExpandedFoldersChange}
                currentFile={currentFile}
              />
            ))}
          </>
        )}
      </div>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileSelect}
        multiple
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

// const testTypeDeclarations = (editor: monaco.editor.IStandaloneCodeEditor) => {
//   const model = editor.getModel();
//   if (!model) return false;

//   // Create a worker to get diagnostics
//   const worker = monaco.languages.typescript.getTypeScriptWorker();
//   return worker().then(client => {
//     return client.getSemanticDiagnostics(model.uri.toString()).then(diagnostics => {
//       // Log diagnostics to see what's happening
//       console.log('TypeScript Diagnostics:', diagnostics);
//       return diagnostics.length === 0;
//     });
//   });
// };

// export const declareGlobalTypes = (): Disposable => {
//   // First declare the module
//   const moduleDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(
//     `declare module "@saturnbtcio/arch-sdk" { ... }`,
//     "file:///node_modules/@types/arch-sdk/index.d.ts"
//   );

//   // Then declare globals
//   const globalsDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(
//     `declare global { ... }`,
//     "file:///globals.d.ts"
//   );

//   // Log to verify loading
//   console.log('Type declarations added:', moduleDisposable, globalsDisposable);

//   return {
//     dispose: () => {
//       moduleDisposable.dispose();
//       globalsDisposable.dispose();
//     }
//   };
// };

export default FileExplorer;