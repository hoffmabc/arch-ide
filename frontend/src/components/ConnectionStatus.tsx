import { useEffect, useState, useRef } from 'react';
import { Button } from './ui/button';
import { Loader2, Wifi, WifiOff } from 'lucide-react';
import { ArchConnection, RpcConnection } from '@saturnbtcio/arch-sdk';
import { ConnectionErrorModal } from './ConnectionErrorModal';

interface ConnectionStatusProps {
  rpcUrl: string;
  network: string;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onPingUpdate: (time: Date | null) => void;
}

export const ConnectionStatus = ({
  rpcUrl,
  network,
  isConnected,
  onConnect,
  onDisconnect,
  onPingUpdate
}: ConnectionStatusProps) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkConnection = async () => {
    if (isConnecting) return false;

    try {
      const connection = ArchConnection(new RpcConnection(rpcUrl));
      const block_count = await connection.getBlockCount();

      if (!block_count) {
        setShowErrorModal(true);
        onDisconnect();
        onPingUpdate(null);
        return false;
      }

      const currentTime = new Date();
      onPingUpdate(currentTime);
      setShowErrorModal(false);
      return true;
    } catch (error) {
      console.error('Connection error:', error);
      setShowErrorModal(true);
      onDisconnect();
      onPingUpdate(null);
      return false;
    }
  };

  const handleConnect = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      const success = await checkConnection();
      if (success) {
        onConnect();
      }
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    if (isConnected && !isConnecting) {
      checkConnection();

      // Clear any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Set new interval only if connected
      intervalRef.current = setInterval(checkConnection, 5000);
    } else {
      // Clear interval if we're not connected or are connecting
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isConnected, isConnecting, rpcUrl]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 px-2 text-xs"
        onClick={isConnected ? onDisconnect : handleConnect}
      >
        {isConnecting ? (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        ) : isConnected ? (
          'Disconnect'
        ) : (
          'Connect'
        )}
      </Button>

      <ConnectionErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        network={network}
      />
    </>
  );
};

export default ConnectionStatus;