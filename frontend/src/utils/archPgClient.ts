import { transpile, ScriptTarget, ModuleKind } from "typescript";
import { RpcConnection, ArchConnection, PubkeyUtil, MessageUtil } from "@saturnbtcio/arch-sdk";

declare global {
  interface Window {
    archSdk: {
      RpcConnection: typeof RpcConnection;
      MessageUtil: typeof MessageUtil;
      PubkeyUtil: typeof PubkeyUtil;
    };
  }
}

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
    if (this._isClientRunning) {
      throw new Error("Client is already running!");
    }

    try {
      this._isClientRunning = true;
      const iframeWindow = this._getIframeWindow();
      const iframeDocument = iframeWindow.document;

      // Clear all scripts
      const scriptEls = iframeDocument.getElementsByTagName("script");
      while (scriptEls.length > 0) {
        scriptEls[0].remove();
      }

      // IMPORTANT: Add message handler BEFORE injecting script
      const messageHandler = (event: MessageEvent) => {
        if (event.source === iframeWindow) {
          const data = event.data;
          if (data && typeof data === 'object') {
            if (data.type === 'console') {
              console.log('Received console message:', data);
              onMessage(data.level || 'info', data.message || '');
            } else if (data.type === 'completion') {
              window.removeEventListener('message', messageHandler);
              console.log('Execution completed');
            }
          }
        }
      };

      window.addEventListener('message', messageHandler);

      // Set up SDK in iframe
      if (iframeWindow) {
        (iframeWindow as any).RpcConnection = RpcConnection;
        (iframeWindow as any).MessageUtil = MessageUtil;
        (iframeWindow as any).PubkeyUtil = PubkeyUtil;

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
            window.parent.console.log('iframe log:', message);
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

      // Remove all import statements from user code
      const processedCode = code.replace(/import\s+.*?from\s+['"].*?['"];?/g, '// Import removed');

      // Create final wrapped code without imports
      const wrappedCode = `
        (async () => {
          class __Pg {
            async __run() {
              ${consoleOverride}

              // Add a helper to handle RPC URLs correctly in the iframe
              const getSmartRpcUrl = (url) => {
                if (!url) return url;

                const isProduction = !window.location.hostname.includes('localhost') &&
                  !window.location.hostname.includes('127.0.0.1');
                const isLocalhostUrl = url.includes('localhost') || url.includes('127.0.0.1');

                // Handle special case for /rpc
                if (url === '/rpc') {
                  return isProduction ? '/api/proxy' : '/rpc';
                }

                // Handle localhost URLs
                if (isProduction && isLocalhostUrl) {
                  console.warn('Cannot access localhost from production');
                  return '/api/proxy';
                }

                // Handle external URLs in production
                if (isProduction) {
                  return \`/api/proxy?url=\${encodeURIComponent(url)}\`;
                }

                // Handle localhost URLs in development
                if (!isProduction && url.startsWith('http://localhost')) {
                  return '/rpc';
                }

                return url;
              };

              // Override RpcConnection to use smart URL processing
              const OriginalRpcConnection = window.RpcConnection;
              window.RpcConnection = function(url) {
                const smartUrl = getSmartRpcUrl(url);
                console.log(\`RpcConnection: \${url} → \${smartUrl}\`);
                return new OriginalRpcConnection(smartUrl);
              };

              try {
                // Create tracking for both timeouts and promises
                const pendingOperations = new Set();

                // Track unhandled promise rejections
                window.addEventListener('unhandledrejection', (event) => {
                  console.error('Unhandled Promise Rejection:', event.reason);
                });

                // Override setTimeout to track all pending timeouts
                const originalSetTimeout = window.setTimeout;
                window.setTimeout = (fn, delay, ...args) => {
                  const timeoutPromise = new Promise(resolve => {
                    const timeoutId = originalSetTimeout(() => {
                      pendingOperations.delete(timeoutPromise);
                      try {
                        fn.apply(this, args);
                      } catch (error) {
                        console.error('Error in setTimeout callback:', error);
                      }
                      resolve();
                    }, delay);
                    return timeoutId;
                  });
                  pendingOperations.add(timeoutPromise);
                  return timeoutPromise;
                };

                // Create a proxy for Promise to track all promises
                const OriginalPromise = window.Promise;
                window.Promise = new Proxy(OriginalPromise, {
                  construct(target, args) {
                    const promise = new target(...args);
                    const trackingPromise = promise.then(
                      result => {
                        pendingOperations.delete(trackingPromise);
                        return result;
                      },
                      error => {
                        pendingOperations.delete(trackingPromise);
                        throw error;
                      }
                    );
                    pendingOperations.add(trackingPromise);
                    return promise;
                  }
                });

                // Execute the user's code within a try/catch to capture top-level errors
                try {
                  ${processedCode}
                } catch (error) {
                  console.error('Error executing code:', error);
                }

                // Wait for all pending operations to complete
                const checkCompletion = () => {
                  if (pendingOperations.size === 0) {
                    return Promise.resolve();
                  }

                  // Create a promise that resolves when all current operations are done
                  return Promise.all(Array.from(pendingOperations))
                    .then(() => {
                      // Check again in case new operations were created while waiting
                      if (pendingOperations.size > 0) {
                        return new Promise(resolve => {
                          setTimeout(() => resolve(checkCompletion()), 100);
                        });
                      }
                    })
                    .catch(error => {
                      console.error('Error waiting for operations:', error);
                    });
                };

                // Wait for all pending operations to complete
                await checkCompletion();
              } catch (error) {
                console.error('Runtime error:', error);
              } finally {
                // Add a small delay to ensure all messages are processed
                setTimeout(() => {
                  window.parent.postMessage({ type: 'completion' }, '*');
                }, 100);
              }
            }
          }
          const __pg = new __Pg();
          try {
            await __pg.__run();
          } catch (e) {
            console.error(e);
          }
        })();
      `;

      // Transpile with less aggressive settings
      const transpiled = transpile(wrappedCode, {
        target: ScriptTarget.ES2017,
        module: ModuleKind.None, // Important - keep as None since we're running in browser
        removeComments: false,   // Might be useful to keep comments for debugging
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
    } finally {
      this._isClientRunning = false;
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