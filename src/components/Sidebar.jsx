import { useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  ChefHat,
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
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Repeat2,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  TrendingUp,
  Video
} from "lucide-react";
import appLogo from "@/assets/content-studio-logo.png";

export function navigationGroups(flags = {}) {
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
      { id: "content-pipeline", label: "Content Pipeline", icon: FolderKanban },
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
      { id: "recipe-money-maker", label: "Recipe Money Maker", icon: ChefHat },
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
      { id: "quality-studio", label: "Quality Studio", icon: ShieldCheck },
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

export default function Sidebar({ activeScreen, setActiveScreen, counts, theme, setTheme, settings, openArticleErrors }) {
  const isDark = theme === "dark";
  const [mobileMenu, setMobileMenu] = useState("");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("studio-sidebar-collapsed") === "true");
  const groups = navigationGroups(settings?.featureFlags);
  const filteredGroups = groups.map((group) => ({ ...group, items: group.items.filter((item) => `${group.label} ${item.label}`.toLowerCase().includes(query.trim().toLowerCase())) })).filter((group) => group.items.length);

  function toggleCollapsed() {
    setCollapsed((current) => {
      localStorage.setItem("studio-sidebar-collapsed", String(!current));
      return !current;
    });
    setQuery("");
  }

  function selectScreen(screen) {
    setActiveScreen(screen);
    setMobileMenu("");
  }

  const mobileGroups = mobileMenu === "more"
    ? groups.filter((group) => ["measure", "system"].includes(group.id))
    : groups.filter((group) => group.id === mobileMenu);

  return (
    <>
      <aside className={`studio-sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label="Workspace sidebar">
        <div className="sidebar-brand">
          <img src={appLogo} alt="Content Studio" className="h-9 w-9 shrink-0 rounded-md object-contain" />
          <div className="sidebar-label min-w-0">
            <h1 className="truncate whitespace-nowrap text-sm font-semibold">Content Studio</h1>
            <p className="mt-0.5 text-[11px] text-slate-400">Publishing workspace</p>
          </div>
        </div>
        {!collapsed ? <label className="sidebar-search"><Search size={15} aria-hidden="true" /><input aria-label="Find a workspace" placeholder="Find a workspace..." value={query} onChange={(event) => setQuery(event.target.value)} /></label> : null}
        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto py-3" aria-label="Main navigation">
          {filteredGroups.map((group) => (
            <div key={group.id}>
              <div className="sidebar-group-label mb-1 px-3 text-[10px] font-semibold uppercase text-slate-400">{group.label}</div>
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
                      aria-current={active ? "page" : undefined}
                      aria-label={item.label}
                      className={`sidebar-link ${active ? "sidebar-nav-active" : ""}`}
                      title={item.label}
                    >
                      <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
                      <span className="sidebar-label min-w-0 flex-1 truncate">{item.label}</span>
                      {badge ? <span className="sidebar-label sidebar-badge">{badge}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!filteredGroups.length ? <p className="px-3 text-xs text-slate-400" role="status">No matching workspace</p> : null}
        </nav>
        {counts.failed ? (
          <button type="button" title="Review article errors" aria-label={`${counts.failed} articles need attention`} onClick={() => { selectScreen("articles"); openArticleErrors?.(); }} className="sidebar-label mt-2 rounded-md border border-rose-400/25 bg-rose-400/10 p-2 text-left text-xs font-medium text-rose-100">
            {counts.failed} article{counts.failed === 1 ? " needs" : "s need"} attention.
          </button>
        ) : null}
        <div className="sidebar-footer">
          <span className="sidebar-label text-[11px] text-slate-400">Version {__APP_VERSION__}</span>
          <button type="button" className="sidebar-icon" title={isDark ? "Switch to light theme" : "Switch to dark theme"} aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setTheme(isDark ? "light" : "dark")}>{isDark ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button type="button" className="sidebar-icon" title={collapsed ? "Expand navigation" : "Collapse navigation"} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} onClick={toggleCollapsed}>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
        </div>
      </aside>

      {mobileMenu ? (
        <div id="mobile-workspaces" className="mobile-workspaces fixed inset-x-3 bottom-[76px] z-30 max-h-[60vh] overflow-auto rounded-lg border border-slate-200 bg-white p-3 shadow-panel md:hidden" onKeyDown={(event) => { if (event.key === "Escape") setMobileMenu(""); }}>
          <div className="mb-3 flex items-center justify-between text-sm font-semibold">Workspaces<button type="button" className="studio-icon-button" aria-label="Close workspaces" onClick={() => setMobileMenu("")}><PanelLeftClose size={16} /></button></div>
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
                      aria-current={screenIsActive(activeScreen, item.id) ? "page" : undefined}
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
          const groupActive = item.id === "create" && activeScreen === "articles" ? false : item.group
            ? groups.find((group) => group.id === item.group)?.items.some((entry) => screenIsActive(activeScreen, entry.id))
            : item.groups
            ? groups.filter((group) => item.groups.includes(group.id)).some((group) => group.items.some((entry) => screenIsActive(activeScreen, entry.id)))
            : activeScreen === item.screen;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => item.screen ? selectScreen(item.screen) : setMobileMenu((current) => current === item.id ? "" : item.id)}
              aria-expanded={item.screen ? undefined : mobileMenu === item.id}
              aria-controls={item.screen ? undefined : "mobile-workspaces"}
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
