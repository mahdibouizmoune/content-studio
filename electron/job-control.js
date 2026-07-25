function normalizePrefixes(prefixes = []) {
  return [...new Set(
    (Array.isArray(prefixes) ? prefixes : [prefixes])
      .map((prefix) => String(prefix || '').trim())
      .filter(Boolean)
  )];
}

function cancelJobsByPrefixes(activeJobs, prefixes = []) {
  const wanted = normalizePrefixes(prefixes);
  if (!wanted.length) return { cancelled: 0, jobKeys: [] };

  const jobKeys = [];
  for (const [jobKey, controller] of activeJobs.entries()) {
    if (!wanted.some((prefix) => String(jobKey).startsWith(prefix))) continue;
    controller.abort();
    activeJobs.delete(jobKey);
    jobKeys.push(jobKey);
  }
  return { cancelled: jobKeys.length, jobKeys };
}

module.exports = {
  cancelJobsByPrefixes,
  normalizePrefixes
};
