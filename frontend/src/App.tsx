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

const queryClient = new QueryClient();

const App = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentFile, setCurrentFile] = useState<FileNode | null>(null);
  const [output, setOutput] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);

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
    if (!currentFile?.content) return;
    
    setIsCompiling(true);
    try {
      const response = await fetch('http://localhost:8080/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: currentFile.content }),
      });
      const data = await response.json();
      setOutput(data.success ? data.output : data.error);
    } catch (error) {
      setOutput(`Error: ${error.message}`);
    } finally {
      setIsCompiling(false);
    }
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
          />
        </nav>
        
        <div className="flex-1 flex">
          <FileExplorer 
            files={currentProject?.files || []}
            onFileSelect={handleFileSelect}
            onUpdateTree={handleUpdateTree}
          />
          
          <main className="flex-1 p-4">
            <Toolbar 
              onCompile={handleCompile} 
              isCompiling={isCompiling}
            />
            
            <div className="grid grid-cols-2 gap-4 h-[calc(100vh-12rem)]">
              <Editor 
                code={currentFile?.content || '// Select a file to edit'} 
                onChange={(value) => {
                  if (currentFile && currentProject) {
                    const updatedProject = {
                      ...currentProject,
                      files: updateFileContent(
                        currentProject.files,
                        currentFile,
                        value || ''
                      ),
                      lastModified: new Date(),
                    };
                    projectService.saveProject(updatedProject);
                    setCurrentProject(updatedProject);
                  }
                }}
              />
              <Output content={output} />
            </div>
          </main>
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