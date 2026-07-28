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
    async getSettings() {
      return readStore().settings || {};
    },
    async saveSettings(settings) {
      const store = readStore();
      writeStore({ ...store, settings });
      return { success: true };
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
    async clearTemporaryMediaCache() {
      return { success: true };
    },
    async openLogsFolder() {
      return { success: false, error: "Logs are available in the desktop app." };
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
      return { success: true, title: "Fresh Recipe Idea", description: `Save this recipe idea from ${url}.` };
    },
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
      return { success: false };
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
    async createRepurposeImageVariants({ packs }) {
      return { success: true, packs, missing: [] };
    },
    async exportRepurposePacks() {
      return { success: true, filePath: "browser-preview-ghl-social-upload.csv", rowCount: 0, uploadedImageCount: 0, missingImageCount: 0 };
    },
    async prepareRepurposeGhlRows() {
      return {
        success: true,
        headers: ["postAtSpecificTime (YYYY-MM-DD HH:mm:ss)", "content", "link (OGmetaUrl)", "imageUrls", "Category", "followUpComment", "type (post/story/reel)"],
        rows: [["2026-05-28 14:00:00", "Preview caption", "https://example.com", "", "Instagram", "", "post"]]
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
    onVideoProgress() {
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
