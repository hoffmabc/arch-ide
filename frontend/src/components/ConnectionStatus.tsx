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
  const [retryCount, setRetryCount] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Base delay of 2 seconds
  const BASE_DELAY = 2000;
  // Maximum delay of 1 minute
  const MAX_DELAY = 60000;
  // When connected, check every 30 seconds
  const CONNECTED_CHECK_INTERVAL = 30000;

  const checkConnection = async () => {
    if (isConnecting) return false;

    try {
      const isLocalhost = window.location.hostname === 'localhost';
      const connectionUrl = isLocalhost ? '/rpc' : rpcUrl;
      const connection = ArchConnection(new RpcConnection(connectionUrl));

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
      setRetryCount(0); // Reset retry count on successful connection
      return true;
    } catch (error) {
      console.error('Connection error:', error);
      setShowErrorModal(true);
      onDisconnect();
      onPingUpdate(null);
      return false;
    }
  };

  const scheduleNextCheck = (wasConnected: boolean) => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
    }

    if (wasConnected) {
      // If we were connected, use the standard interval
      intervalRef.current = setTimeout(() => handleConnect(), CONNECTED_CHECK_INTERVAL);
    } else {
      // If we weren't connected, use exponential backoff
      const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_DELAY);
      setRetryCount(prev => prev + 1);
      intervalRef.current = setTimeout(() => handleConnect(), delay);
    }
  };

  const handleConnect = async () => {
    if (isConnecting) return;
    setIsConnecting(true);

    try {
      const success = await checkConnection();
      scheduleNextCheck(success);
      if (success) {
        onConnect();
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // Initial connection check
  useEffect(() => {
    handleConnect();
    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, []);

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
        persistDismissal={true}
      />
    </>
  );
};

export default ConnectionStatus;