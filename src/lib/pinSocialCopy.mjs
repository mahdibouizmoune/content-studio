// Copy helpers for the Instagram and Facebook posts built from Pins. Pin titles
// are long search phrases; social captions read better with the dish name.

const DISH_BREAK = /\s+(?:with|for|featuring|that)\s+|\s*[:|]\s*|\s+[–—-]\s+|,\s+/i;

function capAtWord(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : text.slice(0, max)).trim();
}

export function socialDishName(title = "") {
  const clean = String(title || "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/\s+/g, " ").trim();
  if (!clean) return "Recipe idea";
  const lead = clean.split(DISH_BREAK)[0].trim();
  const name = lead.split(" ").length >= 2 && lead.length >= 8 ? lead : clean;
  return capAtWord(name, 70);
}

// Keeps whole sentences up to `max` characters; a single long sentence is cut
// at a word boundary and marked with "...".
export function trimAtSentence(text = "", max = 220) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
  let kept = "";
  for (const sentence of sentences) {
    const next = `${kept} ${sentence.trim()}`.trim();
    if (next.length > max) break;
    kept = next;
  }
  if (kept) return kept;
  return `${capAtWord(clean, max - 3).replace(/[,;:]$/, "")}...`;
}

// Hashtags longer than three words or 24 letters are unreadable mash-ups of the Pin title.
export function socialHashtags(keywords = [], max = 8) {
  const seen = new Set();
  const tags = [];
  for (const keyword of keywords) {
    const words = String(keyword || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (!words.length || words.length > 3) continue;
    const tag = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join("");
    if (tag.length > 24 || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(`#${tag}`);
    if (tags.length >= max) break;
  }
  return tags;
}
