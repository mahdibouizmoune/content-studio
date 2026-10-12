import { useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CircleCheck,
  CircleDollarSign,
  Facebook,
  FileClock,
  FileText,
  FolderKanban,
  FolderSearch,
  ImageIcon,
  ImagePlus,
  ListTodo,
  Menu,
  Moon,
  Repeat2,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  TrendingUp,
  Video
} from "lucide-react";
import appLogo from "@/assets/content-studio-logo.png";

function navigationGroups(flags = {}) {
  return [
  {
    id: "plan",
    label: "Plan",
    items: [
      { id: "trends", label: "Trends", icon: TrendingUp },
      { id: "cluster-planner", label: "Clusters", icon: FolderSearch },
      ...(flags.contentCalendar ? [{ id: "calendar", label: "Calendar", icon: CalendarDays }] : [])
    ]
  },
  {
    id: "create",
    label: "Create",
    items: [
      { id: "articles", label: "Articles", icon: FileText },
      { id: "image-library", label: "Images", icon: ImageIcon },
      { id: "video-studio", label: "Video", icon: Video }
    ]
  },
  {
    id: "distribute",
    label: "Distribute",
    items: [
      { id: "pin-creator", label: "Pinterest", icon: ImagePlus },
      { id: "pin-publishing", label: "Pinterest Workspace", icon: CalendarDays },
      { id: "meta-studio", label: "Meta", icon: Facebook },
      ...(flags.campaignRecords ? [{ id: "campaigns", label: "Campaigns", icon: FolderKanban }] : [])
    ]
  },
  {
    id: "measure",
    label: "Measure",
    items: [
      { id: "performance", label: "Performance", icon: BarChart3 },
      ...(flags.contentUpdateQueue ? [{ id: "content-updates", label: "Content Updates", icon: FileClock }] : []),
      ...(flags.revenueAttribution ? [{ id: "attribution", label: "Attribution", icon: CircleDollarSign }] : [])
    ]
  },
  {
    id: "system",
    label: "System",
    items: [
      { id: "connections", label: "Connections", icon: SlidersHorizontal },
      { id: "jobs", label: "Job Center", icon: ListTodo },
      { id: "settings", label: "Settings", icon: Settings },
      { id: "diagnostics", label: "Diagnostics", icon: ShieldCheck },
      ...(flags.runHistory ? [{ id: "run-history", label: "Run History", icon: FileClock }] : []),
      ...(flags.modelRegistry ? [{ id: "model-registry", label: "Model Registry", icon: SlidersHorizontal }] : [])
    ]
  }
  ];
}

const mobileControls = [
  { id: "articles", label: "Articles", icon: FileText, screen: "articles" },
  { id: "plan", label: "Plan", icon: TrendingUp, group: "plan" },
  { id: "create", label: "Create", icon: ImageIcon, group: "create" },
  { id: "distribute", label: "Distribute", icon: Repeat2, group: "distribute" },
  { id: "more", label: "More", icon: Menu, groups: ["measure", "system"] }
];

function screenIsActive(activeScreen, itemId) {
  if (itemId === 'pin-publishing') return activeScreen.startsWith('pin-publishing');
  if (itemId === "diagnostics") return activeScreen === "diagnostics";
  return activeScreen === itemId;
}

export default function Sidebar({ activeScreen, setActiveScreen, counts, theme, setTheme, settings }) {
  const isDark = theme === "dark";
  const [mobileMenu, setMobileMenu] = useState("");
  const groups = navigationGroups(settings?.featureFlags);

  function selectScreen(screen) {
    setActiveScreen(screen);
    setMobileMenu("");
  }

  const mobileGroups = mobileMenu === "more"
    ? groups.filter((group) => ["measure", "system"].includes(group.id))
    : groups.filter((group) => group.id === mobileMenu);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-hidden border-r border-slate-800 bg-slate-950 p-4 text-white md:flex md:flex-col">
        <div className="mb-4 flex items-center gap-3 px-1 pt-1">
          <img src={appLogo} alt="Content Studio" className="h-11 w-11 rounded-md object-contain" />
          <div className="min-w-0">
            <h1 className="truncate whitespace-nowrap text-lg font-black leading-tight text-white">Content Studio</h1>
            <p className="mt-0.5 text-xs font-semibold text-slate-400">Publishing workspace</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="mb-3 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-slate-200 ring-1 ring-white/10 transition-colors hover:bg-slate-800 hover:text-white"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {isDark ? "Light" : "Dark"}
        </button>
        <div className="mb-3 grid grid-cols-2 divide-x divide-white/10 rounded-md bg-slate-900 ring-1 ring-white/10">
          <div className="px-3 py-2">
            <div className="text-base font-black">{counts.pending}</div>
            <div className="text-[11px] font-bold text-slate-400">Queued</div>
          </div>
          <div className="px-3 py-2">
            <div className="text-base font-black">{counts.completed}</div>
            <div className="text-[11px] font-bold text-slate-400">Completed</div>
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-2 pr-1" aria-label="Main navigation">
          {groups.map((group) => (
            <div key={group.id}>
              <div className="mb-1 px-3 text-[10px] font-black uppercase text-slate-500">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = screenIsActive(activeScreen, item.id);
                  const badge = item.id === "articles" ? counts.totalArticles : 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectScreen(item.id)}
                      className={`group flex min-h-[38px] w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-bold transition-colors ${
                        active ? "sidebar-nav-active bg-white text-slate-950 shadow-sm" : "text-slate-300 hover:bg-slate-900 hover:text-white"
                      }`}
                      title={item.label}
                    >
                      <Icon className={`h-[17px] w-[17px] ${active ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-200"}`} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {badge ? <span className="rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-0.5 text-[10px] text-white">{badge}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        {counts.failed ? (
          <div className="mt-2 rounded-md border border-rose-400/25 bg-rose-400/10 p-2 text-xs font-medium text-rose-100">
            {counts.failed} article{counts.failed === 1 ? "" : "s"} need attention.
          </div>
        ) : null}
        <div className="mt-2 flex shrink-0 items-center justify-between border-t border-white/10 pt-2 text-xs font-bold text-slate-400">
          <span>Version {__APP_VERSION__}</span>
          <CircleCheck className="h-4 w-4 text-emerald-400" />
        </div>
      </aside>

      {mobileMenu ? (
        <div className="fixed inset-x-3 bottom-[68px] z-30 max-h-[60vh] overflow-auto rounded-lg border border-slate-200 bg-white p-3 shadow-panel md:hidden">
          {mobileGroups.map((group) => (
            <div key={group.id} className="mb-3 last:mb-0">
              <div className="mb-2 px-1 text-xs font-black uppercase text-slate-500">{group.label}</div>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectScreen(item.id)}
                      className="flex min-h-14 items-center gap-2 rounded-md bg-slate-50 px-3 text-left text-sm font-bold text-slate-800 ring-1 ring-slate-100"
                    >
                      <Icon className="h-4 w-4 text-indigo-600" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 p-1 shadow-panel backdrop-blur md:hidden" aria-label="Mobile navigation">
        {mobileControls.map((item) => {
          const Icon = item.icon;
          const groupActive = item.group
            ? groups.find((group) => group.id === item.group)?.items.some((entry) => screenIsActive(activeScreen, entry.id))
            : item.groups
            ? groups.filter((group) => item.groups.includes(group.id)).some((group) => group.items.some((entry) => screenIsActive(activeScreen, entry.id)))
            : activeScreen === item.screen;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => item.screen ? selectScreen(item.screen) : setMobileMenu((current) => current === item.id ? "" : item.id)}
              className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-[10px] font-bold transition-colors ${
                groupActive ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
              title={item.label}
            >
              <Icon className="h-4 w-4" />
              <span className="w-full truncate text-center">{item.label}</span>
              {item.id === "articles" && counts.totalArticles ? <span className="absolute right-1 top-1 rounded-full bg-violet-600 px-1.5 text-[10px] text-white">{counts.totalArticles}</span> : null}
            </button>
          );
        })}
      </nav>
    </>
  );
}
