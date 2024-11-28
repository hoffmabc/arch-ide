// src/App.tsx
import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Editor from './components/Editor';
import Output from './components/Output';
import Toolbar from './components/Toolbar';
import FileExplorer from './components/FileExplorer';
import ProjectList from './components/ProjectList';
import NewProjectDialog from './components/NewProjectDialog';
import { projectService } from './services/projectService';
import type { Project, FileNode } from './types';
import TabBar from './components/TabBar';
const queryClient = new QueryClient();

const App = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentFile, setCurrentFile] = useState<FileNode | null>(null);
  const [output, setOutput] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [openFiles, setOpenFiles] = useState<FileNode[]>([]);

  useEffect(() => {
    // Load projects on mount
    const loadedProjects = Object.values(projectService.getAllProjects());
    setProjects(loadedProjects);
    if (loadedProjects.length > 0) {
      setCurrentProject(loadedProjects[0]);
    }
  }, []);

  const handleCreateProject = (name: string, description: string) => {
    const newProject = projectService.createProject(name, description);
    setProjects([...projects, newProject]);
    setCurrentProject(newProject);
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

  const handleUpdateTree = (operation: 'create' | 'delete', path: string[], type?: 'file' | 'directory') => {
    if (!currentProject) return;

    const updateFiles = (nodes: FileNode[], currentPath: string[]): FileNode[] => {
      if (currentPath.length === 0) return nodes;

      const [current, ...rest] = currentPath;
      return nodes.map(node => {
        if (node.name === current) {
          if (rest.length === 0) {
            if (operation === 'delete') {
              return null;
            } else if (operation === 'create' && type) {
              const newNode: FileNode = {
                name: current,
                type,
                content: type === 'file' ? '' : undefined,
              };
              return {
                ...node,
                children: [...(node.children || []), newNode],
              };
            }
          }
          return {
            ...node,
            children: updateFiles(node.children || [], rest),
          };
        }
        return node;
      }).filter(Boolean) as FileNode[];
    };

    const updatedFiles = updateFiles(currentProject.files, path);
    const updatedProject = {
      ...currentProject,
      files: updatedFiles,
      lastModified: new Date(),
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
    try {
      const result = await projectService.compileProject(currentProject);
      setOutput(result.success ? result.output : result.error);
    } catch (error: any) {
      setOutput(`Error: ${error.message}`);
    } finally {
      setIsCompiling(false);
    }
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
    <h1 className="text-xl font-bold">Arch Network IDE</h1>
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
    />
    
    <div className="flex-1 flex flex-col overflow-hidden">
      <Toolbar 
        onCompile={handleCompile} 
        isCompiling={isCompiling}
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
      </div>

      <div className="h-48 border-t border-gray-700">
        <Output content={output} />
      </div>
    </div>
  </div>

  <NewProjectDialog
    isOpen={isNewProjectOpen}
    onClose={() => setIsNewProjectOpen(false)}
    onCreateProject={handleCreateProject}
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