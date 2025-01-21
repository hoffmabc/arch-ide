declare module "@saturnbtcio/arch-sdk" {
    export class RpcConnection {
      constructor(endpoint: string);
      readAccountInfo(pubkey: Uint8Array): Promise<{
        data: Uint8Array;
        owner: Uint8Array;
      }>;
    }

    export class PubkeyUtil {
      static fromHex(hex: string): Uint8Array;
      static toHex(pubkey: Uint8Array): string;
    }

    export class MessageUtil {
      static hash(message: any): Uint8Array;
    }

    export class ArchConnection extends RpcConnection {
      constructor(endpoint: string);
    }
}

declare global {
  const RpcConnection: typeof import("@saturnbtcio/arch-sdk").RpcConnection;
  const PubkeyUtil: typeof import("@saturnbtcio/arch-sdk").PubkeyUtil;
  const MessageUtil: typeof import("@saturnbtcio/arch-sdk").MessageUtil;
}