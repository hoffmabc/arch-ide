import React from 'react';
import { GripVertical } from 'lucide-react';

interface VerticalResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

const VerticalResizeHandle = ({ onMouseDown }: VerticalResizeHandleProps) => {
  return (
    <div
      className="w-1 cursor-col-resize flex items-center justify-center hover:bg-gray-700 absolute right-0 top-0 bottom-0"
      onMouseDown={onMouseDown}
    >
      <GripVertical size={16} className="text-gray-500" />
    </div>
  );
};

export default VerticalResizeHandle;