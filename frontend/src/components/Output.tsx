import { useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Trash2 } from 'lucide-react';

export interface OutputMessage {
  type: 'command' | 'success' | 'error' | 'info';
  content: string;
  timestamp: Date;
}

interface OutputProps {
  messages: OutputMessage[];
  onClear?: () => void;
}

export const Output = ({ messages, onClear }: OutputProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-end py-0.5 px-2 bg-gray-800 border-b border-gray-700">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-gray-400 hover:bg-gray-700 hover:text-white h-6 px-2 text-xs"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear
        </Button>
      </div>
      <div ref={scrollRef} className="bg-gray-900 text-white font-mono p-2 overflow-y-auto overflow-x-auto flex-1 text-xs leading-4 break-words whitespace-pre-wrap">
        {messages.map((msg, i) => (
          <div key={i} className="mb-2">
            <div className="flex items-top">
              <span className="text-gray-500 text-[10px] whitespace-nowrap mr-2 align-top">
                {msg.timestamp.toLocaleTimeString()}
              </span>
              <div className="flex-1 max-w-full">
                {msg.type === 'command' && (
                  <span className="text-blue-400 break-words">{`$ ${msg.content}`}</span>
                )}
                {msg.type === 'success' && (
                  <span className="text-green-400 break-words">{msg.content}</span>
                )}
                {msg.type === 'error' && (
                  <div className="text-red-400 whitespace-pre-wrap break-words">
                    {msg.content.split('\n').map((line, i) => (
                      <div key={i} className={`
                        ${line.startsWith('File:') ? 'text-yellow-400 mt-1' : ''}
                        ${line.startsWith('Line:') ? 'text-yellow-400' : ''}
                        ${line.startsWith('Code:') ? 'text-blue-400 mt-1 pl-4' : ''}
                      `}>
                        {line}
                      </div>
                    ))}
                  </div>
                )}
                {msg.type === 'info' && (
                  <div className="text-blue-400 break-words">{msg.content}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Output;