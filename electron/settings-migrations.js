const SETTINGS_SCHEMA_VERSION = 6;

const imageRatioDefaults = Object.freeze({
  featuredImageRatio: '3:2',
  intextImageRatio: '9:16',
  pinterestPinRatio: '9:16',
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

  if (version < 2) {
    settings = {
      ...settings,
      internalLinkCount: settings.internalLinkCount === undefined || Number(settings.internalLinkCount) === 4
        ? 3
        : settings.internalLinkCount,
      internalLinkMaxPosts: settings.internalLinkMaxPosts === undefined
        || [150, 300].includes(Number(settings.internalLinkMaxPosts))
        || Number(settings.internalLinkMaxPosts) > 500
        ? 500
        : settings.internalLinkMaxPosts,
      publishStatus: !settings.publishStatus || settings.publishStatus === 'draft'
        ? 'publish'
        : settings.publishStatus,
      affiliateEnabled: true,
      affiliateAutoInsert: true,
      affiliateAutoDiscover: true,
      featureFlags: {
        contentCalendar: false,
        campaignRecords: false,
        contentUpdateQueue: false,
        revenueAttribution: false,
        runHistory: false,
        modelRegistry: false,
        ...(settings.featureFlags && typeof settings.featureFlags === 'object' ? settings.featureFlags : {})
      },
      settingsSchemaVersion: 2
    };
    delete settings.youtubeArticlePrompt;
    version = 2;
    applied.push('workflow-defaults-v2');
  }

  if (version < 3) {
    settings = {
      ...settings,
      intextImageRatio: !settings.intextImageRatio || settings.intextImageRatio === '4:3'
        ? imageRatioDefaults.intextImageRatio
        : settings.intextImageRatio,
      settingsSchemaVersion: 3
    };
    version = 3;
    applied.push('pinterest-portrait-image-v3');
  }

  if (version < 4) {
    settings = {
      ...settings,
      featureFlags: {
        ...(settings.featureFlags && typeof settings.featureFlags === 'object' ? settings.featureFlags : {}),
        contentCalendar: true,
        campaignRecords: true,
        contentUpdateQueue: true,
        revenueAttribution: true,
        runHistory: true,
        modelRegistry: true
      },
      performanceSchedulingEnabled: settings.performanceSchedulingEnabled !== false,
      postPublishQaEnabled: settings.postPublishQaEnabled !== false,
      mediaRetentionDays: Math.max(7, Number(settings.mediaRetentionDays || 30)),
      settingsSchemaVersion: 4
    };
    version = 4;
    applied.push('operations-workspaces-v4');
  }

  if (version < 5) {
    const existingRetention = Number(settings.mediaRetentionDays || 0);
    settings = {
      ...settings,
      automaticMediaCleanupEnabled: settings.automaticMediaCleanupEnabled !== false,
      mediaRetentionDays: !existingRetention || existingRetention === 30
        ? 7
        : Math.max(7, Math.min(365, Math.round(existingRetention))),
      settingsSchemaVersion: 5
    };
    version = 5;
    applied.push('automatic-media-cleanup-v5');
  }

  if (version < 6) {
    settings = {
      ...settings,
      pinterestPinRatio: '9:16',
      pinCreator: {
        ...(settings.pinCreator || {}), postInterval: 60,
        customStyles: Object.fromEntries(Object.entries(settings.pinCreator?.customStyles || {}).map(([id, style]) => (
          [id, { ...style, prompt: String(style.prompt || '').replace(/vertical 2:3/g, 'vertical 9:16') }]
        )))
      },
      impactArticlesEnabled: false,
      wordpressPinCleanupEnabled: true,
      settingsSchemaVersion: 6
    };
    version = 6;
    applied.push('pin-workflow-v6');
  }

  const migrated = {
    ...settings,
    settingsSchemaVersion: Math.max(version, SETTINGS_SCHEMA_VERSION)
  };

  return {
    settings: migrated,
    applied,
    changed: JSON.stringify(migrated) !== JSON.stringify(original)
  };
}

module.exports = {
  SETTINGS_SCHEMA_VERSION,
  imageRatioDefaults,
  migrateSettings
};
