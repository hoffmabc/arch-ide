import { ClipboardIcon } from 'lucide-react';
import { Button } from './ui/button';

interface BuildPanelProps {
  onBuild: () => void;
  onDeploy: () => void;
  isBuilding: boolean;
  isDeploying: boolean;
  programId?: string;
}

export const BuildPanel = ({ onBuild, onDeploy, isBuilding, isDeploying, programId }: BuildPanelProps) => {
  return (
    <div className="w-64 bg-gray-800 border-r border-gray-700 p-4">
      <h2 className="text-lg font-semibold mb-4">BUILD & DEPLOY</h2>
      
      <Button 
        className="w-full mb-4 bg-pink-500 hover:bg-pink-600"
        onClick={onBuild}
        disabled={isBuilding}
      >
        {isBuilding ? 'Building...' : 'Build'}
      </Button>

      <div className="mb-4">
        <h3 className="text-sm font-medium mb-2">Program ID</h3>
        <div className="flex items-center space-x-2">
          <code className="text-xs bg-gray-900 p-2 rounded flex-1 overflow-hidden">
            {programId || 'Not deployed'}
          </code>
          <Button 
            size="icon" 
            variant="ghost"
            onClick={() => programId && navigator.clipboard.writeText(programId)}
            disabled={!programId}
          >
            <ClipboardIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Button 
        className="w-full"
        onClick={onDeploy}
        disabled={isDeploying || !programId}
      >
        {isDeploying ? 'Deploying...' : 'Deploy'}
      </Button>
    </div>
  );
};