const SETTINGS_SCHEMA_VERSION = 1;

const imageRatioDefaults = Object.freeze({
  featuredImageRatio: '3:2',
  intextImageRatio: '4:3',
  pinterestPinRatio: '2:3',
  instagramPortraitRatio: '4:5',
  instagramStoryRatio: '9:16',
  facebookFeedRatio: '1.91:1',
  squareSocialRatio: '1:1'
});

function migrateSettings(input = {}) {
  const original = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  let settings = { ...original };
  let version = Math.max(0, Number(settings.settingsSchemaVersion || 0));
  const applied = [];

  if (version < 1) {
    settings = {
      ...imageRatioDefaults,
      ...settings,
      featuredImageRatio: settings.featuredImageRatio || settings.featuredImageAspectRatio || imageRatioDefaults.featuredImageRatio,
      intextImageRatio: settings.intextImageRatio || settings.intextImageAspectRatio || imageRatioDefaults.intextImageRatio,
      pinterestPinRatio: settings.pinterestPinRatio || settings.pinCreator?.aspectRatio || imageRatioDefaults.pinterestPinRatio,
      instagramPortraitRatio: settings.instagramPortraitRatio || imageRatioDefaults.instagramPortraitRatio,
      instagramStoryRatio: settings.instagramStoryRatio || imageRatioDefaults.instagramStoryRatio,
      facebookFeedRatio: settings.facebookFeedRatio || imageRatioDefaults.facebookFeedRatio,
      squareSocialRatio: settings.squareSocialRatio || imageRatioDefaults.squareSocialRatio,
      settingsSchemaVersion: 1
    };
    version = 1;
    applied.push('image-ratios-v1');
  }

  return {
    settings: {
      ...settings,
      settingsSchemaVersion: Math.max(version, SETTINGS_SCHEMA_VERSION)
    },
    applied,
    changed: JSON.stringify(settings) !== JSON.stringify(original)
  };
}

module.exports = {
  SETTINGS_SCHEMA_VERSION,
  imageRatioDefaults,
  migrateSettings
};
