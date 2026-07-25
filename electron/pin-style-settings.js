function isStyleRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function validStyles(styles = {}) {
  if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return {};
  return Object.fromEntries(
    Object.entries(styles).filter(([id, style]) => String(id).trim() && isStyleRecord(style))
  );
}

function mergePinStyles(defaultStyles = {}, customStyles = {}) {
  return {
    ...validStyles(defaultStyles),
    ...validStyles(customStyles)
  };
}

function migratePinStyles(defaultStyles = {}, customStyles = {}, storedVersion = 0, currentVersion = 1) {
  if (Number(storedVersion || 0) >= Number(currentVersion || 1)) {
    return mergePinStyles(defaultStyles, customStyles);
  }
  const defaults = validStyles(defaultStyles);
  const extras = Object.fromEntries(
    Object.entries(validStyles(customStyles)).filter(([id]) => !defaults[id])
  );
  return { ...defaults, ...extras };
}

module.exports = {
  mergePinStyles,
  migratePinStyles,
  validStyles
};
