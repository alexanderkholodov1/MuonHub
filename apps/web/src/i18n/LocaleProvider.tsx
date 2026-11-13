"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { setActiveLocale, type Locale } from "./t";

const STORAGE_KEY = "muonhub-lang";

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleState>({ locale: "en", setLocale: () => undefined });

/** The visitor's choice, else their browser's language: Spanish for any `es-*`, else English. */
export function preferredLocale(stored: string | null, languages: readonly string[]): Locale {
  if (stored === "en" || stored === "es") return stored;
  return languages.some((l) => l.toLowerCase().startsWith("es")) ? "es" : "en";
}

/**
 * Pages are exported in English; after hydration the visitor's language is applied and the tree is
 * rendered again in it. Changing language re-renders everything below.
 */
export function LocaleProvider({ children }: { children: ReactNode }): ReactNode {
  const [locale, setState] = useState<Locale>("en");

  const setLocale = useCallback((next: Locale) => {
    setActiveLocale(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable (private mode); the choice then lasts for this page only.
    }
    setState(next);
  }, []);

  useEffect(() => {
    let stored: string | null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    const wanted = preferredLocale(stored, navigator.languages ?? [navigator.language]);
    if (wanted !== "en") {
      setActiveLocale(wanted);
      document.documentElement.lang = wanted;
      setState(wanted);
    }
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <Fragment key={locale}>{children}</Fragment>
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleState {
  return useContext(LocaleContext);
}
