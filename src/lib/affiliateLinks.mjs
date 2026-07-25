const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "127.0.0.1", "::1"]);

function normalizeText(value = "") {
  return String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, " and ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeAffiliateUrl(value = "") {
  try {
    const parsed = new URL(String(value || "").trim());
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (parsed.username || parsed.password) return "";
    if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".local")) return "";
    if (/^(?:0|10|127|169\.254|192\.168)\./.test(host)) return "";
    if (/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return "";
    const private172 = host.match(/^172\.(\d{1,3})\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return "";
    if (/^(?:fc|fd|fe8|fe9|fea|feb)[0-9a-f]*:/i.test(host)) return "";
    if (/\/(?:wp-admin|wp-login\.php|admin|api)(?:\/|$)/i.test(parsed.pathname)) return "";
    if (/\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(parsed.pathname)) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function safeProductImageUrl(value = "") {
  try {
    const parsed = new URL(String(value || "").trim());
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (parsed.username || parsed.password) return "";
    if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".local")) return "";
    if (/^(?:0|10|127|169\.254|192\.168)\./.test(host)) return "";
    if (/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return "";
    const private172 = host.match(/^172\.(\d{1,3})\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return "";
    if (/^(?:fc|fd|fe8|fe9|fea|feb)[0-9a-f]*:/i.test(host)) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function numericPrice(value) {
  const normalized = String(value ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  const number = Number(normalized?.[0]);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function formatPrice(value, currency = "") {
  const number = numericPrice(value);
  if (number === null) return "";
  const code = String(currency || "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code,
        minimumFractionDigits: Number.isInteger(number) ? 0 : 2,
        maximumFractionDigits: 2
      }).format(number);
    } catch {}
  }
  return `$${number.toFixed(Number.isInteger(number) ? 0 : 2)}`;
}

function saleDetails(item = {}) {
  const current = numericPrice(item.currentPrice);
  const original = numericPrice(item.originalPrice);
  if (current === null) return { currentLabel: "", originalLabel: "", savingsPercent: 0, onSale: false };
  const currentLabel = formatPrice(current, item.currency);
  if (original === null || original <= current) {
    return { currentLabel, originalLabel: "", savingsPercent: 0, onSale: false };
  }
  const suppliedDiscount = numericPrice(item.discountPercentage);
  const calculatedDiscount = Math.round(((original - current) / original) * 100);
  const savingsPercent = Math.max(1, Math.min(99, Math.round(suppliedDiscount || calculatedDiscount)));
  return {
    currentLabel,
    originalLabel: formatPrice(original, item.currency),
    savingsPercent,
    onSale: true
  };
}

function affiliateTerms(item = {}) {
  const supplied = Array.isArray(item.keywords)
    ? item.keywords
    : String(item.keywords || "").split(/[,\n]/);
  return [...new Set([...supplied, item.name]
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 3))]
    .sort((a, b) => b.length - a.length);
}

function containsTerm(text = "", term = "") {
  if (!term) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}(?=$|[^a-z0-9])`, "i").test(text);
}

function normalizedAffiliateItems(settings = {}) {
  return (Array.isArray(settings.affiliateLinks) ? settings.affiliateLinks : [])
    .map((item, index) => ({
      ...item,
      id: String(item.id || `affiliate-${index + 1}`),
      name: String(item.name || "").trim(),
      url: safeAffiliateUrl(item.url),
      anchorText: String(item.anchorText || item.name || "").trim(),
      terms: affiliateTerms(item)
    }))
    .filter((item) => {
      if (item.enabled === false || !item.name || !item.url || !item.anchorText || !item.terms.length) return false;
      if (item.source === "amazon") {
        return item.amazonLinkType === "product"
          && /^[A-Z0-9]{10}$/i.test(String(item.amazonAsin || ""));
      }
      return true;
    });
}

export function findAffiliateOpportunities({ article = {}, content = "", settings = {} } = {}) {
  if (settings.affiliateEnabled === false) return [];
  const title = normalizeText(article.generatedTitle || article.title);
  const focus = normalizeText([
    article.rankMathFocusKeyword,
    article.seoBrief?.targetKeyword,
    article.seoBrief?.secondaryKeywords,
    (article.tags || []).join(" ")
  ].filter(Boolean).join(" "));
  const contentWithoutRecipeCard = String(content || "").replace(
    /<section\b[^>]*\bid=["']recipe-card["'][^>]*>[\s\S]*?<\/section>/gi,
    " "
  );
  const paragraphs = [...contentWithoutRecipeCard.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)].map((match) => match[0]);
  const eligibleParagraphs = paragraphs.length > 1 ? paragraphs.slice(1) : paragraphs;
  const body = normalizeText(eligibleParagraphs.join(" ")).slice(0, 30000);

  return normalizedAffiliateItems(settings)
    .map((item) => {
      const titleMatches = item.terms.filter((term) => containsTerm(title, term));
      const focusMatches = item.terms.filter((term) => containsTerm(focus, term));
      const bodyMatches = item.terms.filter((term) => containsTerm(body, term));
      const matchedTerms = [...new Set([...bodyMatches, ...titleMatches, ...focusMatches])];
      const discoveryScore = Math.max(0, Number(item.discoveryScore || 0));
      const automaticPlacement = ["impact", "amazon"].includes(item.source)
        && item.trackingVerified === true
        && discoveryScore >= 90;
      const score = titleMatches.length * 35
        + focusMatches.length * 25
        + bodyMatches.length * 10
        + Math.round(discoveryScore / 10);
      return {
        ...item,
        id: item.id,
        name: item.name,
        url: item.url,
        anchorText: item.anchorText,
        terms: item.terms,
        matchedTerms,
        score,
        automaticPlacement,
        hasNaturalBodyMatch: bodyMatches.length > 0,
        reason: item.discoveryReason || (matchedTerms.length ? `Matched ${matchedTerms.slice(0, 3).join(", ")}` : "")
      };
    })
    .filter((item) => item.hasNaturalBodyMatch || item.automaticPlacement)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function recipeCardRanges(html = "") {
  return [...String(html).matchAll(/<section\b[^>]*\bid=["']recipe-card["'][^>]*>[\s\S]*?<\/section>/gi)]
    .map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

function isInsideRange(index, ranges = []) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function paragraphMatches(paragraph = "", terms = []) {
  const text = normalizeText(paragraph);
  return terms.find((term) => containsTerm(text, term)) || "";
}

function linkFirstTextMatch(paragraph = "", terms = [], link = {}) {
  const openingEnd = paragraph.indexOf(">") + 1;
  const closingStart = paragraph.toLowerCase().lastIndexOf("</p>");
  if (!openingEnd || closingStart < openingEnd) return "";
  const opening = paragraph.slice(0, openingEnd);
  const body = paragraph.slice(openingEnd, closingStart);
  const closing = paragraph.slice(closingStart);
  const segments = body.split(/(<[^>]+>)/g);

  for (let index = 0; index < segments.length; index += 2) {
    for (const term of terms) {
      const expression = new RegExp(`(^|[^a-z0-9])(${escapeRegExp(term)})(?=$|[^a-z0-9])`, "i");
      if (!expression.test(segments[index])) continue;
      segments[index] = segments[index].replace(expression, (match, prefix, matchedText) => {
        const safeHref = escapeHtml(link.url);
        const safeId = escapeHtml(link.id);
        return `${prefix}<a href="${safeHref}" rel="sponsored nofollow noopener" target="_blank" data-affiliate-id="${safeId}">${matchedText}</a>`;
      });
      return `${opening}${segments.join("")}${closing}`;
    }
  }
  return "";
}

function stripManagedAffiliateMarkup(html = "") {
  return String(html || "")
    .replace(/<p\b[^>]*data-affiliate-disclosure=["']true["'][^>]*>[\s\S]*?<\/p>\s*/gi, "")
    .replace(/<aside\b[^>]*data-affiliate-recommendation=["']true["'][^>]*>[\s\S]*?<\/aside>\s*/gi, "")
    .replace(/<a\b[^>]*data-affiliate-id=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/gi, "$1");
}

function affiliateRecommendationBox(opportunity = {}) {
  const safeHref = escapeHtml(opportunity.url);
  const safeId = escapeHtml(opportunity.id);
  const safeName = escapeHtml(opportunity.name);
  const imageUrl = safeProductImageUrl(opportunity.imageUrl);
  const safeImageUrl = escapeHtml(imageUrl);
  const manufacturer = escapeHtml(opportunity.manufacturer || opportunity.impactCampaignName || "");
  const matchedTerm = String(opportunity.matchedTerms?.[0] || opportunity.matchedTerm || "").trim();
  const reason = matchedTerm
    ? `A relevant option for this recipe because it uses ${matchedTerm}.`
    : "A relevant option selected to support this recipe.";
  const isAmazon = opportunity.source === "amazon";
  const pricing = isAmazon
    ? { currentLabel: "", originalLabel: "", savingsPercent: 0, onSale: false }
    : saleDetails(opportunity);
  const cta = isAmazon ? "View on Amazon" : pricing.onSale ? "Check current deal" : "Check price and availability";
  const image = imageUrl
    ? `<img src="${safeImageUrl}" alt="${safeName}" loading="lazy" decoding="async" width="140" height="140" style="width:140px;height:140px;max-width:100%;object-fit:contain;border-radius:6px;background:#ffffff;" />`
    : "";
  const merchant = manufacturer
    ? `<div style="margin-bottom:4px;font-size:12px;font-weight:700;color:#6b7280;">${manufacturer}</div>`
    : "";
  const price = pricing.currentLabel
    ? pricing.onSale
      ? `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px;"><span style="font-size:14px;color:#6b7280;text-decoration:line-through;">Was ${escapeHtml(pricing.originalLabel)}</span><strong style="font-size:18px;color:#111827;">Now ${escapeHtml(pricing.currentLabel)}</strong><span style="padding:3px 7px;border-radius:4px;background:#ede9fe;color:#5b21b6;font-size:12px;font-weight:800;">Save ${pricing.savingsPercent}%</span></div>`
      : `<div style="margin-top:10px;font-size:16px;font-weight:800;color:#111827;">Current price: ${escapeHtml(pricing.currentLabel)}</div>`
    : "";
  return [
    '<aside class="affiliate-recommendation" data-affiliate-recommendation="true" ',
    'style="margin:24px 0;padding:18px;border:1px solid #ddd6fe;border-left:4px solid #7c3aed;border-radius:7px;background:#faf9ff;box-shadow:0 8px 24px rgba(76,29,149,0.08);">',
    '<div style="margin-bottom:12px;font-size:13px;font-weight:800;letter-spacing:0;color:#5b21b6;text-transform:uppercase;">Helpful tool for this recipe</div>',
    '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:18px;">',
    image,
    '<div style="min-width:220px;flex:1;">',
    merchant,
    `<div style="font-size:19px;font-weight:800;line-height:1.35;color:#111827;">${safeName}</div>`,
    `<div style="margin-top:7px;font-size:14px;line-height:1.55;color:#4b5563;">${escapeHtml(reason)}</div>`,
    price,
    `<a href="${safeHref}" rel="sponsored nofollow noopener" target="_blank" data-affiliate-id="${safeId}" `,
    `style="display:inline-block;margin-top:13px;padding:10px 16px;border-radius:5px;background:linear-gradient(135deg,#6d28d9,#8b5cf6);color:#ffffff;text-decoration:none;font-weight:800;">${cta}</a>`,
    pricing.currentLabel
      ? '<div style="margin-top:7px;font-size:11px;line-height:1.45;color:#6b7280;">Price and availability can change. Check the merchant for current details.</div>'
      : "",
    '</div>',
    '</div>',
    isAmazon
      ? '<div style="margin-top:13px;padding-top:11px;border-top:1px solid #e9d5ff;font-size:12px;line-height:1.5;color:#6b7280;"><strong>Paid link:</strong> As an Amazon Associate I earn from qualifying purchases.</div>'
      : '<div style="margin-top:13px;padding-top:11px;border-top:1px solid #e9d5ff;font-size:12px;line-height:1.5;color:#6b7280;"><strong>Paid link:</strong> I may earn a commission if you buy, at no extra cost to you.</div>',
    '</aside>'
  ].join("");
}

export function applyAffiliateLinksToHtml(html = "", opportunities = [], options = {}) {
  const cleanHtml = stripManagedAffiliateMarkup(html);
  const maxLinks = Math.max(0, Math.min(8, Number(options.maxLinks ?? 3)));
  if (!maxLinks || !opportunities.length) return { html: cleanHtml, applied: [] };

  let next = cleanHtml;
  const applied = [];
  const usedParagraphs = new Set();
  const candidates = opportunities.slice(0, Math.max(maxLinks * 3, maxLinks));

  for (const opportunity of candidates) {
    if (applied.length >= maxLinks) break;
    if (!safeAffiliateUrl(opportunity.url)) continue;
    const ranges = recipeCardRanges(next);
    const paragraphs = [...next.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)]
      .filter((match, index) => index > 0 || [...next.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)].length === 1)
      .filter((match) => !isInsideRange(match.index, ranges))
      .filter((match) => !/<a\b/i.test(match[0]) && !/affiliate-disclosure|affiliate-recommendation/i.test(match[0]));
    let paragraph = paragraphs.find((match) => {
      const key = normalizeText(match[0]).slice(0, 180);
      return !usedParagraphs.has(key) && paragraphMatches(match[0], opportunity.matchedTerms.length ? opportunity.matchedTerms : opportunity.terms);
    });
    if (!paragraph && applied.length === 0 && opportunity.automaticPlacement) {
      paragraph = paragraphs.find((match) => {
        const key = normalizeText(match[0]).slice(0, 180);
        return !usedParagraphs.has(key);
      });
    }
    if (!paragraph) continue;
    const useRecommendationBox = applied.length === 0 && options.featureBestRecommendation !== false;
    let replacement;
    if (useRecommendationBox) {
      replacement = `${paragraph[0]}\n${affiliateRecommendationBox(opportunity)}`;
    } else {
      replacement = linkFirstTextMatch(
        paragraph[0],
        opportunity.matchedTerms.length ? opportunity.matchedTerms : opportunity.terms,
        opportunity
      );
    }
    if (!replacement) continue;
    next = `${next.slice(0, paragraph.index)}${replacement}${next.slice(paragraph.index + paragraph[0].length)}`;
    usedParagraphs.add(normalizeText(paragraph[0]).slice(0, 180));
    applied.push({
      ...opportunity,
      matchedTerm: paragraphMatches(paragraph[0], opportunity.matchedTerms.length ? opportunity.matchedTerms : opportunity.terms),
      score: opportunity.score
    });
  }

  if (!applied.length) return { html: cleanHtml, applied: [] };
  const hasAmazonLink = applied.some((item) => item.source === "amazon");
  const generalDisclosure = String(options.disclosure || "This post may contain affiliate links. I may earn a commission from qualifying purchases at no additional cost to you.").trim();
  const amazonDisclosure = "As an Amazon Associate I earn from qualifying purchases.";
  const disclosure = hasAmazonLink && !generalDisclosure.toLowerCase().includes("as an amazon associate")
    ? `${amazonDisclosure} ${generalDisclosure}`
    : generalDisclosure;
  const disclosureHtml = `<p class="affiliate-disclosure" data-affiliate-disclosure="true"><strong>Disclosure:</strong> ${escapeHtml(disclosure)}</p>`;
  const firstParagraph = next.match(/<p\b[^>]*>/i);
  next = firstParagraph?.index !== undefined
    ? `${next.slice(0, firstParagraph.index)}${disclosureHtml}\n${next.slice(firstParagraph.index)}`
    : `${disclosureHtml}\n${next}`;

  return { html: next, applied };
}

export function applyAffiliateLinksToArticle(article = {}, settings = {}) {
  const opportunities = findAffiliateOpportunities({ article, content: article.content || "", settings });
  const result = applyAffiliateLinksToHtml(article.content || "", opportunities, {
    maxLinks: settings.affiliateMaxLinks ?? 3,
    disclosure: settings.affiliateDisclosure
  });
  return {
    ...article,
    content: result.html,
    affiliateLinks: result.applied,
    affiliateDisclosureApplied: result.applied.length > 0,
    affiliateLinksAppliedAt: result.applied.length ? new Date().toISOString() : ""
  };
}

export function removeManagedAffiliateLinks(article = {}) {
  return {
    ...article,
    content: stripManagedAffiliateMarkup(article.content || ""),
    affiliateLinks: [],
    affiliateDisclosureApplied: false,
    affiliateLinksAppliedAt: ""
  };
}
