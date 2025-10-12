import { transpile, ScriptTarget, ModuleKind } from "typescript";
import { RpcConnection, ArchConnection, PubkeyUtil, MessageUtil, UtxoMetaUtil, SignatureUtil, SanitizedMessageUtil, TransactionUtil } from "@saturnbtcio/arch-sdk";
import { base58 } from '@scure/base';
import { walletManager } from './wallet/walletManager';

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

      // Verify iframe context
      console.log('[Setup] Iframe window obtained');
      console.log('[Setup] iframeWindow.parent === window:', iframeWindow.parent === window);
      console.log('[Setup] iframeWindow === window:', iframeWindow === window);

      // Clear all scripts
      const scriptEls = iframeDocument.getElementsByTagName("script");
      while (scriptEls.length > 0) {
        scriptEls[0].remove();
      }

      // IMPORTANT: Add message handler BEFORE injecting script
      messageHandler = (event: MessageEvent) => {
        // Log ALL messages - even from other sources for debugging
        console.log('[Parent] Raw message received:', {
          source: event.source === iframeWindow ? 'iframe' : 'other',
          type: event.data?.type,
          hasId: !!event.data?.id,
          id: event.data?.id,
          data: event.data
        });

        if (event.source === iframeWindow) {
          console.log('[Parent] ✓ Message is from our iframe');
          if (event.data?.type?.startsWith('wallet')) {
            console.log('[Parent] ✓ This is a wallet message!', event.data.type, 'id:', event.data.id);
          }
        }

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
            // ============================================================================
            // WALLET PROXY MESSAGE HANDLERS - Uses wallet manager
            // ============================================================================
            else if (data.type === 'wallet-check') {
              console.log('[Parent] Handling wallet-check, id:', data.id);
              console.log('[Parent] walletManager state:', {
                isConnected: walletManager.isConnected,
                currentWallet: walletManager.current?.name,
                account: walletManager.account?.address,
                availableWallets: walletManager.availableWallets.map(w => w.name)
              });

              const available = walletManager.isConnected;
              console.log('[Parent] Sending response to iframe, available:', available);
              iframeWindow.postMessage({
                type: 'wallet-check-response',
                id: data.id,
                available
              }, '*');
            }
            else if (data.type === 'wallet-type') {
              const walletType = walletManager.current?.name?.toLowerCase() || null;
              console.log('[Parent] Handling wallet-type, returning:', walletType);
              iframeWindow.postMessage({
                type: 'wallet-type-response',
                id: data.id,
                walletType
              }, '*');
            }
            else if (data.type === 'wallet-get-accounts') {
              console.log('[Parent] Handling wallet-get-accounts');
              (async () => {
                try {
                  const account = walletManager.account;
                  const accounts = account ? [account.address] : [];
                  console.log('[Parent] Sending accounts:', accounts);
                  iframeWindow.postMessage({
                    type: 'wallet-accounts-response',
                    id: data.id,
                    accounts
                  }, '*');
                } catch (error: any) {
                  console.error('[Parent] Error getting accounts:', error);
                  iframeWindow.postMessage({
                    type: 'wallet-accounts-response',
                    id: data.id,
                    error: error.message
                  }, '*');
                }
              })();
            }
            else if (data.type === 'wallet-get-pubkey') {
              console.log('[Parent] Handling wallet-get-pubkey');
              (async () => {
                try {
                  const account = walletManager.account;
                  const publicKey = account?.publicKey || null;
                  console.log('[Parent] Sending publicKey:', publicKey);
                  iframeWindow.postMessage({
                    type: 'wallet-pubkey-response',
                    id: data.id,
                    publicKey
                  }, '*');
                } catch (error: any) {
                  console.error('[Parent] Error getting pubkey:', error);
                  iframeWindow.postMessage({
                    type: 'wallet-pubkey-response',
                    id: data.id,
                    error: error.message
                  }, '*');
                }
              })();
            }
            else if (data.type === 'wallet-sign-message') {
              console.log('[Parent] Handling wallet-sign-message');
              console.log('[Parent] Message to sign:', data.message);
              console.log('[Parent] Protocol:', data.protocol);
              console.log('[Parent] Using wallet:', walletManager.current?.name);
              (async () => {
                try {
                  // Use wallet manager to sign message (BIP322)
                  const result = await walletManager.signMessage(data.message);
                  console.log('[Parent] Signature obtained:', result.signature);
                  iframeWindow.postMessage({
                    type: 'wallet-sign-response',
                    id: data.id,
                    signature: result.signature
                  }, '*');
                } catch (error: any) {
                  console.error('[Parent] Error signing message:', error);
                  iframeWindow.postMessage({
                    type: 'wallet-sign-response',
                    id: data.id,
                    error: error.message
                  }, '*');
                }
              })();
            }
          }
        }
      };

      window.addEventListener('message', messageHandler);
      console.log('[Parent] Message handler installed, waiting for messages from iframe');

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
          (iframeWindow as any).SanitizedMessageUtil = SanitizedMessageUtil;
          (iframeWindow as any).TransactionUtil = TransactionUtil;
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
        // Safe JSON stringify that handles circular references
        const safeStringify = (obj, indent = 2) => {
          const seen = new WeakSet();
          return JSON.stringify(obj, (key, value) => {
            // Handle special objects
            if (value === window || value instanceof Window) {
              return '[Window]';
            }
            if (value === document || value instanceof Document) {
              return '[Document]';
            }
            if (value instanceof Element) {
              return '[Element: ' + value.tagName + ']';
            }
            // Handle circular references
            if (typeof value === 'object' && value !== null) {
              if (seen.has(value)) {
                return '[Circular]';
              }
              seen.add(value);
            }
            return value;
          }, indent);
        };

        window.console = {
          log: function() {
            const args = Array.from(arguments);
            const message = args.map(arg => {
              if (arg instanceof Error) {
                return arg.stack || arg.message;
              } else if (arg === window || arg instanceof Window) {
                return '[Window]';
              } else if (typeof arg === 'object' && arg !== null) {
                try {
                  return safeStringify(arg, 2);
                } catch (e) {
                  return String(arg);
                }
              } else {
                return String(arg);
              }
            }).join(' ');
            window.parent.postMessage({
              type: 'console',
              level: 'info',
              message: message
            }, '*');
          },
          error: function() {
            const args = Array.from(arguments);
            const message = args.map(arg => {
              if (arg instanceof Error) {
                return arg.stack || arg.message;
              } else if (arg === window || arg instanceof Window) {
                return '[Window]';
              } else if (typeof arg === 'object' && arg !== null) {
                try {
                  return safeStringify(arg, 2);
                } catch (e) {
                  return String(arg);
                }
              } else {
                return String(arg);
              }
            }).join(' ');
            window.parent.postMessage({ type: 'console', level: 'error', message }, '*');
          },
          info: function() {
            const args = Array.from(arguments);
            const message = args.map(arg => {
              if (arg instanceof Error) {
                return arg.stack || arg.message;
              } else if (arg === window || arg instanceof Window) {
                return '[Window]';
              } else if (typeof arg === 'object' && arg !== null) {
                try {
                  return safeStringify(arg, 2);
                } catch (e) {
                  return String(arg);
                }
              } else {
                return String(arg);
              }
            }).join(' ');
            window.parent.postMessage({ type: 'console', level: 'info', message }, '*');
          }
        };

        // ============================================================================
        // SECURE WALLET PROXY - Defined in iframe context to access wallet in parent
        // ============================================================================
        window.walletProxy = {
          isAvailable: function() {
            return new Promise((resolve) => {
              console.log('[walletProxy] isAvailable called');
              console.log('[walletProxy] window === window.parent:', window === window.parent);
              const messageId = Math.random().toString(36);
              console.log('[walletProxy] Sending wallet-check with id:', messageId);

              const handler = (event) => {
                // Only process messages FROM parent
                if (event.source !== window.parent) {
                  return;
                }
                console.log('[walletProxy] Received message from parent:', event.data?.type);
                if (event.data.type === 'wallet-check-response' && event.data.id === messageId) {
                  console.log('[walletProxy] Got response, available:', event.data.available);
                  window.removeEventListener('message', handler);
                  resolve(event.data.available);
                }
              };
              window.addEventListener('message', handler);
              console.log('[walletProxy] Posting message to parent');
              window.parent.postMessage({ type: 'wallet-check', id: messageId }, '*');

              setTimeout(() => {
                window.removeEventListener('message', handler);
                console.log('[walletProxy] isAvailable timed out - no response from parent');
                resolve(false);
              }, 3000);
            });
          },

          getWalletType: function() {
            return new Promise((resolve) => {
              const messageId = Math.random().toString(36);
              const handler = (event) => {
                if (event.source !== window.parent) return;
                if (event.data.type === 'wallet-type-response' && event.data.id === messageId) {
                  window.removeEventListener('message', handler);
                  resolve(event.data.walletType);
                }
              };
              window.addEventListener('message', handler);
              window.parent.postMessage({ type: 'wallet-type', id: messageId }, '*');

              setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve(null);
              }, 1000);
            });
          },

          getAccounts: function() {
            return new Promise((resolve, reject) => {
              const messageId = Math.random().toString(36);
              const handler = (event) => {
                if (event.source !== window.parent) return;
                if (event.data.type === 'wallet-accounts-response' && event.data.id === messageId) {
                  window.removeEventListener('message', handler);
                  if (event.data.error) {
                    reject(new Error(event.data.error));
                  } else {
                    resolve(event.data.accounts);
                  }
                }
              };
              window.addEventListener('message', handler);
              window.parent.postMessage({ type: 'wallet-get-accounts', id: messageId }, '*');

              setTimeout(() => {
                window.removeEventListener('message', handler);
                reject(new Error('Timeout getting accounts'));
              }, 5000);
            });
          },

          getPublicKey: function() {
            return new Promise((resolve, reject) => {
              const messageId = Math.random().toString(36);
              const handler = (event) => {
                if (event.source !== window.parent) return;
                if (event.data.type === 'wallet-pubkey-response' && event.data.id === messageId) {
                  window.removeEventListener('message', handler);
                  if (event.data.error) {
                    reject(new Error(event.data.error));
                  } else {
                    resolve(event.data.publicKey);
                  }
                }
              };
              window.addEventListener('message', handler);
              window.parent.postMessage({ type: 'wallet-get-pubkey', id: messageId }, '*');

              setTimeout(() => {
                window.removeEventListener('message', handler);
                reject(new Error('Timeout getting public key'));
              }, 5000);
            });
          },

          signMessage: function(message, protocol) {
            if (!protocol) protocol = 'bip322-simple';
            return new Promise((resolve, reject) => {
              const messageId = Math.random().toString(36);
              console.log('[walletProxy] signMessage called, messageId:', messageId);
              console.log('[walletProxy] message:', message);
              console.log('[walletProxy] protocol:', protocol);

              const handler = (event) => {
                if (event.source !== window.parent) return;
                console.log('[walletProxy] Received response:', event.data?.type, 'id match:', event.data?.id === messageId);
                if (event.data.type === 'wallet-sign-response' && event.data.id === messageId) {
                  window.removeEventListener('message', handler);
                  if (event.data.error) {
                    console.error('[walletProxy] Sign error:', event.data.error);
                    reject(new Error(event.data.error));
                  } else {
                    console.log('[walletProxy] Sign success!');
                    resolve(event.data.signature);
                  }
                }
              };
              window.addEventListener('message', handler);
              console.log('[walletProxy] Sending wallet-sign-message to parent');
              window.parent.postMessage({
                type: 'wallet-sign-message',
                id: messageId,
                message: message,
                protocol: protocol
              }, '*');

              setTimeout(() => {
                window.removeEventListener('message', handler);
                console.error('[walletProxy] Sign timeout');
                reject(new Error('Timeout or user rejected signing'));
              }, 60000);
            });
          }
        };

        // ============================================================================
        // ClientTransactionUtil - Exposed in iframe for client.ts usage
        // Depends on: RpcConnection, MessageUtil, PubkeyUtil, SignatureUtil, walletProxy
        // ============================================================================
        window.ClientTransactionUtil = {
          setupAccount: async function(conn) {
            try {
              let accountPubkey;
              let accountAddress;
              let useWallet = false;

              const PubkeyUtil = window.PubkeyUtil;
              const ArchConnection = window.ArchConnection;
              const toBase58 = window.toBase58;
              const walletProxy = window.walletProxy;

              if (typeof walletProxy !== 'undefined') {
                try {
                  const walletAvailable = await walletProxy.isAvailable();
                  if (walletAvailable) {
                    const accounts = await walletProxy.getAccounts();
                    if (accounts && accounts.length > 0) {
                      accountAddress = accounts[0];
                      let pubkey = await walletProxy.getPublicKey();
                      if (pubkey && pubkey.length === 66) {
                        pubkey = pubkey.slice(2);
                      }
                      accountPubkey = PubkeyUtil.fromHex(pubkey);
                      useWallet = true;

                      try {
                        await conn.requestAirdrop(accountPubkey);
                      } catch (_) {}

                      return { accountPubkey, accountAddress, useWallet };
                    }
                  }
                } catch (_) {}
              }

              // Fallback: create a new account
              const archConn = ArchConnection(conn);
              const newAccount = await archConn.createNewAccount();
              accountPubkey = PubkeyUtil.fromHex(newAccount.pubkey);
              accountAddress = newAccount.address;
              try { await conn.requestAirdrop(accountPubkey); } catch (_) {}
              return { accountPubkey, accountAddress, useWallet };
            } catch (error) {
              throw new Error('[ClientTransactionUtil.setupAccount] ' + (error && error.message ? error.message : String(error)));
            }
          },

          signAndSendTransaction: async function(conn, message, useWallet) {
            const MessageUtil = window.MessageUtil;
            const SanitizedMessageUtil = window.SanitizedMessageUtil;
            const walletProxy = window.walletProxy;
            const SignatureUtil = window.SignatureUtil;

            // Build sanitized message with SDK utilities
            const bestBlockHash = await conn.getBestBlockHash();
            const blockhashBytes = new Uint8Array(32);
            for (let i = 0; i < 32; i++) {
              blockhashBytes[i] = parseInt(bestBlockHash.slice(i * 2, i * 2 + 2), 16);
            }
            const payer = Array.isArray(message.signers) && message.signers.length > 0 ? message.signers[0] : null;
            const sanitizedOrError = SanitizedMessageUtil.createSanitizedMessage(
              message.instructions,
              payer,
              blockhashBytes
            );
            if (!sanitizedOrError || typeof sanitizedOrError !== 'object' || !('header' in sanitizedOrError)) {
              throw new Error('Failed to create sanitized message');
            }
            const sanitizedMessage = sanitizedOrError;
            // Build a send-safe message where recent_blockhash is a number[] to avoid cross-realm TypedArray issues
            const sendMessage = {
              header: sanitizedMessage.header,
              account_keys: sanitizedMessage.account_keys.map((k: Uint8Array) => Array.from(k)),
              recent_blockhash: Array.from(blockhashBytes),
              instructions: sanitizedMessage.instructions.map((ix: any) => ({
                program_id_index: ix.program_id_index,
                accounts: Array.isArray(ix.accounts) ? ix.accounts.slice() : [],
                data: Array.from(ix.data)
              }))
            };

            // Hash the sanitized message using SDK util (returns ASCII-encoded hex bytes)
            const messageHash = SanitizedMessageUtil.hash(sanitizedMessage);
            const hashHex = new TextDecoder().decode(messageHash);

            if (typeof walletProxy !== 'undefined' && useWallet) {
              try {
                const signatureStr = await walletProxy.signMessage(hashHex, 'bip322-simple');

                // Robust decode: handle base64 or hex strings from different wallets
                const isHex = (s) => /^[0-9a-fA-F]+$/.test(s) && (s.length % 2 === 0);
                const fromHex = (s) => {
                  const out = new Uint8Array(s.length / 2);
                  for (let i = 0; i < s.length; i += 2) {
                    out[i / 2] = parseInt(s.slice(i, i + 2), 16);
                  }
                  return out;
                };
                const isBase64 = (s) => {
                  try { return btoa(atob(s)) === s; } catch { return false; }
                };

                let signature = isHex(signatureStr)
                  ? fromHex(signatureStr)
                  : isBase64(signatureStr)
                    ? Uint8Array.from(atob(signatureStr), c => c.charCodeAt(0))
                    : (() => { throw new Error('Unknown signature encoding from wallet'); })();
                if (signature.length === 65) {
                  signature = signature.slice(0, 64);
                }
                if (typeof SignatureUtil !== 'undefined') {
                  try { signature = SignatureUtil.adjustSignature(signature); } catch (_) {}
                }

                const transaction = { version: 0, signatures: [Array.from(signature)], message: sendMessage };
                try {
                  // Basic validation logs
                  console.log('[ClientTransactionUtil] header:', sanitizedMessage.header);
                  console.log('[ClientTransactionUtil] account_keys len:', sanitizedMessage.account_keys.length);
                  console.log('[ClientTransactionUtil] recent_blockhash len:', sanitizedMessage.recent_blockhash?.length);
                  console.log('[ClientTransactionUtil] signatures[0] len:', signature.length);
                  try {
                    const firstIx = sanitizedMessage.instructions?.[0];
                    if (firstIx) {
                      console.log('[ClientTransactionUtil] first ix program_id_index:', firstIx.program_id_index);
                      console.log('[ClientTransactionUtil] first ix accounts:', firstIx.accounts);
                    }
                  } catch {}
                  // Preview (numeric arrays) for server-side schema check
                  const txPreview = TransactionUtil.toNumberArray(transaction);
                  console.log('[ClientTransactionUtil] TX preview:', JSON.stringify(txPreview).slice(0, 800) + '...');
                } catch {}

                // Try primary shape
                try {
                  return await conn.sendTransaction(transaction);
                } catch (e1) {
                  // Fallback: version 1 with number[] signature
                  try {
                    const txV1 = { version: 1, signatures: [Array.from(signature)], message: sendMessage };
                    console.log('[ClientTransactionUtil] Retrying with version=1 and number[] signature');
                    return await conn.sendTransaction(txV1);
                  } catch (e2) {
                    // Fallback: version 1 with Uint8Array signature (in case server accepts Uint8Array)
                    try {
                      const txV1U8 = { version: 1, signatures: [signature], message: sendMessage };
                      console.log('[ClientTransactionUtil] Retrying with version=1 and Uint8Array signature');
                      return await conn.sendTransaction(txV1U8);
                    } catch (e3) {
                      throw e3;
                    }
                  }
                }
              } catch (error) {
                throw new Error('[ClientTransactionUtil.signAndSendTransaction] ' + (error && error.message ? error.message : String(error)));
              }
            } else {
              return undefined;
            }
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

          // Add a helper to handle RPC URLs correctly in the iframe (with CORS proxy)
          const getSmartRpcUrl = (url) => {
            try {
              if (!url) return '';

              // Check if this is a localhost URL
              const isLocalhostUrl = url.includes('localhost') || url.includes('127.0.0.1');

              // Check if we're running on localhost
              const isRunningOnLocalhost = window.location.hostname === 'localhost' ||
                                           window.location.hostname === '127.0.0.1';

              // If the RPC URL is localhost, use it directly
              if (isLocalhostUrl) {
                return url;
              }

              // For external RPC endpoints: Use proxy on localhost dev to avoid CORS
              if (isRunningOnLocalhost) {
                console.log('Using proxy to avoid CORS:', url, '→ /rpc');
                return '/rpc';
              }

              // In production, use RPC directly
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