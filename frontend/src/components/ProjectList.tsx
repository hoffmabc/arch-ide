import React, { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2, Download, Upload } from 'lucide-react';

import type { Project } from '../types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { projectService } from '../services/projectService';

interface ProjectListProps {
  projects: Project[];
  currentProject?: Project;
  onSelectProject: (project: Project, clearOpenFiles?: boolean) => void;
  onNewProject: () => void;
  onDeleteProject: (projectId: string) => Promise<void>;
  onProjectsChange: (projects: Project[]) => void;
}

const ProjectList = ({
  projects,
  currentProject,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onProjectsChange
}: ProjectListProps) => {
  const [selectedId, setSelectedId] = useState(currentProject?.id || '');

  useEffect(() => {
    setSelectedId(currentProject?.id || '');
  }, [currentProject]);

  const sortedProjects = [...projects].sort((a, b) => {
    const dateA = a.lastAccessed || a.lastModified;
    const dateB = b.lastAccessed || b.lastModified;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const handleProjectSelect = (value: string) => {
    setSelectedId(value);

    const project = projects.find(p => p.id === value);
    if (project) {
      const updatedProject = {
        ...project,
        lastAccessed: new Date()
      };
      onSelectProject(updatedProject);
    }
  };

  const handleExportProject = async () => {
    if (!currentProject) return;

    try {
      const blob = await projectService.exportProjectAsZip(currentProject);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentProject.name}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export project:', error);
    }
  };

  const handleImportProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    try {
      let importedProject: Project;

      if (files[0].webkitRelativePath) {
        // Handling folder import
        importedProject = await projectService.importFromFolder(files);
        // Clear open files and current file when importing a folder
        onProjectsChange([...projects, importedProject]);
        // Pass additional parameter to indicate this is a folder import
        onSelectProject(importedProject, true);
      } else if (files[0].name.endsWith('.zip')) {
        // Handling zip import
        importedProject = await projectService.importProjectAsZip(files[0]);
        onProjectsChange([...projects, importedProject]);
        onSelectProject(importedProject, true);
      } else {
        // Handling JSON import
        const fileReader = new FileReader();
        const importPromise = new Promise<Project>((resolve) => {
          fileReader.onload = async (e) => {
            const content = e.target?.result as string;
            const projectData = JSON.parse(content);
            await projectService.saveProject(projectData);
            resolve(projectData);
          };
        });
        fileReader.readAsText(files[0]);
        importedProject = await importPromise;
        onProjectsChange([...projects, importedProject]);
        onSelectProject(importedProject, true);
      }
    } catch (error) {
      console.error('Failed to import project:', error);
      // TODO: Show error message to user
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800">
      <Select
        value={selectedId}
        onValueChange={handleProjectSelect}
      >
        <SelectTrigger className="w-[200px] bg-background text-foreground border-input">
          <SelectValue placeholder="Select a project" />
        </SelectTrigger>
        <SelectContent className="bg-background border-input">
          {sortedProjects.map((project) => (
            <SelectItem
              key={project.id}
              value={project.id}
              className="text-foreground"
            >
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <input
        type="file"
        id="import-project"
        className="hidden"
        accept=".zip,.json"
        webkitdirectory={true}
        directory={true}
        multiple
        onChange={handleImportProject}
      />

      <Button variant="ghost" size="icon" onClick={() => document.getElementById('import-project')?.click()}>
        <Upload className="h-5 w-5" />
      </Button>

      <Button variant="ghost" size="icon" onClick={handleExportProject} disabled={!currentProject}>
        <Download className="h-5 w-5" />
      </Button>

      <Button variant="ghost" size="icon" onClick={onNewProject}>
        <PlusCircle className="h-5 w-5" />
      </Button>

      {currentProject && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Trash2 className="h-5 w-5 text-red-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              className="text-red-500"
              onClick={() => onDeleteProject(currentProject.id)}
            >
              Delete Project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

export default ProjectList;