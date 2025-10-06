# Bitcoin Wallet Integration

This document explains how the Bitcoin wallet integration works, similar to Solana Playground's wallet system.

## Overview

We've implemented a complete Bitcoin wallet integration system that:
- Automatically detects Unisat and Xverse wallet extensions
- Manages wallet connection state
- Provides a unified interface for both wallets
- Persists connection state in localStorage
- Shows wallet status in the UI

## Architecture

### 1. **Wallet Adapters** (`src/utils/wallet/adapters/`)

Each wallet (Unisat, Xverse) has an adapter class that implements the `BitcoinWalletAdapter` interface:

```typescript
interface BitcoinWalletAdapter {
  name: string;
  icon: string;
  connected: boolean;
  connecting: boolean;
  accounts: BitcoinWalletAccount[];

  isAvailable(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getAccounts(): Promise<BitcoinWalletAccount[]>;
  signMessage(message: string): Promise<SignMessageResponse>;
  sendBitcoin(toAddress: string, amount: number): Promise<SendBitcoinResponse>;
  signPsbt?(psbtHex: string): Promise<string>;
}
```

### 2. **Wallet Manager** (`src/utils/wallet/walletManager.ts`)

The `walletManager` singleton manages all wallet state and operations:

```typescript
import { walletManager } from '@/utils/wallet/walletManager';

// Check available wallets
console.log(walletManager.availableWallets); // [UnisatAdapter, XverseAdapter]

// Connect to a wallet
await walletManager.connect('Unisat');

// Check connection status
console.log(walletManager.isConnected); // true
console.log(walletManager.account); // { address: 'bc1...', publicKey: '...' }

// Sign a message
const signature = await walletManager.signMessage('Hello Bitcoin!');

// Send Bitcoin
const result = await walletManager.sendBitcoin('bc1qxy...', 5000); // amount in satoshis
console.log(result.txid);

// Disconnect
await walletManager.disconnect();
```

### 3. **React Hook** (`src/hooks/useBitcoinWallet.ts`)

Use the `useBitcoinWallet` hook in React components:

```typescript
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';

function MyComponent() {
  const {
    wallet,          // Current wallet adapter
    account,         // Current account
    connected,       // Connection status
    connecting,      // Connecting status
    availableWallets, // Array of available wallets

    // Actions
    connect,
    disconnect,
    signMessage,
    sendBitcoin,
    signPsbt,
  } = useBitcoinWallet();

  return (
    <div>
      {connected ? (
        <div>
          <p>Connected: {wallet?.name}</p>
          <p>Address: {account?.address}</p>
          <button onClick={disconnect}>Disconnect</button>
        </div>
      ) : (
        <div>
          {availableWallets.map(w => (
            <button key={w.name} onClick={() => connect(w.name)}>
              Connect {w.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 4. **UI Component** (`src/components/BitcoinWallet/WalletButton.tsx`)

The `WalletButton` component is already integrated in the StatusBar and provides:
- Wallet detection and selection
- Connection status display
- Account information dropdown
- Disconnect functionality

## How It Works

### Auto-Detection

On initialization, the wallet manager:
1. Creates adapter instances for Unisat and Xverse
2. Checks if `window.unisat` and `window.xverse` are available
3. Only includes adapters for installed wallets in `availableWallets`

### Connection Flow

1. User clicks "Connect Wallet" button
2. If multiple wallets available, shows dropdown to select
3. Calls `walletManager.connect(walletName)`
4. Adapter calls the wallet's `connect()` method (shows browser popup)
5. Gets accounts from the wallet
6. Updates state and saves to localStorage
7. UI updates via React hook subscription

### State Persistence

The wallet manager saves connection state to localStorage:
- Wallet name
- Connection status

On page reload, it attempts to reconnect automatically if a wallet was previously connected.

## Integration with Existing Code

The wallet manager is already integrated in:

1. **StatusBar** - Shows wallet connection button
2. **ArchProgramLoader** - Uses wallet manager for sending Bitcoin during deployment

### Example: Using in Program Deployment

```typescript
import { walletManager } from '@/utils/wallet/walletManager';

async function deployProgram() {
  // Ensure wallet is connected
  if (!walletManager.isConnected) {
    // Auto-connect first available wallet
    const wallet = walletManager.availableWallets[0];
    await walletManager.connect(wallet.name);
  }

  // Send Bitcoin for deployment fee
  const result = await walletManager.sendBitcoin(deployAddress, 5000);
  console.log('Deployment tx:', result.txid);
}
```

## Supported Wallets

### Unisat Wallet
- **Install**: https://unisat.io
- **Features**: Full support for signing, sending, PSBT
- **Networks**: Mainnet, Testnet

### Xverse Wallet
- **Install**: https://www.xverse.app
- **Features**: Full support for signing, sending, PSBT
- **Networks**: Mainnet, Testnet
- **Note**: Uses payment address (not ordinals address)

## Adding More Wallets

To add support for a new Bitcoin wallet:

1. Create adapter in `src/utils/wallet/adapters/newwallet.ts`:

```typescript
import { BitcoinWalletAdapter } from '@/types/wallet';

export class NewWalletAdapter implements BitcoinWalletAdapter {
  name = 'NewWallet';
  icon = 'https://newwallet.com/icon.png';
  // ... implement all required methods
}
```

2. Add to wallet manager in `src/utils/wallet/walletManager.ts`:

```typescript
import { NewWalletAdapter } from './adapters/newwallet';

// In initialize()
const adapters = [
  new UnisatWalletAdapter(),
  new XverseWalletAdapter(),
  new NewWalletAdapter(), // Add here
];
```

3. Add window types in `src/types/window.d.ts`:

```typescript
interface NewWalletAPI {
  // Define API methods
}

declare global {
  interface Window {
    newWallet?: NewWalletAPI;
  }
}
```

That's it! The wallet will automatically appear in the UI if the extension is installed.

## Comparison with Solana Playground

| Feature | Solana Playground | Our Implementation |
|---------|-------------------|-------------------|
| Built-in wallet | ✅ Playground Wallet | ❌ (not recommended for Bitcoin) |
| External wallets | ✅ via Wallet Standard | ✅ via direct integration |
| Auto-detection | ✅ | ✅ |
| State management | ✅ PgWallet singleton | ✅ walletManager singleton |
| React hook | ✅ useWallet | ✅ useBitcoinWallet |
| LocalStorage persistence | ✅ | ✅ |
| UI component | ✅ Wallet dropdown | ✅ WalletButton |

## Security Notes

- Private keys never leave the wallet extension
- All signing happens in the wallet extension
- Connection state (not keys) is saved in localStorage
- Always verify transaction details before signing
