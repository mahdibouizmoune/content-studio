import { FileText, ListOrdered } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";

const modes = [
  { id: "article", title: "Article", icon: FileText, copy: "Classic single-topic articles with featured and optional in-text images." },
  { id: "listicle", title: "Listicle", icon: ListOrdered, copy: "Numbered list articles with category-aware templates for food, decor, and fashion." }
];

export default function ModeSelector({ mode, setMode, settings, saveSettings, setActiveScreen, openArticlesStage }) {
  async function setCategory(category) {
    await saveSettings({ ...settings, listicleCategory: category });
  }

  return (
    <section className="animate-fade-in">
      <SectionHeader eyebrow="Generation mode" title="Choose the writing flow">
        Pick the default content shape for new queued titles.
      </SectionHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        {modes.map((item) => {
          const Icon = item.icon;
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={`glass rounded-lg p-6 text-left shadow-panel transition hover:-translate-y-0.5 ${
                active ? "ring-4 ring-violet-200" : "hover:bg-white"
              }`}
            >
              <div className={`mb-5 grid h-12 w-12 place-items-center rounded-md ${active ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white" : "bg-violet-50 text-violet-600"}`}>
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-black text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink/65">{item.copy}</p>
              <div className="mt-5 text-sm font-bold text-violet-700">{active ? "Selected" : "Select mode"}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="glass rounded-lg p-5 shadow-panel">
          <h3 className="text-lg font-black text-ink">Listicle category</h3>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {[
              ["default", "Default"],
              ["food", "Food"],
              ["homedecor", "Home Decor"],
              ["fashion", "Fashion"]
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                className={`rounded-md border px-3 py-2 text-sm font-bold transition ${
                  settings.listicleCategory === id ? "border-violet-500 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 text-white" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => openArticlesStage ? openArticlesStage("add") : setActiveScreen("articles")}
          className="rounded-lg bg-ink px-6 py-4 text-left font-black text-white shadow-panel transition hover:bg-ink/90 lg:min-w-56"
        >
          Add titles
          <span className="mt-1 block text-sm font-semibold text-white/70">Queue the next batch</span>
        </button>
      </div>
    </section>
  );
}
