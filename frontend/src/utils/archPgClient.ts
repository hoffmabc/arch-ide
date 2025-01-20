import { transpile, ScriptTarget } from "typescript";
import { RpcConnection, ArchConnection, PubkeyUtil } from "@saturnbtcio/arch-sdk";

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

      // Clear iframe window and document
      const iframeDocument = iframeWindow.document;

      // Clear all scripts
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

      // Set up console override
      const iframeConsole = {
        log: (...args: any[]) => onMessage('info', args.join(' ')),
        error: (...args: any[]) => onMessage('error', args.join(' ')),
        info: (...args: any[]) => onMessage('info', args.join(' ')),
      };

      // Set globals
      const globals: [string, any][] = [
        ['console', iframeConsole],
        ['RpcConnection', RpcConnection],
        ['ArchConnection', ArchConnection],
        ['PubkeyUtil', PubkeyUtil],
      ];

      // Set iframe globals
      for (const [name, pkg] of globals) {
        (iframeWindow as any)[name] = pkg;
      }

      // Wrap code in async IIFE and class
      code = `(async () => {
        class __Arch {
          async __run() {
            ${code}
          }
        }
        const __arch = new __Arch();
        try {
          await __arch.__run();
        } catch (e) {
          console.error(e.message);
        }
      })()`;

      // Transpile the code
      code = transpile(code, {
        target: ScriptTarget.ES5,
        removeComments: true,
      });

      return new Promise<void>((resolve) => {
        // Create and inject new script
        const scriptEl = document.createElement("script");
        iframeDocument.head.appendChild(scriptEl);
        scriptEl.textContent = code;

        // Resolve when code execution is complete
        onMessage('success', 'Code executed successfully');
        resolve();
      });
    } finally {
      this._isClientRunning = false;
      console.log('ArchPgClient.execute finally called', this._isClientRunning);
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