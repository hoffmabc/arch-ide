import React from 'react';

interface ToolbarProps {
  onCompile: () => void;
  onSave?: () => void;
  isCompiling: boolean;
}

const Toolbar = ({ onCompile, onSave, isCompiling }: ToolbarProps) => {
  return (
    <div className="flex items-center h-14 px-4 border-b border-gray-800">
      <button
        onClick={onCompile}
        disabled={isCompiling}
        className="px-6 py-2 bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
      >
        {isCompiling ? 'Compiling...' : 'Compile & Run'}
      </button>
      {onSave && (
        <button
          onClick={onSave}
          className="ml-2 px-4 py-2 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors text-sm"
        >
          Save
        </button>
      )}
    </div>
  );
};

export default Toolbar;