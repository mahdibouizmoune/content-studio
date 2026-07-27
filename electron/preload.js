const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings (secrets auto-encrypted in main process)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  testImpactConnection: (params) => ipcRenderer.invoke('test-impact-connection', params),
  searchImpactProducts: (params) => ipcRenderer.invoke('search-impact-products', params),
  createImpactAffiliateLink: (params) => ipcRenderer.invoke('create-impact-affiliate-link', params),
  discoverImpactAffiliates: (params) => ipcRenderer.invoke('discover-impact-affiliates', params),
  testAmazonConnection: (params) => ipcRenderer.invoke('test-amazon-connection', params),
  searchAmazonProducts: (params) => ipcRenderer.invoke('search-amazon-products', params),
  createAmazonAffiliateLink: (params) => ipcRenderer.invoke('create-amazon-affiliate-link', params),
  discoverAffiliates: (params) => ipcRenderer.invoke('discover-affiliates', params),
  connectGoogleSearchConsole: () => ipcRenderer.invoke('connect-google-search-console'),
  disconnectGoogleSearchConsole: () => ipcRenderer.invoke('disconnect-google-search-console'),
  testPinterestAnalytics: () => ipcRenderer.invoke('test-pinterest-analytics'),
  getPerformanceIntelligence: () => ipcRenderer.invoke('get-performance-intelligence'),
  refreshPerformanceIntelligence: (params) => ipcRenderer.invoke('refresh-performance-intelligence', params),
  refreshGhlPublishingStatus: () => ipcRenderer.invoke('refresh-ghl-publishing-status'),
  auditRecipeSeo: (params) => ipcRenderer.invoke('audit-recipe-seo', params),

  // Articles CRUD
  getArticles: () => ipcRenderer.invoke('get-articles'),
  saveArticle: (article) => ipcRenderer.invoke('save-article', article),
  deleteArticle: (articleId) => ipcRenderer.invoke('delete-article', articleId),
  exportArticles: () => ipcRenderer.invoke('export-articles'),
  importArticles: () => ipcRenderer.invoke('import-articles'),
  createWorkspaceBackup: () => ipcRenderer.invoke('create-workspace-backup'),
  getWorkspaceBackupStatus: () => ipcRenderer.invoke('get-workspace-backup-status'),
  openWorkspaceBackups: () => ipcRenderer.invoke('open-workspace-backups'),

  // Generation (each takes optional jobKey for cancellation)
  generateArticleOutline: (params) => ipcRenderer.invoke('generate-article-outline', params),
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
  exportKeywordResearch: (research) => ipcRenderer.invoke('export-keyword-research', research),
  deleteKeywordResearch: (researchId) => ipcRenderer.invoke('delete-keyword-research', researchId),
  generateMetaContent: (params) => ipcRenderer.invoke('generate-meta-content', params),
  generatePrompt: (url, interests, style, jobKey, context) => ipcRenderer.invoke('generate-prompt', url, interests, style, jobKey, context),
  generateTitleDescription: (url, interests, style, jobKey, context) => ipcRenderer.invoke('generate-title-description', url, interests, style, jobKey, context),
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
  getPinCreatorUrl: () => ipcRenderer.invoke('get-pin-creator-url'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  closeSettings: () => ipcRenderer.invoke('close-settings'),
  testConnection: (token) => ipcRenderer.invoke('test-connection', token),
  saveZipFile: (buffer) => ipcRenderer.invoke('save-zip-file', buffer),
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
  importTitlesCsv: () => ipcRenderer.invoke('import-titles-csv'),
  createPinterestPin: (params) => ipcRenderer.invoke('create-pinterest-pin', params),
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

  // Progress events
  onImageProgress: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('image-generation-progress', handler);
    return () => ipcRenderer.removeListener('image-generation-progress', handler);
  },
  onVideoProgress: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('video-generation-progress', handler);
    return () => ipcRenderer.removeListener('video-generation-progress', handler);
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
