import { BarChart3, CircleCheck, Facebook, FileText, FolderSearch, ImageIcon, ImagePlus, Moon, Repeat2, Settings, Sun, TrendingUp, Video } from "lucide-react";
import appLogo from "@/assets/content-studio-logo.png";

const items = [
  { id: "articles", label: "Articles", icon: FileText },
  { id: "trends", label: "Trends", icon: TrendingUp },
  { id: "performance", label: "Performance", icon: BarChart3 },
  { id: "pin-creator", label: "Pin Creator", icon: ImagePlus },
  { id: "meta-studio", label: "Meta Studio", icon: Facebook },
  { id: "repurpose", label: "Repurpose", icon: Repeat2 },
  { id: "video-studio", label: "Video", icon: Video },
  { id: "cluster-planner", label: "Clusters", icon: FolderSearch },
  { id: "image-library", label: "Images", icon: ImageIcon },
  { id: "settings", label: "Settings", icon: Settings }
];

export default function Sidebar({ activeScreen, setActiveScreen, counts, theme, setTheme }) {
  const isDark = theme === "dark";
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-hidden border-r border-slate-800 bg-slate-950 p-4 text-white md:flex md:flex-col">
        <div className="mb-5 flex items-center gap-3 px-1 pt-1">
          <img src={appLogo} alt="Content Studio" className="h-11 w-11 rounded-md object-contain" />
          <div className="min-w-0"><h1 className="truncate whitespace-nowrap text-lg font-black leading-tight text-white">Content Studio</h1><p className="mt-0.5 text-xs font-semibold text-slate-400">Publishing workspace</p></div>
        </div>
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="mb-4 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-slate-200 ring-1 ring-white/10 transition-colors hover:bg-slate-800 hover:text-white"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {isDark ? "Light" : "Dark"}
        </button>
        <div className="mb-4 grid grid-cols-2 divide-x divide-white/10 rounded-md bg-slate-900 ring-1 ring-white/10">
          <div className="px-3 py-2.5">
            <div className="text-base font-black">{counts.pending}</div>
            <div className="text-[11px] font-bold text-slate-400">Queued</div>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-base font-black">{counts.completed}</div>
            <div className="text-[11px] font-bold text-slate-400">Completed</div>
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pb-2 pr-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeScreen === item.id;
            const badge = item.id === "articles" ? counts.totalArticles : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveScreen(item.id)}
                className={`group flex min-h-[42px] w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                  active ? "sidebar-nav-active bg-white text-slate-950 shadow-sm" : "text-slate-300 hover:bg-slate-900 hover:text-white"
                }`}
                title={item.label}
              >
                <Icon className={`h-[18px] w-[18px] ${active ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-200"}`} />
                <span className="flex-1">{item.label}</span>
                {badge ? <span className="rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-2.5 py-1 text-[11px] text-white">{badge}</span> : null}
              </button>
            );
          })}
        </nav>
        {counts.failed ? (
          <div className="mt-3 rounded-md border border-rose-400/25 bg-rose-400/10 p-2.5 text-sm font-medium text-rose-100">
            {counts.failed} article{counts.failed === 1 ? "" : "s"} need attention.
          </div>
        ) : null}
        <div className="mt-3 flex shrink-0 items-center justify-between border-t border-white/10 pt-3 text-xs font-bold text-slate-400">
          <span>Version {__APP_VERSION__}</span>
          <CircleCheck className="h-4 w-4 text-emerald-400" />
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-slate-200 bg-white/95 p-1 shadow-panel backdrop-blur md:hidden">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeScreen === item.id;
          const badge = item.id === "articles" ? counts.totalArticles : 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveScreen(item.id)}
              className={`relative flex min-h-14 min-w-[70px] flex-1 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-bold transition-colors ${
                active ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
              title={item.label}
            >
              <Icon className="h-4 w-4" />
              <span className="max-w-full truncate px-1">{item.label}</span>
              {badge ? <span className="absolute right-1 top-1 rounded-full bg-violet-600 px-1.5 text-[10px] text-white">{badge}</span> : null}
            </button>
          );
        })}
      </nav>
    </>
  );
}
