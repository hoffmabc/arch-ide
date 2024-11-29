import React, { useCallback, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { FileNode } from '../types';
interface EditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
  onSave?: (value: string) => void;
  currentFile?: FileNode | null;
}

const DEFAULT_WELCOME_MESSAGE = `
//  █████╗ ██████╗  ██████╗██╗  ██╗    ███╗   ██╗███████╗████████╗██╗    ██╗ ██████╗ ██████╗ ██╗  ██╗
// ██╔══██╗██╔══██╗██╔════╝██║  ██║    ████╗  ██║██╔════╝╚══██╔══╝██║    ██║██╔═══██╗██╔══██╗██║ ██╔╝
// ███████║██████╔╝██║     ███████║    ██╔██╗ ██║█████╗     ██║   ██║ █╗ ██║██║   ██║██████╔╝█████╔╝ 
// ██╔══██║██╔══██╗██║     ██╔══██║    ██║╚██╗██║██╔══╝     ██║   ██║███╗██║██║   ██║██╔══██╗██╔═██╗ 
// ██║  ██║██║  ██║╚██████╗██║  ██║    ██║ ╚████║███████╗   ██║   ╚███╔███╔╝╚██████╔╝██║  ██║██║  ██╗
// ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝    ╚═╝  ╚═══╝╚══════╝   ╚═╝    ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
                                                                                                      
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
 * 5. Deploy to your chosen network (mainnet-beta, devnet, or testnet)
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

const Editor = ({ code, onChange, onSave, currentFile }: EditorProps) => {
  console.log('Editor code', { code });
  const isUnselectedFile = code === '// Select a file to edit';
  const displayCode = isUnselectedFile ? DEFAULT_WELCOME_MESSAGE : code;
  const isWelcomeScreen = isUnselectedFile;
  
  // Remove the problematic useEffect hook that was causing the loop

  const handleKeyDown = useCallback((e: monaco.IKeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
      e.preventDefault();
      console.log('Manual save triggered', { displayCode });
      if (onSave && !isWelcomeScreen) {
        onSave(displayCode);
      }
    }
  }, [onSave, displayCode, isWelcomeScreen]);

  const handleChange = (value: string | undefined) => {
    console.log('Editor content changed', { value });
    if (!isWelcomeScreen) {
      onChange(value);
    }
  };

  const handleEditorMount = useCallback((editor: any) => {
    editor.onKeyDown(handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="h-full w-full">
      <MonacoEditor
        height="100%"
        defaultLanguage="rust"
        theme="vs-dark"
        key={currentFile?.path || 'welcome'}
        value={displayCode}
        onChange={handleChange}
        onMount={handleEditorMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
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