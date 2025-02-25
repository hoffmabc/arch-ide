import React, { useState, useEffect } from 'react';
import { Files, Hammer } from 'lucide-react';
import { Button } from './ui/button';
import FileExplorer from './FileExplorer';
import BuildPanel from './BuildPanel';
import { cn } from '@/lib/utils';
import type { FileNode } from '../types';
import VerticalResizeHandle from './VerticalResizeHandle';
import { Config } from '../types/config';
import type { ArchIdl } from '../types';
import { storage } from '../utils/storage';
import { Project, ProjectAccount } from '../types';

type ExpandedFolders = Set<string>;

interface SidePanelProps {
  hasProjects: boolean;
  currentView: 'explorer' | 'build';
  onViewChange: (view: 'explorer' | 'build') => void;
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
  programId: string | undefined;
  programBinary: string | null;
  onProgramBinaryChange: (binary: string | null) => void;
  onProgramIdChange: (programId: string) => void;
  programIdl: ArchIdl | null;
  config: Config;
  onConfigChange: (config: Config) => void;
  onConnectionStatusChange: (connected: boolean) => void;
  currentAccount: {
    privkey: string;
    pubkey: string;
    address: string;
  } | null;
  onAccountChange: (account: { privkey: string; pubkey: string; address: string; } | null) => void;
  currentFile: FileNode | null;
  project: Project;
  onProjectAccountChange: (account: ProjectAccount | null) => void;
  onNewProject: () => void;
  binaryFileName: string | null;
  setBinaryFileName: (name: string | null) => void;
  addOutputMessage: (type: any, message: any) => void;
  connected: boolean;
}

type View = 'explorer' | 'build';

const SidePanel = ({ hasProjects, currentView, onViewChange, files, onFileSelect, onUpdateTree, onNewItem, onBuild, onDeploy, isBuilding, isDeploying, programId, programBinary, onProgramBinaryChange, onProgramIdChange, programIdl, config, onConfigChange, onConnectionStatusChange, currentAccount, onAccountChange, currentFile, project, onProjectAccountChange, onNewProject, binaryFileName, setBinaryFileName, addOutputMessage, connected }: SidePanelProps) => {
    const [width, setWidth] = useState(256);
    const [expandedFolders, setExpandedFolders] = useState<ExpandedFolders>(new Set());

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

    const activeAccount = project?.account || currentAccount;

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
            'flex-1 rounded-none border-b-2',
            currentView === 'explorer'
              ? 'bg-[#212431] border-[#F7931A] text-white'
              : 'border-transparent text-gray-400'
          )}
          onClick={() => onViewChange('explorer')}
        >
          <Files className="h-4 w-4 mr-2" />
          Explorer
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'flex-1 rounded-none border-b-2',
            currentView === 'build'
              ? 'bg-[#212431] border-[#F7931A] text-white'
              : 'border-transparent text-gray-400'
          )}
          onClick={() => onViewChange('build')}
        >
          <Hammer className="h-4 w-4 mr-2" />
          Build
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
          {currentView === 'explorer' ? (
            <FileExplorer
              hasProjects={hasProjects}
              files={files}
              onFileSelect={onFileSelect}
              onUpdateTree={onUpdateTree}
              onNewItem={onNewItem}
              expandedFolders={expandedFolders}
              onExpandedFoldersChange={setExpandedFolders}
              currentFile={currentFile}
              onNewProject={onNewProject}
              addOutputMessage={addOutputMessage}
              project={project}
              onProjectAccountChange={onProjectAccountChange}
            />
          ) : (
          <BuildPanel
            hasProjects={hasProjects}
            onBuild={onBuild}
            onDeploy={onDeploy}
            isBuilding={isBuilding}
            isDeploying={isDeploying}
            programId={programId}
            programBinary={programBinary}
            onProgramBinaryChange={onProgramBinaryChange}
            onProgramIdChange={onProgramIdChange}
            idl={programIdl}
            config={config}
            onConfigChange={onConfigChange}
            onConnectionStatusChange={onConnectionStatusChange}
            currentAccount={activeAccount}
            onAccountChange={onAccountChange}
            project={project}
            onProjectAccountChange={onProjectAccountChange}
            binaryFileName={binaryFileName}
            setBinaryFileName={setBinaryFileName}
            connected={connected}
          />
        )}
      </div>
      <VerticalResizeHandle onMouseDown={handleResizeStart} />
    </div>
  );
};

export default SidePanel;