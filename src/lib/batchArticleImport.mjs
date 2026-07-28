function normalized(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function findNamedOption(options = [], value = "") {
  const wanted = normalized(value);
  if (!wanted) return null;
  return (options || []).find((option) => (
    normalized(option.id) === wanted
    || normalized(option.name) === wanted
    || normalized(option.url) === wanted
  )) || null;
}

export function findSiteCategory(site, value = "") {
  const wanted = normalized(value);
  if (!site || !wanted) return null;
  return (site.categories || []).find((category) => (
    normalized(category.id) === wanted
    || normalized(category.name) === wanted
    || normalized(category.slug) === wanted
  )) || null;
}

export function duplicateImportIds(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = normalized(row.title).replace(/\s+/g, " ");
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), row.id]);
  }
  return new Set(
    [...groups.values()]
      .filter((ids) => ids.length > 1)
      .flat()
  );
}

export function validateImportRow(row = {}) {
  const errors = [];
  if (!String(row.title || "").trim()) errors.push("Title is required.");
  if (row.publicationPreference === "future") {
    const scheduled = new Date(row.schedule || "");
    if (!row.schedule || Number.isNaN(scheduled.getTime())) {
      errors.push("A valid schedule is required.");
    } else if (scheduled.getTime() <= Date.now()) {
      errors.push("The schedule must be in the future.");
    }
  }
  return errors;
}

export function resolveImportRow(row = {}, settings = {}, defaults = {}) {
  const preset = findNamedOption(settings.projectPresets, row.preset)
    || findNamedOption(settings.projectPresets, defaults.projectPresetId)
    || {};
  const voice = findNamedOption(settings.brandVoices, row.brandVoice)
    || findNamedOption(settings.brandVoices, defaults.brandVoiceId);
  const site = findNamedOption(settings.wordpressSites, row.site)
    || findNamedOption(settings.wordpressSites, preset.wordpressSiteId);
  const category = findSiteCategory(site, row.category)
    || findSiteCategory(site, preset.wordpressCategoryId);

  return {
    preset,
    projectPresetId: preset.id || defaults.projectPresetId || "",
    brandVoiceId: voice?.id || defaults.brandVoiceId || "",
    site,
    wordpressSiteId: site?.id || site?.url || "",
    category,
    wordpressCategoryId: category?.id || "",
    articleLength: String(row.articleLength || "").trim(),
    publishStatusOverride: row.publicationPreference || "",
    scheduledAt: row.publicationPreference === "future"
      ? new Date(row.schedule).toISOString()
      : ""
  };
}

