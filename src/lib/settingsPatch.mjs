// Settings are saved as a patch so a screen holding an older copy never
// overwrites keys the main process changed in the background.
export function settingsPatch(base, next) {
  const previous = base && typeof base === "object" ? base : {};
  const patch = {};
  for (const [key, value] of Object.entries(next || {})) {
    if (JSON.stringify(value) !== JSON.stringify(previous[key])) patch[key] = value;
  }
  return patch;
}
