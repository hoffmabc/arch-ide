import React, { useCallback, useEffect, useState, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { FileNode, Disposable } from '../types';
import { declareGlobalTypes } from './Editor/languages/typescript/declarations/global';

interface EditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
  onSave?: (value: string) => void;
  currentFile?: FileNode | null;
}

const getFileType = (fileName: string): 'text' | 'image' | 'video' | 'audio' | 'svg' => {
  const extension = fileName.split('.').pop()?.toLowerCase();

  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'];
  const videoExtensions = ['mp4', 'webm', 'ogg', 'mov'];
  const audioExtensions = ['mp3', 'wav', 'ogg', 'aac'];

  if (extension === 'svg') return 'svg';
  if (imageExtensions.includes(extension || '')) return 'image';
  if (videoExtensions.includes(extension || '')) return 'video';
  if (audioExtensions.includes(extension || '')) return 'audio';
  return 'text';
};
const MediaViewer = ({ type, content }: { type: 'image' | 'video' | 'audio' | 'svg', content: string }) => {
  // Use content directly as it should already be a data URL
  const mediaContent = content;

  switch (type) {
    case 'svg':
      return (
        <div className="h-full w-full flex items-center justify-center bg-gray-900">
          {content.startsWith('<?xml') || content.startsWith('<svg') ? (
            // If content is SVG markup, render it directly
            <div
              className="max-h-full max-w-full"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          ) : (
            // If content is a data URL or file path
            <img
              src={mediaContent}
              alt="SVG Preview"
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>
      );
    case 'image':
      return (
        <div className="h-full w-full flex items-center justify-center bg-gray-900">
          <img
            src={mediaContent}
            alt="Preview"
            className="max-h-full max-w-full object-contain"
          />
        </div>
      );
    case 'video':
      return (
        <div className="h-full w-full flex items-center justify-center bg-gray-900">
          <video
            controls
            className="max-h-full max-w-full"
          >
            <source src={mediaContent} />
            Your browser does not support the video tag.
          </video>
        </div>
      );
    case 'audio':
      return (
        <div className="h-full w-full flex items-center justify-center bg-gray-900">
          <audio controls className="w-3/4">
            <source src={mediaContent} type="audio/mpeg" />
            Your browser does not support the audio tag.
          </audio>
        </div>
      );
  }
};

const DEFAULT_WELCOME_MESSAGE = `
//  █████╗ ██████╗  ██████╗██╗  ██╗    ███╗   ██╗███████╗████████╗██╗    ██╗ ██████╗ ██████╗ ██╗  ██╗
// ██╔══██╗██╔══██╗██╔════╝██║  ██║    ████╗  ██║██╔════╝╚══██╔══╝██║    ██║██╔═══██╗██╔══██╗██║ ██╔╝
// ███████║██████╔╝██║     ███████║    ██╔██╗ ██║█████╗     ██║   ██║ █╗ ██║██║   ██║██████╔╝█████╔╝
// ██╔══██║██╔══██╗██║     ██╔══██║    ██║╚██╗██║██╔══╝     ██║   ██║███╗██║██║   ██║██╔══██╗██╔═█╗
// ██║  ██║██║  ██║╚██████╗██║  ██║    ██║ ╚███║███████╗     █║     ╚███╔█╔╝╚██████╔╝██║  ██║██║  ██╗
// ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝    ╚═╝  ╚═══╝╚══════╝   ╚═╝    ╚══╝╚══╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝

// Welcome to Arch Network Playground! 🚀

/*
 * This is your workspace for building and deploying Arch Network programs.
 *
 * Getting Started:
 * ───────────────
 * 1. Create a new project using the "+" button in the top navigation
 * 2. Use the Explorer (📁) to navigate your project files
 * 3. Write your Arch program in Rust
 * 4. Build your program using the Build panel (🔨)
 * 5. Deploy to your chosen network (mainnet-beta [coming soon], devnet, or testnet)
 *
 * Key Features:
 * ────────────
 * • Full Rust development environment
 * • Real-time compilation
 * • Program deployment management
 * • Automatic keypair generation
 * • Binary import/export support
 *
 * Need Help?
 * ─────────
 * • Visit https://docs.arch.network for documentation
 * • Join our Discord community for support
 * • Check out example programs in the templates
 *
 * Happy coding! 🎉
 */
`;

const decodeContent = (content: string): string => {
  if (content.startsWith('data:') && content.includes(';base64,')) {
    try {
      const base64Content = content.split(';base64,')[1];
      return atob(base64Content);
    } catch (e) {
      console.error('Failed to decode base64 content:', e);
      return content;
    }
  }
  return content;
};

const Editor = ({ code, onChange, onSave, currentFile }: EditorProps) => {
  const [latestContent, setLatestContent] = useState(code);
  const isWelcomeScreen = !currentFile;
  const displayCode = isWelcomeScreen ? DEFAULT_WELCOME_MESSAGE : decodeContent(code);
  const editorRef = useRef<any>(null);
  const [disposables, setDisposables] = useState<Disposable[]>([]);

  const getLanguage = (fileName: string) => {
    if (fileName.endsWith('.ts')) return 'typescript';
    if (fileName.endsWith('.js')) return 'javascript';
    if (fileName.endsWith('.rs')) return 'rust';
    return 'plaintext';
  };

  useEffect(() => {
    setLatestContent(code);
  }, [code]);

  useEffect(() => {
    return () => {
      disposables.forEach(d => d.dispose());
    };
  }, [disposables]);

  const handleChange = useCallback((value: string | undefined) => {
    if (!isWelcomeScreen && value !== undefined) {
      setLatestContent(value);
      onChange(value);
    }
  }, [isWelcomeScreen, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Log the event for debugging
    // console.log('handleKeyDown', e);

    // Check if the key pressed is 's' and if Ctrl or Cmd is held down
    if ((e.ctrlKey || e.metaKey) && e.keyCode === 49) {
      e.preventDefault(); // Prevent the default save action

      // Ensure we are not on the welcome screen and onSave is defined
      if (!isWelcomeScreen && onSave && editorRef.current) {
        const currentValue = editorRef.current.getValue(); // Get the current value from the editor
        onSave(currentValue); // Call the onSave function with the current value
      }
    }
  }, [onSave, isWelcomeScreen]);

  return (
    <div className="h-full w-full">
      <MonacoEditor
        height="100%"
        defaultLanguage="plaintext"
        theme="vs-dark"
        key={currentFile?.path || 'welcome'}
        value={displayCode}
        onChange={handleChange}

        onMount={async (editor, monaco) => {
          editorRef.current = editor;
          editor.onKeyDown((e) => {
            const keyboardEvent = e as unknown as KeyboardEvent;
            handleKeyDown(keyboardEvent);
          });

          const language = getLanguage(currentFile?.name || '');
          console.log('Initial language:', language);

          const editorModel = editor.getModel();
          if (editorModel) {
            monaco.editor.setModelLanguage(editorModel, language);
            console.log('Model language after setting:', editorModel.getLanguageId());
          }

          // Initialize appropriate language support based on file type
          switch (language) {
            case 'typescript':
              console.log('Initializing TypeScript declarations');
              const { initDeclarations: initTsDeclarations } = await import('./Editor/languages/typescript/declarations');
              console.log('Editor:', editor);
              const tsDisposable = await initTsDeclarations(editor);
              console.log('TypeScript Disposable:', tsDisposable);
              setDisposables(prev => [...prev, tsDisposable]);

              // Set TypeScript compiler options
              monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                target: monaco.languages.typescript.ScriptTarget.ES2020,
                moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
                module: monaco.languages.typescript.ModuleKind.CommonJS,
                allowNonTsExtensions: true,
                typeRoots: ["node_modules/@types"],
                allowJs: true,
                strict: true,
                noImplicitAny: false
              });

              // Add global type declarations
              monaco.languages.typescript.typescriptDefaults.addExtraLib(`
                declare const RpcConnection: typeof import("@saturnbtcio/arch-sdk").RpcConnection;
                declare const PubkeyUtil: typeof import("@saturnbtcio/arch-sdk").PubkeyUtil;
                declare const MessageUtil: typeof import("@saturnbtcio/arch-sdk").MessageUtil;
              `, 'globals.d.ts');
              break;
            case 'javascript':
              // const { initDeclarations: initJsDeclarations } = await import('./Editor/languages/javascript/declarations');
              // const jsDisposable = await initJsDeclarations();
              // console.log('JavaScript Disposable:', jsDisposable);
              // setDisposables(prev => [...prev, jsDisposable]);
              break;
            case 'rust':
              const { initRustLanguage } = await import('./Editor/Monaco/languages/rust/init');
              await initRustLanguage(monaco, editor);
              break;
          }
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 12,
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          tabSize: 2,
          readOnly: isWelcomeScreen
        }}
      />
    </div>
  );
};

export default Editor;