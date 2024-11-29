import { useEffect, useRef } from 'react';

interface OutputMessage {
  type: 'command' | 'success' | 'error' | 'info';
  content: string;
  timestamp: Date;
}

interface OutputProps {
  messages: OutputMessage[];
}

export const Output = ({ messages }: OutputProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={scrollRef} className="bg-gray-900 text-white font-mono p-4 overflow-auto h-full">
      {messages.map((msg, i) => (
        <div key={i} className="mb-2 flex">
          <span className="text-gray-500 text-sm whitespace-nowrap mr-2">
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
  );
};