const { app, BrowserWindow, dialog, safeStorage } = require("electron");
const Store = require("electron-store");
const fs = require("fs");
const path = require("path");

const recipeStore = new Store({ name: "recipe-money-maker" });
const defaults = {
  brandColor: "#1f6b4f",
  accentColor: "#f3b44b",
  font: "Inter",
  language: "English",
  brandName: "Recipe Money Maker",
  logoPath: ""
};

function encrypt(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (safeStorage.isEncryptionAvailable()) return "safe:" + safeStorage.encryptString(text).toString("base64");
  throw new Error("Secure system credential storage is unavailable. The API key was not saved.");
}

function decrypt(value) {
  const text = String(value || "");
  try {
    if (text.startsWith("safe:") && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(text.slice(5), "base64"));
    if (text.startsWith("plain:")) return Buffer.from(text.slice(6), "base64").toString("utf8");
  } catch {}
  return "";
}

function logoDataUrl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  const extension = path.extname(filePath).toLowerCase();
  const mime = extension === ".svg" ? "image/svg+xml" : [".jpg", ".jpeg"].includes(extension) ? "image/jpeg" : "image/png";
  return "data:" + mime + ";base64," + fs.readFileSync(filePath).toString("base64");
}

function settings() {
  return { ...defaults, ...(recipeStore.get("settings", {}) || {}) };
}

function publicState() {
  const current = settings();
  return {
    settings: {
      ...current,
      apiKeyEncrypted: undefined,
      hasApiKey: Boolean(current.apiKeyEncrypted),
      logoDataUrl: logoDataUrl(current.logoPath)
    },
    recipes: recipeStore.get("recipes", []) || []
  };
}

async function deepSeekRequest(apiKey, title, language, ledger) {
  const prompt = [
    "Create a practical, accurate recipe for the exact title: " + JSON.stringify(title) + ".",
    "Write everything in " + language + ". Do not alter or decorate the title.",
    "Return only valid JSON with keys description, servings, prepTime, cookTime, difficulty, ingredients, instructions, tips, nutrition.",
    "Ingredients and instructions must be arrays of strings. Leave nutrition as an empty object; do not invent nutrition, ratings or personal testing.",
    "Include measured ingredients, use every ingredient, complete ordered instructions, yield, realistic timing and observable doneness cues. Give safe food handling and storage guidance. Never use markdown."
  ].join(" ");
  const entry = ledger?.reserve({ provider: 'deepseek', model: 'deepseek/deepseek-chat', input: { title, language }, estimateUsd: null });
  let response;
  try { response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are a professional cookbook editor. Output strict JSON only." },
        { role: "user", content: prompt }
      ],
      temperature: 0.65,
      response_format: { type: "json_object" }
    }),
    signal: AbortSignal.timeout(90000),
    redirect: 'error'
  }); } catch (error) { if (entry) ledger.update(entry, { status: 'uncertain', errorCode: 'network' }); throw error; }
  if (entry) ledger.update(entry, { status: response.ok ? 'submitted' : response.status >= 400 && response.status < 500 ? 'rejected' : 'uncertain' });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(response.status === 401 ? "DeepSeek rejected the saved API key." : "DeepSeek returned " + response.status + ": " + detail.slice(0, 180));
  }
  const payload = await response.json();
  const raw = String(payload?.choices?.[0]?.message?.content || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("DeepSeek returned an unreadable recipe. Please try again.");
  }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function recipePage(recipe) {
  const style = recipe.style || {};
  const brand = /^#[0-9a-f]{6}$/i.test(style.brandColor) ? style.brandColor : "#1f6b4f";
  const accent = /^#[0-9a-f]{6}$/i.test(style.accentColor) ? style.accentColor : "#f3b44b";
  const ingredients = (recipe.ingredients || []).map((item) => "<li>" + esc(item) + "</li>").join("");
  const instructions = (recipe.instructions || []).map((item, index) => "<li><i>" + (index + 1) + "</i><p>" + esc(item) + "</p></li>").join("");
  const tip = recipe.tips?.[0] ? "<div class=\"tip\"><b>Cook's note</b><p>" + esc(recipe.tips[0]) + "</p></div>" : "";
  const logo = style.logoDataUrl ? "<img class=\"logo\" src=\"" + style.logoDataUrl + "\">" : "<span class=\"mark\">R</span>";
  return "<section class=\"page\" style=\"--brand:" + brand + ";--accent:" + accent + ";--pale:" + accent + "22;font-family:" + esc(style.font || "Arial") + ",Arial,sans-serif\">" +
    "<header><div class=\"eyebrow\">RECIPE COLLECTION</div><h1>" + esc(recipe.title) + "</h1><p>" + esc(recipe.description) + "</p></header>" +
    "<div class=\"meta\"><div><small>PREP</small><strong>" + esc(recipe.prepTime) + "</strong></div><div><small>COOK</small><strong>" + esc(recipe.cookTime) + "</strong></div><div><small>SERVES</small><strong>" + esc(recipe.servings) + "</strong></div><div><small>LEVEL</small><strong>" + esc(recipe.difficulty) + "</strong></div></div>" +
    "<main><div class=\"ings\"><h2>Ingredients</h2><ul>" + ingredients + "</ul>" + tip + "</div><div class=\"steps\"><h2>Method</h2><ol>" + instructions + "</ol></div></main>" +
    "<footer><div>" + logo + "<span>" + esc(style.brandName || "Recipe Money Maker") + "</span></div><span>" + new Date(recipe.createdAt).toLocaleDateString() + "</span></footer></section>";
}

const printCss = "@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;color:#202925}.page{width:210mm;height:297mm;padding:17mm 17mm 12mm;position:relative;overflow:hidden;page-break-after:always;background:#fff}.page:last-child{page-break-after:auto}.page:before{content:'';position:absolute;right:-42mm;top:-53mm;width:115mm;height:115mm;border:14mm solid var(--pale);border-radius:50%}header{position:relative;border-left:5px solid var(--accent);padding-left:8mm;max-width:158mm}.eyebrow{color:var(--brand);font-size:8pt;font-weight:800;letter-spacing:2px;margin-bottom:3mm}h1{font-family:Georgia,serif;color:var(--brand);font-size:30pt;line-height:1.05;margin:0 0 3mm}header p{font-size:10pt;line-height:1.5;margin:0;color:#58615d}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;background:var(--brand);color:#fff;border-radius:4mm;padding:5mm 7mm;margin:9mm 0 8mm}.meta div{border-right:1px solid #ffffff42}.meta small{display:block;color:#ffffffb8;font-size:7pt;letter-spacing:1px}.meta strong{font-size:10pt}main{display:grid;grid-template-columns:38% 1fr;gap:11mm}h2{color:var(--brand);font-family:Georgia,serif;font-size:17pt;margin:0 0 4mm;padding-bottom:2mm;border-bottom:1px solid #dfe7e2}.ings ul,.steps ol{list-style:none;padding:0;margin:0}.ings li{font-size:9pt;line-height:1.4;padding:2.1mm 0;border-bottom:1px solid #e7e8e5}.ings li:before{content:'◆';font-size:5pt;color:var(--accent);margin-right:3mm}.steps li{display:grid;grid-template-columns:8mm 1fr;gap:3mm;margin-bottom:4mm}.steps i{width:7mm;height:7mm;display:grid;place-items:center;background:var(--brand);color:#fff;border-radius:50%;font-size:8pt;font-style:normal;font-weight:bold}.steps p{margin:0;font-size:9pt;line-height:1.48}.tip{margin-top:6mm;background:var(--pale);border-radius:3mm;padding:4mm;font-size:8.5pt;line-height:1.4}footer{position:absolute;left:17mm;right:17mm;bottom:10mm;padding-top:4mm;border-top:1px solid #dfe3df;display:flex;justify-content:space-between;align-items:center;color:#7d8782;font-size:8pt}footer div{display:flex;align-items:center;gap:2.5mm;color:var(--brand);font-weight:700}.logo{max-width:10mm;max-height:8mm}.mark{width:7mm;height:7mm;display:grid;place-items:center;background:var(--brand);color:#fff;border-radius:2mm}";

async function exportPdf(ids) {
  const wanted = new Set(Array.isArray(ids) ? ids : []);
  const recipes = (recipeStore.get("recipes", []) || []).filter((recipe) => wanted.has(recipe.id));
  if (!recipes.length) return { success: false, error: "Select at least one recipe." };
  const defaultName = recipes.length === 1 ? recipes[0].title.replace(/[<>:"/\\|?*]/g, "").slice(0, 80) + ".pdf" : "Recipe-Collection-" + new Date().toISOString().slice(0, 10) + ".pdf";
  const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() || undefined, { title: "Save printable recipe PDF", defaultPath: defaultName, filters: [{ name: "PDF document", extensions: ["pdf"] }] });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    const html = "<!doctype html><html><head><meta charset=\"utf-8\"><style>" + printCss + "</style></head><body>" + recipes.map(recipePage).join("") + "</body></html>";
    await printWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    const pdf = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: "A4", margins: { marginType: "none" }, preferCSSPageSize: true });
    fs.writeFileSync(result.filePath, pdf);
    return { success: true, filePath: result.filePath };
  } finally {
    printWindow.destroy();
  }
}

module.exports = function registerRecipeMoneyMaker({ handle: trustedHandle, ledger } = {}) {
  if (!trustedHandle) throw new Error('Recipe Money Maker requires the application IPC guard.');
  const handle = (channel, fn) => trustedHandle(channel, (_event, ...args) => fn(...args));
  handle("rmm-get-state", () => publicState());

  handle("rmm-save-settings", (updates = {}) => {
    const current = settings();
    const next = {
      ...current,
      brandColor: /^#[0-9a-f]{6}$/i.test(updates.brandColor) ? updates.brandColor : current.brandColor,
      accentColor: /^#[0-9a-f]{6}$/i.test(updates.accentColor) ? updates.accentColor : current.accentColor,
      font: String(updates.font || current.font).slice(0, 40),
      language: String(updates.language || current.language).slice(0, 30),
      brandName: String(updates.brandName || current.brandName).trim().slice(0, 80),
      logoPath: current.logoPath || ""
    };
    if (String(updates.apiKey || "").trim()) next.apiKeyEncrypted = encrypt(updates.apiKey);
    recipeStore.set("settings", next);
    return { success: true, settings: publicState().settings };
  });

  handle("rmm-clear-api-key", () => {
    const next = { ...settings() };
    delete next.apiKeyEncrypted;
    recipeStore.set("settings", next);
    return { success: true, settings: publicState().settings };
  });

  handle("rmm-choose-logo", async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || undefined, { title: "Choose a recipe card logo", properties: ["openFile"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "svg"] }] });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
    const folder = path.join(app.getPath("userData"), "recipe-money-maker-assets");
    fs.mkdirSync(folder, { recursive: true });
    const destination = path.join(folder, "logo" + path.extname(result.filePaths[0]).toLowerCase());
    fs.copyFileSync(result.filePaths[0], destination);
    recipeStore.set("settings.logoPath", destination);
    return { success: true, logoPath: destination, logoDataUrl: logoDataUrl(destination) };
  });

  handle("rmm-test-connection", async ({ apiKey = "" } = {}) => {
    const key = String(apiKey || "").trim() || decrypt(settings().apiKeyEncrypted);
    if (!key) return { success: false, error: settings().apiKeyEncrypted ? "The saved DeepSeek key could not be read on this computer. Enter it again." : "Enter a DeepSeek API key first." };
    try {
      const response = await fetch("https://api.deepseek.com/models", { headers: { Authorization: "Bearer " + key }, signal: AbortSignal.timeout(20000) });
      return response.ok ? { success: true } : { success: false, error: response.status === 401 ? "DeepSeek rejected this API key." : "DeepSeek returned HTTP " + response.status + "." };
    } catch (error) {
      return { success: false, error: "Could not reach DeepSeek: " + (error.message || "network error") + "." };
    }
  });

  handle("rmm-generate", async ({ title = "", language = "English" } = {}) => {
    const current = settings();
    const key = decrypt(current.apiKeyEncrypted);
    if (!key) return { success: false, error: "Add and save a DeepSeek API key first." };
    const exactTitle = String(title || "").trim().slice(0, 160);
    if (!exactTitle) return { success: false, error: "Recipe title is required." };
    const generated = await deepSeekRequest(key, exactTitle, language, ledger);
    const recipe = {
      id: "recipe-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      title: exactTitle,
      description: String(generated.description || ""),
      servings: String(generated.servings || ""),
      prepTime: String(generated.prepTime || ""),
      cookTime: String(generated.cookTime || ""),
      difficulty: String(generated.difficulty || "Easy"),
      ingredients: Array.isArray(generated.ingredients) ? generated.ingredients.map(String) : [],
      instructions: Array.isArray(generated.instructions) ? generated.instructions.map(String) : [],
      tips: Array.isArray(generated.tips) ? generated.tips.map(String) : [],
      nutrition: {},
      language,
      createdAt: new Date().toISOString(),
      style: { brandColor: current.brandColor, accentColor: current.accentColor, font: current.font, brandName: current.brandName, logoDataUrl: logoDataUrl(current.logoPath) }
    };
    const recipes = [recipe, ...(recipeStore.get("recipes", []) || [])];
    recipeStore.set("recipes", recipes);
    return { success: true, recipe };
  });

  handle("rmm-delete", ({ ids = [] } = {}) => {
    const wanted = new Set(Array.isArray(ids) ? ids : []);
    const recipes = (recipeStore.get("recipes", []) || []).filter((recipe) => !wanted.has(recipe.id));
    recipeStore.set("recipes", recipes);
    return { success: true, recipes };
  });

  handle("rmm-export-pdf", ({ ids = [] } = {}) => exportPdf(ids));
};

// Workspace backups include this separate store so its recipes and settings survive a restore.
// The DeepSeek key stays OS-encrypted, as in every other backed-up credential.
module.exports.exportRecipeMoneyMakerData = () => ({ settings: recipeStore.get("settings", {}) || {}, recipes: recipeStore.get("recipes", []) || [] });
module.exports.restoreRecipeMoneyMakerData = (data = {}) => {
  if (!data || typeof data !== "object") return false;
  if (data.settings && typeof data.settings === "object") recipeStore.set("settings", data.settings);
  if (Array.isArray(data.recipes)) recipeStore.set("recipes", data.recipes);
  return true;
};
