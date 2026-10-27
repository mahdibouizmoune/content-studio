'use strict';

// Meta 4:5 from a finished Pin: the whole Pin is scaled to fit and centred over a softened,
// dimmed copy of itself, so top headlines and bottom buttons are never cropped away.
async function renderMetaPortrait(sharp, input, { width = 1080, height = 1350 } = {}) {
  const background = await sharp(input)
    .rotate()
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .blur(40)
    .modulate({ brightness: 0.8 })
    .toBuffer();
  const foreground = await sharp(input)
    .rotate()
    .resize(width, height, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true });
  return sharp(background)
    .composite([{
      input: foreground.data,
      left: Math.round((width - foreground.info.width) / 2),
      top: Math.round((height - foreground.info.height) / 2)
    }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

module.exports = { renderMetaPortrait };
