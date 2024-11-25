// src/components/ProjectList.tsx
import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import type { Project } from '../types/project';

interface ProjectListProps {
  projects: Project[];
  currentProject?: Project;
  onSelectProject: (project: Project) => void;
  onNewProject: () => void;
}

const ProjectList = ({
  projects,
  currentProject,
  onSelectProject,
  onNewProject,
}: ProjectListProps) => {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800">
      <Select
        value={currentProject?.id}
        onValueChange={(value) => {
          const project = projects.find(p => p.id === value);
          if (project) onSelectProject(project);
        }}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select a project" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <Button variant="ghost" size="icon" onClick={onNewProject}>
        <PlusCircle className="h-5 w-5" />
      </Button>
    </div>
  );
};

export default ProjectList;