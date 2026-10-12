"use strict";
const { parseDocument } = require("htmlparser2");
const { selectAll } = require("css-select");
const { textContent } = require("domutils");
const { XMLValidator } = require("fast-xml-parser");
const { isSafeRemoteMediaUrl } = require("./media-security");
const PRESETS = {
  "2:3": [1000, 1500],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};
function svgFields(doc) {
  const nodes = selectAll("text,tspan,image", doc).filter(
    (n) =>
      n.name === "image" ||
      !n.children.some(
        (c) => c.type === "tag" && ["text", "tspan"].includes(c.name),
      ),
  );
  nodes.forEach((n, i) => {
    if (!n.attribs.id) n.attribs.id = `content-studio-field-${i + 1}`;
  });
  return nodes;
}
function embeddedPhoto(value) {
  const matched = String(value).match(
    /^data:image\/(png|jpeg);base64,([a-zA-Z0-9+/=]+)$/,
  );
  if (!matched) return false;
  const bytes = Buffer.from(matched[2], "base64");
  return (
    bytes.length <= 5 * 1024 * 1024 &&
    (matched[1] === "png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
  );
}
function publicUrl(value, base) {
  try {
    const u = new URL(value, base);
    if (
      u.username ||
      u.password ||
      u.protocol !== "https:" ||
      !isSafeRemoteMediaUrl(u.href)
    )
      return "";
    return u.href;
  } catch {
    return "";
  }
}
function extractPhotos(
  html,
  pageUrl,
  {
    selector = "",
    excludeSelector = "nav,header,footer,aside",
    exclusions = "logo,avatar,icon,tracking,pixel",
  } = {},
) {
  const doc = parseDocument(html);
  const roots = selector
    ? selectAll(selector, doc)
    : selectAll('article,main,[itemtype*="Product"]', doc);
  const excluded = new Set(
    selectAll(excludeSelector || "nav,header,footer,aside", doc),
  );
  const candidates = selectAll("img", roots.length ? roots : doc);
  const out = new Map();
  const words = String(exclusions)
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  for (const node of candidates) {
    let ancestor = node,
      skip = false;
    while (ancestor) {
      if (excluded.has(ancestor)) skip = true;
      ancestor = ancestor.parent;
    }
    if (skip) continue;
    const a = node.attribs || {};
    const srcset = a["data-srcset"] || a.srcset || "";
    const urls = [
      a["data-src"],
      a["data-lazy-src"],
      ...srcset
        .split(",")
        .map((s) => s.trim().split(/\s+/)[0])
        .reverse(),
      a.src,
    ];
    const url = urls
      .filter(Boolean)
      .map((u) => publicUrl(u, pageUrl))
      .find(
        (u) =>
          u &&
          !words.some((w) => `${u} ${a.alt || ""}`.toLowerCase().includes(w)),
      );
    if (
      !url ||
      (Number(a.width) > 0 && Number(a.width) < 150) ||
      (Number(a.height) > 0 && Number(a.height) < 150)
    )
      continue;
    out.set(url, {
      url,
      label:
        a.alt || textContent(node.parent).trim().slice(0, 100) || "Page photo",
      provenance: "original",
      pageUrl,
    });
    if (out.size >= 60) break;
  }
  return [...out.values()];
}
async function cropPhoto(sharp, bytes, options = {}) {
  const [width, height] = PRESETS[options.ratio || "9:16"] || PRESETS["9:16"];
  let photo = sharp(bytes, { limitInputPixels: 40000000 }).rotate();
  const meta = await photo.metadata();
  if (!meta.width || !meta.height || meta.pages > 1)
    throw new Error("Choose a single raster photo.");
  const fit = options.fit === "contain" ? "contain" : "cover";
  if (fit === "cover") {
    const rotated = await photo.toBuffer({ resolveWithObject: true });
    const sw = rotated.info.width,
      sh = rotated.info.height;
    const ratio = width / height;
    const cw = Math.min(sw, Math.floor(sh * ratio)),
      ch = Math.min(sh, Math.floor(sw / ratio));
    const x = Math.max(0, Math.min(1, Number(options.focalX ?? 0.5))),
      y = Math.max(0, Math.min(1, Number(options.focalY ?? 0.5)));
    photo = sharp(rotated.data).extract({
      left: Math.round((sw - cw) * x),
      top: Math.round((sh - ch) * y),
      width: cw,
      height: ch,
    });
  }
  return photo
    .resize(width, height, { fit, background: options.background || "#ffffff" })
    .jpeg({ quality: 90 })
    .toBuffer();
}
function inspectSvg(svg) {
  if (Buffer.byteLength(svg) > 5 * 1024 * 1024)
    throw new Error("SVG exceeds 5 MB.");
  if (
    !/<svg[\s>]/i.test(svg) ||
    /<!DOCTYPE|<!ENTITY|<script|<foreignObject|\son\w+\s*=|(?:href|src)\s*=\s*['"](?:https?:|file:|javascript:)|url\(\s*['"]?(?:https?:|file:|javascript:)/i.test(
      svg,
    )
  )
    throw new Error(
      "Unsafe SVG: embedded scripts, HTML and external resources are not supported.",
    );
  if (XMLValidator.validate(svg) !== true) throw new Error("Invalid SVG XML.");
  const doc = parseDocument(svg, { xmlMode: true });
  for (const node of selectAll("*", doc)) {
    if (
      [
        "script",
        "foreignObject",
        "iframe",
        "audio",
        "video",
        "animate",
        "set",
      ].includes(node.name)
    )
      throw new Error("Active SVG elements are not supported.");
    for (const [key, value] of Object.entries(node.attribs || {})) {
      if (/^on/i.test(key))
        throw new Error("Active SVG attributes are not supported.");
      if (
        /^(href|xlink:href|src)$/.test(key) &&
        value.startsWith("data:") &&
        !embeddedPhoto(value)
      )
        throw new Error(
          "Embedded SVG pictures must contain real PNG/JPEG bytes.",
        );
      if (
        /^(href|xlink:href|src)$/.test(key) &&
        !/^#|^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(value)
      )
        throw new Error(
          "SVG resources must be embedded PNG/JPEG or local fragment references.",
        );
      if (/@import|url\(\s*['"]?(?!#)/i.test(value))
        throw new Error("External CSS resources are not supported.");
    }
    if (
      node.name === "style" &&
      /@import|url\(\s*['"]?(?!#)/i.test(textContent(node))
    )
      throw new Error("External SVG stylesheets are not supported.");
  }
  const fields = svgFields(doc).map((n) => ({
    id: n.attribs.id,
    type: n.name === "image" ? "image" : "text",
    value:
      n.name === "image"
        ? n.attribs.href || n.attribs["xlink:href"] || ""
        : textContent(n),
  }));
  const warnings = [];
  if (!fields.length)
    warnings.push(
      "No editable text or image fields were found. Outlined text and vector paths cannot be mapped dynamically.",
    );
  if (/<filter|<mask|<clipPath/i.test(svg))
    warnings.push(
      "Effects and clipping require visual review after rasterization.",
    );
  if (/font-family/i.test(svg))
    warnings.push(
      "Fonts must be installed locally or converted to outlines in Canva.",
    );
  return { fields, warnings };
}
function mapSvg(svg, values = {}) {
  const { fields } = inspectSvg(svg);
  const { DomUtils } = require("htmlparser2");
  const doc = parseDocument(svg, { xmlMode: true });
  svgFields(doc);
  for (const field of fields) {
    if (!(field.id in values)) continue;
    const node = selectAll("[id]", doc).find((n) => n.attribs.id === field.id);
    if (field.type === "image") {
      if (!embeddedPhoto(values[field.id]))
        throw new Error("Dynamic images must be embedded PNG/JPEG data.");
      node.attribs.href = values[field.id];
      delete node.attribs["xlink:href"];
    } else {
      const fragment = parseDocument(
        String(values[field.id])
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;"),
        { xmlMode: true },
      );
      node.children = fragment.children;
    }
  }
  return DomUtils.getOuterHTML(doc, { xmlMode: true });
}
module.exports = {
  PRESETS,
  publicUrl,
  extractPhotos,
  cropPhoto,
  inspectSvg,
  mapSvg,
};
