import React from 'react';

interface OutputProps {
  content: string;
}

const Output = ({ content }: OutputProps) => {
  return (
    <div className="h-full bg-gray-800 p-4 font-mono overflow-auto">
      <pre className="whitespace-pre-wrap text-sm">
        {content || 'Output will appear here...'}
      </pre>
    </div>
  );
};

export default Output;
