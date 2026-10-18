'use strict';
async function renderExactTemplate({ sharp, bytes, text, fontData, width = 1080, height = 1920, placement = 'middle' }) {
  if (!text?.trim() || text.length > 100) throw new Error('Exact overlay must contain 1 to 100 characters.');
  if (!['middle', 'top', 'bottom'].includes(placement)) throw new Error('Choose a valid text placement.');
  if (![[1080, 1920], [1000, 1500]].some(([w, h]) => width === w && height === h)) throw new Error('Choose a supported portrait canvas.');
  const { default: satori } = await import('satori');
  const svg = await satori({ type: 'div', props: { style: { width, height, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: placement === 'top' ? 'flex-start' : placement === 'bottom' ? 'flex-end' : 'center', flexDirection: 'column', padding: 80 }, children: {
    type: 'div', props: { style: { width: width - 160, boxSizing: 'border-box', display: 'flex', justifyContent: 'center', textAlign: 'center', backgroundColor: 'rgba(18,25,20,0.64)', color: '#fff', border: '3px solid white', borderRadius: 20, padding: 36, fontFamily: 'Pin', fontSize: text.length > 65 ? 66 : 80, fontWeight: 700, lineHeight: 1.12, letterSpacing: 0, overflowWrap: 'anywhere' }, children: text.toUpperCase() },
  } } }, { width, height, fonts: [{ name: 'Pin', data: fontData, weight: 700, style: 'normal' }] });
  return sharp(bytes, { limitInputPixels: 40000000 }).resize(width, height, { fit: 'cover' }).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 90 }).toBuffer();
}
module.exports = { renderExactTemplate };
