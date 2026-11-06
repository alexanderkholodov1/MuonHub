/**
 * Date and time with its time zone, in the viewer's locale. `dateStyle`/`timeStyle` cannot be
 * combined with `timeZoneName` (the browser throws), so the fields are listed explicitly.
 */
export function formatTime(ms: number, timeZone?: string): string {
  return new Date(ms).toLocaleString(undefined, {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(timeZone === undefined ? {} : { timeZone }),
  });
}
