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

const queryClient = new QueryClient();

interface Config {
  network: 'mainnet-beta' | 'devnet' | 'testnet';
  rpcUrl: string;
  showTransactionDetails: boolean;
  improveErrors: boolean;
  automaticAirdrop: boolean;
}



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
      const response = await fetch('http://localhost:8080/deploy', {
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
      newContent: newContent?.substring(0, 50) + '...',
      currentFile: currentFile?.name,
      hasCurrentProject: !!currentProject
    });

    if (!newContent || !currentFile || !currentProject) return;

    // Clear existing timeout if any
    if (saveTimeout) {
      console.log('Clearing existing save timeout');
      clearTimeout(saveTimeout);
    }

    // Update the content immediately in state
    const updatedFiles = updateFileContent(currentProject.files, currentFile, newContent);
    const updatedProject = {
      ...currentProject,
      files: updatedFiles,
      lastModified: new Date()
    };

    console.log('Updating current project state');
    setCurrentProject(updatedProject);

    // Set new timeout for auto-save
    const timeout = setTimeout(() => {
      console.log('Auto-save triggered');
      projectService.saveProject(updatedProject);
    }, 1000);

    setSaveTimeout(timeout);
  }, [currentFile, currentProject, saveTimeout]);

  const handleCreateNewItem = (name: string) => {
    console.log('handleCreateNewItem called with:', { name, path: newItemPath, type: newItemType });
    if (newItemPath && newItemType) {
      handleUpdateTree('create', [...newItemPath, name], newItemType);
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
      // Ensure the file has a path
      const filePath = file.path || `${file.name}`;
      const fileWithPath = { ...file, path: filePath };

      // Get the most up-to-date version of the file from the current project
      const currentProjectFile = findFileInProject(currentProject?.files || [], filePath);

      // Use the current project's version of the file if available, otherwise use the file with path
      const updatedFile = currentProjectFile || fileWithPath;

      setCurrentFile(updatedFile);
      if (!openFiles.find(f => f.path === filePath)) {
        setOpenFiles([...openFiles, updatedFile]);
      }
    }
  };

  const handleCloseFile = (file: FileNode) => {
    const newOpenFiles = openFiles.filter(f => f.path !== file.path);
    setOpenFiles(newOpenFiles);

    if (newOpenFiles.length === 0) {
      // If this was the last tab, show welcome screen
      console.log('Showing welcome screen');
      setCurrentFile(null);
    } else if (currentFile?.path === file.path) {
      // If we're closing the current file and have other files open,
      // switch to the last tab in the list
      setCurrentFile(newOpenFiles[newOpenFiles.length - 1]);
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

  const handleUpdateTree = (operation: 'create' | 'delete' | 'rename', path: string[], type?: 'file' | 'directory', newName?: string) => {
    console.log('handleUpdateTree called with:', { operation, path, type });
    if (!currentProject) return;

    const updateFiles = (nodes: FileNode[], currentPath: string[]): FileNode[] => {
      console.log('updateFiles processing:', { nodes, currentPath });
      if (currentPath.length === 0) return nodes;

      const [current, ...rest] = currentPath;

      if (operation === 'create' && rest.length === 1) {
        const targetNode = nodes.find(node => node.name === current);
        if (targetNode && targetNode.type === 'directory') {
          const newPath = [...path].join('/');
          const newNode: FileNode = {
            name: rest[0],
            type: type || 'file',
            content: type === 'file' ? '' : undefined,
            children: type === 'directory' ? [] : undefined,
            path: newPath + '/' + rest[0]
          };

          // If it's a file, automatically select it for editing
          if (type === 'file') {
            setCurrentFile(newNode);
            setOpenFiles(prev => [...prev, newNode]);
          }

          return nodes.map(node =>
            node.name === current
              ? { ...node, children: [...(node.children || []), newNode] }
              : node
          );
        }
      }

      return nodes.map(node => {
        if (node.name === current) {
          if (rest.length === 0) {
            if (operation === 'delete') return null;
            if (operation === 'rename' && newName) {
              return { ...node, name: newName };
            }
            return node;
          }
          return {
            ...node,
            children: updateFiles(node.children || [], rest)
          };
        }
        return node;
      }).filter(Boolean) as FileNode[];
    };

    const updatedFiles = updateFiles(currentProject.files, path);
    const updatedProject = {
      ...currentProject,
      files: updatedFiles,
      lastModified: new Date()
    };

    projectService.saveProject(updatedProject);
    setCurrentProject(updatedProject);
    setProjects(projects.map(p =>
      p.id === updatedProject.id ? updatedProject : p
    ));

    if (operation === 'rename' && newName) {
      const oldName = path[path.length - 1];

      // Update openFiles
      setOpenFiles(openFiles.map(file =>
        file.name === oldName ? { ...file, name: newName } : file
      ));

      // Update currentFile if it's the renamed file
      if (currentFile?.name === oldName) {
        setCurrentFile({ ...currentFile, name: newName });
      }
    }
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
      if (currentProject?.id === projectId) {
        setCurrentProject(projects[0] || null);
      }
    }
  };

  const handleSaveFile = useCallback((content: string) => {
    console.log('handleSaveFile called', {
      contentLength: content.length,
      currentFile: currentFile?.name,
      hasCurrentProject: !!currentProject
    });

    if (!currentFile || !currentProject) return;

    const updatedFiles = updateFileContent(currentProject.files, currentFile, content);
    const updatedProject = {
      ...currentProject,
      files: updatedFiles,
      lastModified: new Date()
    };

    console.log('Saving to storage');
    projectService.saveProject(updatedProject);
    setCurrentProject(updatedProject);
  }, [currentFile, currentProject]);

  useEffect(() => {
    if (!isConnected) {
      addOutputMessage('error', 'Not connected to network');
    } else {
      addOutputMessage('success', `Connected to ${config.network} (${config.rpcUrl})`);
    }
  }, [isConnected, config.network, config.rpcUrl]);

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
            onUpdateTree={handleUpdateTree}
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
                code={currentFile ? (currentFile.content ?? '') : '// Select a file to edit'}
                onChange={handleFileChange}
                onSave={handleSaveFile}
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
  console.log('updateFileContent called with:', {
    nodes: nodes.map(n => ({ name: n.name, path: n.path })),
    targetFile: {
      name: targetFile.name,
      path: targetFile.path,
      type: targetFile.type
    }
  });

  return nodes.map(node => {
    // If this is the target file, update its content
    if (node.path === targetFile.path ||
        (targetFile.path && node.name === targetFile.name && node.type === 'file')) {
      console.log('Target file found, updating content');
      return { ...node, content: newContent };
    }

    // If this is a directory, recursively search its children
    if (node.children) {
      // Check if target path starts with this directory's path
      const updatedChildren = updateFileContent(node.children, targetFile, newContent);
      if (JSON.stringify(updatedChildren) !== JSON.stringify(node.children)) {
        // Only update if children have changed
        return { ...node, children: updatedChildren };
      }
    }

    // Otherwise return the node unchanged
    return node;
  });
};

export default App;