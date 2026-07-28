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
    .replace(/((?:api|auth|access|refresh|secret|private|credential)[ _-]?(?:key|token|secret|password|id)?\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/(https?:\/\/)([^/\s:@]+):([^@\s/]+)@/gi, "$1[redacted]:[redacted]@")
    .replace(/([?&](?:key|token|secret|password|signature|auth)=)[^&#\s]+/gi, "$1[redacted]");
}

module.exports = {
  booleanFeatureFlags,
  connectionStatus,
  sanitizeDiagnosticReport
};
