import * as monaco from 'monaco-editor';
import { declareGlobalTypes } from "./global";
import type { Disposable } from "../../../../../types/types";

export const initDeclarations = async (editor: monaco.editor.IStandaloneCodeEditor): Promise<Disposable> => {
  const currentModel = editor.getModel();
  console.log('Current model:', currentModel);
  // Wait for editor to be ready
  // await new Promise(resolve => {
  //   const checkEditor = () => {
  //     const editor = monaco.editor.getEditors()[0];
  //     if (editor) {
  //       console.log('Editor found');
  //       resolve(editor);
  //     } else {
  //       setTimeout(checkEditor, 100);
  //     }
  //   };
  //   checkEditor();
  // });

  // Register TypeScript language support
  monaco.languages.register({ id: 'typescript' });
  monaco.languages.register({ id: 'javascript' });
  console.log('TypeScript/JavaScript languages registered');

  // Now proceed with the rest of the initialization
  console.log('Current model:', currentModel);
  if (!currentModel || !['typescript', 'javascript'].includes(currentModel.getLanguageId())) {
    console.log('Current model is not TypeScript/JavaScript');
    return {
      dispose: () => {}
    };
  }

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
    allowSyntheticDefaultImports: true
  });

  console.log('Compiler options set');

  // Add the arch-sdk module declaration
  const moduleDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(
    "file://node_modules/@saturnbtcio/arch-sdk/dist/index.d.ts"
  );

  // Add global declarations
  const globalDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(
    `
    declare global {
      const RpcConnection: typeof import("@saturnbtcio/arch-sdk").RpcConnection;
      const PubkeyUtil: typeof import("@saturnbtcio/arch-sdk").PubkeyUtil;
      const MessageUtil: typeof import("@saturnbtcio/arch-sdk").MessageUtil;
      const UtxoMetaUtil: typeof import("@saturnbtcio/arch-sdk").UtxoMetaUtil;
      const SignatureUtil: typeof import("@saturnbtcio/arch-sdk").SignatureUtil;
    }
    `,
    "file:///globals.d.ts"
  );

  return {
    dispose: () => {
      moduleDisposable.dispose();
      globalDisposable.dispose();
    }
  };
};