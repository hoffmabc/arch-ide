import * as monaco from 'monaco-editor';
import { declareGlobalTypes } from "./global";
import type { Disposable } from "../../../../../types/types";

export const initDeclarations = async (editor: monaco.editor.IStandaloneCodeEditor): Promise<Disposable> => {
  const currentModel = editor.getModel();
  console.log('Current model:', currentModel);

  // Force TypeScript language for .ts files
  if (currentModel) {
    const uri = currentModel.uri.toString();
    if (uri.endsWith('.ts')) {
      monaco.editor.setModelLanguage(currentModel, 'typescript');
    }
  }

  // Register TypeScript language support
  monaco.languages.register({ id: 'typescript' });
  monaco.languages.register({ id: 'javascript' });

  // Set compiler options before loading declarations
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
    allowNonTsExtensions: true,
    typeRoots: ["node_modules/@types"],
    allowJs: true,
    strict: true,
    noImplicitAny: false,
    allowSyntheticDefaultImports: true,
    jsx: monaco.languages.typescript.JsxEmit.React
  });

  // Add the arch-sdk module declaration
  const moduleDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(
    (await import('./raw/arch-sdk.raw.d.ts?raw')).default,
    "file:///node_modules/@types/arch-sdk/index.d.ts"
  );

  // Add global declarations
  const globalDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(
    `declare global {
      const RpcConnection: typeof import("@saturnbtcio/arch-sdk").RpcConnection;
      const PubkeyUtil: typeof import("@saturnbtcio/arch-sdk").PubkeyUtil;
      const MessageUtil: typeof import("@saturnbtcio/arch-sdk").MessageUtil;
      const UtxoMetaUtil: typeof import("@saturnbtcio/arch-sdk").UtxoMetaUtil;
      const SignatureUtil: typeof import("@saturnbtcio/arch-sdk").SignatureUtil;
    }`,
    "file:///globals.d.ts"
  );

  return {
    dispose: () => {
      moduleDisposable.dispose();
      globalDisposable.dispose();
    }
  };
};