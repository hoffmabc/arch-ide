import { transpile, ScriptTarget, ModuleKind } from "typescript";
import { RpcConnection, ArchConnection, PubkeyUtil, MessageUtil, UtxoMetaUtil, SignatureUtil } from "@saturnbtcio/arch-sdk";
import { base58 } from '@scure/base';

declare global {
  interface Window {
    archSdk: {
      RpcConnection: typeof RpcConnection;
      MessageUtil: typeof MessageUtil;
      PubkeyUtil: typeof PubkeyUtil;
    };
  }
  var console: Console;
}

export {};

interface ClientParams {
  fileName: string;
  code: string;
  onMessage: (type: string, message: string) => void;
}

interface ProjectFile {
  path: string;
  content: string;
  dependencies: string[]; // File paths this file depends on
}

export class ArchPgClient {
  private static _IframeWindow: Window | null = null;
  private static _isClientRunning = false;

  static async execute({ fileName, code, onMessage }: ClientParams) {
    console.log('ArchPgClient.execute called', this._isClientRunning);
    console.log('Code type:', typeof code);
    console.log('Code preview:', code.substring(0, 100) + '...');
    console.log('Is data URI:', code.startsWith('data:'));

    if (this._isClientRunning) {
      throw new Error("Client is already running!");
    }

    this._isClientRunning = true;
    let timeoutId: NodeJS.Timeout | null = null;
    let messageHandler: ((event: MessageEvent) => void) | null = null;

    const cleanup = () => {
      if (messageHandler) {
        window.removeEventListener('message', messageHandler);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this._isClientRunning = false;
    };

    try {
      const iframeWindow = this._getIframeWindow();
      const iframeDocument = iframeWindow.document;

      // Clear all scripts
      const scriptEls = iframeDocument.getElementsByTagName("script");
      while (scriptEls.length > 0) {
        scriptEls[0].remove();
      }

      // IMPORTANT: Add message handler BEFORE injecting script
      messageHandler = (event: MessageEvent) => {
        if (event.source === iframeWindow) {
          const data = event.data;
          if (data && typeof data === 'object') {
            if (data.type === 'console') {
              console.log('Received console message:', data);
              onMessage(data.level || 'info', data.message || '');
            } else if (data.type === 'completion') {
              console.log('Execution completed successfully');
              onMessage('success', 'Code execution completed');
              cleanup();
            } else if (data.type === 'error') {
              console.error('Execution error:', data.message);
              onMessage('error', data.message || 'Unknown error');
              cleanup();
            }
          }
        }
      };

      window.addEventListener('message', messageHandler);

      // Safety timeout - if execution takes more than 30 seconds, assume it's hung
      timeoutId = setTimeout(() => {
        console.warn('Execution timeout - resetting client running flag');
        cleanup();
        onMessage('error', 'Execution timeout - code took too long to complete');
      }, 30000);

      // Set up SDK in iframe
      if (iframeWindow) {
        (iframeWindow as any).RpcConnection = RpcConnection;
        (iframeWindow as any).ArchConnection = ArchConnection;
        (iframeWindow as any).PubkeyUtil = PubkeyUtil;
        (iframeWindow as any).MessageUtil = MessageUtil;
        (iframeWindow as any).UtxoMetaUtil = UtxoMetaUtil;
        (iframeWindow as any).SignatureUtil = SignatureUtil;

        // Add base58 encoding/decoding utilities
        (iframeWindow as any).fromBase58 = function(str: string): Uint8Array {
          return base58.decode(str);
        };

        (iframeWindow as any).toBase58 = function(bytes: Uint8Array): string {
          return base58.encode(bytes);
        };

        // Add the createConnection helper function
        (iframeWindow as any).createConnection = function(url: string) {
          console.log('Creating connection to:', url);
          return new RpcConnection(url);
        };

        // Add helper functions that are commonly used
        (iframeWindow as any).getAddressFromPubkey = async function(pubkeyHex: string, conn: any) {
          try {
            return await conn.getAccountAddress(PubkeyUtil.fromHex(pubkeyHex));
          } catch (error) {
            console.error('Error in getAddressFromPubkey:', error);
            throw error;
          }
        };

        (iframeWindow as any).formatAccountData = function(data: any) {
          try {
            if (!data) return 'No data';
            return JSON.stringify(data, null, 2);
          } catch (error) {
            console.error('Error in formatAccountData:', error);
            return String(data);
          }
        };
      }

      const consoleOverride = `
        window.console = {
          log: function() {
            const args = Array.from(arguments);
            const message = args.map(arg =>
              arg instanceof Error ? arg.stack || arg.message :
              typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');
            window.parent.postMessage({
              type: 'console',
              level: 'info',
              message: message
            }, '*');
            // Debug log to see if function is called
            // window.parent.console.log('iframe log:', message);
          },
          error: function() {
            const args = Array.from(arguments);
            const message = args.map(arg =>
              arg instanceof Error ? arg.stack || arg.message :
              typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');
            window.parent.postMessage({ type: 'console', level: 'error', message }, '*');
          },
          info: function() {
            const args = Array.from(arguments);
            const message = args.map(arg =>
              arg instanceof Error ? arg.stack || arg.message :
              typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');
            window.parent.postMessage({ type: 'console', level: 'info', message }, '*');
          }
        };
      `;

      // Decode data URI if needed
      let actualCode = code;
      if (code.startsWith('data:')) {
        // Extract base64 content from data URI
        const base64Match = code.match(/^data:[^;]+;base64,(.+)$/);
        if (base64Match) {
          try {
            actualCode = atob(base64Match[1]);
            console.log('Decoded base64 content:', actualCode.substring(0, 100) + '...');
          } catch (e) {
            console.error('Failed to decode base64 content:', e);
          }
        }
      }

      // Process the code (remove imports, etc.)
      const processedCode = actualCode.replace(/import\s+.*?from\s+['"].*?['"];?/g, '// Import removed');

      // Create a simpler wrapper
      const wrappedCode = `
        (async () => {
          ${consoleOverride}

          // Add a helper to handle RPC URLs correctly in the iframe
          const getSmartRpcUrl = (url) => {
            try {
              // If no URL provided, return empty string
              if (!url) return '';
              return url;
            } catch (e) {
              console.error('Critical error in getSmartRpcUrl:', e);
              return url || '';
            }
          };

          // Override RpcConnection to use smart URL processing
          const OriginalRpcConnection = window.RpcConnection;
          window.RpcConnection = function(url) {
            const smartUrl = getSmartRpcUrl(url);
            console.log(\`RpcConnection: \${url} → \${smartUrl}\`);
            return new OriginalRpcConnection(smartUrl);
          };

          class __Pg {
            async __run() {
              try {
                ${processedCode}
              } catch (error) {
                console.error('Error executing code:', error);
              }
            }
          }

          const __pg = new __Pg();
          try {
            await __pg.__run();
          } catch (e) {
            console.error("Uncaught error:", e.message);
          } finally {
            window.parent.postMessage({ type: 'completion' }, '*');
          }
        })()`;

      // Transpile with modern settings that support async/await
      const transpiled = transpile(wrappedCode, {
        target: ScriptTarget.ES2017, // ES2017 has native async/await support
        module: ModuleKind.None,
        removeComments: true,
        lib: ['lib.es2017.d.ts', 'lib.dom.d.ts'],
      });

      console.log('Transpiled code:', transpiled);

      // Create and inject the script
      const scriptEl = document.createElement("script");
      scriptEl.type = 'text/javascript';
      scriptEl.textContent = transpiled;

      // Add error handling for script execution
      scriptEl.onerror = (error) => {
        console.error('Script execution error:', error);
        onMessage('error', 'Script execution error: ' + (error instanceof Error ? error.message : String(error)));
      };

      iframeDocument.head.appendChild(scriptEl);

      // Debug log after script injection
      console.log('Script injected:', {
        bodyContent: iframeDocument.body.innerHTML,
        hasConsole: typeof (iframeWindow as any).console !== 'undefined'
      });
    } catch (error) {
      cleanup();
      console.error('Error during code execution setup:', error);
      onMessage('error', error instanceof Error ? error.message : 'Unknown error during execution setup');
      throw error;
    }
  }

  static async executeProject(params: {
    mainFile: string;
    files: ProjectFile[];
    onMessage: (type: string, message: string) => void;
  }) {
    const { mainFile, files, onMessage } = params;

    // Create a map of files for easy lookup
    const fileMap = new Map<string, ProjectFile>();
    files.forEach(file => fileMap.set(file.path, file));

    // Determine execution order (topological sort)
    const executionOrder = this.resolveExecutionOrder(mainFile, fileMap);

    // Combine code in the correct order
    let combinedCode = '';
    executionOrder.forEach(filePath => {
      const file = fileMap.get(filePath);
      if (file) {
        combinedCode += `\n// File: ${filePath}\n${file.content}\n`;
      }
    });

    // Execute the combined code
    return this.execute({
      fileName: mainFile,
      code: combinedCode,
      onMessage
    });
  }

  private static resolveExecutionOrder(
    mainFile: string,
    fileMap: Map<string, ProjectFile>
  ): string[] {
    // Implement topological sort for dependencies
    const visited = new Set<string>();
    const result: string[] = [];

    function visit(filePath: string) {
      if (visited.has(filePath)) return;
      visited.add(filePath);

      const file = fileMap.get(filePath);
      if (!file) return;

      // Visit all dependencies first
      file.dependencies.forEach(dep => visit(dep));

      // Then add this file
      result.push(filePath);
    }

    // Start with the main file's dependencies
    const mainFileObj = fileMap.get(mainFile);
    if (mainFileObj) {
      mainFileObj.dependencies.forEach(dep => visit(dep));
    }

    // Finally add the main file
    result.push(mainFile);
    return result;
  }

  private static _getIframeWindow() {
    if (this._IframeWindow) return this._IframeWindow;

    const iframeEl = document.createElement("iframe");
    iframeEl.style.display = "none";
    document.body.appendChild(iframeEl);

    const iframeWindow = iframeEl.contentWindow;
    if (!iframeWindow) throw new Error("No iframe window");

    // Handle errors
    iframeWindow.addEventListener("error", (ev) => {
      window.postMessage({ type: 'error', message: ev.message }, '*');
    });

    // Handle promise rejections
    iframeWindow.addEventListener("unhandledrejection", (ev) => {
      window.postMessage({ type: 'error', message: `Uncaught error: ${ev.reason.message}` }, '*');
    });

    this._IframeWindow = iframeWindow;
    return this._IframeWindow;
  }

  private static _cleanup(iframeWindow: Window) {
    // Clear all scripts
    const iframeDocument = iframeWindow.document;
    const scriptEls = iframeDocument.getElementsByTagName("script");
    while (scriptEls.length > 0) {
      scriptEls[0].remove();
    }

    // Clear window properties
    for (const key in iframeWindow) {
      try {
        delete iframeWindow[key];
      } catch {
        // Not every key can be deleted from window
      }
    }
  }
}