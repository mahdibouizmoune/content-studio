import { forwardRef } from "react";

export const Button = forwardRef(function Button({ variant = "primary", className = "", ...props }, ref) {
  const variants = {
    primary: "bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white shadow-sm shadow-violet-500/20 hover:from-indigo-500 hover:via-violet-500 hover:to-purple-500",
    secondary: "bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm hover:bg-slate-50 hover:ring-slate-300",
    danger: "bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100",
    warning: "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500",
    ghost: "bg-transparent text-slate-700 hover:bg-slate-100"
  };
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
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

export const inputClass = "min-h-[42px] w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

export function EmptyState({ title, children }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <h3 className="text-lg font-black text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{children}</p>
    </div>
  );
}
