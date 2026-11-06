import React from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

export function Field({
  label,
  error,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string | null;
}): ReactNode {
  return (
    <div className="space-y-2">
      <label className="block" htmlFor={input.id}>
        {label}
      </label>
      <input
        {...input}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${input.id}-error` : undefined}
        className="min-h-12 w-full rounded-md border border-border bg-surface px-4 py-2 text-base text-text focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
      />
      {error && (
        <p id={`${input.id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
