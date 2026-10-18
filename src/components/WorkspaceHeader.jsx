import { ChevronRight, ListTodo, Moon, Sun } from "lucide-react";
import { navigationGroups } from "@/components/Sidebar";

export default function WorkspaceHeader({ activeScreen, setActiveScreen, counts, theme, setTheme, settings }) {
  const groups = navigationGroups(settings?.featureFlags);
  const group = groups.find((entry) => entry.items.some((item) => item.id === activeScreen || (item.id === "pin-publishing" && activeScreen.startsWith(item.id))));
  const item = group?.items.find((entry) => entry.id === activeScreen || (entry.id === "pin-publishing" && activeScreen.startsWith(entry.id)));
  return (
    <header className="workspace-header">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <span className="hidden text-slate-500 sm:inline">{group?.label || "Workspace"}</span>
        <ChevronRight size={13} className="hidden shrink-0 text-slate-400 sm:block" aria-hidden="true" />
        <span className="truncate font-semibold">{item?.label || "Getting Started"}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" className="workspace-job-link" onClick={() => setActiveScreen("jobs")} title="Open Job Center"><ListTodo size={15} aria-hidden="true" /><span>Job Center</span>{counts.pending > 0 ? <span className="workspace-job-count">{counts.pending}</span> : null}</button>
        <button type="button" className="studio-icon-button md:hidden" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title="Change theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
      </div>
    </header>
  );
}
