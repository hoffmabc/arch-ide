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
import { ArchProgramLoader, deployProgram } from './utils/arch-sdk-deployer';
import { storage } from './utils/storage';
import { FileChange } from './types/types';
import { Plus, FolderPlus, Download } from 'lucide-react';
import { Buffer } from 'buffer/';
import { formatBuildError } from './utils/errorFormatter';
import { Loader2 } from 'lucide-react';
import { ArchPgClient } from './utils/archPgClient';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import { ThemeVariableProvider } from './theme/ThemeProvider';
import ARCH_THEME from './theme/theme';
import { GlobalStyles } from './styles/GlobalStyles';
import { DeploymentModal } from './components/DeploymentModal';
import { BrowserCompatibilityAlert } from './components/BrowserCompatibilityAlert';
import { TutorialProvider, useTutorial } from './context/TutorialContext';
import { TutorialOverlay } from './components/TutorialOverlay';
import { WelcomeModal } from './components/WelcomeModal';

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

// Debug helper function
if (typeof window !== 'undefined') {
  (window as any).debugStorage = () => {
    console.group('🔍 DEBUG: LocalStorage State');
    console.log('Current Project ID:', localStorage.getItem('currentProjectId'));

    // Find all expandedFolders keys
    const expandedFoldersKeys = Object.keys(localStorage).filter(key =>
      key.startsWith('expandedFolders_')
    );

    console.log('Expanded Folders Keys:', expandedFoldersKeys);
    expandedFoldersKeys.forEach(key => {
      console.log(`  ${key}:`, localStorage.getItem(key));
    });

    console.log('All localStorage keys:', Object.keys(localStorage));
    console.groupEnd();

    return {
      currentProjectId: localStorage.getItem('currentProjectId'),
      expandedFoldersData: expandedFoldersKeys.reduce((acc, key) => {
        acc[key] = localStorage.getItem(key);
        return acc;
      }, {} as Record<string, string | null>)
    };
  };
}

const AppContent = () => {
  const { isActive, startTutorial, skipTutorial } = useTutorial();
  const [projects, setProjects] = useState<Project[]>([]);
  const [fullCurrentProjectRaw, setFullCurrentProjectRaw] = useState<Project | null>(null);

  // Wrap setFullCurrentProject to log all calls
  const setFullCurrentProject = useCallback((project: Project | null | ((prev: Project | null) => Project | null)) => {
    const newProject = typeof project === 'function' ? project(fullCurrentProjectRaw) : project;
    console.log('🔄 setFullCurrentProject called:', {
      name: newProject?.name,
      description: newProject?.description,
      hasDescription: !!newProject?.description,
      stack: new Error().stack?.split('\n').slice(2, 5).join('\n')
    });
    setFullCurrentProjectRaw(newProject);
  }, [fullCurrentProjectRaw]);

  const fullCurrentProject = fullCurrentProjectRaw;
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
  const { theme } = useTheme();
  const [actualConnectedUrl, setActualConnectedUrl] = useState<string | null>(null);
  const [isDeploymentModalOpen, setIsDeploymentModalOpen] = useState(false);
  const [utxoInfo, setUtxoInfo] = useState<{ txid: string; vout: number } | undefined>(undefined);
  const [showWelcome, setShowWelcome] = useState(false);

  const debouncedSave = useCallback(
    debounce((projectToSave: Project) => {
      projectService.saveProject(projectToSave);
    }, 2000),
    []
  );

  useEffect(() => {
    const loadProjects = async () => {
      console.group('🔍 Initial Project Load - DEBUGGING');
      const loadedProjects = await projectService.getAllProjects();
      console.log('📦 Loaded projects:', loadedProjects.map(p => ({ id: p.id, name: p.name })));

      // Only strip in production for the project list
      if (import.meta.env.PROD) {
        setProjects(loadedProjects.map(stripProjectContent));
      } else {
        setProjects(loadedProjects);
      }

      if (loadedProjects.length > 0) {
        // Try to restore the last active project
        const lastActiveProjectId = localStorage.getItem('currentProjectId');
        console.log('💾 Last active project ID from localStorage:', lastActiveProjectId);
        console.log('📋 Available project IDs:', loadedProjects.map(p => p.id));

        let projectIdToLoad = loadedProjects[0].id;

        if (lastActiveProjectId) {
          const savedProject = loadedProjects.find(p => p.id === lastActiveProjectId);
          if (savedProject) {
            projectIdToLoad = savedProject.id;
            console.log('✅ Restoring last active project:', savedProject.name);
          } else {
            console.log('❌ Last active project not found, using first project');
          }
        } else {
          console.log('⚠️ No last active project ID found, using first project');
        }

        // Load the full project with content directly from storage
        console.log('🎯 Loading full project with ID:', projectIdToLoad);
        try {
          const fullProject = await projectService.getProject(projectIdToLoad);
          if (fullProject) {
            // Recursively check if any file has content
            const hasAnyContent = (nodes: FileNode[]): boolean => {
              for (const node of nodes) {
                if (node.type === 'file' && node.content && node.content.length > 0) {
                  return true;
                }
                if (node.type === 'directory' && node.children && hasAnyContent(node.children)) {
                  return true;
                }
              }
              return false;
            };

            console.log('✅ Full project loaded with content:', {
              id: fullProject.id,
              name: fullProject.name,
              fileCount: fullProject.files.length,
              hasContent: hasAnyContent(fullProject.files)
            });
            setFullCurrentProject(fullProject);
          } else {
            console.error('❌ Project returned null - ID may not exist:', projectIdToLoad);
          }
        } catch (error) {
          console.error('❌ Failed to load project:', error);
          // If project is corrupted, try to delete it and clear state
          try {
            await projectService.deleteProject(projectIdToLoad);
            console.log('🗑️ Deleted corrupted project');
          } catch (deleteError) {
            console.error('Failed to delete corrupted project:', deleteError);
          }

          // Clear the corrupted project from localStorage
          localStorage.removeItem('currentProjectId');
          localStorage.removeItem(`expandedFolders_${projectIdToLoad}`);

          // Show message to user
          alert('The project was corrupted and has been removed. Please create a new project.');

          // Reload projects list
          const remainingProjects = await projectService.getAllProjects();
          if (import.meta.env.PROD) {
            setProjects(remainingProjects.map(stripProjectContent));
          } else {
            setProjects(remainingProjects);
          }
        }
      } else {
        console.log('❌ No projects found');
      }
      console.groupEnd();
    };

    loadProjects();
  }, []);

  // Modify the project update effect to prevent unnecessary saves
  useEffect(() => {
      console.log('⚠️ fullCurrentProject changed useEffect triggered:', {
      isDev: import.meta.env.DEV,
      hasProject: !!fullCurrentProject,
      willRun: !!(fullCurrentProject && !import.meta.env.DEV),
      projectName: fullCurrentProject?.name,
      projectDescription: fullCurrentProject?.description
    });

    if (fullCurrentProject && !import.meta.env.DEV) {
      console.log('🔄 Auto-saving project due to fullCurrentProject change');
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
      network: 'testnet',
      rpcUrl: 'https://rpc-beta.test.arch.network',
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

  // Add this with your other initialization effects
  // Only restore state when project ID changes (i.e., switching projects), not when metadata updates
  useEffect(() => {
    if (fullCurrentProject) {
      console.group('🔍 Restore Expanded Folders - DEBUGGING');
      console.log('📦 Current project:', { id: fullCurrentProject.id, name: fullCurrentProject.name });

      // Restore expanded folders (project-specific)
      const storageKey = `expandedFolders_${fullCurrentProject.id}`;
      console.log('🔑 Storage key:', storageKey);

      const savedExpandedFolders = localStorage.getItem(storageKey);
      console.log('💾 Saved expanded folders from localStorage:', savedExpandedFolders);

      let foldersToSet: Set<string>;

      if (savedExpandedFolders) {
        try {
          const expandedPaths = JSON.parse(savedExpandedFolders);
          console.log('📂 Parsed expanded paths:', expandedPaths);
          // Use ONLY the saved data, don't add defaults
          foldersToSet = new Set(expandedPaths);
          console.log('✅ Using saved expanded folders (no defaults)');
        } catch (e) {
          console.error('❌ Error restoring expanded folders:', e);
          // On error, use defaults
          foldersToSet = new Set(['src', 'client']);
        }
      } else {
        console.log('⚠️ No saved expanded folders found - using defaults');
        // Only use defaults for new projects (no saved data)
        foldersToSet = new Set(['src', 'client']);
      }

      console.log('✅ Setting expanded folders to:', Array.from(foldersToSet));
      setExpandedFolders(foldersToSet);
      console.groupEnd();

      // Restore tabs
      const savedTabs = localStorage.getItem('editorTabs');
      const savedCurrentFile = localStorage.getItem('currentEditorFile');

      console.log('📑 Restoring editor tabs:', {
        savedTabs,
        savedCurrentFile,
        projectId: fullCurrentProject.id
      });

      if (savedTabs) {
        try {
          const tabPaths = JSON.parse(savedTabs);
          console.log('📋 Tab paths to restore:', tabPaths);

          const validTabs = tabPaths
            .map((path: string) => findFileInProject(fullCurrentProject.files, path))
            .filter((file: FileNode | null): file is FileNode => file !== null);

          console.log('✅ Valid tabs found:', validTabs.length, validTabs.map((t: FileNode) => t.name));

          if (validTabs.length > 0) {
            // Open all tabs at once
            setOpenFiles(validTabs);

            // Set current file to either the previously selected file or the first tab
            if (savedCurrentFile) {
              const currentFile = findFileInProject(fullCurrentProject.files, savedCurrentFile);
              if (currentFile) {
                console.log('📌 Restoring current file:', currentFile.name);
                setCurrentFile(currentFile);
              } else {
                console.log('⚠️ Saved current file not found, using first tab');
                setCurrentFile(validTabs[0]);
              }
            } else {
              console.log('📌 No saved current file, using first tab:', validTabs[0].name);
              setCurrentFile(validTabs[0]);
            }
          }
        } catch (e) {
          console.error('Error restoring editor tabs:', e);
        }
      } else {
        console.log('⚠️ No saved tabs found in localStorage');
      }
    }
  }, [fullCurrentProject?.id]); // Only trigger when project ID changes, not when name/description changes

  const handleDeploy = async () => {
    const missing = [];
    if (!fullCurrentProject) missing.push('project');
    if (!programId) missing.push('program ID');
    if (!isConnected) missing.push('connection');
    if (fullCurrentProject && !fullCurrentProject.account) missing.push('program keypair');
    if (!programBinary) missing.push('program binary');

    if (missing.length > 0) {
      addOutputMessage('error', `Cannot deploy: Missing ${missing.join(', ')}`);
      return;
    }

    // Open the deployment modal instead of immediately deploying
    setIsDeploymentModalOpen(true);
  };

  // New function to handle the actual deployment after modal confirmation
  const handleDeployConfirm = async (customUtxoInfo?: { txid: string; vout: number }) => {
    if (!fullCurrentProject || !programId || !isConnected || !programBinary) {
      addOutputMessage('error', 'Cannot deploy: Missing required information');
      setIsDeploymentModalOpen(false);
      return;
    }

    // We should be using fullCurrentProject.account instead of currentAccount
    if (!fullCurrentProject.account) {
      addOutputMessage('error', 'Cannot deploy: Missing program keypair. Please generate a program ID in the Build & Deploy sidebar.');
      setIsDeploymentModalOpen(false);
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

      // Use fullCurrentProject.account (program keypair) instead of currentAccount (browser wallet)
      console.log(`keypair:`, fullCurrentProject.account);

      const deployOptions = {
        rpcUrl: config.rpcUrl,
        network: config.network,
        programBinary: Buffer.from(binaryData),
        keypair: fullCurrentProject.account, // Use program keypair from project
        regtestConfig: config.network === 'devnet' ? config.regtestConfig : undefined,
        utxoInfo: customUtxoInfo // Pass the optional UTXO info
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
      setIsDeploymentModalOpen(false); // Close the modal when done
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
    if (!newContent || !currentFile || !fullCurrentProject) {
      console.warn('Attempted to save empty content - operation blocked');
      return;
    }

    if (newContent.trim().length === 0) {
      addOutputMessage('error', 'Cannot save empty file content');
      return;
    }

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

  const saveTabState = useCallback(() => {
    if (openFiles.length > 0) {
      localStorage.setItem('editorTabs', JSON.stringify(openFiles.map(f => f.path || f.name)));
      if (currentFile) {
        localStorage.setItem('currentEditorFile', currentFile.path || currentFile.name);
      }
    } else {
      localStorage.removeItem('editorTabs');
      localStorage.removeItem('currentEditorFile');
    }
  }, [openFiles, currentFile]);

  const handleFileSelect = (file: FileNode) => {
    if (file.type === 'file') {
      const filePath = file.path || constructFullPath(file, fullCurrentProject?.files || []);
      const openFile = openFiles.find(f => f.path === filePath);
      const currentProjectFile = !openFile && fullCurrentProject ?
        findFileInProject(fullCurrentProject.files, filePath) : null;
      const fileToUse = openFile || currentProjectFile || {
        ...file,
        path: filePath,
        name: file.name
      };

      setCurrentFile(fileToUse);

      if (!openFiles.some(f => f.path === filePath)) {
        setOpenFiles(prev => [...prev, fileToUse]);
      }

      // Save to localStorage immediately with the new file
      // (can't use saveTabState because state hasn't updated yet)
      localStorage.setItem('currentEditorFile', fileToUse.path || fileToUse.name);
    }
  };

  const handleCloseFile = useCallback((file: FileNode) => {
    setOpenFiles(prev => prev.filter(f => f.path !== file.path));
    if (currentFile?.path === file.path) {
      const nextFile = openFiles[openFiles.length - 2]; // Get previous file
      setCurrentFile(nextFile || null);
    }

    // Update localStorage after closing
    saveTabState();
  }, [currentFile, openFiles, saveTabState]);

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

      // Start the build (returns immediately)
      const buildResponse = await fetch(`${API_URL}/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          program_name: fullCurrentProject.name,
          files: rsFiles,
          uuid: fullCurrentProject.id // Send existing UUID for consistent builds
        })
      });

      if (!buildResponse.ok) {
        const error = new Error(`Build failed with status: ${buildResponse.status}`);
        // Update the command message to remove loading state before throwing
        setOutputMessages(prev => {
          const messages = [...prev];
          const lastCommandIndex = messages.reverse().findIndex(m => m.type === 'command');
          if (lastCommandIndex !== -1) {
            const actualIndex = messages.length - 1 - lastCommandIndex;
            messages[actualIndex] = { ...messages[actualIndex], isLoading: false };
          }
          messages.reverse();
          return messages;
        });
        throw error;
      }

      const buildStartResult = await buildResponse.json();
      const { uuid, status: buildStatus } = buildStartResult;

      console.log('Build started with UUID:', uuid, 'Status:', buildStatus);
      addOutputMessage('info', `Build started (UUID: ${uuid})...`);

      // Poll for build status
      let pollCount = 0;
      const maxPolls = 180; // 6 minutes max (180 * 2 seconds)
      const pollInterval = 2000; // 2 seconds

      const pollBuildStatus = async (): Promise<void> => {
        if (pollCount >= maxPolls) {
          throw new Error('Build timeout: exceeded maximum wait time (6 minutes)');
        }

        pollCount++;

        const statusResponse = await fetch(`${API_URL}/build/status/${uuid}`);

        if (!statusResponse.ok) {
          if (statusResponse.status === 404) {
            throw new Error('Build not found. It may have been cleaned up.');
          }
          throw new Error(`Failed to fetch build status: ${statusResponse.statusText}`);
        }

        const statusResult = await statusResponse.json();
        console.log(`Build status poll #${pollCount}:`, statusResult.status);

        if (statusResult.status === 'building') {
          // Show progress update every 10 polls (20 seconds)
          if (pollCount % 10 === 0) {
            const elapsed = Math.floor((pollCount * pollInterval) / 1000);
            addOutputMessage('info', `Still building... (${elapsed}s elapsed)`);
          }

          // Continue polling
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          return pollBuildStatus();
        } else if (statusResult.status === 'success') {
          // Build completed successfully
          if (statusResult.stderr) {
            const formattedError = formatBuildError(statusResult.stderr);
            addOutputMessage('info', formattedError);
          }

          addOutputMessage('success', 'Build successful');

          // After successful build, fetch the binary
          try {
            const program_name = statusResult.program_name || fullCurrentProject.name;

            const binaryResponse = await fetch(
              `${API_URL}/deploy/${uuid}/${program_name}`,
              { headers: { Accept: 'application/octet-stream' } }
            );

            if (!binaryResponse.ok) {
              throw new Error(`Failed to fetch binary: ${binaryResponse.statusText}`);
            }

            const arrayBuffer = await binaryResponse.arrayBuffer();
            const base64Binary = Buffer.from(arrayBuffer).toString('base64');
            setProgramBinary(`data:application/octet-stream;base64,${base64Binary}`);
            setBinaryFileName(`${fullCurrentProject.name}.so`);
            addOutputMessage('info', `Program binary retrieved successfully (${arrayBuffer.byteLength} bytes)`);
          } catch (error: any) {
            addOutputMessage('error', `Failed to retrieve program binary: ${error.message}`);
          }
        } else if (statusResult.status === 'failed') {
          // Build failed
          if (statusResult.stderr) {
            const formattedError = formatBuildError(statusResult.stderr);
            addOutputMessage('error', formattedError);
            throw new Error('Build failed');
          } else {
            throw new Error('Build failed with no error details');
          }
        } else {
          // Unknown status
          throw new Error(`Unknown build status: ${statusResult.status}`);
        }
      };

      // Start polling
      await pollBuildStatus();

    } catch (error: any) {
      addOutputMessage('error', `Build error: ${error.message}`);
      console.error('Build error:', error);
    } finally {
      // Always reset loading states
      setIsCompiling(false);
      setOutputMessages(prev => {
        const messages = [...prev];
        // Find all loading messages from the current command and update them
        const lastLoadingCommand = messages.reverse().find(m => m.type === 'command' && m.isLoading);
        if (lastLoadingCommand?.commandId) {
          messages.forEach(msg => {
            if (msg.commandId === lastLoadingCommand.commandId) {
              msg.isLoading = false;
            }
          });
        }
        messages.reverse();
        return messages;
      });
    }
  };

  const addOutputMessage = (type: OutputMessage['type'], content: string, isLoading: boolean = false) => {
    setOutputMessages(prev => {
      const messages = [...prev];

      // Generate a unique command ID when starting a new command
      const commandId = type === 'command' && isLoading ?
        Date.now().toString() : undefined;

      // If adding an error or success message, update all loading states for the current command
      if (type === 'error' || type === 'success') {
        // Find the last command message that's still loading
        const lastLoadingCommand = messages.reverse().find(m => m.type === 'command' && m.isLoading);
        if (lastLoadingCommand?.commandId) {
          // Update all messages with this commandId to not be loading
          messages.forEach(msg => {
            if (msg.commandId === lastLoadingCommand.commandId) {
              msg.isLoading = false;
            }
          });
        }
        messages.reverse();
      }

      // Add the new message with commandId if applicable
      return [...messages, {
        type,
        content,
        timestamp: new Date(),
        isLoading,
        commandId // Add commandId to track related messages
      }];
    });
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

      // Clean up localStorage entries for this project
      localStorage.removeItem(`expandedFolders_${projectId}`);
      if (isCurrentProject) {
        localStorage.removeItem('currentProjectId');
      }

      // Delete from storage
      await projectService.deleteProject(projectId);

      // Batch state updates
      const remainingProjects = await projectService.getAllProjects();

      // Update projects list and current project in one render cycle
      setProjects(remainingProjects.map(stripProjectContent));

      if (isCurrentProject) {
        // Set new current project if available - load full project with content
        if (remainingProjects.length > 0) {
          try {
            const nextFullProject = await projectService.getProject(remainingProjects[0].id);
            setFullCurrentProject(nextFullProject);
          } catch (error) {
            console.error('Failed to load next project:', error);
            setFullCurrentProject(null);
          }
        } else {
          setFullCurrentProject(null);
        }
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
      // Even if content is unchanged, we need to ensure tab state is preserved
      const updatedFiles = updateFileContent(fullCurrentProject.files, currentFile, newContent);
      const updatedProject = {
        ...fullCurrentProject,
        files: updatedFiles,
        lastModified: new Date()
      };

      // Save project
      await projectService.saveProject(updatedProject);

      // Create a copy of the current file with updated content
      const updatedCurrentFile = {
        ...currentFile,
        content: newContent,
        // Explicitly preserve these critical properties
        path: currentFile.path,
        name: currentFile.name,
        type: currentFile.type
      };

      // Update current file state
      setCurrentFile(updatedCurrentFile);

      // Update open files array - use path for matching if available, otherwise use name
      setOpenFiles(prev => {
        return prev.map(f => {
          if ((currentFile.path && f.path === currentFile.path) ||
              (!currentFile.path && f.name === currentFile.name)) {
            return updatedCurrentFile;
          }
          return f;
        });
      });

      // Update project state
      setFullCurrentProject(updatedProject);

      console.log('File saved successfully');

      // Force save tab state to localStorage
      if (openFiles.length > 0) {
        localStorage.setItem('editorTabs', JSON.stringify(openFiles.map(f => f.path || f.name)));
        if (currentFile) {
          localStorage.setItem('currentEditorFile', currentFile.path || currentFile.name);
        }
      }
    } catch (error) {
      console.error('Save failed:', error);
    }

    console.groupEnd();
  }, [currentFile, fullCurrentProject, openFiles]);

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

  const handleProjectAccountChange = async (account: ProjectAccount | null) => {
    if (!fullCurrentProject) return;

    const updatedProject = {
      ...fullCurrentProject,
      account: account || undefined
    };

    await projectService.saveProject(updatedProject);
    setFullCurrentProject(updatedProject);
    setCurrentAccount(account);
  };

  const handleProjectUpdate = async (updatedProject: Project) => {
    console.log('🔄 handleProjectUpdate called:', {
      id: updatedProject.id,
      name: updatedProject.name,
      description: updatedProject.description
    });

    // Update the project state with the new metadata (name, description, etc.)
    setFullCurrentProject(updatedProject);

    // Also update the projects list to reflect the changes
    const strippedProject = stripProjectContent(updatedProject);
    console.log('📋 Stripped project for list:', {
      id: strippedProject.id,
      name: strippedProject.name,
      description: strippedProject.description,
      hasDescription: !!strippedProject.description
    });

    setProjects(prev => prev.map(p =>
      p.id === updatedProject.id ? strippedProject : p
    ));

    console.log('✅ handleProjectUpdate complete');
  };

  const handleProjectSelect = async (project: Project) => {
    console.group('🔄 Project Selection - DEBUGGING');
    console.log('📌 Selected project:', project);
    console.log('📌 Previous project:', fullCurrentProject?.name);

    try {
      const fullProject = await projectService.getProject(project.id);
      if (!fullProject) {
        console.warn('❌ Project not found');
        console.groupEnd();
        return;
      }

      console.log('✅ Loading full project:', { id: fullProject.id, name: fullProject.name });
      console.log('📂 About to call setFullCurrentProject - this should trigger expandedFolders restore');
      setFullCurrentProject(fullProject);
      setCurrentAccount(fullProject.account || null);
      setProgramId(fullProject.account?.pubkey);
      setProgramBinary(null);
      // Don't clear openFiles and currentFile here - let the useEffect restore them from localStorage

      console.log('✅ Project switch complete - useEffect should now run to restore tabs and expanded folders');
      console.groupEnd();
    } catch (error) {
      console.error('❌ Failed to load project:', error);
      console.groupEnd();

      // Show error to user and suggest deleting the corrupted project
      if (confirm(`Failed to load project "${project.name}". It may be corrupted. Would you like to delete it?`)) {
        try {
          await projectService.deleteProject(project.id);
          const remainingProjects = await projectService.getAllProjects();
          setProjects(remainingProjects.map(stripProjectContent));

          // Load first remaining project if available
          if (remainingProjects.length > 0) {
            const nextProject = await projectService.getProject(remainingProjects[0].id);
            setFullCurrentProject(nextProject);
          } else {
            setFullCurrentProject(null);
          }
        } catch (deleteError) {
          console.error('Failed to delete corrupted project:', deleteError);
          alert('Failed to delete the corrupted project. Please try again or clear your browser data.');
        }
      }
    }
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

    // Save current file selection to localStorage
    localStorage.setItem('currentEditorFile', fileWithPath.path || fileWithPath.name);

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

      // Save current file selection to localStorage
      localStorage.setItem('currentEditorFile', projectFile.path || projectFile.name);
    } else {
      console.warn('File not found in project:', file.path || file.name);
    }

    console.groupEnd();
  };

  // Save current project ID whenever it changes
  useEffect(() => {
    if (fullCurrentProject) {
      localStorage.setItem('currentProjectId', fullCurrentProject.id);
      console.log('💾 Saved current project ID:', fullCurrentProject.id);
      console.log('🔍 Verify - reading back:', localStorage.getItem('currentProjectId'));
    }
  }, [fullCurrentProject]);

  // Save expandedFolders whenever it changes (project-specific)
  useEffect(() => {
    if (fullCurrentProject) {
      const storageKey = `expandedFolders_${fullCurrentProject.id}`;
      const foldersArray = Array.from(expandedFolders);
      localStorage.setItem(storageKey, JSON.stringify(foldersArray));
      console.log('💾 Saved expandedFolders for project', fullCurrentProject.name);
      console.log('  - Storage key:', storageKey);
      console.log('  - Folders:', foldersArray);
      console.log('  - Size:', expandedFolders.size);
      console.log('🔍 Verify - reading back:', localStorage.getItem(storageKey));
    }
  }, [expandedFolders, fullCurrentProject]);

  const runClientCode = async () => {
    try {
      if (!currentFile || !currentFile.name.endsWith('.ts')) {
        addOutputMessage('error', 'No TypeScript file selected');
        return;
      }

      let clientCode = currentFile.content;
      if (!clientCode) {
        addOutputMessage('error', 'Client code not found');
        return;
      }

      // Decode base64 content if necessary (with UTF-8 support)
      const base64Prefix = 'data:text/plain;base64,';
      if (clientCode.startsWith(base64Prefix)) {
        try {
          const base64Content = clientCode.slice(base64Prefix.length);
          const decoded = atob(base64Content);

          // Convert from Latin1 bytes to UTF-8 string
          try {
            const utf8Bytes = new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)));
            clientCode = new TextDecoder().decode(utf8Bytes);
          } catch (e) {
            // Fallback: try legacy decoding
            clientCode = decodeURIComponent(escape(decoded));
          }
        } catch (e) {
          console.error('Failed to decode base64 content:', e);
          addOutputMessage('error', 'Failed to decode file content');
          return;
        }
      }

      addOutputMessage('info', 'Executing code...');

      try {
        await ArchPgClient.execute({
          fileName: currentFile.name,
          code: clientCode,
          onMessage: (type: string, message: string) => {
            // Map the string type to our OutputMessage type
            const messageType = type === 'error' ? 'error' :
                              type === 'success' ? 'success' :
                              type === 'command' ? 'command' : 'info';
            console.log('onMessage called with:', { type, message });
            addOutputMessage(messageType, message);
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

  const displayUrl = isConnected ? actualConnectedUrl || config.rpcUrl : config.rpcUrl;

  const handleDeleteAllProjects = async () => {
    try {
      // Delete all projects from storage
      const projectIds = projects.map(p => p.id);
      await Promise.all(projectIds.map(id => projectService.deleteProject(id)));

      // Clear state
      setProjects([]);
      setFullCurrentProject(null);
      setCurrentFile(null);
      setOpenFiles([]);
      setPendingChanges(new Map());

      // Clear storage
      storage.saveProgramBinary(null);
      storage.saveProgramId(undefined);
      storage.saveCurrentAccount(null);

      addOutputMessage('success', 'All projects have been deleted');
    } catch (error) {
      console.error('Failed to delete all projects:', error);
      addOutputMessage('error', 'Failed to delete all projects');
    }
  };

  useEffect(() => {
    const hasCompletedTutorial = storage.getHasCompletedTutorial();
    if (!hasCompletedTutorial && !isActive) {
      setShowWelcome(true);
    }
  }, []);

  return (
    <div className="h-screen flex flex-col" style={{
      backgroundColor: theme.colors.default.bgPrimary,
      color: theme.colors.default.textPrimary
    }}>
      <nav className="flex items-center justify-between px-6 py-4" style={{
        borderBottom: `1px solid ${theme.colors.default.border}`,
        backgroundColor: theme.colors.default.bgSecondary
      }}>
        <div className="flex items-center gap-6">
          <img src="/images/logo.svg" alt="Logo" className="h-12 w-21" />
          <h1 className="text-3xl font-bold text-white">Playground</h1>
        </div>
        <ProjectList
          projects={projects}
          currentProject={fullCurrentProject || undefined}
          onSelectProject={handleProjectSelect}
          onNewProject={handleNewProject}
          onDeleteProject={handleDeleteProject}
          onProjectsChange={setProjects}
          onDeleteAllProjects={handleDeleteAllProjects}
        />
        <Button variant="ghost" size="icon" onClick={() => setIsConfigOpen(true)}>
          <Settings className="h-6 w-6" />
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
          onProjectUpdate={handleProjectUpdate}
          onNewProject={handleNewProject}
          binaryFileName={binaryFileName}
          setBinaryFileName={setBinaryFileName}
          addOutputMessage={addOutputMessage}
          expandedFolders={expandedFolders}
          onExpandedFoldersChange={setExpandedFolders}
        />

        <div className="flex flex-col flex-1 overflow-hidden">
          <TabBar
            openFiles={openFiles}
            currentFile={currentFile}
            onSelectFile={handleFileSelect}
            onCloseFile={handleCloseFile}
            currentProject={fullCurrentProject}
            onRunClientCode={runClientCode}
          />
          <div className="flex-1 overflow-hidden">
          <Editor
            code={currentFile?.content ?? '// Select a file to edit'}
            onChange={handleFileChange}
            onSave={handleSaveFile}
            currentFile={currentFile}
            onSelectFile={handleFileSelect}
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
      >
        <div className="flex items-center gap-1">
          {isConnected ? (
            <div className="flex items-center gap-1">
              <span className="text-green-500">✓</span> Connected to {config.network} ({actualConnectedUrl || config.rpcUrl})
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-red-500">✗</span> Not connected to network
            </div>
          )}
        </div>
      </StatusBar>

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
      <DeploymentModal
        isOpen={isDeploymentModalOpen}
        onClose={() => setIsDeploymentModalOpen(false)}
        onDeploy={handleDeployConfirm}
        isConnected={isConnected}
        isDeploying={isDeploying}
        network={config.network === 'mainnet-beta' ? 'mainnet' :
                config.network === 'testnet' ? 'testnet' : 'devnet'}
        programId={programId}
        rpcUrl={config.rpcUrl}
      />
      <BrowserCompatibilityAlert />
      <WelcomeModal
        isOpen={showWelcome}
        onStart={() => {
          setShowWelcome(false);
          startTutorial();
        }}
        onSkip={() => {
          setShowWelcome(false);
          skipTutorial();
        }}
      />
    </div>
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

const App = () => {
  return (
    <ThemeProvider>
      <TutorialProvider>
        <TutorialOverlay />
        <QueryClientProvider client={queryClient}>
          <AppContent />
        </QueryClientProvider>
      </TutorialProvider>
    </ThemeProvider>
  );
};

export default App;