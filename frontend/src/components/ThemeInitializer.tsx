import { useEffect } from 'react';
import { useThemeStore } from '../store/themeStore';

/**
 * Component that initializes the theme and applies the 'dark' class to the document.
 * This should be placed at the root of the app to ensure themes work on all pages.
 */
export const ThemeInitializer = () => {
  const { theme } = useThemeStore();

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return null;
};
