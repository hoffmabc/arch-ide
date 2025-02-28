import React, { useCallback, useEffect, useState, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { FileNode, Disposable } from '../types';
import { declareGlobalTypes } from './Editor/languages/typescript/declarations/global';
import { COMMENT, H_ORANGE, H_YELLOW, H_PURPLE, H_BLUE, ARCH_DARK, ARCH_GRAY, TEXT_PRIMARY } from '../theme/theme';

interface EditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
  onSave?: (value: string) => void;
  currentFile?: FileNode | null;
  currentProject?: any;
  onSelectFile: (file: FileNode) => void;
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

const findFileInProject = (files: any[], path: string): FileNode | null => {
  for (const file of files) {
    if (file.path === path) return file;
    if (file.children) {
      const found = findFileInProject(file.children, path);
      if (found) return found;
    }
  }
  return null;
};

const defineTheme = (monaco: any) => {
  monaco.editor.defineTheme('arch-theme', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: COMMENT.substring(1), fontStyle: 'italic' },
      { token: 'keyword', foreground: H_ORANGE.substring(1) },
      { token: 'string', foreground: H_YELLOW.substring(1) },
      { token: 'number', foreground: H_PURPLE.substring(1) },
      { token: 'type', foreground: H_BLUE.substring(1) },
    ],
    colors: {
      'editor.background': ARCH_DARK,
      'editor.foreground': TEXT_PRIMARY,
      'editor.lineHighlightBackground': ARCH_GRAY,
      'editorLineNumber.foreground': COMMENT,
      'editorGutter.background': ARCH_DARK,
    }
  });
};

const Editor = ({ code, onChange, onSave, currentFile, currentProject, onSelectFile }: EditorProps) => {
  const [latestContent, setLatestContent] = useState(code);
  const isWelcomeScreen = !currentFile;
  const displayCode = isWelcomeScreen ? DEFAULT_WELCOME_MESSAGE : decodeContent(code);
  const editorRef = useRef<any>(null);
  const [disposables, setDisposables] = useState<Disposable[]>([]);

  const getLanguage = (fileName: string) => {
    console.log('Getting language for:', fileName);
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

  useEffect(() => {
    // Check for saved tabs in localStorage
    const savedTabs = localStorage.getItem('editorTabs');
    const savedCurrentFile = localStorage.getItem('currentEditorFile');

    if (savedTabs) {
      try {
        const tabs = JSON.parse(savedTabs);
        // Verify each tab still exists before restoring
        const validTabs = tabs.filter((tab: string) => {
          const file = findFileInProject(currentProject?.files || [], tab);
          return file != null;
        });

        if (validTabs.length > 0) {
          validTabs.forEach((tab: string) => {
            const file = findFileInProject(currentProject?.files || [], tab);
            if (file) {
              onSelectFile(file);
            }
          });

          // Restore the previously active tab if it exists
          if (savedCurrentFile) {
            const currentFile = findFileInProject(currentProject?.files || [], savedCurrentFile);
            if (currentFile) {
              onSelectFile(currentFile);
            }
          }
        }
      } catch (e) {
        console.error('Error restoring editor tabs:', e);
      }
    }
  }, [currentProject]); // Only run when project loads

  const handleChange = useCallback((value: string | undefined) => {
    if (!isWelcomeScreen && value !== undefined) {
      setLatestContent(value);
      onChange(value);
    }
  }, [isWelcomeScreen, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    try {
      console.group('Editor KeyDown');
      console.log('Event:', {
        key: e?.key,
        keyCode: e?.keyCode,
        code: e?.code,
        ctrlKey: e?.ctrlKey,
        metaKey: e?.metaKey,
        type: e?.type,
        isWelcomeScreen,
        hasEditor: !!editorRef.current,
        hasSaveHandler: !!onSave
      });

      // Handle save shortcut (Ctrl+S or Cmd+S)
      const isSaveCommand = (e?.ctrlKey || e?.metaKey) && (e?.key === 's' || e?.code === 'KeyS');
      if (isSaveCommand) {
        console.log('Save shortcut detected');

        // Prevent default browser behavior
        e?.preventDefault();
        e?.stopPropagation();

        // Save the file if we're not on welcome screen
        if (!isWelcomeScreen && onSave && editorRef.current) {
          console.log('Saving file...');
          const currentValue = editorRef.current.getValue();
          onSave(currentValue);
        } else {
          console.log('Cannot save:', {
            isWelcomeScreen,
            hasOnSave: !!onSave,
            hasEditor: !!editorRef.current
          });
        }
      }
    } catch (error) {
      console.error('Error in handleKeyDown:', error);
    } finally {
      console.groupEnd();
    }
  }, [onSave, isWelcomeScreen]);

  return (
    <div className="h-full w-full">
      <MonacoEditor
        height="100%"
        language={getLanguage(currentFile?.name || '')}
        // defaultLanguage="plaintext"
        theme="arch-theme"
        key={currentFile?.path || 'welcome'}
        value={displayCode}
        onChange={handleChange}
        beforeMount={(monaco) => {
          defineTheme(monaco);
        }}
        onMount={async (editor, monaco) => {
          editorRef.current = editor;
          editor.onKeyDown((e) => {
            const keyboardEvent = e as unknown as KeyboardEvent;
            handleKeyDown(keyboardEvent);
          });

          const language = getLanguage(currentFile?.name || '');
          console.log('Initial language:', language);

          // Get the current model
          const currentModel = editor.getModel();

          // If the file is TypeScript or JavaScript, we need to ensure proper language support
          if (currentModel && ['typescript', 'javascript'].includes(language)) {
            // Create a new URI with the proper extension
            const fileName = currentFile?.name || 'file.ts';
            const fileExtension = fileName.endsWith('.ts') ? '.ts' : fileName.endsWith('.js') ? '.js' : '.ts';
            const newUri = monaco.Uri.parse(`file:///${fileName}`);

            // Create a new model with the same content but proper URI
            const newModel = monaco.editor.createModel(
              currentModel.getValue(),
              language,
              newUri
            );

            // Set the new model to the editor
            editor.setModel(newModel);

            // Dispose the old model to prevent memory leaks
            currentModel.dispose();

            console.log('Created new model with proper TypeScript URI:', {
              uri: newModel.uri.toString(),
              languageId: newModel.getLanguageId()
            });
          }

          // Rest of your code remains the same...
          const editorModel = editor.getModel();
          if (editorModel) {
            // Log the final model details
            console.log('Final model details:', {
              languageId: editorModel.getLanguageId(),
              uri: editorModel.uri.toString(),
              modelId: editorModel.id
            });
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
          // Current options
          minimap: { enabled: false },
          fontSize: 12,
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          tabSize: 2,
          readOnly: isWelcomeScreen,

          // New options
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          wordWrap: 'on',
          formatOnPaste: true,
          hover: {
            enabled: true,
            delay: 300,
            sticky: true
          },
          folding: true,
          foldingStrategy: 'indentation',
          guides: {
            indentation: true,
            bracketPairs: true
          },
          quickSuggestions: {
            other: true,
            comments: true,
            strings: true
          },
          suggestSelection: 'first'
        }}
      />
    </div>
  );
};

export default Editor;