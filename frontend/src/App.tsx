// src/App.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Editor from './components/Editor';
import { Output } from './components/Output';
import ProjectList from './components/ProjectList';
import NewProjectDialog from './components/NewProjectDialog';
import { projectService } from './services/projectService';
import type { Project, FileNode, ProjectAccount } from './types';
import TabBar from './components/TabBar';
import ResizeHandle from './components/ResizeHandle';
import NewItemDialog from './components/NewItemDialog';
import { OutputMessage } from './components/Output';
import { ConfigPanel } from './components/ConfigPanel';
import { Button } from './components/ui/button';
import { Settings } from 'lucide-react';
import SidePanel from './components/SidePanel';
import { StatusBar } from './components/StatusBar';
import type { ArchIdl } from './types';
import { ArchProgramLoader } from './utils/arch-program-loader';
import { storage } from './utils/storage';
import { FileChange } from './types/types';
import { Plus, FolderPlus, Download } from 'lucide-react';
import { Buffer } from 'buffer/';
import { formatBuildError } from './utils/errorFormatter';
import { Loader2 } from 'lucide-react';

const queryClient = new QueryClient();
console.log('API_URL', import.meta.env.VITE_API_URL);
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

interface Config {
  network: 'mainnet-beta' | 'devnet' | 'testnet';
  rpcUrl: string;
  showTransactionDetails: boolean;
  improveErrors: boolean;
  automaticAirdrop: boolean;
  regtestConfig: {
    url: string;
    username: string;
    password: string;
  };
}

// Types
type FileOperation = {
  type: 'create' | 'delete' | 'rename';
  path: string[];
  fileType?: 'file' | 'directory';
  newName?: string;
  content?: string;
};

// Separate path utilities
const pathUtils = {
  normalize: (parts: string[]): string => {
    return parts.filter(Boolean).join('/');
  },

  getParentPath: (path: string[]): string[] => {
    return path.slice(0, -1);
  },

  getFileName: (path: string[]): string => {
    return path[path.length - 1];
  }
};

// Separate file tree operations
const fileTreeOperations = {
  create: (nodes: FileNode[], path: string[], type: 'file' | 'directory', content?: string): FileNode[] => {
    const parentPath = path.slice(0, -1);
    const fileName = path[path.length - 1];
    const fullPath = path.join('/');

    const newNode: FileNode = {
      name: fileName,
      type: type,
      content: type === 'file' ? (content || '') : undefined,
      children: type === 'directory' ? [] : undefined,
      path: fullPath
    };

    // If parentPath is empty, this is a top-level node
    if (parentPath.length === 0) {
      return [...nodes, newNode];
    }

    // Otherwise, update the tree normally
    return updateNodeInTree(nodes, parentPath, (parent) => ({
      ...parent,
      children: [...(parent.children || []), newNode]
    }));
  },

  delete: (nodes: FileNode[], path: string[]): FileNode[] => {
    const parentPath = pathUtils.getParentPath(path);
    const fileName = pathUtils.getFileName(path);

    // If we're deleting from root level
    if (parentPath.length === 0) {
      return nodes.filter(node => node.name !== fileName);
    }

    // Otherwise, update the tree normally
    return updateNodeInTree(nodes, parentPath, (parent) => ({
      ...parent,
      children: parent.children?.filter(child => child.name !== fileName)
    }));
  },

  rename: (nodes: FileNode[], path: string[], newName: string): FileNode[] => {
    const parentPath = pathUtils.getParentPath(path);
    const fullPath = pathUtils.normalize([...parentPath, newName]);

    return updateNodeInTree(nodes, path, (node) => ({
      ...node,
      name: newName,
      path: fullPath
    }));
  }
};

const findNodeByPath = (nodes: FileNode[], targetPath: string[]): FileNode | null => {
  if (targetPath.length === 0) return null;

  const [current, ...rest] = targetPath;
  const node = nodes.find(n => n.name === current);

  if (!node) return null;
  if (rest.length === 0) return node;
  if (!node.children) return null;

  return findNodeByPath(node.children, rest);
};

export const findFileInProject = (nodes: FileNode[], targetPath: string): FileNode | null => {
  for (const node of nodes) {
    if (node.type === 'file' && (node.path === targetPath || node.name === targetPath)) return node;
    if (node.type === 'directory' && node.children) {
      const found = findFileInProject(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
};

// Add these new utility functions at the top level
const stripProjectContent = (project: Project): Project => {
  // Only keep essential metadata and stripped file structure
  return {
    ...project,
    files: stripFileContent(project.files)
  };
};

const stripFileContent = (files: FileNode[]): FileNode[] => {
  return files.map(file => ({
    ...file,
    // Only keep content for small files or remove entirely
    content: file.type === 'file' ? '' : undefined,
    children: file.children ? stripFileContent(file.children) : undefined,
    path: file.path
  }));
};

interface ArchDeployOptions {
  rpcUrl: string;
  network: string;
  programBinary: Uint8Array;
  keypair: {
    privkey: string;
    pubkey: string;
    address: string;
  };
  regtestConfig?: {
    url: string;
    username: string;
    password: string;
  };
}

const constructFullPath = (file: FileNode, files: FileNode[]): string => {
  const findPath = (nodes: FileNode[], target: FileNode, currentPath: string = ''): string | null => {
    for (const node of nodes) {
      if (node === file) return currentPath + node.name;
      if (node.children) {
        const found = findPath(node.children, target, `${currentPath}${node.name}/`);
        if (found) return found;
      }
    }
    return null;
  };

  return findPath(files, file) || file.name;
};

const findFileByPath = (nodes: FileNode[], targetPath: string): FileNode | null => {
  for (const node of nodes) {
    if (node.type === 'file' && node.path === targetPath) return node;
    if (node.type === 'directory' && node.children) {
      const found = findFileByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
};

const App = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [fullCurrentProject, setFullCurrentProject] = useState<Project | null>(null);
  const [currentFile, setCurrentFile] = useState<FileNode | null>(null);
  const [output, setOutput] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [openFiles, setOpenFiles] = useState<FileNode[]>([]);
  const [terminalHeight, setTerminalHeight] = useState(192);
  const [isNewFileDialogOpen, setIsNewFileDialogOpen] = useState(false);
  const [newItemPath, setNewItemPath] = useState<string[]>([]);
  const [newItemType, setNewItemType] = useState<'file' | 'directory'>();
  const [outputMessages, setOutputMessages] = useState<OutputMessage[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [programId, setProgramId] = useState<string>();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [programBinary, setProgramBinary] = useState<string | null>(null);
  const [programIdl, setProgramIdl] = useState<ArchIdl | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<string, FileChange>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [currentAccount, setCurrentAccount] = useState<{
    privkey: string;
    pubkey: string;
    address: string;
  } | null>(null);
  const [currentView, setCurrentView] = useState<'explorer' | 'build'>(storage.getCurrentView());
  const [binaryFileName, setBinaryFileName] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const previousConnectionStatus = useRef(isConnected);

  const debouncedSave = useCallback(
    debounce((projectToSave: Project) => {
      projectService.saveProject(projectToSave);
    }, 2000),
    []
  );

  useEffect(() => {
    const loadProjects = async () => {
      const loadedProjects = await projectService.getAllProjects();
      // Only strip in production
      if (import.meta.env.PROD) {
        setProjects(loadedProjects.map(stripProjectContent));
      } else {
        setProjects(loadedProjects);
      }
      if (loadedProjects.length > 0) {
        setFullCurrentProject(loadedProjects[0]);
      }
    };

    loadProjects();
  }, []);

  // Modify the project update effect to prevent unnecessary saves
  useEffect(() => {
    if (fullCurrentProject && !import.meta.env.DEV) {
      const updateProjects = async () => {
        await projectService.saveProject(fullCurrentProject);
        const updatedProjects = await projectService.getAllProjects();
        setProjects(updatedProjects.map(stripProjectContent));
      };

      updateProjects();
    }
  }, [fullCurrentProject]);

  const [config, setConfig] = useState<Config>(() => {
    const savedConfig = storage.getConfig();
    const defaultConfig = {
      network: 'devnet',
      rpcUrl: 'http://localhost:9002',
      showTransactionDetails: false,
      improveErrors: true,
      automaticAirdrop: true,
      regtestConfig: {
        url: 'http://localhost:8010/proxy',
        username: 'bitcoin',
        password: '428bae8f3c94f8c39c50757fc89c39bc7e6ebc70ebf8f618'
      }
    };

    if (!savedConfig) return defaultConfig;

    return {
      ...defaultConfig,
      ...savedConfig,
      regtestConfig: {
        ...defaultConfig.regtestConfig,
        ...(savedConfig.regtestConfig || {})
      }
    };
  });

  useEffect(() => {
    const savedBinary = storage.getProgramBinary();
    if (savedBinary) {
      setProgramBinary(savedBinary);
    }

    const savedProgramId = storage.getProgramId();
    if (savedProgramId) {
      setProgramId(savedProgramId);
    }

    const savedAccount = storage.getCurrentAccount();
    if (savedAccount) {
      setCurrentAccount(savedAccount);
    }

    const savedView = storage.getCurrentView();
    if (savedView) {
      setCurrentView(savedView);
    }
  }, []);

  // Save config when it changes
  useEffect(() => {
    // Only save if config has been initialized
    if (config) {
      storage.saveConfig({
        ...config,
        regtestConfig: {
          ...config.regtestConfig
        }
      });
    }
  }, [config]);

  // Save program binary when it changes
  useEffect(() => {
    storage.saveProgramBinary(programBinary);
  }, [programBinary]);

  // Save program ID when it changes
  useEffect(() => {
    storage.saveProgramId(programId);
  }, [programId]);

  // Save current account when it changes
  useEffect(() => {
    storage.saveCurrentAccount(currentAccount);
  }, [currentAccount]);

  useEffect(() => {
    console.log('Saving view:', currentView);
    storage.saveCurrentView(currentView);
  }, [currentView]);

  useEffect(() => {
    if (programBinary && fullCurrentProject?.name) {
      setBinaryFileName(`${fullCurrentProject.name}.so`);
    }
  }, [programBinary, fullCurrentProject?.name]);

  const handleDeploy = async () => {
    if (!fullCurrentProject || !programId || !isConnected || !currentAccount || !programBinary) {
      const missing = [];
      if (!fullCurrentProject) missing.push('project');
      if (!programId) missing.push('program ID');
      if (!isConnected) missing.push('connection');
      if (!currentAccount) missing.push('account/keypair');
      if (!programBinary) missing.push('program binary');

      addOutputMessage('error', `Cannot deploy: Missing ${missing.join(', ')}`);
      return;
    }

    setIsDeploying(true);
    try {
      let base64Content: string;

      if (programBinary.startsWith('data:')) {
        base64Content = programBinary.split(',')[1];
      } else {
        base64Content = programBinary;
      }

      // Convert using Buffer
      const binaryData = base64ToUint8Array(base64Content);

      const deployOptions = {
        rpcUrl: config.rpcUrl,
        network: config.network,
        programBinary: Buffer.from(binaryData),
        keypair: currentAccount,
        regtestConfig: config.network === 'devnet' ? config.regtestConfig : undefined
      };

      console.log('deployOptions', deployOptions);

      const result = await ArchProgramLoader.load(deployOptions, addOutputMessage);

      if (result.programId) {
        addOutputMessage('success', `Program deployed successfully`);
        addOutputMessage('info', `Program ID: ${result.programId}`);
        setProgramId(result.programId);
        setBinaryFileName(`${fullCurrentProject.name}.so`);
      }
    } catch (error: any) {
      addOutputMessage('error', `Deploy error: ${error.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  // Helper function to convert base64 to Uint8Array in chunks
  const base64ToUint8Array = (base64: string): Uint8Array => {
    // Use Buffer to handle binary data properly
    return Buffer.from(base64, 'base64');
  };

  const handleCreateProject = async (name: string, description: string) => {
    const newProject = await projectService.createProject(name, description);
    const updatedProjects = await projectService.getAllProjects();
    setProjects(updatedProjects.map(stripProjectContent));
    setFullCurrentProject(newProject);

    // Clear all program-related states
    setCurrentAccount(null);
    setProgramId(undefined);
    setProgramBinary(null);
    setProgramIdl(null);

    // Clear all open tabs and current file
    setOpenFiles([]);
    setCurrentFile(null);
    setIsNewProjectOpen(false);
  };

  const generateUniqueName = (baseName: string, existingFiles: FileNode[]): string => {
    // Split name and extension
    const lastDotIndex = baseName.lastIndexOf('.');
    const nameWithoutExt = lastDotIndex === -1 ? baseName : baseName.slice(0, lastDotIndex);
    const extension = lastDotIndex === -1 ? '' : baseName.slice(lastDotIndex);

    let counter = 1;
    let newName = baseName;

    // Check if file exists and increment counter until we find a unique name
    while (existingFiles.some(file => file.name === newName)) {
      newName = `${nameWithoutExt} (${counter})${extension}`;
      counter++;
    }

    return newName;
  };

  const isDuplicateName = (path: string[], name: string, type: 'file' | 'directory', files: FileNode[]): boolean => {
    // Find the target directory where we want to create the new item
    let currentLevel = files;
    for (const segment of path) {
      const nextLevel = currentLevel.find(node => node.name === segment)?.children;
      if (!nextLevel) return false;
      currentLevel = nextLevel;
    }

    // Only check for duplicates in the current directory level
    return currentLevel.some(node =>
      node.name.toLowerCase() === name.toLowerCase() // Case-insensitive comparison
    );
  };

  const handleNewItem = (path: string[], type: 'file' | 'directory', fileName?: string, content?: string) => {
    console.log('handleNewItem called with:', { path, type, fileName, content });

    if (!fullCurrentProject) return;

    console.log('fullCurrentProject', fullCurrentProject);

    // Allow creation at root level for specific directories like 'client'
    if (path.length === 0 && type === 'directory' && fileName === 'client') {
      path = ['client'];
    } else if (path.length === 0) {
      path = ['src'];
    }

    // Only enforce src directory for Rust files
    const isRustFile = fileName?.endsWith('.rs');
    if (isRustFile && !path.includes('src')) {
      console.warn('Rust files must be created under src directory');
      return;
    }

    // First, ensure the parent folder is expanded
    const parentPath = path.join('/');
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      let currentPath = '';
      for (const segment of path) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        newSet.add(currentPath);
      }
      return newSet;
    });

    // Wait for the next render cycle to ensure folder is expanded
    setTimeout(() => {
      if (fileName && content !== undefined) {
        // Check for duplicates before creating
        if (isDuplicateName(path, fileName, type, fullCurrentProject.files)) {
          alert(`A ${type} with the name "${fileName}" already exists in this location.`);
          return;
        }

        handleUpdateTree({
          type: 'create',
          path: [...path, fileName],
          fileType: type,
          content: content
        });
      } else {
        setNewItemPath(path);
        setNewItemType(type);
        setIsNewFileDialogOpen(true);
      }
    }, 0);
  };

  const handleFileChange = useCallback((newContent: string | undefined) => {
    if (!newContent || !currentFile || !fullCurrentProject) return;

    // Update current file
    setCurrentFile(prev => ({
      ...prev!,
      content: newContent
    }));

    // Update open files with new content
    setOpenFiles(prev => prev.map(f =>
      (f.path === currentFile.path || f.name === currentFile.name)
        ? { ...f, content: newContent }
        : f
    ));

    // Queue the change for saving
    setPendingChanges(prev => {
      const newMap = new Map(prev);
      newMap.set(currentFile.path || currentFile.name, {
        path: currentFile.path || currentFile.name,
        content: newContent,
        timestamp: Date.now()
      });
      return newMap;
    });
  }, [currentFile, fullCurrentProject]);

  const handleCreateNewItem = (name: string) => {
    if (!newItemPath || !newItemType) return;

    if (isDuplicateName(newItemPath, name, newItemType, fullCurrentProject?.files || [])) {
      alert(`A ${newItemType} with the name "${name}" already exists in this location.`);
      return;
    }

    handleUpdateTree({
      type: 'create',
      path: [...newItemPath, name],
      fileType: newItemType,
      content: newItemType === 'file' ? '' : undefined
    });
    setIsNewFileDialogOpen(false);
  };

  const handleFileSelect = (file: FileNode) => {
    if (file.type === 'file') {
      // Always use the full path from the file structure
      const filePath = file.path || constructFullPath(file, fullCurrentProject?.files || []);

      // First check if the file is in openFiles
      const openFile = openFiles.find(f => f.path === filePath);

      // Then check project files if not found in open files
      const currentProjectFile = !openFile && fullCurrentProject ?
        findFileInProject(fullCurrentProject.files, filePath) : null;

      // Use openFile first, then project file, then create a new file object
      const fileToUse = openFile || currentProjectFile || {
        ...file,
        path: filePath,
        name: file.name // Ensure we keep the original filename
      };

      setCurrentFile(fileToUse);

      // Update openFiles if needed
      if (!openFiles.some(f => f.path === filePath)) {
        setOpenFiles(prev => [...prev, fileToUse]);
      }
    }
  };

  const handleCloseFile = useCallback((fileToClose: FileNode) => {
    // Batch state updates using a single setState call
    setOpenFiles(prevFiles => {
      const newFiles = prevFiles.filter(f =>
        (f.path || f.name) !== (fileToClose.path || fileToClose.name)
      );

      // Update current file if needed
      if (currentFile &&
          (currentFile.path || currentFile.name) === (fileToClose.path || fileToClose.name)) {
        // Set current file to the last remaining file or null
        setCurrentFile(newFiles.length > 0 ? newFiles[newFiles.length - 1] : null);
      }

      return newFiles;
    });

    const timeoutId = setTimeout(() => {
      if (fullCurrentProject) {
        projectService.saveProject(fullCurrentProject);
      }
    }, 1000);

  }, [currentFile, fullCurrentProject]);

  const handleResizeStart = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.pageY;
    const startHeight = terminalHeight;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startY - e.pageY;
      const newHeight = Math.max(100, Math.min(800, startHeight + delta));
      setTerminalHeight(newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [terminalHeight]);

  const handleUpdateTree = (operation: FileOperation) => {
    if (!fullCurrentProject) return;

    // Prevent src folder deletion
    if (operation.type === 'delete' &&
        operation.path.length === 1 &&
        operation.path[0] === 'src') {
      console.warn('Cannot delete src directory');
      return;
    }

    let updatedFiles: FileNode[];
    let projectToUpdate: Project;

    switch (operation.type) {
      case 'create':
        updatedFiles = fileTreeOperations.create(
          fullCurrentProject.files,
          operation.path,
          operation.fileType || 'file',
          operation.content
        );
        break;
      case 'delete':
        updatedFiles = fileTreeOperations.delete(fullCurrentProject.files, operation.path);

        // Get the full path of the deleted item
        const deletedPath = operation.path.join('/');

        // Close any open files that were in the deleted path
        setOpenFiles(prevFiles => {
          const remainingFiles = prevFiles.filter(file => {
            const filePath = file.path || constructFullPath(file, fullCurrentProject.files);
            return !filePath.startsWith(deletedPath);
          });

          // If current file was in deleted path, set to last remaining file or null
          if (currentFile) {
            const currentFilePath = currentFile.path ||
              constructFullPath(currentFile, fullCurrentProject.files);

            if (currentFilePath.startsWith(deletedPath)) {
              setCurrentFile(remainingFiles.length > 0 ? remainingFiles[remainingFiles.length - 1] : null);
            }
          }

          return remainingFiles;
        });
        break;
      case 'rename':
        updatedFiles = fileTreeOperations.rename(
          fullCurrentProject.files,
          operation.path,
          operation.newName || ''
        );
        break;
    }

    projectToUpdate = {
      ...fullCurrentProject,
      files: updatedFiles,
      lastModified: new Date()
    };

    setFullCurrentProject(projectToUpdate);
    projectService.saveProject(projectToUpdate).catch(error => {
      console.error('Failed to save project:', error);
    });
  };

  const handleBuild = async () => {
    if (!fullCurrentProject) return;

    setIsCompiling(true);
    addOutputMessage('command', 'cargo build-sbf', true);

    try {
      const srcDir = fullCurrentProject.files.find(node =>
        node.type === 'directory' && node.name === 'src'
      );

      if (!srcDir?.children) {
        throw new Error('src directory not found or invalid');
      }

      // Recursively collect all .rs files from src directory and its subdirectories
      const collectRustFiles = (dir: FileNode[], basePath: string = ''): [string, string][] => {
        let files: [string, string][] = [];

        for (const node of dir) {
          const currentPath = basePath ? `${basePath}/${node.name}` : node.name;

          if (node.type === 'file' && node.name.endsWith('.rs') && node.content) {
            let decodedContent = node.content;

            // Handle base64 encoded content
            if (node.content.startsWith('data:text/plain;base64,')) {
              const plainContent = node.content.replace(/^data:text\/plain;base64,/, '');
              try {
                decodedContent = atob(plainContent);
              } catch (error: any) {
                throw new Error(`Failed to decode content for file: ${node.name}. Error: ${error.message}`);
              }
            }

            files.push([`/src/${currentPath}`, decodedContent]);
          } else if (node.type === 'directory' && node.children) {
            // Recursively collect files from subdirectories
            files = files.concat(collectRustFiles(node.children, currentPath));
          }
        }

        return files;
      };

      const rsFiles = collectRustFiles(srcDir.children);

      if (rsFiles.length === 0) {
        throw new Error('No non-empty Rust source files found in src directory');
      }

      console.log('Sending Rust files to compile server:', rsFiles.map(([path]) => path));

      const buildResponse = await fetch(`${API_URL}/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          program_name: fullCurrentProject.name,
          files: rsFiles
        })
      });

      const result = await buildResponse.json();

      if (result.stderr) {
        const formattedError = formatBuildError(result.stderr);
        const buildSucceeded = result.stderr.includes("Finished release");

        if (buildSucceeded) {
          // Show any warnings but mark as success
          addOutputMessage('info', formattedError);
          addOutputMessage('success', 'Build successful');

          // Fetch the binary after successful build
          try {
            const binaryResponse = await fetch(
              `${API_URL}/deploy/${result.uuid}/${result.program_name}`,
              { headers: { Accept: 'application/octet-stream' } }
            );

            if (!binaryResponse.ok) {
              throw new Error(`Failed to fetch binary: ${binaryResponse.statusText}`);
            }

            const binaryData = await binaryResponse.text();
            setProgramBinary(binaryData);
            addOutputMessage('info', 'Program binary retrieved successfully');
          } catch (error: any) {
            addOutputMessage('error', `Failed to retrieve program binary: ${error.message}`);
          }
        } else if (
          result.stderr.includes("error:") ||
          result.stderr.includes("error[") ||
          result.stderr.includes("Stack offset") ||
          result.stderr.includes("Error deploying") ||
          result.stderr.includes("Failed to parse IDL")
        ) {
          // Show as error
          addOutputMessage('error', formattedError);
        } else {
          // Show other output
          addOutputMessage('info', formattedError);
        }
      }
    } catch (error: any) {
      addOutputMessage('error', `Build error: ${error.message}`);
    } finally {
      setIsCompiling(false);
      // Update the last command message to remove the loading state
      setOutputMessages(prev => {
        const messages = [...prev];
        const lastCommandIndex = messages.reverse().findIndex(m => m.type === 'command');
        if (lastCommandIndex !== -1) {
          const actualIndex = messages.length - 1 - lastCommandIndex;
          messages[actualIndex] = { ...messages[actualIndex], isLoading: false };
        }
        messages.reverse(); // Restore original order
        return messages;
      });
    }
  };

  const addOutputMessage = (type: OutputMessage['type'], content: string, isLoading: boolean = false) => {
    setOutputMessages(prev => [...prev, {
      type,
      content,
      timestamp: new Date(),
      isLoading
    }]);
  };

  const clearOutputMessages = () => {
    setOutputMessages([]);
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!window.confirm('Are you sure you want to delete this project?')) {
      return Promise.resolve();
    }

    try {
      // First, update UI state to show deletion is in progress
      const isCurrentProject = fullCurrentProject?.id === projectId;

      if (isCurrentProject) {
        // Clear editor state first
        setCurrentFile(null);
        setOpenFiles([]);
      }

      // Delete from storage
      await projectService.deleteProject(projectId);

      // Batch state updates
      const remainingProjects = await projectService.getAllProjects();

      // Update projects list and current project in one render cycle
      setProjects(remainingProjects.map(stripProjectContent));

      if (isCurrentProject) {
        // Set new current project if available
        setFullCurrentProject(remainingProjects.length > 0 ? remainingProjects[0] : null);
      }

    } catch (error) {
      console.error('Failed to delete project:', error);
      // Optionally show error message to user
    }
  };

  const handleSaveFile = useCallback(async (newContent: string) => {
    console.group('handleSaveFile');

    if (!currentFile || !fullCurrentProject) {
      console.warn('No current file or project');
      console.groupEnd();
      return;
    }

    try {
      console.log(fullCurrentProject.files);
      const updatedFiles = updateFileContent(fullCurrentProject.files, currentFile, newContent);
      const updatedProject = {
        ...fullCurrentProject,
        files: updatedFiles,
        lastModified: new Date()
      };

      // Save and verify
      await projectService.saveProject(updatedProject);

      // Only update state if save was successful
      setCurrentFile({ ...currentFile, content: newContent });
      setFullCurrentProject(updatedProject);

      console.log('File saved and verified successfully');
    } catch (error) {
      console.error('Save failed:', error);
      // Optionally, reload the current file from storage to ensure consistent state
      const reloadedProject = await projectService.getProject(fullCurrentProject.id);
      if (reloadedProject) {
        setFullCurrentProject(reloadedProject);
      }
    }

    console.groupEnd();
  }, [currentFile, fullCurrentProject]);

  useEffect(() => {
    console.group('Connection Status Change Debug');
    console.log('Previous status:', previousConnectionStatus.current);
    console.log('Current isConnected:', isConnected);
    console.log('Current config:', { network: config.network, rpcUrl: config.rpcUrl });

    // Watch for changes in isConnected
    if (isConnected !== previousConnectionStatus.current) {
      console.log('Status changed! Adding output message');
      if (isConnected) {
        addOutputMessage('success', `Connected to ${config.network} (${config.rpcUrl})`);
      } else {
        addOutputMessage('error', 'Not connected to network');
      }
      previousConnectionStatus.current = isConnected;
    } else {
      console.log('No status change detected');
    }
    console.groupEnd();
  }, [isConnected, config.network, config.rpcUrl]);

  const handleUpdateTreeAdapter = (operation: 'create' | 'delete' | 'rename', path: string[], type?: 'file' | 'directory', newName?: string) => {
    handleUpdateTree({ type: operation, path, fileType: type, newName });
  };

  const handleProgramIdChange = (newProgramId: string) => {
    setProgramId(newProgramId);
  };

  const handleProjectAccountChange = async (account: ProjectAccount) => {
    if (!fullCurrentProject) return;

    // Update the project with the new account
    const updatedProject = {
      ...fullCurrentProject,
      account,
      lastModified: new Date()
    };

    // Save the updated project
    await projectService.saveProject(updatedProject);

    // Update state
    setFullCurrentProject(updatedProject);
    setProjects(prev => prev.map(p =>
      p.id === updatedProject.id ? updatedProject : p
    ));

    // Also update current account state for immediate use
    setCurrentAccount(account);
  };

  const handleProjectSelect = async (project: Project) => {
    const fullProject = await projectService.getProject(project.id);
    if (!fullProject) return;

    setFullCurrentProject(fullProject);
    setCurrentAccount(fullProject.account || null);
    setProgramId(fullProject.account?.pubkey);
    setProgramBinary(null);
    setOpenFiles([]);
    setCurrentFile(null);
  };

  // Add this effect to handle batched saves
  useEffect(() => {
    if (pendingChanges.size === 0 || !fullCurrentProject || isSaving) return;

    const saveTimeout = setTimeout(async () => {
      setIsSaving(true);

      try {
        // Convert pending changes to an array and sort by timestamp
        const changes = Array.from(pendingChanges.values())
          .sort((a, b) => a.timestamp - b.timestamp);

        // Apply changes in order
        let updatedFiles = fullCurrentProject.files;
        for (const change of changes) {
          const fileToUpdate = findFileByPath(updatedFiles, change.path);
          if (fileToUpdate) {
            updatedFiles = updateFileContent(updatedFiles, fileToUpdate, change.content);
          }
        }

        const updatedProject = {
          ...fullCurrentProject,
          files: updatedFiles,
          lastModified: new Date()
        };

        // Save to IndexedDB
        await projectService.saveProject(updatedProject);

        // Update state
        setFullCurrentProject(updatedProject);
        setProjects(prev => prev.map(p =>
          p.id === updatedProject.id ? updatedProject : p
        ));

        // Clear pending changes
        setPendingChanges(new Map());
      } finally {
        setIsSaving(false);
      }
    }, 2000); // Batch saves every 2 seconds

    return () => clearTimeout(saveTimeout);
  }, [pendingChanges, fullCurrentProject, isSaving]);

  const handleNewProject = () => {
    setIsNewProjectOpen(true);
  };

  const handleFileClick = useCallback((file: FileNode) => {
    console.group('handleFileClick');
    console.log('File clicked:', {
      name: file.name,
      path: file.path,
      type: file.type,
      contentLength: file.content?.length,
      contentPreview: file.content?.substring(0, 100)
    });

    // Ensure file has a full path
    const fullPath = file.path || constructFullPath(file, fullCurrentProject?.files || []);
    console.log('Constructed full path:', fullPath);

    const fileWithPath = {
      ...file,
      path: fullPath
    };

    // Update open files with the full path
    setOpenFiles(prev => {
      const exists = prev.some(f => f.path === fullPath);
      console.log('File already open:', exists);
      if (!exists) {
        return [...prev, fileWithPath];
      }
      return prev;
    });

    console.log('Setting current file:', {
      name: fileWithPath.name,
      path: fileWithPath.path,
      contentLength: fileWithPath.content?.length,
      contentPreview: fileWithPath.content?.substring(0, 100)
    });

    setCurrentFile(fileWithPath);
    console.groupEnd();
  }, [fullCurrentProject]);

  const handleTabSelect = (file: FileNode) => {
    console.group('TabBar handleTabSelect');
    console.log('Tab selected:', {
      name: file.name,
      path: file.path,
      type: file.type,
      contentLength: file.content?.length,
      contentPreview: file.content?.substring(0, 100)
    });

    // Find the actual file node from the current project
    const projectFile = findFileInProject(fullCurrentProject?.files || [], file.path || file.name);

    if (projectFile) {
      console.log('Found file in project:', {
        name: projectFile.name,
        path: projectFile.path,
        contentLength: projectFile.content?.length,
        contentPreview: projectFile.content?.substring(0, 100)
      });
      setCurrentFile(projectFile);
    } else {
      console.warn('File not found in project:', file.path || file.name);
    }

    console.groupEnd();
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="h-screen flex flex-col bg-gray-900 text-white">
        <nav className="border-b border-gray-800 flex items-center justify-between p-4">
          <h1 className="text-xl font-bold">Arch Network Playground</h1>
          <ProjectList
            projects={projects}
            currentProject={fullCurrentProject || undefined}
            onSelectProject={handleProjectSelect}
            onNewProject={handleNewProject}
            onDeleteProject={handleDeleteProject}
            onProjectsChange={setProjects}
          />
          <Button variant="ghost" size="icon" onClick={() => setIsConfigOpen(true)}>
            <Settings className="h-5 w-5" />
          </Button>
        </nav>

        <div className="flex flex-1 overflow-hidden">
          <SidePanel
            connected={isConnected}
            hasProjects={projects.length > 0}
            currentView={currentView}
            onViewChange={setCurrentView}
            currentFile={currentFile}
            files={fullCurrentProject?.files || []}
            onFileSelect={handleFileSelect}
            onUpdateTree={handleUpdateTreeAdapter}
            onNewItem={handleNewItem}
            onBuild={handleBuild}
            onDeploy={handleDeploy}
            isBuilding={isCompiling}
            isDeploying={isDeploying}
            programId={programId}
            programBinary={programBinary}
            onProgramBinaryChange={setProgramBinary}
            programIdl={programIdl}
            config={config}
            onConfigChange={setConfig}
            onConnectionStatusChange={setIsConnected}
            onProgramIdChange={handleProgramIdChange}
            currentAccount={currentAccount}
            onAccountChange={setCurrentAccount}
            project={fullCurrentProject!}
            onProjectAccountChange={handleProjectAccountChange}
            onNewProject={handleNewProject}
            binaryFileName={binaryFileName}
            setBinaryFileName={setBinaryFileName}
            addOutputMessage={addOutputMessage}
          />

          <div className="flex flex-col flex-1 overflow-hidden">
            <TabBar
              openFiles={openFiles}
              currentFile={currentFile}
              onSelectFile={setCurrentFile}
              onCloseFile={handleCloseFile}
              currentProject={fullCurrentProject}
            />
            <div className="flex-1 overflow-hidden">
            <Editor
              code={currentFile?.content ?? '// Select a file to edit'}
              onChange={handleFileChange}
              onSave={handleSaveFile}
              currentFile={currentFile}
              key={currentFile?.path || 'welcome'}
            />
            </div>

            <div style={{ height: terminalHeight }} className="flex flex-col border-t border-gray-700">
              <ResizeHandle onMouseDown={handleResizeStart} />
              <div className="flex-1 min-h-0">
                <Output messages={outputMessages} onClear={clearOutputMessages} />
              </div>
            </div>
          </div>
        </div>

        <StatusBar
          config={config}
          isConnected={isConnected}
          onConnectionStatusChange={setIsConnected}
          pendingChanges={pendingChanges}
          isSaving={isSaving}
        />

        <NewProjectDialog
          isOpen={isNewProjectOpen}
          onClose={() => setIsNewProjectOpen(false)}
          onCreateProject={handleCreateProject}
        />
        <NewItemDialog
          isOpen={isNewFileDialogOpen}
          onClose={() => setIsNewFileDialogOpen(false)}
          onSubmit={handleCreateNewItem}
          type={newItemType || 'file'}
        />
        <ConfigPanel
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          config={config}
          onConfigChange={setConfig}
        />
      </div>
    </QueryClientProvider>
  );
};

const updateFileContent = (nodes: FileNode[], targetFile: FileNode, newContent: string): FileNode[] => {
  console.group('updateFileContent');
  console.log('Target file:', {
    name: targetFile.name,
    path: targetFile.path,
    currentContent: targetFile.content?.substring(0, 100),
    newContent: newContent.substring(0, 100)
  });

  // Early return if content hasn't changed
  if (targetFile.content === newContent) {
    console.log('Content unchanged, returning original nodes');
    console.groupEnd();
    return nodes;
  }

  const updateNode = (node: FileNode): FileNode => {
    if (node.type === 'file') {
      // Normalize paths by removing leading src/, client/, and any leading slashes
      const normalizeFilePath = (path: string) => {
        return path
          .replace(/^(src\/|client\/)/, '') // Remove leading src/ or client/
          .replace(/^\/+/, ''); // Remove any leading slashes
      };

      // Ensure both nodes have paths for comparison
      const nodePath = normalizeFilePath(node.path || constructFullPath(node, nodes));
      const targetPath = normalizeFilePath(targetFile.path || constructFullPath(targetFile, nodes));

      console.log('Comparing paths:', {
        normalizedNodePath: nodePath,
        normalizedTargetPath: targetPath
      });

      if (nodePath === targetPath) {
        console.log(`Updating content for ${node.path}`, {
          oldContent: node.content?.substring(0, 100),
          newContent: newContent.substring(0, 100)
        });
        return { ...node, path: node.path || constructFullPath(node, nodes), content: newContent };
      }
    }

    if (node.type === 'directory' && node.children) {
      const updatedChildren = node.children.map(updateNode);
      const hasChanges = updatedChildren.some((child, i) => child !== node.children![i]);
      if (hasChanges) {
        return { ...node, children: updatedChildren };
      }
    }

    return node;
  };

  const updatedNodes = nodes.map(updateNode);

  // Verify the update
  const verifyUpdate = (nodes: FileNode[]) => {
    nodes.forEach(node => {
      if (node.type === 'file' &&
          (node.path === targetFile.path ||
           (!targetFile.path && node.name === targetFile.name))) {
        console.log(`Verification for ${node.name}:`, {
          path: node.path,
          contentUpdated: node.content === newContent,
          contentLength: node.content?.length
        });
      }
      if (node.type === 'directory' && node.children) {
        verifyUpdate(node.children);
      }
    });
  };

  verifyUpdate(updatedNodes);
  console.groupEnd();
  return updatedNodes;
};

const updateNodeInTree = (nodes: FileNode[], path: string[], updater: (node: FileNode) => FileNode): FileNode[] => {
  if (path.length === 0) return nodes;

  const [current, ...rest] = path;
  return nodes.map(node => {
    if (node.name !== current) return node;
    if (rest.length === 0) return updater(node);
    return {
      ...node,
      children: node.children ? updateNodeInTree(node.children, rest, updater) : []
    };
  });
};

function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const uint8Array = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(uint8Array.slice(i, i + chunkSize)));
  }
  return btoa(binary);
};

export default App;