import { useEffect } from 'react';
import { useTheme } from './ThemeContext';

export const ThemeVariableProvider = ({ children }: { children: React.ReactNode }) => {
  const { theme } = useTheme();

  useEffect(() => {
    // Set CSS variables based on theme
    const root = document.documentElement;

    // Colors
    root.style.setProperty('--bg-primary', theme.colors.default.bgPrimary);
    root.style.setProperty('--bg-secondary', theme.colors.default.bgSecondary);
    root.style.setProperty('--color-primary', theme.colors.default.primary);
    root.style.setProperty('--color-secondary', theme.colors.default.secondary);
    root.style.setProperty('--text-primary', theme.colors.default.textPrimary);
    root.style.setProperty('--text-secondary', theme.colors.default.textSecondary);

    // Add other theme variables as needed
  }, [theme]);

  return <>{children}</>;
};