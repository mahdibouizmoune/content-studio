export function appendOutlineSection(outline = "", title = "New section") {
  return [
    String(outline).trim(),
    `## ${String(title || "New section").trim()}\n- Add the key reader value for this section.`
  ].filter(Boolean).join("\n\n");
}

export function removeLastOutlineSection(outline = "") {
  const text = String(outline).trim();
  const matches = [...text.matchAll(/^##\s+\S.+$/gm)];
  if (!matches.length) return text;
  return text.slice(0, matches[matches.length - 1].index).trim();
}

export function outlineSectionCount(outline = "") {
  return (String(outline).match(/^##\s+\S.+$/gm) || []).length;
}
