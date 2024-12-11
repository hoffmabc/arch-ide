export interface ArchDeployOptions {
  rpcUrl: string;
  network: string;
  programBinary: Buffer;
  keypair: {
    privkey: string;
    pubkey: string;
    address: string;
  };
  regtestConfig?: {
    url: string;
    username: string;
    password: string;
  };
}

export interface Message {
  signers: string[];
  instructions: Instruction[];
}

export interface Instruction {
  programId: string;
  accounts: AccountMeta[];
  data: Buffer;
}

export interface AccountMeta {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface RuntimeTransaction {
  version: number;
  signatures: string[];
  message: Message;
}

export interface DeploymentResult {
  programId: string;
  txids: string[];
}
