"use client";

/**
 * Button — Observatory Dark primitive.
 *
 * Variants: primary | secondary | ghost
 * States: default | hover | focus-visible | disabled | loading
 *
 * - No raw hex; all colors via CSS custom properties / semantic tokens.
 * - Touch targets ≥ 36px (enforced via min-h-[36px]).
 * - Focus-visible ring: 2px solid accent, offset 2px (WCAG AA).
 * - Lucide icons wired; spinner for loading state.
 * - prefers-reduced-motion: transition duration comes from CSS variables (0ms when reduced).
 */
import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/cn";

const buttonVariants = cva(
  // Base — shared across all variants
  [
    "inline-flex items-center justify-center gap-2",
    "min-h-[36px] min-w-[36px]",
    "px-4 py-2",
    "rounded-md",
    "text-sm font-medium",
    "select-none cursor-pointer",
    "transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
    "disabled:pointer-events-none disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-[var(--color-accent)] text-[var(--color-bg)]",
          "hover:opacity-90",
          "active:opacity-80",
        ],
        secondary: [
          "bg-[var(--color-surface-2)] text-[var(--color-text)]",
          "border border-[var(--color-border)]",
          "hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]",
          "active:opacity-80",
        ],
        ghost: [
          "bg-transparent text-[var(--color-text-secondary)]",
          "hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
          "active:opacity-80",
        ],
      },
      size: {
        sm: "min-h-[36px] h-9 px-3 text-xs",
        md: "min-h-[40px] h-10 px-4 text-sm",
        lg: "min-h-[44px] h-11 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Show a spinner and disable the button while true. */
  loading?: boolean;
  /** Optional Lucide icon to render before the label. */
  icon?: React.ReactNode;
}

export function Button({
  className,
  variant,
  size,
  loading = false,
  icon,
  disabled,
  children,
  ...props
}: ButtonProps): React.ReactElement {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled ?? loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
