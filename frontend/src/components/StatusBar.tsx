import { ConnectionStatus } from './ConnectionStatus';
import { Config } from '../types/config';
import { WifiOff, Wifi } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { FileChange } from '../types/types';

interface StatusBarProps {
  config: Config;
  isConnected: boolean;
  onConnectionStatusChange: (connected: boolean) => void;
  pendingChanges: Map<string, FileChange>;
  isSaving: boolean;
  children?: React.ReactNode;
}

export const StatusBar = ({ config, isConnected, onConnectionStatusChange, pendingChanges, isSaving }: StatusBarProps) => {
  const [lastPingTime, setLastPingTime] = useState<Date | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);

  useEffect(() => {
    // Only attempt auto-connect on initial mount or when explicitly triggered
    const attemptConnect = () => {
      if (!isConnected && !isAutoConnecting) {
        setIsAutoConnecting(true);
        onConnectionStatusChange(true);
      }
    };

    // Clear any existing timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Only attempt reconnect if we were previously connected and lost connection
    if (!isConnected && lastPingTime) {
      reconnectTimeoutRef.current = setTimeout(attemptConnect, 5000);
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [isConnected, onConnectionStatusChange, lastPingTime]);

  const handlePingUpdate = (time: Date | null) => {
    setLastPingTime(time);
    setIsAutoConnecting(false);
  };

  return (
    <div className="h-6 bg-[#1a1b26] border-t border-gray-800 px-4 flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <span className="text-gray-400">Network: {config.network}</span>
        {isConnected && lastPingTime ? (
          <Wifi className="h-3 w-3 text-green-500" />
        ) : (
          <WifiOff className="h-3 w-3 text-red-500" />
        )}
      </div>

      <div className="flex items-center gap-4">
        {lastPingTime && (
          <span className="text-gray-400">
            Last ping: {lastPingTime.toLocaleTimeString()}
          </span>
        )}
        <ConnectionStatus
          rpcUrl={config.rpcUrl}
          network={config.network}
          isConnected={isConnected}
          onConnect={() => onConnectionStatusChange(true)}
          onDisconnect={() => onConnectionStatusChange(false)}
          onPingUpdate={handlePingUpdate}
        />
      </div>
    </div>
  );
};