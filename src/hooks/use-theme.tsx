import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_THEME,
  THEME_IDS,
  THEME_SCHEME,
  type ResolvedTheme,
  type Theme,
} from "@/lib/themes";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const STORAGE_KEY = "theme";

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  resolvedTheme: "light",
  setTheme: () => {},
});

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored && THEME_IDS.includes(stored)
    ? (stored as Theme)
    : DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  const resolvedTheme = THEME_SCHEME[theme];

  useEffect(() => {
    const root = document.documentElement;
    // data-theme picks the palette in index.css. .dark is kept in step so the
    // Tailwind dark: variant follows that palette's light or dark side.
    root.dataset.theme = theme;
    root.classList.toggle("dark", resolvedTheme === "dark");
  }, [theme, resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}