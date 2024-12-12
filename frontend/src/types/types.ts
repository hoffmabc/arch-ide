export interface ArchIdl {
    version: string;
    name: string;
    instructions: any[];
    accounts: any[];
    types: any[];
  }

  export interface Config {
    network: string;
    rpcUrl: string;
    showTransactionDetails: boolean;
    improveErrors: boolean;
    automaticAirdrop: boolean;
  }

  export interface FileNode {
    name: string;
    type: 'file' | 'directory';
    content?: string;
    children?: FileNode[];
  }

  export type ComplexType = {
    name: string;
    fields: Array<{
      name: string;
      type: string;
    }>;
  };

  export interface FileChange {
    path: string;
    content: string;
    timestamp: number;
  }