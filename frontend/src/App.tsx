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
const queryClient = new QueryClient();
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

interface Config {
  network: 'mainnet-beta' | 'devnet' | 'testnet';
  rpcUrl: string;
  showTransactionDetails: boolean;
  improveErrors: boolean;
  automaticAirdrop: boolean;
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
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Load projects on mount
    const loadedProjects = Object.values(projectService.getAllProjects());
    setProjects(loadedProjects);
    if (loadedProjects.length > 0) {
      setCurrentProject(loadedProjects[0]);
    }
  }, []);

  const [config, setConfig] = useState<Config>({
    network: 'devnet',
    rpcUrl: 'http://localhost:9002',
    showTransactionDetails: false,
    improveErrors: true,
    automaticAirdrop: true
  });

  const handleDeploy = async () => {
    if (!currentProject || !programId || !isConnected) {
      addOutputMessage('error', 'Cannot deploy: No connection to network');
      return;
    }

    setIsDeploying(true);
    if (config.showTransactionDetails) {
      addOutputMessage('command', 'solana program deploy');
      addOutputMessage('info', `Deploying to ${config.network}...`);
      addOutputMessage('info', `Using program ID: ${programId}`);
    }

    try {
      const response = await fetch(`${API_URL}/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          program: programId,
          network: config.network,
          rpcUrl: config.rpcUrl
        })
      });

      const result = await response.json();

      if (result.success) {
        addOutputMessage('success', `Program deployed successfully`);
        addOutputMessage('info', `Program ID: ${result.programId}`);
        setProgramId(result.programId);
      } else {
        addOutputMessage('error', result.error || 'Deploy failed');
      }
    } catch (error: any) {
      addOutputMessage('error', `Deploy error: ${error.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleCreateProject = (name: string, description: string) => {
    const newProject = projectService.createProject(name, description);
    setProjects([...projects, newProject]);
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


  // Modify your handleFileChange function
  const handleFileChange = useCallback((newContent: string | undefined) => {
    console.log('handleFileChange called', {
      newContent: newContent,
      currentFile: currentFile?.name,
      hasCurrentProject: !!currentProject
    });

    if (!newContent || !currentFile || !currentProject) return;

    // Create an updated version of the current file with new content
    const updatedCurrentFile = {
      ...currentFile,
      content: newContent
    };

    // Update the content in project files
    const updatedFiles = updateFileContent(currentProject.files, currentFile, newContent);

    // Check if files were actually updated by comparing content
    const filesUpdated = JSON.stringify(updatedFiles) !== JSON.stringify(currentProject.files);

    console.log('Updated files:', {
      oldContent: currentFile.content,
      newContent: newContent,
      filesUpdated: filesUpdated
    });

    if (filesUpdated) {
      const updatedProject = {
        ...currentProject,
        files: updatedFiles,
        lastModified: new Date()
      };

      // Update both the current file and project state
      setCurrentFile(updatedCurrentFile);
      setCurrentProject(updatedProject);

      console.log('Saving project', updatedProject);
      projectService.saveProject(updatedProject);
    }
  }, [currentFile, currentProject]);

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

  const handleCloseFile = (file: FileNode) => {
    // First ensure any pending changes are saved for the file being closed
    if (currentFile && currentFile.path === file.path && currentProject) {
      // Only save if there's actual content
      if (currentFile.content !== undefined) {
        // Create an updated version of the current file with new content
        const updatedCurrentFile = {
          ...currentFile,
          content: currentFile.content  // Update the content in the current file
        };

        // Ensure currentFile is not null before passing it to updateFileContent
        const updatedFiles = updateFileContent(currentProject.files, currentFile, currentFile.content);
        const updatedProject = {
          ...currentProject,
          files: updatedFiles,
          lastModified: new Date()
        };
        projectService.saveProject(updatedProject);

        // Update state
        setCurrentProject(updatedProject);
        setProjects(prev => prev.map(p =>
          p.id === updatedProject.id ? updatedProject : p
        ));
      }
    }

    // Remove file from openFiles
    const newOpenFiles = openFiles.filter(f => f.path !== file.path);
    setOpenFiles(newOpenFiles);

    if (newOpenFiles.length === 0) {
      // If closing the last tab, just clear currentFile
      setCurrentFile(null);
    } else if (currentFile?.path === file.path) {
      // If closing current file but other tabs exist, switch to last remaining tab
      const nextFile = newOpenFiles[newOpenFiles.length - 1];
      setCurrentFile(nextFile);
    }

    // Clear any pending auto-save timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      setSaveTimeout(null);
    }
  };

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

  const handleDeleteProject = (projectId: string) => {
    if (window.confirm('Are you sure you want to delete this project?')) {
      projectService.deleteProject(projectId);
      setProjects(projects.filter(p => p.id !== projectId));

      // If deleting current project, clear all tabs and current file
      if (currentProject?.id === projectId) {
        setOpenFiles([]);  // Clear all open tabs
        setCurrentFile(null);  // Clear current file

        // Set new current project if available
        const remainingProjects = projects.filter(p => p.id !== projectId);
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

  return (
    <QueryClientProvider client={queryClient}>
      <div className="h-screen flex flex-col bg-gray-900 text-white">
        <nav className="border-b border-gray-800 flex items-center justify-between p-4">
          <h1 className="text-xl font-bold">Arch Network Playground</h1>
          <ProjectList
            projects={projects}
            currentProject={currentProject || undefined}
            onSelectProject={setCurrentProject}
            onNewProject={() => setIsNewProjectOpen(true)}
            onDeleteProject={handleDeleteProject}
          />
          <Button variant="ghost" size="icon" onClick={() => setIsConfigOpen(!isConfigOpen)}>
            <Settings className="h-5 w-5" />
          </Button>
        </nav>

        <div className="flex flex-1 overflow-hidden">
          <SidePanel
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
  // If target file has a path, use it for direct matching
  if (targetFile.path) {
    return nodes.map(node => {
      // If this is the target file, update its content
      if (node.type === 'file' && node.path === targetFile.path) {
        return node.content !== newContent ? { ...node, content: newContent } : node;
      }

      // If this is a directory, recursively check its children
      if (node.type === 'directory' && node.children) {
        const updatedChildren = updateFileContent(node.children, targetFile, newContent);
        return JSON.stringify(updatedChildren) !== JSON.stringify(node.children)
          ? { ...node, children: updatedChildren }
          : node;
      }

      return node;
    });
  }

  // If no path exists, match by name only (should be avoided if possible)
  return nodes.map(node => {
    if (node.type === 'file' && node.name === targetFile.name) {
      return node.content !== newContent ? { ...node, content: newContent } : node;
    }

    if (node.type === 'directory' && node.children) {
      const updatedChildren = updateFileContent(node.children, targetFile, newContent);
      return JSON.stringify(updatedChildren) !== JSON.stringify(node.children)
        ? { ...node, children: updatedChildren }
        : node;
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

export default App;