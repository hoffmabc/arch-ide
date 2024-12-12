// src/App.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Editor from './components/Editor';
import { Output } from './components/Output';
import ProjectList from './components/ProjectList';
import NewProjectDialog from './components/NewProjectDialog';
import { projectService } from './services/projectService';
import type { Project, FileNode } from './types';
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

const queryClient = new QueryClient();
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
interface FileOperation {
  type: 'create' | 'delete' | 'rename';
  path: string[];
  fileType?: 'file' | 'directory';
  newName?: string;
}

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
  create: (nodes: FileNode[], path: string[], type: 'file' | 'directory'): FileNode[] => {
    const parentPath = pathUtils.getParentPath(path);
    const fileName = pathUtils.getFileName(path);
    const fullPath = pathUtils.normalize(path);

    const newNode: FileNode = {
      name: fileName,
      type: type,
      content: type === 'file' ? '' : undefined,
      children: type === 'directory' ? [] : undefined,
      path: fullPath
    };

    return updateNodeInTree(nodes, parentPath, (parent) => ({
      ...parent,
      children: [...(parent.children || []), newNode]
    }));
  },

  delete: (nodes: FileNode[], path: string[]): FileNode[] => {
    const parentPath = pathUtils.getParentPath(path);
    const fileName = pathUtils.getFileName(path);

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

const App = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
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
  const [currentAccount, setCurrentAccount] = useState<{
    privkey: string;
    pubkey: string;
    address: string;
  } | null>(null);
  const [currentView, setCurrentView] = useState<'explorer' | 'build'>(storage.getCurrentView());

  const debouncedSave = useCallback(
    debounce((projectToSave: Project) => {
      projectService.saveProject(projectToSave);
    }, 2000),
    []
  );

  useEffect(() => {
    const loadProjects = async () => {
      const loadedProjects = await projectService.getAllProjects();
      setProjects(loadedProjects);
      if (loadedProjects.length > 0) {
        setCurrentProject(loadedProjects[0]);
      }
    };

    loadProjects();
  }, []);

  useEffect(() => {
    if (currentProject) {
      const updateProjects = async () => {
        await projectService.saveProject(currentProject);
        const updatedProjects = await projectService.getAllProjects();
        setProjects(updatedProjects);
      };

      updateProjects();
    }
  }, [currentProject]);

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

  const handleDeploy = async () => {
    if (!currentProject || !programId || !isConnected || !currentAccount || !programBinary) {
      const missing = [];
      if (!currentProject) missing.push('project');
      if (!programId) missing.push('program ID');
      if (!isConnected) missing.push('connection');
      if (!currentAccount) missing.push('account/keypair');
      if (!programBinary) missing.push('program binary');

      addOutputMessage('error', `Cannot deploy: Missing ${missing.join(', ')}`);
      return;
    }

    setIsDeploying(true);
    try {
      // Convert base64 to Uint8Array
      let binaryData: Uint8Array;
      if (programBinary.startsWith('data:')) {
        const base64Content = programBinary.split(',')[1];
        const binaryString = window.atob(base64Content);
        binaryData = Uint8Array.from(binaryString, c => c.charCodeAt(0));
      } else {
        const binaryString = window.atob(programBinary);
        binaryData = Uint8Array.from(binaryString, c => c.charCodeAt(0));
      }

      const deployOptions = {
        rpcUrl: config.rpcUrl,
        network: config.network,
        programBinary: Buffer.from(binaryData),
        keypair: currentAccount,
        regtestConfig: config.network === 'devnet' ? config.regtestConfig : undefined
      };

      const result = await ArchProgramLoader.load(deployOptions);

      if (result.programId) {
        addOutputMessage('success', `Program deployed successfully`);
        addOutputMessage('info', `Program ID: ${result.programId}`);
        setProgramId(result.programId);
      }
    } catch (error: any) {
      addOutputMessage('error', `Deploy error: ${error.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleCreateProject = async (name: string, description: string) => {
    const newProject = await projectService.createProject(name, description);
    const updatedProjects = await projectService.getAllProjects();
    setProjects(updatedProjects);
    setCurrentProject(newProject);

    // Clear all open tabs and current file when creating a new project
    setOpenFiles([]);
    setCurrentFile(null);
    setIsNewProjectOpen(false);
  };

  const handleNewItem = (path: string[], type: 'file' | 'directory') => {
    console.log('handleNewItem called with:', { path, type });
    setNewItemPath(path);
    setNewItemType(type);
    setIsNewFileDialogOpen(true);
  };

  const handleFileChange = useCallback((newContent: string | undefined) => {
    if (!newContent || !currentFile || !currentProject) return;

    // Update UI immediately
    setCurrentFile(prev => ({
      ...prev!,
      content: newContent
    }));

    // Update project files
    const updatedFiles = updateFileContent(currentProject.files, currentFile, newContent);

    // Only update if content actually changed
    if (JSON.stringify(updatedFiles) !== JSON.stringify(currentProject.files)) {
      const updatedProject = {
        ...currentProject,
        files: updatedFiles,
        lastModified: new Date()
      };

      setCurrentProject(updatedProject);
      setProjects(prev => prev.map(p =>
        p.id === updatedProject.id ? updatedProject : p
      ));

      // Use the debounced save
      debouncedSave(updatedProject);
    }
  }, [currentFile, currentProject, debouncedSave]);

  const handleCreateNewItem = (name: string) => {
    console.log('handleCreateNewItem called with:', { name, path: newItemPath, type: newItemType });
    if (newItemPath && newItemType) {
      handleUpdateTree({
        type: 'create',
        path: [...newItemPath, name],
        fileType: newItemType
      });
    }
  };

  const findFileInProject = (files: FileNode[], targetPath: string): FileNode | null => {
    for (const file of files) {
      if (file.path === targetPath) return file;
      if (file.children) {
        const found = findFileInProject(file.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  };

  const handleFileSelect = (file: FileNode) => {
    if (file.type === 'file') {
      // Always use the full path from the file structure
      const filePath = file.path || constructFullPath(file, currentProject?.files || []);

      // First check if the file is in openFiles
      const openFile = openFiles.find(f => f.path === filePath);

      // Then check project files if not found in open files
      const currentProjectFile = !openFile && currentProject ?
        findFileInProject(currentProject.files, filePath) : null;

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
      if (currentProject) {
        projectService.saveProject(currentProject);
      }
    }, 1000);

  }, [currentFile, currentProject]);

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
    if (!currentProject) return;

    let updatedFiles: FileNode[];

    switch (operation.type) {
      case 'create':
        updatedFiles = fileTreeOperations.create(
          currentProject.files,
          operation.path,
          operation.fileType || 'file'
        );

        // Handle UI updates after tree modification
        if (operation.fileType === 'file') {
          const fullPath = operation.path.join('/');
          const newNode = findNodeByPath(updatedFiles, operation.path);
          if (newNode) {
            // Ensure the new node has the correct path
            const nodeWithPath = {
              ...newNode,
              path: fullPath,
              content: '' // Initialize with empty content
            };
            setCurrentFile(nodeWithPath);
            setOpenFiles(prev => [...prev, nodeWithPath]);
          }
        }
        break;

      case 'delete':
        updatedFiles = fileTreeOperations.delete(currentProject.files, operation.path);
        break;

      case 'rename':
        updatedFiles = fileTreeOperations.rename(
          currentProject.files,
          operation.path,
          operation.newName || ''
        );
        break;
    }

    const updatedProject = {
      ...currentProject,
      files: updatedFiles,
      lastModified: new Date()
    };

    projectService.saveProject(updatedProject);
    setCurrentProject(updatedProject);
    setProjects(prev =>
      prev.map(p => p.id === updatedProject.id ? updatedProject : p)
    );
  };

  const handleCompile = async () => {
    if (!currentProject) return;

    setIsCompiling(true);
    addOutputMessage('command', 'cargo build-sbf');

    try {
      // Find the program directory
      const programDir = currentProject.files.find(node =>
        node.type === 'directory' && node.name === 'program'
      );

      if (!programDir?.children) {
        throw new Error('Program directory not found or invalid');
      }

      // Find src directory and Cargo.toml directly in program directory
      const srcDir = programDir.children.find(node =>
        node.type === 'directory' && node.name === 'src'
      );

      const cargoToml = programDir.children.find(node =>
        node.type === 'file' && node.name === 'Cargo.toml'
      );

      // Find lib.rs in src directory
      const libRs = srcDir?.children?.find(node =>
        node.type === 'file' && node.name === 'lib.rs'
      );

      if (!libRs || !cargoToml) {
        throw new Error('Missing required files (lib.rs and/or Cargo.toml)');
      }

      const programFiles = [
        {
          path: 'src/lib.rs',
          content: libRs.content || ''
        },
        {
          path: 'Cargo.toml',
          content: cargoToml.content || ''
        }
      ];

      console.log('Sending files to compile:', programFiles); // Debug log

      const response = await fetch('http://localhost:8080/compile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: programFiles })
      });

      const result = await response.json();
      console.log('Compile result:', result); // Debug log

      if (result.success) {
        addOutputMessage('success', 'Build successful');
        setProgramBinary(result.program);
        if (result.idl) {
          setProgramIdl(result.idl);
          addOutputMessage('info', 'IDL generated successfully');
        } else {
          addOutputMessage('error', 'No IDL was generated');
        }
      } else {
        addOutputMessage('error', result.error);
      }
    } catch (error: any) {
      addOutputMessage('error', `Build error: ${error.message}`);
    } finally {
      setIsCompiling(false);
    }
  };

  const addOutputMessage = (type: OutputMessage['type'], content: string) => {
    setOutputMessages(prev => [...prev, {
      type,
      content,
      timestamp: new Date()
    }]);
  };

  const handleDeleteProject = async (projectId: string) => {
    if (window.confirm('Are you sure you want to delete this project?')) {
      await projectService.deleteProject(projectId);
      const remainingProjects = await projectService.getAllProjects();
      setProjects(remainingProjects);

      if (currentProject?.id === projectId) {
        setOpenFiles([]);
        setCurrentFile(null);
        setCurrentProject(remainingProjects[0] || null);
      }
    }
  };

  const handleSaveFile = useCallback((newContent: string) => {
    console.log('handleSaveFile called', {
      newContent: newContent,
      currentFile: currentFile?.path,
      hasCurrentProject: !!currentProject
    });

    if (!currentFile || !currentProject) return;

    // Check if the file is a media type
    const extension = currentFile.name.split('.').pop()?.toLowerCase();
    const mediaExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'mp4', 'webm', 'ogg', 'mov', 'mp3', 'wav', 'aac', 'svg'];

    // Skip saving if it's a media file
    if (mediaExtensions.includes(extension || '')) {
      return;
    }

    // Create an updated version of the current file with new content
    const updatedCurrentFile = {
      ...currentFile,
      content: newContent  // Update the content in the current file
    };

    // Update the file content in the project files
    const updatedFiles = updateFileContent(currentProject.files, currentFile, newContent);

    console.log('Updated files:', updatedFiles);

    console.log('Updated files:', {
      oldContent: currentFile.content,
      newContent: newContent,
      filesUpdated: JSON.stringify(updatedFiles) !== JSON.stringify(currentProject.files)
    });

    // Create an updated project with the modified files and a new last modified date
    const updatedProject = {
      ...currentProject,
      files: updatedFiles,
      lastModified: new Date()
    };

    setCurrentFile(updatedCurrentFile);
    setCurrentProject(updatedProject);

    // Save to storage
    projectService.saveProject(updatedProject);

    // Update projects list
    setProjects(prev => prev.map(p =>
      p.id === updatedProject.id ? updatedProject : p
    ));

  }, [currentFile, currentProject]);

  useEffect(() => {
    if (!isConnected) {
      addOutputMessage('error', 'Not connected to network');
    } else {
      addOutputMessage('success', `Connected to ${config.network} (${config.rpcUrl})`);
    }
  }, [isConnected, config.network, config.rpcUrl]);

  const handleUpdateTreeAdapter = (operation: 'create' | 'delete' | 'rename', path: string[], type?: 'file' | 'directory', newName?: string) => {
    handleUpdateTree({ type: operation, path, fileType: type, newName });
  };

  const handleProgramIdChange = (newProgramId: string) => {
    setProgramId(newProgramId);
  };

  const handleProjectSelect = (project: Project) => {
    // Clear all open tabs
    setOpenFiles([]);
    setCurrentFile(null);
    // Set the new project
    setCurrentProject(project);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="h-screen flex flex-col bg-gray-900 text-white">
        <nav className="border-b border-gray-800 flex items-center justify-between p-4">
          <h1 className="text-xl font-bold">Arch Network Playground</h1>
          <ProjectList
            projects={projects}
            currentProject={currentProject || undefined}
            onSelectProject={handleProjectSelect}
            onNewProject={() => setIsNewProjectOpen(true)}
            onDeleteProject={handleDeleteProject}
            onProjectsChange={setProjects}
          />
          <Button variant="ghost" size="icon" onClick={() => setIsConfigOpen(true)}>
            <Settings className="h-5 w-5" />
          </Button>
        </nav>

        <div className="flex flex-1 overflow-hidden">
          <SidePanel
            currentView={currentView}
            onViewChange={setCurrentView}
            files={currentProject?.files || []}
            onFileSelect={handleFileSelect}
            onUpdateTree={handleUpdateTreeAdapter}
            onNewItem={handleNewItem}
            onBuild={handleCompile}
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
          />

          <div className="flex flex-col flex-1 overflow-hidden">
            <TabBar
              openFiles={openFiles}
              currentFile={currentFile}
              onSelectFile={setCurrentFile}
              onCloseFile={handleCloseFile}
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
                <Output messages={outputMessages} />
              </div>
            </div>
          </div>
        </div>

        <StatusBar
          config={config}
          isConnected={isConnected}
          onConnectionStatusChange={setIsConnected}
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
  // Early return if content hasn't changed
  if (targetFile.content === newContent) {
    return nodes;
  }

  // If target file has a path, use it for direct matching
  if (targetFile.path) {
    return nodes.map(node => {
      // If this is the target file, update its content
      if (node.type === 'file' && node.path === targetFile.path) {
        return { ...node, content: newContent };
      }

      // If this is a directory, only recurse if the path starts with this directory's path
      if (node.type === 'directory' && node.children &&
          targetFile.path.startsWith(node.path + '/')) {
        const updatedChildren = updateFileContent(node.children, targetFile, newContent);
        return updatedChildren === node.children ? node : { ...node, children: updatedChildren };
      }

      return node;
    });
  }

  // If no path exists, match by name only (should be avoided if possible)
  return nodes.map(node => {
    if (node.type === 'file' && node.name === targetFile.name) {
      return { ...node, content: newContent };
    }

    if (node.type === 'directory' && node.children) {
      const updatedChildren = updateFileContent(node.children, targetFile, newContent);
      return updatedChildren === node.children ? node : { ...node, children: updatedChildren };
    }

    return node;
  });
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

export default App;