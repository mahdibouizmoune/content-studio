import { forwardRef } from "react";

export const Button = forwardRef(function Button({ variant = "primary", className = "", ...props }, ref) {
  const variants = {
    primary: "studio-button-primary",
    secondary: "studio-button-secondary",
    danger: "studio-button-danger",
    warning: "studio-button-warning",
    ghost: "studio-button-ghost"
  };
  return (
    <button
      ref={ref}
      type="button"
      className={`studio-button inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant] || variants.primary} ${className}`}
      {...props}
    />
  );
});

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}

export const inputClass = "studio-input min-h-[40px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400";

export function EmptyState({ title, children }) {
  return (
    <div className="studio-empty p-8 text-center">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{children}</p>
    </div>
  );
}
