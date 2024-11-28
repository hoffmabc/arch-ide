interface OutputMessage {
  type: 'command' | 'success' | 'error' | 'info';
  content: string;
  timestamp: Date;
}

interface OutputProps {
  messages: OutputMessage[];
}

export const Output = ({ messages }: OutputProps) => {
  return (
    <div className="bg-gray-900 text-white font-mono p-4 overflow-auto h-full">
      {messages.map((msg, i) => (
        <div key={i} className="mb-2">
          <span className="text-gray-500 text-sm">
            {msg.timestamp.toLocaleTimeString()}
          </span>
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
      ))}
    </div>
  );
};