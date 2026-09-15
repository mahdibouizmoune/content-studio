function isStyleRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function validStyles(styles = {}) {
  if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return {};
  return Object.fromEntries(
    Object.entries(styles).filter(([id, style]) => String(id).trim() && isStyleRecord(style))
  );
}

function omitRetiredStyles(styles = {}, retiredStyleIds = []) {
  const retired = new Set((retiredStyleIds || []).map(String));
  return Object.fromEntries(Object.entries(validStyles(styles)).filter(([id]) => !retired.has(id)));
}

function mergePinStyles(defaultStyles = {}, customStyles = {}, retiredStyleIds = []) {
  return {
    ...omitRetiredStyles(defaultStyles, retiredStyleIds),
    ...omitRetiredStyles(customStyles, retiredStyleIds)
  };
}

function migratePinStyles(defaultStyles = {}, customStyles = {}, storedVersion = 0, currentVersion = 1, retiredStyleIds = []) {
  if (Number(storedVersion || 0) >= Number(currentVersion || 1)) {
    return mergePinStyles(defaultStyles, customStyles, retiredStyleIds);
  }
  const defaults = omitRetiredStyles(defaultStyles, retiredStyleIds);
  const extras = Object.fromEntries(
    Object.entries(omitRetiredStyles(customStyles, retiredStyleIds)).filter(([id]) => !defaults[id])
  );
  return { ...defaults, ...extras };
}

module.exports = {
  mergePinStyles,
  migratePinStyles,
  omitRetiredStyles,
  validStyles
};
