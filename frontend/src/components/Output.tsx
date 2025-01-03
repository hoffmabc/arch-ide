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
          className="text-gray-400 hover:text-white h-6 px-2 text-xs"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear
        </Button>
      </div>
      <div ref={scrollRef} className="bg-gray-900 text-white font-mono p-2 overflow-auto flex-1 text-xs leading-4">
        {messages.map((msg, i) => (
          <div key={i} className="mb-0.5 flex">
            <span className="text-gray-500 text-[10px] whitespace-nowrap mr-2">
              {msg.timestamp.toLocaleTimeString()}
            </span>
            <div className="flex-1 break-all">
              {msg.type === 'command' && (
                <span className="text-blue-400">$ {msg.content}</span>
              )}
              {msg.type === 'success' && (
                <span className="text-green-400">{msg.content}</span>
              )}
              {msg.type === 'error' && (
                <span className="text-red-400">{msg.content}</span>
              )}
              {msg.type === 'info' && (
                <span className="text-gray-400">{msg.content}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Output;