const COLLECTIONS = Object.freeze([
  "calendarEntries",
  "campaigns",
  "updateQueue",
  "revenueRecords",
  "runHistory"
]);

function allowedCollection(value = "") {
  const collection = String(value || "");
  if (!COLLECTIONS.includes(collection)) throw new Error("Unsupported growth workspace collection.");
  return collection;
}

function withoutSecretFields(value) {
  if (Array.isArray(value)) return value.map(withoutSecretFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/(?:api.?(?:key|token)|auth|access.?token|refresh.?token|password|secret|credential)/i.test(key))
      .map(([key, nested]) => [key, withoutSecretFields(nested)])
  );
}

function cleanRecord(record = {}, collection = "") {
  const json = JSON.stringify(record || {});
  if (json.length > 250000) throw new Error("Growth workspace record is too large.");
  const parsed = withoutSecretFields(JSON.parse(json));
  const now = new Date().toISOString();
  return {
    ...parsed,
    id: String(parsed.id || `${collection}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).slice(0, 180),
    createdAt: parsed.createdAt || now,
    updatedAt: now
  };
}

function upsertGrowthRecord(records = [], collection = "", record = {}) {
  const safeCollection = allowedCollection(collection);
  const next = cleanRecord(record, safeCollection);
  const index = (records || []).findIndex((item) => String(item.id) === next.id);
  if (index < 0) return [...(records || []), next];
  const copy = [...records];
  copy[index] = { ...copy[index], ...next, createdAt: copy[index].createdAt || next.createdAt };
  return copy;
}

function deleteGrowthRecord(records = [], id = "") {
  return (records || []).filter((item) => String(item.id) !== String(id));
}

function valueFrom(record = {}, aliases = []) {
  for (const [key, value] of Object.entries(record)) {
    if (aliases.some((alias) => String(key).trim().toLowerCase() === alias)) return String(value ?? "").trim();
  }
  return "";
}

function normalizeRevenueRows(records = [], fileName = "") {
  const importedAt = new Date().toISOString();
  return (records || []).map((record, index) => {
    const amountValue = valueFrom(record, ["amount", "revenue", "commission", "earnings"]);
    const amount = amountValue
      ? Number(String(amountValue).replace(/[^0-9.-]/g, ""))
      : Number.NaN;
    return cleanRecord({
      id: `revenue-import-${Date.now()}-${index + 1}`,
      articleId: valueFrom(record, ["article id", "article_id", "articleid"]),
      campaignId: valueFrom(record, ["campaign id", "campaign_id", "campaignid"]),
      source: valueFrom(record, ["source", "provider", "network", "platform"]) || "CSV import",
      trafficSource: valueFrom(record, ["traffic source", "traffic_source", "utm source", "utm_source"]),
      metric: valueFrom(record, ["metric", "type"]) || "revenue",
      amount: Number.isFinite(amount) ? amount : null,
      currency: valueFrom(record, ["currency"]) || "USD",
      clicks: Number(valueFrom(record, ["clicks"])) || 0,
      occurredAt: valueFrom(record, ["date", "occurred at", "occurred_at", "timestamp"]) || importedAt,
      sourceFile: fileName,
      lastUpdated: importedAt
    }, "revenueRecords");
  });
}

module.exports = {
  COLLECTIONS,
  allowedCollection,
  cleanRecord,
  deleteGrowthRecord,
  normalizeRevenueRows,
  upsertGrowthRecord
};
