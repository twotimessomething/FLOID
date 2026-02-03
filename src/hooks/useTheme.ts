import { useEffect } from 'react';
import { useUIStore, type ThemeMode } from '../stores/uiStore';

const STORAGE_KEY = 'floid-theme';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: ThemeMode): void {
  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;

  if (resolvedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function useTheme(): void {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  // Initialize theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setTheme(stored);
    }
  }, [setTheme]);

  // Apply theme and persist to localStorage
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Listen for system preference changes when in system mode
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (): void => {
      applyTheme('system');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);
}
