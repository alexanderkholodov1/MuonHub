import { en, type MessageKey } from "./en";

/** Looks up a UI string; `{name}` placeholders are replaced from `params`. */
export function t(key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
  const text: string = en[key];
  if (params === undefined) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

export type { MessageKey };
