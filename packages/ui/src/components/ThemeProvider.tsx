"use client";

/**
 * ThemeProvider — Observatory Dark theme context.
 *
 * - Dark is the default (24/7 monitoring, data legibility).
 * - Exposes a toggle so users can switch to light (papers, daytime, print).
 * - Persists choice in localStorage; respects system preference on first visit.
 * - Honors prefers-reduced-motion by setting CSS variables to 0ms (see tokens.css).
 * - Sets `data-theme` attribute on <html> so CSS custom properties apply.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "muonhub-theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // localStorage unavailable (private mode, etc.) — fall through
  }

  // Respect system preference on first visit; default dark otherwise
  if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Override the initial theme (e.g. for SSR/Next.js). Defaults to "dark". */
  defaultTheme?: Theme;
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
}: ThemeProviderProps): React.ReactElement {
  // Start with the server-safe default; hydrate to the real value on mount.
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(getInitialTheme());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.setAttribute("data-theme", theme);

    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore
    }
  }, [theme, mounted]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
