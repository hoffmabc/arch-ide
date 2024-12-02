import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileNode } from '../types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TabBarProps {
  openFiles: FileNode[];
  currentFile: FileNode | null;
  onSelectFile: (file: FileNode) => void;
  onCloseFile: (file: FileNode) => void;
}

const TabBar = ({ openFiles, currentFile, onSelectFile, onCloseFile }: TabBarProps) => {
  const handleTabClick = (file: FileNode) => {
    onSelectFile(file);
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
                  onClick={() => handleTabClick(file)}
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