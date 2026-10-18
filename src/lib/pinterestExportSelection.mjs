export function selectPinterestExportRows({ rows = [], pins = [], errors = [], failedPinIds = [] }) {
  const reasons = new Map();
  const add = (index, message) => {
    if (index < 0 || index >= rows.length) return;
    reasons.set(index, [...new Set([...(reasons.get(index) || []), message])]);
  };
  for (const error of errors) {
    const message = typeof error === "string" ? error : error.message || "Invalid Pin";
    const number = Number(error.rowIndex || error.row || message.match(/^Row\s+(\d+):/i)?.[1]);
    if (number > 0) add(number - 1, message);
    else pins.forEach((pin, index) => {
      if (pin.title && message.startsWith(`${pin.title}:`)) add(index, message);
    });
  }
  const failedIds = new Set(failedPinIds.map(String));
  pins.forEach((pin, index) => {
    const qa = pin.imageQa || {};
    const ai = pin.generationConfig?.textRenderMode === "ai";
    if (failedIds.has(String(pin.id))) add(index, "Image hosting failed");
    for (const [field, message] of [
      ["dimensionsVerified", "Final image dimensions are not verified"],
      ["publicDimensionsVerified", "Hosted image dimensions are not verified"],
      ["publicIdentityVerified", "Hosted image does not match the finished Pin"],
      ["publicUrlVerified", "Public image URL is not verified"],
      ...(!ai ? [["overlayVerified", "Exact overlay is not verified"], ["safeZoneVerified", "Text safe area is not verified"]] : [])
    ]) if (qa[field] !== true) add(index, message);
  });
  const indexes = rows.map((_, index) => index).filter((index) => !reasons.has(index));
  return {
    rows: indexes.map((index) => rows[index]),
    pins: indexes.map((index) => pins[index]),
    rejected: [...reasons].sort(([a], [b]) => a - b).map(([index, messages]) => ({
      row: index + 1, pinId: pins[index]?.id, reason: messages.join("; ")
    }))
  };
}
