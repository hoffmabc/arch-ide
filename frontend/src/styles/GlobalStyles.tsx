import { createGlobalStyle } from 'styled-components';
import { useTheme } from '../theme/ThemeContext';

export const GlobalStyles = () => {
  const { theme } = useTheme();

  const GlobalStylesComponent = createGlobalStyle`
    :root {
      --bg-primary: ${theme.colors.default.bgPrimary};
      --bg-secondary: ${theme.colors.default.bgSecondary};
      --text-primary: ${theme.colors.default.textPrimary};
      --text-secondary: ${theme.colors.default.textSecondary};
      --border-color: ${theme.colors.default.border};
      --color-primary: ${theme.colors.default.primary};
      --color-secondary: ${theme.colors.default.secondary};

      /* Add component-specific variables */
      --editor-bg: ${theme.components.editor.default.bg};
      --editor-text: ${theme.components.editor.default.color};
      --sidebar-bg: ${theme.components.sidebar.left.default.bg};
    }

    /* Add this test style */
    body {
      background-color: var(--bg-primary);
      color: var(--text-primary);
    }
  `;

  return <GlobalStylesComponent />;
};