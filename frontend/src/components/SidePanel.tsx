import React, { useState } from 'react';
import { Files, Hammer } from 'lucide-react';
import { Button } from './ui/button';
import FileExplorer from './FileExplorer';
import BuildPanel from './BuildPanel';
import { cn } from '@/lib/utils';
import type { FileNode } from '../types';
import VerticalResizeHandle from './VerticalResizeHandle';
import { Config } from '../types/config';

interface SidePanelProps {
  files: FileNode[];
  onFileSelect: (file: FileNode) => void;
  onUpdateTree: (
    operation: 'create' | 'delete' | 'rename',
    path: string[],
    type?: 'file' | 'directory',
    newName?: string
  ) => void;
  onNewItem: (path: string[], type: 'file' | 'directory') => void;
  onBuild: () => void;
  onDeploy: () => void;
  isBuilding: boolean;
  isDeploying: boolean;
  programId?: string;
  programBinary?: string | null;
  onProgramBinaryChange?: (binary: string | null) => void;
  programIdl: ArchIdl | null;
  config: Config;
  onConfigChange: (config: Config) => void;
  onConnectionStatusChange: (connected: boolean) => void;
}

type View = 'explorer' | 'build';

const SidePanel = ({ files, onFileSelect, onUpdateTree, onNewItem, onBuild, onDeploy, isBuilding, isDeploying, programId, programBinary, onProgramBinaryChange, programIdl, config, onConfigChange, onConnectionStatusChange }: SidePanelProps) => {
    const [currentView, setCurrentView] = useState<View>('explorer');
    const [width, setWidth] = useState(256); // Default width in pixels
  
    const handleResizeStart = React.useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.pageX;
      const startWidth = width;
    
      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.pageX - startX;
        const newWidth = Math.max(200, Math.min(800, startWidth + delta));
        setWidth(newWidth);
      };
    
      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }, [width]);
  
    return (
        <div 
          className="bg-gray-800 border-r border-gray-700 flex flex-col relative"
          style={{ width: `${width}px` }}
        >
          <div className="flex border-b border-gray-700">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'flex-1 rounded-none',
            currentView === 'explorer' && 'bg-gray-700'
          )}
          onClick={() => setCurrentView('explorer')}
        >
          <Files className="h-4 w-4 mr-2" />
          Explorer
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'flex-1 rounded-none',
            currentView === 'build' && 'bg-gray-700'
          )}
          onClick={() => setCurrentView('build')}
        >
          <Hammer className="h-4 w-4 mr-2" />
          Build
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {currentView === 'explorer' ? (
          <FileExplorer
            files={files}
            onFileSelect={onFileSelect}
            onUpdateTree={onUpdateTree}
            onNewItem={onNewItem}
          />
        ) : (
          <BuildPanel
            onBuild={onBuild}
            onDeploy={onDeploy}
            isBuilding={isBuilding}
            isDeploying={isDeploying}
            programId={programId}
            programBinary={programBinary}
            onProgramBinaryChange={onProgramBinaryChange}
            idl={programIdl}
            config={config}
            onConfigChange={onConfigChange}
            onConnectionStatusChange={onConnectionStatusChange}
          />
        )}
      </div>
      <VerticalResizeHandle onMouseDown={handleResizeStart} />
    </div>
  );
};

export default SidePanel;