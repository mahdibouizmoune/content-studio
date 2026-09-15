import { Clipboard, Download, Image as ImageIcon, Link2, Pause, Play, RefreshCw, Save, Send, Sparkles, Trash2, Upload, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import PinterestDeliveryHistory from "@/components/PinterestDeliveryHistory";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { Button, EmptyState, Field, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";
import { scoreSmartBoard, smartPinSignals } from "@/lib/smartContentEngine";
import { addUtmParams } from "@/lib/utm";
import { markPinFailure, mergePinResult, mergePreparedPinHosting } from "@/lib/pinBatch.mjs";
import {
  buildInterestProfile,
  diversifyByInterest,
  interestAlignmentPreflight,
  rankBoardsByInterest,
  resolveInterestProfile
} from "@/lib/pinterestInterestIntelligence.mjs";
import { selectPinterestPublicImage, stablePinContentId } from "@/lib/pinterestSource.mjs";
import {
  PINTEREST_SCHEDULE_WINDOW_DAYS,
  PINTEREST_SCHEDULE_WINDOW_MS,
  PINTEREST_SCHEDULE_LEAD_MS,
  compactPinterestKeywords,
  fitPinterestSchedule,
  isWithinPinterestScheduleWindow
} from "@/lib/pinterestCsv.mjs";

const styles = [
  ["custom-july-original-ai", "Ingredient Closeup Pin (Default)"],
  ["custom-modern-recipe-magazine", "Modern Recipe Magazine"],
  ["custom-minimal-editorial", "Minimal Editorial"]
];
const defaultStyleIds = styles.map(([id]) => id);
const retiredStyleIds = new Set([
  "custom-ingredient-closeup",
  "custom-recipe-card",
  "custom-weeknight-solution",
  "custom-listicle-collage"
]);

const textPlacements = [
  ["middle", "Middle"],
  ["top", "Top"],
  ["bottom", "Bottom"]
];

const imageSourceModes = [
  ["generate-new", "Generate New Food Photo"],
  ["reuse-article", "Reuse Article Portrait"]
];

const overlayFonts = [
  ["serif-sans", "Playfair + Montserrat Pair (Recommended)"],
  ["food-editorial", "DM Serif + Poppins Pair"],
  ["poppins", "Poppins Bold"],
  ["montserrat", "Montserrat Bold"],
  ["playfair", "Playfair Display Bold"],
  ["bebas-neue", "Bebas Neue"],
  ["groovy", "Shrikhand Groovy"],
  ["cabin-sketch", "Cabin Sketch"],
  ["sacramento", "Sacramento Accent Script"]
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
    const normalizedUrl = String(item.url || "").trim().replace(/\/+$/, "").toLowerCase();
    const key = item.queueType === "internal-link"
      ? `url:${normalizedUrl}`
      : item.queueType === "interest-cluster" && item.clusterVariantId
      ? `cluster:${normalizedUrl}:${String(item.clusterVariantId).trim().toLowerCase()}`
      : item.articleId
      ? `article:${String(item.articleId).trim().toLowerCase()}`
      : `url:${String(item.url || "").trim().replace(/\/+$/, "").toLowerCase()}`;
    if (!key || key === "url:") continue;
    const existing = map.get(key) || {};
    const mergedPin = {
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
      hostedImageUrl: item.hostedImageUrl || existing.hostedImageUrl || "",
      csvMediaUrl: item.csvMediaUrl || existing.csvMediaUrl || "",
      csvBoard: item.csvBoard || existing.csvBoard || "",
      csvKeywords: item.csvKeywords || existing.csvKeywords || "",
      relatedTopics: item.relatedTopics?.length ? item.relatedTopics : existing.relatedTopics || [],
      csvPublishDate: item.csvPublishDate || existing.csvPublishDate || "",
      csvPublishImmediately: typeof item.csvPublishImmediately === "boolean"
        ? item.csvPublishImmediately
        : existing.csvPublishImmediately === true,
      status: existing.status && item.status === "loaded" ? existing.status : (item.status || existing.status || "")
    };
    mergedPin.interestProfile = resolveInterestProfile(mergedPin, item.interestProfile || existing.interestProfile);
    if (!mergedPin.relatedTopics.length) mergedPin.relatedTopics = mergedPin.interestProfile.relatedTopics;
    map.set(key, mergedPin);
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

function rankBoards(pin, boardNames = []) {
  if (!boardNames.length) return [];
  const interestProfile = resolveInterestProfile(pin);
  const interestScores = new Map(rankBoardsByInterest({ ...pin, interestProfile }, boardNames).map((match) => [match.board, match]));
  const haystack = normalize([pin.title, pin.description, pin.prompt, pin.sourceTitle, pin.url, ...(pin.interests || [])].join(" "));
  return boardNames.map((board) => {
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
    const interestMatch = interestScores.get(board);
    score += scoreSmartBoard(pin, board) + Number(interestMatch?.score || 0);
    if (/favorite products/i.test(board)) score -= 25;
    return {
      board,
      score,
      confidence: Math.min(100, Math.max(Number(interestMatch?.confidence || 0), Math.round(score / 2))),
      reason: score >= 100
        ? "Specific use-case match"
        : score >= 65
          ? "Strong recipe intent match"
          : score > 0
            ? "Closest keyword match"
            : "General recipe fallback"
    };
  }).sort((a, b) => b.score - a.score || a.board.localeCompare(b.board)).slice(0, 3);
}

function chooseBoard(pin, boardNames = []) {
  if (!boardNames.length) return pin.csvBoard || "";
  return rankBoards(pin, boardNames)[0]?.board
    || boardNames.find((board) => /easy recipe finds/i.test(board))
    || boardNames[0];
}

function seoKeywords(pin, board) {
  const smart = smartPinSignals(pin, board);
  const phrases = [];
  const titleTokens = tokenize(pin.title || pin.sourceTitle || "").filter((token) => !["recipe", "recipes", "easy"].includes(token));
  for (let index = 0; index < titleTokens.length - 1; index++) phrases.push(`${titleTokens[index]} ${titleTokens[index + 1]}`);
  const profileKeywords = intentProfiles.flatMap((profile) => profile.match.test([pin.title, pin.description, board, pin.url].join(" ")) ? profile.keywords : []);
  return compactPinterestKeywords(dedupe([
    ...(pin.interests || []),
    ...(pin.relatedTopics || pin.interestProfile?.relatedTopics || []),
    board,
    ...phrases.slice(0, 5),
    ...smart.keywords,
    ...profileKeywords,
    "recipe inspiration"
  ]).join(", "));
}

function publicImage(pin) {
  return selectPinterestPublicImage(pin);
}

function pinCampaignTitle(pin) {
  return pin.title || pin.sourceTitle || pin.description || pin.url || "recipe_pin";
}

function trackedPinUrl(pin, _index = 0, platform = "pinterest", contentPrefix = "pin") {
  return addUtmParams(
    pin.url || "",
    platform,
    pinCampaignTitle(pin),
    stablePinContentId(pin, contentPrefix),
    "organic_social"
  );
}

function displayImage(pin) {
  return pin.displayUrl || pin.localImageUrl || pin.imageUrl || pin.imgurUrl || pin.remoteImageUrl || "";
}

function isPinComplete(pin) {
  return Boolean(
    pin?.prompt
    && pin?.title
    && pin?.description
    && displayImage(pin)
    && pin?.imageQa?.dimensionsVerified === true
  );
}

function aiLetteringReviewKey(pin = {}) {
  return String(
    pin.imageQa?.perceptualHash
    || pin.imageQa?.publicValidatedUrl
    || pin.hostedImageUrl
    || pin.csvMediaUrl
    || pin.generationConfig?.generatedAt
    || ""
  );
}

function hasCurrentAiLetteringReview(pin = {}) {
  const key = aiLetteringReviewKey(pin);
  return Boolean(
    key
    && pin.generationConfig?.textRenderMode === "ai"
    && pin.imageQa?.aiLetteringReviewed === true
    && pin.imageQa?.aiLetteringReviewedFor === key
  );
}

function normalizedPinterestSourceRatio(value = "") {
  return ["2:3", "9:16", "1:1"].includes(String(value)) ? String(value) : "2:3";
}

function formatSlot(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatPinterestUtc(value = "") {
  if (!String(value || "").trim()) return "";
  const parsed = parseSlot(value);
  return parsed ? parsed.toISOString().slice(0, 19) : String(value);
}

function parseSlot(value = "") {
  const normalized = String(value || "").trim().replace("T", " ");
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(date.getTime()) || formatSlot(date) !== normalized ? null : date;
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
  const date = parsed || new Date(Date.now() + PINTEREST_SCHEDULE_LEAD_MS);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function slotFromDateTimeLocal(value = "") {
  const parsed = parseSlot(String(value || "").replace("T", " "));
  return parsed ? formatSlot(parsed) : "";
}

function validScheduleStart(value, now = Date.now()) {
  const parsed = value instanceof Date ? value : parseSlot(value);
  if (parsed && parsed.getTime() >= now + PINTEREST_SCHEDULE_LEAD_MS && isWithinPinterestScheduleWindow(parsed, now)) return parsed;
  return new Date(now + PINTEREST_SCHEDULE_LEAD_MS);
}

function scheduleSummary(total, plan) {
  const spacing = Number(plan?.intervalMinutes || 0);
  const spacingLabel = spacing % 60 === 0 ? `${spacing / 60} hour${spacing === 60 ? "" : "s"}` : `${spacing} minutes`;
  const adjusted = plan?.startAdjusted || plan?.intervalAdjusted ? " Start time or spacing was adjusted automatically to fit every row." : "";
  return `Scheduled all ${total} rows inside Pinterest's ${PINTEREST_SCHEDULE_WINDOW_DAYS}-day window with ${spacingLabel} between posts.${adjusted}`;
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

function scheduleSlots(count, settings) {
  const interval = Math.max(1, Number(settings?.pinCreator?.postInterval || settings?.postInterval || 120));
  const pinsPerDay = Math.max(1, Number(settings?.pinCreator?.pinsPerDay || settings?.pinsPerDay || 15));
  const now = new Date();
  now.setSeconds(0, 0);
  const intervalMs = interval * 60 * 1000;
  const start = new Date(Math.ceil((now.getTime() + PINTEREST_SCHEDULE_LEAD_MS) / intervalMs) * intervalMs);
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
    if (!isWithinPinterestScheduleWindow(current, now)) break;
    slots.push(formatSlot(current));
    usedToday++;
    current = new Date(current.getTime() + intervalMs);
  }
  if (slots.length === count) return slots;
  return fitPinterestSchedule({ count, start, intervalMinutes: interval, now }).dates.map(formatSlot);
}

function applyScheduleFrom(index, firstValue, pins, settings) {
  const start = parseSlot(firstValue);
  if (!start) return pins.map((pin, rowIndex) => rowIndex === index ? { ...pin, csvPublishDate: firstValue, csvPublishImmediately: !firstValue } : pin);
  const interval = Math.max(1, Number(settings?.pinCreator?.postInterval || settings?.postInterval || 120));
  return pins.map((pin, rowIndex) => {
    if (rowIndex < index) return pin;
    const date = new Date(start.getTime() + (rowIndex - index) * interval * 60 * 1000);
    const csvPublishDate = formatSlot(date);
    return { ...pin, csvPublishDate, csvPublishImmediately: !csvPublishDate };
  });
}

function preflightMessage(value) {
  if (typeof value === "string") return value;
  const row = value?.rowIndex ? `Row ${value.rowIndex}: ` : "";
  const title = value?.title ? `"${value.title}" ` : "";
  const field = value?.field ? `${value.field}: ` : "";
  return `${row}${title}${field}${value?.message || "Pinterest export issue"}`;
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

function pinAiContext(pin = {}, imageSourceMode = pin.imageSourceMode || "generate-new", pinStyle = "") {
  const snapshot = pin.sourceSnapshot || {};
  const interestProfile = resolveInterestProfile(pin);
  return {
    sourceTitle: snapshot.title || pin.sourceTitle || pin.title || "",
    title: pin.title || "",
    description: pin.description || snapshot.excerpt || "",
    targetKeyword: snapshot.targetKeyword || pin.targetKeyword || "",
    excerpt: snapshot.excerpt || pin.excerpt || "",
    board: pin.csvBoard || "",
    overlayText: pin.overlayText || "",
    textRenderMode: imageSourceMode === "generate-new" && pinStyle === "custom-july-original-ai" ? "ai" : "local",
    interestCluster: interestProfile.primary.label,
    interestLifecycle: interestProfile.lifecycle.stage,
    relatedTopics: interestProfile.relatedTopics,
    recipe: snapshot.recipe || {}
  };
}

function pinInterestTerms(pin = {}) {
  const profile = resolveInterestProfile(pin);
  return dedupe([...(pin.interests || []), ...(pin.relatedTopics || profile.relatedTopics || [])]).slice(0, 10);
}

function pinQuality(pin = {}, allPins = [], boardNames = []) {
  const title = String(pin.title || "").trim();
  const description = String(pin.description || "").trim();
  const sourceWords = new Set(tokenize([pin.sourceTitle, pin.targetKeyword, pin.excerpt].filter(Boolean).join(" ")));
  const copyWords = new Set(tokenize(`${title} ${description}`));
  const relevance = sourceWords.size ? [...sourceWords].filter((word) => copyWords.has(word)).length / sourceWords.size : 1;
  const fingerprint = normalize(`${title} ${description}`);
  const duplicate = fingerprint && allPins.some((other) => other.id !== pin.id && normalize(`${other.title || ""} ${other.description || ""}`) === fingerprint);
  const perceptualHash = String(pin.imageQa?.perceptualHash || "");
  const duplicateImage = perceptualHash && allPins.some((other) => (
    other.id !== pin.id && String(other.imageQa?.perceptualHash || "") === perceptualHash
  ));
  const board = pin.csvBoard || chooseBoard(pin, boardNames);
  const interestProfile = resolveInterestProfile(pin);
  const alignment = interestAlignmentPreflight(pin, board, interestProfile);
  const usesAiText = pin.generationConfig?.textRenderMode === "ai";
  const checks = [
    { label: "Image", ok: Boolean(displayImage(pin)), weight: 10 },
    { label: usesAiText ? "AI lettering requested" : "Exact overlay", ok: usesAiText ? pin.imageQa?.aiTextRequested === true : pin.imageQa?.overlayVerified === true, weight: 8 },
    { label: "2:3 dimensions", ok: pin.imageQa?.dimensionsVerified === true, weight: 5 },
    { label: usesAiText ? "AI placement requested" : "Safe text area", ok: usesAiText ? pin.imageQa?.aiTextRequested === true : pin.imageQa?.safeZoneVerified === true, weight: 5 },
    { label: "Durable media", ok: pin.imageQa?.publicUrlVerified === true && Boolean(publicImage(pin)), weight: 10 },
    { label: "Title length", ok: title.length >= 50 && title.length <= 100, weight: 12 },
    { label: "Description depth", ok: description.length >= 300 && description.length <= 500, weight: 12 },
    { label: "Source relevance", ok: relevance >= 0.2, weight: 8 },
    { label: "Board match", ok: Boolean(board) && (!boardNames.length || boardNames.includes(board)), weight: 8 },
    { label: "Use-case alignment", ok: alignment.score >= 75, weight: 8 },
    { label: "Creative prompt", ok: String(pin.prompt || "").length >= 80, weight: 8 },
    { label: "Unique copy", ok: !duplicate, weight: 3 },
    { label: "Unique image", ok: !duplicateImage, weight: 3 }
  ];
  const score = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0);
  return { score, issues: checks.filter((check) => !check.ok).map((check) => check.label) };
}

export default function PinCreatorView({ settings }) {
  const confirmAction = useConfirmDialog();
  const [urlText, setUrlText] = useState("");
  const [pins, setPins] = useState([]);
  const [selectedStyle, setSelectedStyle] = useState("custom-july-original-ai");
  const [textPlacement, setTextPlacement] = useState("middle");
  const [imageSourceMode, setImageSourceMode] = useState("generate-new");
  const [overlayFont, setOverlayFont] = useState("serif-sans");
  const [aspectRatio, setAspectRatio] = useState(normalizedPinterestSourceRatio(settings?.pinterestPinRatio));
  const [imageModel, setImageModel] = useState("ideogram");
  const usesIngredientCloseupAiStyle = imageSourceMode === "generate-new" && selectedStyle === "custom-july-original-ai";
  const effectiveTextRenderMode = usesIngredientCloseupAiStyle ? "ai" : "local";
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvHosting, setCsvHosting] = useState(false);
  const [csvMediaHost, setCsvMediaHost] = useState("auto");
  const [csvAccount, setCsvAccount] = useState("");
  const [deliveryRefresh, setDeliveryRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    electronAPI.getPinterestDelivery?.().then((result) => { if (active) setCsvAccount((current) => current || result.account || ""); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const [csvValidationReport, setCsvValidationReport] = useState(null);
  const [visiblePinCount, setVisiblePinCount] = useState(20);
  const [csvIntervalHours, setCsvIntervalHours] = useState(String(Math.max(1, Math.round(Number(settings?.pinCreator?.postInterval || settings?.postInterval || 120) / 60))));
  const [csvStartTime, setCsvStartTime] = useState("");
  const [repurposePacks, setRepurposePacks] = useState([]);
  const [ghlHeaders, setGhlHeaders] = useState([]);
  const [ghlRows, setGhlRows] = useState([]);
  const [showGhlEditor, setShowGhlEditor] = useState(false);
  const [ghlStartTime, setGhlStartTime] = useState("");
  const [ghlIntervalHours, setGhlIntervalHours] = useState(String(Math.max(1, Math.round(Number(settings?.pinCreator?.postInterval || settings?.postInterval || 120) / 60))));
  const [progress, setProgress] = useState({ active: false, label: "", current: 0, total: 0 });
  const [predictionStatus, setPredictionStatus] = useState("");
  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const workingRef = useRef(false);
  const pinsRef = useRef([]);
  const repurposeRef = useRef(null);
  const saveDebounceRef = useRef(null);
  const boardNames = useMemo(
    () => settings?.pinCreator?.boardNames || settings?.boardNames || [],
    [settings]
  );
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
      .filter(([id]) => !defaultStyleIds.includes(id) && !retiredStyleIds.has(id))
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
      clusterVariantId: item.clusterVariantId || "",
      sourceTitle: item.title || "",
      excerpt: item.excerpt || "",
      targetKeyword: item.targetKeyword || "",
      smartPinStyle: item.smartPinStyle || "",
      csvBoard: item.csvBoard || "",
      interestProfile: item.interestProfile || {},
      relatedTopics: item.relatedTopics || [],
      sourceSnapshot: item.sourceSnapshot || {},
      interests: item.interests || [],
      status: "loaded",
      createdAt: item.addedAt || new Date().toISOString()
    })));
    const next = dedupePins([...savedPins, ...queuedPins]);
    pinsRef.current = next;
    setPins(next);
    if (queuedPins.length) {
      await electronAPI.savePinCreatorPins?.(next);
      if (queuedPins.length) {
        await electronAPI.ackPinQueue?.((queued?.items || []).map((item) => item.queueId).filter(Boolean));
        setStatus(`Loaded ${queuedPins.length} queued URL${queuedPins.length === 1 ? "" : "s"} from Content Studio and kept ${savedPins.length} saved pin${savedPins.length === 1 ? "" : "s"}.`);
      }
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

  useEffect(() => electronAPI.onPinProgress?.((event) => {
    const model = event.model ? ` • ${event.model}` : "";
    const id = event.predictionId ? ` • ${event.predictionId.slice(0, 8)}` : "";
    setPredictionStatus(`${event.label || "Pinterest generation"}: ${event.status || "working"}${model}${id}`);
  }), []);

  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  const firstPinCsvPublishDate = pins[0]?.csvPublishDate || "";

  useEffect(() => {
    if (!csvOpen || !pins.length) return;
    const firstSlot = firstPinCsvPublishDate || scheduleSlots(1, csvScheduleSettings)[0];
    setCsvStartTime((current) => current || dateTimeLocalFromSlot(firstSlot));
  }, [csvOpen, pins.length, firstPinCsvPublishDate, csvScheduleSettings]);

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

  async function runStep(label, filterFn, worker, { concurrency = 1 } = {}) {
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
      const width = Math.max(1, Math.min(2, Number(concurrency) || 1));
      for (let index = 0; index < targets.length; index += width) {
        await waitWhilePaused();
        if (cancelRef.current) break;
        const batch = targets.slice(index, index + width);
        const target = batch[0];
        setProgress({ active: true, label, current: index, total: targets.length });
        setStatus(`${label} ${index + 1}-${Math.min(index + batch.length, targets.length)}/${targets.length}: ${target.sourceTitle || target.url}`);
        const results = await Promise.all(batch.map(async (batchTarget, batchIndex) => {
          try {
            const latestTarget = pinsRef.current.find((pin) => pin.id === batchTarget.id) || batchTarget;
            const updated = await worker({ ...latestTarget }, index + batchIndex);
            return { target: batchTarget, updated };
          } catch (error) {
            return { target: batchTarget, error };
          }
        }));
        let nextPins = pinsRef.current;
        for (const result of results) {
          if (result.error) {
            failedCount += 1;
            const message = result.error.message || `${label} failed.`;
            nextPins = markPinFailure(nextPins, result.target.id, message);
            if (/401|403|api token|unauthorized|forbidden/i.test(message)) fatalError = message;
          } else {
            nextPins = mergePinResult(nextPins, result.target.id, result.updated);
          }
        }
        await savePins(nextPins);
        setProgress({ active: true, label, current: Math.min(index + batch.length, targets.length), total: targets.length });
        if (fatalError) break;
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
    return runStep("Generating prompts", (pin) => {
      const desiredMode = pin.imageSourceMode || imageSourceMode;
      return (!pin.prompt || pin.promptStyle !== selectedStyle || pin.promptImageSourceMode !== desiredMode || pin.promptTextRenderMode !== effectiveTextRenderMode)
        && (!selectedIds || selectedIds.has(pin.id));
    }, async (pin) => {
      const mode = pin.imageSourceMode || imageSourceMode;
      const styleWithPlacement = `${selectedStyle}::placement:${textPlacement}`;
      const result = await electronAPI.generatePrompt(pin.url, pinInterestTerms(pin), styleWithPlacement, `native-prompt-${pin.id}`, { ...pinAiContext(pin, mode, selectedStyle), imageSourceMode: mode });
      if (!result.success) throw new Error(result.error || "Prompt generation failed.");
      return { ...pin, prompt: result.prompt, promptStyle: selectedStyle, promptImageSourceMode: mode, promptTextRenderMode: effectiveTextRenderMode, status: "ready" };
    }, { concurrency: 2 });
  }

  function generateTitles(pinIds = null) {
    const selectedIds = Array.isArray(pinIds) ? new Set(pinIds) : null;
    return runStep("Generating titles", (pin) => (!pin.title || !pin.description) && (!selectedIds || selectedIds.has(pin.id)), async (pin) => {
      const result = await electronAPI.generateTitleDescription(pin.url, pinInterestTerms(pin), selectedStyle, `native-title-${pin.id}`, pinAiContext(pin, pin.imageSourceMode || imageSourceMode, selectedStyle));
      if (!result.success) throw new Error(result.error || "Title generation failed.");
      const titledPin = { ...pin, title: result.title, description: result.description, overlayText: result.overlayText || result.title };
      titledPin.interestProfile = buildInterestProfile(titledPin);
      titledPin.relatedTopics = titledPin.interestProfile.relatedTopics;
      const boardMatches = rankBoards(titledPin, boardNames);
      const board = boardMatches[0]?.board || chooseBoard(titledPin, boardNames);
      return { ...titledPin, csvBoard: board, csvBoardAuto: true, boardMatches, csvKeywords: seoKeywords(titledPin, board), status: pin.prompt ? "ready" : "loaded" };
    }, { concurrency: 2 });
  }

  function generatedAssetPatch(pin, result) {
    const imageUrl = result.displayUrl || result.localImageUrl || result.imageUrl || "";
    return {
      ...pin,
      imageUrl,
      displayUrl: imageUrl,
      localImageUrl: result.localImageUrl || "",
      localPath: result.localPath || "",
      remoteImageUrl: result.remoteImageUrl || "",
      imgurUrl: result.imgurUrl || "",
      hostedImageUrl: result.hostedImageUrl || result.imgurUrl || "",
      csvMediaUrl: result.csvMediaUrl || result.hostedImageUrl || result.imgurUrl || "",
      hostingProvider: result.hostingProvider || "",
      hostingError: result.hostingError || "",
      imageSourceMode: result.imageSourceMode || pin.imageSourceMode || imageSourceMode,
      sourceImageId: result.sourceImageId || "",
      overlayFont: result.generationConfig?.font || overlayFont,
      overlayPlacement: result.generationConfig?.placement || textPlacement,
      overlayText: result.generationConfig?.overlayText || pin.overlayText || "",
      generationConfig: result.generationConfig || {},
      imageQa: result.imageQa || {},
      predictionId: result.predictionId || "",
      status: result.imageQa?.dimensionsVerified === true ? "completed" : "error",
      error: result.imageQa?.dimensionsVerified === true
        ? ""
        : "The final Pinterest image is not verified at 1000 x 1500. Regenerate this Pin."
    };
  }

  async function generateImages(pinIds = null) {
    const selectedIds = Array.isArray(pinIds) ? new Set(pinIds) : null;
    const stalePromptIds = pinsRef.current
      .filter((pin) => {
        const desiredMode = pin.imageSourceMode || imageSourceMode;
        return (!selectedIds || selectedIds.has(pin.id))
          && (!pin.prompt || pin.promptStyle !== selectedStyle || pin.promptImageSourceMode !== desiredMode || pin.promptTextRenderMode !== effectiveTextRenderMode);
      })
      .map((pin) => pin.id);
    if (stalePromptIds.length) {
      const promptsComplete = await generatePrompts(stalePromptIds);
      if (!promptsComplete) return false;
    }
    return runStep("Generating images", (pin) => pin.prompt
      && pin.promptStyle === selectedStyle
      && pin.promptImageSourceMode === (pin.imageSourceMode || imageSourceMode)
      && pin.promptTextRenderMode === effectiveTextRenderMode
      && (pin.overlayText || pin.title || pin.sourceTitle)
      && (!displayImage(pin) || pin.imageQa?.dimensionsVerified !== true)
      && (!selectedIds || selectedIds.has(pin.id)), async (pin) => {
      const mode = pin.imageSourceMode || imageSourceMode;
      const imagePrompt = pin.prompt;
      const result = await electronAPI.createPinterestPinAsset({
        pinId: pin.id,
        mode,
        sourceSnapshot: pin.sourceSnapshot || {},
        prompt: imagePrompt,
        overlayText: pin.overlayText || pin.title || pin.sourceTitle,
        placement: textPlacement,
        font: overlayFont,
        pinStyle: selectedStyle,
        textRenderMode: effectiveTextRenderMode,
        model: imageModel,
        aspectRatio,
        blogUrl: pin.url,
        jobKey: `native-image-${pin.id}`
      });
      if (!result.success) throw new Error(result.error || "Image generation failed.");
      return generatedAssetPatch({ ...pin, prompt: imagePrompt }, result);
    }, { concurrency: 2 });
  }

  async function generateFullPack() {
    const titlesComplete = await generateTitles();
    if (!titlesComplete) return;
    const missingTitleIds = pinsRef.current.filter((pin) => !pin.title || !pin.description).map((pin) => pin.id);
    if (missingTitleIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const titleRetryComplete = await generateTitles(missingTitleIds);
      if (!titleRetryComplete) return;
    }
    const promptsComplete = await generatePrompts();
    if (!promptsComplete) return;
    const missingPromptIds = pinsRef.current.filter((pin) => {
      const desiredMode = pin.imageSourceMode || imageSourceMode;
      return !pin.prompt || pin.promptStyle !== selectedStyle || pin.promptImageSourceMode !== desiredMode;
    }).map((pin) => pin.id);
    if (missingPromptIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const promptRetryComplete = await generatePrompts(missingPromptIds);
      if (!promptRetryComplete) return;
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
    let pin = pins.find((item) => item.id === pinId);
    if (!pin) return;
    const desiredMode = pin.imageSourceMode || imageSourceMode;
    if (!pin.prompt || pin.promptStyle !== selectedStyle || pin.promptImageSourceMode !== desiredMode) {
      const promptReady = await generatePrompts([pinId]);
      if (!promptReady) return;
      pin = pinsRef.current.find((item) => item.id === pinId);
      if (!pin?.prompt) return;
    }
    workingRef.current = true;
    setWorking(true);
    setProgress({ active: true, label: "Regenerating image", current: 0, total: 1 });
    setStatus("Regenerating pin image...");
    try {
      const mode = pin.imageSourceMode || imageSourceMode;
      const imagePrompt = pin.prompt;
      const result = await electronAPI.createPinterestPinAsset({
        pinId: pin.id,
        mode,
        sourceSnapshot: pin.sourceSnapshot || {},
        prompt: imagePrompt,
        overlayText: pin.overlayText || pin.title || pin.sourceTitle,
        placement: textPlacement,
        font: overlayFont,
        pinStyle: selectedStyle,
        textRenderMode: effectiveTextRenderMode,
        model: imageModel,
        aspectRatio,
        blogUrl: pin.url,
        jobKey: `native-regen-${pin.id}`
      });
      if (!result.success) throw new Error(result.error || "Image generation failed.");
      await savePins(pinsRef.current.map((item) => item.id === pinId ? generatedAssetPatch({ ...item, prompt: imagePrompt }, result) : item));
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
      const styleWithPlacement = `${selectedStyle}::placement:${textPlacement}`;
      const mode = pin.imageSourceMode || imageSourceMode;
      const result = await electronAPI.generatePrompt(pin.url, pinInterestTerms(pin), styleWithPlacement, `native-reprompt-${pin.id}`, { ...pinAiContext(pin, mode, selectedStyle), imageSourceMode: mode });
      if (!result.success) throw new Error(result.error || "Prompt generation failed.");
      await savePins(pinsRef.current.map((item) => item.id === pinId ? { ...item, prompt: result.prompt, promptStyle: selectedStyle, promptImageSourceMode: mode, status: "ready", error: "" } : item));
      setProgress({ active: true, label: "Regenerating prompt", current: 1, total: 1 });
      setStatus("Pin prompt regenerated. Click Regenerate Image to create the new design.");
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
      const orderedPins = diversifyByInterest(pinsRef.current);
      const rowIndex = orderedPins.findIndex((pin) => pin.id === pinId);
      const scheduled = rowIndex >= 0
        ? applyScheduleFrom(rowIndex, patch.csvPublishDate, orderedPins, csvScheduleSettings)
        : orderedPins;
      const scheduledById = new Map(scheduled.map((pin) => [pin.id, pin]));
      const next = pinsRef.current.map((pin) => scheduledById.get(pin.id) || pin);
      savePins(next, { debounce: true });
      return;
    }
    const next = pinsRef.current.map((pin) => {
      if (pin.id !== pinId) return pin;
      const updated = { ...pin, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "csvMediaUrl") && patch.csvMediaUrl !== pin.csvMediaUrl) {
        updated.imageQa = {
          ...(pin.imageQa || {}),
          publicUrlVerified: false,
          publicDimensionsVerified: false,
          publicIdentityVerified: false,
          publicAssetKind: "",
          publicWidth: 0,
          publicHeight: 0,
          publicContentType: "",
          publicUrlCheckedAt: "",
          publicValidatedUrl: "",
          publicSha256: "",
          publicPerceptualHash: "",
          publicIdentityDistance: null
        };
        updated.mediaValidatedAt = "";
        updated.hostingError = "Media URL changed. Reopen or export the CSV to verify it at 1000 x 1500.";
      }
      if (patch.title !== undefined || patch.description !== undefined || patch.csvBoard !== undefined) {
        updated.interestProfile = buildInterestProfile(updated);
        updated.relatedTopics = updated.interestProfile.relatedTopics;
        const boardMatches = rankBoards(updated, boardNames);
        const shouldAutoMatch = patch.csvBoard === undefined && updated.csvBoardAuto !== false;
        const board = patch.csvBoard || (shouldAutoMatch ? boardMatches[0]?.board : updated.csvBoard) || chooseBoard(updated, boardNames);
        updated.csvBoard = board;
        updated.boardMatches = boardMatches;
        if (patch.csvBoard !== undefined) updated.csvBoardAuto = patch.csvBoardAuto === true;
        updated.csvKeywords = seoKeywords(updated, board);
        if (patch.title !== undefined && !updated.overlayTextLocked) updated.overlayText = patch.title.split(/\s+/).slice(0, 7).join(" ");
      }
      return updated;
    });
    savePins(next, { debounce: true });
  }

  async function clearPins() {
    if (!await confirmAction({
      title: "Clear Pin Creator",
      message: "All saved Pin Creator items will be removed from local storage.",
      confirmLabel: "Clear All",
      tone: "danger"
    })) return;
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

  const buildCsvRows = useCallback((sourcePins = pinsRef.current) => {
    const scheduledPins = diversifyByInterest(sourcePins);
    const headers = ["Title", "Media URL", "Pinterest board", "Thumbnail", "Description", "Link", "Publish date", "Keywords"];
    const rows = scheduledPins.map((pin, index) => {
      const board = pin.csvBoard || chooseBoard(pin, boardNames);
      const keywords = pin.csvKeywords ?? "";
      const publishDate = pin.csvPublishImmediately === true ? "" : pin.csvPublishDate || "";
      return [
        pin.title || pin.sourceTitle || "",
        publicImage(pin),
        board,
        pin.csvThumbnail || "",
        (pin.description || "").replace(/\*\*(.*?)\*\*/g, "$1"),
        trackedPinUrl(pin, index, "pinterest", "pin"),
        formatPinterestUtc(publishDate),
        keywords
      ];
    });
    return { headers, rows, scheduledPins, immediateCount: rows.filter((row) => !row[6]).length };
  }, [boardNames]);

  async function repairPinterestCsvData(sourcePins = pinsRef.current) {
    const repairablePins = sourcePins.map((pin, index) => {
      const title = String(
        pin.title
        || pin.sourceTitle
        || pin.interestProfile?.primary?.label
        || `Recipe Pin ${index + 1}`
      ).trim();
      const description = String(
        pin.description
        || pin.excerpt
        || pin.sourceSnapshot?.excerpt
        || `${title} recipe with ingredients, instructions, and practical serving tips.`
      ).replace(/\*\*(.*?)\*\*/g, "$1").trim();
      const board = pin.csvBoard || chooseBoard({ ...pin, title, description }, boardNames);
      const keywords = pin.csvKeywords ?? "";
      let url = String(pin.url || "").trim();
      try {
        const parsed = new URL(url);
        url = parsed.href;
      } catch { /* Preflight will keep an unfixable destination URL visible. */ }
      return {
        ...pin,
        title,
        description,
        url,
        csvBoard: board,
        csvThumbnail: /\.mp4(?:[?#]|$)/i.test(publicImage(pin)) ? pin.csvThumbnail || "" : "",
        csvKeywords: keywords
      };
    });

    const hosting = await electronAPI.preparePinterestExport?.({ pins: repairablePins, boardNames, rows: [], mediaHost: csvMediaHost })
      || { success: true, pins: repairablePins, errors: [], warnings: [] };
    const hostedPins = mergePreparedPinHosting(repairablePins, hosting.pins || []);
    const firstPass = buildCsvRows(hostedPins);
    const firstValidation = await electronAPI.validatePinterestExport?.({
      rows: firstPass.rows,
      boardNames,
      pins: firstPass.scheduledPins
    }) || { valid: true, errors: [], warnings: [], rows: firstPass.rows };
    const normalizedRows = firstValidation.rows || firstPass.rows;
    const normalizedById = new Map(firstPass.scheduledPins.map((pin, index) => {
      const row = normalizedRows[index] || firstPass.rows[index] || [];
      const publishDate = row[6] ? new Date(`${row[6]}Z`) : null;
      return [pin.id, {
        ...pin,
        title: row[0] || pin.title,
        csvMediaUrl: row[1] || pin.csvMediaUrl,
        csvBoard: row[2] || pin.csvBoard,
        csvThumbnail: row[3] || "",
        description: row[4] || pin.description,
        csvPublishDate: firstValidation.errors?.some((error) => error.rowIndex === index + 1 && error.field === "Publish date")
          ? pin.csvPublishDate
          : publishDate && !Number.isNaN(publishDate.getTime()) ? formatSlot(publishDate) : "",
        csvPublishImmediately: firstValidation.errors?.some((error) => error.rowIndex === index + 1 && error.field === "Publish date")
          ? pin.csvPublishImmediately === true : !row[6],
        csvKeywords: row[7] || pin.csvKeywords
      }];
    }));
    const repairedPins = hostedPins.map((pin) => normalizedById.get(pin.id) || pin);
    await savePins(pinsRef.current.map((pin) => repairedPins.find((repaired) => repaired.id === pin.id) || pin));

    const finalRows = buildCsvRows(repairedPins);
    const validation = await electronAPI.validatePinterestExport?.({
      rows: finalRows.rows,
      boardNames,
      pins: finalRows.scheduledPins
    }) || { valid: true, errors: [], warnings: [], rows: finalRows.rows };
    const errors = [...(hosting.errors || []), ...(validation.errors || [])];
    for (const error of firstValidation.errors || []) {
      if (error.field === "Publish date" && !errors.some((item) => item.rowIndex === error.rowIndex && item.field === error.field)) errors.push(error);
    }
    const warnings = [...(hosting.warnings || []), ...(validation.warnings || [])];
    const report = { ...validation, valid: errors.length === 0, success: errors.length === 0, errors, warnings };
    setCsvValidationReport(report);
    return { ...finalRows, hosting, validation, report, preparedPins: repairedPins };
  }

  async function autoFixPinterestCsv() {
    if (workingRef.current || csvHosting || !pinsRef.current.length) return;
    workingRef.current = true;
    setWorking(true);
    setCsvHosting(true);
    setStatus("Cleaning Pinterest fields, checking selected dates, and verifying hosted images...");
    try {
      const result = await repairPinterestCsvData();
      const errorCount = result.report.errors?.length || 0;
      const warningCount = result.report.warnings?.length || 0;
      if (errorCount) {
        setStatus(`Auto Fix repaired every safe field and found ${errorCount} issue${errorCount === 1 ? "" : "s"} that still need attention.`);
      } else {
        setStatus(`Auto Fix completed. ${result.rows.length} row${result.rows.length === 1 ? " is" : "s are"} export-ready${warningCount ? ` with ${warningCount} review warning${warningCount === 1 ? "" : "s"}` : ""}.`);
      }
    } catch (error) {
      setStatus(error.message || "Pinterest Auto Fix could not finish.");
    } finally {
      workingRef.current = false;
      setWorking(false);
      setCsvHosting(false);
    }
  }

  async function togglePinterestCsvEditor() {
    if (csvOpen) {
      setCsvOpen(false);
      return;
    }
    if (!pinsRef.current.length) return;
    setCsvOpen(true);
    if (csvHosting) return;
    setCsvHosting(true);
    setStatus("Pinterest CSV editor opened. Public Media URLs are preparing in the background...");
    try {
      const hosting = await electronAPI.preparePinterestExport?.({
        pins: pinsRef.current,
        boardNames,
        mediaHost: csvMediaHost,
        rows: []
      });
      const preparedPins = mergePreparedPinHosting(pinsRef.current, hosting?.pins || []);
      await savePins(preparedPins);
      const missingCount = preparedPins.filter((pin) => !publicImage(pin)).length;
      if (missingCount) {
        const failure = String(hosting?.errors?.[0] || "")
          .replace(/^[^:]{1,160}:\s*/, "")
          .trim();
        setStatus(
          `${missingCount} Media URL${missingCount === 1 ? " is" : "s are"} still missing. ${
            failure || "The finished Pins could not be hosted by the required WordPress, ImgBB, or generated-image provider."
          }`
        );
      } else {
        setStatus(`Prepared and saved ${preparedPins.length} durable Media URL${preparedPins.length === 1 ? "" : "s"} for Pinterest.`);
      }
    } catch (error) {
      setStatus(error.message || "Could not prepare Pinterest Media URLs.");
    } finally {
      setCsvHosting(false);
    }
  }

  async function applyPinterestSchedule() {
    if (!pinsRef.current.length) {
      setStatus("No Pinterest CSV rows to schedule.");
      return;
    }
    const startSlot = slotFromDateTimeLocal(csvStartTime);
    const now = Date.now();
    const start = validScheduleStart(startSlot, now);
    setCsvStartTime(dateTimeLocalFromSlot(formatSlot(start)));
    const intervalHours = Math.max(1, Number(csvIntervalHours || 1));
    const smart = settings?.performanceSchedulingEnabled !== false
      ? await electronAPI.getPerformanceSchedule?.({
        count: pinsRef.current.length,
        start: start.toISOString(),
        intervalHours,
        pinsPerDay: Number(settings?.pinCreator?.pinsPerDay || settings?.pinsPerDay || 8)
      })
      : null;
    const orderedPins = diversifyByInterest(pinsRef.current);
    const candidates = orderedPins.map((pin, index) => {
      const suggested = smart?.slots?.[index] ? new Date(smart.slots[index]) : null;
      return suggested && !Number.isNaN(suggested.getTime())
        ? suggested
        : new Date(start.getTime() + index * intervalHours * 60 * 60 * 1000);
    });
    const usesSmartDates = candidates.every((date) => isWithinPinterestScheduleWindow(date, now));
    const plan = usesSmartDates
      ? { dates: candidates, intervalMinutes: intervalHours * 60, startAdjusted: false, intervalAdjusted: false }
      : fitPinterestSchedule({ count: orderedPins.length, start, intervalMinutes: intervalHours * 60, now });
    const scheduled = orderedPins.map((pin, index) => ({
      ...pin,
      csvPublishDate: formatSlot(plan.dates[index]),
      csvPublishImmediately: false
    }));
    const scheduledById = new Map(scheduled.map((pin) => [pin.id, pin]));
    const next = pinsRef.current.map((pin) => scheduledById.get(pin.id) || pin);
    await savePins(next);
    const source = smart?.profile?.mode === "account-data" ? "your imported Pinterest performance" : "recommended posting windows";
    setStatus(`Used ${source}. ${scheduleSummary(next.length, plan)}`);
  }

  async function applyPinterestTime() {
    if (!pinsRef.current.length) {
      setStatus("No Pinterest CSV rows to schedule.");
      return;
    }
    const startSlot = slotFromDateTimeLocal(csvStartTime);
    const now = Date.now();
    const start = validScheduleStart(startSlot, now);
    setCsvStartTime(dateTimeLocalFromSlot(formatSlot(start)));
    const intervalHours = Math.max(1, Number(csvIntervalHours || 1));
    const orderedPins = diversifyByInterest(pinsRef.current);
    const plan = fitPinterestSchedule({ count: orderedPins.length, start, intervalMinutes: intervalHours * 60, now });
    const scheduled = orderedPins.map((pin, index) => ({
      ...pin,
      csvPublishDate: formatSlot(plan.dates[index]),
      csvPublishImmediately: false
    }));
    const scheduledById = new Map(scheduled.map((pin) => [pin.id, pin]));
    const next = pinsRef.current.map((pin) => scheduledById.get(pin.id) || pin);
    await savePins(next);
    setStatus(scheduleSummary(next.length, plan));
  }

  async function exportPinterestCsv({ testOnly = false, retryBatchId = "" } = {}) {
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    setCsvHosting(true);
    setStatus("Auto-fixing fields and checking final Pinterest CSV requirements...");
    try {
      let targetAccount = csvAccount.trim();
      let exportPins = testOnly ? diversifyByInterest(pinsRef.current).slice(0, 1) : pinsRef.current;
      if (retryBatchId) {
        const retry = await electronAPI.getPinterestRetry({ batchId: retryBatchId });
        targetAccount = retry.account;
        exportPins = retry.pinIds.map((id) => pinsRef.current.find((pin) => String(pin.id) === id));
        if (exportPins.some((pin) => !pin)) throw new Error("A failed Pin is no longer in the editor. Restore its saved Pin before retrying.");
        setCsvAccount(targetAccount);
      }
      const repaired = await repairPinterestCsvData(exportPins);
      const { rows, scheduledPins, preparedPins, validation, report } = repaired;
      setCsvValidationReport(report || null);
      const qaErrors = scheduledPins.flatMap((pin, index) => [
        pin.generationConfig?.textRenderMode !== "ai" && pin.imageQa?.overlayVerified !== true ? `Row ${index + 1}: exact overlay was not verified` : "",
        pin.imageQa?.dimensionsVerified !== true ? `Row ${index + 1}: final image is not verified at 1000 x 1500` : "",
        pin.imageQa?.publicDimensionsVerified !== true ? `Row ${index + 1}: hosted image dimensions are not verified at 1000 x 1500` : "",
        pin.imageQa?.publicIdentityVerified !== true ? `Row ${index + 1}: hosted image does not have a verified match to the finished Pin` : "",
        pin.generationConfig?.textRenderMode !== "ai" && pin.imageQa?.safeZoneVerified !== true ? `Row ${index + 1}: text safe area was not verified` : "",
        pin.imageQa?.publicUrlVerified !== true ? `Row ${index + 1}: durable public image was not verified` : ""
      ].filter(Boolean));
      const seenImageHashes = new Map();
      const duplicateImageWarnings = scheduledPins.flatMap((pin, index) => {
        const hash = String(pin.imageQa?.perceptualHash || "");
        if (!hash) return [];
        if (seenImageHashes.has(hash)) {
          return [`Rows ${seenImageHashes.get(hash) + 1} and ${index + 1} use the same final image`];
        }
        seenImageHashes.set(hash, index);
        return [];
      });
      const pendingAiTextReview = scheduledPins.filter((pin) => (
        pin.generationConfig?.textRenderMode === "ai" && !hasCurrentAiLetteringReview(pin)
      ));
      const aiTextWarnings = pendingAiTextReview.length
        ? [`Review ${pendingAiTextReview.length} AI-lettered image${pendingAiTextReview.length === 1 ? "" : "s"} for spelling, wording, and placement. This reminder will not return unless an image changes.`]
        : [];
      const errors = [...new Set([...(report?.errors || []).map(preflightMessage), ...qaErrors])];
      const warnings = [...new Set([...(report?.warnings || []).map(preflightMessage), ...duplicateImageWarnings, ...aiTextWarnings])];
      if (errors.length) {
        window.alert(`Pinterest export is blocked until these items are fixed:\n\n${errors.slice(0, 16).join("\n")}${errors.length > 16 ? "\n..." : ""}`);
        setStatus(`Pinterest preflight found ${errors.length} issue${errors.length === 1 ? "" : "s"}.`);
        return;
      }
      if (warnings.length) {
        const accepted = await confirmAction({
          title: "Pinterest Preflight Review",
          message: `${warnings.slice(0, 12).join("\n")}\n\nConfirm review and export these rows?`,
          confirmLabel: pendingAiTextReview.length ? "Reviewed and Export" : "Export Anyway"
        });
        if (!accepted) {
          setStatus("Pinterest export canceled after preflight.");
          return;
        }
      }
      const exported = await electronAPI.exportPinterestCsv?.({ rows: validation?.rows || rows, boardNames, pinIds: scheduledPins.map((pin) => pin.id), account: targetAccount, retryBatchId });
      setCsvValidationReport(exported?.validation || validation || null);
      if (exported?.canceled) {
        setStatus("Pinterest export canceled.");
        return;
      }
      if (!exported?.success) {
        const exportErrors = (exported?.validation?.errors || []).map(preflightMessage);
        window.alert(`Pinterest export is blocked until these items are fixed:\n\n${exportErrors.slice(0, 16).join("\n")}`);
        setStatus(`Pinterest CSV writer blocked ${exportErrors.length} invalid row issue${exportErrors.length === 1 ? "" : "s"}.`);
        return;
      }
      const reviewedIds = new Set(pendingAiTextReview.map((pin) => pin.id));
      const exportedAt = new Date().toISOString();
      const exportedPins = preparedPins.map((pin) => ({
        ...pin,
        exportedAt,
        imageQa: reviewedIds.has(pin.id)
          ? {
            ...(pin.imageQa || {}),
            aiLetteringReviewed: true,
            aiLetteringReviewedAt: exportedAt,
            aiLetteringReviewedFor: aiLetteringReviewKey(pin)
          }
          : pin.imageQa
      }));
      await savePins(pinsRef.current.map((pin) => exportedPins.find((exportedPin) => exportedPin.id === pin.id) || pin));
      const audit = exported.validation?.scheduleAudit;
      setStatus(`Exported ${rows.length} Pinterest row(s): ${audit?.scheduledRows ?? rows.filter((row) => row[6]).length} scheduled, ${audit?.immediateRows ?? rows.filter((row) => !row[6]).length} with no schedule. CSV and validation report saved. Pinterest import is not yet confirmed.`);
    } catch (error) {
      setStatus(error.message || "Pinterest export preflight failed.");
    } finally {
      workingRef.current = false;
      setWorking(false);
      setCsvHosting(false);
      setDeliveryRefresh((value) => value + 1);
    }
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
  const { headers, rows, scheduledPins } = useMemo(() => buildCsvRows(pins), [pins, buildCsvRows]);
  const visiblePins = useMemo(() => pins.slice(0, visiblePinCount), [pins, visiblePinCount]);

  return (
    <section className="min-w-0 max-w-full overflow-x-hidden animate-fade-in">
      <SectionHeader eyebrow="Pinterest" title="Pin Creator">
        Create Pinterest pins, match each pin to your saved boards, export Pinterest CSV, and build GHL social posts from the same tab.
      </SectionHeader>

      <div className="mb-5 grid min-w-0 gap-4">
        <div className="soft-card min-w-0 rounded-lg p-4">
          <Field label="URLs">
            <textarea className={`${inputClass} min-h-40 resize-y leading-6`} value={urlText} onChange={(event) => setUrlText(event.target.value)} placeholder="https://yourblog.com/easy-weeknight-dinner/" />
          </Field>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={loadUrls}><Upload className="h-4 w-4" />Load URLs</Button>
            <Button variant="secondary" onClick={generatePrompts} disabled={working || !pins.length}><Sparkles className="h-4 w-4" />Prompts</Button>
            <Button variant="secondary" onClick={generateTitles} disabled={working || !pins.length}><Save className="h-4 w-4" />Titles</Button>
            <Button onClick={generateImages} disabled={working || !ready || !titled}><ImageIcon className="h-4 w-4" />Images</Button>
            <Button onClick={generateFullPack} disabled={working || !pins.length}><Play className="h-4 w-4" />Generate All</Button>
            {failedPins.length ? <Button variant="secondary" onClick={() => retryPins(failedPins.map((pin) => pin.id))} disabled={working}><RefreshCw className="h-4 w-4" />Retry Failed ({failedPins.length})</Button> : null}
            <Button variant="danger" onClick={clearPins} disabled={working || !pins.length}><Trash2 className="h-4 w-4" />Clear All</Button>
          </div>
        </div>

        <div className="soft-card min-w-0 rounded-lg p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-white p-3 ring-1 ring-slate-200"><div className="text-xl font-black">{pins.length}</div><div className="text-xs font-bold text-slate-500">Loaded</div></div>
            <div className="rounded-md bg-white p-3 ring-1 ring-slate-200"><div className="text-xl font-black">{titled}</div><div className="text-xs font-bold text-slate-500">Titles</div></div>
            <div className="rounded-md bg-white p-3 ring-1 ring-slate-200"><div className="text-xl font-black">{completed}</div><div className="text-xs font-bold text-slate-500">Images</div></div>
          </div>
          <div className="mt-4 grid gap-3">
            <Field label="Pin style">
              <select className={inputClass} value={selectedStyle} onChange={(event) => {
                const nextStyle = event.target.value;
                setSelectedStyle(nextStyle);
              }}>
                {styleOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </Field>
            <Field label="Image source">
              <select className={inputClass} value={imageSourceMode} onChange={(event) => {
                const nextMode = event.target.value;
                setImageSourceMode(nextMode);
                if (nextMode === "reuse-article") {
                  setOverlayFont("serif-sans");
                  setTextPlacement("top");
                }
                if (nextMode === "generate-new") {
                  setImageModel("ideogram");
                  setTextPlacement("middle");
                }
              }}>
                {imageSourceModes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                {imageSourceMode === "reuse-article"
                  ? "Uses the article portrait, adds exact local text, and hosts the finished Pin in the matching WordPress Media Library."
                  : usesIngredientCloseupAiStyle
                    ? "Creates one realistic close-up food photo and the centered translucent headline together in a single Ideogram pass."
                    : "Generates a clean realistic food photo, then applies the selected exact-text style locally and hosts the finished Pin on ImgBB."}
              </p>
            </Field>
            <Field label="Text method">
              <div className={`${inputClass} flex items-center bg-slate-50 font-bold text-slate-700`}>
                {usesIngredientCloseupAiStyle ? "AI Integrated Center Text" : "Local Exact Text"}
              </div>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                {imageSourceMode === "reuse-article"
                  ? "The app adds correctly spelled, larger text and a Get the Recipe call to action without another AI image call."
                  : usesIngredientCloseupAiStyle
                    ? "Ideogram creates one centered uppercase headline inside a compact translucent panel, with no CTA, subtitle, number, or extra wording."
                    : "The app adds correctly spelled typography after image generation, so every style stays consistent and editable without another image call."}
              </p>
            </Field>
            {imageSourceMode === "reuse-article" ? (
              <Field label="Text placement">
                <select className={inputClass} value={textPlacement} onChange={(event) => setTextPlacement(event.target.value)}>
                  {textPlacements.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </Field>
            ) : usesIngredientCloseupAiStyle ? (
              <Field label="Text placement">
                <div className={`${inputClass} flex items-center bg-slate-50 font-bold text-slate-700`}>Middle | Fixed for this style</div>
              </Field>
            ) : (
              <Field label="Text placement">
                <div className={`${inputClass} flex items-center bg-slate-50 font-bold text-slate-700`}>Controlled by selected style</div>
              </Field>
            )}
            <Field label={imageSourceMode === "generate-new" ? "Pin typography" : "Overlay font"}>
              {imageSourceMode === "generate-new" ? (
                <div className={`${inputClass} flex items-center bg-slate-50 font-bold text-slate-700`}>{usesIngredientCloseupAiStyle ? "Ideogram Integrated | Ingredient Closeup" : "Curated Exact Typography | Style Controlled"}</div>
              ) : (
                <select className={inputClass} value={overlayFont} onChange={(event) => setOverlayFont(event.target.value)}>
                  {overlayFonts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              )}
            </Field>
            <Field label="Image model">
              {imageSourceMode === "generate-new" ? (
                <>
                  {usesIngredientCloseupAiStyle ? (
                    <div className={`${inputClass} flex items-center bg-slate-50 font-bold text-slate-700`}>Ideogram Turbo | Fixed for Ingredient Closeup | about $0.03</div>
                  ) : (
                    <select className={inputClass} value={imageModel} onChange={(event) => setImageModel(event.target.value)}>
                      <option value="ideogram">Ideogram Turbo | Fast | about $0.03</option>
                      <option value="ideogram-balanced">Ideogram Balanced | More detail | about $0.06</option>
                      <option value="ideogram-quality">Ideogram Quality | Best detail | about $0.09</option>
                    </select>
                  )}
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Ingredient Closeup uses one-pass Ideogram composition. Modern Magazine and Minimal Editorial generate a clean photo and receive exact local typography.</p>
                </>
              ) : (
                <div className={`${inputClass} flex items-center bg-slate-50 font-bold text-slate-700`}>No image generation needed</div>
              )}
            </Field>
            <Field label="Generated photo ratio">
              <select className={inputClass} value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                <option value="2:3">2:3 Recommended</option>
                <option value="9:16">9:16 Portrait Source</option>
                <option value="1:1">1:1 Square Source</option>
              </select>
              <p className="mt-1 text-xs font-semibold text-slate-500">Final Pinterest image is always optimized to 1000 x 1500.</p>
            </Field>
          </div>
          <div className="mt-4 grid gap-2">
            <label className="block text-sm font-bold text-slate-700">
              CSV image hosting
              <select className={`${inputClass} mt-1 w-full`} value={csvMediaHost} onChange={(event) => setCsvMediaHost(event.target.value)} disabled={working || csvHosting}>
                <option value="auto">Automatic (prefer matching WordPress site)</option>
                <option value="wordpress">WordPress Media Library only</option>
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-700">Pinterest account label (optional)
              <input className={`${inputClass} mt-1 w-full`} placeholder="Profile name" maxLength={160} value={csvAccount} onChange={(event) => setCsvAccount(event.target.value)} disabled={working || csvHosting} />
            </label>
            <Button variant="secondary" onClick={togglePinterestCsvEditor} disabled={!pins.length}><Link2 className="h-4 w-4" />{csvOpen ? "Hide" : "Edit"} Pinterest CSV</Button>
            <Button variant="secondary" onClick={autoFixPinterestCsv} disabled={!pins.length || working || csvHosting}><RefreshCw className="h-4 w-4" />Check and Auto Fix CSV</Button>
            <Button variant="secondary" onClick={exportPinterestCsv} disabled={!pins.length || csvHosting}><Download className="h-4 w-4" />{csvHosting ? "Preparing Media..." : "Export Pinterest CSV"}</Button>
            <Button variant="secondary" onClick={sendRepurpose} disabled={!titled}><Send className="h-4 w-4" />Repurpose Social</Button>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={togglePause} disabled={!working}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{paused ? "Resume" : "Pause"}</Button>
              <Button variant="danger" className="flex-1" onClick={cancelJobs} disabled={!working}>Cancel</Button>
            </div>
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
              {predictionStatus ? <div className="mt-1 truncate text-xs font-semibold text-slate-500">{predictionStatus}</div> : null}
            </div>
          ) : null}
          {status ? <div className="mt-4 rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{status}</div> : null}
        </div>
      </div>

      <PinterestDeliveryHistory refreshKey={deliveryRefresh} onRetry={(retryBatchId) => exportPinterestCsv({ retryBatchId })} disabled={working || csvHosting} />
      {csvOpen ? (
        <div className="mb-5 soft-card rounded-lg p-4">
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">Pinterest CSV Editor</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{pins.length} Pins, {rows.filter((row) => row[6]).length} scheduled, {rows.filter((row) => !row[6]).length} publish immediately.</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block text-xs font-black uppercase text-slate-500">
                Start Time
                <input
                  className={`${inputClass} mt-1 h-10 w-56`}
                  type="datetime-local"
                  min={dateTimeLocalFromSlot(formatSlot(new Date(Date.now() + PINTEREST_SCHEDULE_LEAD_MS)))}
                  max={dateTimeLocalFromSlot(formatSlot(new Date(Date.now() + PINTEREST_SCHEDULE_WINDOW_MS)))}
                  value={csvStartTime}
                  onChange={(event) => setCsvStartTime(event.target.value)}
                />
                <span className="mt-1 block normal-case text-slate-400">Local preview, saved as UTC</span>
              </label>
              <label className="block text-xs font-black uppercase text-slate-500">
                Interval Hours
                <input className={`${inputClass} mt-1 h-10 w-36`} type="number" min="1" step="1" value={csvIntervalHours} onChange={(event) => setCsvIntervalHours(event.target.value)} />
              </label>
              <Button variant="secondary" className="h-10" onClick={applyPinterestTime} disabled={!pins.length}>Apply Time</Button>
              <Button variant="secondary" className="h-10" onClick={applyPinterestSchedule} disabled={!pins.length}>Smart Schedule</Button>
              <Button variant="secondary" className="h-10" onClick={autoFixPinterestCsv} disabled={working || csvHosting}><RefreshCw className="h-4 w-4" />Check and Auto Fix</Button>
              <Button className="h-10" onClick={exportPinterestCsv} disabled={working || csvHosting}><Download className="h-4 w-4" />Export CSV</Button>
              <Button variant="secondary" className="h-10" onClick={() => exportPinterestCsv({ testOnly: true })} disabled={working || csvHosting || !pins.length}><Download className="h-4 w-4" />Export Test CSV (First Pin)</Button>
            </div>
          </div>
          {csvValidationReport && ((csvValidationReport.errors?.length || 0) + (csvValidationReport.warnings?.length || 0) > 0) ? (
            <div className={`mb-4 rounded-md border p-3 ${csvValidationReport.errors?.length ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
              <p className="text-sm font-black text-slate-900">Pinterest Preflight Report</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">Selected dates are preserved. Correct a flagged date or clear it for immediate publishing.</p>
              {csvValidationReport.errors?.length ? (
                <Button variant="secondary" className="mt-3 h-9" onClick={autoFixPinterestCsv} disabled={working || csvHosting}><RefreshCw className="h-4 w-4" />Auto Fix Errors</Button>
              ) : null}
              <div className="mt-2 max-h-40 overflow-auto text-xs font-semibold text-slate-700">
                {[...(csvValidationReport.errors || []), ...(csvValidationReport.warnings || [])].slice(0, 30).map((item, index) => (
                  <div key={`${item?.rule || "issue"}-${item?.rowIndex || 0}-${index}`} className="py-1">{preflightMessage(item)}</div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="max-h-[560px] overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-max border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr>{headers.map((header) => <th key={header} className="border-b border-slate-200 px-3 py-3 text-left text-xs font-black uppercase text-slate-500">{header}</th>)}</tr>
              </thead>
              <tbody>
                {scheduledPins.map((pin, rowIndex) => (
                  <tr key={pin.id} className="border-b border-slate-100 align-top last:border-b-0">
                    {headers.map((header, columnIndex) => {
                      const field = header.toLowerCase();
                      const value = field.includes("publish")
                        ? (pin.csvPublishImmediately === true ? "" : pin.csvPublishDate || "")
                        : (rows[rowIndex]?.[columnIndex] || "");
                       const patchKey = field.includes("title") ? "title" : field.includes("description") ? "description" : field.includes("media") ? "csvMediaUrl" : field === "link" ? "url" : field.includes("board") ? "csvBoard" : field.includes("publish") ? "csvPublishDate" : field.includes("thumbnail") ? "csvThumbnail" : "csvKeywords";
                      return (
                        <td key={`${pin.id}-${header}`} className="px-3 py-3">
                          {field.includes("description") || field.includes("keywords") ? (
                            <textarea className={`${inputClass} h-24 min-w-[280px] resize-y`} value={value} onChange={(event) => updatePin(pin.id, { [patchKey]: event.target.value })} />
                          ) : field.includes("board") && boardNames.length ? (
                            <select className={`${inputClass} h-10 min-w-[220px]`} value={value} onChange={(event) => updatePin(pin.id, { csvBoard: event.target.value, csvBoardAuto: false })}>
                              {boardNames.map((board) => <option key={board} value={board}>{board}</option>)}
                            </select>
                          ) : field.includes("publish") ? (
                            <div className="min-w-[280px]">
                              {!value ? <div className="mb-2 text-xs font-semibold">Publish immediately</div> : null}
                              <div className="flex gap-2">
                                <input
                                  type="date"
                                  min={formatSlot(new Date(Date.now() + PINTEREST_SCHEDULE_LEAD_MS)).slice(0, 10)}
                                  max={formatSlot(new Date(Date.now() + PINTEREST_SCHEDULE_WINDOW_MS)).slice(0, 10)}
                                  className={`${inputClass} h-10 min-w-[138px]`}
                                  value={value ? slotDate(value) : ""}
                                  onChange={(event) => updatePin(pin.id, { csvPublishDate: composeSlot(event.target.value, slotTime(value)) })}
                                />
                                <select className={`${inputClass} h-10 min-w-[118px]`} value={slotTime(value)} onChange={(event) => updatePin(pin.id, { csvPublishDate: composeSlot(slotDate(value), event.target.value) })}>
                                  {slotTimeOptions(value).map((time) => <option key={time} value={time}>{time}</option>)}
                                </select>
                              </div>
                              <div className="mt-1 text-xs font-semibold text-slate-500">UTC in file: {formatPinterestUtc(value)}</div>
                              {value ? <button type="button" className="mt-1 text-xs font-bold text-violet-700" onClick={() => updatePin(pin.id, { csvPublishDate: "" })}>Clear schedule</button> : null}
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
            <div className="grid gap-4">
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
        <div className="grid min-w-0 max-w-full gap-4 overflow-hidden">
          {visiblePins.map((pin, index) => {
            const quality = pinQuality(pin, pins, boardNames);
            const interestProfile = resolveInterestProfile(pin);
            const alignment = interestAlignmentPreflight(pin, pin.csvBoard || chooseBoard(pin, boardNames), interestProfile);
            return (
            <article key={pin.id} className="soft-card w-full min-w-0 max-w-full overflow-hidden rounded-lg p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-full flex-1 overflow-hidden">
                  <div className="truncate text-xs font-black uppercase text-indigo-600">{pin.status || "loaded"}</div>
                  <h2 className="mt-1 line-clamp-2 text-lg font-black leading-6 text-slate-900">{pin.title || pin.sourceTitle || pin.url}</h2>
                  <p className="mt-1 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-slate-500">{trackedPinUrl(pin, index, "pinterest", "pin") || pin.url}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black capitalize text-slate-600" title={interestProfile.lifecycle.basis}>{interestProfile.lifecycle.stage}</span>
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
              {!pin.error && pin.hostingError ? (
                <div className="mb-3 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700">
                  The Pin image is complete. Public hosting is pending and will retry automatically when you open or export the Pinterest CSV.
                </div>
              ) : null}
              <div className="grid min-w-0 max-w-full gap-5 md:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
                <div className="min-w-0 overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200">
                  {displayImage(pin) ? <img src={displayImage(pin)} alt={pin.title || "Generated pin"} className="aspect-[2/3] w-full object-cover" /> : <div className="grid aspect-[2/3] place-items-center text-slate-400"><ImageIcon className="h-10 w-10" /></div>}
                </div>
                <div className="min-w-0 max-w-full space-y-3 overflow-hidden">
                  <Field label="Title"><input className={inputClass} value={pin.title || ""} onChange={(event) => updatePin(pin.id, { title: event.target.value })} /></Field>
                  <Field label="Description"><textarea className={`${inputClass} min-h-24 resize-y`} value={pin.description || ""} onChange={(event) => updatePin(pin.id, { description: event.target.value })} /></Field>
                  <Field label="Prompt"><textarea className={`${inputClass} min-h-24 resize-y font-mono text-xs`} value={pin.prompt || ""} onChange={(event) => updatePin(pin.id, { prompt: event.target.value, status: "ready" })} /></Field>
                  <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
                  <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <Field label="This Pin image source">
                      <select className={inputClass} value={pin.imageSourceMode || imageSourceMode} onChange={(event) => updatePin(pin.id, { imageSourceMode: event.target.value })}>
                        {imageSourceModes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                      </select>
                    </Field>
                    <Field label="Board match">
                      <div className="rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">
                        {(pin.boardMatches?.length ? pin.boardMatches : rankBoards(pin, boardNames)).map((match) => `${match.board} (${match.confidence || 0}% ${match.reason})`).join(" / ") || "Add board names in Settings."}
                      </div>
                    </Field>
                  </div>
                  <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <Field label="Pinterest use case">
                      <div className="rounded-md bg-violet-50 px-3 py-2 text-sm font-black text-violet-800 ring-1 ring-violet-100">{interestProfile.primary.label}<div className="mt-1 text-xs font-semibold text-violet-600">{interestProfile.primary.confidence}% classification confidence</div></div>
                    </Field>
                    <Field label="Related topics">
                      <div className="rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">{interestProfile.relatedTopics.join(", ")}</div>
                    </Field>
                  </div>
                  <div className={`rounded-md px-3 py-2 text-xs font-bold leading-5 ${alignment.score >= 75 ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700"}`}>Cluster alignment {alignment.score}/100{alignment.issues.length ? `: ${alignment.issues.join(", ")}` : ": ready"}</div>
                  {quality.issues.length ? <div className="rounded-md bg-violet-50 px-3 py-2 text-xs font-bold leading-5 text-violet-700">Preflight needs: {quality.issues.join(", ")}</div> : null}
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
          {visiblePinCount < pins.length ? (
            <Button variant="secondary" className="mx-auto w-full max-w-sm" onClick={() => setVisiblePinCount((count) => count + 20)}>
              Show 20 More Pins ({pins.length - visiblePinCount} remaining)
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
