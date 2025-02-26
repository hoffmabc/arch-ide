import { useEffect, useState, useRef } from 'react';
import { Button } from './ui/button';
import { Loader2, Wifi, WifiOff, HelpCircle } from 'lucide-react';
import { ArchConnection, RpcConnection } from '@saturnbtcio/arch-sdk';
import { ConnectionErrorModal } from './ConnectionErrorModal';
import { getSmartRpcUrl } from '../utils/smartRpcConnection';

interface ConnectionStatusProps {
  rpcUrl: string;
  network: string;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onPingUpdate: (time: Date | null) => void;
  onActualUrlChange?: (url: string | null) => void;
}

export const ConnectionStatus = ({
  rpcUrl,
  network,
  isConnected,
  onConnect,
  onDisconnect,
  onPingUpdate,
  onActualUrlChange = () => {}
}: ConnectionStatusProps) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [actualConnectedUrl, setActualConnectedUrl] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Base delay of 2 seconds
  const BASE_DELAY = 2000;
  // Maximum delay of 1 minute
  const MAX_DELAY = 60000;
  // When connected, check every 30 seconds
  const CONNECTED_CHECK_INTERVAL = 30000;

  const updateActualUrl = (url: string | null) => {
    setActualConnectedUrl(url);
    onActualUrlChange(url);
  };

  const checkConnection = async () => {
    console.group('Connection Check Debug');
    if (isConnecting) {
      console.log('Already connecting, skipping check');
      console.groupEnd();
      return false;
    }

    console.log('Starting connection check');
    console.log('Current state:', {
      rpcUrl,
      network,
      isConnected,
      isConnecting,
      retryCount
    });

    setIsConnecting(true);

    try {
      // Use the smart RPC URL utility instead of hardcoding logic
      const smartUrl = getSmartRpcUrl(rpcUrl);

      console.log('Attempting connection to:', smartUrl, '(original URL:', rpcUrl, ')');
      const connection = new RpcConnection(smartUrl);

      // Make a stricter connection test with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      // Try to get block count with timeout
      console.log('Requesting block count...');
      let blockCount: number;
      try {
        blockCount = await Promise.race([
          connection.getBlockCount(),
          timeoutPromise
        ]) as number;

        // Additional validation of the response
        if (typeof blockCount !== 'number' || isNaN(blockCount)) {
          console.warn('Invalid block count response:', blockCount);
          throw new Error('Invalid block count response');
        }
      } catch (error) {
        console.error('Error fetching block count:', error);
        throw error;
      }

      // If we get here, connection was successful
      console.log('Connection successful! Block count:', blockCount);
      updateActualUrl(rpcUrl);

      const currentTime = new Date();
      onPingUpdate(currentTime);
      setShowErrorModal(false);
      setRetryCount(0);
      console.log('Calling onConnect()');
      onConnect();
      console.groupEnd();
      return true;
    } catch (error) {
      console.error('Connection error:', error);
      updateActualUrl(null);
      setShowErrorModal(true);
      console.log('Calling onDisconnect()');
      onDisconnect();
      onPingUpdate(null);
      console.groupEnd();
      return false;
    } finally {
      setIsConnecting(false);
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
    setIsConnecting(true);
    try {
      const success = await checkConnection();
      if (!success) {
        setIsConnecting(false);
      }
    } catch (error) {
      console.error('Connection error:', error);
      setIsConnecting(false);
      setShowErrorModal(true);
      onDisconnect();
      onPingUpdate(null);
    }
  };

  // Reset and check connection when the RPC URL changes
  useEffect(() => {
    if (isConnected) {
      handleConnect();
    }
  }, [rpcUrl]);

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

      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 ml-2"
        onClick={() => setShowErrorModal(true)}
      >
        <HelpCircle className="h-4 w-4" />
      </Button>

      <ConnectionErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        network={network}
        persistDismissal={true}
        isConnected={isConnected}
        actualUrl={actualConnectedUrl}
        rpcUrl={rpcUrl}
      />
    </>
  );
};

export default ConnectionStatus;