import { filterArticleIntake } from "../../electron/article-intake.mjs";

const storageKey = "content-studio-dev-store";
export const isElectronApp = Boolean(window.electronAPI);

const defaultStore = {
  settings: {},
  articles: []
};

function readStore() {
  try {
    return { ...defaultStore, ...JSON.parse(localStorage.getItem(storageKey) || "{}") };
  } catch {
    return defaultStore;
  }
}

function writeStore(next) {
  localStorage.setItem(storageKey, JSON.stringify(next));
}

function makeMockApi() {
  return {
    async savePinterestReceiptDraft({ batchId, ...value }) { const s = readStore(); writeStore({ ...s, receiptDrafts: { ...s.receiptDrafts, [batchId]: value } }); return { success: true }; },
    async importPinterestReceipt() { return { canceled: true }; },
    async qualityWorkspace() { return { success: false, error: 'Quality checks, spending records and file exports require the desktop app.' }; },
    async getGoogleAnalyticsWorkspace() { return { configured: false, snapshot: null, recommendations: [] }; },
    async refreshGoogleAnalytics() { return { success: false, error: 'Connect Google Analytics in the desktop app.' }; },
    async getMetaCaptionDraft({ article = {}, source = {} } = {}) {
      const title = source.pinterestTitle || article.generatedTitle || article.title || 'Recipe idea';
      const cta = 'Want the full ingredient list and all the steps? Send us a message for the complete recipe.';
      const description = String(source.pinterestDescription || article.metaDescription || '').replace(/https?:\/\/\S+/gi, '').trim();
      return { success: true, content: { campaignTitle: title, captionMode: 'recipe-preview', strategy: { originalityAngle: 'Reuse the approved Pinterest recipe as a useful feed post.', recommendedFormat: 'Facebook feed and Instagram feed' }, facebook: { primaryPost: `${title}\n\n${description}\n\n${cta}`, cta, hashtags: ['#HomeCooking'], imageAltText: title }, instagram: { feedCaption: `${title}\n\nA little meal inspiration: ${description}\n\n${cta}`, cta, hashtags: ['#EasyRecipes', '#RecipeIdeas', '#HomeCooking'], imageAltText: title } } };
    },
    async getSettings() {
      return readStore().settings || {};
    },
    async saveSettings(settings) {
      const store = readStore();
      writeStore({ ...store, settings });
      return { success: true };
    },
    async getRecipeMoneyMakerState() { return readStore().recipeMoneyMaker || { settings: { brandColor: "#1f6b4f", accentColor: "#f3b44b", font: "Inter", language: "English", brandName: "Recipe Money Maker", hasApiKey: false }, recipes: [] }; },
    async saveRecipeMoneyMakerSettings(settings) { const store = readStore(); const previous = store.recipeMoneyMaker || { recipes: [] }; const next = { settings: { ...previous.settings, ...settings, hasApiKey: Boolean(settings.apiKey || previous.settings?.hasApiKey) }, recipes: previous.recipes || [] }; writeStore({ ...store, recipeMoneyMaker: next }); return { success: true, settings: next.settings }; },
    async chooseRecipeMoneyMakerLogo() { return { success: false, canceled: true }; },
    async testRecipeMoneyMakerConnection() { return { success: false, error: "Connection testing is available in the desktop app." }; },
    async generateRecipeMoneyMakerRecipe() { return { success: false, error: "Recipe generation is available in the desktop app." }; },
    async deleteRecipeMoneyMakerRecipes({ ids = [] } = {}) { const store = readStore(); const previous = store.recipeMoneyMaker || { settings: {}, recipes: [] }; const chosen = new Set(ids); const recipes = (previous.recipes || []).filter((recipe) => !chosen.has(recipe.id)); writeStore({ ...store, recipeMoneyMaker: { ...previous, recipes } }); return { success: true, recipes }; },
    async exportRecipeMoneyMakerPdf() { return { success: false, canceled: true }; },
    async clearStoredCredential({ credential, siteId, siteUrl } = {}) {
      const store = readStore();
      const settings = { ...(store.settings || {}) };
      const keyMap = {
        replicate: "replicateApiToken",
        ghl: "ghlApiToken",
        impact: "impactAuthToken",
        amazon: "amazonCredentialSecret",
        pinterest: "pinterestAnalyticsAccessToken",
        google: "googleClientSecret"
      };
      if (credential === "imgbb") settings.pinCreator = { ...(settings.pinCreator || {}), imgbbApiKey: "" };
      else if (credential === "wordpress") {
        settings.wordpressSites = (settings.wordpressSites || []).map((site) => (
          (siteId && String(site.id) === String(siteId)) || (siteUrl && site.url === siteUrl)
            ? { ...site, apiKey: "" }
            : site
        ));
      } else if (keyMap[credential]) settings[keyMap[credential]] = "";
      writeStore({ ...store, settings });
      return { success: true, credential };
    },
    async connectGoogleSearchConsole() {
      return { success: false, error: "Google connection is available in the desktop app." };
    },
    async disconnectGoogleSearchConsole() {
      return { success: true };
    },
    async testPinterestAnalytics() {
      return { success: true, summary: { impressions: 8200, pinClicks: 120, outboundClicks: 45, saves: 31 } };
    },
    async getPerformanceIntelligence() {
      return { success: true, snapshot: readStore().performanceIntelligence || null, ghlReceipts: [], recipeAudits: [] };
    },
    async refreshPerformanceIntelligence() {
      const snapshot = {
        generatedAt: new Date().toISOString(),
        days: 28,
        google: {
          connected: false,
          property: "",
          current: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
          pages: [],
          queries: [],
          opportunities: [],
          error: "Connect Search Console in the desktop app."
        },
        pinterest: {
          connected: false,
          source: "preview",
          summary: { impressions: 8200, pinClicks: 120, outboundClicks: 45, saves: 31 },
          topPins: []
        }
      };
      const store = readStore();
      writeStore({ ...store, performanceIntelligence: snapshot });
      return { success: true, snapshot, ghlReceipts: [], recipeAudits: [] };
    },
    async getPerformanceSchedule({ count = 0 } = {}) {
      const start = Date.now() + 60 * 60 * 1000;
      return {
        success: true,
        profile: { mode: "recommended-window", preferredHours: [9, 13, 18, 21], sampleCount: 0 },
        slots: Array.from({ length: count }, (_, index) => new Date(start + index * 2 * 60 * 60 * 1000).toISOString())
      };
    },
    async getJobCenter() {
      return { success: true, jobs: readStore().jobCenterJobs || [] };
    },
    async clearFinishedJobs() {
      const store = readStore();
      const jobs = (store.jobCenterJobs || []).filter((job) => !["completed", "failed", "cancelled"].includes(job.status));
      writeStore({ ...store, jobCenterJobs: jobs });
      return { success: true, jobs };
    },
    async openJobWorkspace() {
      return { success: true };
    },
    async getMediaStorageStats() {
      return { success: true, fileCount: 0, unusedCount: 0, totalBytes: 0, unusedBytes: 0, olderThanDays: 30 };
    },
    async cleanupUnusedMedia() {
      return { success: true, deletedCount: 0, deletedBytes: 0, errors: [] };
    },
    async getAppUpdateStatus() {
      return { success: true, state: { status: "disabled", configured: false, message: "Update feed is available in packaged builds." } };
    },
    async checkForAppUpdate() {
      return { success: false, error: "Update checks are available in packaged builds." };
    },
    async downloadAppUpdate() {
      return { success: false, error: "No update is available." };
    },
    async installAppUpdate() {
      return { success: false, error: "No update is ready." };
    },
    async refreshGhlPublishingStatus() {
      return { success: true, receipts: [] };
    },
    async auditRecipeSeo({ articleId, url }) {
      return {
        success: true,
        audit: {
          articleId,
          url,
          auditedAt: new Date().toISOString(),
          status: 200,
          score: 86,
          grade: "Good",
          recipeFound: true,
          missingAltImages: 0,
          internalLinks: 3,
          checks: []
        }
      };
    },
    async testImpactConnection() {
      return { success: false, error: "Impact connection testing is available in the desktop app." };
    },
    async searchImpactProducts({ keyword }) {
      return {
        success: true,
        products: [{
          id: "preview-impact-product",
          catalogItemId: "preview-impact-product",
          campaignId: "preview-program",
          campaignName: "Preview Merchant",
          name: `${keyword || "Recipe"} kitchen product`,
          description: "Desktop search loads live products from your approved Impact programs.",
          url: "https://example.com/product",
          imageUrl: "",
          currentPrice: "24.99",
          currency: "USD",
          stockAvailability: "In Stock",
          category: "Kitchen",
          manufacturer: "Preview Brand",
          labels: ["kitchen tool"]
        }]
      };
    },
    async createImpactAffiliateLink({ product }) {
      return {
        success: true,
        affiliate: {
          id: `impact-${product.id || Date.now()}`,
          name: product.name,
          url: product.url,
          keywords: [product.name, product.category, product.manufacturer].filter(Boolean),
          anchorText: product.name,
          enabled: true,
          source: "impact"
        }
      };
    },
    async discoverImpactAffiliates() {
      return {
        success: true,
        affiliates: [],
        affiliateLinks: readStore().settings?.affiliateLinks || [],
        queries: [],
        reviewedProducts: 0,
        qualifiedProducts: 0
      };
    },
    async testAmazonConnection({ partnerTag }) {
      return partnerTag
        ? { success: true, mode: "tracking-id", message: "Amazon tracking ID is ready in desktop mode." }
        : { success: false, error: "Add an Amazon Associates tracking ID." };
    },
    async searchAmazonProducts({ keyword }) {
      return {
        success: true,
        products: [{
          id: "B000PREVIEW",
          asin: "B000PREVIEW",
          name: `${keyword || "Recipe"} product on Amazon`,
          url: "https://www.amazon.com/dp/B000PREVIEW?tag=preview-20",
          imageUrl: "",
          manufacturer: "Amazon"
        }]
      };
    },
    async createAmazonAffiliateLink({ product }) {
      return {
        success: true,
        affiliate: {
          id: `amazon-${product.asin || product.id || Date.now()}`,
          name: product.name,
          url: product.url,
          keywords: [product.name, product.manufacturer].filter(Boolean),
          anchorText: product.name,
          enabled: true,
          source: "amazon",
          trackingVerified: true
        }
      };
    },
    async discoverAffiliates() {
      return {
        success: true,
        affiliates: [],
        affiliateLinks: readStore().settings?.affiliateLinks || [],
        providers: [],
        queries: [],
        reviewedProducts: 0,
        qualifiedProducts: 0
      };
    },
    async getArticles() {
      return readStore().articles || [];
    },
    async queueArticles({ articles }) {
      const store = readStore();
      const selection = filterArticleIntake(articles, store.articles || []);
      writeStore({ ...store, articles: [...(store.articles || []), ...selection.accepted] });
      return { success: true, addedCount: selection.accepted.length, skipped: selection.skipped };
    },
    async markRecipeReviewed() {
      return { success: false, error: "Recipe review requires the desktop app." };
    },
    async prepareArticleRecipe({ article }) {
      return { success: false, patch: { content: article.content, recipeCardQualityWarning: "Recipe validation requires the desktop app." } };
    },
    async saveArticle(article) {
      const store = readStore();
      const now = new Date().toISOString();
      const saved = {
        ...article,
        id: article.id || crypto.randomUUID?.() || String(Date.now()),
        createdAt: article.createdAt || now,
        updatedAt: now
      };
      const articles = store.articles || [];
      const index = articles.findIndex((item) => item.id === saved.id);
      if (index >= 0) articles[index] = saved;
      else articles.push(saved);
      writeStore({ ...store, articles });
      return saved;
    },
    async deleteArticle(articleId) {
      const store = readStore();
      writeStore({ ...store, articles: (store.articles || []).filter((item) => item.id !== articleId) });
      return { success: true };
    },
    async createWorkspaceBackup() {
      return { success: true, filePath: "browser-preview-workspace-backup.json", createdAt: new Date().toISOString(), size: 0 };
    },
    async getWorkspaceBackupStatus() {
      return { success: true, count: 1, filePath: "browser-preview-workspace-backup.json", createdAt: new Date().toISOString(), size: 0 };
    },
    async restoreLatestWorkspaceBackup() {
      return { success: false, error: "Workspace restore is available in the desktop app." };
    },
    async getDiagnostics() {
      return {
        success: true,
        appVersion: __APP_VERSION__,
        electronVersion: "browser preview",
        operatingSystem: navigator.platform || "browser",
        userDataPath: "Browser local storage",
        logsPath: "Desktop app only",
        settingsStorage: { ok: true, path: "Browser local storage" },
        latestBackup: { available: false },
        connections: {},
        settingsSchemaVersion: 1,
        featureFlags: {},
        safeStorageAvailable: false
      };
    },
    async getGrowthWorkspace() {
      return readStore().growthWorkspace || {
        calendarEntries: [],
        campaigns: [],
        updateQueue: [],
        revenueRecords: [],
        runHistory: []
      };
    },
    async upsertGrowthRecord({ collection, record }) {
      const store = readStore();
      const workspace = store.growthWorkspace || {};
      const records = [...(workspace[collection] || [])];
      const nextRecord = {
        ...record,
        id: record.id || `${collection}-${Date.now()}`,
        updatedAt: new Date().toISOString()
      };
      const index = records.findIndex((item) => item.id === nextRecord.id);
      if (index >= 0) records[index] = { ...records[index], ...nextRecord };
      else records.push(nextRecord);
      writeStore({ ...store, growthWorkspace: { ...workspace, [collection]: records } });
      return { success: true, records };
    },
    async deleteGrowthRecord({ collection, id }) {
      const store = readStore();
      const workspace = store.growthWorkspace || {};
      const records = (workspace[collection] || []).filter((item) => item.id !== id);
      writeStore({ ...store, growthWorkspace: { ...workspace, [collection]: records } });
      return { success: true, records };
    },
    async importRevenueCsv() {
      return {
        success: true,
        fileName: "revenue-preview.csv",
        rows: [{
          id: "revenue-preview-1",
          articleId: "",
          campaignId: "",
          source: "Impact CSV",
          trafficSource: "pinterest",
          metric: "commission",
          amount: 42.5,
          currency: "USD",
          clicks: 18,
          occurredAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        }]
      };
    },
    async clearTemporaryMediaCache() {
      return { success: true };
    },
    async openLogsFolder() {
      return { success: false, error: "Logs are available in the desktop app." };
    },
    async reportRendererError(report) {
      console.error(report);
      return { success: true };
    },
    async copyText(value) {
      await navigator.clipboard.writeText(String(value || ""));
      return { success: true };
    },
    async openWorkspaceBackups() {
      return { success: true };
    },
    async estimateCost({ articleCount, settings, extraTextCalls = 0, outlineCalls = 0 }) {
      const images = settings.enableIntextImages ? Number(settings.intextImageCount ?? 1) : 0;
      const perArticle = 0.006 + images * 0.005;
      const estimatedTextCost = Number((((3 + images) * articleCount + extraTextCalls + outlineCalls) * 0.001).toFixed(4));
      const estimatedImageCost = Number(((1 + images) * articleCount * 0.003).toFixed(4));
      const estimatedCost = Number((estimatedTextCost + estimatedImageCost).toFixed(4));
      return {
        perArticle,
        total: estimatedCost,
        estimatedCost,
        estimatedTextCost,
        estimatedImageCost,
        actualKnownCost: null,
        costCurrency: "USD",
        currency: "USD",
        costCalculationVersion: 2,
        approximate: true,
        models: { text: settings.aiModel || "gpt5nano", image: settings.imageModel || "z-image-turbo" },
        expectedImages: (1 + images) * articleCount,
        breakdown: { textCalls: (3 + images) * articleCount + extraTextCalls + outlineCalls, imageCalls: (1 + images) * articleCount }
      };
    },
    async generateArticle({ title }) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return {
        content: `<h1>${title}</h1><p>This is local preview content. Add a Replicate token in the Electron app to generate real articles.</p><h2>Why It Matters</h2><p>The production flow uses Replicate for text, title, featured image, and in-text image generation.</p><h2>Useful Details</h2><p>Queue, editing, WordPress publishing, backups, and Pinterest pins are all wired through Electron IPC.</p>`
      };
    },
    async generateArticleOutline() {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return [
        "## Reader promise",
        "- Answer the main question early and explain who the recipe helps.",
        "",
        "## Ingredients and substitutions",
        "- Explain ingredient roles, quantities, and realistic swaps.",
        "",
        "## Step-by-step method",
        "- Include timing, temperature, texture, and doneness cues.",
        "",
        "## Troubleshooting and serving",
        "- Cover common mistakes, storage, reheating, and serving ideas.",
        "",
        "## Recipe card",
        "- Keep times, yield, ingredients, and instructions consistent."
      ].join("\n");
    },
    async regenerateArticleSection({ currentHtml, settings }) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        html: String(currentHtml || "").replace(/<\/p>\s*$/i, " Add one specific reader-focused improvement.</p>"),
        predictionId: "browser-preview",
        model: settings?.aiModel || "gpt5nano"
      };
    },
    async generateArticleTitle({ title }) {
      return `${title} Worth Reading Today`;
    },
    async generateFeaturedImagePrompt({ title }) {
      return `Editorial photo for ${title}`;
    },
    async generateImage(firstArg) {
      const prompt = typeof firstArg === "string" ? firstArg : firstArg?.prompt;
      const requestedAspectRatio = typeof firstArg === "object" ? firstArg?.aspectRatio || "1:1" : "1:1";
      return {
        success: true,
        imageUrl: "",
        localPath: "",
        prompt,
        requestedAspectRatio,
        aspectRatio: requestedAspectRatio,
        ratioAdjusted: false,
        ratioNotice: ""
      };
    },
    async generateVideo({ prompt, model = "pruna-p-video" }) {
      const video = {
        id: `${Date.now()}`,
        prompt,
        displayUrl: "",
        remoteVideoUrl: "",
        localPath: "",
        duration: 5,
        aspectRatio: "9:16",
        resolution: "720p",
        fps: 24,
        draft: true,
        model,
        modelLabel: model === "pruna-p-video" ? "Pruna P-Video" : model,
        priceLabel: model === "pruna-p-video" ? "720p $0.02/sec, 1080p $0.04/sec, draft 4x cheaper" : "price varies by model",
        createdAt: new Date().toISOString()
      };
      const store = readStore();
      const videos = [video, ...(store.generatedVideos || [])];
      writeStore({ ...store, generatedVideos: videos });
      return { success: true, video, videos };
    },
    async generatePrompt(url) {
      return { success: true, prompt: `Pinterest pin image for ${url}` };
    },
    async generateTitleDescription(url) {
      return { success: true, title: "Fresh Recipe Idea", description: `Save this recipe idea from ${url}.`, overlayText: "Fresh Recipe Idea" };
    },
    async createPinterestPinAsset({ pinId, mode = "generate-new", overlayText = "" }) {
      return {
        success: true,
        imageUrl: "",
        localImageUrl: "",
        localPath: "",
        hostedImageUrl: "",
        imgurUrl: "",
        durable: false,
        imageSourceMode: mode,
        imageQa: { dimensionsVerified: true, overlayVerified: true, safeZoneVerified: true, nonBlankVerified: true },
        generationConfig: { mode, overlayText, generatedAt: new Date().toISOString() },
        pinId
      };
    },
    async preparePinterestExport({ pins = [] }) {
      return { success: true, pins, errors: [], warnings: [] };
    },
    async validatePinterestExport() {
      return { success: true, errors: [], warnings: [] };
    },
    async exportPinterestCsv({ rows = [] }) {
      return { success: false, canceled: false, validation: { valid: false, rowCount: rows.length, errors: [{ field: "Export", message: "Open Content Studio desktop to export the verified Pinterest CSV." }], warnings: [], rows } };
    },
    async getPinterestDelivery() { return { account: '', batches: [], drafts: readStore().receiptDrafts || {} }; },
    async revealPinterestExport() { throw new Error('Open Content Studio desktop to locate exported files.'); },
    async suggestPinterestResults() { throw new Error('Open Content Studio desktop to record import results.'); },
    async savePinterestResults() { throw new Error('Open Content Studio desktop to record import results.'); },
    async getPinterestRetry() { throw new Error('Open Content Studio desktop to retry failed Pins.'); },
    async generateRepurposePack({ article, platforms = [], campaignStyle = "traffic" }) {
      const title = article.generatedTitle || article.title || "Fresh Recipe Idea";
      return {
        success: true,
        pack: {
          id: `${article.id || Date.now()}-${Date.now()}`,
          articleId: article.id,
          articleTitle: title,
          sourceUrl: article.wordpressPostUrl || article.sourceUrl || "",
          campaignStyle,
          platforms,
          createdAt: new Date().toISOString(),
          content: {
            summary: `Social pack for ${title}.`,
            instagram: platforms.includes("instagram") ? {
              caption: `${title}\n\nSave this recipe idea for later.`,
              hashtags: ["#EasyRecipes", "#RecipeIdeas"],
              carouselSlides: [{ heading: title, body: "A useful recipe idea to save." }],
              reelScript: { hook: title, scenes: ["Finished dish"], voiceover: `Try ${title}.`, caption: title, cta: "Read the full recipe." }
            } : null,
            facebook: platforms.includes("facebook") ? {
              pagePost: `${title}\n\nWould you make this one?`,
              shortPost: title,
              groupPost: `Has anyone tried something like ${title}?`,
              hashtags: ["#RecipeIdeas"]
            } : null,
            threads: platforms.includes("threads") ? { posts: [`${title}. Saving this one.`] } : null,
            reddit: platforms.includes("reddit") ? {
              postTitle: `${title} - what would you serve with this?`,
              body: `I made a useful recipe post for ${title}.\n\nWhat would you change or serve with it?`,
              subredditIdeas: ["r/recipes", "r/EasyRecipes"],
              commentSeed: "Ask for side dish ideas or substitutions."
            } : null,
            pinterest: platforms.includes("pinterest") ? { title, description: `Save ${title} for later.`, overlayText: title.split(" ").slice(0, 5).join(" "), keywords: ["recipe ideas"] } : null,
            email: platforms.includes("email") ? { subject: title, previewText: "A recipe idea worth saving.", body: `${title}\n\nRead the full recipe.` } : null
          }
        }
      };
    },
    async researchMetaTrends({ article, geo = "US", goal = "traffic" }) {
      const title = article?.generatedTitle || article?.title || "Recipe topic";
      return {
        success: true,
        research: {
          topic: title,
          summary: "Browser preview research uses example signals. Electron loads live Google Trends data.",
          geo,
          goal,
          researchedAt: new Date().toISOString(),
          sourceLabel: "Google Trends Trending Now",
          relevantTrends: [],
          seasonalAngles: ["seasonal meal planning", "easy recipe ideas"],
          audienceQuestions: ["What would you serve with this?"],
          facebookAngles: ["Lead with one practical takeaway and a real question."],
          instagramAngles: ["Lead with the finished dish and a save-worthy tip."],
          recommendedKeywords: ["easy recipe", "meal ideas"],
          liveTrends: []
        }
      };
    },
    async getTrendWorkspace() {
      return readStore().trendWorkspace || { analytics: null, history: [] };
    },
    async importPinterestAnalytics() {
      return { success: false, error: "Pinterest CSV import is available in the desktop app." };
    },
    async clearPinterestAnalytics() {
      const store = readStore();
      writeStore({ ...store, trendWorkspace: { ...(store.trendWorkspace || {}), analytics: null } });
      return { success: true };
    },
    async researchKeywords({ seed = "recipe ideas", geo = "US", goal = "traffic" }) {
      const research = {
        id: `research-${Date.now()}`,
        seed,
        geo,
        goal,
        summary: "Browser preview results use sample keyword evidence. The desktop app combines imported Pinterest clicks with live Google Trends.",
        researchedAt: new Date().toISOString(),
        sourceLabel: "Pinterest Analytics and Google Trends Trending Now",
        seasonalOpportunities: ["seasonal meal planning", "quick weeknight cooking"],
        contentPlan: ["Publish the highest-intent article first", "Create one matching Pinterest Pin"],
        liveTrends: [],
        keywords: [
          {
            keyword: seed.toLowerCase(), intent: "informational", opportunityScore: 82, trendSignal: "Pinterest proven",
            competition: "medium", rationale: "Sample browser evidence.", suggestedTitle: `${seed}: Practical Recipe Ideas To Try`,
            contentType: "article", board: "Easy Recipe Finds", seasonalTiming: "evergreen",
            pinterestEvidence: { pinClicks: 120, outboundClicks: 45, saves: 31, impressions: 8200 }, cannibalization: null
          }
        ]
      };
      const store = readStore();
      const history = [research, ...(store.trendWorkspace?.history || [])].slice(0, 25);
      writeStore({ ...store, trendWorkspace: { ...(store.trendWorkspace || {}), history } });
      return { success: true, research, history };
    },
    async getPinterestClusterWorkspace() {
      return { success: true, history: readStore().pinterestClusterHistory || [] };
    },
    async buildPinterestClusters({ url = "https://example.com/easy-recipe/", maxClusters = 6 } = {}) {
      let sourceTitle = "Easy Recipe Ideas";
      try {
        sourceTitle = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "easy recipe")
          .replace(/[-_]+/g, " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase());
      } catch {}
      const labels = [
        sourceTitle,
        `Quick ${sourceTitle}`,
        `${sourceTitle} Meal Prep`,
        `Healthy ${sourceTitle}`,
        `Budget ${sourceTitle}`,
        `Seasonal ${sourceTitle}`
      ].slice(0, Math.max(3, Math.min(10, Number(maxClusters) || 6)));
      const plan = {
        id: `pinterest-cluster-${Date.now()}`,
        createdAt: new Date().toISOString(),
        topic: sourceTitle,
        primaryUseCase: labels[0],
        summary: "Build depth around the source use case, then test distinct adjacent interests.",
        strategyNotes: ["Keep every Pin aligned with its board and destination.", "Rotate clusters instead of publishing duplicates together."],
        sourceLabel: "Browser preview cluster planner",
        source: { requestedUrl: url, canonicalUrl: url, destinationUrl: url, title: sourceTitle, description: "Preview source description", imageUrl: "", sourceType: "destination-page" },
        clusters: labels.map((label, index) => ({
          id: `preview-cluster-${index + 1}`,
          label,
          role: index < 2 ? "core-depth" : "adjacent-discovery",
          lifecycle: index === 1 ? "growing" : "established",
          audienceIntent: "Find a practical recipe worth saving and cooking.",
          rationale: "This angle serves a distinct planning use case.",
          keywords: [label.toLowerCase(), sourceTitle.toLowerCase(), "recipe ideas"],
          board: "Easy Recipe Finds",
          boardConfidence: 72,
          pinIdeas: [{ title: `${label}: A Recipe Worth Saving`, overlayText: label, hook: "Lead with a useful outcome.", visualDirection: "Use one bright vertical close-up." }]
        }))
      };
      const store = readStore();
      const history = [plan, ...(store.pinterestClusterHistory || [])].slice(0, 20);
      writeStore({ ...store, pinterestClusterHistory: history });
      return { success: true, plan, history };
    },
    async exportKeywordResearch() {
      return { success: true, filePath: "browser-preview-keyword-research.csv", rowCount: 1 };
    },
    async deleteKeywordResearch(researchId) {
      const store = readStore();
      const history = (store.trendWorkspace?.history || []).filter((item) => item.id !== researchId);
      writeStore({ ...store, trendWorkspace: { ...(store.trendWorkspace || {}), history } });
      return { success: true, history };
    },
    async generateMetaContent({ article }) {
      const title = article?.generatedTitle || article?.title || "Recipe idea";
      return {
        success: true,
        content: {
          campaignTitle: title,
          facebook: {
            primaryPost: `${title}\n\nA practical recipe worth keeping for the week ahead. What would you serve with it?`,
            shortPost: `${title} is worth adding to this week's meal plan.`,
            groupPost: `I am collecting practical meal ideas. What would you change or serve with ${title}?`,
            reelCaption: `A closer look at ${title}.`,
            cta: "Read the complete recipe.",
            hashtags: ["#EasyRecipes", "#RecipeIdeas"],
            imageAltText: `Finished serving of ${title}`
          },
          instagram: {
            feedCaption: `${title} is the kind of recipe worth saving.\n\nKeep it for your next meal plan and open the complete recipe when you are ready to cook.`,
            reelCaption: `Save ${title} for later.`,
            reelHook: `A close-up look at ${title}`,
            reelScenes: ["Show the finished dish", "Show the texture", "End with a save CTA"],
            reelVoiceover: `Save ${title} for your next meal plan.`,
            carouselSlides: [{ heading: title, body: "A practical recipe idea worth saving." }],
            cta: "Save this and visit the profile link for the recipe.",
            hashtags: ["#EasyRecipes", "#FoodIdeas"],
            imageAltText: `Finished serving of ${title}`
          }
        }
      };
    },
    async generateImagePrompts({ count, title }) {
      return Array.from({ length: count }, (_, index) => `${title} detail ${index + 1}`);
    },
    async cancelJobsByPrefix() {
      return { success: true, cancelled: 0, jobKeys: [] };
    },
    async cancelJob() {
      return { success: true };
    },
    async importTitlesCsv() {
      return {
        success: true,
        fileName: "article-import-preview.csv",
        errors: [],
        titles: ["Easy Lemon Chicken Recipe", "Healthy Meal Prep Bowls"],
        rows: [
          {
            id: "import-1",
            selected: true,
            title: "Easy Lemon Chicken Recipe",
            primaryKeyword: "easy lemon chicken",
            secondaryKeywords: "one pan chicken, weeknight dinner",
            searchIntent: "informational",
            contentType: "article",
            preset: "preset-weeknight-recipe-seo",
            articleLength: "1400-1800",
            brandVoice: "voice-recipe-friendly",
            site: "",
            category: "",
            publicationPreference: "draft",
            schedule: ""
          },
          {
            id: "import-2",
            selected: true,
            title: "Healthy Meal Prep Bowls",
            primaryKeyword: "healthy meal prep bowls",
            secondaryKeywords: "lunch prep, high protein meals",
            searchIntent: "commercial",
            contentType: "listicle",
            preset: "",
            articleLength: "900-1200",
            brandVoice: "",
            site: "",
            category: "",
            publicationPreference: "publish",
            schedule: ""
          }
        ]
      };
    },
    async downloadSampleArticleCsv() {
      return { success: true, filePath: "content-studio-article-import-sample.csv" };
    },
    async selectWatermarkImage() {
      return null;
    },
    async selectArticleImage() {
      return { success: false, canceled: true };
    },
    async testWordPressConnection() {
      return { success: true, user: "Preview User", roles: ["editor"] };
    },
    async syncWordPressCategories() {
      return {
        success: true,
        categories: [
          { id: 1, name: "Recipes", slug: "recipes", description: "Recipe posts" },
          { id: 2, name: "Home", slug: "home", description: "Home and decor posts" }
        ]
      };
    },
    async syncWordPressPosts() {
      return {
        success: true,
        posts: [
          { id: 101, title: "Easy Weeknight Dinners", url: "https://example.com/easy-weeknight-dinners/", slug: "easy-weeknight-dinners", excerpt: "Simple dinner recipes.", categories: ["Recipes"] },
          { id: 102, title: "Healthy Meal Prep Ideas", url: "https://example.com/healthy-meal-prep-ideas/", slug: "healthy-meal-prep-ideas", excerpt: "Make ahead meals.", categories: ["Recipes"] }
        ]
      };
    },
    async pushToWordPress() {
      return { success: true, postUrl: "#" };
    },
    async createPinterestPin() {
      return { success: false };
    },
    async savePinCreatorPins() {
      return { success: true, count: 0 };
    },
    async getPinCreatorPins() {
      return { success: true, pins: [] };
    },
    async createRepurposeImageVariants({ packs, sourceAsset }) {
      const sourceUrl = sourceAsset?.publicUrl || sourceAsset?.remoteUrl || sourceAsset?.url || sourceAsset?.localUrl || "";
      return {
        success: true,
        packs: (packs || []).map((pack) => ({
          ...pack,
          imageAssets: sourceUrl ? [{
            id: "meta-social-portrait",
            platform: "Social",
            label: "Meta Portrait 4:5",
            width: 1080,
            height: 1350,
            publicUrl: sourceUrl,
            imageUrl: sourceUrl
          }] : pack.imageAssets || []
        })),
        missing: sourceUrl ? [] : (packs || []).map((pack) => pack.articleTitle || pack.articleId)
      };
    },
    async exportRepurposePacks() {
      return { success: true, filePath: "browser-preview-ghl-social-upload.csv", rowCount: 0, uploadedImageCount: 0, missingImageCount: 0 };
    },
    async prepareRepurposeGhlRows({ packs = [] } = {}) {
      const pack = packs[0] || {};
      const imageUrl = pack.imageAssets?.[0]?.publicUrl || pack.imageAssets?.[0]?.imageUrl || "";
      const noLink = pack.includeSourceLink === false || /^meta-/.test(pack.campaignStyle || '');
      const destinationUrl = noLink ? '' : pack.sourceUrl || "https://example.com";
      const instagram = pack.content?.instagram;
      const facebook = pack.content?.facebook;
      const rows = [
        instagram?.caption ? ["2026-05-28 14:00:00", [noLink ? instagram.caption.replace(/https?:\/\/\S+/gi, '') : instagram.caption, ...(instagram.hashtags || [])].join("\n\n"), destinationUrl, imageUrl, "Instagram", "", "post"] : null,
        facebook?.pagePost ? ["2026-05-28 16:00:00", noLink ? facebook.pagePost.replace(/https?:\/\/\S+/gi, '') : facebook.pagePost, destinationUrl, imageUrl, "Facebook", noLink ? '' : `Full recipe: ${destinationUrl}`, "post"] : null
      ].filter(Boolean);
      return {
        success: true,
        headers: ["postAtSpecificTime (YYYY-MM-DD HH:mm:ss)", "content", "link (OGmetaUrl)", "imageUrls", "Category", "followUpComment", "type (post/story/reel)"],
        rows,
        missingImageCount: rows.filter((row) => !row[3]).length
      };
    },
    async exportRepurposeGhlRows() {
      return { success: true, filePath: "browser-preview-edited-ghl-social-upload.csv", rowCount: 1, missingImageCount: 0 };
    },
    async uploadRepurposeGhlRows() {
      return { success: true, rowCount: 1, missingImageCount: 0 };
    },
    async saveRepurposePacks({ packs }) {
      const store = readStore();
      writeStore({ ...store, repurposePacks: packs || [] });
      return { success: true, packs: packs || [] };
    },
    async getRepurposePacks() {
      return { success: true, packs: readStore().repurposePacks || [] };
    },
    async getMetaProjects() {
      return { success: true, projects: readStore().metaStudioProjects || [] };
    },
    async saveMetaProject(project) {
      const store = readStore();
      const saved = { ...project, id: project.id || `meta-${Date.now()}`, updatedAt: new Date().toISOString() };
      const projects = [saved, ...(store.metaStudioProjects || []).filter((item) => item.id !== saved.id)];
      writeStore({ ...store, metaStudioProjects: projects });
      return { success: true, project: saved, projects };
    },
    async deleteMetaProject(projectId) {
      const store = readStore();
      const projects = (store.metaStudioProjects || []).filter((item) => item.id !== projectId);
      writeStore({ ...store, metaStudioProjects: projects });
      return { success: true, projects };
    },
    async getMetaBulkGhlDraft() {
      return { success: true, draft: readStore().metaBulkGhlDraft || null };
    },
    async prepareMetaBulkGhlRows({ articleIds = [] } = {}) {
      const store = readStore();
      const articles = (store.articles || []).filter((article) => !articleIds.length || articleIds.includes(article.id));
      const projects = store.metaStudioProjects || [];
      const headers = ["postAtSpecificTime (YYYY-MM-DD HH:mm:ss)", "content", "link (OGmetaUrl)", "imageUrls", "gifUrl", "videoUrls", "thumbnailUrl", "mediaOptimization (true/false)", "applyWatermark (true/false)", "tags (comma-separated)", "Category", "followUpComment", "type (post/story/reel)"];
      const rows = articles.flatMap((article, index) => {
        const project = projects.find((item) => String(item.articleId) === String(article.id)) || {};
        const imageUrl = project.imageAssets?.[0]?.publicUrl || article.featuredImageRemoteUrl || article.featuredImage || "";
        const start = new Date(Date.now() + (index * 2 + 1) * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
        const instagram = project.content?.instagram?.feedCaption || article.metaDescription || article.generatedTitle || article.title || "";
        const facebook = project.content?.facebook?.primaryPost || article.metaDescription || article.generatedTitle || article.title || "";
        return [
          [start, instagram.replace(/https?:\/\/\S+/gi, ''), "", imageUrl, "", "", "", "True", "False", "Instagram", "Instagram", "", "post"],
          [start, facebook.replace(/https?:\/\/\S+/gi, ''), "", imageUrl, "", "", "", "True", "False", "Facebook", "Facebook", "", "post"]
        ];
      });
      const draft = { success: true, status: "complete", headers, rows, articleCount: articles.length, postCount: rows.length, failures: [], percent: 100 };
      writeStore({ ...store, metaBulkGhlDraft: draft });
      return draft;
    },
    async getGeneratedVideos() {
      return { success: true, videos: readStore().generatedVideos || [] };
    },
    async deleteGeneratedVideo(videoId) {
      const store = readStore();
      const videos = (store.generatedVideos || []).filter((video) => video.id !== videoId);
      writeStore({ ...store, generatedVideos: videos });
      return { success: true, videos };
    },
    async openPinCreator() {
      return { success: true };
    },
    async openRepurposeStudio() {
      return { success: true };
    },
    async getPinCreatorUrl() {
      return "";
    },
    async appendPinQueue() {
      return { success: true, count: 0 };
    },
    async getPinQueue() {
      return { success: true, urls: [] };
    },
    async ackPinQueue() {
      return { success: true, removedCount: 0, count: 0 };
    },
    onPinQueueUpdated() {
      return () => {};
    },
    async exportArticles() {
      return { success: true, count: readStore().articles.length };
    },
    async importArticles() {
      return { success: false };
    },
    async openPath() {
      return { success: true };
    },
    async openExternalUrl(url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return { success: true };
    },
    async openLogFile() {
      return { success: true };
    },
    onImageProgress() {
      return () => {};
    },
    onPinProgress() {
      return () => {};
    },
    onVideoProgress() {
      return () => {};
    },
    onMetaBulkProgress() {
      return () => {};
    },
    onJobCenterUpdated() {
      return () => {};
    },
    onAppUpdateStatus() {
      return () => {};
    },
    onNavigateSettings() {
      return () => {};
    },
    onNavigateScreen() {
      return () => {};
    }
  };
}

export const electronAPI = window.electronAPI || makeMockApi();
