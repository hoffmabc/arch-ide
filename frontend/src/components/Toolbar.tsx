import React from 'react';

interface ToolbarProps {
  onCompile: () => void;
  onSave?: () => void;
  isCompiling: boolean;
}

const Toolbar = ({ onCompile, onSave, isCompiling }: ToolbarProps) => {
  return (
    <div className="flex gap-2 mb-4">
      <button
        onClick={onCompile}
        disabled={isCompiling}
        className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isCompiling ? 'Compiling...' : 'Compile & Run'}
      </button>
      {onSave && (
        <button
          onClick={onSave}
          className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
        >
          Save
        </button>
      )}
    </div>
  );
};

export default Toolbar;
