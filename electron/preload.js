const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  qualityWorkspace: (action, params = {}) => ipcRenderer.invoke('quality-workspace', { action, params }),
  pinWorkspace: (action, params = {}) => ipcRenderer.invoke('pin-workspace', { action, params }),
  // Settings (secrets auto-encrypted in main process)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  clearStoredCredential: (params) => ipcRenderer.invoke('clear-stored-credential', params),
  testImpactConnection: (params) => ipcRenderer.invoke('test-impact-connection', params),
  searchImpactProducts: (params) => ipcRenderer.invoke('search-impact-products', params),
  createImpactAffiliateLink: (params) => ipcRenderer.invoke('create-impact-affiliate-link', params),
  testAmazonConnection: (params) => ipcRenderer.invoke('test-amazon-connection', params),
  searchAmazonProducts: (params) => ipcRenderer.invoke('search-amazon-products', params),
  createAmazonAffiliateLink: (params) => ipcRenderer.invoke('create-amazon-affiliate-link', params),
  discoverAffiliates: (params) => ipcRenderer.invoke('discover-affiliates', params),
  connectGoogleSearchConsole: () => ipcRenderer.invoke('connect-google-search-console'),
  getGoogleAnalyticsWorkspace: () => ipcRenderer.invoke('get-google-analytics-workspace'),
  refreshGoogleAnalytics: () => ipcRenderer.invoke('refresh-google-analytics'),
  getMetaCaptionDraft: (params) => ipcRenderer.invoke('get-meta-caption-draft', params),
  disconnectGoogleSearchConsole: () => ipcRenderer.invoke('disconnect-google-search-console'),
  testPinterestAnalytics: () => ipcRenderer.invoke('test-pinterest-analytics'),
  getPerformanceIntelligence: () => ipcRenderer.invoke('get-performance-intelligence'),
  refreshPerformanceIntelligence: (params) => ipcRenderer.invoke('refresh-performance-intelligence', params),
  getPerformanceSchedule: (params) => ipcRenderer.invoke('get-performance-schedule', params),
  refreshGhlPublishingStatus: () => ipcRenderer.invoke('refresh-ghl-publishing-status'),
  auditRecipeSeo: (params) => ipcRenderer.invoke('audit-recipe-seo', params),

  // Articles CRUD
  getArticles: () => ipcRenderer.invoke('get-articles'),
  saveArticle: (article) => ipcRenderer.invoke('save-article', article),
  queueArticles: (params) => ipcRenderer.invoke('queue-articles', params),
  prepareArticleRecipe: (params) => ipcRenderer.invoke('prepare-article-recipe', params),
  markRecipeReviewed: (params) => ipcRenderer.invoke('mark-recipe-reviewed', params),
  clearUnknownWordPressReceipt: (params) => ipcRenderer.invoke('clear-unknown-wordpress-receipt', params),
  deleteArticle: (articleId) => ipcRenderer.invoke('delete-article', articleId),
  exportArticles: () => ipcRenderer.invoke('export-articles'),
  importArticles: () => ipcRenderer.invoke('import-articles'),
  createWorkspaceBackup: () => ipcRenderer.invoke('create-workspace-backup'),
  getWorkspaceBackupStatus: () => ipcRenderer.invoke('get-workspace-backup-status'),
  restoreLatestWorkspaceBackup: () => ipcRenderer.invoke('restore-latest-workspace-backup'),
  openWorkspaceBackups: () => ipcRenderer.invoke('open-workspace-backups'),
  getDiagnostics: () => ipcRenderer.invoke('get-diagnostics'),
  getMediaStorageStats: (params) => ipcRenderer.invoke('get-media-storage-stats', params),
  cleanupUnusedMedia: (params) => ipcRenderer.invoke('cleanup-unused-media', params),
  getJobCenter: () => ipcRenderer.invoke('get-job-center'),
  clearFinishedJobs: () => ipcRenderer.invoke('clear-finished-jobs'),
  openJobWorkspace: (params) => ipcRenderer.invoke('open-job-workspace', params),
  getAppUpdateStatus: () => ipcRenderer.invoke('get-app-update-status'),
  checkForAppUpdate: () => ipcRenderer.invoke('check-for-app-update'),
  downloadAppUpdate: () => ipcRenderer.invoke('download-app-update'),
  installAppUpdate: () => ipcRenderer.invoke('install-app-update'),
  clearTemporaryMediaCache: () => ipcRenderer.invoke('clear-temporary-media-cache'),
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  reportRendererError: (report) => ipcRenderer.invoke('report-renderer-error', report),
  copyText: (value) => ipcRenderer.invoke('copy-text', value),
  getGrowthWorkspace: () => ipcRenderer.invoke('get-growth-workspace'),
  upsertGrowthRecord: (params) => ipcRenderer.invoke('upsert-growth-record', params),
  deleteGrowthRecord: (params) => ipcRenderer.invoke('delete-growth-record', params),
  importRevenueCsv: () => ipcRenderer.invoke('import-revenue-csv'),

  // Generation (each takes optional jobKey for cancellation)
  generateArticleOutline: (params) => ipcRenderer.invoke('generate-article-outline', params),
  regenerateArticleSection: (params) => ipcRenderer.invoke('regenerate-article-section', params),
  generateArticle: (params) => ipcRenderer.invoke('generate-article', params),
  generateImagePrompts: (params) => ipcRenderer.invoke('generate-image-prompts', params),
  generateFeaturedImagePrompt: (params) => ipcRenderer.invoke('generate-featured-image-prompt', params),
  generateArticleTitle: (params) => ipcRenderer.invoke('generate-article-title', params),
  generateImage: (...args) => ipcRenderer.invoke('generate-image', ...args),
  generateVideo: (params) => ipcRenderer.invoke('generate-video', params),
  researchMetaTrends: (params) => ipcRenderer.invoke('research-meta-trends', params),
  getTrendWorkspace: () => ipcRenderer.invoke('get-trend-workspace'),
  importPinterestAnalytics: () => ipcRenderer.invoke('import-pinterest-analytics'),
  clearPinterestAnalytics: () => ipcRenderer.invoke('clear-pinterest-analytics'),
  researchKeywords: (params) => ipcRenderer.invoke('research-keywords', params),
  getPinterestClusterWorkspace: () => ipcRenderer.invoke('get-pinterest-cluster-workspace'),
  buildPinterestClusters: (params) => ipcRenderer.invoke('build-pinterest-clusters', params),
  exportKeywordResearch: (research) => ipcRenderer.invoke('export-keyword-research', research),
  deleteKeywordResearch: (researchId) => ipcRenderer.invoke('delete-keyword-research', researchId),
  generateMetaContent: (params) => ipcRenderer.invoke('generate-meta-content', params),
  generatePrompt: (url, interests, style, jobKey, context) => ipcRenderer.invoke('generate-prompt', url, interests, style, jobKey, context),
  generateTitleDescription: (url, interests, style, jobKey, context) => ipcRenderer.invoke('generate-title-description', url, interests, style, jobKey, context),
  createPinterestPinAsset: (params) => ipcRenderer.invoke('create-pinterest-pin-asset', params),
  preparePinterestExport: (params) => ipcRenderer.invoke('prepare-pinterest-export', params),
  validatePinterestExport: (params) => ipcRenderer.invoke('validate-pinterest-export', params),
  exportPinterestCsv: (params) => ipcRenderer.invoke('export-pinterest-csv', params),
  getPinterestDelivery: () => ipcRenderer.invoke('get-pinterest-delivery'),
  revealPinterestExport: (params) => ipcRenderer.invoke('reveal-pinterest-export', params),
  suggestPinterestResults: (params) => ipcRenderer.invoke('suggest-pinterest-results', params),
  savePinterestReceiptDraft: (params) => ipcRenderer.invoke('save-pinterest-receipt-draft', params),
  importPinterestReceipt: () => ipcRenderer.invoke('import-pinterest-receipt'),
  savePinterestResults: (params) => ipcRenderer.invoke('save-pinterest-results', params),
  getPinterestRetry: (params) => ipcRenderer.invoke('get-pinterest-retry', params),
  generateRepurposePack: (params) => ipcRenderer.invoke('generate-repurpose-pack', params),

  // Cancel in-flight jobs
  cancelJob: (jobKey) => ipcRenderer.invoke('cancel-job', jobKey),
  cancelJobsByPrefix: (prefixes) => ipcRenderer.invoke('cancel-jobs-by-prefix', prefixes),

  // Cost estimation
  estimateCost: (params) => ipcRenderer.invoke('estimate-cost', params),

  // WordPress (standard REST API + Application Passwords)
  testWordPressConnection: (params) => ipcRenderer.invoke('test-wordpress-connection', params),
  syncWordPressCategories: (params) => ipcRenderer.invoke('sync-wordpress-categories', params),
  syncWordPressPosts: (params) => ipcRenderer.invoke('sync-wordpress-posts', params),
  pushToWordPress: (params) => ipcRenderer.invoke('push-to-wordpress', params),

  // Misc
  openPinCreator: () => ipcRenderer.invoke('open-pin-creator'),
  openRepurposeStudio: () => ipcRenderer.invoke('open-repurpose-studio'),
  testConnection: (token) => ipcRenderer.invoke('test-connection', token),
  savePinCreatorPins: (pins) => ipcRenderer.invoke('save-pin-creator-pins', pins),
  getPinCreatorPins: () => ipcRenderer.invoke('get-pin-creator-pins'),
  createRepurposeImageVariants: (params) => ipcRenderer.invoke('create-repurpose-image-variants', params),
  getPinQueue: () => ipcRenderer.invoke('get-pin-queue'),
  ackPinQueue: (queueIds) => ipcRenderer.invoke('ack-pin-queue', queueIds),
  appendPinQueue: (items) => ipcRenderer.invoke('append-pin-queue', items),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  openLogFile: () => ipcRenderer.invoke('open-log-file'),
  selectWatermarkImage: () => ipcRenderer.invoke('select-watermark-image'),
  selectArticleImage: () => ipcRenderer.invoke('select-article-image'),
  importTitlesCsv: () => ipcRenderer.invoke('import-titles-csv'),
  downloadSampleArticleCsv: () => ipcRenderer.invoke('download-sample-article-csv'),
  exportRepurposePacks: (params) => ipcRenderer.invoke('export-repurpose-packs', params),
  prepareRepurposeGhlRows: (params) => ipcRenderer.invoke('prepare-repurpose-ghl-rows', params),
  exportRepurposeGhlRows: (params) => ipcRenderer.invoke('export-repurpose-ghl-rows', params),
  uploadRepurposeGhlRows: (params) => ipcRenderer.invoke('upload-repurpose-ghl-rows', params),
  saveRepurposePacks: (params) => ipcRenderer.invoke('save-repurpose-packs', params),
  getRepurposePacks: () => ipcRenderer.invoke('get-repurpose-packs'),
  getGeneratedVideos: () => ipcRenderer.invoke('get-generated-videos'),
  deleteGeneratedVideo: (videoId) => ipcRenderer.invoke('delete-generated-video', videoId),
  getMetaProjects: () => ipcRenderer.invoke('get-meta-projects'),
  saveMetaProject: (project) => ipcRenderer.invoke('save-meta-project', project),
  deleteMetaProject: (projectId) => ipcRenderer.invoke('delete-meta-project', projectId),
  getMetaBulkGhlDraft: () => ipcRenderer.invoke('get-meta-bulk-ghl-draft'),
  prepareMetaBulkGhlRows: (params) => ipcRenderer.invoke('prepare-meta-bulk-ghl-rows', params),

  // Recipe Money Maker
  getRecipeMoneyMakerState: () => ipcRenderer.invoke("rmm-get-state"),
  saveRecipeMoneyMakerSettings: (params) => ipcRenderer.invoke("rmm-save-settings", params),
  chooseRecipeMoneyMakerLogo: () => ipcRenderer.invoke("rmm-choose-logo"),
  testRecipeMoneyMakerConnection: (params) => ipcRenderer.invoke("rmm-test-connection", params),
  clearRecipeMoneyMakerApiKey: () => ipcRenderer.invoke("rmm-clear-api-key"),
  generateRecipeMoneyMakerRecipe: (params) => ipcRenderer.invoke("rmm-generate", params),
  deleteRecipeMoneyMakerRecipes: (params) => ipcRenderer.invoke("rmm-delete", params),
  exportRecipeMoneyMakerPdf: (params) => ipcRenderer.invoke("rmm-export-pdf", params),

  // Progress events
  onImageProgress: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('image-generation-progress', handler);
    return () => ipcRenderer.removeListener('image-generation-progress', handler);
  },
  onPinProgress: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('pin-generation-progress', handler);
    return () => ipcRenderer.removeListener('pin-generation-progress', handler);
  },
  onVideoProgress: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('video-generation-progress', handler);
    return () => ipcRenderer.removeListener('video-generation-progress', handler);
  },
  onMetaBulkProgress: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('meta-bulk-progress', handler);
    return () => ipcRenderer.removeListener('meta-bulk-progress', handler);
  },
  onJobCenterUpdated: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('job-center-updated', handler);
    return () => ipcRenderer.removeListener('job-center-updated', handler);
  },
  onAppUpdateStatus: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('app-update-status', handler);
    return () => ipcRenderer.removeListener('app-update-status', handler);
  },
  onNavigateSettings: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('navigate-settings', handler);
    return () => ipcRenderer.removeListener('navigate-settings', handler);
  },
  onNavigateScreen: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('navigate-screen', handler);
    return () => ipcRenderer.removeListener('navigate-screen', handler);
  },
  onPinQueueUpdated: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('pin-queue-updated', handler);
    return () => ipcRenderer.removeListener('pin-queue-updated', handler);
  }
});
