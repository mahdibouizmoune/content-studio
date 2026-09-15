function hasValue(value) {
  return Boolean(String(value || "").trim());
}

function connectionStatus(settings = {}) {
  return {
    replicate: hasValue(settings.replicateApiToken_encrypted),
    imgbb: hasValue(settings.pinCreator?.imgbbApiKey_encrypted || settings.imgbbApiKey_encrypted),
    wordpress: (settings.wordpressSites || []).some((site) => hasValue(site.url) && hasValue(site.apiKey_encrypted)),
    impact: hasValue(settings.impactAccountSid) && hasValue(settings.impactAuthToken_encrypted),
    amazon: hasValue(settings.amazonPartnerTag),
    goHighLevel: hasValue(settings.ghlLocationId) && hasValue(settings.ghlApiToken_encrypted),
    googleSearchConsole: hasValue(settings.googleRefreshToken_encrypted),
    pinterestAnalytics: hasValue(settings.pinterestAnalyticsAccessToken_encrypted)
  };
}

function booleanFeatureFlags(settings = {}) {
  return Object.fromEntries(
    Object.entries(settings.featureFlags || {})
      .filter(([, value]) => typeof value === "boolean")
      .map(([key, value]) => [String(key).slice(0, 100), value])
  );
}

function sanitizeDiagnosticReport(value = "") {
  return String(value || "")
    .replace(/(bearer\s+)[a-z0-9._~+/-]+/gi, "$1[redacted]")
    .replace(/("(?:api[_ -]?key|auth[_ -]?token|access[_ -]?token|refresh[_ -]?token|secret|password|credential)"\s*:\s*")[^"]+/gi, "$1[redacted]")
    .replace(/((?:^|[?&\s"])(?:token|api[_ -]?key|password|secret)=)[^&#\s"}]+/gi, "$1[redacted]")
    .replace(/((?:api|auth|access|refresh|secret|private|credential)[ _-]?(?:key|token|secret|password|id)?\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/(https?:\/\/)([^/\s:@]+):([^@\s/]+)@/gi, "$1[redacted]:[redacted]@")
    .replace(/([?&](?:key|token|secret|password|signature|auth)=)[^&#\s]+/gi, "$1[redacted]");
}

function sanitizeProviderError(error) {
  if (!error) return { message: "Unknown provider error" };
  const responseData = error?.response?.data;
  const safeResponse = typeof responseData === "string"
    ? sanitizeDiagnosticReport(responseData).slice(0, 1000)
    : responseData && typeof responseData === "object"
      ? sanitizeDiagnosticReport(JSON.stringify(responseData)).slice(0, 1000)
      : "";
  return {
    name: String(error.name || "Error").slice(0, 80),
    message: sanitizeDiagnosticReport(String(error.message || error)).slice(0, 1200),
    code: String(error.code || "").slice(0, 80),
    status: Number(error?.response?.status || 0) || undefined,
    requestId: String(
      error?.response?.headers?.["x-request-id"]
      || error?.response?.headers?.["request-id"]
      || ""
    ).slice(0, 160),
    response: safeResponse || undefined
  };
}

module.exports = {
  booleanFeatureFlags,
  connectionStatus,
  sanitizeDiagnosticReport,
  sanitizeProviderError
};
