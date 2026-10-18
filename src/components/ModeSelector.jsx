import { ArrowRight, Check, FileText, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui";

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
      <h3 className="mb-4 text-base font-semibold text-ink">Writing format</h3>

      <div className="grid gap-4 lg:grid-cols-2">
        {modes.map((item) => {
          const Icon = item.icon;
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              aria-pressed={active}
              className={`writing-format ${active ? "is-selected" : ""}`}
            >
              <div className="mb-3 flex items-center justify-between"><Icon size={21} className="text-slate-500" /><span className="format-check">{active ? <Check size={13} /> : null}</span></div>
              <h3 className="text-base font-semibold text-ink">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">{item.copy}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-5 border-t border-slate-200 pt-5">
        <div className="min-w-0">
          <h3 className="mb-3 text-sm font-semibold text-ink">Listicle category</h3>
          <div className="category-segments flex flex-wrap gap-1" role="group" aria-label="Listicle category">
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
                aria-pressed={settings.listicleCategory === id}
                className={`category-segment ${settings.listicleCategory === id ? "is-selected" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Button
          onClick={() => openArticlesStage ? openArticlesStage("add") : setActiveScreen("articles")}
        >
          Add titles
          <ArrowRight size={16} />
        </Button>
      </div>
    </section>
  );
}
