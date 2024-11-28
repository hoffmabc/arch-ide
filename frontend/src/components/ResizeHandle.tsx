import React from 'react';
import { GripHorizontal } from 'lucide-react';

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

const ResizeHandle = ({ onMouseDown }: ResizeHandleProps) => {
  return (
    <div
      className="h-2 border-t border-b border-gray-700 bg-gray-800 cursor-row-resize flex items-center justify-center hover:bg-gray-700"
      onMouseDown={onMouseDown}
    >
      <GripHorizontal size={16} className="text-gray-500" />
    </div>
  );
};

export default ResizeHandle;