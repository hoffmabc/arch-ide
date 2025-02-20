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

      // Set up SDK in iframe
      if (iframeWindow) {
        (iframeWindow as any).RpcConnection = RpcConnection;
        (iframeWindow as any).MessageUtil = MessageUtil;
        (iframeWindow as any).PubkeyUtil = PubkeyUtil;
      }

      // Create a more robust console override
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

      // Add message event listener to parent window
      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'console') {
          onMessage(event.data.level, event.data.message);
          console.log('Message received:', event.data); // Debug log
        }
      };
      iframeWindow.parent.addEventListener('message', messageHandler);

      // Add completion handler
      const completionHandler = (event: MessageEvent) => {
        if (event.data?.type === 'completion') {
          iframeWindow.parent.removeEventListener('message', messageHandler);
          iframeWindow.parent.removeEventListener('message', completionHandler);
          onMessage('success', 'Code executed successfully');
        }
      };

      iframeWindow.parent.addEventListener('message', completionHandler);

      // Modify the wrapped code to include completion notification
      const wrappedCode = `
        (async () => {
          class __Pg {
            async __run() {
              ${consoleOverride}
              try {
                // Create a promise that tracks all setTimeout calls
                const timeouts = new Set();

                // Override setTimeout to track all pending timeouts
                const originalSetTimeout = window.setTimeout;
                window.setTimeout = (fn, delay, ...args) => {
                  const timeoutPromise = new Promise(resolve => {
                    const timeoutId = originalSetTimeout(() => {
                      timeouts.delete(timeoutPromise);
                      fn.apply(this, args);
                      resolve();
                    }, delay);
                    return timeoutId;
                  });
                  timeouts.add(timeoutPromise);
                  return timeoutPromise;
                };

                // Execute the user's code
                ${code}

                // Wait for all timeouts to complete
                await Promise.all(Array.from(timeouts));
              } finally {
                window.parent.postMessage({ type: 'completion' }, '*');
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

      // Transpile the code
      const transpiled = transpile(wrappedCode, {
        target: ScriptTarget.ES5,
        module: ModuleKind.None,
        removeComments: true,
      });

      // Create and inject the script
      const scriptEl = document.createElement("script");
      scriptEl.type = 'text/javascript';
      scriptEl.textContent = transpiled;
      iframeDocument.head.appendChild(scriptEl);

      // Add after line 98 (after script injection)
      console.log('Script injected:', {
        bodyContent: iframeDocument.body.innerHTML,
        scriptContent: scriptEl.textContent,
        hasConsole: typeof (iframeWindow as any).console !== 'undefined'
      });
    } finally {
      this._isClientRunning = false;
    }
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