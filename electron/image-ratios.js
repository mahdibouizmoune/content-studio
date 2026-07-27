const commonRatios = Object.freeze(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']);
const customDimensionRatios = Object.freeze([...commonRatios, '4:5', '1.91:1']);

const modelRatios = Object.freeze({
  'z-image-turbo': customDimensionRatios,
  'flux-pro-2': customDimensionRatios,
  'seedream-4.5': customDimensionRatios,
  'gpt-image-2': ['1:1', '3:2', '2:3'],
  'imagen-4-fast': ['1:1', '16:9', '9:16', '4:3', '3:4'],
  'imagen-4-ultra': ['1:1', '16:9', '9:16', '4:3', '3:4']
});

function ratioValue(ratio = '') {
  const match = String(ratio).trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return 1;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : 1;
}

function supportedRatiosForModel(model = '') {
  return modelRatios[model] || commonRatios;
}

function resolveImageRatio(model, requestedRatio) {
  const requested = String(requestedRatio || '1:1').trim();
  const supported = supportedRatiosForModel(model);
  if (supported.includes(requested)) {
    return { requestedRatio: requested, ratio: requested, adjusted: false, notice: '' };
  }
  const requestedValue = ratioValue(requested);
  const ratio = [...supported].sort((left, right) =>
    Math.abs(Math.log(ratioValue(left) / requestedValue))
    - Math.abs(Math.log(ratioValue(right) / requestedValue))
  )[0] || '1:1';
  return {
    requestedRatio: requested,
    ratio,
    adjusted: true,
    notice: `${model || 'Selected model'} does not support ${requested}. Using the closest supported ratio, ${ratio}.`
  };
}

function ratioToDimensions(ratio, longEdge = 1024) {
  const value = ratioValue(ratio);
  if (value >= 1) {
    return {
      width: Math.max(64, Math.round(longEdge / 16) * 16),
      height: Math.max(64, Math.round((longEdge / value) / 16) * 16)
    };
  }
  return {
    width: Math.max(64, Math.round((longEdge * value) / 16) * 16),
    height: Math.max(64, Math.round(longEdge / 16) * 16)
  };
}

module.exports = {
  commonRatios,
  customDimensionRatios,
  ratioToDimensions,
  ratioValue,
  resolveImageRatio,
  supportedRatiosForModel
};
