// src/App.tsx
import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Editor from './components/Editor';
import { Output } from './components/Output';
import Toolbar from './components/Toolbar';
import FileExplorer from './components/FileExplorer';
import ProjectList from './components/ProjectList';
import NewProjectDialog from './components/NewProjectDialog';
import { projectService } from './services/projectService';
import type { Project, FileNode } from './types';
import TabBar from './components/TabBar';
import ResizeHandle from './components/ResizeHandle';
import NewItemDialog from './components/NewItemDialog';
import { BuildPanel } from './components/BuildPanel';

const queryClient = new QueryClient();


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

  useEffect(() => {
    // Load projects on mount
    const loadedProjects = Object.values(projectService.getAllProjects());
    setProjects(loadedProjects);
    if (loadedProjects.length > 0) {
      setCurrentProject(loadedProjects[0]);
    }
  }, []);

  const handleDeploy = async () => {
    if (!currentProject || !programId) return;

    setIsDeploying(true);
    addOutputMessage('command', 'solana program deploy');

    try {
      const response = await fetch('http://localhost:8080/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          program: programId,
          network: 'devnet' // or could make this configurable
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

  const handleCreateNewItem = (name: string) => {
    console.log('handleCreateNewItem called with:', { name, path: newItemPath, type: newItemType });
    if (newItemPath && newItemType) {
      handleUpdateTree('create', [...newItemPath, name], newItemType);
    }
  };

  const handleFileSelect = (file: FileNode) => {
    if (file.type === 'file') {
      setCurrentFile(file);
      if (!openFiles.find(f => f.name === file.name)) {
        setOpenFiles([...openFiles, file]);
      }
    }
  };

  const handleCloseFile = (file: FileNode) => {
    setOpenFiles(openFiles.filter(f => f.name !== file.name));
    if (currentFile?.name === file.name) {
      setCurrentFile(openFiles[0] || null);
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

  const handleUpdateTree = (operation: 'create' | 'delete', path: string[], type?: 'file' | 'directory') => {
    console.log('handleUpdateTree called with:', { operation, path, type });
    if (!currentProject) return;
  
    const updateFiles = (nodes: FileNode[], currentPath: string[]): FileNode[] => {
      console.log('updateFiles processing:', { nodes, currentPath });
      if (currentPath.length === 0) return nodes;
  
      const [current, ...rest] = currentPath;
      
      // If we're creating a new item and we're at the parent directory
      if (operation === 'create' && rest.length === 1) {
        const targetNode = nodes.find(node => node.name === current);
        if (targetNode && targetNode.type === 'directory') {
          const newNode: FileNode = {
            name: rest[0],  // Use the last part of the path as the new item's name
            type: type || 'file',
            content: type === 'file' ? '' : undefined,
            children: type === 'directory' ? [] : undefined
          };
          
          return nodes.map(node =>
            node.name === current
              ? { ...node, children: [...(node.children || []), newNode] }
              : node
          );
        }
      }
  
      // Handle deletion or traverse deeper
      return nodes.map(node => {
        if (node.name === current) {
          if (rest.length === 0) {
            return operation === 'delete' ? null : node;
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
  };

  const handleCompile = async () => {
    if (!currentProject) return;
    
    setIsCompiling(true);
    addOutputMessage('command', 'cargo build-sbf');
    
    try {
      const result = await projectService.compileProject(currentProject);
      if (result.success) {
        addOutputMessage('success', 'Build successful. Completed in 2.14s');
        setProgramId(result.program); // Store the program ID/binary
      } else {
        addOutputMessage('error', result.error);
      }
    } catch (error: any) {
      addOutputMessage('error', `Error: ${error.message}`);
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

  const handleEditorChange = (value: string | undefined) => {
    if (!currentProject || !currentFile || !value) return;
  
    // Update the current file's content
    const updatedFiles = updateFileContent(currentProject.files, currentFile, value);
    
    // Create updated project
    const updatedProject = {
      ...currentProject,
      files: updatedFiles,
      lastModified: new Date()
    };
  
    // Save to storage and update state
    projectService.saveProject(updatedProject);
    setCurrentProject(updatedProject);
    setProjects(projects.map(p => 
      p.id === updatedProject.id ? updatedProject : p
    ));
  
    // Update the current file in openFiles
    setOpenFiles(openFiles.map(f => 
      f === currentFile ? { ...f, content: value } : f
    ));
    setCurrentFile({ ...currentFile, content: value });
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
  </nav>
  
  <div className="flex flex-1 overflow-hidden">
    <FileExplorer
      files={currentProject?.files || []}
      onFileSelect={handleFileSelect}
      onUpdateTree={handleUpdateTree}
      onNewItem={handleNewItem}
    />

    <div className="flex flex-1 overflow-hidden">
      <BuildPanel
        onBuild={handleCompile}
        onDeploy={handleDeploy}
        isBuilding={isCompiling}
        isDeploying={isDeploying}
        programId={programId}
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
            code={currentFile?.content || '// Select a file to edit'} 
            onChange={handleEditorChange}
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
  </div>

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
</div>
    </QueryClientProvider>
  );
};

function updateFileContent(files: FileNode[], targetFile: FileNode, newContent: string): FileNode[] {
  return files.map(file => {
    if (file === targetFile) {
      return { ...file, content: newContent };
    }
    if (file.children) {
      return {
        ...file,
        children: updateFileContent(file.children, targetFile, newContent),
      };
    }
    return file;
  });
}

export default App;