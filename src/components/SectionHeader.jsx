export default function SectionHeader({ eyebrow, title, children, action }) {
  return (
    <div className="section-header mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        {eyebrow && eyebrow !== title ? <div className="section-eyebrow mb-1 text-[11px] font-semibold text-slate-500">{eyebrow}</div> : null}
        <h2 className="section-title text-2xl font-semibold leading-tight text-slate-950">{title}</h2>
        {children ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">{children}</p> : null}
      </div>
      {action}
    </div>
  );
}
