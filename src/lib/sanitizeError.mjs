export function sanitizeErrorDetails(value = "") {
  return String(value || "")
    .replace(/(bearer\s+)[a-z0-9._~+/-]+/gi, "$1[redacted]")
    .replace(/((?:api|auth|access|refresh|secret|private|credential)[ _-]?(?:key|token|secret|password|id)?\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/(https?:\/\/)([^/\s:@]+):([^@\s/]+)@/gi, "$1[redacted]:[redacted]@")
    .replace(/([?&](?:key|token|secret|password|signature|auth)=)[^&#\s]+/gi, "$1[redacted]")
    .slice(0, 12000);
}

export function buildSanitizedErrorReport(error, componentStack = "") {
  return sanitizeErrorDetails([
    `Content Studio ${typeof __APP_VERSION__ === "undefined" ? "unknown" : __APP_VERSION__}`,
    `Time: ${new Date().toISOString()}`,
    `Message: ${error?.message || String(error || "Unknown renderer error")}`,
    error?.stack ? `Stack:\n${error.stack}` : "",
    componentStack ? `Component stack:\n${componentStack}` : ""
  ].filter(Boolean).join("\n\n"));
}
