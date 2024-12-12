const STORAGE_KEYS = {
    CONFIG: 'arch-playground-config',
    PROGRAM_BINARY: 'arch-playground-binary',
    PROGRAM_ID: 'arch-playground-program-id',
    CURRENT_ACCOUNT: 'arch-playground-current-account',
    CURRENT_VIEW: 'arch-playground-current-view'
  };

  export const storage = {
    saveConfig: (config: any) => {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
    },

    getConfig: () => {
      const stored = localStorage.getItem(STORAGE_KEYS.CONFIG);
      return stored ? JSON.parse(stored) : null;
    },

    saveProgramBinary: (binary: string | null) => {
      if (binary) {
        localStorage.setItem(STORAGE_KEYS.PROGRAM_BINARY, binary);
      } else {
        localStorage.removeItem(STORAGE_KEYS.PROGRAM_BINARY);
      }
    },

    getProgramBinary: () => {
      return localStorage.getItem(STORAGE_KEYS.PROGRAM_BINARY);
    },

    saveProgramId: (id: string | undefined) => {
      if (id) {
        localStorage.setItem(STORAGE_KEYS.PROGRAM_ID, id);
      } else {
        localStorage.removeItem(STORAGE_KEYS.PROGRAM_ID);
      }
    },

    getProgramId: () => {
      return localStorage.getItem(STORAGE_KEYS.PROGRAM_ID);
    },

    saveCurrentAccount: (account: any) => {
      if (account) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_ACCOUNT, JSON.stringify(account));
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_ACCOUNT);
      }
    },

    getCurrentAccount: () => {
      const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_ACCOUNT);
      return stored ? JSON.parse(stored) : null;
    },

    saveCurrentView: (view: 'explorer' | 'build') => {
      localStorage.setItem(STORAGE_KEYS.CURRENT_VIEW, view);
    },

    getCurrentView: () => {
      return (localStorage.getItem(STORAGE_KEYS.CURRENT_VIEW) as 'explorer' | 'build') || 'explorer';
    }
  };