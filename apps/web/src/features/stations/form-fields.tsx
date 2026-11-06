import React from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

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

export function SelectField({
  label,
  error,
  ...select
}: SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: string;
  error?: string | null;
}): ReactNode {
  return (
    <div className="space-y-2">
      <label className="block" htmlFor={select.id}>
        {label}
      </label>
      <select
        {...select}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${select.id}-error` : undefined}
        className="min-h-12 w-full rounded-md border border-border bg-surface px-4 py-2 text-base text-text focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
      />
      {error && (
        <p id={`${select.id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Fieldset({
  legend,
  error,
  children,
}: {
  legend: string;
  error?: string | null;
  children: ReactNode;
}): ReactNode {
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-4">
      <legend className="px-1 text-base font-medium">{legend}</legend>
      {children}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
