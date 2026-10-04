/**
 * @muonhub/ui — Observatory Dark design system.
 *
 * Exports:
 * - ThemeProvider + useTheme (dark/light toggle, prefers-reduced-motion aware)
 * - Button (primary/secondary/ghost; default/hover/focus/disabled/loading)
 * - Card (title + body; empty/loading/error states)
 * - Stat (KPI tile; mono tabular-nums readout; loading/error states)
 *
 * CSS tokens (Observatory Dark):
 *   import "@muonhub/ui/styles";   ← in apps/web global stylesheet
 *
 * All colors via CSS custom properties (never raw hex in components).
 * Tailwind v4 @theme maps tokens to utility classes (bg-surface, text-secondary, etc.)
 */

export { ThemeProvider, useTheme } from "./components/ThemeProvider";
export type { Theme } from "./components/ThemeProvider";

export { Button } from "./components/Button";
export type { ButtonProps } from "./components/Button";

export { Card } from "./components/Card";
export type { CardProps } from "./components/Card";

export { Stat } from "./components/Stat";
export type { StatProps, StatTrend } from "./components/Stat";

export { cn } from "./lib/cn";
