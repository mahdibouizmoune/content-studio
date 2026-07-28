import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import ErrorBoundary from "@/components/ErrorBoundary";
import ArticlesWorkflow from "@/components/ArticlesWorkflow";
import { electronAPI, isElectronApp } from "@/lib/electron";
import { DEFAULT_PIN_CUSTOM_STYLES, DEFAULT_PIN_TITLE_DESC_PROMPT, normalizePinCreatorDefaults } from "@/lib/pinCreatorDefaults";
import { recoverInterruptedArticles } from "@/lib/articleWorkflow.mjs";
import {
  DEFAULT_ARTICLE_PROMPT,
  DEFAULT_FEATURED_IMAGE_INSTRUCTION,
  DEFAULT_IMAGE_PROMPT,
  DEFAULT_LISTICLE_IMAGE_PROMPT,
  LISTICLE_DEFAULT_PROMPT,
  LISTICLE_FASHION_PROMPT,
  LISTICLE_FOOD_PROMPT,
  LISTICLE_HOMEDECOR_PROMPT
} from "@/prompts";

const Settings = lazy(() => import("@/components/Settings"));
const PinCreatorView = lazy(() => import("@/components/PinCreatorView"));
const RepurposeStudio = lazy(() => import("@/components/RepurposeStudio"));
const MetaStudio = lazy(() => import("@/components/MetaStudio"));
const VideoStudio = lazy(() => import("@/components/VideoStudio"));
const TrendsResearch = lazy(() => import("@/components/TrendsResearch"));
const ClusterPlanner = lazy(() => import("@/components/ClusterPlanner"));
const ImageLibrary = lazy(() => import("@/components/ImageLibrary"));
const PerformanceIntelligence = lazy(() => import("@/components/PerformanceIntelligence"));
const Connections = lazy(() => import("@/components/Connections"));
const OnboardingChecklist = lazy(() => import("@/components/OnboardingChecklist"));
const GrowthWorkspace = lazy(() => import("@/components/GrowthWorkspace"));

const promptDefaults = {
  articlePrompt: DEFAULT_ARTICLE_PROMPT,
  listicleDefaultPrompt: LISTICLE_DEFAULT_PROMPT,
  listicleFoodPrompt: LISTICLE_FOOD_PROMPT,
  listicleHomeDecorPrompt: LISTICLE_HOMEDECOR_PROMPT,
  listicleFashionPrompt: LISTICLE_FASHION_PROMPT,
  imagePrompt: DEFAULT_IMAGE_PROMPT,
  listicleImagePrompt: DEFAULT_LISTICLE_IMAGE_PROMPT,
  featuredImageInstruction: DEFAULT_FEATURED_IMAGE_INSTRUCTION
};

const defaultBrandVoices = [
  {
    id: "voice-recipe-friendly",
    name: "Friendly Recipe Blogger",
    builtIn: true,
    content: "Warm, practical, and personal. Write like a careful recipe editor who respects the reader's time. Explain why the method works, what to watch for, useful substitutions, storage, reheating, and serving ideas. Use short paragraphs, clear cooking cues, sensory details, and confidence-building tips. Never claim personal testing or experience unless it was supplied. Avoid filler, fake stories, keyword stuffing, and over-the-top hype."
  },
  {
    id: "voice-pinterest-click",
    name: "Pinterest Traffic Voice",
    builtIn: true,
    content: "Visual, benefit-driven, and search-friendly. Lead with a source-supported result, flavor payoff, cooking method, season, occasion, or problem solved. Use natural search language early without repeating exact keywords. Write with vivid but accurate food imagery and scannable sections. Make the article useful enough to save without putting Pinterest copy, private analytics, or clickbait inside the article body."
  },
  {
    id: "voice-recipe-authority",
    name: "Recipe SEO Authority",
    builtIn: true,
    content: "Expert, trustworthy, and approachable. Use exact timing cues, observable doneness signs, ingredient roles, safe substitutions, troubleshooting, storage, reheating, make-ahead guidance, and serving pairings. Keep recipe facts internally consistent and state uncertainty honestly. Never invent testing, credentials, ratings, nutrition, or health outcomes. Prioritize reader success, complete recipe information, rich-result readiness, and honest limitations."
  }
];

const defaultProjectPresets = [
  {
    id: "preset-default-old-way",
    name: "Default",
    articleLength: "900-1200",
    brandVoiceId: "",
    searchIntent: "informational",
    audience: "",
    secondaryKeywords: "",
    competitorNotes: "",
    recipeCardEnabled: true,
    requireOutlineApproval: false
  },
  {
    id: "preset-weeknight-recipe-seo",
    name: "Recipe Traffic - Weeknight SEO",
    articleLength: "1400-1800",
    brandVoiceId: "voice-recipe-friendly",
    searchIntent: "informational",
    audience: "Busy home cooks and families looking for practical, reliable dinners",
    secondaryKeywords: "easy dinner, weeknight dinner, quick recipe, family meal, make ahead, leftovers, storage, reheating, substitutions, serving ideas",
    competitorNotes: [
      "Goal: rank for long-tail weeknight recipe searches and satisfy a real cook quickly.",
      "People-first requirements: answer who this recipe is for, why it works, what it tastes like, what makes it practical, and how to avoid common mistakes.",
      "Structure: short intro, why you'll love it, ingredients with roles, step-by-step instructions, variations/substitutions, storage/reheating, serving ideas, FAQ, complete recipe card at the end.",
      "Rich-result support: include prep time, cook time, total time, servings, ingredients, numbered instructions, image-friendly descriptions, and clear recipe name.",
      "Internal link ideas: related dinners, side dishes, sauces, salads, desserts, meal prep, leftovers.",
      "Avoid: generic filler, fake personal story, keyword stuffing, unsupported health claims, and em dashes in headings."
    ].join("\n"),
    recipeCardEnabled: true,
    requireOutlineApproval: false
  },
  {
    id: "preset-pinterest-recipe-traffic",
    name: "Recipe Traffic - Pinterest Pins",
    articleLength: "900-1200",
    brandVoiceId: "voice-pinterest-click",
    searchIntent: "commercial",
    audience: "Pinterest users browsing visual meal ideas, seasonal recipes, and save-worthy inspiration",
    secondaryKeywords: "Pinterest recipe, easy recipe idea, meal prep, seasonal recipe, crowd pleasing, save this recipe, quick dinner idea, party food idea",
    competitorNotes: [
      "Goal: make the post easy to save, click, and turn into multiple Pinterest pins.",
      "Title style: primary keyword near the start, clear benefit, visual promise, season/occasion/diet angle when relevant.",
      "Article structure: fast hook, visual description, ingredients, simple steps, pro tips, variations, storage, FAQ, recipe card at the end.",
      "Make visual details, method, flavor, occasion, and practical benefit explicit so Pin Creator can build accurate assets later.",
      "Do not put Pinterest titles, Pin descriptions, private performance metrics, or text-overlay ideas in the published article body.",
      "Avoid: vague titles like 'easy recipe', clickbait, duplicate pin titles, and em dashes in headings."
    ].join("\n"),
    recipeCardEnabled: true,
    requireOutlineApproval: false
  },
  {
    id: "preset-rich-snippet-recipe",
    name: "Recipe Traffic - Rich Snippet",
    articleLength: "1400-1800",
    brandVoiceId: "voice-recipe-authority",
    searchIntent: "informational",
    audience: "Search visitors who want a complete recipe with times, ingredients, steps, tips, and troubleshooting",
    secondaryKeywords: "recipe card, ingredients, instructions, prep time, cook time, total time, servings, storage, substitutions, FAQ, troubleshooting, how to make",
    competitorNotes: [
      "Goal: create the most complete, trustworthy, rich-result-ready recipe page.",
      "Google usefulness: provide original helpful details, practical cooking cues, a complete description, accurate authorship, and no search-engine-first fluff.",
      "Recipe schema support: include recipe name, featured image context, ingredients, ordered instructions, prep time, cook time, total time, servings/yield, notes, storage, reheating, substitutions, and FAQs.",
      "Snippet support: write a concise meta-style intro that clearly states what the recipe is, why it works, and who it helps.",
      "Image SEO: describe finished dish, process images, and alt-text-worthy details naturally.",
      "Avoid: thin summaries, missing times, vague ingredient amounts, unsupported nutrition/health claims, and em dashes in headings."
    ].join("\n"),
    recipeCardEnabled: true,
    requireOutlineApproval: false
  }
];

function mergeBuiltIns(existing = [], builtIns = []) {
  const custom = existing.filter((item) => !builtIns.some((builtIn) => builtIn.id === item.id));
  const mergedBuiltIns = builtIns.map((builtIn) => ({ ...builtIn, ...(existing.find((item) => item.id === builtIn.id && item.builtIn === false) || {}) }));
  return [...mergedBuiltIns, ...custom];
}

function fillPromptDefaults(settings) {
  const defaultPinterestBoards = [
    "Healthy Food Ideas",
    "Mocktails & Non Alcoholic Drinks",
    "Easy Recipe Finds",
    "Quick & Easy Meals",
    "Salads & Bowls",
    "Soups, Salads & Sides",
    "Comfort Food Recipes",
    "Home Cooking",
    "Easy Weeknight Dinners",
    "Breakfast & Brunch Recipes",
    "Viral Recipe Ideas",
    "Holiday Recipes",
    "Dessert Ideas",
    "Dessert Recipes",
    "Clean Eating Recipes",
    "Quick & Easy Recipes",
    "Snack Recipes & Appetizers",
    "Recipe Blog",
    "Healthy Recipes",
    "Cocktail Recipes",
    "Air Fryer Recipes",
    "Gourmet Gather",
    "Cookie Recipes",
    "Cozy Soup & Stew Recipes",
    "Fall Recipes",
    "One Pot & Sheet Pan Meals",
    "Favorite Products",
    "Dessert Ideas",
    "Eat Well Live Well",
    "Viral Recipes",
    "Recipe Ideas",
    "Crave Worthy Eats",
    "Chocolate chip",
    "One Pot Recipes",
    "Global & Trending Flavors",
    "High Protein Recipes",
    "Healthy Recipes & Meal Prep",
    "Easy Dinner Recipes",
    "Healthy Eating & Wellness",
    "Recipes Blog",
    "Weeknight Dinners",
    "Easy Recipe Idea",
    "Easy Recipes & Food Ideas",
    "Summer Sippers",
    "Air Fryer Meals",
    "Eat Happy",
    "Dessert",
    "Food Tips & Kitchen Hacks",
    "Breakfast",
    "Spring Recipes",
    "Quick Weeknight Meals (30 Minute Dinners)",
    "Dinners",
    "Everyday Desserts | Cozy Homemade Treats",
    "Easy Recipes",
    "Breakfast Made Easy",
    "One Pan Dinners",
    "High Protein & Healthy Meals"
  ].filter((board, index, boards) => boards.findIndex((item) => item.trim().toLowerCase() === board.trim().toLowerCase()) === index);

  const filledPrompts = Object.entries(promptDefaults).reduce(
    (next, [key, value]) => ({ ...next, [key]: next[key] || value }),
    {
      articleLength: "900-1200",
      enableIntextImages: true,
      intextImageCount: 1,
      imageSeoProMode: true,
      aiModel: "gpt5nano",
      imageModel: "z-image-turbo",
      featuredImageRatio: "3:2",
      intextImageRatio: "4:3",
      pinterestPinRatio: "2:3",
      instagramPortraitRatio: "4:5",
      instagramStoryRatio: "9:16",
      facebookFeedRatio: "1.91:1",
      squareSocialRatio: "1:1",
      wordpressSites: [],
      enableInternalLinks: true,
      internalLinkCount: 3,
      internalLinkMaxPosts: 500,
      affiliateEnabled: true,
      affiliateAutoInsert: true,
      affiliateAutoDiscover: true,
      affiliateAutoGenerationV2: true,
      affiliateProvider: "impact",
      affiliateMaxLinks: 3,
      affiliateDisclosure: "This post may contain affiliate links. I may earn a commission from qualifying purchases at no additional cost to you.",
      affiliateLinks: [],
      impactAccountSid: "",
      impactAuthToken: "",
      impactMediaPropertyId: "",
      amazonPartnerTag: "",
      amazonMarketplace: "www.amazon.com",
      amazonCredentialId: "",
      amazonCredentialSecret: "",
      amazonCredentialVersion: "2.1",
      internalLinkDefaultsV2: true,
      internalLinkDefaultsV3: true,
      listicleCategory: "default",
      promptTemplates: {},
      brandVoices: [],
      projectPresets: [],
      requireOutlineApproval: false,
      defaultSearchIntent: "informational",
      defaultAudience: "",
      keepOriginalTitles: false,
      watermarkEnabled: false,
      watermarkPath: "",
      watermarkPosition: "bottom-right",
      watermarkSize: 15,
      watermarkOpacity: 80,
      recipeCardEnabled: true,
      readerRetentionEnabled: true,
      readerRetentionAllArticles: false,
      saveRecipeCtaText: "Bookmark this page so the ingredients, instructions, and cooking notes are easy to find when you are ready to cook.",
      newsletterCtaEnabled: false,
      newsletterCtaUrl: "",
      newsletterCtaText: "Get practical recipe ideas and seasonal cooking inspiration.",
      smartQualityPass: true,
      costBudgetWarning: 1,
      strictSpendingLimitEnabled: false,
      strictSpendingLimit: 5,
      interPredictionDelayMs: 250,
      publishStatus: "publish",
      publishStatusDefaultsV2: true,
      ghlApiToken: "",
      ghlLocationId: "",
      ghlSocialAccountIds: "",
      ghlInstagramAccountIds: "",
      ghlFacebookAccountIds: "",
      ghlUserId: "",
      googleClientId: "",
      googleClientSecret: "",
      googleSearchConsoleProperty: "",
      googleSearchConsoleSites: [],
      googleSearchConsoleConnected: false,
      pinterestAnalyticsAccessToken: "",
      featureFlags: {
        contentCalendar: false,
        campaignRecords: false,
        contentUpdateQueue: false,
        revenueAttribution: false,
        runHistory: false,
        modelRegistry: false
      },
      replicateApiToken: "",
      pinCreator: {
        imgbbApiKey: "",
        aiModel: "auto",
        postInterval: 120,
        pinsPerDay: 15,
        customStyles: DEFAULT_PIN_CUSTOM_STYLES,
        titleDescPrompt: DEFAULT_PIN_TITLE_DESC_PROMPT,
        autoQueueOnPublish: true,
        autoBoardMatching: true,
        boardNames: defaultPinterestBoards
      },
      ...settings
    }
  );
  if ([500, 800].includes(settings.interPredictionDelayMs)) {
    filledPrompts.interPredictionDelayMs = 250;
  }
  const normalizedPinCreator = normalizePinCreatorDefaults({
    imgbbApiKey: "",
    aiModel: "auto",
    postInterval: 120,
    pinsPerDay: 15,
    customStyles: DEFAULT_PIN_CUSTOM_STYLES,
    titleDescPrompt: DEFAULT_PIN_TITLE_DESC_PROMPT,
    autoQueueOnPublish: true,
    autoBoardMatching: true,
    boardNames: defaultPinterestBoards,
    ...(filledPrompts.pinCreator || {})
  });
  if (!settings.intelligenceDefaultsV2) {
    if (!settings.articlePrompt || settings.articlePrompt.startsWith('Write a helpful, SEO-focused recipe blog article about')) filledPrompts.articlePrompt = DEFAULT_ARTICLE_PROMPT;
    if (!settings.listicleFoodPrompt || settings.listicleFoodPrompt.startsWith('Write a conversational, helpful food and recipe listicle about')) filledPrompts.listicleFoodPrompt = LISTICLE_FOOD_PROMPT;
    if (!settings.featuredImageInstruction || settings.featuredImageInstruction.startsWith('You are an expert at creating image generation prompts for featured recipe blog images')) filledPrompts.featuredImageInstruction = DEFAULT_FEATURED_IMAGE_INSTRUCTION;
    if (!settings.pinCreator?.titleDescPrompt || settings.pinCreator.titleDescPrompt.startsWith('You are a Pinterest SEO writer for a recipe blog')) normalizedPinCreator.titleDescPrompt = DEFAULT_PIN_TITLE_DESC_PROMPT;
    filledPrompts.smartQualityPass = true;
    filledPrompts.intelligenceDefaultsV2 = true;
  }
  if (!settings.recipeQualityDefaultsV3) {
    if (!settings.articlePrompt || settings.articlePrompt.startsWith('Write a people-first recipe blog article about')) {
      filledPrompts.articlePrompt = DEFAULT_ARTICLE_PROMPT;
    }
    if (!settings.listicleDefaultPrompt || settings.listicleDefaultPrompt.includes('SEO-focused listicle article about')) {
      filledPrompts.listicleDefaultPrompt = LISTICLE_DEFAULT_PROMPT;
    }
    if (!settings.listicleFoodPrompt || settings.listicleFoodPrompt.startsWith('Write a conversational, helpful food and recipe listicle about')) {
      filledPrompts.listicleFoodPrompt = LISTICLE_FOOD_PROMPT;
    }
    filledPrompts.recipeQualityDefaultsV3 = true;
  }
  if (!settings.readerValueDefaultsV4) {
    if (!settings.articlePrompt || settings.articlePrompt.startsWith('Write a people-first recipe blog article about')) {
      filledPrompts.articlePrompt = DEFAULT_ARTICLE_PROMPT;
    }
    if (!settings.listicleFoodPrompt || settings.listicleFoodPrompt.startsWith('Write a conversational, helpful food and recipe listicle about')) {
      filledPrompts.listicleFoodPrompt = LISTICLE_FOOD_PROMPT;
    }
    filledPrompts.readerValueDefaultsV4 = true;
  }
  return {
    ...filledPrompts,
    pinCreator: normalizedPinCreator,
    brandVoices: mergeBuiltIns(settings.brandVoices || [], defaultBrandVoices),
    projectPresets: mergeBuiltIns(settings.projectPresets || [], defaultProjectPresets)
  };
}

export default function App() {
  const [activeScreen, setActiveScreen] = useState("articles");
  const [mode, setMode] = useState("article");
  const [settings, setSettings] = useState(null);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [settingsSection, setSettingsSection] = useState("general");
  const [repurposeRefreshKey, setRepurposeRefreshKey] = useState(0);
  const [articlesWorkflowStage, setArticlesWorkflowStage] = useState("mode");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  async function loadArticles(options = {}) {
    const stored = await electronAPI.getArticles();
    const shouldRecoverInterrupted = options?.recoverInterrupted === true;
    const nextArticles = shouldRecoverInterrupted
      ? await recoverInterruptedArticles(stored, electronAPI.saveArticle)
      : stored;
    setArticles(nextArticles.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)));
  }

  async function loadSettings() {
    const stored = await electronAPI.getSettings();
    const isFreshInstall = stored.onboardingCompleted === false || Object.keys(stored || {}).length === 0;
    const defaults = fillPromptDefaults(stored);
    const filled = !isFreshInstall && stored.onboardingCompleted === undefined
      ? { ...defaults, onboardingCompleted: true, onboardingMigratedForExistingWorkspace: true }
      : defaults;
    if (JSON.stringify(filled) !== JSON.stringify(stored)) {
      await electronAPI.saveSettings(filled);
    }
    setSettings(filled);
    if (filled.onboardingCompleted !== true) setActiveScreen("onboarding");
  }

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadSettings(), loadArticles({ recoverInterrupted: true })]);
      } catch (error) {
        setNotice(error.message || "Failed to load app data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    return electronAPI.onNavigateSettings?.((data) => {
      setSettingsSection(data?.section || "general");
      setActiveScreen("settings");
    });
  }, []);

  useEffect(() => {
    return electronAPI.onNavigateScreen?.((data) => {
      if (data?.screen) {
        if (data.screen === "queue") setArticlesWorkflowStage("queued");
        if (data.screen === "add-to-queue") setArticlesWorkflowStage("add");
        if (data.screen === "mode-selector") setArticlesWorkflowStage("mode");
        const nextScreen = ["queue", "add-to-queue", "mode-selector"].includes(data.screen) ? "articles" : data.screen;
        setActiveScreen(nextScreen);
        if (data.screen === "repurpose") setRepurposeRefreshKey(Date.now());
      }
    });
  }, []);

  async function saveSettings(next) {
    const filled = fillPromptDefaults(next);
    await electronAPI.saveSettings(filled);
    setSettings(filled);
    setNotice("Settings saved.");
    setTimeout(() => setNotice(""), 2200);
  }

  const counts = useMemo(() => {
    const pending = articles.filter((article) => ["pending", "outline-review"].includes(article.queueStatus)).length;
    const completed = articles.filter((article) => article.queueStatus === "completed").length;
    const failed = articles.filter((article) => article.queueStatus === "error").length;
    return { pending, completed, failed, totalArticles: articles.length };
  }, [articles]);

  const screenProps = {
    mode,
    setMode,
    settings,
    saveSettings,
    articles,
    refreshArticles: loadArticles,
    setActiveScreen,
    articlesWorkflowStage,
    setArticlesWorkflowStage,
    setSettingsSection,
    openArticlesStage: (stage) => {
      setArticlesWorkflowStage(stage);
      setActiveScreen("articles");
    },
    settingsSection,
    repurposeRefreshKey
  };

  const screens = {
    repurpose: <RepurposeStudio {...screenProps} />,
    "cluster-planner": <ClusterPlanner {...screenProps} />,
    "image-library": <ImageLibrary {...screenProps} />,
    performance: <PerformanceIntelligence {...screenProps} />,
    connections: <Connections {...screenProps} />,
    onboarding: <OnboardingChecklist {...screenProps} />,
    settings: <Settings {...screenProps} initialOpenSection={settingsSection} />,
    diagnostics: <Settings {...screenProps} initialOpenSection="diagnostics" />,
    calendar: <GrowthWorkspace {...screenProps} view="calendar" />,
    campaigns: <GrowthWorkspace {...screenProps} view="campaigns" />,
    "content-updates": <GrowthWorkspace {...screenProps} view="updates" />,
    attribution: <GrowthWorkspace {...screenProps} view="attribution" />,
    "run-history": <GrowthWorkspace {...screenProps} view="runs" />,
    "model-registry": <GrowthWorkspace {...screenProps} view="models" />
  };

  const screen = screens[activeScreen];

  if (loading || !settings) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="glass w-full max-w-sm rounded-lg p-6 text-center shadow-panel">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
          <p className="font-semibold text-slate-900">Preparing Content Studio</p>
          <p className="mt-1 text-sm text-slate-500">Loading local settings and saved work.</p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen text-ink">
      <Sidebar activeScreen={activeScreen} setActiveScreen={setActiveScreen} counts={counts} theme={theme} setTheme={setTheme} settings={settings} />
      <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 md:pb-8 lg:p-8">
        {notice ? (
          <div className="mb-4 rounded-md border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-700 shadow-sm">
            {notice}
          </div>
        ) : null}
        {!isElectronApp ? (
          <div className="mb-4 rounded-md border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-slate-800 shadow-sm">
            Browser preview mode is for UI testing only. Launch the Electron app to call Replicate, generate images, save files, and publish.
          </div>
        ) : null}
        <ErrorBoundary key={activeScreen} onReturnArticles={() => setActiveScreen("articles")}>
          <Suspense fallback={
            <div className="glass rounded-lg p-6 text-sm font-black text-slate-700 shadow-panel">
              Loading screen...
            </div>
          }>
            <div className={activeScreen === "articles" ? "" : "hidden"}>
              <ArticlesWorkflow {...screenProps} />
            </div>
            <div className={activeScreen === "pin-creator" ? "" : "hidden"}>
              <PinCreatorView {...screenProps} />
            </div>
            <div className={activeScreen === "meta-studio" ? "" : "hidden"}>
              <MetaStudio {...screenProps} />
            </div>
            <div className={activeScreen === "video-studio" ? "" : "hidden"}>
              <VideoStudio {...screenProps} />
            </div>
            <div className={activeScreen === "trends" ? "" : "hidden"}>
              <TrendsResearch {...screenProps} />
            </div>
            {!['articles', 'pin-creator', 'meta-studio', 'video-studio', 'trends'].includes(activeScreen) ? screen : null}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
