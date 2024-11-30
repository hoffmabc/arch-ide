import { ConnectionStatus } from './ConnectionStatus';
import { Config } from '../types/config';
import { WifiOff, Wifi } from 'lucide-react';
import { useState, useEffect } from 'react';

interface StatusBarProps {
  config: Config;
  onConnectionStatusChange: (connected: boolean) => void;
}

export const StatusBar = ({ config, onConnectionStatusChange, network }: StatusBarProps) => {
  const [lastPingTime, setLastPingTime] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const handleConnectionChange = (connected: boolean) => {
    setIsConnected(connected);
    if (connected) {
      setLastPingTime(new Date());
    }
    onConnectionStatusChange(connected);
  };

  return (
    <div className="h-6 bg-[#1a1b26] border-t border-gray-800 px-4 flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <span className="text-gray-400">Network: {config.network}</span>
        {isConnected ? (
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
          onConnect={() => handleConnectionChange(true)}
          onDisconnect={() => handleConnectionChange(false)}
        />
      </div>
    </div>
  );
};