import { useEffect, useState } from 'react';
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
}

export const ConnectionStatus = ({
  rpcUrl,
  network,
  isConnected,
  onConnect,
  onDisconnect
}: ConnectionStatusProps) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [lastPingTime, setLastPingTime] = useState<Date | null>(null);

  const checkConnection = async () => {
    try {
      const connection = ArchConnection(new RpcConnection(rpcUrl));
      const block_count = await connection.getBlockCount();

      if (!block_count) {
        setShowErrorModal(true);
        onDisconnect();
        return false;
      }

      setLastPingTime(new Date());
      return true;
    } catch (error) {
      console.error('Connection error:', error);
      setShowErrorModal(true);
      onDisconnect();
      return false;
    }
  };

  const handleConnect = async () => {
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
    checkConnection();

    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, [rpcUrl]);

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