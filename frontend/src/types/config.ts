export interface Config {
    network: 'mainnet-beta' | 'devnet' | 'testnet';
    rpcUrl: string;
    showTransactionDetails: boolean;
    improveErrors: boolean;
    automaticAirdrop: boolean;
    regtestConfig?: {
        url: string;
        username: string;
        password: string;
    };
}

// Default config that can be imported and used
export const DEFAULT_CONFIG: Config = {
    network: 'testnet',
    rpcUrl: 'http://localhost:9002',
    showTransactionDetails: false,
    improveErrors: true,
    automaticAirdrop: true,
    regtestConfig: {
        url: 'http://localhost:18443',
        username: 'bitcoin',
        password: 'bitcoin'
    }
};