const fieldAliases = {
  title: ["title", "article title", "topic"],
  primaryKeyword: ["primary keyword", "primary_keyword", "keyword", "focus keyword"],
  secondaryKeywords: ["secondary keywords", "secondary_keywords", "related keywords"],
  searchIntent: ["search intent", "search_intent", "intent"],
  contentType: ["content type", "content_type", "type"],
  preset: ["preset", "project preset", "project_preset"],
  articleLength: ["article length", "article_length", "length"],
  brandVoice: ["brand voice", "brand_voice", "voice"],
  site: ["site", "wordpress site", "wordpress_site"],
  category: ["category", "wordpress category", "wordpress_category"],
  publicationPreference: ["publication preference", "publication_preference", "publish status", "status"],
  schedule: ["schedule", "scheduled at", "scheduled_at", "date"]
};

function normalizedKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function recordValue(record = {}, aliases = []) {
  const entries = Object.entries(record);
  for (const alias of aliases) {
    const match = entries.find(([key]) => normalizedKey(key) === normalizedKey(alias));
    if (match && String(match[1] ?? "").trim()) return String(match[1]).trim();
  }
  return "";
}

function normalizeIntent(value = "") {
  const intent = String(value || "").toLowerCase().trim();
  return ["informational", "commercial", "transactional", "navigational"].includes(intent)
    ? intent
    : "informational";
}

function normalizeContentType(value = "") {
  return String(value || "").toLowerCase().includes("list") ? "listicle" : "article";
}

function normalizePublication(value = "") {
  const status = String(value || "").toLowerCase().trim();
  if (["publish", "published", "now"].includes(status)) return "publish";
  if (["future", "schedule", "scheduled"].includes(status)) return "future";
  return "draft";
}

function normalizeBatchImportRows(records = []) {
  const errors = [];
  const rows = (Array.isArray(records) ? records : []).map((record, index) => {
    const title = recordValue(record, fieldAliases.title);
    if (!title) errors.push({ row: index + 2, message: "Title is required." });
    return {
      id: `import-${index + 1}`,
      selected: Boolean(title),
      title,
      primaryKeyword: recordValue(record, fieldAliases.primaryKeyword),
      secondaryKeywords: recordValue(record, fieldAliases.secondaryKeywords),
      searchIntent: normalizeIntent(recordValue(record, fieldAliases.searchIntent)),
      contentType: normalizeContentType(recordValue(record, fieldAliases.contentType)),
      preset: recordValue(record, fieldAliases.preset),
      articleLength: recordValue(record, fieldAliases.articleLength),
      brandVoice: recordValue(record, fieldAliases.brandVoice),
      site: recordValue(record, fieldAliases.site),
      category: recordValue(record, fieldAliases.category),
      publicationPreference: normalizePublication(recordValue(record, fieldAliases.publicationPreference)),
      schedule: recordValue(record, fieldAliases.schedule)
    };
  });
  return { rows, errors };
}

module.exports = {
  fieldAliases,
  normalizeBatchImportRows
};
