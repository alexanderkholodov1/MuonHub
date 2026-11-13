import { en, type MessageKey } from "./en";
import { es } from "./es";

export type Locale = "en" | "es";

const catalogues: Record<Locale, Partial<Record<MessageKey, string>>> = { en, es };
let active: Locale = "en";

/** Sets the language of every later `t()` call (LocaleProvider re-renders the tree). */
export function setActiveLocale(locale: Locale): void {
  active = locale;
}

export function activeLocale(): Locale {
  return active;
}

/**
 * Looks up a UI string in the active language, falling back to English; `{name}` placeholders are
 * replaced from `params`.
 */
export function t(key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
  const text: string = catalogues[active][key] ?? en[key];
  if (params === undefined) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

export type { MessageKey };
