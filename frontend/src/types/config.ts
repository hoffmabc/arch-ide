export interface Config {
    network: 'mainnet-beta' | 'devnet' | 'testnet';
    rpcUrl: string;
    showTransactionDetails: boolean;
    improveErrors: boolean;
    automaticAirdrop: boolean;
  }
  
  // Default config that can be imported and used
  export const DEFAULT_CONFIG: Config = {
    network: 'testnet',
    rpcUrl: 'http://localhost:9002',
    showTransactionDetails: false,
    improveErrors: true,
    automaticAirdrop: true
  };