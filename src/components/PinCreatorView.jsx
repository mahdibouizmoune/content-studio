import { Clipboard, Download, Image as ImageIcon, Link2, Pause, Play, RefreshCw, Save, Send, Sparkles, Trash2, Upload, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { Button, EmptyState, Field, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";
import { scoreSmartBoard, smartPinSignals } from "@/lib/smartContentEngine";
import { addUtmParams } from "@/lib/utm";
import { markPinFailure, mergePinResult } from "@/lib/pinBatch.mjs";

const styles = [
  ["custom-ingredient-closeup", "Ingredient Closeup"],
  ["custom-recipe-card", "Recipe Card Traffic"],
  ["custom-weeknight-solution", "Weeknight Solution"],
  ["custom-listicle-collage", "Listicle Collage"]
];
const defaultStyleIds = styles.map(([id]) => id);

const textPlacements = [
  ["middle", "Middle"],
  ["top", "Top"],
  ["bottom", "Bottom"]
];

const timeOptions = Array.from({ length: 96 }, (_, index) => {
  const minutes = index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

const intentProfiles = [
  { match: /air fryer/i, boards: [/air fryer/i], keywords: ["air fryer", "crispy", "quick dinner"] },
  { match: /breakfast|brunch|egg|oats|pancake/i, boards: [/breakfast/i, /brunch/i], keywords: ["breakfast", "brunch", "morning recipe"] },
  { match: /dessert|cake|cookie|pie|brownie|chocolate/i, boards: [/dessert/i, /cookie/i, /chocolate/i], keywords: ["dessert", "sweet treat", "baking"] },
  { match: /soup|stew|chili/i, boards: [/soup/i, /stew/i], keywords: ["soup", "stew", "cozy recipe"] },
  { match: /salad|bowl/i, boards: [/salad/i, /bowl/i], keywords: ["salad", "bowl", "healthy lunch"] },
  { match: /healthy|protein|meal prep|clean eating/i, boards: [/healthy/i, /protein/i, /meal prep/i, /clean eating/i], keywords: ["healthy recipe", "meal prep", "high protein"] },
  { match: /weeknight|30 minute|quick|easy dinner/i, boards: [/weeknight/i, /quick/i, /easy dinner/i], keywords: ["weeknight dinner", "quick meal", "easy recipe"] },
  { match: /one pot|one pan|sheet pan|skillet/i, boards: [/one pot/i, /one pan/i, /sheet pan/i], keywords: ["one pot", "one pan", "easy cleanup"] },
  { match: /holiday|party|potluck/i, boards: [/holiday/i, /party/i], keywords: ["party food", "holiday recipe", "potluck"] },
  { match: /mocktail|non alcoholic|drink|sipper/i, boards: [/mocktail/i, /non alcoholic/i, /summer sippers/i], keywords: ["mocktail", "non alcoholic drink", "summer drink"] }
];

function cleanUrlLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const sourceTitle = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || url.hostname)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
    return { url: url.href, sourceTitle };
  } catch {
    if (trimmed.startsWith("content-studio://")) return { url: trimmed, sourceTitle: "Local article" };
    return null;
  }
}

function isPublicUrl(value = "") {
  return /^https?:\/\//i.test(String(value || ""));
}

function bestPinUrl(existingUrl = "", nextUrl = "") {
  if (isPublicUrl(nextUrl) && !isPublicUrl(existingUrl)) return nextUrl;
  return nextUrl || existingUrl;
}

function dedupePins(items = []) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.url) continue;
    const key = item.queueType === "internal-link"
      ? `url:${String(item.url || "").trim().replace(/\/+$/, "").toLowerCase()}`
      : item.articleId
      ? `article:${String(item.articleId).trim().toLowerCase()}`
      : `url:${String(item.url || "").trim().replace(/\/+$/, "").toLowerCase()}`;
    if (!key || key === "url:") continue;
    const existing = map.get(key) || {};
    map.set(key, {
      ...existing,
      ...item,
      url: bestPinUrl(existing.url, item.url),
      prompt: item.prompt || existing.prompt || "",
      title: item.title || existing.title || "",
      description: item.description || existing.description || "",
      imageUrl: item.imageUrl || existing.imageUrl || "",
      displayUrl: item.displayUrl || existing.displayUrl || "",
      localImageUrl: item.localImageUrl || existing.localImageUrl || "",
      localPath: item.localPath || existing.localPath || "",
      remoteImageUrl: item.remoteImageUrl || existing.remoteImageUrl || "",
      imgurUrl: item.imgurUrl || existing.imgurUrl || "",
      csvBoard: item.csvBoard || existing.csvBoard || "",
      csvKeywords: item.csvKeywords || existing.csvKeywords || "",
      csvPublishDate: item.csvPublishDate || existing.csvPublishDate || "",
      status: existing.status && item.status === "loaded" ? existing.status : (item.status || existing.status || "")
    });
  }
  return [...map.values()];
}

function normalize(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value = "") {
  return normalize(value).split(" ").filter((token) => token.length > 2);
}

function dedupe(items = []) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

function chooseBoard(pin, boardNames = []) {
  if (!boardNames.length) return pin.csvBoard || "";
  const haystack = normalize([pin.title, pin.description, pin.prompt, pin.sourceTitle, pin.url, ...(pin.interests || [])].join(" "));
  let best = boardNames.find((board) => /easy recipe finds/i.test(board)) || boardNames[0];
  let bestScore = -1;
  for (const board of boardNames) {
    const boardText = normalize(board);
    const boardTokens = tokenize(boardText);
    let score = 0;
    if (haystack.includes(boardText)) score += 100;
    boardTokens.forEach((token) => { if (haystack.includes(token)) score += 8; });
    intentProfiles.forEach((profile) => {
      if (profile.match.test(haystack)) {
        if (profile.boards.some((pattern) => pattern.test(board))) score += 65;
        profile.keywords.forEach((keyword) => { if (boardText.includes(normalize(keyword))) score += 10; });
      }
    });
    score += scoreSmartBoard(pin, board);
    if (/favorite products/i.test(board)) score -= 25;
    if (score > bestScore) {
      best = board;
      bestScore = score;
    }
  }
  return best;
}

function seoKeywords(pin, board) {
  const smart = smartPinSignals(pin, board);
  const phrases = [];
  const titleTokens = tokenize(pin.title || pin.sourceTitle || "").filter((token) => !["recipe", "recipes", "easy"].includes(token));
  for (let index = 0; index < titleTokens.length - 1; index++) phrases.push(`${titleTokens[index]} ${titleTokens[index + 1]}`);
  const profileKeywords = intentProfiles.flatMap((profile) => profile.match.test([pin.title, pin.description, board, pin.url].join(" ")) ? profile.keywords : []);
  return dedupe([
    ...(pin.interests || []),
    board,
    ...phrases.slice(0, 5),
    ...smart.keywords,
    ...profileKeywords,
    "easy recipe ideas",
    "recipe inspiration",
    "save this recipe"
  ]).slice(0, 24).join(", ");
}

function publicImage(pin) {
  return pin.imgurUrl || pin.remoteImageUrl || (/^https?:\/\//i.test(pin.imageUrl || "") ? pin.imageUrl : "");
}

function pinCampaignTitle(pin) {
  return pin.title || pin.sourceTitle || pin.description || pin.url || "recipe_pin";
}

function trackedPinUrl(pin, index = 0, platform = "pinterest", contentPrefix = "pin") {
  return addUtmParams(
    pin.url || "",
    platform,
    pinCampaignTitle(pin),
    `${contentPrefix}_${index + 1}`,
    "organic_social"
  );
}

function displayImage(pin) {
  return pin.displayUrl || pin.localImageUrl || pin.imageUrl || pin.imgurUrl || pin.remoteImageUrl || "";
}

function isPinComplete(pin) {
  return Boolean(pin?.prompt && pin?.title && pin?.description && displayImage(pin));
}

function formatSlot(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parseSlot(value = "") {
  const normalized = String(value || "").trim().replace("T", " ");
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function slotDate(value = "") {
  const parsed = parseSlot(value);
  return parsed ? formatSlot(parsed).slice(0, 10) : formatSlot(new Date()).slice(0, 10);
}

function slotTime(value = "") {
  const parsed = parseSlot(value);
  return parsed ? formatSlot(parsed).slice(11, 16) : "09:00";
}

function composeSlot(date, time) {
  return `${date || formatSlot(new Date()).slice(0, 10)} ${time || "09:00"}`;
}

function dateTimeLocalFromSlot(value = "") {
  const parsed = parseSlot(value);
  const date = parsed || new Date(Date.now() + 30 * 60 * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function slotFromDateTimeLocal(value = "") {
  const parsed = parseSlot(String(value || "").replace("T", " "));
  return parsed ? formatSlot(parsed) : "";
}

function parseGhlScheduleDate(value = "") {
  const text = String(value || "").trim();
  const date = new Date(text.includes("T") ? text : text.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? new Date(Date.now() + 30 * 60 * 1000) : date;
}

function formatGhlScheduleDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00`;
}

function formatGhlDateTimeLocal(value) {
  const date = parseGhlScheduleDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function slotTimeOptions(value = "") {
  const current = slotTime(value);
  return timeOptions.includes(current) ? timeOptions : [current, ...timeOptions];
}

function placementImageInstruction(placement = "middle") {
  if (placement === "top") {
    return "CRITICAL TEXT PLACEMENT: Put all readable text in the top third only, centered horizontally inside a clean top-third panel. Do not place any text in the middle or bottom.";
  }
  if (placement === "bottom") {
    return "CRITICAL TEXT PLACEMENT: Put all readable text in the bottom third only, centered horizontally inside a clean bottom-third panel. Do not place any text in the top or middle.";
  }
  return "CRITICAL TEXT PLACEMENT: Put all readable text in the exact center middle of the pin, centered horizontally and vertically inside a clean centered panel. Do not place any text near the top edge, bottom edge, or corners.";
}

function scheduleSlots(count, settings) {
  const interval = Math.max(1, Number(settings?.pinCreator?.postInterval || settings?.postInterval || 120));
  const pinsPerDay = Math.max(1, Number(settings?.pinCreator?.pinsPerDay || settings?.pinsPerDay || 15));
  const now = new Date();
  now.setSeconds(0, 0);
  const intervalMs = interval * 60 * 1000;
  const start = new Date(Math.ceil((now.getTime() + 30 * 60 * 1000) / intervalMs) * intervalMs);
  const slots = [];
  let current = start;
  let currentDay = current.getDate();
  let usedToday = 0;
  while (slots.length < count) {
    if (current.getDate() !== currentDay) {
      currentDay = current.getDate();
      usedToday = 0;
    }
    if (usedToday >= pinsPerDay) {
      current = new Date(current);
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      currentDay = current.getDate();
      usedToday = 0;
    }
    slots.push(formatSlot(current));
    usedToday++;
    current = new Date(current.getTime() + intervalMs);
  }
  return slots;
}

function applyScheduleFrom(index, firstValue, pins, settings) {
  const start = parseSlot(firstValue);
  if (!start) return pins.map((pin, rowIndex) => rowIndex === index ? { ...pin, csvPublishDate: firstValue } : pin);
  const interval = Math.max(1, Number(settings?.pinCreator?.postInterval || settings?.postInterval || 120));
  return pins.map((pin, rowIndex) => {
    if (rowIndex < index) return pin;
    const date = new Date(start.getTime() + (rowIndex - index) * interval * 60 * 1000);
    return { ...pin, csvPublishDate: formatSlot(date) };
  });
}

function csvCell(value) {
  const text = String(value || "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(rows, filename) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildSocialPack(pin, index = 0) {
  const title = (pin.title || pin.sourceTitle || "Recipe idea").replace(/\*\*(.*?)\*\*/g, "$1");
  const description = (pin.description || pin.prompt || "").replace(/\*\*(.*?)\*\*/g, "$1");
  const short = description.length > 220 ? `${description.slice(0, 217).trim()}...` : description;
  const hashtags = dedupe(seoKeywords(pin, pin.csvBoard).split(",").slice(0, 8).map((tag) => `#${tag.trim().replace(/[^a-zA-Z0-9]/g, "")}`)).filter((tag) => tag.length > 1);
  const instagramCaption = `${title} is the kind of recipe worth saving before a busy week.\n\n${short}\n\nSave it for your next meal plan, then find the complete recipe through the link in the profile.`;
  const pinterestUrl = trackedPinUrl(pin, index, "pinterest", "pin");
  const instagramUrl = trackedPinUrl(pin, index, "instagram", "post");
  const facebookUrl = trackedPinUrl(pin, index, "facebook", "post");
  return {
    id: `pin-${pin.id}-${Date.now()}`,
    articleId: pin.articleId || "",
    articleTitle: title,
    sourceUrl: instagramUrl || pin.url || "",
    campaignStyle: "pin-to-social",
    platforms: ["instagram", "facebook"],
    createdAt: new Date().toISOString(),
    sourcePinId: pin.id,
    content: {
      summary: short,
      socialPost: {
        caption: instagramCaption,
        hashtags,
        platforms: ["Instagram", "Facebook"]
      },
      instagram: {
        caption: instagramCaption,
        hashtags,
        altText: `Finished serving of ${title}`,
        carouselSlides: [
          { heading: title, body: "A practical recipe idea worth saving for later." },
          { heading: "Why It Works", body: short || "Simple, visual, and useful for real home cooking." },
          { heading: "Flavor Tip", body: "Use the full recipe notes to get the best texture and flavor." },
          { heading: "Make It Yours", body: "Check the article for substitutions, serving ideas, and storage tips." },
          { heading: "Save The Recipe", body: "Open the full post when you are ready to cook." }
        ],
        reelScript: { hook: `The close-up that makes ${title} impossible to scroll past`, scenes: ["Show the finished dish in 9:16", "Move into a texture close-up", "Show one useful recipe detail", "End with a save and blog CTA inside the safe zone"], voiceover: `${title}. Save this for your next meal plan, then open the full recipe when you are ready to cook.`, caption: `${title}\n\n${hashtags.slice(0, 6).join(" ")}`, cta: "Save this idea and read the full recipe on the blog." }
      },
      facebook: {
        pagePost: `${title}\n\n${short}\n\nThis is a useful one to keep around for meal planning. What would you serve with it? Get the complete recipe here: ${facebookUrl || ""}`.trim(),
        shortPost: `${title}\n\nA practical recipe idea for the week ahead. Full recipe: ${facebookUrl || ""}`.trim(),
        groupPost: `I am collecting practical meal ideas for the week, and ${title} stood out. ${short}\n\nWhat substitutions or sides would you try with it? ${facebookUrl || ""}`.trim(),
        hashtags: hashtags.slice(0, 2),
        altText: `Finished serving of ${title}`
      },
      threads: null,
      reddit: null,
      pinterest: { title, description, overlayText: title.split(/\s+/).slice(0, 6).join(" "), keywords: seoKeywords(pin, pin.csvBoard).split(",").map((item) => item.trim()) },
      email: null
    },
    imageAssets: pin.localPath || displayImage(pin) ? [{
      label: "Pinterest Pin",
      platform: "Pinterest",
      width: 1000,
      height: 1500,
      filePath: pin.localPath || "",
      fileUrl: displayImage(pin),
      publicUrl: publicImage(pin),
      imgbbUrl: pin.imgurUrl || "",
      remoteImageUrl: pin.remoteImageUrl || "",
      sourcePinId: pin.id,
      sourceUrl: pinterestUrl || pin.url
    }] : []
  };
}

function socialPackText(pack) {
  const data = pack.content || {};
  return [
    data.socialPost?.caption,
    data.instagram?.caption,
    data.facebook?.pagePost,
    data.pinterest?.description
  ].filter(Boolean).join("\n\n");
}

function pinAiContext(pin = {}) {
  return {
    sourceTitle: pin.sourceTitle || pin.title || "",
    title: pin.title || "",
    description: pin.description || "",
    targetKeyword: pin.targetKeyword || "",
    excerpt: pin.excerpt || "",
    board: pin.csvBoard || ""
  };
}

function pinQuality(pin = {}, allPins = [], boardNames = []) {
  const title = String(pin.title || "").trim();
  const description = String(pin.description || "").trim();
  const sourceWords = new Set(tokenize([pin.sourceTitle, pin.targetKeyword, pin.excerpt].filter(Boolean).join(" ")));
  const copyWords = new Set(tokenize(`${title} ${description}`));
  const relevance = sourceWords.size ? [...sourceWords].filter((word) => copyWords.has(word)).length / sourceWords.size : 1;
  const fingerprint = normalize(`${title} ${description}`);
  const duplicate = fingerprint && allPins.some((other) => other.id !== pin.id && normalize(`${other.title || ""} ${other.description || ""}`) === fingerprint);
  const board = pin.csvBoard || chooseBoard(pin, boardNames);
  const checks = [
    { label: "Image", ok: Boolean(displayImage(pin)), weight: 22 },
    { label: "Title length", ok: title.length >= 25 && title.length <= 100, weight: 14 },
    { label: "Description depth", ok: description.length >= 150 && description.length <= 800, weight: 14 },
    { label: "Source relevance", ok: relevance >= 0.2, weight: 18 },
    { label: "Board match", ok: Boolean(board) && (!boardNames.length || boardNames.includes(board)), weight: 12 },
    { label: "Creative prompt", ok: String(pin.prompt || "").length >= 80, weight: 12 },
    { label: "Unique copy", ok: !duplicate, weight: 8 }
  ];
  const score = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0);
  return { score, issues: checks.filter((check) => !check.ok).map((check) => check.label) };
}

export default function PinCreatorView({ settings }) {
  const [urlText, setUrlText] = useState("");
  const [pins, setPins] = useState([]);
  const [selectedStyle, setSelectedStyle] = useState("custom-ingredient-closeup");
  const [textPlacement, setTextPlacement] = useState("middle");
  const [aspectRatio, setAspectRatio] = useState(settings?.pinterestPinRatio || "2:3");
  const [imageModel, setImageModel] = useState("ideogram");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvIntervalHours, setCsvIntervalHours] = useState(String(Math.max(1, Math.round(Number(settings?.pinCreator?.postInterval || settings?.postInterval || 120) / 60))));
  const [csvStartTime, setCsvStartTime] = useState("");
  const [repurposePacks, setRepurposePacks] = useState([]);
  const [ghlHeaders, setGhlHeaders] = useState([]);
  const [ghlRows, setGhlRows] = useState([]);
  const [showGhlEditor, setShowGhlEditor] = useState(false);
  const [ghlStartTime, setGhlStartTime] = useState("");
  const [ghlIntervalHours, setGhlIntervalHours] = useState(String(Math.max(1, Math.round(Number(settings?.pinCreator?.postInterval || settings?.postInterval || 120) / 60))));
  const [progress, setProgress] = useState({ active: false, label: "", current: 0, total: 0 });
  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const workingRef = useRef(false);
  const pinsRef = useRef([]);
  const repurposeRef = useRef(null);
  const saveDebounceRef = useRef(null);
  const boardNames = settings?.pinCreator?.boardNames || settings?.boardNames || [];
  const csvScheduleSettings = useMemo(() => ({
    ...settings,
    pinCreator: {
      ...(settings?.pinCreator || {}),
      postInterval: Math.max(1, Number(csvIntervalHours || 1)) * 60
    }
  }), [settings, csvIntervalHours]);
  const styleOptions = useMemo(() => {
    const customStyles = settings?.pinCreator?.customStyles || {};
    const orderedDefaults = styles.map(([id, fallbackName]) => [id, customStyles[id]?.name || fallbackName]);
    const extraCustom = Object.entries(customStyles)
      .filter(([id]) => !defaultStyleIds.includes(id))
      .map(([id, style]) => [id, style.name || id]);
    return [...orderedDefaults, ...extraCustom];
  }, [settings]);

  async function loadPinCreatorData({ silent = false } = {}) {
    const saved = await electronAPI.getPinCreatorPins?.();
    const queued = await electronAPI.getPinQueue?.();
    const savedPins = dedupePins(saved?.pins || pinsRef.current || []);
    const queuedPins = dedupePins((queued?.items || []).map((item) => ({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      url: item.url,
      articleId: item.articleId || "",
      queueType: item.queueType || "",
      sourceTitle: item.title || "",
      excerpt: item.excerpt || "",
      targetKeyword: item.targetKeyword || "",
      smartPinStyle: item.smartPinStyle || "",
      csvBoard: item.csvBoard || "",
      interests: item.interests || [],
      status: "loaded",
      createdAt: item.addedAt || new Date().toISOString()
    })));
    const next = dedupePins([...savedPins, ...queuedPins]);
    pinsRef.current = next;
    setPins(next);
    if (queuedPins.length) {
      await electronAPI.savePinCreatorPins?.(next);
      await electronAPI.ackPinQueue?.((queued?.items || []).map((item) => item.queueId).filter(Boolean));
      setStatus(`Loaded ${queuedPins.length} queued URL${queuedPins.length === 1 ? "" : "s"} from Content Studio and kept ${savedPins.length} saved pin${savedPins.length === 1 ? "" : "s"}.`);
    } else if (!silent && savedPins.length) {
      setStatus(`Loaded ${savedPins.length} saved pin${savedPins.length === 1 ? "" : "s"}.`);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      if (!active) return;
      await loadPinCreatorData({ silent: true });
    })().catch((error) => setStatus(error.message || "Could not load Pin Creator data."));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    return electronAPI.onPinQueueUpdated?.(() => {
      loadPinCreatorData({ silent: true }).catch((error) => setStatus(error.message || "Could not load queued published article."));
    });
  }, []);

  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  useEffect(() => {
    if (!csvOpen || !pins.length) return;
    const firstSlot = pins[0]?.csvPublishDate || scheduleSlots(1, csvScheduleSettings)[0];
    setCsvStartTime((current) => current || dateTimeLocalFromSlot(firstSlot));
  }, [csvOpen, pins.length, csvScheduleSettings]);

  useEffect(() => {
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      electronAPI.savePinCreatorPins?.(pinsRef.current).catch(() => {});
    };
  }, []);

  async function savePins(nextPins = pins, options = {}) {
    pinsRef.current = nextPins;
    setPins(nextPins);
    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = null;
    }
    if (options.debounce) {
      saveDebounceRef.current = setTimeout(() => {
        saveDebounceRef.current = null;
        electronAPI.savePinCreatorPins?.(pinsRef.current).catch(() => {});
      }, 650);
      return { success: true };
    }
    await electronAPI.savePinCreatorPins?.(nextPins);
  }

  function loadUrls() {
    const nextPins = dedupePins(urlText.split(/\r?\n/)
      .map(cleanUrlLine)
      .filter(Boolean)
      .map((item) => ({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ...item,
        interests: [],
        status: "loaded",
        createdAt: new Date().toISOString()
      })));
    if (!nextPins.length) {
      setStatus("Paste at least one valid URL.");
      return;
    }
    savePins(dedupePins([...nextPins, ...pinsRef.current]));
    setUrlText("");
    setStatus(`Loaded ${nextPins.length} URL${nextPins.length === 1 ? "" : "s"}.`);
  }

  async function waitWhilePaused() {
    while (pauseRef.current && !cancelRef.current) await new Promise((resolve) => setTimeout(resolve, 350));
  }

  async function runStep(label, filterFn, worker) {
    if (workingRef.current) return false;
    const currentPins = pinsRef.current;
    const targets = currentPins.filter(filterFn);
    if (!targets.length) {
      setStatus(`Nothing needs ${label}.`);
      return true;
    }
    cancelRef.current = false;
    workingRef.current = true;
    setWorking(true);
    setProgress({ active: true, label, current: 0, total: targets.length });
    let wasCancelled = false;
    let failedCount = 0;
    let fatalError = "";
    try {
      for (let index = 0; index < targets.length; index++) {
        await waitWhilePaused();
        if (cancelRef.current) break;
        const target = targets[index];
        setProgress({ active: true, label, current: index, total: targets.length });
        setStatus(`${label} ${index + 1}/${targets.length}: ${target.sourceTitle || target.url}`);
        try {
          const latestTarget = pinsRef.current.find((pin) => pin.id === target.id) || target;
          const updated = await worker({ ...latestTarget }, index);
          const nextPins = mergePinResult(pinsRef.current, target.id, updated);
          await savePins(nextPins);
        } catch (error) {
          failedCount += 1;
          const message = error.message || `${label} failed.`;
          const nextPins = markPinFailure(pinsRef.current, target.id, message);
          await savePins(nextPins);
          if (/401|403|api token|unauthorized|forbidden/i.test(message)) {
            fatalError = message;
            break;
          }
        }
        setProgress({ active: true, label, current: index + 1, total: targets.length });
      }
      wasCancelled = cancelRef.current;
      setStatus(
        wasCancelled
          ? "Pin job canceled."
          : fatalError
          ? `${label} stopped: ${fatalError}`
          : failedCount
          ? `${label} finished with ${failedCount} failed item${failedCount === 1 ? "" : "s"}. Other pins were kept.`
          : `${label} finished.`
      );
    } catch (error) {
      fatalError = error.message || `${label} failed.`;
      setStatus(fatalError);
    } finally {
      workingRef.current = false;
      setWorking(false);
      cancelRef.current = false;
      setProgress((current) => ({ ...current, active: false }));
    }
    return !wasCancelled && !fatalError;
  }

  function generatePrompts(pinIds = null) {
    const selectedIds = Array.isArray(pinIds) ? new Set(pinIds) : null;
    return runStep("Generating prompts", (pin) => !pin.prompt && (!selectedIds || selectedIds.has(pin.id)), async (pin) => {
      const styleWithPlacement = `${pin.smartPinStyle || selectedStyle}::placement:${textPlacement}`;
      const result = await electronAPI.generatePrompt(pin.url, pin.interests || [], styleWithPlacement, `native-prompt-${pin.id}`, pinAiContext(pin));
      if (!result.success) throw new Error(result.error || "Prompt generation failed.");
      return { ...pin, prompt: result.prompt, status: "ready" };
    });
  }

  function generateTitles(pinIds = null) {
    const selectedIds = Array.isArray(pinIds) ? new Set(pinIds) : null;
    return runStep("Generating titles", (pin) => (!pin.title || !pin.description) && (!selectedIds || selectedIds.has(pin.id)), async (pin) => {
      const result = await electronAPI.generateTitleDescription(pin.url, pin.interests || [], pin.smartPinStyle || selectedStyle, `native-title-${pin.id}`, pinAiContext(pin));
      if (!result.success) throw new Error(result.error || "Title generation failed.");
      const board = chooseBoard({ ...pin, title: result.title, description: result.description }, boardNames);
      return { ...pin, title: result.title, description: result.description, csvBoard: board, csvKeywords: seoKeywords({ ...pin, title: result.title, description: result.description }, board), status: pin.prompt ? "ready" : "loaded" };
    });
  }

  function generateImages(pinIds = null) {
    const selectedIds = Array.isArray(pinIds) ? new Set(pinIds) : null;
    return runStep("Generating images", (pin) => pin.prompt && !displayImage(pin) && (!selectedIds || selectedIds.has(pin.id)), async (pin) => {
      const prompt = `${pin.prompt}\n\n${placementImageInstruction(textPlacement)}`;
      const result = await electronAPI.generateImage(prompt, aspectRatio, imageModel, pin.url, `native-image-${pin.id}`);
      if (!result.success) throw new Error(result.error || "Image generation failed.");
      const imageUrl = result.displayUrl || result.localImageUrl || result.imgurUrl || result.imageUrl || "";
      return { ...pin, imageUrl, displayUrl: imageUrl, localImageUrl: result.localImageUrl || "", localPath: result.localPath || "", remoteImageUrl: result.remoteImageUrl || result.imageUrl || "", imgurUrl: result.imgurUrl || "", status: "completed" };
    });
  }

  async function generateFullPack() {
    const promptsComplete = await generatePrompts();
    if (!promptsComplete) return;
    const missingPromptIds = pinsRef.current.filter((pin) => !pin.prompt).map((pin) => pin.id);
    if (missingPromptIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const promptRetryComplete = await generatePrompts(missingPromptIds);
      if (!promptRetryComplete) return;
    }
    const titlesComplete = await generateTitles();
    if (!titlesComplete) return;
    const missingTitleIds = pinsRef.current.filter((pin) => !pin.title || !pin.description).map((pin) => pin.id);
    if (missingTitleIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const titleRetryComplete = await generateTitles(missingTitleIds);
      if (!titleRetryComplete) return;
    }
    const imagesComplete = await generateImages();
    if (!imagesComplete) return;
    const missingImageIds = pinsRef.current.filter((pin) => pin.prompt && !displayImage(pin)).map((pin) => pin.id);
    if (missingImageIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await generateImages(missingImageIds);
    }
    const normalizedPins = pinsRef.current.map((pin) => isPinComplete(pin) ? { ...pin, status: "completed", error: "" } : pin);
    await savePins(normalizedPins);
    const incomplete = normalizedPins.filter((pin) => !isPinComplete(pin));
    setStatus(incomplete.length
      ? `Generated ${pinsRef.current.length - incomplete.length} of ${pinsRef.current.length} pins. ${incomplete.length} pin${incomplete.length === 1 ? " needs" : "s need"} retry.`
      : `Generated all ${pinsRef.current.length} pins successfully.`);
  }

  async function retryPins(pinIds) {
    const ids = [...new Set(pinIds || [])];
    if (!ids.length || working) return;
    const promptsComplete = await generatePrompts(ids);
    if (!promptsComplete) return;
    const titlesComplete = await generateTitles(ids);
    if (!titlesComplete) return;
    await generateImages(ids);
    const normalizedPins = pinsRef.current.map((pin) => ids.includes(pin.id) && isPinComplete(pin) ? { ...pin, status: "completed", error: "" } : pin);
    await savePins(normalizedPins);
    const remaining = normalizedPins.filter((pin) => ids.includes(pin.id) && !isPinComplete(pin));
    setStatus(remaining.length
      ? `${remaining.length} selected pin${remaining.length === 1 ? " still needs" : "s still need"} attention.`
      : `Recovered ${ids.length} pin${ids.length === 1 ? "" : "s"} successfully.`);
  }

  async function regenerateImage(pinId) {
    if (workingRef.current) return;
    const pin = pins.find((item) => item.id === pinId);
    if (!pin?.prompt) return;
    workingRef.current = true;
    setWorking(true);
    setProgress({ active: true, label: "Regenerating image", current: 0, total: 1 });
    setStatus("Regenerating pin image...");
    try {
      const prompt = `${pin.prompt}\n\n${placementImageInstruction(textPlacement)}`;
      const result = await electronAPI.generateImage(prompt, aspectRatio, imageModel, pin.url, `native-regen-${pin.id}`);
      if (!result.success) throw new Error(result.error || "Image generation failed.");
      const imageUrl = result.displayUrl || result.localImageUrl || result.imgurUrl || result.imageUrl || "";
      await savePins(pinsRef.current.map((item) => item.id === pinId ? { ...item, imageUrl, displayUrl: imageUrl, localImageUrl: result.localImageUrl || "", localPath: result.localPath || "", remoteImageUrl: result.remoteImageUrl || result.imageUrl || "", imgurUrl: result.imgurUrl || "", status: "completed", error: "" } : item));
      setProgress({ active: true, label: "Regenerating image", current: 1, total: 1 });
      setStatus("Pin image regenerated.");
    } catch (error) {
      setStatus(error.message || "Could not regenerate image.");
    } finally {
      workingRef.current = false;
      setWorking(false);
      setProgress((current) => ({ ...current, active: false }));
    }
  }

  async function regeneratePrompt(pinId) {
    if (workingRef.current) return;
    const pin = pins.find((item) => item.id === pinId);
    if (!pin?.url) return;
    workingRef.current = true;
    setWorking(true);
    setProgress({ active: true, label: "Regenerating prompt", current: 0, total: 1 });
    setStatus("Regenerating pin prompt...");
    try {
      const styleWithPlacement = `${pin.smartPinStyle || selectedStyle}::placement:${textPlacement}`;
      const result = await electronAPI.generatePrompt(pin.url, pin.interests || [], styleWithPlacement, `native-reprompt-${pin.id}`, pinAiContext(pin));
      if (!result.success) throw new Error(result.error || "Prompt generation failed.");
      await savePins(pinsRef.current.map((item) => item.id === pinId ? { ...item, prompt: result.prompt, status: "ready", error: "" } : item));
      setProgress({ active: true, label: "Regenerating prompt", current: 1, total: 1 });
      setStatus("Pin prompt regenerated. Click Regenerate Image to remake the image with this placement.");
    } catch (error) {
      setStatus(error.message || "Could not regenerate prompt.");
    } finally {
      workingRef.current = false;
      setWorking(false);
      setProgress((current) => ({ ...current, active: false }));
    }
  }

  function updatePin(pinId, patch) {
    if (Object.prototype.hasOwnProperty.call(patch, "csvPublishDate")) {
      const rowIndex = pinsRef.current.findIndex((pin) => pin.id === pinId);
      const next = rowIndex >= 0
        ? applyScheduleFrom(rowIndex, patch.csvPublishDate, pinsRef.current, csvScheduleSettings)
        : pinsRef.current;
      savePins(next, { debounce: true });
      return;
    }
    const next = pinsRef.current.map((pin) => {
      if (pin.id !== pinId) return pin;
      const updated = { ...pin, ...patch };
      if (patch.title !== undefined || patch.description !== undefined || patch.csvBoard !== undefined) {
        const board = patch.csvBoard || updated.csvBoard || chooseBoard(updated, boardNames);
        updated.csvBoard = board;
        updated.csvKeywords = updated.csvKeywords || seoKeywords(updated, board);
      }
      return updated;
    });
    savePins(next, { debounce: true });
  }

  function clearPins() {
    if (!window.confirm("Clear all Pin Creator items?")) return;
    savePins([]);
    setCsvOpen(false);
    setStatus("Pin Creator cleared.");
  }

  function togglePause() {
    pauseRef.current = !pauseRef.current;
    setPaused(pauseRef.current);
  }

  function cancelJobs() {
    cancelRef.current = true;
    pauseRef.current = false;
    setPaused(false);
    electronAPI.cancelJobsByPrefix?.(["native-"]);
    setStatus("Cancel requested.");
  }

  function buildCsvRows(sourcePins = pinsRef.current) {
    const slots = scheduleSlots(sourcePins.length, csvScheduleSettings);
    const headers = ["Title", "Description", "Media URL", "Link", "Pinterest board", "Publish date", "Thumbnail", "Keywords"];
    const rows = sourcePins.map((pin, index) => {
      const board = pin.csvBoard || chooseBoard(pin, boardNames);
      const keywords = pin.csvKeywords || seoKeywords(pin, board);
      return [pin.title || "", (pin.description || "").replace(/\*\*(.*?)\*\*/g, "$1"), publicImage(pin), trackedPinUrl(pin, index, "pinterest", "pin"), board, pin.csvPublishDate || slots[index], pin.csvThumbnail || "", keywords];
    });
    return { headers, rows };
  }

  function applyPinterestSchedule() {
    if (!pinsRef.current.length) {
      setStatus("No Pinterest CSV rows to schedule.");
      return;
    }
    const startSlot = slotFromDateTimeLocal(csvStartTime);
    const start = parseSlot(startSlot);
    if (!start) {
      setStatus("Choose a valid Pinterest CSV start time.");
      return;
    }
    const intervalHours = Math.max(1, Number(csvIntervalHours || 1));
    const intervalMinutes = intervalHours * 60;
    const next = pinsRef.current.map((pin, index) => {
      const date = new Date(start.getTime() + index * intervalMinutes * 60 * 1000);
      return { ...pin, csvPublishDate: formatSlot(date) };
    });
    savePins(next);
    setStatus(`Applied ${intervalHours}-hour Pinterest CSV spacing to ${next.length} row${next.length === 1 ? "" : "s"}.`);
  }

  function exportPinterestCsv() {
    const { headers, rows } = buildCsvRows(pinsRef.current);
    const missing = rows.flatMap((row, index) => [
      !row[0] ? `Row ${index + 1}: missing title` : "",
      !row[1] ? `Row ${index + 1}: missing description` : "",
      !row[2] ? `Row ${index + 1}: missing media URL` : "",
      !row[3] ? `Row ${index + 1}: missing link` : "",
      !row[4] ? `Row ${index + 1}: missing board` : ""
    ].filter(Boolean));
    if (missing.length) {
      window.alert(`Pinterest CSV is missing required fields:\n\n${missing.slice(0, 12).join("\n")}${missing.length > 12 ? "\n..." : ""}`);
      return;
    }
    const seen = new Map();
    const fixedRows = rows.map((row, index) => {
      const key = row[3].toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, 1);
        return row;
      }
      const count = seen.get(key) + 1;
      seen.set(key, count);
      return [
        row[0].length < 90 ? `${row[0]} Idea ${count}` : row[0],
        row[1],
        row[2],
        addUtmParams(row[3], "pinterest", row[0], `pin_${index + 1}`, "organic_social"),
        row[4],
        row[5],
        row[6],
        row[7]
      ];
    });
    downloadCsv([headers, ...fixedRows], `pinterest-bulk-upload-${Date.now()}.csv`);
    setStatus(`Exported ${rows.length} Pinterest CSV row${rows.length === 1 ? "" : "s"}.`);
  }

  async function prepareGhlEditor(packsToPrepare = repurposePacks) {
    if (!packsToPrepare.length) {
      setStatus("Create social posts before editing the GHL CSV.");
      return;
    }
    const result = await electronAPI.prepareRepurposeGhlRows?.({ packs: packsToPrepare });
    if (!result?.success) {
      setStatus(result?.error || "Could not prepare the GoHighLevel CSV editor.");
      return;
    }
    const nextPacks = Array.isArray(result.packs) && result.packs.length ? result.packs : packsToPrepare;
    setRepurposePacks(nextPacks);
    setGhlHeaders(result.headers || []);
    setGhlRows(result.rows || []);
    setGhlStartTime(formatGhlDateTimeLocal(result.rows?.[0]?.[0]));
    setGhlIntervalHours(String(Math.max(1, Math.round(Number(settings?.pinCreator?.postInterval || settings?.postInterval || 120) / 60))));
    setShowGhlEditor(true);
    await electronAPI.saveRepurposePacks?.({ packs: nextPacks, replace: true, source: "nativePinCreator" });
    const imageNote = result.missingImageCount ? ` ${result.missingImageCount} row${result.missingImageCount === 1 ? "" : "s"} still need image URLs.` : "";
    setStatus(`Repurpose content is ready below with an editable GoHighLevel CSV.${imageNote}`);
    window.requestAnimationFrame(() => repurposeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function sendRepurpose() {
    const readyPins = pins.filter((pin) => pin.title && pin.description && displayImage(pin));
    if (!readyPins.length) {
      setStatus("Generate pin images, titles, and descriptions before repurposing.");
      return;
    }
    setWorking(true);
    setProgress({ active: true, label: "Creating social pack", current: 0, total: 2 });
    setStatus("Creating social pack and resizing pin images...");
    try {
      const packs = readyPins.map((pin, index) => buildSocialPack(pin, index));
      setProgress({ active: true, label: "Creating social pack", current: 1, total: 2 });
      const variantResult = await electronAPI.createRepurposeImageVariants?.({
        packs,
        pins: readyPins,
        platforms: ["instagram", "facebook"],
        imageSource: "pin"
      });
      const packsToSave = variantResult?.success ? (variantResult.packs || packs) : packs;
      await electronAPI.saveRepurposePacks?.({ packs: packsToSave, replace: true, source: "nativePinCreator" });
      setRepurposePacks(packsToSave);
      await prepareGhlEditor(packsToSave);
      setProgress({ active: true, label: "Creating social pack", current: 2, total: 2 });
      const missing = variantResult?.missing?.length ? ` ${variantResult.missing.length} pack${variantResult.missing.length === 1 ? "" : "s"} still need images.` : "";
      setStatus(`Created ${packsToSave.length} pin-based social post${packsToSave.length === 1 ? "" : "s"} in Pin Creator. GHL will create one row per pin.${missing}`);
    } catch (error) {
      setStatus(error.message || "Could not create repurpose pack.");
    } finally {
      setWorking(false);
      setProgress((current) => ({ ...current, active: false }));
    }
  }

  async function copy(text) {
    await navigator.clipboard.writeText(text || "");
    setStatus("Copied.");
  }

  function updateGhlCell(rowIndex, columnIndex, value) {
    setGhlRows((rows) => rows.map((row, index) => {
      if (index !== rowIndex) return row;
      const next = [...row];
      next[columnIndex] = value;
      return next;
    }));
  }

  function applyGhlSchedule() {
    if (!ghlRows.length) {
      setStatus("No GoHighLevel CSV rows to schedule.");
      return;
    }
    const minStart = new Date(Date.now() + 30 * 60 * 1000);
    const parsedStart = parseGhlScheduleDate(ghlStartTime);
    const start = parsedStart < minStart ? minStart : parsedStart;
    const intervalHours = Math.max(1, Number(ghlIntervalHours || 1));
    const intervalMs = intervalHours * 60 * 60 * 1000;
    setGhlRows((rows) => rows.map((row, index) => {
      const next = [...row];
      next[0] = formatGhlScheduleDate(new Date(start.getTime() + index * intervalMs));
      return next;
    }));
    setStatus(`Applied ${intervalHours}-hour GoHighLevel spacing to ${ghlRows.length} row${ghlRows.length === 1 ? "" : "s"}.`);
  }

  async function exportGhlCsv() {
    if (!ghlRows.length) {
      setStatus("Open the GoHighLevel CSV editor first.");
      return;
    }
    setWorking(true);
    setStatus("Saving edited GoHighLevel CSV...");
    try {
      const result = await electronAPI.exportRepurposeGhlRows?.({ headers: ghlHeaders, rows: ghlRows });
      if (result?.success) {
        const imageNote = result.missingImageCount ? ` ${result.missingImageCount} row${result.missingImageCount === 1 ? "" : "s"} need image URLs added in GHL.` : "";
        setStatus(`Saved edited GoHighLevel CSV: ${result.filePath}.${imageNote}`);
      } else if (result?.canceled) {
        setStatus("Export canceled.");
      } else {
        setStatus(result?.error || "Export failed.");
      }
    } catch (error) {
      setStatus(error.message || "Export failed.");
    } finally {
      setWorking(false);
    }
  }

  async function uploadGhlCsv() {
    if (!ghlRows.length) {
      setStatus("Open the GoHighLevel CSV editor first.");
      return;
    }
    const hasSocialAccounts = settings?.ghlSocialAccountIds || settings?.ghlInstagramAccountIds || settings?.ghlFacebookAccountIds;
    if (!settings?.ghlApiToken || !settings?.ghlLocationId || !hasSocialAccounts || !settings?.ghlUserId) {
      setStatus("Add your GoHighLevel token, Location ID, Social Account IDs, and User ID in Settings first.");
      return;
    }
    setWorking(true);
    setStatus("Scheduling posts in GoHighLevel Social Planner...");
    try {
      const result = await electronAPI.uploadRepurposeGhlRows?.({ headers: ghlHeaders, rows: ghlRows });
      if (result?.success) {
        const imageNote = result.missingImageCount ? ` ${result.missingImageCount} row${result.missingImageCount === 1 ? "" : "s"} uploaded without image URLs.` : "";
        const count = result.createdCount || result.rowCount || ghlRows.length;
        const verificationNote = result.unverifiedCount
          ? ` ${result.verifiedCount || 0} verified in the planner; ${result.unverifiedCount} accepted but not yet confirmed.`
          : ` ${result.verifiedCount || count} verified in the planner.`;
        setStatus(`Scheduled ${count} post${count === 1 ? "" : "s"} in GoHighLevel Social Planner.${verificationNote}${imageNote}`);
      } else {
        setStatus(result?.error || "GoHighLevel upload failed.");
      }
    } catch (error) {
      setStatus(error.message || "GoHighLevel upload failed.");
    } finally {
      setWorking(false);
    }
  }

  const completed = pins.filter((pin) => pin.status === "completed").length;
  const failedPins = pins.filter((pin) => pin.status === "error" || !isPinComplete(pin));
  const ready = pins.filter((pin) => pin.prompt).length;
  const titled = pins.filter((pin) => pin.title && pin.description).length;
  const progressPercent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
  const { headers, rows } = useMemo(() => buildCsvRows(pins), [pins, csvScheduleSettings, boardNames]);

  return (
    <section className="animate-fade-in">
      <SectionHeader eyebrow="Pinterest" title="Pin Creator">
        Create Pinterest pins, match each pin to your saved boards, export Pinterest CSV, and build GHL social posts from the same tab.
      </SectionHeader>

      <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="soft-card rounded-lg p-4">
          <Field label="URLs">
            <textarea className={`${inputClass} min-h-40 resize-y leading-6`} value={urlText} onChange={(event) => setUrlText(event.target.value)} placeholder="https://yourblog.com/easy-weeknight-dinner/" />
          </Field>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={loadUrls}><Upload className="h-4 w-4" />Load URLs</Button>
            <Button variant="secondary" onClick={generatePrompts} disabled={working || !pins.length}><Sparkles className="h-4 w-4" />Prompts</Button>
            <Button variant="secondary" onClick={generateTitles} disabled={working || !pins.length}><Save className="h-4 w-4" />Titles</Button>
            <Button onClick={generateImages} disabled={working || !ready}><ImageIcon className="h-4 w-4" />Images</Button>
            <Button onClick={generateFullPack} disabled={working || !pins.length}><Play className="h-4 w-4" />Generate All</Button>
            {failedPins.length ? <Button variant="secondary" onClick={() => retryPins(failedPins.map((pin) => pin.id))} disabled={working}><RefreshCw className="h-4 w-4" />Retry Failed ({failedPins.length})</Button> : null}
          </div>
        </div>

        <div className="soft-card rounded-lg p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-white p-3 ring-1 ring-slate-200"><div className="text-xl font-black">{pins.length}</div><div className="text-xs font-bold text-slate-500">Loaded</div></div>
            <div className="rounded-md bg-white p-3 ring-1 ring-slate-200"><div className="text-xl font-black">{titled}</div><div className="text-xs font-bold text-slate-500">Titles</div></div>
            <div className="rounded-md bg-white p-3 ring-1 ring-slate-200"><div className="text-xl font-black">{completed}</div><div className="text-xs font-bold text-slate-500">Images</div></div>
          </div>
          <div className="mt-4 grid gap-3">
            <Field label="Pin style">
              <select className={inputClass} value={selectedStyle} onChange={(event) => setSelectedStyle(event.target.value)}>
                {styleOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </Field>
            <Field label="Text placement">
              <select className={inputClass} value={textPlacement} onChange={(event) => setTextPlacement(event.target.value)}>
                {textPlacements.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </Field>
            <Field label="Image model">
              <select className={inputClass} value={imageModel} onChange={(event) => setImageModel(event.target.value)}>
                <option value="ideogram">Ideogram</option>
                <option value="pruna">Z-Image Turbo</option>
              </select>
            </Field>
            <Field label="Aspect ratio">
              <select className={inputClass} value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                <option value="2:3">2:3 Recommended Pin</option>
                <option value="9:16">9:16 Tall Pin</option>
                <option value="1:1">1:1 Square</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 grid gap-2">
            <Button variant="secondary" onClick={() => setCsvOpen((value) => !value)} disabled={!pins.length}><Link2 className="h-4 w-4" />{csvOpen ? "Hide" : "Edit"} Pinterest CSV</Button>
            <Button variant="secondary" onClick={exportPinterestCsv} disabled={!pins.length}><Download className="h-4 w-4" />Export Pinterest CSV</Button>
            <Button variant="secondary" onClick={sendRepurpose} disabled={!titled}><Send className="h-4 w-4" />Repurpose Social</Button>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={togglePause} disabled={!working}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{paused ? "Resume" : "Pause"}</Button>
              <Button variant="danger" className="flex-1" onClick={cancelJobs} disabled={!working}>Cancel</Button>
            </div>
            <Button variant="danger" onClick={clearPins} disabled={!pins.length}><Trash2 className="h-4 w-4" />Clear</Button>
          </div>
          {(working || progress.active) ? (
            <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50/80 p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs font-black uppercase tracking-wide text-violet-700">
                <span className="min-w-0 truncate">{paused ? "Paused" : progress.label || "Working"}</span>
                <span className="shrink-0">{progress.current}/{progress.total || "..."} ({progressPercent}%)</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white ring-1 ring-violet-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 transition-all duration-300"
                  style={{ width: `${Math.max(3, progressPercent)}%` }}
                />
              </div>
              <div className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                This keeps running while you switch screens.
              </div>
            </div>
          ) : null}
          {status ? <div className="mt-4 rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{status}</div> : null}
        </div>
      </div>

      {csvOpen ? (
        <div className="mb-5 soft-card rounded-lg p-4">
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">Pinterest CSV Editor</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{pins.length} row{pins.length === 1 ? "" : "s"} ready. Edit any field before export.</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block text-xs font-black uppercase text-slate-500">
                Start Time
                <input className={`${inputClass} mt-1 h-10 w-56`} type="datetime-local" value={csvStartTime} onChange={(event) => setCsvStartTime(event.target.value)} />
              </label>
              <label className="block text-xs font-black uppercase text-slate-500">
                Interval Hours
                <input className={`${inputClass} mt-1 h-10 w-36`} type="number" min="1" step="1" value={csvIntervalHours} onChange={(event) => setCsvIntervalHours(event.target.value)} />
              </label>
              <Button variant="secondary" className="h-10" onClick={applyPinterestSchedule} disabled={!pins.length}>Apply Time</Button>
              <Button className="h-10" onClick={exportPinterestCsv}><Download className="h-4 w-4" />Export CSV</Button>
            </div>
          </div>
          <div className="max-h-[560px] overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-max border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr>{headers.map((header) => <th key={header} className="border-b border-slate-200 px-3 py-3 text-left text-xs font-black uppercase text-slate-500">{header}</th>)}</tr>
              </thead>
              <tbody>
                {pins.map((pin, rowIndex) => (
                  <tr key={pin.id} className="border-b border-slate-100 align-top last:border-b-0">
                    {headers.map((header, columnIndex) => {
                      const value = rows[rowIndex]?.[columnIndex] || "";
                      const field = header.toLowerCase();
                      const patchKey = field.includes("title") ? "title" : field.includes("description") ? "description" : field.includes("media") ? "imgurUrl" : field === "link" ? "url" : field.includes("board") ? "csvBoard" : field.includes("publish") ? "csvPublishDate" : field.includes("thumbnail") ? "csvThumbnail" : "csvKeywords";
                      return (
                        <td key={`${pin.id}-${header}`} className="px-3 py-3">
                          {field.includes("description") || field.includes("keywords") ? (
                            <textarea className={`${inputClass} h-24 min-w-[280px] resize-y`} value={value} onChange={(event) => updatePin(pin.id, { [patchKey]: event.target.value })} />
                          ) : field.includes("board") && boardNames.length ? (
                            <select className={`${inputClass} h-10 min-w-[220px]`} value={value} onChange={(event) => updatePin(pin.id, { csvBoard: event.target.value, csvBoardAuto: false })}>
                              {boardNames.map((board) => <option key={board} value={board}>{board}</option>)}
                            </select>
                          ) : field.includes("publish") ? (
                            <div className="flex min-w-[280px] gap-2">
                              <input type="date" className={`${inputClass} h-10 min-w-[138px]`} value={slotDate(value)} onChange={(event) => updatePin(pin.id, { csvPublishDate: composeSlot(event.target.value, slotTime(value)) })} />
                              <select className={`${inputClass} h-10 min-w-[118px]`} value={slotTime(value)} onChange={(event) => updatePin(pin.id, { csvPublishDate: composeSlot(slotDate(value), event.target.value) })}>
                                {slotTimeOptions(value).map((time) => <option key={time} value={time}>{time}</option>)}
                              </select>
                            </div>
                          ) : (
                            <input className={`${inputClass} h-10 min-w-[220px]`} value={value} onChange={(event) => updatePin(pin.id, { [patchKey]: event.target.value })} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {(showGhlEditor || repurposePacks.length) ? (
        <div ref={repurposeRef} className="mb-5 space-y-5">
          {showGhlEditor ? (
            <div className="soft-card rounded-lg p-4">
              <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-900">GoHighLevel CSV Editor</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{ghlRows.length} row{ghlRows.length === 1 ? "" : "s"} ready from your generated pins. Edit any field before export or upload.</p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block text-xs font-black uppercase text-slate-500">
                    Start Time
                    <input className={`${inputClass} mt-1 h-10 w-56`} type="datetime-local" value={ghlStartTime} onChange={(event) => setGhlStartTime(event.target.value)} />
                  </label>
                  <label className="block text-xs font-black uppercase text-slate-500">
                    Interval Hours
                    <input className={`${inputClass} mt-1 h-10 w-36`} type="number" min="1" step="1" value={ghlIntervalHours} onChange={(event) => setGhlIntervalHours(event.target.value)} />
                  </label>
                  <Button variant="secondary" className="h-10" onClick={applyGhlSchedule} disabled={!ghlRows.length}>Apply Time</Button>
                  <Button className="h-10" onClick={exportGhlCsv} disabled={working || !ghlRows.length}><Download className="h-4 w-4" />Export CSV</Button>
                  <Button variant="secondary" className="h-10" onClick={uploadGhlCsv} disabled={working || !ghlRows.length}><UploadCloud className="h-4 w-4" />Upload to GHL</Button>
                </div>
              </div>
              <div className="max-h-[560px] overflow-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-max border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr>
                      {ghlHeaders.map((header, index) => (
                        <th key={`${header}-${index}`} className="border-b border-slate-200 px-3 py-3 text-left text-xs font-black uppercase text-slate-500">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ghlRows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-slate-100 align-top last:border-b-0">
                        {ghlHeaders.map((header, columnIndex) => {
                          const isLong = /content|comment|caption/i.test(header);
                          return (
                            <td key={`${rowIndex}-${columnIndex}`} className="px-3 py-3">
                              {isLong ? (
                                <textarea
                                  className={`${inputClass} h-28 min-w-[360px] resize-y text-sm leading-6`}
                                  value={row[columnIndex] || ""}
                                  onChange={(event) => updateGhlCell(rowIndex, columnIndex, event.target.value)}
                                />
                              ) : (
                                <input
                                  className={`${inputClass} h-10 min-w-[190px] text-sm`}
                                  value={row[columnIndex] || ""}
                                  onChange={(event) => updateGhlCell(rowIndex, columnIndex, event.target.value)}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="soft-card rounded-lg p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">Repurpose Preview</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">{repurposePacks.length} social post{repurposePacks.length === 1 ? "" : "s"} created from your pins.</p>
              </div>
              <Button variant="secondary" onClick={() => prepareGhlEditor(repurposePacks)} disabled={working || !repurposePacks.length}><Download className="h-4 w-4" />Edit GHL CSV</Button>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {repurposePacks.map((pack) => {
                const data = pack.content || {};
                const image = pack.imageAssets?.[0]?.publicUrl || pack.imageAssets?.[0]?.fileUrl || "";
                return (
                  <article key={pack.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-black uppercase text-indigo-600">Instagram + Facebook</div>
                        <h3 className="mt-1 line-clamp-2 text-base font-black leading-6 text-slate-900">{pack.articleTitle}</h3>
                      </div>
                      <Button variant="secondary" className="h-9 px-3" onClick={() => copy(socialPackText(pack))}><Clipboard className="h-4 w-4" />Copy</Button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-[140px_1fr]">
                      <div className="overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200">
                        {image ? <img src={image} alt={pack.articleTitle || "Social image"} className="aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center text-slate-400"><ImageIcon className="h-8 w-8" /></div>}
                      </div>
                      <div className="space-y-3 text-sm leading-6 text-slate-700">
                        {data.socialPost?.caption ? <p className="whitespace-pre-line">{data.socialPost.caption}</p> : null}
                        {data.socialPost?.hashtags?.length ? <p className="font-bold text-indigo-600">{data.socialPost.hashtags.join(" ")}</p> : null}
                        {data.facebook?.pagePost ? <p className="rounded-md bg-slate-50 p-3"><strong>Facebook:</strong> {data.facebook.pagePost}</p> : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {!pins.length ? (
        <EmptyState title="No pins loaded">Paste URLs or publish/send articles from the article editor to start creating pins.</EmptyState>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {pins.map((pin, index) => {
            const quality = pinQuality(pin, pins, boardNames);
            return (
            <article key={pin.id} className="soft-card rounded-lg p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-black uppercase text-indigo-600">{pin.status || "loaded"}</div>
                  <h2 className="mt-1 line-clamp-2 text-lg font-black leading-6 text-slate-900">{pin.title || pin.sourceTitle || pin.url}</h2>
                  <p className="mt-1 truncate text-sm font-medium text-slate-500">{trackedPinUrl(pin, index, "pinterest", "pin") || pin.url}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-black ${quality.score >= 80 ? "bg-emerald-100 text-emerald-700" : quality.score >= 60 ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`} title={quality.issues.length ? `Needs: ${quality.issues.join(", ")}` : "Ready to publish"}>Quality {quality.score}</span>
                  <Button variant="danger" className="h-9 px-3" onClick={() => savePins(pins.filter((item) => item.id !== pin.id))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              {pin.error ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                  <span>{pin.error}</span>
                  <Button variant="secondary" className="h-9 px-3" onClick={() => retryPins([pin.id])} disabled={working}><RefreshCw className="h-4 w-4" />Retry This Pin</Button>
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                <div className="overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200">
                  {displayImage(pin) ? <img src={displayImage(pin)} alt={pin.title || "Generated pin"} className="aspect-[2/3] w-full object-cover" /> : <div className="grid aspect-[2/3] place-items-center text-slate-400"><ImageIcon className="h-10 w-10" /></div>}
                </div>
                <div className="space-y-3">
                  <Field label="Title"><input className={inputClass} value={pin.title || ""} onChange={(event) => updatePin(pin.id, { title: event.target.value })} /></Field>
                  <Field label="Description"><textarea className={`${inputClass} min-h-24 resize-y`} value={pin.description || ""} onChange={(event) => updatePin(pin.id, { description: event.target.value })} /></Field>
                  <Field label="Prompt"><textarea className={`${inputClass} min-h-24 resize-y font-mono text-xs`} value={pin.prompt || ""} onChange={(event) => updatePin(pin.id, { prompt: event.target.value, status: "ready" })} /></Field>
                  <div className="grid gap-2 md:grid-cols-2">
                    <Field label="Board">
                      {boardNames.length ? (
                        <select className={inputClass} value={pin.csvBoard || chooseBoard(pin, boardNames)} onChange={(event) => updatePin(pin.id, { csvBoard: event.target.value, csvBoardAuto: false })}>
                          {boardNames.map((board) => <option key={board} value={board}>{board}</option>)}
                        </select>
                      ) : (
                        <input className={inputClass} value={pin.csvBoard || ""} onChange={(event) => updatePin(pin.id, { csvBoard: event.target.value })} />
                      )}
                    </Field>
                    <Field label="Interests"><input className={inputClass} value={(pin.interests || []).join(", ")} onChange={(event) => updatePin(pin.id, { interests: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => copy([pin.title, pin.description].filter(Boolean).join("\n\n"))}><Clipboard className="h-4 w-4" />Copy</Button>
                    <Button variant="secondary" onClick={() => regeneratePrompt(pin.id)} disabled={working || !pin.url}><Sparkles className="h-4 w-4" />Regenerate Prompt</Button>
                    <Button variant="secondary" onClick={() => regenerateImage(pin.id)} disabled={working || !pin.prompt}><RefreshCw className="h-4 w-4" />Regenerate Image</Button>
                    {pin.localPath ? <Button variant="secondary" onClick={() => electronAPI.openPath(pin.localPath)}><ImageIcon className="h-4 w-4" />Open Image</Button> : null}
                  </div>
                </div>
              </div>
            </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
