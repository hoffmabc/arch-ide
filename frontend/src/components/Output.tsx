import React from 'react';

interface OutputProps {
  content: string;
}

const Output = ({ content }: OutputProps) => {
  return (
    <div className="h-full bg-gray-800 rounded-lg p-4 font-mono overflow-auto border border-gray-700">
      <pre className="whitespace-pre-wrap text-sm">
        {content || 'Output will appear here...'}
      </pre>
    </div>
  );
};

export default Output;
