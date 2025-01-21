import * as monaco from "monaco-editor";
import { Disposable } from "../../../../../types/types";

export const declareGlobalTypes = async (): Promise<Disposable> => {
  const disposables = [
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `declare module "@saturnbtcio/arch-sdk" {
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
      }`,
      "file:///node_modules/@types/arch-sdk/index.d.ts"
    ),
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `declare global {
        const RpcConnection: typeof import("@saturnbtcio/arch-sdk").RpcConnection;
        const PubkeyUtil: typeof import("@saturnbtcio/arch-sdk").PubkeyUtil;
        const MessageUtil: typeof import("@saturnbtcio/arch-sdk").MessageUtil;
      }`,
      "file:///globals.d.ts"
    )
  ];

  return {
    dispose: () => disposables.forEach(({ dispose }) => dispose())
  };
};