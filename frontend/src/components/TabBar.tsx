import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileNode } from '../types';

interface TabBarProps {
  openFiles: FileNode[];
  currentFile: FileNode | null;
  onSelectFile: (file: FileNode) => void;
  onCloseFile: (file: FileNode) => void;
}

const TabBar = ({ openFiles, currentFile, onSelectFile, onCloseFile }: TabBarProps) => {
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
            <span
              className="text-sm"
              onClick={() => onSelectFile(file)}
            >
              {file.name}
            </span>
            <button
              className="opacity-50 hover:opacity-100"
              onClick={() => onCloseFile(file)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    );
  };

export default TabBar;