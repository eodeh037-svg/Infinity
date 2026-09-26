import { ReactNode, createContext, useContext, useMemo } from 'react';
import { Platform } from 'react-native';
import { colors, ThemeColor } from './palette';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.classList.add('dark');
}

type ThemeContextValue = {
  colors: ThemeColor;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useMemo<ThemeContextValue>(() => ({ colors }), []);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
