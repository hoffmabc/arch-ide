import React, { useCallback, useEffect, useState, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { FileNode } from '../types';

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
// ██╔══██║██╔══██╗██║     ██╔══██║    ██║╚██╗██║██╔══╝     ██║   ██║███╗██║██║   ██║██╔══██╗██╔═██╗
// ██║  ██║██║  ██║╚██████╗██║  ██║    ██║ ╚███║███████╗   █║   ╚███╔███╔╝╚██████╔╝██║  ██║██║  ██╗
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
  const [latestContent, setLatestContent] = useState(code);
  const isWelcomeScreen = !currentFile;
  const displayCode = isWelcomeScreen ? DEFAULT_WELCOME_MESSAGE : code;
  const editorRef = useRef<any>(null);

  const fileType = currentFile ? getFileType(currentFile.name) : 'text';
  const isMediaFile = fileType !== 'text';
  const isSvgFile = fileType === 'svg';

  useEffect(() => {
    setLatestContent(code);
  }, [code]);

  const handleChange = useCallback((value: string | undefined) => {
    if (!isWelcomeScreen && !isMediaFile && value !== undefined) {
      setLatestContent(value);
      onChange(value);
    }
  }, [isWelcomeScreen, isMediaFile, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isMediaFile) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (!isWelcomeScreen && onSave && editorRef.current) {
        const currentValue = editorRef.current.getValue();
        onSave(currentValue);
      }
    }
  }, [onSave, isWelcomeScreen, isMediaFile]);

  if (fileType !== 'text' && currentFile) {
    return <MediaViewer type={fileType} content={currentFile.content || ''} />;
  }

  return (
    <div className="h-full w-full">
      <MonacoEditor
        height="100%"
        defaultLanguage={isSvgFile ? 'xml' : 'rust'}
        theme="vs-dark"
        key={currentFile?.path || 'welcome'}
        value={displayCode}
        onChange={handleChange}
        onMount={(editor) => {
          editorRef.current = editor;
          editor.onKeyDown((e) => {
            const keyboardEvent = e as unknown as KeyboardEvent;
            handleKeyDown(keyboardEvent);
          });
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          tabSize: 2,
          readOnly: isWelcomeScreen || isMediaFile
        }}
      />
    </div>
  );
};

export default Editor;