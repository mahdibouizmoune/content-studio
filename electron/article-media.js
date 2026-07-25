const { isSafeRemoteMediaUrl } = require('./media-security');

function firstSafeRemote(values = []) {
  return values
    .map((value) => String(value || '').trim())
    .find((value) => isSafeRemoteMediaUrl(value)) || '';
}

function normalizeGeneratedMedia(media = {}, localPathToFileUrl = () => '') {
  if (!media || typeof media !== 'object') return media;
  const localUrl = localPathToFileUrl(media.localPath);
  const remoteUrl = firstSafeRemote([
    media.remoteImageUrl,
    media.imageUrl,
    media.url,
    media.displayUrl,
    media.localImageUrl,
    media.localUrl
  ]);
  const hadLocalReference = Boolean(
    media.localPath
    || String(media.displayUrl || '').startsWith('file:')
    || String(media.localImageUrl || '').startsWith('file:')
    || String(media.localUrl || '').startsWith('file:')
  );

  return {
    ...media,
    imageUrl: remoteUrl || '',
    remoteImageUrl: remoteUrl || '',
    localImageUrl: localUrl || '',
    localUrl: localUrl || '',
    displayUrl: localUrl || remoteUrl || '',
    url: localUrl || remoteUrl || '',
    localMediaMissing: hadLocalReference && !localUrl
  };
}

function normalizeArticleMediaRecord(article = {}, localPathToFileUrl = () => '') {
  const next = { ...article };
  const featured = normalizeGeneratedMedia({
    localPath: next.featuredImageLocalPath,
    localImageUrl: next.featuredImageLocalUrl,
    displayUrl: next.featuredImageDisplay,
    imageUrl: next.featuredImage,
    remoteImageUrl: next.featuredImageRemoteUrl
  }, localPathToFileUrl);

  next.featuredImage = featured.displayUrl;
  next.featuredImageRemoteUrl = featured.remoteImageUrl;
  next.featuredImageLocalUrl = featured.localImageUrl;
  next.featuredImageDisplay = featured.displayUrl;
  next.featuredImageLocalMissing = featured.localMediaMissing;
  next.images = (Array.isArray(next.images) ? next.images : [])
    .map((image) => normalizeGeneratedMedia(image, localPathToFileUrl));

  if (next.generationCheckpoint && typeof next.generationCheckpoint === 'object') {
    next.generationCheckpoint = {
      ...next.generationCheckpoint,
      featured: normalizeGeneratedMedia(next.generationCheckpoint.featured, localPathToFileUrl),
      images: (Array.isArray(next.generationCheckpoint.images) ? next.generationCheckpoint.images : [])
        .map((image) => normalizeGeneratedMedia(image, localPathToFileUrl))
    };
  }
  return next;
}

module.exports = {
  normalizeArticleMediaRecord,
  normalizeGeneratedMedia
};
