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

  // Set diagnostics options to be more permissive
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    onlyVisible: false,
  });

  // Set compiler options before loading declarations
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    lib: ["ES2020", "DOM"],
    allowNonTsExtensions: true,
    typeRoots: ["node_modules/@types"],
    allowJs: true,
    strict: false,
    noImplicitAny: false,
    allowSyntheticDefaultImports: true,
    jsx: monaco.languages.typescript.JsxEmit.React
  });

  // Add the arch-sdk module declaration (includes global declarations)
  const moduleDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(
    (await import('./raw/arch-sdk.raw.d.ts?raw')).default,
    "file:///node_modules/@types/arch-sdk/index.d.ts"
  );

  // Add playground-specific global utilities
  const playgroundGlobalsDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(
    `declare global {
      function getSmartRpcUrl(network?: string): string;
    }

    export {};`,
    "file:///playground-globals.d.ts"
  );

  return {
    dispose: () => {
      moduleDisposable.dispose();
      playgroundGlobalsDisposable.dispose();
    }
  };
};