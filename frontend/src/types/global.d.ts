declare global {
  interface Window {
    archSdk: {
      RpcConnection: typeof import('@saturnbtcio/arch-sdk').RpcConnection;
      MessageUtil: typeof import('@saturnbtcio/arch-sdk').MessageUtil;
      PubkeyUtil: typeof import('@saturnbtcio/arch-sdk').PubkeyUtil;
      // Add other properties as needed
    };
  }
}

export {};