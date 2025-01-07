import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileNode, Project } from '../types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { findFileInProject } from '../App';

interface TabBarProps {
  openFiles: FileNode[];
  currentFile: FileNode | null;
  onSelectFile: (file: FileNode) => void;
  onCloseFile: (file: FileNode) => void;
  currentProject: Project | null;
}

const TabBar = ({ openFiles, currentFile, onSelectFile, onCloseFile, currentProject }: TabBarProps) => {
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
    const projectFile = findFileInProject(currentProject?.files || [], file.path || file.name);

    if (projectFile) {
      console.log('Found file in project:', {
        name: projectFile.name,
        path: projectFile.path,
        contentLength: projectFile.content?.length,
        contentPreview: projectFile.content?.substring(0, 100)
      });
      onSelectFile(projectFile);
    } else {
      console.warn('File not found in project:', file.path || file.name);
      onSelectFile(file);
    }

    console.groupEnd();
  };

  return (
    <div className="flex overflow-x-auto bg-gray-800 border-b border-gray-700">
      {openFiles.map((file) => (
        <div
          key={file.path || file.name}
          className={cn(
            "flex items-center gap-2 px-4 py-2 border-r border-gray-700 cursor-pointer hover:bg-gray-700",
            (currentFile?.path || currentFile?.name) === (file.path || file.name) && "bg-gray-700"
          )}
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="text-sm"
                  onClick={() => handleTabSelect(file)}
                >
                  {file.name}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{file.path ? file.path : file.name}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <button
            className="opacity-50 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onCloseFile(file);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default TabBar;