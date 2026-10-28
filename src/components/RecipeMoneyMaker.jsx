import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Files, KeyRound, Palette, Settings2, Sparkles, Trash2, Upload } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { Button, EmptyState, Field, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";

const languages = ["English", "French", "Spanish", "Italian", "German", "Portuguese", "Polish"];
const fonts = ["Inter", "Arial", "Georgia", "Verdana", "Trebuchet MS"];
const defaults = { brandColor: "#1f6b4f", accentColor: "#f3b44b", font: "Inter", language: "English", brandName: "Recipe Money Maker", logoDataUrl: "", hasApiKey: false };

function CardPreview({ recipe, selected, onSelect, onPdf }) {
  const style = recipe.style || {};
  const brand = style.brandColor || "#1f6b4f";
  return (
    <article className={"overflow-hidden rounded-lg border bg-white shadow-sm transition " + (selected ? "ring-2 ring-violet-500" : "border-slate-200")}>
      <div className="relative aspect-[210/245] border-t-8 bg-gradient-to-br from-white to-slate-50 p-6" style={{ borderColor: brand }}>
        <input aria-label={"Select " + recipe.title} type="checkbox" checked={selected} onChange={(event) => onSelect(recipe.id, event.target.checked)} className="absolute left-3 top-3 h-5 w-5 accent-violet-600" />
        <div className="mt-5 text-[10px] font-black tracking-[0.18em]" style={{ color: brand }}>RECIPE COLLECTION</div>
        <h3 className="mt-3 font-serif text-2xl font-black leading-tight" style={{ color: brand }}>{recipe.title}</h3>
        <p className="mt-3 line-clamp-4 text-xs leading-5 text-slate-500">{recipe.description}</p>
        <div className="mt-5 grid grid-cols-3 gap-2 rounded-md p-3 text-center text-[10px] font-bold text-white" style={{ backgroundColor: brand }}>
          <span>{recipe.prepTime}<small className="block opacity-70">PREP</small></span>
          <span>{recipe.cookTime}<small className="block opacity-70">COOK</small></span>
          <span>{recipe.servings}<small className="block opacity-70">SERVES</small></span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4">
          {[0, 1].map((column) => <div key={column} className="space-y-2">{[0, 1, 2, 3].map((line) => <div key={line} className="h-1 rounded bg-slate-200" />)}</div>)}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 p-3">
        <span className="text-xs font-semibold text-slate-500">{new Date(recipe.createdAt).toLocaleDateString()}</span>
        <Button variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => onPdf(recipe.id)}><Download className="h-4 w-4" />PDF</Button>
      </div>
    </article>
  );
}

export default function RecipeMoneyMaker({ activeScreen }) {
  const confirmAction = useConfirmDialog();
  const [tab, setTab] = useState("generate");
  const [settings, setSettings] = useState(defaults);
  const [draft, setDraft] = useState(defaults);
  const [recipes, setRecipes] = useState([]);
  const [names, setNames] = useState("");
  const [selected, setSelected] = useState([]);
  const [progress, setProgress] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function load() {
    const result = await electronAPI.getRecipeMoneyMakerState();
    const next = { ...defaults, ...(result.settings || {}) };
    setSettings(next);
    setDraft(next);
    setRecipes(result.recipes || []);
  }

  useEffect(() => {
    if (activeScreen !== "recipe-money-maker") return;
    load().catch((error) => setStatus(error.message || "Could not load Recipe Money Maker."));
  }, [activeScreen]);

  const recipeNames = useMemo(() => [...new Set(names.split(/\r?\n/).map((name) => name.trim()).filter(Boolean))], [names]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  async function generateAll() {
    if (!recipeNames.length) return setStatus("Add at least one recipe name.");
    if (!settings.hasApiKey) {
      setTab("settings");
      return setStatus("Add and save a DeepSeek API key first.");
    }
    setBusy(true);
    setProgress(recipeNames.map((title) => ({ title, state: "waiting", message: "Waiting" })));
    let completed = 0;
    for (let index = 0; index < recipeNames.length; index += 1) {
      const title = recipeNames[index];
      setProgress((items) => items.map((item, position) => position === index ? { ...item, state: "working", message: "Writing recipe..." } : item));
      try {
        const result = await electronAPI.generateRecipeMoneyMakerRecipe({ title, language: settings.language });
        if (!result.success) throw new Error(result.error || "Generation failed.");
        setRecipes((items) => [result.recipe, ...items]);
        completed += 1;
        setProgress((items) => items.map((item, position) => position === index ? { ...item, state: "done", message: "Card ready" } : item));
      } catch (error) {
        setProgress((items) => items.map((item, position) => position === index ? { ...item, state: "error", message: error.message || "Generation failed" } : item));
      }
    }
    setBusy(false);
    setStatus(completed + " of " + recipeNames.length + " recipe cards created.");
    if (completed) setTab("cards");
  }

  async function saveSettings() {
    const result = await electronAPI.saveRecipeMoneyMakerSettings(draft);
    if (!result.success) return setStatus(result.error || "Could not save settings.");
    const next = { ...defaults, ...result.settings };
    setSettings(next);
    setDraft({ ...next, apiKey: "" });
    setStatus("Recipe Money Maker settings saved.");
  }

  async function testConnection() {
    setBusy(true);
    const result = await electronAPI.testRecipeMoneyMakerConnection({ apiKey: draft.apiKey || "" });
    setBusy(false);
    setStatus(result.success ? "DeepSeek connected successfully." : result.error || "Connection failed.");
  }

  async function removeApiKey() {
    setBusy(true);
    try {
      const result = await electronAPI.clearRecipeMoneyMakerApiKey?.();
      if (!result?.success) throw new Error(result?.error || "Could not remove the saved key.");
      setSettings((current) => ({ ...current, ...result.settings, hasApiKey: false }));
      setStatus("The saved DeepSeek key was removed from this computer.");
    } catch (error) {
      setStatus(error.message || "Could not remove the saved key.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseLogo() {
    const result = await electronAPI.chooseRecipeMoneyMakerLogo();
    if (result?.success) setDraft((current) => ({ ...current, logoDataUrl: result.logoDataUrl, logoPath: result.logoPath }));
  }

  async function exportOne(id) {
    const result = await electronAPI.exportRecipeMoneyMakerPdf({ ids: [id] });
    setStatus(result.canceled ? "Export cancelled." : result.success ? "PDF saved." : result.error || "PDF export failed.");
  }

  async function exportSelected() {
    if (!selected.length) return;
    const result = await electronAPI.exportRecipeMoneyMakerPdf({ ids: selected });
    setStatus(result.canceled ? "Export cancelled." : result.success ? "Combined PDF saved." : result.error || "PDF export failed.");
  }

  async function deleteSelected() {
    if (!selected.length) return;
    const confirmed = await confirmAction({ title: "Delete recipe cards", message: "The selected recipe cards will be removed from this module.", confirmLabel: "Delete", tone: "danger" });
    if (!confirmed) return;
    const result = await electronAPI.deleteRecipeMoneyMakerRecipes({ ids: selected });
    if (result.success) {
      setRecipes(result.recipes || []);
      setSelected([]);
      setStatus("Selected recipes deleted.");
    }
  }

  function toggleSelected(id, checked) {
    setSelected((items) => checked ? [...new Set([...items, id])] : items.filter((item) => item !== id));
  }

  const tabs = [
    ["generate", Sparkles, "Generate"],
    ["cards", Files, "Cards"],
    ["settings", Settings2, "Settings"]
  ];

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Create" title="Recipe Money Maker">
        Bulk-create branded, print-ready A4 recipe cards with DeepSeek.
      </SectionHeader>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        {tabs.map(([id, Icon, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={"flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-black transition " + (tab === id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100")}>
            <Icon className="h-4 w-4" />{label}{id === "cards" && recipes.length ? <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] text-white">{recipes.length}</span> : null}
          </button>
        ))}
        <div className={"ml-auto rounded-full px-3 py-1.5 text-xs font-black " + (settings.hasApiKey ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
          {settings.hasApiKey ? "DeepSeek ready" : "API key needed"}
        </div>
      </div>

      {status ? <div className="rounded-md border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700">{status}</div> : null}

      {tab === "generate" ? (
        <div className="space-y-5">
          <div className="overflow-hidden rounded-xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 p-8 text-white shadow-panel">
            <div className="max-w-2xl">
              <div className="text-xs font-black tracking-[0.2em] text-amber-300">FROM IDEA TO PRINT IN MINUTES</div>
              <h2 className="mt-3 font-serif text-4xl font-black leading-tight">Turn recipe names into beautiful cards.</h2>
              <p className="mt-4 max-w-xl leading-7 text-emerald-100">Add one recipe per line. Content Studio writes each recipe, applies your saved brand, and prepares an A4 PDF.</p>
            </div>
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between"><h3 className="font-black text-slate-900">Recipe names</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{recipeNames.length} recipes</span></div>
              <textarea className={inputClass + " mt-4 min-h-56 resize-y leading-7"} value={names} onChange={(event) => setNames(event.target.value)} placeholder={"Spaghetti Carbonara\nBlueberry Muffins\nEasy Dog Treats With Peanut Butter"} />
              <p className="mt-2 text-xs font-semibold text-slate-500">One recipe per line. Duplicate names are skipped.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-black text-slate-900">Current style</h3>
              <div className="mt-4 aspect-[210/245] rounded-md border-t-8 bg-slate-50 p-5 shadow-inner" style={{ borderColor: settings.brandColor }}>
                <small className="font-black tracking-widest" style={{ color: settings.brandColor }}>RECIPE COLLECTION</small>
                <h4 className="mt-3 font-serif text-2xl font-black" style={{ color: settings.brandColor }}>Your recipe</h4>
                <div className="mt-5 space-y-2">{[1,2,3,4].map((line) => <div key={line} className="h-1.5 rounded bg-slate-200" />)}</div>
                <div className="mt-8 text-xs font-black" style={{ color: settings.brandColor }}>{settings.brandName}</div>
              </div>
              <Button variant="secondary" className="mt-4 w-full" onClick={() => setTab("settings")}><Palette className="h-4 w-4" />Edit brand style</Button>
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-lg bg-slate-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div><div className="font-black">{recipeNames.length ? recipeNames.length + " recipes ready" : "Ready to create"}</div><p className="text-sm text-slate-400">Cards save automatically to this module.</p></div>
            <Button onClick={generateAll} disabled={busy || !recipeNames.length}><Sparkles className="h-4 w-4" />{busy ? "Generating..." : "Generate all recipes"}</Button>
          </div>
          {progress.length ? <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-black text-slate-900">Generation progress</h3><div className="mt-3 divide-y divide-slate-100">{progress.map((item) => <div key={item.title} className="flex items-center justify-between gap-4 py-3"><span className="font-bold text-slate-800">{item.title}</span><span className={"text-xs font-black " + (item.state === "error" ? "text-rose-600" : item.state === "done" ? "text-emerald-600" : "text-slate-500")}>{item.message}</span></div>)}</div></div> : null}
        </div>
      ) : null}

      {tab === "cards" ? (
        <div>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-2xl font-black text-slate-900">Recipe library</h2><p className="text-sm text-slate-500">Select cards to create one combined PDF.</p></div>
            <div className="flex gap-2"><Button variant="danger" onClick={deleteSelected} disabled={!selected.length}><Trash2 className="h-4 w-4" />Delete</Button><Button onClick={exportSelected} disabled={!selected.length}><Download className="h-4 w-4" />Download selected</Button></div>
          </div>
          {recipes.length ? <><label className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-600"><input type="checkbox" checked={selected.length === recipes.length} onChange={(event) => setSelected(event.target.checked ? recipes.map((recipe) => recipe.id) : [])} className="h-4 w-4 accent-violet-600" />Select all <span className="text-slate-400">({selected.length} selected)</span></label><div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">{recipes.map((recipe) => <CardPreview key={recipe.id} recipe={recipe} selected={selectedSet.has(recipe.id)} onSelect={toggleSelected} onPdf={exportOne} />)}</div></> : <EmptyState title="Your cards will appear here">Generate your first recipe cards, then preview and export them from this library.</EmptyState>}
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_.8fr]">
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3"><KeyRound className="h-5 w-5 text-violet-600" /><h3 className="font-black text-slate-900">DeepSeek connection</h3></div>
              <Field label="API key" hint={settings.hasApiKey ? "A key is saved securely. Leave blank to keep it." : "Create a key at platform.deepseek.com."}><input type="password" className={inputClass} value={draft.apiKey || ""} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} placeholder={settings.hasApiKey ? "Saved securely" : "sk-..."} /></Field>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={testConnection} disabled={busy}>Test connection</Button>
                {settings.hasApiKey ? <Button variant="ghost" onClick={removeApiKey} disabled={busy}>Remove saved key</Button> : null}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3"><Palette className="h-5 w-5 text-violet-600" /><h3 className="font-black text-slate-900">Brand and card style</h3></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Brand name"><input className={inputClass} value={draft.brandName || ""} onChange={(event) => setDraft({ ...draft, brandName: event.target.value })} /></Field>
                <Field label="Language"><select className={inputClass} value={draft.language} onChange={(event) => setDraft({ ...draft, language: event.target.value })}>{languages.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Brand color"><input type="color" className={inputClass + " p-1"} value={draft.brandColor} onChange={(event) => setDraft({ ...draft, brandColor: event.target.value })} /></Field>
                <Field label="Accent color"><input type="color" className={inputClass + " p-1"} value={draft.accentColor} onChange={(event) => setDraft({ ...draft, accentColor: event.target.value })} /></Field>
                <Field label="Font"><select className={inputClass} value={draft.font} onChange={(event) => setDraft({ ...draft, font: event.target.value })}>{fonts.map((item) => <option key={item}>{item}</option>)}</select></Field>
                <Field label="Logo"><Button variant="secondary" className="w-full" onClick={chooseLogo}><Upload className="h-4 w-4" />Choose logo</Button></Field>
              </div>
              <Button className="mt-5" onClick={saveSettings}><CheckCircle2 className="h-4 w-4" />Save module settings</Button>
            </div>
          </div>
          <div className="h-max rounded-lg border border-slate-200 bg-white p-6 shadow-panel xl:sticky xl:top-8">
            <div className="text-xs font-black tracking-[0.2em] text-slate-400">LIVE PREVIEW</div>
            <div className="mt-3 aspect-[210/270] border-t-8 bg-gradient-to-br from-white to-slate-50 p-7 shadow-sm" style={{ borderColor: draft.brandColor, fontFamily: draft.font }}>
              <small className="font-black tracking-widest" style={{ color: draft.brandColor }}>RECIPE COLLECTION</small>
              <h3 className="mt-3 font-serif text-3xl font-black" style={{ color: draft.brandColor }}>Lemon Herb Pasta</h3>
              <p className="mt-3 text-xs leading-5 text-slate-500">A bright, weeknight-friendly pasta with fresh herbs and a silky lemon sauce.</p>
              <div className="mt-5 grid grid-cols-3 gap-2 rounded-md p-3 text-center text-[10px] font-bold text-white" style={{ backgroundColor: draft.brandColor }}><span>15 min<small className="block opacity-70">PREP</small></span><span>20 min<small className="block opacity-70">COOK</small></span><span>4<small className="block opacity-70">SERVES</small></span></div>
              <div className="mt-6 grid grid-cols-2 gap-5 text-xs leading-6 text-slate-600"><div><b className="block border-b pb-1 font-serif text-base" style={{ color: draft.brandColor }}>Ingredients</b>Fresh pasta<br />Lemon<br />Parmesan</div><div><b className="block border-b pb-1 font-serif text-base" style={{ color: draft.brandColor }}>Method</b>Cook pasta.<br />Build sauce.<br />Toss and serve.</div></div>
              <div className="mt-8 border-t pt-3 text-xs font-black" style={{ color: draft.brandColor }}>{draft.brandName}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
