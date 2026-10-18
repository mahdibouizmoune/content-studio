'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const opentype = require('opentype.js');

const PIN_WIDTH = 1080;
const PIN_HEIGHT = 1920;

const FONT_DEFINITIONS = {
  'serif-sans': {
    family: 'ContentStudioEditorialPair',
    file: 'PlayfairDisplay-Bold.ttf',
    secondaryFile: 'Montserrat-Bold.ttf',
    label: 'Playfair + Montserrat',
    baseSize: 102,
    maxChars: 20,
    pairing: true
  },
  'food-editorial': {
    family: 'ContentStudioFoodPair',
    file: 'DMSerifDisplay-Regular.ttf',
    secondaryFile: 'Poppins-Bold.ttf',
    label: 'DM Serif + Poppins',
    baseSize: 102,
    maxChars: 20,
    pairing: true
  },
  poppins: {
    family: 'ContentStudioPoppins',
    file: 'Poppins-Bold.ttf',
    label: 'Poppins Bold',
    aiStyle: 'bold modern Poppins-style geometric sans-serif uppercase lettering',
    baseSize: 92,
    maxChars: 22
  },
  montserrat: {
    family: 'ContentStudioMontserrat',
    file: 'Montserrat-Bold.ttf',
    label: 'Montserrat Bold',
    aiStyle: 'bold Montserrat-style geometric sans-serif uppercase lettering',
    baseSize: 94,
    maxChars: 21
  },
  playfair: {
    family: 'ContentStudioPlayfair',
    file: 'PlayfairDisplay-Bold.ttf',
    label: 'Playfair Display Bold',
    baseSize: 104,
    maxChars: 19
  },
  'bebas-neue': {
    family: 'ContentStudioBebasNeue',
    file: 'BebasNeue-Regular.ttf',
    label: 'Bebas Neue',
    aiStyle: 'bold condensed Bebas Neue-style uppercase sans-serif lettering',
    baseSize: 112,
    maxChars: 23
  },
  groovy: {
    family: 'ContentStudioShrikhand',
    file: 'Shrikhand-Regular.ttf',
    label: 'Shrikhand Groovy',
    aiStyle: 'bold retro groovy display lettering with rounded 1970s curves and clean spacing',
    baseSize: 96,
    maxChars: 19
  },
  sacramento: {
    family: 'ContentStudioSacramento',
    file: 'Sacramento-Regular.ttf',
    label: 'Sacramento',
    baseSize: 118,
    maxChars: 20
  },
  'cabin-sketch': {
    family: 'ContentStudioCabinSketch',
    file: 'CabinSketch-Bold.ttf',
    label: 'Cabin Sketch',
    baseSize: 98,
    maxChars: 21
  }
};

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanOverlayText(value = '') {
  return String(value || '')
    .replace(/[—–]/g, '-')
    .replace(/[*_`#"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function shortOverlayText(value = '', maxWords = 7) {
  const clean = cleanOverlayText(value);
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return clean;
  const withoutFillers = words.filter((word) => !/^(the|a|an|that|you|will|for|with|and|to)$/i.test(word));
  return (withoutFillers.length >= 3 ? withoutFillers : words).slice(0, maxWords).join(' ');
}

function polishPinterestOverlayText(value = '', fallback = '') {
  const simplify = (input) => {
    let cleaned = cleanOverlayText(input)
      .split(/\s*(?::|\|)\s*/)[0]
      .replace(/^\s*\d+\s*[.)-]?\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const qualifier = cleaned.match(/\b(?:with|for|under|ready in|that)\b/i);
    if (qualifier) {
      const core = cleaned.slice(0, qualifier.index).trim();
      if (core.split(/\s+/).filter(Boolean).length >= 2) cleaned = core;
    }
    cleaned = shortOverlayText(cleaned, 5)
      .replace(/\b(?:canned fish taste|food taste|recipe taste)\b/gi, ' ')
      .replace(/\b(?:recipe|food|meal) ideas?\b/gi, ' ')
      .replace(/\b(?:recipes?|ideas?|taste)\b(?=\s*$)/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    while (words.length > 2 && words.join(' ').length > 42) words.pop();
    return words.join(' ');
  };
  const primary = simplify(value);
  if (primary.split(/\s+/).filter(Boolean).length >= 2) return primary;
  return simplify(fallback) || primary;
}

function wrapOverlayText(value, maxChars = 22, maxLines = 3) {
  const words = cleanOverlayText(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const compact = [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')];
  return compact;
}

const loadedFonts = new Map();

function loadFont(fontsDir, file) {
  const fontPath = path.join(fontsDir, file);
  if (!loadedFonts.has(fontPath)) loadedFonts.set(fontPath, opentype.loadSync(fontPath));
  return loadedFonts.get(fontPath);
}

function overlayGeometry(placement, lineCount, fontSize) {
  const lineHeight = Math.round(fontSize * 1.1);
  const panelHeight = Math.max(250, Math.min(500, lineCount * lineHeight + 88));
  const topSafeMargin = 78;
  const bottomCtaClearance = 275;
  const top = placement === 'top'
    ? topSafeMargin
    : placement === 'bottom'
      ? PIN_HEIGHT - panelHeight - bottomCtaClearance
      : Math.round((PIN_HEIGHT - panelHeight) / 2);
  return { top, panelHeight, lineHeight };
}

function pairingLines(lines, cleaned, definition) {
  if (!definition.pairing || lines.length !== 1) return lines;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 3) return lines;
  const splitAt = Math.ceil(words.length / 2);
  return [words.slice(0, splitAt).join(' '), words.slice(splitAt).join(' ')];
}

function buildOverlaySvg({ text, placement = 'middle', font = 'serif-sans', fontsDir, tone = 'light', variant = 'reuse', pinStyle = '', panelColor = '#21162f' }) {
  const isGenerated = variant === 'generated';
  const isOriginalJulyCenter = variant === 'original-july' || /july-original-ai/i.test(pinStyle);
  const isMagazine = /modern-recipe-magazine/i.test(pinStyle);
  const isMinimalEditorial = /minimal-editorial/i.test(pinStyle);
  const isIngredientCloseup = /ingredient-closeup/i.test(pinStyle);
  const isRecipeCard = /recipe-card/i.test(pinStyle);
  const isWeeknight = /weeknight-solution/i.test(pinStyle);
  const isListicle = /listicle-collage/i.test(pinStyle);
  const usesEditorialTop = isMagazine || isMinimalEditorial || isWeeknight || (isGenerated && !isIngredientCloseup && !isRecipeCard && !isListicle && !isOriginalJulyCenter);
  const resolvedPlacement = (isOriginalJulyCenter || isIngredientCloseup || isRecipeCard || isListicle) ? 'middle' : usesEditorialTop ? 'top' : placement;
  const resolvedFont = isMagazine || isRecipeCard
    ? 'food-editorial'
    : (usesEditorialTop || isIngredientCloseup || isListicle || isOriginalJulyCenter) ? 'poppins' : font;
  const definition = FONT_DEFINITIONS[resolvedFont] || FONT_DEFINITIONS['serif-sans'];
  const cleaned = (usesEditorialTop || isIngredientCloseup || isOriginalJulyCenter) ? cleanOverlayText(text).toUpperCase() : cleanOverlayText(text);
  let fontSize = isMagazine ? 104 : isOriginalJulyCenter ? 100 : isIngredientCloseup ? 108 : isRecipeCard ? 100 : isListicle ? 100 : usesEditorialTop ? Math.max(108, definition.baseSize) : definition.baseSize;
  if (cleaned.length > 55) fontSize -= 7;
  if (cleaned.length > 75) fontSize -= 7;
  let lines = pairingLines(wrapOverlayText(cleaned, definition.maxChars, 3), cleaned, definition);
  if (isMagazine && lines.length === 1) {
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const splitAt = Math.ceil(words.length / 2);
      lines = [words.slice(0, splitAt).join(' '), words.slice(splitAt).join(' ')];
    }
  }
  while (lines.some((line) => line.length > definition.maxChars + 10) && fontSize > 54) fontSize -= 4;
  const primaryTypeface = loadFont(fontsDir, definition.file);
  const secondaryTypeface = definition.secondaryFile ? loadFont(fontsDir, definition.secondaryFile) : primaryTypeface;
  const typefaces = lines.map((_, index) => definition.pairing && index > 0 ? secondaryTypeface : primaryTypeface);
  while (
    lines.some((line, index) => typefaces[index].getAdvanceWidth(line, fontSize, { kerning: true }) > PIN_WIDTH - 120)
    && fontSize > 58
  ) {
    fontSize -= 3;
  }
  const geometry = overlayGeometry(resolvedPlacement, lines.length, fontSize);
  const top = isMagazine ? 28 : geometry.top;
  const panelHeight = isMagazine
    ? Math.max(286, Math.min(350, lines.length * geometry.lineHeight + 64))
    : isOriginalJulyCenter
      ? Math.max(270, Math.min(430, lines.length * geometry.lineHeight + 84))
    : isIngredientCloseup
      ? Math.max(270, Math.min(420, lines.length * geometry.lineHeight + 82))
    : isRecipeCard
      ? Math.max(300, Math.min(440, lines.length * geometry.lineHeight + 104))
    : isListicle
      ? Math.max(280, Math.min(430, lines.length * geometry.lineHeight + 92))
      : geometry.panelHeight;
  const lineHeight = geometry.lineHeight;
  const totalTextHeight = (lines.length - 1) * lineHeight + fontSize;
  const firstBaseline = top + Math.round((panelHeight - totalTextHeight) / 2 + fontSize * 0.82);
  const paths = lines.map((line, index) => {
    const typeface = typefaces[index];
    const lineWidth = typeface.getAdvanceWidth(line, fontSize, { kerning: true });
    const x = Math.max(40, Math.round((PIN_WIDTH - lineWidth) / 2));
    const baseline = firstBaseline + index * lineHeight;
    const fill = isMagazine
      ? (definition.pairing && index === 0 ? '#382149' : '#263248')
      : isOriginalJulyCenter
      ? '#fffdf8'
      : isIngredientCloseup
      ? '#fffdf8'
      : isRecipeCard
      ? (definition.pairing && index === 0 ? '#5b2c6f' : '#202a3a')
      : isListicle
      ? '#fffdf8'
      : usesEditorialTop
      ? '#fffdf8'
      : tone === 'dark'
      ? (definition.pairing && index === 0 ? '#4b2478' : '#21162f')
      : (definition.pairing && index === 0 ? '#e5ff87' : '#fffdf7');
    return `<path fill="${fill}" d="${typeface.getPath(line, x, baseline, fontSize, { kerning: true }).toPathData(2)}"/>`;
  }).join('');
  const stroke = isMagazine || isRecipeCard ? 'transparent' : isOriginalJulyCenter ? 'rgba(35,23,48,0.70)' : isIngredientCloseup || isListicle ? 'rgba(33,20,48,0.74)' : usesEditorialTop ? 'rgba(23,16,31,0.90)' : tone === 'dark' ? 'rgba(255,255,255,0.98)' : 'rgba(32,18,47,0.97)';
  const strokeWidth = isMagazine || isRecipeCard ? 0 : isOriginalJulyCenter ? 5 : isIngredientCloseup || isListicle ? 5 : usesEditorialTop ? 6 : 12;
  const shadowOpacity = isMagazine || isRecipeCard ? '0.16' : isOriginalJulyCenter ? '0.40' : isIngredientCloseup || isListicle ? '0.38' : usesEditorialTop ? '0.52' : tone === 'dark' ? '0.44' : '0.76';
  const maxLineWidth = Math.max(...lines.map((line, index) => typefaces[index].getAdvanceWidth(line, fontSize, { kerning: true })), 0);
  const compactCenterPanel = isOriginalJulyCenter || isIngredientCloseup || isListicle;
  const panelWidth = compactCenterPanel ? Math.max(560, Math.min(850, Math.ceil(maxLineWidth + 112))) : isRecipeCard ? 880 : 876;
  const panelX = Math.round((PIN_WIDTH - panelWidth) / 2);
  const showCta = !isOriginalJulyCenter;
  const ctaText = 'GET THE RECIPE';
  const ctaTypeface = loadFont(fontsDir, 'Montserrat-Bold.ttf');
  const ctaFontSize = 34;
  const ctaTextWidth = ctaTypeface.getAdvanceWidth(ctaText, ctaFontSize, { kerning: true });
  const ctaWidth = Math.max(390, Math.min(470, Math.round(ctaTextWidth + 118)));
  const ctaHeight = 94;
  const ctaX = Math.round((PIN_WIDTH - ctaWidth) / 2);
  const ctaY = PIN_HEIGHT - 168;
  const ctaTextX = Math.round((PIN_WIDTH - ctaTextWidth) / 2);
  const ctaTextBaseline = ctaY + Math.round((ctaHeight - ctaFontSize) / 2 + ctaFontSize * 0.82);
  const ctaPath = ctaTypeface.getPath(ctaText, ctaTextX, ctaTextBaseline, ctaFontSize, { kerning: true }).toPathData(2);

  const panelMarkup = isMagazine
    ? `<rect x="0" y="0" width="${PIN_WIDTH}" height="${Math.min(410, top + panelHeight + 22)}" fill="#fffaf2"/><rect x="${(PIN_WIDTH - 156) / 2}" y="${Math.min(382, top + panelHeight - 2)}" width="156" height="6" rx="3" fill="#7d9a68"/>`
    : isOriginalJulyCenter
    ? `<rect x="${panelX}" y="${top}" width="${panelWidth}" height="${panelHeight}" rx="32" fill="${panelColor}" fill-opacity="0.56" stroke="#fffdf8" stroke-opacity="0.88" stroke-width="4"/>`
    : isIngredientCloseup
    ? `<rect x="${panelX}" y="${top}" width="${panelWidth}" height="${panelHeight}" rx="34" fill="${panelColor}" fill-opacity="0.58" stroke="#fffdf8" stroke-opacity="0.90" stroke-width="4"/>`
    : isRecipeCard
    ? `<rect x="${panelX}" y="${top}" width="880" height="${panelHeight}" rx="28" fill="#fffaf2" fill-opacity="0.93" stroke="#ffffff" stroke-opacity="0.96" stroke-width="4"/><rect x="${(PIN_WIDTH - 160) / 2}" y="${top + panelHeight - 34}" width="160" height="6" rx="3" fill="#7d9a68"/>`
    : isListicle
    ? `<rect x="${panelX}" y="${top}" width="${panelWidth}" height="${panelHeight}" rx="20" fill="${panelColor}" fill-opacity="0.64" stroke="#fffdf8" stroke-opacity="0.86" stroke-width="4"/>`
    : usesEditorialTop
    ? `<rect x="0" y="0" width="${PIN_WIDTH}" height="${Math.min(560, top + panelHeight + 110)}" fill="url(#headlineShade)"/>`
    : '';
  const ctaFill = isMagazine ? '#382149' : isRecipeCard ? '#5b2c6f' : isIngredientCloseup || isListicle ? '#fffdf8' : '#fffdf7';
  const ctaStroke = isMagazine ? '#382149' : isRecipeCard ? '#5b2c6f' : isIngredientCloseup || isListicle ? '#fffdf8' : '#2f2144';
  const ctaTextFill = isMagazine || isRecipeCard ? '#fffdf7' : isIngredientCloseup || isListicle ? '#342047' : '#2f2144';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}">
    <defs>
      <linearGradient id="headlineShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#160f20" stop-opacity="0.58"/>
        <stop offset="62%" stop-color="#160f20" stop-opacity="0.24"/>
        <stop offset="100%" stop-color="#160f20" stop-opacity="0"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#000000" flood-opacity="${shadowOpacity}"/>
      </filter>
      <filter id="ctaShadow" x="-30%" y="-50%" width="160%" height="200%">
        <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#170b27" flood-opacity="0.34"/>
      </filter>
    </defs>
    ${panelMarkup}
    <g aria-label="${escapeXml(cleaned)}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" style="paint-order:stroke fill" filter="url(#shadow)">${paths}</g>
    ${showCta ? `<g aria-label="${ctaText}" filter="url(#ctaShadow)">
      <rect x="${ctaX}" y="${ctaY}" width="${ctaWidth}" height="${ctaHeight}" rx="18" fill="${ctaFill}" stroke="${ctaStroke}" stroke-width="4"/>
      <path fill="${ctaTextFill}" d="${ctaPath}"/>
    </g>` : ''}
  </svg>`;

  return {
    input: Buffer.from(svg),
    top,
    panelHeight,
    font: resolvedFont in FONT_DEFINITIONS ? resolvedFont : 'serif-sans',
    fontLabel: definition.label,
    lines,
    fontSize,
    tone,
    ctaText: showCta ? ctaText : '',
    ctaTop: ctaY,
    ctaHeight,
    placement: resolvedPlacement,
    pinStyle,
    backgroundTreatment: isMagazine
      ? 'modern-recipe-magazine'
      : isOriginalJulyCenter
        ? 'original-july-center-glass'
      : isIngredientCloseup
        ? 'ingredient-closeup-glass'
      : isRecipeCard
        ? 'recipe-card-editorial'
      : isListicle
        ? 'listicle-center-glass'
      : isWeeknight
        ? 'weeknight-top-gradient'
      : usesEditorialTop
        ? 'minimal-editorial'
        : 'adaptive-outline-editorial-cta'
  };
}

async function chooseOverlayTone(sharp, base, geometry) {
  const { data, info } = await sharp(base)
    .extract({ left: 0, top: geometry.top, width: PIN_WIDTH, height: geometry.panelHeight })
    .resize(24, 12, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mean = data.reduce((sum, value) => sum + value, 0) / Math.max(1, info.width * info.height);
  return mean >= 148 ? 'dark' : 'light';
}

async function chooseCenterPanelColor(sharp, base, geometry) {
  const stats = await sharp(base)
    .extract({ left: 0, top: geometry.top, width: PIN_WIDTH, height: geometry.panelHeight })
    .resize(24, 12, { fit: 'fill' })
    .removeAlpha()
    .stats();
  const means = stats.channels.slice(0, 3).map((channel) => Number(channel.mean || 0));
  while (means.length < 3) means.push(means[0] || 45);
  const darkened = means.map((value) => Math.max(24, Math.min(132, Math.round(value * 0.52))));
  return `rgb(${darkened[0]},${darkened[1]},${darkened[2]})`;
}

async function perceptualHash(sharp, buffer) {
  const { data } = await sharp(buffer)
    .resize(9, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bits = '';
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      bits += data[row * 9 + column] > data[row * 9 + column + 1] ? '1' : '0';
    }
  }
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

function perceptualHashDistance(first = '', second = '') {
  const left = String(first || '').trim().toLowerCase();
  const right = String(second || '').trim().toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(left) || !/^[0-9a-f]{16}$/.test(right)) return Infinity;
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (value) {
    distance += Number(value & 1n);
    value >>= 1n;
  }
  return distance;
}

function comparePinterestImageIdentity(expected = {}, actual = {}, maxPerceptualDistance = 8) {
  const expectedSha = String(expected.sha256 || '').trim().toLowerCase();
  const actualSha = String(actual.sha256 || '').trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(expectedSha) && expectedSha === actualSha) {
    return { matches: true, exact: true, distance: 0 };
  }
  const distance = perceptualHashDistance(expected.perceptualHash, actual.perceptualHash);
  return {
    matches: Number.isFinite(distance) && distance <= maxPerceptualDistance,
    exact: false,
    distance
  };
}

async function createPinterestOverlay({
  sharp,
  inputBuffer,
  outputPath,
  overlayText,
  placement = 'middle',
  font = 'serif-sans',
  fontsDir,
  variant = 'reuse',
  pinStyle = ''
}) {
  if (!sharp) throw new Error('Sharp is required to create a Pinterest overlay.');
  if (!inputBuffer?.length) throw new Error('The Pinterest source image is empty.');
  const text = cleanOverlayText(overlayText);
  if (!text) throw new Error('Overlay text is required.');

  const base = await sharp(inputBuffer, { animated: false })
    .rotate()
    .resize(PIN_WIDTH, PIN_HEIGHT, {
      fit: 'cover',
      position: sharp.strategy?.attention || 'attention'
    })
    .webp({ quality: 92, effort: 5, smartSubsample: true })
    .toBuffer();
  const initialOverlay = buildOverlaySvg({ text, placement, font, fontsDir, variant, pinStyle });
  const tone = variant === 'generated' ? 'light' : await chooseOverlayTone(sharp, base, initialOverlay);
  const panelColor = ['original-july-center-glass', 'ingredient-closeup-glass', 'listicle-center-glass'].includes(initialOverlay.backgroundTreatment)
    ? await chooseCenterPanelColor(sharp, base, initialOverlay)
    : '#21162f';
  const overlay = buildOverlaySvg({ text, placement, font, fontsDir, tone, variant, pinStyle, panelColor });
  const finalBuffer = await sharp(base)
    .composite([{ input: overlay.input, left: 0, top: 0 }])
    .webp({ quality: 90, effort: 6, smartSubsample: true })
    .toBuffer();

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, finalBuffer);
  const metadata = await sharp(finalBuffer).metadata();
  const stats = await sharp(finalBuffer).stats();
  const entropy = stats.channels.reduce((sum, channel) => sum + Number(channel.entropy || 0), 0) / Math.max(1, stats.channels.length);
  const variation = stats.channels.reduce((sum, channel) => sum + Number(channel.stdev || 0), 0) / Math.max(1, stats.channels.length);
  const hash = await perceptualHash(sharp, finalBuffer);

  return {
    outputPath,
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || '',
    bytes: finalBuffer.length,
    sha256: createHash('sha256').update(finalBuffer).digest('hex'),
    perceptualHash: hash,
    entropy: Number(entropy.toFixed(3)),
    variation: Number(variation.toFixed(3)),
    overlayText: text,
    overlayVerified: true,
    placement: overlay.placement,
    font: overlay.font,
    fontLabel: overlay.fontLabel,
    overlayTone: overlay.tone,
    backgroundTreatment: overlay.backgroundTreatment,
    ctaText: overlay.ctaText,
    ctaVerified: !overlay.ctaText || (overlay.ctaTop >= 120 && overlay.ctaTop + overlay.ctaHeight <= PIN_HEIGHT - 60),
    safeZoneVerified: overlay.top >= (overlay.backgroundTreatment === 'modern-recipe-magazine' ? 20 : 60)
      && overlay.top + overlay.panelHeight <= (overlay.ctaText ? overlay.ctaTop - 30 : PIN_HEIGHT - 60),
    dimensionsVerified: metadata.width === PIN_WIDTH && metadata.height === PIN_HEIGHT,
    nonBlankVerified: entropy > 0.35 || variation > 2
  };
}

async function createPinterestImageWithoutOverlay({
  sharp,
  inputBuffer,
  outputPath,
  overlayText = '',
  placement = 'middle'
}) {
  if (!sharp) throw new Error('Sharp is required to save a Pinterest image.');
  if (!inputBuffer?.length) throw new Error('The Pinterest source image is empty.');
  const finalBuffer = await sharp(inputBuffer, { animated: false })
    .rotate()
    .resize(PIN_WIDTH, PIN_HEIGHT, {
      fit: 'cover',
      position: sharp.strategy?.attention || 'attention'
    })
    .webp({ quality: 90, effort: 6, smartSubsample: true })
    .toBuffer();

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, finalBuffer);
  const metadata = await sharp(finalBuffer).metadata();
  const stats = await sharp(finalBuffer).stats();
  const entropy = stats.channels.reduce((sum, channel) => sum + Number(channel.entropy || 0), 0) / Math.max(1, stats.channels.length);
  const variation = stats.channels.reduce((sum, channel) => sum + Number(channel.stdev || 0), 0) / Math.max(1, stats.channels.length);

  return {
    outputPath,
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || '',
    bytes: finalBuffer.length,
    sha256: createHash('sha256').update(finalBuffer).digest('hex'),
    perceptualHash: await perceptualHash(sharp, finalBuffer),
    entropy: Number(entropy.toFixed(3)),
    variation: Number(variation.toFixed(3)),
    overlayText: cleanOverlayText(overlayText),
    overlayVerified: false,
    aiTextRequested: true,
    textRenderMode: 'ai',
    placement,
    safeZoneVerified: false,
    dimensionsVerified: metadata.width === PIN_WIDTH && metadata.height === PIN_HEIGHT,
    nonBlankVerified: entropy > 0.35 || variation > 2
  };
}

module.exports = {
  FONT_DEFINITIONS,
  PIN_HEIGHT,
  PIN_WIDTH,
  buildOverlaySvg,
  cleanOverlayText,
  comparePinterestImageIdentity,
  createPinterestImageWithoutOverlay,
  createPinterestOverlay,
  perceptualHash,
  perceptualHashDistance,
  polishPinterestOverlayText,
  shortOverlayText,
  wrapOverlayText
};
