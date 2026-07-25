export default function SectionHeader({ eyebrow, title, children, action }) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><span className="h-1.5 w-6 rounded-full bg-gradient-to-r from-indigo-600 to-violet-500" />{eyebrow}</div>
        <h2 className="mt-2 text-3xl font-black leading-tight text-slate-950 lg:text-4xl">{title}</h2>
        {children ? <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600 lg:text-base">{children}</p> : null}
      </div>
      {action}
    </div>
  );
}
