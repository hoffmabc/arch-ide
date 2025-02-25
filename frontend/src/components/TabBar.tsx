import React from 'react';
import { X, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileNode, Project } from '../types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { findFileInProject } from '../App';
import { Button } from '@/components/ui/button';

interface TabBarProps {
  openFiles: FileNode[];
  currentFile: FileNode | null;
  onSelectFile: (file: FileNode) => void;
  onCloseFile: (file: FileNode) => void;
  currentProject: Project | null;
  onRunClientCode?: () => void;
}

const TabBar = ({ openFiles, currentFile, onSelectFile, onCloseFile, currentProject, onRunClientCode }: TabBarProps) => {
  const handleTabSelect = (file: FileNode) => {
    console.group('TabBar handleTabSelect');
    console.log('Tab selected:', {
      name: file.name,
      path: file.path,
      type: file.type,
      contentLength: file.content?.length,
      contentPreview: file.content?.substring(0, 100)
    });

    // Find the file in openFiles first since it has the latest content
    const openFile = openFiles.find(f => f.path === file.path || f.name === file.name);

    if (openFile) {
      console.log('Found file in openFiles:', {
        name: openFile.name,
        path: openFile.path,
        contentLength: openFile.content?.length,
        contentPreview: openFile.content?.substring(0, 100)
      });
      onSelectFile(openFile);
    } else {
      console.warn('File not found in openFiles, falling back to project files:', file.path || file.name);
      // Fallback to project files if not found in open files
      const projectFile = findFileInProject(currentProject?.files || [], file.path || file.name);
      onSelectFile(projectFile || file);
    }

    console.groupEnd();
  };

  // Check if current file is a client file (under client directory and is a .ts file)
  const isClientFile = currentFile?.path?.startsWith('client/') && currentFile?.name?.endsWith('.ts');

  return (
    <div className="flex items-center justify-between bg-gray-800 border-b border-gray-700">
      <div className="flex overflow-x-auto">
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
      {isClientFile && onRunClientCode && (
        <div className="flex-shrink-0 px-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-green-500 hover:text-green-400 hover:bg-gray-700"
                  onClick={onRunClientCode}
                >
                  <Play className="h-4 w-4" />
                  <span className="ml-1">Run</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Run client code</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
};

export default TabBar;