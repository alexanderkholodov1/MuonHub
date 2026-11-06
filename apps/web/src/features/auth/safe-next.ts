/** True for characters URL parsers trim or normalize: controls, space, DEL, and the backslash. */
function isUnsafeChar(c: string): boolean {
  const code = c.charCodeAt(0);
  return c === "\\" || code <= 0x20 || code === 0x7f;
}

/** Only local absolute paths; reject URL-parser whitespace and backslash normalization too. */
export function safeNext(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//") || [...value].some(isUnsafeChar)) {
    return "/app";
  }
  return value;
}
