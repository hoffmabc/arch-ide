export interface Theme {
  isDark: boolean;
  colors: {
    default: {
      bgPrimary: string;
      bgSecondary: string;
      primary: string;
      secondary: string;
      textPrimary: string;
      textSecondary: string;
      border: string;
    };
    state: {
      disabled: { bg: string; color: string; };
      error: { color: string; };
      hover: { bg: string; color: string; };
      info: { color: string; };
      success: { color: string; };
      warning: { color: string; };
    };
  };
  default: {
    backdrop: { backdropFilter: string; };
    borderRadius: string;
    boxShadow: string;
  };
  components: {
    editor: {
      default: { bg: string; color: string; };
      gutter: { bg: string; color: string; };
      wrapper: { bg: string; };
    };
    main: {
      default: { bg: string; };
    };
    sidebar: {
      left: { default: { bg: string; }; };
      right: { default: { bg: string; otherBg: string; }; };
    };
  };
  highlight: Record<string, { color: string; fontStyle?: string; }>;
}