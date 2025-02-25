import { createContext, useContext, ReactNode } from 'react';
import ARCH_THEME from './theme';

export type ThemeContextType = {
  theme: typeof ARCH_THEME;
};

const ThemeContext = createContext<ThemeContextType>({ theme: ARCH_THEME });

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  return (
    <ThemeContext.Provider value={{ theme: ARCH_THEME }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);