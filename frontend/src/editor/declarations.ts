import * as monaco from "monaco-editor";

export const initTypeScriptDeclarations = (): monaco.IDisposable[] => {
  const disposables = [
    // Declare the module
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `declare module "@saturnbtcio/arch-sdk" {
        export type Pubkey = Uint8Array;
        // ... rest of your module declarations
      }`,
      "file:///node_modules/@types/arch-sdk/index.d.ts"
    ),

    // Declare globals
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `declare global {
        const RpcConnection: typeof import("@saturnbtcio/arch-sdk").RpcConnection;
        const PubkeyUtil: typeof import("@saturnbtcio/arch-sdk").PubkeyUtil;
        const MessageUtil: typeof import("@saturnbtcio/arch-sdk").MessageUtil;
        const UtxoMetaUtil: typeof import("@saturnbtcio/arch-sdk").UtxoMetaUtil;
        const SignatureUtil: typeof import("@saturnbtcio/arch-sdk").SignatureUtil;
      }`,
      "file:///globals.d.ts"
    )
  ];

  return disposables;
};
