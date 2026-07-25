const collectionWords = "(?:recipes?|ideas?|meals?|dinners?|lunch(?:es)?|brunch(?:es)?|breakfasts?|desserts?|drinks?|mocktails?|cocktails?|smoothies?|salads?|soups?|snacks?|appetizers?|bowls?|sides?|sandwiches?|wraps?|tacos?|casseroles?|curries?|pastas?|cookies?|cakes?|breads?)";

const collectionPatterns = [
  new RegExp(`\\b(\\d{1,2})\\b(?!\\s*(?:minutes?|hours?|calories?|seconds?|days?)\\b)\\s+(?:(?:[a-z&'-]+)\\s+){0,6}${collectionWords}\\b`, "i"),
  new RegExp(`\\b(\\d{1,2})\\s+${collectionWords}\\b`, "i"),
  new RegExp(`\\b${collectionWords}\\b[^\\d]{0,28}(\\d{1,2})\\b`, "i"),
  /\btop\s+(\d{1,2})\b/i,
  /\bbest\s+(\d{1,2})\b/i
];

export function parsePromisedRecipeCount(title = "") {
  const text = String(title);
  for (const pattern of collectionPatterns) {
    const count = Number(text.match(pattern)?.[1] || 0);
    if (count >= 6 && count <= 50) return count;
  }
  return 0;
}

export function articleLengthMaximum(articleLength = "900-1200") {
  const values = String(articleLength)
    .match(/\d+/g)
    ?.map(Number)
    .filter(Number.isFinite) || [];
  return values.length ? Math.max(...values) : 1200;
}

export function usesCompactRecipeCollection(itemCount = 0, articleLength = "900-1200") {
  const count = Math.max(0, Number(itemCount || 0));
  if (count < 6) return false;
  const fullRecipeMinimum = 500 + (count * 170);
  return articleLengthMaximum(articleLength) < fullRecipeMinimum;
}

export function recommendedCollectionLength(title = "", mode = "article") {
  const count = parsePromisedRecipeCount(title);
  if (mode !== "listicle" && !count) return "";
  if (!count) return "";
  if (count <= 5) return "2200-2800";
  if (count <= 10) return "3000-4000";
  if (count <= 20) return "4500-6000";
  if (count <= 30) return "6500-8500";
  return "8500-12000";
}
