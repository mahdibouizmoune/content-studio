import {
  BadgeDollarSign,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FolderOpen,
  Globe2,
  ImagePlus,
  KeyRound,
  Link2,
  ListChecks,
  Layers,
  Plus,
  Save,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Trash2,
  Upload,
  Wand2
} from "lucide-react";
import { useEffect, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import Diagnostics from "@/components/Diagnostics";
import { Button, Field, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";
import { ARTICLE_SIZE_OPTIONS } from "@/lib/articlePostProcess.mjs";
import { DEFAULT_PIN_CUSTOM_STYLES, DEFAULT_PIN_TITLE_DESC_PROMPT } from "@/lib/pinCreatorDefaults";

const textModels = [
  ["gpt5nano", "GPT-5 Nano", "Fastest, lowest default cost"],
  ["gpt5mini", "GPT-5 Mini", "Cheap, stronger long-form quality"],
  ["gpt41mini", "GPT-4.1 Mini", "Reliable low-cost drafting"],
  ["chatgpt", "GPT-5", "Higher quality, higher cost"],
  ["claude", "Claude 4.5 Sonnet", "Strong long-form structure"],
  ["gemini", "Gemini 2.5 Flash", "Balanced speed and price"],
  ["deepseek", "DeepSeek V3", "Budget-friendly drafting"],
  ["qwen3", "Qwen3 Instruct", "Cheap strong instruction following"],
  ["llama4scout", "Llama 4 Scout", "Low-cost long-context drafting"]
];

const imageModels = [
  ["z-image-turbo", "Z-Image Turbo", "~$0.003/image"],
  ["flux-schnell", "Flux Schnell", "Very cheap fast drafts"],
  ["seedream-4.5", "Seedream 4.5", "~$0.03/image"],
  ["qwen-image", "Qwen Image", "Good text and poster-style images"],
  ["flux-pro-2", "Flux 2 Max", "~$0.04/image"],
  ["recraft-v4", "Recraft V4", "~$0.04/image"],
  ["gpt-image-2", "GPT Image 2", "~$0.04/image"],
  ["imagen-4-fast", "Imagen 4 Fast", "~$0.02/image"],
  ["imagen-4-ultra", "Imagen 4 Ultra", "Best quality Imagen option"]
];

const imageRatioOptions = [
  ["1:1", "1:1 Square"],
  ["16:9", "16:9 Landscape"],
  ["1.91:1", "1.91:1 Facebook feed"],
  ["3:2", "3:2 Article landscape"],
  ["4:3", "4:3 Article landscape"],
  ["4:5", "4:5 Social portrait"],
  ["3:4", "3:4 Portrait"],
  ["2:3", "2:3 Pinterest portrait"],
  ["9:16", "9:16 Story portrait"]
];

function ImageRatioSelect({ value, onChange }) {
  return (
    <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
      {imageRatioOptions.map(([ratio, label]) => <option key={ratio} value={ratio}>{label}</option>)}
    </select>
  );
}

const promptEditors = [
  { key: "articlePrompt", title: "Classic Article Prompt", subtitle: "Standard article generation" },
  { key: "listicleDefaultPrompt", title: "Listicle Prompts", subtitle: "Default category listicle generation" },
  { key: "listicleFoodPrompt", title: "Food Listicle Prompt", subtitle: "Recipe and food article generation" },
  { key: "featuredImageInstruction", title: "Featured Image AI Instruction", subtitle: "How AI writes featured-image prompts" },
  { key: "imagePrompt", title: "In-Text Image Prompt", subtitle: "How AI creates article image prompts" },
  { key: "listicleImagePrompt", title: "Listicle In-Text Image Prompt", subtitle: "Per-section image prompts for listicles" }
];

function SettingPanel({ id, open, setOpen, icon: Icon, tone, title, subtitle, badge, children }) {
  const isOpen = open === id;
  return (
    <div className="soft-card overflow-hidden rounded-lg">
      <button type="button" onClick={() => setOpen(isOpen ? "" : id)} className="flex w-full items-center gap-4 px-5 py-5 text-left">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-md text-white ${tone}`}>
          <Icon className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-3">
            <span className="text-xl font-black text-slate-900">{title}</span>
            {badge ? <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-black text-violet-700">{badge}</span> : null}
          </span>
          <span className="mt-1 block text-sm font-medium text-slate-500">{subtitle}</span>
        </span>
        {isOpen ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
      </button>
      {isOpen ? <div className="border-t border-slate-100 px-5 py-5">{children}</div> : null}
    </div>
  );
}

function RadioCards({ value, onChange, items }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map(([id, title, hint]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`rounded-lg border p-4 text-left transition ${
            value === id ? "border-indigo-500 bg-indigo-50 text-indigo-950 ring-4 ring-indigo-100" : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
          }`}
        >
          <div className="font-black">{title}</div>
          <div className="mt-1 text-sm text-slate-500">{hint}</div>
        </button>
      ))}
    </div>
  );
}

export default function Settings({ settings, saveSettings, refreshArticles, initialOpenSection = "general" }) {
  const [draft, setDraft] = useState(settings);
  const [open, setOpen] = useState(initialOpenSection || "general");
  const [status, setStatus] = useState("");
  const [siteStatus, setSiteStatus] = useState({});
  const [siteBusy, setSiteBusy] = useState({});
  const [selectedPromptKey, setSelectedPromptKey] = useState("articlePrompt");
  const [customStylesText, setCustomStylesText] = useState(() => JSON.stringify(settings.pinCreator?.customStyles || {}, null, 2));
  const [boardNamesText, setBoardNamesText] = useState(() => (settings.pinCreator?.boardNames || []).join("\n"));
  const [impactStatus, setImpactStatus] = useState("");
  const [impactBusy, setImpactBusy] = useState("");
  const [impactQuery, setImpactQuery] = useState("");
  const [impactProducts, setImpactProducts] = useState([]);
  const [amazonStatus, setAmazonStatus] = useState("");
  const [amazonBusy, setAmazonBusy] = useState("");
  const [amazonQuery, setAmazonQuery] = useState("");
  const [amazonProducts, setAmazonProducts] = useState([]);
  const [amazonDirectProduct, setAmazonDirectProduct] = useState({
    name: "",
    urlOrAsin: "",
    keywords: ""
  });
  const [analyticsBusy, setAnalyticsBusy] = useState("");
  const [analyticsStatus, setAnalyticsStatus] = useState("");

  useEffect(() => {
    if (initialOpenSection) setOpen(initialOpenSection);
  }, [initialOpenSection]);

  useEffect(() => {
    setCustomStylesText(JSON.stringify(settings.pinCreator?.customStyles || {}, null, 2));
  }, [settings.pinCreator?.customStyles]);

  useEffect(() => {
    setBoardNamesText((settings.pinCreator?.boardNames || []).join("\n"));
  }, [settings.pinCreator?.boardNames]);

  function update(patch) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updatePinCreator(patch) {
    setDraft((current) => ({
      ...current,
      pinCreator: { ...(current.pinCreator || {}), ...patch }
    }));
  }

  async function updatePinCreatorAndSave(patch) {
    const nextDraft = {
      ...draft,
      pinCreator: { ...(draft.pinCreator || {}), ...patch }
    };
    setDraft(nextDraft);
    await saveSettings(nextDraft);
    setStatus("Pin Creator settings saved.");
  }

  function resetPinPromptDefaults() {
    const nextStyles = JSON.stringify(DEFAULT_PIN_CUSTOM_STYLES, null, 2);
    setCustomStylesText(nextStyles);
    updatePinCreator({
      customStyles: DEFAULT_PIN_CUSTOM_STYLES,
      titleDescPrompt: DEFAULT_PIN_TITLE_DESC_PROMPT,
      promptDefaultsVersion: 2
    });
  }

  async function persist() {
    let nextDraft = draft;
    try {
      nextDraft = {
        ...draft,
        pinCreator: {
          ...(draft.pinCreator || {}),
          customStyles: JSON.parse(customStylesText || "{}"),
          boardNames: boardNamesText
            .split(/\r?\n/)
            .map((board) => board.trim())
            .filter(Boolean)
            .filter((board, index, boards) => boards.findIndex((item) => item.toLowerCase() === board.toLowerCase()) === index)
        }
      };
    } catch {
      setStatus("Custom pin styles JSON is not valid. Fix it before saving.");
      return;
    }
    await saveSettings(nextDraft);
    setDraft(nextDraft);
    setStatus("Settings saved.");
  }

  function updateSite(index, patch) {
    const wordpressSites = [...(draft.wordpressSites || [])];
    wordpressSites[index] = { ...wordpressSites[index], ...patch };
    update({ wordpressSites });
  }

  function updateBrandVoice(index, patch) {
    const brandVoices = [...(draft.brandVoices || [])];
    brandVoices[index] = { ...brandVoices[index], ...patch };
    update({ brandVoices });
  }

  function updatePreset(index, patch) {
    const projectPresets = [...(draft.projectPresets || [])];
    projectPresets[index] = { ...projectPresets[index], ...patch };
    update({ projectPresets });
  }

  function updateAffiliateLink(index, patch) {
    const affiliateLinks = [...(draft.affiliateLinks || [])];
    affiliateLinks[index] = {
      ...affiliateLinks[index],
      ...patch,
      ...(Object.prototype.hasOwnProperty.call(patch, "url") ? {
        trackingVerified: false,
        trackingPartnerId: "",
        trackingSource: "manually_edited"
      } : {})
    };
    update({ affiliateLinks });
  }

  async function testImpact() {
    setImpactBusy("test");
    setImpactStatus("Testing Impact connection...");
    try {
      const result = await electronAPI.testImpactConnection({
        accountSid: draft.impactAccountSid,
        authToken: draft.impactAuthToken
      });
      setImpactStatus(result.success
        ? `Connected to ${result.companyName || "Impact"}.`
        : result.error || "Impact connection failed.");
    } catch (error) {
      setImpactStatus(error.message || "Impact connection failed.");
    } finally {
      setImpactBusy("");
    }
  }

  async function searchImpact() {
    if (impactQuery.trim().length < 2) {
      setImpactStatus("Enter at least two characters to search.");
      return;
    }
    setImpactBusy("search");
    setImpactStatus("Searching approved Impact products...");
    try {
      const result = await electronAPI.searchImpactProducts({
        accountSid: draft.impactAccountSid,
        authToken: draft.impactAuthToken,
        keyword: impactQuery
      });
      setImpactProducts(result.products || []);
      setImpactStatus(result.success
        ? `${(result.products || []).length} matching products found.`
        : result.error || "Impact product search failed.");
    } catch (error) {
      setImpactProducts([]);
      setImpactStatus(error.message || "Impact product search failed.");
    } finally {
      setImpactBusy("");
    }
  }

  async function importImpactProduct(product) {
    setImpactBusy(`import-${product.id}`);
    setImpactStatus(`Creating a tracking link for ${product.name}...`);
    try {
      const result = await electronAPI.createImpactAffiliateLink({
        accountSid: draft.impactAccountSid,
        authToken: draft.impactAuthToken,
        mediaPropertyId: draft.impactMediaPropertyId,
        product
      });
      if (!result.success) {
        setImpactStatus(result.error || "Impact tracking link creation failed.");
        return;
      }
      setDraft((current) => {
        const existing = current.affiliateLinks || [];
        const duplicateIndex = existing.findIndex((item) =>
          (result.affiliate.id && item.id === result.affiliate.id) ||
          (result.affiliate.url && item.url === result.affiliate.url)
        );
        const affiliateLinks = [...existing];
        if (duplicateIndex >= 0) affiliateLinks[duplicateIndex] = result.affiliate;
        else affiliateLinks.push(result.affiliate);
        return { ...current, affiliateLinks };
      });
      setImpactStatus(`${product.name} added. Save Settings to keep it.`);
    } catch (error) {
      setImpactStatus(error.message || "Impact tracking link creation failed.");
    } finally {
      setImpactBusy("");
    }
  }

  function amazonParams(extra = {}) {
    return {
      partnerTag: draft.amazonPartnerTag,
      marketplace: draft.amazonMarketplace,
      credentialId: draft.amazonCredentialId,
      credentialSecret: draft.amazonCredentialSecret,
      credentialVersion: draft.amazonCredentialVersion,
      ...extra
    };
  }

  async function testAmazon() {
    setAmazonBusy("test");
    setAmazonStatus("Testing Amazon Associates...");
    try {
      const result = await electronAPI.testAmazonConnection(amazonParams());
      setAmazonStatus(result.success
        ? result.message || `Amazon Associates ${result.mode || "tracking"} is ready.`
        : result.error || "Amazon Associates connection failed.");
    } catch (error) {
      setAmazonStatus(error.message || "Amazon Associates connection failed.");
    } finally {
      setAmazonBusy("");
    }
  }

  async function searchAmazon() {
    if (amazonQuery.trim().length < 2) {
      setAmazonStatus("Enter at least two characters to search.");
      return;
    }
    setAmazonBusy("search");
    setAmazonStatus("Searching Amazon Creators API...");
    try {
      const result = await electronAPI.searchAmazonProducts(amazonParams({ keyword: amazonQuery }));
      setAmazonProducts(result.products || []);
      setAmazonStatus(result.success
        ? `${(result.products || []).length} matching Amazon products found.`
        : result.error || "Amazon product search failed.");
    } catch (error) {
      setAmazonProducts([]);
      setAmazonStatus(error.message || "Amazon product search failed.");
    } finally {
      setAmazonBusy("");
    }
  }

  async function importAmazonProduct(product) {
    setAmazonBusy(`import-${product.id}`);
    setAmazonStatus(`Adding the tagged Amazon link for ${product.name}...`);
    try {
      const result = await electronAPI.createAmazonAffiliateLink(amazonParams({ product }));
      if (!result.success) {
        setAmazonStatus(result.error || "Amazon link creation failed.");
        return;
      }
      setDraft((current) => {
        const existing = current.affiliateLinks || [];
        const duplicateIndex = existing.findIndex((item) =>
          (result.affiliate.id && item.id === result.affiliate.id)
          || (result.affiliate.url && item.url === result.affiliate.url)
        );
        const affiliateLinks = [...existing];
        if (duplicateIndex >= 0) affiliateLinks[duplicateIndex] = result.affiliate;
        else affiliateLinks.push(result.affiliate);
        return { ...current, affiliateLinks };
      });
      setAmazonStatus(`${product.name} added. Save Settings to keep it.`);
    } catch (error) {
      setAmazonStatus(error.message || "Amazon link creation failed.");
    } finally {
      setAmazonBusy("");
    }
  }

  async function importDirectAmazonProduct() {
    setAmazonBusy("direct");
    setAmazonStatus("Creating an exact tagged Amazon product link...");
    try {
      const result = await electronAPI.createAmazonAffiliateLink(amazonParams({
        manualProduct: amazonDirectProduct
      }));
      if (!result.success) {
        setAmazonStatus(result.error || "Amazon product link creation failed.");
        return;
      }
      setDraft((current) => {
        const existing = current.affiliateLinks || [];
        const duplicateIndex = existing.findIndex((item) =>
          (result.affiliate.amazonAsin && item.amazonAsin === result.affiliate.amazonAsin)
          || (result.affiliate.url && item.url === result.affiliate.url)
        );
        const affiliateLinks = [...existing];
        if (duplicateIndex >= 0) affiliateLinks[duplicateIndex] = result.affiliate;
        else affiliateLinks.push(result.affiliate);
        return { ...current, affiliateLinks };
      });
      setAmazonDirectProduct({ name: "", urlOrAsin: "", keywords: "" });
      setAmazonStatus(`${result.affiliate.name} added as an exact product. Save Settings to keep it.`);
    } catch (error) {
      setAmazonStatus(error.message || "Amazon product link creation failed.");
    } finally {
      setAmazonBusy("");
    }
  }

  function siteKey(site, index) {
    return site.id || site.url || String(index);
  }

  async function testSite(site, index) {
    const key = siteKey(site, index);
    setStatus("");
    setSiteBusy((current) => ({ ...current, [key]: "test" }));
    setSiteStatus((current) => ({ ...current, [key]: { type: "info", text: `Testing ${site.name || site.url || "WordPress site"}...` } }));
    try {
      const result = await electronAPI.testWordPressConnection({
        wordpressUrl: site.url,
        wordpressUsername: site.username,
        wordpressApiKey: site.apiKey
      });
      if (result.success) {
        const warning = result.warning ? ` ${result.warning}` : "";
        setSiteStatus((current) => ({ ...current, [key]: { type: result.warning ? "info" : "success", text: `Connected as ${result.user || "WordPress user"}.${warning}` } }));
      } else {
        setSiteStatus((current) => ({ ...current, [key]: { type: "error", text: result.error || "Connection test failed." } }));
      }
    } catch (error) {
      const message = String(error.message || "Connection test failed.").replace(/^Error invoking remote method 'test-wordpress-connection': Error:\s*/i, "");
      setSiteStatus((current) => ({ ...current, [key]: { type: "error", text: message } }));
    } finally {
      setSiteBusy((current) => ({ ...current, [key]: "" }));
    }
  }

  async function syncCategories(site, index) {
    const key = siteKey(site, index);
    setStatus("");
    setSiteBusy((current) => ({ ...current, [key]: "categories" }));
    setSiteStatus((current) => ({ ...current, [key]: { type: "info", text: `Syncing categories for ${site.name || site.url || "WordPress site"}...` } }));
    try {
      const result = await electronAPI.syncWordPressCategories({
        wordpressUrl: site.url,
        wordpressUsername: site.username,
        wordpressApiKey: site.apiKey
      });
      const wordpressSites = [...(draft.wordpressSites || [])];
      wordpressSites[index] = { ...wordpressSites[index], categories: result.categories || [], categoriesSyncedAt: new Date().toISOString() };
      const nextDraft = { ...draft, wordpressSites };
      setDraft(nextDraft);
      await saveSettings(nextDraft);
      const warning = result.warning ? ` ${result.warning}` : "";
      setSiteStatus((current) => ({ ...current, [key]: { type: "success", text: `Synced ${result.categories?.length || 0} categories.${warning}` } }));
    } catch (error) {
      setSiteStatus((current) => ({ ...current, [key]: { type: "error", text: error.message || "Category sync failed." } }));
    } finally {
      setSiteBusy((current) => ({ ...current, [key]: "" }));
    }
  }

  async function syncPosts(site, index) {
    const key = siteKey(site, index);
    setStatus("");
    setSiteBusy((current) => ({ ...current, [key]: "posts" }));
    setSiteStatus((current) => ({ ...current, [key]: { type: "info", text: `Syncing internal link posts for ${site.name || site.url || "WordPress site"}...` } }));
    try {
      const result = await electronAPI.syncWordPressPosts({
        wordpressUrl: site.url,
        wordpressUsername: site.username,
        wordpressApiKey: site.apiKey,
        categories: site.categories || [],
        maxPosts: draft.internalLinkMaxPosts || 500
      });
      const wordpressSites = [...(draft.wordpressSites || [])];
      wordpressSites[index] = { ...wordpressSites[index], internalLinkPosts: result.posts || [], internalLinksSyncedAt: new Date().toISOString() };
      const nextDraft = { ...draft, wordpressSites };
      setDraft(nextDraft);
      await saveSettings(nextDraft);
      setSiteStatus((current) => ({ ...current, [key]: { type: "success", text: `Synced ${result.posts?.length || 0} posts for internal linking.` } }));
    } catch (error) {
      setSiteStatus((current) => ({ ...current, [key]: { type: "error", text: error.message || "Post sync failed." } }));
    } finally {
      setSiteBusy((current) => ({ ...current, [key]: "" }));
    }
  }

  async function chooseWatermark() {
    const path = await electronAPI.selectWatermarkImage();
    if (path) update({ watermarkPath: path });
  }

  async function exportArticles() {
    const result = await electronAPI.exportArticles();
    if (result?.success) setStatus(`Exported ${result.count} articles.`);
  }

  async function importArticles() {
    if (!window.confirm("Importing replaces the current saved article list. Continue?")) return;
    const result = await electronAPI.importArticles();
    if (result?.success) {
      setStatus(`Imported ${result.count} articles.`);
      await refreshArticles();
    }
  }

  async function createRecoveryBackup() {
    const result = await electronAPI.createWorkspaceBackup?.();
    setStatus(result?.success ? "Recovery backup created." : result?.error || "Could not create recovery backup.");
  }

  async function connectSearchConsole() {
    setAnalyticsBusy("google");
    setAnalyticsStatus("Saving credentials and opening Google...");
    try {
      await saveSettings(draft);
      const result = await electronAPI.connectGoogleSearchConsole();
      if (!result?.success) {
        setAnalyticsStatus(result?.error || "Google Search Console connection failed.");
        return;
      }
      const connected = await electronAPI.getSettings();
      setDraft(connected);
      await saveSettings(connected);
      setAnalyticsStatus(`Search Console connected. ${result.sites?.length || 0} properties found.`);
    } catch (error) {
      setAnalyticsStatus(error.message || "Google Search Console connection failed.");
    } finally {
      setAnalyticsBusy("");
    }
  }

  async function disconnectSearchConsole() {
    setAnalyticsBusy("google");
    try {
      await electronAPI.disconnectGoogleSearchConsole();
      const next = await electronAPI.getSettings();
      setDraft(next);
      await saveSettings(next);
      setAnalyticsStatus("Search Console disconnected.");
    } catch (error) {
      setAnalyticsStatus(error.message || "Could not disconnect Search Console.");
    } finally {
      setAnalyticsBusy("");
    }
  }

  async function testPinterestAnalytics() {
    setAnalyticsBusy("pinterest");
    setAnalyticsStatus("Testing Pinterest analytics...");
    try {
      await saveSettings(draft);
      const result = await electronAPI.testPinterestAnalytics();
      setAnalyticsStatus(result?.success
        ? `Pinterest connected. ${Number(result.summary?.impressions || 0).toLocaleString()} impressions found in the last 7 days.`
        : result?.error || "Pinterest analytics connection failed.");
    } catch (error) {
      setAnalyticsStatus(error.message || "Pinterest analytics connection failed.");
    } finally {
      setAnalyticsBusy("");
    }
  }

  return (
    <section className="animate-fade-in">
      <SectionHeader
        eyebrow="Settings"
        title="Settings"
        action={<Button onClick={persist}><Save className="h-4 w-4" />Save Settings</Button>}
      >
        Configure generation, affiliate opportunities, publishing, connected services, and backups.
      </SectionHeader>

      <div className="mx-auto max-w-6xl space-y-4">
        <SettingPanel id="general" open={open} setOpen={setOpen} icon={SettingsIcon} tone="bg-slate-700" title="General Settings" subtitle="Titles, behavior, article size" >
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Article size" hint="Applied to new and pending articles. Short sizes use concise recipe ideas for large roundups; collection sizes include complete recipes for every item.">
              <select className={inputClass} value={draft.articleLength || "900-1200"} onChange={(event) => update({ articleLength: event.target.value })}>
                {ARTICLE_SIZE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} - {option.detail}</option>)}
              </select>
            </Field>
            <Field label="Delay between calls (ms)" hint="250 ms is the fast, rate-limit-safe default. This only affects multi-image prompt batches.">
              <input type="number" min="0" step="50" className={inputClass} value={draft.interPredictionDelayMs || 0} onChange={(event) => update({ interPredictionDelayMs: Math.max(0, Number(event.target.value)) })} />
            </Field>
            <Field label="Publish status">
              <select className={inputClass} value={draft.publishStatus || "publish"} onChange={(event) => update({ publishStatus: event.target.value })}>
                <option value="draft">Draft</option>
                <option value="publish">Publish</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 font-bold text-slate-800 ring-1 ring-slate-100">
              <span><span className="block">Keep Original Titles</span><span className="text-sm font-medium text-slate-500">Skip viral title rewrite</span></span>
              <input type="checkbox" className="h-5 w-5" checked={!!draft.keepOriginalTitles} onChange={(event) => update({ keepOriginalTitles: event.target.checked })} />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 font-bold text-slate-800 ring-1 ring-slate-100">
              <span><span className="block">In-Text Images</span><span className="text-sm font-medium text-slate-500">Generate section images</span></span>
              <input type="checkbox" className="h-5 w-5" checked={!!draft.enableIntextImages} onChange={(event) => update({ enableIntextImages: event.target.checked })} />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 font-bold text-slate-800 ring-1 ring-slate-100">
              <span><span className="block">Recipe Card</span><span className="text-sm font-medium text-slate-500">End card for recipe posts</span></span>
              <input type="checkbox" className="h-5 w-5" checked={!!draft.recipeCardEnabled} onChange={(event) => update({ recipeCardEnabled: event.target.checked })} />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 font-bold text-slate-800 ring-1 ring-slate-100">
              <span><span className="block">Editorial Quality Pass</span><span className="text-sm font-medium text-slate-500">Consistency and usefulness review</span></span>
              <input type="checkbox" className="h-5 w-5" checked={draft.smartQualityPass !== false} onChange={(event) => update({ smartQualityPass: event.target.checked })} />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 font-bold text-slate-800 ring-1 ring-slate-100">
              <span><span className="block">Approve Outlines</span><span className="text-sm font-medium text-slate-500">Review before full generation</span></span>
              <input type="checkbox" className="h-5 w-5" checked={draft.requireOutlineApproval === true} onChange={(event) => update({ requireOutlineApproval: event.target.checked })} />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 font-bold text-slate-800 ring-1 ring-slate-100">
              <span><span className="block">Reader Retention</span><span className="text-sm font-medium text-slate-500">One useful save note before the recipe card</span></span>
              <input type="checkbox" className="h-5 w-5" checked={draft.readerRetentionEnabled !== false} onChange={(event) => update({ readerRetentionEnabled: event.target.checked })} />
            </label>
          </div>
          {draft.readerRetentionEnabled !== false ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Save-recipe note" hint="A short, practical reminder near the end. It is plain HTML and adds no scripts or page-weight risk.">
                <textarea className={`${inputClass} min-h-24 resize-y`} value={draft.saveRecipeCtaText || ""} onChange={(event) => update({ saveRecipeCtaText: event.target.value })} />
              </Field>
              <div className="space-y-3">
                <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-3 font-bold text-slate-800 ring-1 ring-slate-100">
                  <span><span className="block">Newsletter Link</span><span className="text-sm font-medium text-slate-500">Optional, off by default</span></span>
                  <input type="checkbox" className="h-5 w-5" checked={draft.newsletterCtaEnabled === true} onChange={(event) => update({ newsletterCtaEnabled: event.target.checked })} />
                </label>
                <Field label="Newsletter URL">
                  <input type="url" className={inputClass} value={draft.newsletterCtaUrl || ""} onChange={(event) => update({ newsletterCtaUrl: event.target.value })} placeholder="https://your-site.com/newsletter/" />
                </Field>
                <Field label="Newsletter link text">
                  <input className={inputClass} value={draft.newsletterCtaText || ""} onChange={(event) => update({ newsletterCtaText: event.target.value })} />
                </Field>
              </div>
            </div>
          ) : null}
        </SettingPanel>

        <SettingPanel id="api" open={open} setOpen={setOpen} icon={KeyRound} tone="icon-gradient-purple" title="API Configuration" subtitle="Replicate token and text model" badge={draft.replicateApiToken ? "connected" : ""}>
          <div className="space-y-5">
            <Field label="Replicate API Token" hint="Stored encrypted by the Electron main process.">
              <input type="password" className={inputClass} value={draft.replicateApiToken || ""} onChange={(event) => update({ replicateApiToken: event.target.value })} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="GoHighLevel API Token" hint="Sub-account Private Integration token with socialplanner/post.write and socialplanner/post.readonly. Stored encrypted.">
                <input type="password" className={inputClass} value={draft.ghlApiToken || ""} onChange={(event) => update({ ghlApiToken: event.target.value })} />
              </Field>
              <Field label="GoHighLevel Location ID" hint="Required for direct Social Planner CSV upload.">
                <input className={inputClass} value={draft.ghlLocationId || ""} onChange={(event) => update({ ghlLocationId: event.target.value })} placeholder="Sub-account location ID" />
              </Field>
              <Field label="GoHighLevel Social Account IDs" hint="Comma or line separated IDs from Social Planner connected accounts. Use Facebook and Instagram account IDs here.">
                <textarea className={`${inputClass} min-h-24 resize-y`} value={draft.ghlSocialAccountIds || ""} onChange={(event) => update({ ghlSocialAccountIds: event.target.value })} placeholder="account_id_1, account_id_2" />
              </Field>
              <Field label="Instagram Account IDs" hint="Optional but recommended for dedicated Instagram captions. Comma or line separated.">
                <textarea className={`${inputClass} min-h-24 resize-y`} value={draft.ghlInstagramAccountIds || ""} onChange={(event) => update({ ghlInstagramAccountIds: event.target.value })} placeholder="instagram_account_id" />
              </Field>
              <Field label="Facebook Account IDs" hint="Optional but recommended for dedicated Facebook captions. Comma or line separated.">
                <textarea className={`${inputClass} min-h-24 resize-y`} value={draft.ghlFacebookAccountIds || ""} onChange={(event) => update({ ghlFacebookAccountIds: event.target.value })} placeholder="facebook_account_id" />
              </Field>
              <Field label="GoHighLevel User ID" hint="Required by Social Planner create post API as the creator/user ID.">
                <input className={inputClass} value={draft.ghlUserId || ""} onChange={(event) => update({ ghlUserId: event.target.value })} placeholder="GHL user ID" />
              </Field>
            </div>
            <div>
              <div className="mb-2 text-sm font-black text-slate-700">AI Content Generation Model</div>
              <RadioCards value={draft.aiModel} onChange={(aiModel) => update({ aiModel })} items={textModels} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Batch budget warning" hint="Ask before starting when the approximate batch cost exceeds this amount.">
                <input type="number" min="0" step="0.25" className={inputClass} value={draft.costBudgetWarning ?? 1} onChange={(event) => update({ costBudgetWarning: Math.max(0, Number(event.target.value || 0)) })} />
              </Field>
              <Field label="Strict spending limit" hint="Generation is blocked when the estimate exceeds this amount.">
                <input type="number" min="0.01" step="0.25" className={inputClass} value={draft.strictSpendingLimit ?? 5} onChange={(event) => update({ strictSpendingLimit: Math.max(0.01, Number(event.target.value || 0.01)) })} />
              </Field>
              <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 font-bold text-slate-800 ring-1 ring-slate-100">
                <span><span className="block">Strict Limit</span><span className="text-sm font-medium text-slate-500">Block batches above the limit</span></span>
                <input type="checkbox" className="h-5 w-5" checked={draft.strictSpendingLimitEnabled === true} onChange={(event) => update({ strictSpendingLimitEnabled: event.target.checked })} />
              </label>
            </div>
          </div>
        </SettingPanel>

        <SettingPanel
          id="analytics"
          open={open}
          setOpen={setOpen}
          icon={BarChart3}
          tone="icon-gradient-blue"
          title="Performance Connections"
          subtitle="Search Console and Pinterest analytics"
          badge={draft.googleSearchConsoleConnected || draft.pinterestAnalyticsAccessToken ? "connected" : ""}
        >
          <div className="space-y-6">
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-black text-slate-900">Google Search Console</div>
                  <div className="mt-1 text-sm font-medium text-slate-500">Use a Google Desktop OAuth client with Search Console API enabled.</div>
                </div>
                {draft.googleSearchConsoleConnected ? <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">Connected</span> : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Google Desktop OAuth Client ID">
                  <input className={inputClass} value={draft.googleClientId || ""} onChange={(event) => update({ googleClientId: event.target.value })} placeholder="...apps.googleusercontent.com" />
                </Field>
                <Field label="Google Desktop OAuth Client Secret" hint="Stored encrypted.">
                  <input type="password" className={inputClass} value={draft.googleClientSecret || ""} onChange={(event) => update({ googleClientSecret: event.target.value })} />
                </Field>
                <Field label="Search Console property">
                  <select className={inputClass} value={draft.googleSearchConsoleProperty || ""} onChange={(event) => update({ googleSearchConsoleProperty: event.target.value })}>
                    <option value="">Select after connecting</option>
                    {(draft.googleSearchConsoleSites || []).map((site) => <option key={site.siteUrl} value={site.siteUrl}>{site.siteUrl}</option>)}
                  </select>
                </Field>
                <div className="flex items-end gap-2">
                  <Button onClick={connectSearchConsole} disabled={!!analyticsBusy}>
                    <Link2 className="h-4 w-4" />{analyticsBusy === "google" ? "Connecting..." : draft.googleSearchConsoleConnected ? "Reconnect Google" : "Connect Google"}
                  </Button>
                  {draft.googleSearchConsoleConnected ? <Button variant="secondary" onClick={disconnectSearchConsole} disabled={!!analyticsBusy}>Disconnect</Button> : null}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <div className="mb-3 font-black text-slate-900">Pinterest Analytics</div>
              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <Field label="Pinterest access token" hint="Requires Pinterest analytics access. Stored encrypted.">
                  <input type="password" className={inputClass} value={draft.pinterestAnalyticsAccessToken || ""} onChange={(event) => update({ pinterestAnalyticsAccessToken: event.target.value })} />
                </Field>
                <div className="flex items-end">
                  <Button variant="secondary" onClick={testPinterestAnalytics} disabled={!!analyticsBusy}>
                    <TestTube2 className="h-4 w-4" />{analyticsBusy === "pinterest" ? "Testing..." : "Test Pinterest"}
                  </Button>
                </div>
              </div>
            </div>
            {analyticsStatus ? <div className="rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{analyticsStatus}</div> : null}
          </div>
        </SettingPanel>

        <SettingPanel id="pinCreator" open={open} setOpen={setOpen} icon={ImagePlus} tone="icon-gradient-purple" title="Pin Creator" subtitle="Pinterest pins, ImgBB hosting, queue handoff">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="ImgBB API Key" hint="Optional. Used to host generated pins permanently.">
                <input type="password" className={inputClass} value={draft.pinCreator?.imgbbApiKey || ""} onChange={(event) => updatePinCreator({ imgbbApiKey: event.target.value })} />
              </Field>
              <Field label="Pin Creator AI Model">
                <select className={inputClass} value={draft.pinCreator?.aiModel || "auto"} onChange={(event) => updatePinCreator({ aiModel: event.target.value })}>
                  <option value="auto">Auto fallback</option>
                  <option value="chatgpt">ChatGPT</option>
                  <option value="deepseek">DeepSeek</option>
                </select>
              </Field>
              <Field label="Post interval">
                <select className={inputClass} value={draft.pinCreator?.postInterval || 120} onChange={(event) => updatePinCreatorAndSave({ postInterval: Number(event.target.value) })}>
                  <option value={30}>Every 30 minutes</option>
                  <option value={60}>Every hour</option>
                  <option value={120}>Every 2 hours</option>
                  <option value={240}>Every 4 hours</option>
                </select>
              </Field>
              <Field label="Pins per day">
                <input type="number" min="1" max="100" className={inputClass} value={draft.pinCreator?.pinsPerDay || 15} onChange={(event) => updatePinCreatorAndSave({ pinsPerDay: Number(event.target.value) })} />
              </Field>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 font-bold text-slate-800 ring-1 ring-slate-100">
              <span><span className="block">Auto Queue on Publish</span><span className="text-sm font-medium text-slate-500">Add new WordPress post URLs to Pin Creator after publishing</span></span>
              <input type="checkbox" className="h-5 w-5" checked={draft.pinCreator?.autoQueueOnPublish !== false} onChange={(event) => updatePinCreator({ autoQueueOnPublish: event.target.checked })} />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 font-bold text-slate-800 ring-1 ring-slate-100">
              <span><span className="block">Auto Board Matching</span><span className="text-sm font-medium text-slate-500">Fill the Pinterest Board CSV field from pin title, description, URL, and keywords</span></span>
              <input type="checkbox" className="h-5 w-5" checked={draft.pinCreator?.autoBoardMatching !== false} onChange={(event) => updatePinCreator({ autoBoardMatching: event.target.checked })} />
            </label>
            <Field label="Pinterest board names" hint="One board per line. Duplicates are removed when you save. CSV exports use the closest matching board.">
              <textarea
                className={`${inputClass} min-h-44 resize-y text-sm leading-6`}
                value={boardNamesText}
                onChange={(event) => setBoardNamesText(event.target.value)}
              />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-slate-700">Recipe pin prompts</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">Preloaded styles for recipe-card pins, ingredient closeups, weeknight meals, and listicle collages.</div>
              </div>
              <Button variant="secondary" onClick={resetPinPromptDefaults}>Restore Defaults</Button>
            </div>
            <Field label="Custom pin styles JSON" hint="Optional advanced editor. Each style ID contains a name and prompt, and appears in the Pin Creator style dropdown.">
              <textarea
                className={`${inputClass} min-h-44 resize-y font-mono text-xs leading-5`}
                value={customStylesText}
                onChange={(event) => setCustomStylesText(event.target.value)}
              />
            </Field>
            <Field label="Custom title and description prompt" hint="Uses ${url} and ${interestsNote}. Tuned for recipe-blog Pinterest SEO titles and descriptions.">
              <textarea className={`${inputClass} min-h-36 resize-y font-mono text-xs leading-5`} value={draft.pinCreator?.titleDescPrompt || ""} onChange={(event) => updatePinCreator({ titleDescPrompt: event.target.value })} />
            </Field>
          </div>
        </SettingPanel>

        <SettingPanel id="voice" open={open} setOpen={setOpen} icon={Sparkles} tone="icon-gradient-purple" title="Brand Voice Profiles" subtitle="Reusable tone, style, and rules" badge={`${(draft.brandVoices || []).length} voices`}>
          <div className="space-y-4">
            {(draft.brandVoices || []).map((voice, index) => (
              <div key={voice.id || index} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="grid gap-3 md:grid-cols-[0.45fr_1fr]">
                  <Field label="Voice name">
                    <input className={inputClass} value={voice.name || ""} onChange={(event) => updateBrandVoice(index, { name: event.target.value })} placeholder="Friendly food blogger" />
                  </Field>
                  <Field label="Voice instructions">
                    <textarea className={`${inputClass} min-h-28 resize-y`} value={voice.content || ""} onChange={(event) => updateBrandVoice(index, { content: event.target.value })} placeholder="Tone, forbidden phrases, formatting habits, audience, examples..." />
                  </Field>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button variant="danger" onClick={() => update({ brandVoices: draft.brandVoices.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" />Remove</Button>
                </div>
              </div>
            ))}
            <Button variant="secondary" onClick={() => update({ brandVoices: [...(draft.brandVoices || []), { id: String(Date.now()), name: "New Voice", content: "" }] })}><Plus className="h-4 w-4" />Add Brand Voice</Button>
          </div>
        </SettingPanel>

        <SettingPanel id="presets" open={open} setOpen={setOpen} icon={Layers} tone="icon-gradient-blue" title="Project Presets" subtitle="Saved defaults per site or content type" badge={`${(draft.projectPresets || []).length} presets`}>
          <div className="space-y-4">
            {(draft.projectPresets || []).map((preset, index) => (
              <div key={preset.id || index} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Preset name"><input className={inputClass} value={preset.name || ""} onChange={(event) => updatePreset(index, { name: event.target.value })} /></Field>
                  <Field label="Article size">
                    <select className={inputClass} value={preset.articleLength || draft.articleLength || "900-1200"} onChange={(event) => updatePreset(index, { articleLength: event.target.value })}>
                      {ARTICLE_SIZE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} - {option.detail}</option>)}
                    </select>
                  </Field>
                  <Field label="Brand voice">
                    <select className={inputClass} value={preset.brandVoiceId || ""} onChange={(event) => updatePreset(index, { brandVoiceId: event.target.value })}>
                      <option value="">None</option>
                      {(draft.brandVoices || []).map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Default audience"><input className={inputClass} value={preset.audience || ""} onChange={(event) => updatePreset(index, { audience: event.target.value })} /></Field>
                  <Field label="Search intent">
                    <select className={inputClass} value={preset.searchIntent || "informational"} onChange={(event) => updatePreset(index, { searchIntent: event.target.value })}>
                      <option value="informational">Informational</option>
                      <option value="commercial">Commercial</option>
                      <option value="transactional">Transactional</option>
                      <option value="navigational">Navigational</option>
                    </select>
                  </Field>
                  <Field label="Default secondary keywords"><input className={inputClass} value={preset.secondaryKeywords || ""} onChange={(event) => updatePreset(index, { secondaryKeywords: event.target.value })} /></Field>
                  <Field label="WordPress site">
                    <select className={inputClass} value={preset.wordpressSiteId || ""} onChange={(event) => updatePreset(index, { wordpressSiteId: event.target.value })}>
                      <option value="">None</option>
                      {(draft.wordpressSites || []).map((site) => <option key={site.id || site.url} value={site.id || site.url}>{site.name || site.url}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="Default competitor notes / traffic angle">
                    <textarea className={`${inputClass} min-h-24 resize-y`} value={preset.competitorNotes || ""} onChange={(event) => updatePreset(index, { competitorNotes: event.target.value })} />
                  </Field>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-100"><input type="checkbox" checked={!!preset.recipeCardEnabled} onChange={(event) => updatePreset(index, { recipeCardEnabled: event.target.checked })} />Recipe card</label>
                  <label className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-100"><input type="checkbox" checked={preset.requireOutlineApproval === true} onChange={(event) => updatePreset(index, { requireOutlineApproval: event.target.checked })} />Approve outline first</label>
                  <div className="flex justify-end"><Button variant="danger" onClick={() => update({ projectPresets: draft.projectPresets.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" />Remove</Button></div>
                </div>
              </div>
            ))}
            <Button variant="secondary" onClick={() => update({ projectPresets: [...(draft.projectPresets || []), { id: String(Date.now()), name: "New Preset", searchIntent: "informational", requireOutlineApproval: false }] })}><Plus className="h-4 w-4" />Add Project Preset</Button>
          </div>
        </SettingPanel>

        <SettingPanel id="image" open={open} setOpen={setOpen} icon={ImagePlus} tone="icon-gradient-pink" title="Image Generation" subtitle="Models, counts, watermarking">
          <div className="space-y-5">
            <RadioCards value={draft.imageModel} onChange={(imageModel) => update({ imageModel })} items={imageModels} />
            <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 font-bold text-slate-800 ring-1 ring-slate-100">
              <span><span className="block">Image SEO Pro Mode</span><span className="text-sm font-medium text-slate-500">Generate SEO alt text, WebP filenames, and publish-ready image metadata</span></span>
              <input type="checkbox" className="h-5 w-5" checked={draft.imageSeoProMode !== false} onChange={(event) => update({ imageSeoProMode: event.target.checked })} />
            </label>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="In-text image count">
                <input type="number" min="0" max="12" className={inputClass} value={draft.intextImageCount ?? 1} onChange={(event) => update({ intextImageCount: Number(event.target.value) })} />
              </Field>
              <Field label={`Watermark size: ${draft.watermarkSize || 15}%`}>
                <input type="range" min="5" max="40" value={draft.watermarkSize || 15} onChange={(event) => update({ watermarkSize: Number(event.target.value) })} className="w-full" />
              </Field>
              <Field label={`Watermark opacity: ${draft.watermarkOpacity || 80}%`}>
                <input type="range" min="10" max="100" value={draft.watermarkOpacity || 80} onChange={(event) => update({ watermarkOpacity: Number(event.target.value) })} className="w-full" />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Featured article image"><ImageRatioSelect value={draft.featuredImageRatio || "3:2"} onChange={(featuredImageRatio) => update({ featuredImageRatio })} /></Field>
              <Field label="In-text article image"><ImageRatioSelect value={draft.intextImageRatio || "4:3"} onChange={(intextImageRatio) => update({ intextImageRatio })} /></Field>
              <Field label="Pinterest pin"><ImageRatioSelect value={draft.pinterestPinRatio || "2:3"} onChange={(pinterestPinRatio) => update({ pinterestPinRatio })} /></Field>
              <Field label="Instagram portrait"><ImageRatioSelect value={draft.instagramPortraitRatio || "4:5"} onChange={(instagramPortraitRatio) => update({ instagramPortraitRatio })} /></Field>
              <Field label="Instagram Story or Reel"><ImageRatioSelect value={draft.instagramStoryRatio || "9:16"} onChange={(instagramStoryRatio) => update({ instagramStoryRatio })} /></Field>
              <Field label="Facebook feed"><ImageRatioSelect value={draft.facebookFeedRatio || "1.91:1"} onChange={(facebookFeedRatio) => update({ facebookFeedRatio })} /></Field>
              <Field label="Square social image"><ImageRatioSelect value={draft.squareSocialRatio || "1:1"} onChange={(squareSocialRatio) => update({ squareSocialRatio })} /></Field>
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <Field label="Watermark file">
                <input className={inputClass} value={draft.watermarkPath || ""} onChange={(event) => update({ watermarkPath: event.target.value })} placeholder="No watermark selected" />
              </Field>
              <div className="flex items-end gap-2">
                <Button variant="secondary" onClick={chooseWatermark}><FolderOpen className="h-4 w-4" />Choose</Button>
                <label className="flex min-h-11 items-center gap-2 rounded-md bg-slate-50 px-3 text-sm font-black text-slate-700 ring-1 ring-slate-100">
                  <input type="checkbox" checked={!!draft.watermarkEnabled} onChange={(event) => update({ watermarkEnabled: event.target.checked })} /> Enabled
                </label>
              </div>
            </div>
          </div>
        </SettingPanel>

        <SettingPanel id="affiliate" open={open} setOpen={setOpen} icon={BadgeDollarSign} tone="icon-gradient-purple" title="Affiliate Library" subtitle="Relevant product links, disclosure, and sponsored-link controls" badge={`${(draft.affiliateLinks || []).filter((item) => item.enabled !== false).length} active`}>
          <div className="space-y-5">
            <div>
              <div className="mb-3 text-sm font-black text-slate-800">Automatic affiliate provider</div>
              <RadioCards
                value={draft.affiliateProvider || "impact"}
                onChange={(affiliateProvider) => update({ affiliateProvider })}
                items={[
                  ["impact", "Impact", "Use approved Impact campaigns only"],
                  ["amazon", "Amazon Associates", "Use your Amazon tracking ID or Creators API"],
                  ["both", "Best Match", "Compare both providers for every article"]
                ]}
              />
            </div>
            {draft.affiliateProvider !== "amazon" ? <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-slate-900">Impact Product Import</div>
                  <div className="mt-1 text-sm font-medium text-slate-500">Search approved programs and create trackable affiliate links</div>
                </div>
                <Button variant="secondary" onClick={() => electronAPI.openExternalUrl("https://app.impact.com/")}><ExternalLink className="h-4 w-4" />Open Impact</Button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Impact Account SID">
                  <input className={inputClass} autoComplete="off" value={draft.impactAccountSid || ""} onChange={(event) => update({ impactAccountSid: event.target.value })} placeholder="Account SID" />
                </Field>
                <Field label="Impact Auth Token">
                  <input type="password" className={inputClass} autoComplete="new-password" value={draft.impactAuthToken || ""} onChange={(event) => update({ impactAuthToken: event.target.value })} placeholder="Auth Token" />
                </Field>
                <Field label="Media Property ID" hint="Optional">
                  <input className={inputClass} autoComplete="off" value={draft.impactMediaPropertyId || ""} onChange={(event) => update({ impactMediaPropertyId: event.target.value })} placeholder="Property ID" />
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" disabled={!!impactBusy} onClick={testImpact}><TestTube2 className="h-4 w-4" />{impactBusy === "test" ? "Testing..." : "Test Impact"}</Button>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
                <input
                  className={inputClass}
                  value={impactQuery}
                  onChange={(event) => setImpactQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      searchImpact();
                    }
                  }}
                  placeholder="Search products, ingredients, or kitchen tools"
                />
                <Button disabled={!!impactBusy} onClick={searchImpact}><Search className="h-4 w-4" />{impactBusy === "search" ? "Searching..." : "Search Impact"}</Button>
              </div>
              {impactStatus ? <div className="mt-3 rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{impactStatus}</div> : null}
              {impactProducts.length ? (
                <div className="mt-4 max-h-96 space-y-2 overflow-auto pr-1">
                  {impactProducts.map((product) => {
                    const importing = impactBusy === `import-${product.id}`;
                    const price = [product.currentPrice, product.currency].filter(Boolean).join(" ");
                    return (
                      <div key={`${product.campaignId}-${product.id}`} className="flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-3 ring-1 ring-slate-100">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-black text-slate-900">{product.name}</div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                            <span>{product.campaignName || "Impact program"}</span>
                            {price ? <span>{price}</span> : null}
                            {product.stockAvailability ? <span>{product.stockAvailability}</span> : null}
                          </div>
                        </div>
                        <Button variant="secondary" disabled={!!impactBusy} onClick={() => importImpactProduct(product)}>
                          <Plus className="h-4 w-4" />{importing ? "Importing..." : "Import"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div> : null}
            {draft.affiliateProvider !== "impact" ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-black text-slate-900">Amazon Associates</div>
                    <div className="mt-1 text-sm font-medium text-slate-500">Tracking ID mode works immediately. Creators API adds exact products and images.</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => electronAPI.openExternalUrl("https://affiliate-program.amazon.com/home")}><ExternalLink className="h-4 w-4" />Open Associates</Button>
                    <Button variant="secondary" onClick={() => electronAPI.openExternalUrl("https://affiliate-program.amazon.com/creatorsapi")}><ExternalLink className="h-4 w-4" />Creators API</Button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="Amazon Tracking ID" hint="Required. Usually ends in -20 for the US.">
                    <input className={inputClass} autoComplete="off" value={draft.amazonPartnerTag || ""} onChange={(event) => update({ amazonPartnerTag: event.target.value })} placeholder="yourstore-20" />
                  </Field>
                  <Field label="Marketplace">
                    <select className={inputClass} value={draft.amazonMarketplace || "www.amazon.com"} onChange={(event) => update({ amazonMarketplace: event.target.value })}>
                      {[
                        ["www.amazon.com", "United States"],
                        ["www.amazon.ca", "Canada"],
                        ["www.amazon.co.uk", "United Kingdom"],
                        ["www.amazon.de", "Germany"],
                        ["www.amazon.fr", "France"],
                        ["www.amazon.es", "Spain"],
                        ["www.amazon.it", "Italy"],
                        ["www.amazon.com.au", "Australia"],
                        ["www.amazon.co.jp", "Japan"],
                        ["www.amazon.in", "India"],
                        ["www.amazon.ae", "United Arab Emirates"]
                      ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Credential Version" hint="Optional Creators API">
                    <input className={inputClass} autoComplete="off" value={draft.amazonCredentialVersion || "2.1"} onChange={(event) => update({ amazonCredentialVersion: event.target.value })} placeholder="2.1" />
                  </Field>
                  <Field label="Creators API Credential ID" hint="Optional">
                    <input className={inputClass} autoComplete="off" value={draft.amazonCredentialId || ""} onChange={(event) => update({ amazonCredentialId: event.target.value })} placeholder="Credential ID" />
                  </Field>
                  <Field label="Creators API Credential Secret" hint="Optional and encrypted">
                    <input type="password" className={inputClass} autoComplete="new-password" value={draft.amazonCredentialSecret || ""} onChange={(event) => update({ amazonCredentialSecret: event.target.value })} placeholder="Credential Secret" />
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={!!amazonBusy} onClick={testAmazon}><TestTube2 className="h-4 w-4" />{amazonBusy === "test" ? "Testing..." : "Test Amazon"}</Button>
                </div>
                {amazonStatus ? <div className="mt-3 rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{amazonStatus}</div> : null}
                <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/50 p-4">
                  <div className="font-black text-slate-900">Add Exact Amazon Product</div>
                  <div className="mt-1 text-sm font-medium leading-6 text-slate-600">
                    Paste a product page URL or ASIN. Content Studio adds your tracking ID and only uses this exact product when its match terms fit an article.
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <Field label="Exact product name">
                      <input
                        className={inputClass}
                        value={amazonDirectProduct.name}
                        onChange={(event) => setAmazonDirectProduct((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Lodge 10.25 Inch Cast Iron Skillet"
                      />
                    </Field>
                    <Field label="Amazon product URL or ASIN">
                      <input
                        className={inputClass}
                        value={amazonDirectProduct.urlOrAsin}
                        onChange={(event) => setAmazonDirectProduct((current) => ({ ...current, urlOrAsin: event.target.value }))}
                        placeholder="https://www.amazon.com/dp/B00006JSUA"
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="Match terms" hint="Comma separated phrases that should naturally match the article.">
                        <input
                          className={inputClass}
                          value={amazonDirectProduct.keywords}
                          onChange={(event) => setAmazonDirectProduct((current) => ({ ...current, keywords: event.target.value }))}
                          placeholder="cast iron skillet, frying pan, skillet chicken"
                        />
                      </Field>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Button disabled={!!amazonBusy} onClick={importDirectAmazonProduct}>
                      <Plus className="h-4 w-4" />{amazonBusy === "direct" ? "Adding..." : "Add Exact Product"}
                    </Button>
                  </div>
                </div>
                {draft.amazonCredentialId && draft.amazonCredentialSecret ? (
                  <>
                    <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
                      <input
                        className={inputClass}
                        value={amazonQuery}
                        onChange={(event) => setAmazonQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            searchAmazon();
                          }
                        }}
                        placeholder="Search Amazon kitchen products"
                      />
                      <Button disabled={!!amazonBusy} onClick={searchAmazon}><Search className="h-4 w-4" />{amazonBusy === "search" ? "Searching..." : "Search Amazon"}</Button>
                    </div>
                    {amazonProducts.length ? (
                      <div className="mt-4 max-h-96 space-y-2 overflow-auto pr-1">
                        {amazonProducts.map((product) => (
                          <div key={product.asin || product.id} className="flex flex-wrap items-center gap-3 rounded-md bg-slate-50 p-3 ring-1 ring-slate-100">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-black text-slate-900">{product.name}</div>
                              <div className="mt-1 text-xs font-semibold text-slate-500">{[product.manufacturer, product.asin].filter(Boolean).join(" | ")}</div>
                            </div>
                            <Button variant="secondary" disabled={!!amazonBusy} onClick={() => importAmazonProduct(product)}>
                              <Plus className="h-4 w-4" />{amazonBusy === `import-${product.id}` ? "Adding..." : "Add"}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                    Without Creators API credentials, Content Studio uses only the exact products you add above. It will not insert general Amazon search pages. Amazon currently requires eligible Creators API access for automatic catalog search.
                  </div>
                )}
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 font-bold text-slate-800 ring-1 ring-slate-100">
                <span><span className="block">Affiliate Matching</span><span className="text-sm font-medium text-slate-500">Find relevant opportunities inside articles</span></span>
                <input type="checkbox" className="h-5 w-5" checked={draft.affiliateEnabled !== false} onChange={(event) => update({ affiliateEnabled: event.target.checked })} />
              </label>
              <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 font-bold text-slate-800 ring-1 ring-slate-100">
                <span><span className="block">Auto Add During Generation</span><span className="text-sm font-medium text-slate-500">Insert the strongest relevant matches automatically</span></span>
                <input type="checkbox" className="h-5 w-5" checked={draft.affiliateAutoInsert !== false} onChange={(event) => update({ affiliateAutoInsert: event.target.checked })} />
              </label>
              <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 font-bold text-slate-800 ring-1 ring-slate-100">
                <span><span className="block">Auto Search Provider</span><span className="text-sm font-medium text-slate-500">Search selected providers while each article is generated</span></span>
                <input type="checkbox" className="h-5 w-5" checked={draft.affiliateAutoDiscover !== false} onChange={(event) => update({ affiliateAutoDiscover: event.target.checked })} />
              </label>
              <Field label="Maximum links per article" hint="A restrained limit keeps recommendations useful.">
                <input type="number" min="0" max="8" className={inputClass} value={draft.affiliateMaxLinks ?? 3} onChange={(event) => update({ affiliateMaxLinks: Math.max(0, Math.min(8, Number(event.target.value))) })} />
              </Field>
            </div>
            <Field label="Affiliate disclosure" hint="Placed near the top whenever the app adds an affiliate link. Keep the financial relationship clear.">
              <textarea className={`${inputClass} min-h-24 resize-y`} value={draft.affiliateDisclosure || ""} onChange={(event) => update({ affiliateDisclosure: event.target.value })} />
            </Field>
            <div className="rounded-md bg-violet-50 px-4 py-3 text-sm font-semibold leading-6 text-violet-800 ring-1 ring-violet-100">
              During generation, the app searches the selected provider, verifies the tracking tag, and adds the best relevant product beside useful article text. Amazon links include the required Associates disclosure and never show unverified prices. It never changes ingredients, instructions, or recipe cards.
            </div>
            <div className="space-y-4">
              {(draft.affiliateLinks || []).map((item, index) => (
                <div key={item.id || index} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {item.trackingVerified ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">
                        <ShieldCheck className="h-3.5 w-3.5" />{item.source === "amazon" ? "Amazon tagged" : "Impact tracked"}
                      </span>
                    ) : null}
                    {item.currentPrice ? (
                      <span className="rounded-md bg-violet-50 px-2 py-1 text-xs font-black text-violet-700 ring-1 ring-violet-100">
                        {item.originalPrice && Number(item.originalPrice) > Number(item.currentPrice) ? `Was ${item.originalPrice}, now ` : ""}{item.currentPrice} {item.currency || ""}
                      </span>
                    ) : null}
                    {item.source === "amazon" && item.amazonLinkType === "search" ? (
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200">
                        Search link disabled
                      </span>
                    ) : null}
                    {item.stockAvailability ? <span className="text-xs font-bold text-slate-500">{item.stockAvailability}</span> : null}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Product or offer name">
                      <input className={inputClass} value={item.name || ""} onChange={(event) => updateAffiliateLink(index, { name: event.target.value })} placeholder="Digital kitchen scale" />
                    </Field>
                    <Field label="Affiliate destination URL">
                      <input className={inputClass} value={item.url || ""} onChange={(event) => updateAffiliateLink(index, { url: event.target.value })} placeholder="https://merchant.example/product?tag=..." />
                    </Field>
                    <Field label="Match terms" hint="Comma separated phrases that must naturally appear in the article.">
                      <textarea className={`${inputClass} min-h-24 resize-y`} value={Array.isArray(item.keywords) ? item.keywords.join(", ") : item.keywords || ""} onChange={(event) => updateAffiliateLink(index, { keywords: event.target.value })} placeholder="kitchen scale, food scale, baking scale" />
                    </Field>
                    <Field label="Preferred anchor text" hint="Used as a label in the opportunity list. The article keeps its natural matched wording.">
                      <input className={inputClass} value={item.anchorText || ""} onChange={(event) => updateAffiliateLink(index, { anchorText: event.target.value })} placeholder="digital kitchen scale" />
                    </Field>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm font-black text-slate-700">
                      <input type="checkbox" className="h-5 w-5" checked={item.enabled !== false} onChange={(event) => updateAffiliateLink(index, { enabled: event.target.checked })} />
                      Active opportunity
                    </label>
                    <Button variant="danger" onClick={() => update({ affiliateLinks: draft.affiliateLinks.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-4 w-4" />Remove</Button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="secondary" onClick={() => update({
              affiliateLinks: [
                ...(draft.affiliateLinks || []),
                { id: `affiliate-${Date.now()}`, name: "", url: "", keywords: "", anchorText: "", enabled: true }
              ]
            })}><Plus className="h-4 w-4" />Add Affiliate Opportunity</Button>
          </div>
        </SettingPanel>

        <SettingPanel id="wordpress" open={open} setOpen={setOpen} icon={Globe2} tone="icon-gradient-purple" title="WordPress Sites" subtitle="Manage publishing destinations" badge={`${(draft.wordpressSites || []).length} sites`}>
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-lg font-black text-slate-900"><Link2 className="h-5 w-5 text-violet-600" />Internal Linking</div>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex items-center justify-between gap-4 rounded-md bg-slate-50 p-4 font-bold text-slate-800 ring-1 ring-slate-100">
                  <span><span className="block">Auto Internal Links</span><span className="text-sm font-medium text-slate-500">Add related same-site links to generated articles</span></span>
                  <input type="checkbox" className="h-5 w-5" checked={draft.enableInternalLinks !== false} onChange={(event) => update({ enableInternalLinks: event.target.checked })} />
                </label>
                <Field label="Links per article">
                  <input type="number" min="0" max="12" className={inputClass} value={draft.internalLinkCount ?? 3} onChange={(event) => update({ internalLinkCount: Number(event.target.value) })} />
                </Field>
                <Field label="Posts to sync">
                  <input type="number" min="25" max="500" className={inputClass} value={draft.internalLinkMaxPosts ?? 500} onChange={(event) => update({ internalLinkMaxPosts: Number(event.target.value) })} />
                </Field>
              </div>
            </div>
            {(draft.wordpressSites || []).map((site, index) => (
              <div key={site.id || index} className="rounded-lg border border-slate-200 bg-white p-4">
                {(() => {
                  const key = siteKey(site, index);
                  const busy = siteBusy[key];
                  const message = siteStatus[key];
                  return (
                    <>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Site name"><input className={inputClass} value={site.name || ""} onChange={(event) => updateSite(index, { name: event.target.value })} /></Field>
                  <Field label="URL"><input className={inputClass} value={site.url || ""} onChange={(event) => updateSite(index, { url: event.target.value })} /></Field>
                  <Field label="Username"><input className={inputClass} value={site.username || ""} onChange={(event) => updateSite(index, { username: event.target.value })} /></Field>
                  <Field label="Application password"><input type="password" className={inputClass} value={site.apiKey || ""} onChange={(event) => updateSite(index, { apiKey: event.target.value })} /></Field>
                  <Field label="Fallback category">
                    <select className={inputClass} value={site.defaultCategoryId || ""} onChange={(event) => updateSite(index, { defaultCategoryId: event.target.value })}>
                      <option value="">None</option>
                      {(site.categories || []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </Field>
                  <div className="rounded-md bg-slate-50 p-3 text-sm font-bold text-slate-600 ring-1 ring-slate-100">
                    {(site.categories || []).length} categories synced
                    {site.categoriesSyncedAt ? <span className="block text-xs font-medium text-slate-500">Last sync: {new Date(site.categoriesSyncedAt).toLocaleString()}</span> : null}
                  </div>
                  <div className="rounded-md bg-slate-50 p-3 text-sm font-bold text-slate-600 ring-1 ring-slate-100">
                    {(site.internalLinkPosts || []).length} posts synced for links
                    {site.internalLinksSyncedAt ? <span className="block text-xs font-medium text-slate-500">Last sync: {new Date(site.internalLinksSyncedAt).toLocaleString()}</span> : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => testSite(site, index)} disabled={!!busy}><TestTube2 className="h-4 w-4" />{busy === "test" ? "Testing..." : "Test"}</Button>
                  <Button variant="secondary" onClick={() => syncCategories(site, index)} disabled={!!busy}><ListChecks className="h-4 w-4" />{busy === "categories" ? "Syncing..." : "Sync Categories"}</Button>
                  <Button variant="secondary" onClick={() => syncPosts(site, index)} disabled={!!busy}><Link2 className="h-4 w-4" />{busy === "posts" ? "Syncing..." : "Sync Posts"}</Button>
                  <Button variant="danger" onClick={() => update({ wordpressSites: draft.wordpressSites.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" />Remove</Button>
                </div>
                {message ? (
                  <div className={`mt-3 rounded-md px-3 py-2 text-sm font-bold ring-1 ${
                    message.type === "success" ? "bg-violet-50 text-violet-700 ring-violet-100" :
                    message.type === "error" ? "bg-red-50 text-red-700 ring-red-100" :
                    "bg-slate-50 text-slate-700 ring-slate-100"
                  }`}>
                    {message.text}
                  </div>
                ) : null}
                {site.categories?.length ? (
                  <div className="mt-3 flex max-h-24 flex-wrap gap-2 overflow-auto">
                    {site.categories.slice(0, 40).map((category) => (
                      <span key={category.id} className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-700">{category.name}</span>
                    ))}
                  </div>
                ) : null}
                    </>
                  );
                })()}
              </div>
            ))}
            <Button variant="secondary" onClick={() => update({ wordpressSites: [...(draft.wordpressSites || []), { id: String(Date.now()), name: "", url: "", username: "", apiKey: "" }] })}><Plus className="h-4 w-4" />Add WordPress Site</Button>
          </div>
        </SettingPanel>

        <SettingPanel id="prompts" open={open} setOpen={setOpen} icon={Wand2} tone="icon-gradient-purple" title="Prompts" subtitle="Article, listicle, and image instructions">
          {(() => {
            const selectedPrompt = promptEditors.find((item) => item.key === selectedPromptKey) || promptEditors[0];
            return (
              <div className="space-y-4">
                <Field label="Prompt type">
                  <select className={inputClass} value={selectedPrompt.key} onChange={(event) => setSelectedPromptKey(event.target.value)}>
                    {promptEditors.map((prompt) => (
                      <option key={prompt.key} value={prompt.key}>{prompt.title} - {prompt.subtitle}</option>
                    ))}
                  </select>
                </Field>
                <div className="rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600 ring-1 ring-slate-100">
                  {selectedPrompt.title}
                  <span className="mt-1 block font-medium text-slate-500">{selectedPrompt.subtitle}</span>
                </div>
                <textarea
                  className={`${inputClass} min-h-80 resize-y font-mono text-xs leading-5`}
                  value={draft[selectedPrompt.key] || ""}
                  onChange={(event) => update({ [selectedPrompt.key]: event.target.value })}
                />
              </div>
            );
          })()}
        </SettingPanel>

        <SettingPanel id="backup" open={open} setOpen={setOpen} icon={ListChecks} tone="bg-slate-700" title="Backup and Logs" subtitle="Export, import, troubleshoot">
          <div className="mb-3 rounded-md bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 ring-1 ring-violet-100">
            Content Studio now keeps up to 12 automatic recovery snapshots of articles, settings, pins, social packs, and saved metadata.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportArticles}><Download className="h-4 w-4" />Export Articles</Button>
            <Button variant="secondary" onClick={importArticles}><Upload className="h-4 w-4" />Import Articles</Button>
            <Button variant="secondary" onClick={createRecoveryBackup}><Save className="h-4 w-4" />Create Recovery Backup</Button>
            <Button variant="secondary" onClick={() => electronAPI.openWorkspaceBackups?.()}><FolderOpen className="h-4 w-4" />Open Backup Folder</Button>
            <Button variant="secondary" onClick={() => electronAPI.openLogFile()}><FolderOpen className="h-4 w-4" />Open Log File</Button>
          </div>
        </SettingPanel>

        <SettingPanel id="diagnostics" open={open} setOpen={setOpen} icon={ShieldCheck} tone="icon-gradient-purple" title="Diagnostics and Support" subtitle="Health, connections, recovery">
          <Diagnostics />
        </SettingPanel>

        {status ? <div className="rounded-md bg-violet-50 px-4 py-3 text-sm font-black text-violet-700 ring-1 ring-violet-100">{status}</div> : null}
      </div>
    </section>
  );
}
