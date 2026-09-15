// State management
let pins = [];
let isPaused = false;
let isCancelled = false;
let boardNames = [];
let autoBoardMatching = true;
let queuedPinMetaByUrl = {};
let pinCreatorScheduleSettings = { postInterval: 120, pinsPerDay: 15 };
let socialRepurposePacks = [];
let socialCsvHeaders = [];
let socialCsvRows = [];

const boardKeywordProfiles = [
  { match: /mocktail|non alcoholic|sipper|drink|beverage|summer/i, keywords: ['mocktail', 'non alcoholic', 'drink', 'beverage', 'sipper', 'summer drink', 'party drink'] },
  { match: /cocktail/i, keywords: ['cocktail', 'margarita', 'martini', 'spritz', 'mojito'] },
  { match: /air fryer/i, keywords: ['air fryer', 'crispy', 'fried', 'wings', 'fries'] },
  { match: /breakfast|brunch/i, keywords: ['breakfast', 'brunch', 'pancake', 'waffle', 'egg', 'oats', 'toast', 'morning'] },
  { match: /dessert|sweet|cookie|chocolate|treat/i, keywords: ['dessert', 'sweet', 'cake', 'pie', 'brownie', 'cookie', 'chocolate', 'treat', 'baking'] },
  { match: /soup|stew/i, keywords: ['soup', 'stew', 'chili', 'broth', 'cozy', 'comfort'] },
  { match: /salad|bowl/i, keywords: ['salad', 'bowl', 'greens', 'grain bowl', 'side dish'] },
  { match: /high protein|protein/i, keywords: ['high protein', 'protein', 'chicken', 'turkey', 'beef', 'tofu', 'meal prep', 'healthy meals'] },
  { match: /healthy|clean|wellness|meal prep|eat well/i, keywords: ['healthy', 'clean eating', 'wellness', 'meal prep', 'light', 'low calorie', 'balanced'] },
  { match: /weeknight|30 minute|quick|easy|dinner|dinners/i, keywords: ['quick', 'easy', 'weeknight', '30 minute', 'busy night', 'dinner', 'fast', 'chicken', 'beef', 'pasta', 'salmon', 'casserole', 'lasagna'] },
  { match: /one pot|sheet pan|one pan/i, keywords: ['one pot', 'sheet pan', 'one pan', 'skillet', 'casserole', 'minimal cleanup'] },
  { match: /holiday|fall|spring/i, keywords: ['holiday', 'christmas', 'thanksgiving', 'easter', 'fall', 'autumn', 'spring', 'seasonal'] },
  { match: /snack|appetizer/i, keywords: ['snack', 'appetizer', 'party food', 'finger food', 'dip'] },
  { match: /comfort|home cooking|cozy/i, keywords: ['comfort food', 'cozy', 'homemade', 'home cooking', 'family dinner'] },
  { match: /viral|trending|global/i, keywords: ['viral', 'trending', 'tiktok', 'global', 'flavor', 'fusion'] },
  { match: /kitchen hacks|food tips/i, keywords: ['tip', 'hack', 'kitchen', 'how to', 'guide', 'storage', 'prep'] }
];

const pinIntentProfiles = [
  { match: /mocktail|non alcoholic|drink|beverage|lemonade|iced tea|smoothie|sipper|summer drink/i, boards: [/mocktail/i, /non alcoholic/i, /summer sippers/i], keywords: ['mocktail', 'non alcoholic', 'drink', 'beverage', 'summer'] },
  { match: /cocktail|margarita|martini|spritz|mojito/i, boards: [/cocktail/i], keywords: ['cocktail', 'margarita', 'martini', 'spritz', 'mojito'] },
  { match: /air fryer/i, boards: [/air fryer/i], keywords: ['air fryer', 'crispy', 'wings', 'fries'] },
  { match: /breakfast|brunch|pancake|waffle|egg|oats|toast|muffin/i, boards: [/breakfast made easy/i, /breakfast/i, /brunch/i], keywords: ['breakfast', 'brunch', 'morning', 'egg', 'oats'] },
  { match: /cookie|cookies/i, boards: [/cookie/i, /chocolate chip/i, /dessert/i], keywords: ['cookie', 'cookies', 'baking', 'dessert'] },
  { match: /dessert|cake|pie|brownie|chocolate|sweet|treat|baking/i, boards: [/everyday desserts/i, /dessert recipes/i, /dessert ideas/i, /^dessert$/i, /chocolate chip/i], keywords: ['dessert', 'sweet', 'treat', 'baking', 'chocolate'] },
  { match: /soup|stew|chili|broth/i, boards: [/cozy soup/i, /soup/i, /stew/i], keywords: ['soup', 'stew', 'cozy', 'comfort'] },
  { match: /salad|bowl|grain bowl|greens/i, boards: [/salads and bowls/i, /salads/i, /sides/i], keywords: ['salad', 'bowl', 'greens', 'side'] },
  { match: /high protein|protein|macro|muscle|chicken breast|turkey|tofu/i, boards: [/high protein/i, /healthy recipes and meal prep/i], keywords: ['high protein', 'protein', 'meal prep', 'healthy'] },
  { match: /healthy|clean eating|wellness|low calorie|balanced|meal prep|eat well/i, boards: [/healthy recipes and meal prep/i, /healthy food ideas/i, /healthy eating/i, /healthy recipes/i, /clean eating/i, /eat well/i], keywords: ['healthy', 'clean eating', 'wellness', 'meal prep', 'balanced'] },
  { match: /weeknight|30 minute|quick weeknight|busy night/i, boards: [/quick weeknight/i, /easy weeknight/i, /weeknight dinners/i, /quick and easy meals/i], keywords: ['weeknight', '30 minute', 'quick', 'easy dinner'] },
  { match: /dinner|dinners|supper|family meal|main dish|chicken|beef|pasta|casserole|taco|salmon/i, boards: [/easy dinner/i, /^dinners$/i, /weeknight dinners/i, /quick and easy meals/i, /home cooking/i], keywords: ['dinner', 'family meal', 'main dish', 'easy'] },
  { match: /one pot|one pan|sheet pan|skillet/i, boards: [/one pot/i, /one pan/i, /sheet pan/i], keywords: ['one pot', 'one pan', 'sheet pan', 'skillet'] },
  { match: /holiday|christmas|thanksgiving|easter|party/i, boards: [/holiday/i], keywords: ['holiday', 'party', 'christmas', 'thanksgiving'] },
  { match: /fall|autumn|pumpkin|apple cider/i, boards: [/fall/i], keywords: ['fall', 'autumn', 'pumpkin'] },
  { match: /spring|easter|fresh herbs/i, boards: [/spring/i], keywords: ['spring', 'fresh'] },
  { match: /snack|appetizer|dip|finger food|party food/i, boards: [/snack/i, /appetizer/i], keywords: ['snack', 'appetizer', 'dip', 'party food'] },
  { match: /comfort|cozy|homemade|home cooking|family dinner/i, boards: [/comfort food/i, /home cooking/i, /cozy/i], keywords: ['comfort', 'cozy', 'homemade', 'home cooking'] },
  { match: /viral|trending|tiktok|global|fusion|birria|korean|mexican|italian|thai|mediterranean/i, boards: [/global and trending/i, /viral/i, /recipe ideas/i], keywords: ['viral', 'trending', 'global', 'flavor'] },
  { match: /tips|hack|kitchen hack|how to|guide|storage|prep tip/i, boards: [/food tips/i, /kitchen hacks/i], keywords: ['tip', 'hack', 'guide', 'how to'] }
];

const pinterestSeoKeywordProfiles = [
  { match: /cabbage|slaw|coleslaw|golumpki|stuffed cabbage|dumpling|ferment|kimchi|sauerkraut/i, keywords: ['cabbage recipes', 'golumpki soup', 'cabbage dumplings', 'fermented cabbage', 'easy cabbage recipe', 'healthy cabbage dinner'] },
  { match: /blue|mocktail|non alcoholic|drink|beverage|lemonade|iced tea|sipper|smoothie|cocktail/i, keywords: ['blue drinks aesthetic', 'mocktail recipes', 'non alcoholic drinks', 'summer sippers', 'party drinks', 'refreshing drink recipes'] },
  { match: /high protein|protein|chicken breast|turkey|tofu|meal prep|macro/i, keywords: ['high protein recipes', 'healthy meal prep', 'protein meal ideas', 'easy healthy dinners', 'macro friendly meals'] },
  { match: /air fryer|crispy/i, keywords: ['air fryer recipes', 'easy air fryer meals', 'crispy air fryer ideas', 'quick air fryer dinner'] },
  { match: /weeknight|30 minute|quick|easy|dinner|family meal|busy night/i, keywords: ['easy weeknight dinners', 'quick dinner ideas', '30 minute meals', 'family dinner recipes', 'easy recipes for dinner'] },
  { match: /one pot|one pan|sheet pan|skillet/i, keywords: ['one pot recipes', 'sheet pan dinners', 'one pan meals', 'easy cleanup dinners'] },
  { match: /breakfast|brunch|egg|oats|pancake|waffle|muffin/i, keywords: ['easy breakfast recipes', 'brunch recipes', 'breakfast ideas', 'make ahead breakfast'] },
  { match: /dessert|cookie|cake|pie|brownie|chocolate|sweet|treat/i, keywords: ['easy dessert recipes', 'homemade desserts', 'cookie recipes', 'chocolate dessert ideas', 'sweet treats'] },
  { match: /soup|stew|chili|broth|cozy/i, keywords: ['cozy soup recipes', 'easy soup recipes', 'comfort food recipes', 'stew recipes'] },
  { match: /salad|bowl|greens|grain bowl/i, keywords: ['salad recipes', 'healthy bowls', 'easy side dishes', 'fresh meal ideas'] },
  { match: /holiday|christmas|thanksgiving|easter|party/i, keywords: ['holiday recipes', 'party food ideas', 'crowd pleasing recipes', 'make ahead holiday food'] },
  { match: /viral|trending|tiktok|birria|korean|mexican|italian|thai|mediterranean/i, keywords: ['viral recipes', 'trending recipes', 'global flavors', 'easy recipe ideas'] }
];

function normalizeBoardName(board) {
  return String(board || '').replace(/\s+/g, ' ').trim();
}

function dedupeBoardNames(names) {
  const seen = new Set();
  return (Array.isArray(names) ? names : [])
    .map(normalizeBoardName)
    .filter(Boolean)
    .filter((board) => {
      const key = board.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function boardIdentity(value) {
  return normalizeBoardName(value).toLowerCase();
}

function exactSavedBoard(value) {
  const key = boardIdentity(value);
  if (!key) return '';
  return boardNames.find((board) => boardIdentity(board) === key) || '';
}

function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeMatchText(value) {
  return normalizeMatchText(value).split(/\s+/).filter((word) => word.length > 2);
}

function hasPhrase(haystack, phrase) {
  const text = normalizeMatchText(phrase);
  return Boolean(text) && haystack.includes(` ${text} `);
}

function boardKeywords(board) {
  const text = normalizeMatchText(board);
  const words = text.split(' ').filter((word) => word.length > 2);
  const keywords = new Set([text, ...words]);
  boardKeywordProfiles.forEach((profile) => {
    if (profile.match.test(board)) profile.keywords.forEach((keyword) => keywords.add(normalizeMatchText(keyword)));
  });
  return Array.from(keywords).filter(Boolean);
}

function pinMatchText(pin) {
  return normalizeMatchText([
    pin.title,
    pin.description,
    pin.prompt,
    pin.sourceTitle,
    pin.url,
    ...(pin.interests || [])
  ].filter(Boolean).join(' '));
}

function chooseBestBoard(pin) {
  if (!autoBoardMatching || !boardNames.length) return '';
  const matchText = pinMatchText(pin);
  const haystack = ` ${matchText} `;
  const pinTokens = new Set(tokenizeMatchText(matchText));
  const activeIntents = pinIntentProfiles.filter((profile) => profile.match.test(matchText));
  let bestBoard = boardNames.find((board) => /easy recipe finds/i.test(board))
    || boardNames.find((board) => /^recipe ideas$/i.test(board))
    || boardNames.find((board) => /^recipes? blog$/i.test(board))
    || boardNames[0]
    || '';
  let bestScore = 0;

  boardNames.forEach((board, index) => {
    const boardText = normalizeMatchText(board);
    const boardTokens = new Set(tokenizeMatchText(board));
    let score = 0;
    if (boardText && hasPhrase(haystack, boardText)) score += 120;

    boardKeywords(board).forEach((keyword) => {
      if (!keyword) return;
      if (hasPhrase(haystack, keyword)) score += keyword.includes(' ') ? 26 : 10;
    });

    activeIntents.forEach((intent) => {
      if (intent.boards.some((pattern) => pattern.test(board))) score += 65;
      intent.keywords.forEach((keyword) => {
        if (hasPhrase(` ${boardText} `, keyword)) score += keyword.includes(' ') ? 24 : 12;
      });
    });

    pinTokens.forEach((token) => {
      if (boardTokens.has(token)) score += 5;
    });

    if (/ideas?|finds?|blog|recipes?|food|meals?|easy|quick/.test(boardText)) score += 1;
    if (/favorite products/i.test(board)) score -= 20;
    if (/cocktail/i.test(board) && !/cocktail|margarita|martini|spritz|mojito/i.test(matchText)) score -= 25;
    if (/mocktail|non alcoholic/i.test(board) && !/mocktail|non alcoholic|drink|beverage|sipper/i.test(matchText)) score -= 25;
    if (/dessert|cookie|chocolate/i.test(board) && !/dessert|cookie|chocolate|sweet|cake|pie|brownie|treat/i.test(matchText)) score -= 12;
    if (/healthy/i.test(board) && /dessert|cookie|cake|pie|brownie/i.test(matchText) && !/healthy|protein|clean|low calorie/i.test(matchText)) score -= 10;
    score -= index * 0.001;

    if (score > bestScore) {
      bestScore = score;
      bestBoard = board;
    }
  });

  return bestBoard;
}

function ensurePinBoard(pin, force = false) {
  if (!pin || !autoBoardMatching) return;
  const savedBoard = exactSavedBoard(pin.csvBoard);
  if (savedBoard && (!force || !pin.csvBoardAuto)) {
    pin.csvBoard = savedBoard;
    return;
  }
  if (!force && pin.csvBoard && !pin.csvBoardAuto && savedBoard) return;
  const board = chooseBestBoard(pin);
  if (!board) return;
  pin.csvBoard = board;
  pin.csvBoardAuto = true;
}

function dedupeKeywords(items) {
  const seen = new Set();
  return items
    .map((item) => String(item || '').replace(/^#/, '').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter((item) => item.length > 2)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function titleKeywordPhrases(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = normalized.split(' ').filter((word) => word.length > 2 && !['the', 'and', 'for', 'with', 'that', 'this', 'your', 'from', 'into', 'under', 'over', 'best', 'recipe', 'recipes'].includes(word));
  const phrases = [];
  for (let i = 0; i < words.length - 1; i++) phrases.push(`${words[i]} ${words[i + 1]}`);
  return [...phrases.slice(0, 4), ...words.slice(0, 6)];
}

function pinterestSeoKeywords(pin) {
  const selectedBoard = exactSavedBoard(pin.csvBoard) || chooseBestBoard(pin);
  const text = [pin.title, pin.description, pin.prompt, pin.sourceTitle, selectedBoard, pin.url, ...(pin.interests || [])].filter(Boolean).join(' ');
  const keywords = [
    ...(Array.isArray(pin.interests) ? pin.interests : []),
    selectedBoard,
    ...titleKeywordPhrases(pin.title || pin.sourceTitle || ''),
    'easy recipe ideas',
    'recipe inspiration',
    'save this recipe'
  ];
  pinIntentProfiles.forEach((profile) => {
    if (profile.match.test(text)) keywords.push(...profile.keywords);
  });
  pinterestSeoKeywordProfiles.forEach((profile) => {
    if (profile.match.test(text)) keywords.push(...profile.keywords);
  });
  boardKeywords(selectedBoard).forEach((keyword) => {
    if (keyword.length > 3 && !/recipes? blog|gourmet gather/i.test(keyword)) keywords.push(keyword);
  });
  return dedupeKeywords(keywords).slice(0, 24).join(', ');
}

function boardFieldHtml(pin) {
  const selectedBoard = exactSavedBoard(pin.csvBoard) || chooseBestBoard(pin);
  if (!boardNames.length) {
    return `<input type="text" data-pin-id="${pin.id}" data-field="board" value="${escapeHtml(pin.csvBoard || '')}" placeholder="Add boards in Settings" />`;
  }
  const options = boardNames.map((board) => {
    const selected = board === selectedBoard ? 'selected' : '';
    return `<option value="${escapeHtml(board)}" ${selected}>${escapeHtml(board)}</option>`;
  }).join('');
  return `<select data-pin-id="${pin.id}" data-field="board" style="width: 100%; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 6px; padding: 8px 12px; font-size: 13px; color: var(--text-input); cursor: pointer;">${options}</select>`;
}

async function loadBoardSettings() {
  try {
    const settings = await window.electronAPI.getSettings();
    boardNames = dedupeBoardNames(settings.boardNames || settings.pinCreator?.boardNames || []);
    autoBoardMatching = settings.autoBoardMatching !== false && settings.pinCreator?.autoBoardMatching !== false;
    pinCreatorScheduleSettings = {
      postInterval: Number(settings.postInterval || settings.pinCreator?.postInterval || 120),
      pinsPerDay: Number(settings.pinsPerDay || settings.pinCreator?.pinsPerDay || 15)
    };
    const preferredRatio = settings.pinterestPinRatio || '2:3';
    if (aspectRatio?.querySelector(`option[value="${preferredRatio}"]`)) {
      aspectRatio.value = preferredRatio;
    }
  } catch (error) {
    console.error('Error loading board settings:', error);
    boardNames = [];
    autoBoardMatching = true;
    pinCreatorScheduleSettings = { postInterval: 120, pinsPerDay: 15 };
  }
}

function applyImageResultToPin(pin, result) {
  const normalize = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.href === 'string') return value.href;
    const text = String(value);
    return text && text !== '[object Object]' ? text : '';
  };
  pin.imageUrl = normalize(result.displayUrl || result.localImageUrl || result.imgurUrl || result.imageUrl);
  pin.displayUrl = pin.imageUrl;
  pin.localImageUrl = normalize(result.localImageUrl);
  pin.localPath = normalize(result.localPath);
  pin.remoteImageUrl = normalize(result.remoteImageUrl) || (/^https?:\/\//i.test(normalize(result.imageUrl)) ? normalize(result.imageUrl) : '');
  pin.imgurUrl = normalize(result.imgurUrl) || null;
}

function getPinDisplayUrl(pin) {
  return pin.displayUrl || pin.localImageUrl || pin.imageUrl || pin.imgurUrl || pin.remoteImageUrl || '';
}

function getPinPublicMediaUrl(pin) {
  if (pin.imageQa?.publicUrlVerified !== true
    || pin.imageQa?.publicDimensionsVerified !== true
    || pin.imageQa?.publicIdentityVerified !== true
    || pin.imageQa?.publicAssetKind !== 'finished-pinterest-pin'
    || Number(pin.imageQa?.publicWidth || 0) !== 1000
    || Number(pin.imageQa?.publicHeight || 0) !== 1500) return '';
  const validatedUrl = String(pin.imageQa?.publicValidatedUrl || '');
  return [pin.csvMediaUrl, pin.hostedImageUrl, pin.imgurUrl]
    .find((url) => /^https:\/\//i.test(String(url || '')) && String(url) === validatedUrl) || '';
}

function getPinDownloadUrl(pin) {
  return getPinDisplayUrl(pin) || getPinPublicMediaUrl(pin);
}

// Load saved pins from localStorage on startup
function loadSavedPins() {
  try {
    const savedPins = localStorage.getItem('pins');
    if (savedPins) {
      pins = JSON.parse(savedPins);
      // Restore pins to UI
      if (pins.length > 0) {
        // Show the appropriate buttons
        urlInput.disabled = true;
        loadUrlsBtn.style.display = 'none';
        generatePromptsBtn.style.display = 'flex';
        viewCSVBtn.style.display = 'flex';

        // Check if any pins have images
        const hasImages = pins.some(p => p.imageUrl);
        if (hasImages) {
          createAllBtn.style.display = 'none';
        } else {
          createAllBtn.style.display = 'flex';
        }

        // Check if any pins have titles
        const hasTitles = pins.some(p => p.title && p.description);
        if (hasTitles) {
          createTitlesBtn.style.display = 'none';
          exportCSVBtn.style.display = 'none';
        } else {
          createTitlesBtn.style.display = 'flex';
          exportCSVBtn.style.display = 'none';
        }

        // Check if any pins are completed
        const hasCompleted = pins.some(p => p.status === 'completed');
        if (hasCompleted) {
          downloadAllBtn.style.display = 'flex';
          socialRepurposeBtn.style.display = 'flex';
        }
      }

      // Restore pins to UI
      pins.forEach(pin => {
        renderPin(pin);
      });

      if (localStorage.getItem('pinCreatorActiveView') === 'csv') {
        showCSVEditor();
      }
    }
  } catch (error) {
    console.error('Error loading saved pins:', error);
  }
}

// Save pins to localStorage
function savePins() {
  try {
    localStorage.setItem('pins', JSON.stringify(pins));
    window.electronAPI.savePinCreatorPins?.(pins).catch((error) => {
      console.warn('Could not sync pins to Content Studio:', error);
    });
  } catch (error) {
    console.error('Error saving pins:', error);
  }
}

function updateCurrentUtcTime() {
  const el = document.getElementById('currentUtcTime');
  if (!el) return;
  const now = new Date();
  const formatted = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  el.textContent = formatted;
}

// DOM elements
const urlInput = document.getElementById('urlInput');
const pinStyle = document.getElementById('pinStyle');
const aspectRatio = document.getElementById('aspectRatio');
const imageModel = document.getElementById('imageModel');
const loadUrlsBtn = document.getElementById('loadUrlsBtn');
const generatePromptsBtn = document.getElementById('generatePromptsBtn');
const createAllBtn = document.getElementById('createAllBtn');
const createTitlesBtn = document.getElementById('createTitlesBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const socialRepurposeBtn = document.getElementById('socialRepurposeBtn');
const socialRepurposeSection = document.getElementById('socialRepurposeSection');
const socialRepurposeContainer = document.getElementById('socialRepurposeContainer');
const exportSocialPackBtn = document.getElementById('exportSocialPackBtn');
const editSocialCsvBtn = document.getElementById('editSocialCsvBtn');
const exportEditedSocialCsvBtn = document.getElementById('exportEditedSocialCsvBtn');
const socialCsvEditorSection = document.getElementById('socialCsvEditorSection');
const socialCsvTableHead = document.getElementById('socialCsvTableHead');
const socialCsvTableBody = document.getElementById('socialCsvTableBody');
const socialCsvRowCount = document.getElementById('socialCsvRowCount');
const socialCsvStartTime = document.getElementById('socialCsvStartTime');
const socialCsvInterval = document.getElementById('socialCsvInterval');
const applySocialScheduleBtn = document.getElementById('applySocialScheduleBtn');
const viewCSVBtn = document.getElementById('viewCSVBtn');
const exportCSVBtn = document.getElementById('exportCSVBtn');
const exportCSVFromEditorBtn = document.getElementById('exportCSVFromEditorBtn');
const backToPinsBtn = document.getElementById('backToPinsBtn');
const clearBtn = document.getElementById('clearBtn');
const settingsBtn = document.getElementById('settingsBtn');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const themeText = document.getElementById('themeText');
const pauseResumeBtn = document.getElementById('pauseResumeBtn');
const cancelBtn = document.getElementById('cancelBtn');
const resultsContainer = document.getElementById('resultsContainer');
const csvEditorSection = document.getElementById('csvEditorSection');
const resultsSection = document.querySelector('.results-section');
const inputSection = document.querySelector('.input-section');

// Theme management
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  setTheme(savedTheme);
}

function setTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light-theme');
    themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    themeText.textContent = 'Light';
  } else {
    document.body.classList.remove('light-theme');
    themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    themeText.textContent = 'Dark';
  }
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

// Event listeners
loadUrlsBtn.addEventListener('click', handleLoadUrls);
generatePromptsBtn.addEventListener('click', handleGeneratePrompts);
createTitlesBtn.addEventListener('click', handleCreateAllTitles);
createAllBtn.addEventListener('click', handleCreateAllPins);
downloadAllBtn.addEventListener('click', handleDownloadAll);
socialRepurposeBtn.addEventListener('click', handleSocialRepurpose);
exportSocialPackBtn.addEventListener('click', handleExportSocialPack);
editSocialCsvBtn.addEventListener('click', handleEditSocialCsv);
exportEditedSocialCsvBtn.addEventListener('click', handleExportSocialPack);
applySocialScheduleBtn.addEventListener('click', applySocialCsvSchedule);
exportCSVBtn.addEventListener('click', handleExportCSV);
viewCSVBtn.addEventListener('click', () => {
  showCSVEditor();
});
pauseResumeBtn.addEventListener('click', () => {
  isPaused = !isPaused;

  if (isPaused) {
    pauseResumeBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      Resume
    `;
  } else {
    pauseResumeBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="4" width="4" height="16"/>
        <rect x="14" y="4" width="4" height="16"/>
      </svg>
      Pause
    `;
  }
});

// Cancel button — aborts any in-flight generation and stops the queue
if (cancelBtn) {
  cancelBtn.addEventListener('click', async () => {
    if (!confirm('Cancel all in-flight generation? Any pin currently being created will be aborted.')) return;
    isCancelled = true;
    isPaused = false; // unblock the pause-wait loops so they can exit
    try { await window.electronAPI.cancelAllJobs(); } catch (e) { console.warn('cancelAllJobs:', e); }
    showToast('Generation cancelled', 'info');
  });
}
exportCSVFromEditorBtn.addEventListener('click', handleExportCSV);
backToPinsBtn.addEventListener('click', showPinCards);
clearBtn.addEventListener('click', handleClear);
settingsBtn.addEventListener('click', () => {
  window.electronAPI.openSettings();
});
themeToggle.addEventListener('click', toggleTheme);

// CSV Import functionality
const importCsvBtn = document.getElementById('importCsvBtn');
const csvFileInput = document.getElementById('csvFileInput');

// Store imported keywords per URL
let importedKeywords = {};

importCsvBtn.addEventListener('click', () => {
  csvFileInput.click();
});

csvFileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const csvText = e.target.result;
    parseAndLoadCSV(csvText);
  };
  reader.readAsText(file);

  // Reset file input so same file can be selected again
  csvFileInput.value = '';
});

function parseAndLoadCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return;

  // Check if first line is header
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('link') || firstLine.includes('url') || firstLine.includes('keyword');
  const startIndex = hasHeader ? 1 : 0;

  const urls = [];
  importedKeywords = {}; // Reset

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV line (handle quoted values)
    const parts = parseCSVLine(line);
    if (parts.length >= 1) {
      const url = parts[0].trim();
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        urls.push(url);

        // If there's a second column with keywords
        if (parts.length >= 2 && parts[1].trim()) {
          const keywords = parts[1].trim();
          importedKeywords[url] = keywords;
        }
      }
    }
  }

  if (urls.length > 0) {
    // Add URLs to textarea
    urlInput.value = urls.join('\n');

    // Show success message
    const keywordCount = Object.keys(importedKeywords).length;
    let message = `Imported ${urls.length} URL${urls.length > 1 ? 's' : ''}`;
    if (keywordCount > 0) {
      message += ` with ${keywordCount} keyword set${keywordCount > 1 ? 's' : ''}`;
    }
    showToast(message, 'success');
  } else {
    showToast('No valid URLs found in CSV', 'error');
  }
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result.map(s => s.replace(/^"|"$/g, '').trim());
}

// Handle image model change - update available aspect ratios
imageModel.addEventListener('change', () => {
  const selectedModel = imageModel.value;
  const currentRatio = aspectRatio.value;

  if (selectedModel === 'gptimage2low' || selectedModel === 'gptimage2med') {
    // GPT Image 2 only supports 2:3 portrait
    aspectRatio.innerHTML = `
      <option value="2:3" selected>2:3 - Portrait (GPT Image 2)</option>
    `;
  } else {
    // All other models support all ratios
    aspectRatio.innerHTML = `
      <option value="2:3" ${currentRatio !== '9:16' && currentRatio !== '1:2' ? 'selected' : ''}>2:3 - Standard Pinterest (Recommended)</option>
      <option value="9:16" ${currentRatio === '9:16' ? 'selected' : ''}>9:16 - Tall Portrait</option>
      <option value="1:2" ${currentRatio === '1:2' ? 'selected' : ''}>1:2 - Tall Pin</option>
    `;
  }
});

// Initialize theme on page load
initTheme();

// Initialize UTC time display and keep it fresh
updateCurrentUtcTime();
setInterval(updateCurrentUtcTime, 1000);

// Load custom styles into the pin style dropdown
async function loadCustomStyles() {
  try {
    const settings = await window.electronAPI.getSettings();
    const customStyles = settings.customStyles || {};
    const customStylesOptgroup = document.getElementById('customStylesOptgroup');

    if (customStylesOptgroup) {
      customStylesOptgroup.innerHTML = '';
      // Built-in style IDs - don't show overrides as custom styles
      const builtInIds = ['custom-july-original-ai', 'custom-modern-recipe-magazine', 'custom-minimal-editorial', 'custom-ingredient-closeup', 'custom-recipe-card', 'custom-weeknight-solution', 'custom-listicle-collage', 'closeup', 'home-decor', 'mirror-selfie', 'basic-top', 'basic-middle', 'basic-bottom', 'dual-image', 'collage'];
      Object.keys(customStyles).forEach(styleId => {
        // Skip built-in style overrides - they already appear in Built-in Styles
        if (builtInIds.includes(styleId)) return;
        const option = document.createElement('option');
        option.value = styleId;
        option.textContent = customStyles[styleId].name;
        customStylesOptgroup.appendChild(option);
      });
      const shouldUseCloseupDefault = pinStyle && (!pinStyle.value || pinStyle.value === 'closeup' || pinStyle.value === 'basic-middle');
      if (customStyles['custom-july-original-ai'] && shouldUseCloseupDefault) {
        pinStyle.value = 'custom-july-original-ai';
      }
    }
  } catch (error) {
    console.error('Error loading custom styles:', error);
  }
}

// Load custom styles on startup
loadCustomStyles();
loadBoardSettings();

// Unified Content Studio handoff: Content Studio queues WordPress/internal URLs
// here once, then the main process clears the queue so they are not reused.
async function loadQueuedPinUrls() {
  try {
    if (!window.electronAPI.getPinQueue) return;
    const result = await window.electronAPI.getPinQueue();
    const items = Array.isArray(result?.items) ? result.items : [];
    queuedPinMetaByUrl = {};
    items.forEach((item) => {
      if (!item?.url) return;
      queuedPinMetaByUrl[item.url] = {
        title: item.title || '',
        articleId: item.articleId || ''
      };
    });
    const urls = items.length ? items.map((item) => item.url) : (result?.urls || []);
    if (!urls.length) return;
    const existing = urlInput.value.trim();
    urlInput.value = existing ? `${existing}\n${urls.join('\n')}` : urls.join('\n');
  } catch (error) {
    console.error('Error loading queued pin URLs:', error);
  }
}

loadQueuedPinUrls();

// Reload custom styles when window regains focus (after settings changes)
window.addEventListener('focus', () => {
  loadCustomStyles();
  loadBoardSettings().then(() => {
    if (csvEditorSection?.style.display === 'block') populateCSVEditor();
  });
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  loadBoardSettings().then(() => {
    if (csvEditorSection?.style.display === 'block') populateCSVEditor();
  });
});

// Load saved pins on startup
loadSavedPins();

// Helper function to get filename from URL
function getFilenameFromURL(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    // Get the last part of the path, remove leading/trailing slashes
    const slug = pathname.split('/').filter(s => s).pop() || 'pin';
    // Replace hyphens and underscores with spaces, remove special characters
    const cleanName = slug
      .replace(/[-_]/g, ' ')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .trim();
    return cleanName || 'pin';
  } catch (error) {
    return 'pin';
  }
}

// Load URLs into cards
async function handleLoadUrls() {
  await loadBoardSettings();
  const urls = urlInput.value
    .split('\n')
    .map(url => url.trim())
    .filter(url => url.length > 0);

  if (urls.length === 0) {
    alert('Please enter at least one URL');
    return;
  }

  createTitlesBtn.style.display = 'none';
  createAllBtn.style.display = 'none';
  downloadAllBtn.style.display = 'none';
  socialRepurposeBtn.style.display = 'none';
  viewCSVBtn.style.display = 'flex';
  exportCSVBtn.style.display = 'none';

  const existingKeys = new Set(pins.map((pin) => {
    if (pin.articleId) return `article:${String(pin.articleId).trim().toLowerCase()}`;
    return `url:${String(pin.url || '').trim().replace(/\/+$/, '').toLowerCase()}`;
  }));
  let added = 0;

  // Create pin cards for each URL
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const queuedMeta = queuedPinMetaByUrl[url] || {};
    const key = queuedMeta.articleId
      ? `article:${String(queuedMeta.articleId).trim().toLowerCase()}`
      : `url:${String(url || '').trim().replace(/\/+$/, '').toLowerCase()}`;
    if (existingKeys.has(key)) continue;

    // Check if this URL has imported keywords
    let interests = [];
    if (importedKeywords[url]) {
      // Split keywords by comma and trim each one
      interests = importedKeywords[url]
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
    }

    const pin = {
      id: Date.now() + i,
      url: url,
      sourceTitle: queuedMeta.title || '',
      articleId: queuedMeta.articleId || '',
      interests: interests,
      prompt: '',
      imageUrl: null,
      status: 'loaded', // New status for loaded but not yet generated
    };

    ensurePinBoard(pin, true);

    pins.push(pin);
    existingKeys.add(key);
    added++;
    renderPin(pin);
  }

  if (!added) {
    showToast('Those URLs are already loaded in Pin Creator.', 'success');
    urlInput.value = '';
    return;
  }

  // Clear imported keywords after use
  importedKeywords = {};

  savePins(); // Save after loading URLs
  urlInput.value = '';
  // Show generate button, hide load button
  generatePromptsBtn.style.display = 'flex';
  urlInput.disabled = true;
  loadUrlsBtn.style.display = 'none';
}

// Generate prompts for all URLs
async function handleGeneratePrompts() {
  if (pins.length === 0) {
    return;
  }

  // Get selected style
  const selectedStyle = pinStyle.value;

  generatePromptsBtn.disabled = true;
  generatePromptsBtn.innerHTML = '<div class="spinner"></div> Generating...';
  pauseResumeBtn.style.display = 'flex';
  if (cancelBtn) cancelBtn.style.display = 'flex';
  isPaused = false;
  isCancelled = false;

  // Generate prompts sequentially (one at a time) - same approach as titles and images
  // This is proven to work reliably on all platforms
  for (const pin of pins) {
    if (isCancelled) break;
    // Wait while paused
    while (isPaused && !isCancelled) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (isCancelled) break;

    // Get the latest interests from the input field before generating
    const interestsInput = document.getElementById(`interests-${pin.id}`);
    if (interestsInput) {
      const interestsValue = interestsInput.value.trim();
      pin.interests = interestsValue
        ? interestsValue.split(',').map(i => i.trim()).filter(i => i)
        : [];
    }

    pin.status = 'generating-prompt';
    updatePin(pin);

    const jobKey = `prompt-${pin.id}-${Date.now()}`;
    try {
      const result = await window.electronAPI.generatePrompt(pin.url, pin.interests, selectedStyle, jobKey);

      if (result.success) {
        pin.prompt = result.prompt;
        pin.status = 'ready';
        ensurePinBoard(pin);
      } else if (result.cancelled) {
        pin.status = 'ready'; // back to pending state, not error
      } else if (result.authError) {
        pin.status = 'error';
        pin.error = 'Invalid Replicate API token. Check Settings.';
        isCancelled = true; // stop the rest of the queue
      } else {
        pin.status = 'error';
        pin.error = result.error;
      }
    } catch (error) {
      pin.status = 'error';
      pin.error = error.message;
    }

    updatePin(pin);
  }

  generatePromptsBtn.disabled = false;
  generatePromptsBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/>
    </svg>
    Generate Prompts
  `;
  pauseResumeBtn.style.display = 'none';
  if (cancelBtn) cancelBtn.style.display = 'none';

  // Show buttons if any prompts were generated successfully
  const readyPins = pins.filter(p => p.status === 'ready');
  if (readyPins.length > 0) {
    createTitlesBtn.style.display = 'flex';
    createAllBtn.style.display = 'flex';
  }
}

// Helper to yield to main thread - prevents UI freezing
function yieldToMain() {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

// Create all titles and descriptions
async function handleCreateAllTitles() {
  // Include pins that don't have titles yet (regardless of status)
  const pinsNeedingTitles = pins.filter(p => !p.title || !p.description);

  if (pinsNeedingTitles.length === 0) {
    // All pins already have titles
    return;
  }

  createTitlesBtn.disabled = true;
  createTitlesBtn.innerHTML = '<div class="spinner"></div> Creating...';
  pauseResumeBtn.style.display = 'flex';
  if (cancelBtn) cancelBtn.style.display = 'flex';
  isPaused = false;
  isCancelled = false;

  let completedCount = 0;
  const totalCount = pinsNeedingTitles.length;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  // Process pins sequentially with yielding
  for (let i = 0; i < pinsNeedingTitles.length; i++) {
    if (isCancelled) break;
    const pin = pinsNeedingTitles[i];

    // Yield to main thread before each pin to keep UI responsive
    await yieldToMain();

    // Wait while paused
    while (isPaused && !isCancelled) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (isCancelled) break;

    // Add delay between API calls to prevent overwhelming the system
    if (completedCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Get the latest interests from the input field before generating
    const interestsInput = document.getElementById(`interests-${pin.id}`);
    if (interestsInput) {
      const interestsValue = interestsInput.value.trim();
      pin.interests = interestsValue
        ? interestsValue.split(',').map(i => i.trim()).filter(i => i)
        : [];
    }

    const previousStatus = pin.status;
    pin.status = 'generating-title';

    // Update UI with yielding
    await yieldToMain();
    updatePinMinimal(pin); // Use minimal update to reduce DOM work

    const jobKey = `title-${pin.id}-${Date.now()}`;
    try {
      const result = await window.electronAPI.generateTitleDescription(pin.url, pin.interests, pinStyle.value, jobKey);

      if (result.success) {
        pin.title = result.title;
        pin.description = result.description;
        pin.status = pin.imageUrl ? 'completed' : 'ready';
        ensurePinBoard(pin);
        delete pin.titleError;
        consecutiveErrors = 0; // Reset error counter on success
      } else if (result.cancelled) {
        pin.status = previousStatus || 'ready';
        // Don't count as error
      } else if (result.authError) {
        pin.titleError = 'Invalid Replicate API token. Check Settings.';
        pin.status = previousStatus || 'ready';
        isCancelled = true; // stop the rest of the queue
      } else {
        pin.titleError = result.error;
        pin.status = previousStatus || 'ready';
        consecutiveErrors++;
        console.error(`Title generation error for ${pin.url}:`, result.error);
      }
    } catch (error) {
      pin.titleError = error.message || 'Unknown error';
      pin.status = previousStatus || 'ready';
      consecutiveErrors++;
      console.error(`Title generation exception for ${pin.url}:`, error);
    }

    completedCount++;
    createTitlesBtn.innerHTML = `<div class="spinner"></div> Creating ${completedCount}/${totalCount}...`;

    // Yield before updating UI
    await yieldToMain();
    updatePin(pin, true); // Skip save during bulk operation

    // If too many consecutive errors, pause and alert user
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.error('Too many consecutive errors, pausing...');
      isPaused = true;
      pauseResumeBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Resume
      `;
      showToast(`Paused after ${MAX_CONSECUTIVE_ERRORS} consecutive errors. Check your API connection and click Resume.`, 'error');
      consecutiveErrors = 0; // Reset so user can resume
      savePins(); // Save when pausing
    }

    // Save periodically (every 5 pins) instead of every update to reduce I/O
    if (completedCount % 5 === 0) {
      await yieldToMain();
      savePins();
    }
  }

  // Final save after bulk operation completes
  savePins();

  createTitlesBtn.disabled = false;
  createTitlesBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" x2="8" y1="13" y2="13"/>
      <line x1="16" x2="8" y1="17" y2="17"/>
      <line x1="10" x2="8" y1="9" y2="9"/>
    </svg>
    Create Titles & Descriptions
  `;
  pauseResumeBtn.style.display = 'none';
  if (cancelBtn) cancelBtn.style.display = 'none';

  // Check if all pins now have titles/descriptions and show CSV buttons
  const allHaveTitles = pins.every(p => p.title && p.description);
  if (allHaveTitles) {
    createTitlesBtn.style.display = 'none';
    viewCSVBtn.style.display = 'flex';
    exportCSVBtn.style.display = 'none';
    // Prepare CSV editor data but don't show it yet
    populateCSVEditor();
  }
}

// Create all pins - parallel with 5-second stagger
async function handleCreateAllPins() {
  const readyPins = pins.filter(p => p.status === 'ready');

  if (readyPins.length === 0) {
    return;
  }

  createAllBtn.disabled = true;
  createAllBtn.innerHTML = '<div class="spinner"></div> Creating Pins...';
  pauseResumeBtn.style.display = 'flex';
  if (cancelBtn) cancelBtn.style.display = 'flex';
  isPaused = false;
  isCancelled = false;

  // Get selected aspect ratio and model
  const selectedAspectRatio = aspectRatio.value;
  const selectedModel = imageModel.value;


  // Track all pending promises
  const pendingPromises = [];
  let completedCount = 0;
  const totalCount = readyPins.length;

  // Helper to create a single pin
  async function createPin(pin) {
    if (isCancelled) return;
    pin.status = 'generating-image';
    updatePin(pin);

    const jobKey = `image-${pin.id}-${Date.now()}`;
    try {
      const result = await window.electronAPI.generateImage(pin.prompt, selectedAspectRatio, selectedModel, pin.url, jobKey);

      if (result.success) {
        applyImageResultToPin(pin, result);
        pin.status = 'completed';
      } else if (result.cancelled) {
        pin.status = 'ready';
      } else if (result.authError) {
        pin.status = 'error';
        pin.error = 'Invalid Replicate API token. Check Settings.';
        isCancelled = true;
      } else {
        pin.status = 'error';
        pin.error = result.error;
      }
    } catch (error) {
      pin.status = 'error';
      pin.error = error.message;
    }

    updatePin(pin);
    completedCount++;

    // Update button to show progress
    createAllBtn.innerHTML = `<div class="spinner"></div> Creating ${completedCount}/${totalCount}...`;
  }

  // Start all pins with 5-second stagger
  for (let i = 0; i < readyPins.length; i++) {
    if (isCancelled) break;
    // Wait while paused
    while (isPaused && !isCancelled) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (isCancelled) break;

    const pin = readyPins[i];
    // Start the pin creation (don't await - let it run in parallel)
    pendingPromises.push(createPin(pin));

    // Wait 5 seconds before starting the next one (except for the last one)
    // Honor cancel during the stagger wait so we don't keep launching new jobs after cancel
    if (i < readyPins.length - 1) {
      const start = Date.now();
      while (Date.now() - start < 5000) {
        if (isCancelled) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  // Wait for all pins to complete (or be aborted)
  await Promise.all(pendingPromises);

  createAllBtn.disabled = false;
  createAllBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" x2="12" y1="15" y2="3"/>
    </svg>
    Create All Pins
  `;
  pauseResumeBtn.style.display = 'none';
  if (cancelBtn) cancelBtn.style.display = 'none';

  // Check if any pins completed
  const completedPins = pins.filter(p => p.status === 'completed');
  if (completedPins.length > 0) {
    downloadAllBtn.style.display = 'flex';
    socialRepurposeBtn.style.display = 'flex';
    createAllBtn.style.display = 'none';
    createTitlesBtn.style.display = 'flex';
  }
}

// Create single pin
async function handleCreateSinglePin(pinId) {
  const pin = pins.find(p => p.id === pinId);
  if (!pin) return;

  // Get selected aspect ratio and model
  const selectedAspectRatio = aspectRatio.value;
  const selectedModel = imageModel.value;


  pin.status = 'generating-image';
  updatePin(pin);

  try {
    const result = await window.electronAPI.generateImage(pin.prompt, selectedAspectRatio, selectedModel, pin.url);

    if (result.success) {
      applyImageResultToPin(pin, result);
      pin.status = 'completed';
    } else {
      pin.status = 'error';
      pin.error = result.error;
    }
  } catch (error) {
    pin.status = 'error';
    pin.error = error.message;
  }

  updatePin(pin);
  if (pin.status === 'completed') socialRepurposeBtn.style.display = 'flex';
}

// Regenerate pin image
async function handleRegeneratePin(pinId) {
  const pin = pins.find(p => p.id === pinId);
  if (!pin || !pin.prompt) return;

  // Get selected aspect ratio and model
  const selectedAspectRatio = aspectRatio.value;
  const selectedModel = imageModel.value;


  pin.status = 'generating-image';
  pin.imageUrl = null; // Clear old image
  updatePin(pin);

  try {
    const result = await window.electronAPI.generateImage(pin.prompt, selectedAspectRatio, selectedModel, pin.url);

    if (result.success) {
      applyImageResultToPin(pin, result);
      pin.status = 'completed';
    } else {
      pin.status = 'error';
      pin.error = result.error;
    }
  } catch (error) {
    pin.status = 'error';
    pin.error = error.message;
  }

  updatePin(pin);
  if (pin.status === 'completed') socialRepurposeBtn.style.display = 'flex';
}

// Download image
async function handleDownload(pinId) {
  const pin = pins.find(p => p.id === pinId);
  const imageUrl = pin ? getPinDownloadUrl(pin) : '';
  if (!pin || !imageUrl) return;

  const filename = getFilenameFromURL(pin.url);

  try {
    if (imageUrl.startsWith('file:')) {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `${filename}.webp`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
    // Fetch the image as a blob to properly set filename
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${filename}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the blob URL
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  } catch (error) {
    console.error('Download failed:', error);
    alert('Failed to download image. Please try again.');
  }
}

// Download all images as a zip file
async function handleDownloadAll() {
  const completedPins = pins.filter(p => p.status === 'completed' && getPinDownloadUrl(p));

  if (completedPins.length === 0) {
    alert('No images to download. Please generate pins first.');
    return;
  }

  downloadAllBtn.disabled = true;
  downloadAllBtn.innerHTML = '<div class="spinner"></div> Creating ZIP...';

  try {
    // Create a new JSZip instance
    const zip = new JSZip();

    // Fetch and add each image to the zip
    let successCount = 0;
    for (let i = 0; i < completedPins.length; i++) {
      const pin = completedPins[i];
      const filename = getFilenameFromURL(pin.url);

      try {
        downloadAllBtn.innerHTML = `<div class="spinner"></div> Adding ${i + 1}/${completedPins.length}...`;

        // Fetch the image as a blob
        const response = await fetch(getPinDownloadUrl(pin)).catch(() => fetch(getPinPublicMediaUrl(pin)));
        const blob = await response.blob();

        // Add to zip with proper filename
        zip.file(`${filename}.png`, blob);
        successCount++;
      } catch (error) {
        console.error(`Failed to fetch ${filename}:`, error);
      }
    }

    if (successCount === 0) {
      throw new Error('Failed to fetch any images');
    }

    // Generate the zip file
    downloadAllBtn.innerHTML = '<div class="spinner"></div> Generating ZIP...';
    const zipBytes = await zip.generateAsync({ type: 'uint8array' });

    // Save the zip file using Electron's save dialog
    downloadAllBtn.innerHTML = '<div class="spinner"></div> Saving...';
    const result = await window.electronAPI.saveZipFile(Array.from(zipBytes));

    if (result.success) {
      alert(`Successfully saved ${successCount} image(s) to:\n${result.filePath}`);
    } else if (result.canceled) {
      // User canceled the save dialog
      return;
    } else {
      throw new Error(result.error || 'Failed to save file');
    }
  } catch (error) {
    console.error('Failed to create zip:', error);
    alert(`Failed to create ZIP file. ${error.message || 'Please try again.'}`);
  } finally {
    downloadAllBtn.disabled = false;
    downloadAllBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" x2="12" y1="15" y2="3"/>
      </svg>
      Download All Images
    `;
  }
}

function cleanSocialText(value) {
  return String(value || '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/—/g, ' - ').trim();
}

function hashtagFromText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .slice(0, 5)
    .map(word => `#${word.charAt(0).toUpperCase()}${word.slice(1)}`);
}

function socialHashtags(pin) {
  const interestTags = (pin.interests || []).map(tag => `#${String(tag).replace(/[^a-zA-Z0-9]/g, '')}`).filter(tag => tag.length > 1);
  return Array.from(new Set([...interestTags, ...hashtagFromText(`${pin.title} ${pin.description}`), '#EasyRecipes', '#RecipeIdeas'])).slice(0, 10);
}

function buildSocialPackFromPin(pin) {
  const title = cleanSocialText(pin.title || pin.sourceTitle || getFilenameFromURL(pin.url));
  const description = cleanSocialText(pin.description || pin.prompt || '');
  const hashtags = socialHashtags(pin);
  const shortDescription = description.length > 220 ? `${description.slice(0, 217).trim()}...` : description;
  return {
    id: `pin-${pin.id}-${Date.now()}`,
    articleId: pin.articleId || '',
    articleTitle: title,
    sourceUrl: pin.url || '',
    campaignStyle: 'pinterest-main-social-repurpose',
    platforms: ['instagram', 'facebook', 'threads', 'reddit', 'pinterest'],
    createdAt: new Date().toISOString(),
    sourcePinId: pin.id,
    content: {
      summary: shortDescription,
      instagram: {
        caption: `${title}\n\n${shortDescription}\n\nSave this idea for later and tap through for the full recipe.`,
        hashtags,
        carouselSlides: [
          { heading: title, body: 'Save-worthy recipe inspiration from the full blog post.' },
          { heading: 'Why It Works', body: shortDescription || 'Simple, visual, and easy to come back to later.' },
          { heading: 'Get The Details', body: 'Open the full post for ingredients, tips, and serving ideas.' }
        ],
        reelScript: {
          hook: title,
          scenes: ['Show the finished dish or final pin image', 'Zoom into the best texture or ingredient detail', 'End with the blog post call to action'],
          voiceover: `${title}. Save this one for your next meal plan, then read the full recipe for the details.`,
          caption: `${title}\n\n${hashtags.slice(0, 6).join(' ')}`,
          cta: 'Read the full recipe on the blog.'
        }
      },
      facebook: {
        pagePost: `${title}\n\n${shortDescription}\n\nWould you make this one? Get the full recipe here: ${pin.url || ''}`.trim(),
        shortPost: `${title}\n\nSave this recipe idea for later. ${pin.url || ''}`.trim(),
        groupPost: `Looking for a recipe idea to save this week? ${title} is worth a look. ${pin.url || ''}`.trim(),
        hashtags: hashtags.slice(0, 4)
      },
      threads: {
        posts: [
          `${title}. Saving this recipe idea for later.`,
          `${title} - this one is made for the meal-plan list.`,
          `${title} ${pin.url || ''}`.trim()
        ]
      },
      reddit: {
        postTitle: `${title} - what would you serve with this?`.slice(0, 180),
        body: [
          `I found this recipe idea and wanted to turn it into something useful for meal planning: ${title}.`,
          shortDescription,
          'What would you add, change, or serve with it?',
          pin.url ? `Full recipe: ${pin.url}` : ''
        ].filter(Boolean).join('\n\n'),
        subredditIdeas: ['r/recipes', 'r/EasyRecipes', 'r/tonightsdinner'],
        commentSeed: 'Ask people for side dish ideas, substitutions, or make-ahead tips.'
      },
      pinterest: {
        title,
        description,
        overlayText: title.split(/\s+/).slice(0, 6).join(' '),
        keywords: hashtags.map(tag => tag.replace('#', '').replace(/([A-Z])/g, ' $1').trim().toLowerCase())
      },
      email: null
    }
  };
}

function renderSocialRepurposePacks() {
  if (!socialRepurposePacks.length) {
    socialRepurposeSection.style.display = 'none';
    if (socialCsvEditorSection) socialCsvEditorSection.style.display = 'none';
    socialRepurposeContainer.innerHTML = '';
    resultsSection.classList.remove('social-mode');
    return;
  }
  resultsSection.classList.add('social-mode');
  socialRepurposeSection.style.display = 'block';
  socialRepurposeContainer.innerHTML = socialRepurposePacks.map((pack) => {
    const packId = safeDomId(pack.id);
    const assets = pack.imageAssets || [];
    const instagram = pack.content?.instagram || {};
    const facebook = pack.content?.facebook || {};
    const threads = pack.content?.threads || {};
    const reddit = pack.content?.reddit || {};
    const pinterest = pack.content?.pinterest || {};
    return `
      <div class="social-pack-card">
        <div class="social-pack-title">${escapeHtml(pack.articleTitle || 'Social pack')}</div>
        <div class="social-assets-grid">
          ${assets.map((asset) => `
            <div class="social-asset">
              <img src="${escapeHtml(safeMediaUrl(asset.fileUrl))}" alt="${escapeHtml(asset.label)}" />
              <div>${escapeHtml(asset.label)}</div>
              <small>${asset.width} x ${asset.height}</small>
            </div>
          `).join('') || '<div class="status-message error">No resized images created for this pin.</div>'}
        </div>
        <div class="social-copy-block">
          <div class="social-copy-header">
            <strong>Instagram Caption</strong>
            <button class="copy-btn" data-copy-social="instagram" data-pack-id="${packId}">Copy</button>
          </div>
          <p>${escapeHtml(instagram.caption || '')}</p>
        </div>
        <div class="social-copy-block">
          <div class="social-copy-header">
            <strong>Facebook Post</strong>
            <button class="copy-btn" data-copy-social="facebook" data-pack-id="${packId}">Copy</button>
          </div>
          <p>${escapeHtml(facebook.pagePost || '')}</p>
        </div>
        <div class="social-copy-block">
          <div class="social-copy-header">
            <strong>Threads</strong>
            <button class="copy-btn" data-copy-social="threads" data-pack-id="${packId}">Copy</button>
          </div>
          <p>${escapeHtml((threads.posts || []).join('\\n'))}</p>
        </div>
        <div class="social-copy-block">
          <div class="social-copy-header">
            <strong>Reddit</strong>
            <button class="copy-btn" data-copy-social="reddit" data-pack-id="${packId}">Copy</button>
          </div>
          <p><strong>Title:</strong> ${escapeHtml(reddit.postTitle || '')}</p>
          <p>${escapeHtml(reddit.body || '')}</p>
          <p><strong>Subreddits:</strong> ${escapeHtml((reddit.subredditIdeas || []).join(', '))}</p>
        </div>
        <div class="social-copy-block">
          <div class="social-copy-header">
            <strong>Pinterest</strong>
            <button class="copy-btn" data-copy-social="pinterest" data-pack-id="${packId}">Copy</button>
          </div>
          <p><strong>Title:</strong> ${escapeHtml(pinterest.title || '')}</p>
          <p>${escapeHtml(pinterest.description || '')}</p>
          <p><strong>Overlay:</strong> ${escapeHtml(pinterest.overlayText || '')}</p>
        </div>
      </div>
    `;
  }).join('');
  socialRepurposeContainer.querySelectorAll('[data-copy-social]').forEach((button) => {
    button.addEventListener('click', () => window.copySocialPackText(button.dataset.packId, button.dataset.copySocial));
  });
  requestAnimationFrame(() => {
    resultsSection.scrollTo({ top: resultsSection.scrollHeight, behavior: 'smooth' });
  });
}

async function handleSocialRepurpose() {
  const completedPins = pins.filter(pin => pin.status === 'completed' && getPinDownloadUrl(pin));
  if (!completedPins.length) {
    alert('Generate Pinterest pins first.');
    return;
  }
  socialRepurposeBtn.disabled = true;
  socialRepurposeBtn.innerHTML = '<div class="spinner"></div> Repurposing...';
  try {
    const packs = completedPins.map(buildSocialPackFromPin);
    const result = await window.electronAPI.createRepurposeImageVariants({
      packs,
      pins: completedPins,
      platforms: ['instagram', 'facebook'],
      imageSource: 'pin'
    });
    if (!result.success) throw new Error(result.error || 'Could not create social images');
    socialRepurposePacks = result.packs || packs;
    await window.electronAPI.saveRepurposePacks?.({ packs: socialRepurposePacks, source: 'pinCreator' });
    await window.electronAPI.openRepurposeStudio?.();
    socialCsvHeaders = [];
    socialCsvRows = [];
    if (socialCsvEditorSection) socialCsvEditorSection.style.display = 'none';
    renderSocialRepurposePacks();
    if (exportSocialPackBtn) exportSocialPackBtn.style.display = 'inline-flex';
    const missing = result.missing?.length ? ` ${result.missing.length} pin image${result.missing.length === 1 ? '' : 's'} could not be matched.` : '';
    showToast(`Created social repurpose pack and opened Repurpose Studio.${missing}`, result.missing?.length ? 'error' : 'success');
  } catch (error) {
    console.error('Social repurpose failed:', error);
    alert(`Could not repurpose pins. ${error.message || ''}`);
  } finally {
    socialRepurposeBtn.disabled = false;
    socialRepurposeBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 2v4"/>
        <path d="M7 2v4"/>
        <path d="M3 10h18"/>
        <path d="M8 14h.01"/>
        <path d="M12 14h.01"/>
        <path d="M16 14h.01"/>
        <rect width="18" height="18" x="3" y="4" rx="2"/>
      </svg>
      Repurpose Social
    `;
  }
}

async function handleExportSocialPack() {
  const ready = await prepareSocialCsvRows();
  if (!ready) return;
  collectSocialCsvEdits();
  exportSocialPackBtn.disabled = true;
  exportEditedSocialCsvBtn.disabled = true;
  exportSocialPackBtn.textContent = 'Saving...';
  try {
    const result = await window.electronAPI.exportRepurposeGhlRows({
      headers: socialCsvHeaders,
      rows: socialCsvRows
    });
    if (result.success) {
      const imageNote = result.missingImageCount ? ` ${result.missingImageCount} row${result.missingImageCount === 1 ? '' : 's'} need an image URL added in GoHighLevel.` : '';
      showToast(`Saved edited GoHighLevel CSV.${imageNote}`, result.missingImageCount ? 'error' : 'success');
    }
    else if (!result.canceled) throw new Error(result.error || 'Export failed');
  } catch (error) {
    alert(`Could not export social pack. ${error.message || ''}`);
  } finally {
    exportSocialPackBtn.disabled = false;
    exportEditedSocialCsvBtn.disabled = false;
    exportSocialPackBtn.textContent = 'Export GHL CSV';
  }
}

// Update prompt
function handlePromptChange(pinId, newPrompt) {
  const pin = pins.find(p => p.id === pinId);
  if (pin) {
    pin.prompt = newPrompt;
  }
}

window.handlePinImageError = function(pinId, imgElement) {
  const numericId = Number(pinId);
  const pin = pins.find(p => p.id === numericId);
  if (!pin || !imgElement) return;
  const current = imgElement.getAttribute('src') || '';
  const fallback = [pin.imgurUrl, pin.remoteImageUrl, pin.localImageUrl, pin.imageUrl].find(url => url && url !== current);
  if (fallback) {
    imgElement.src = fallback;
    return;
  }
  imgElement.classList.add('pin-image-error');
  imgElement.alt = 'Pin image could not be loaded. Try Regenerate Pin.';
};

// Populate CSV editor with pin data
async function populateCSVEditor() {
  await loadBoardSettings();
  // Show all pins, not just ones with titles
  if (pins.length === 0) {
    document.getElementById('csvEditorSection').style.display = 'none';
    return;
  }

  const tableBody = document.getElementById('csvTableBody');
  tableBody.innerHTML = '';

  // Generate publish date slots once
  const publishDateSlots = await generatePublishDateSlots();

  pins.forEach((pin) => {
    ensurePinBoard(pin);
    const row = document.createElement('tr');

    // Remove markdown bold syntax from description (if exists)
    const cleanDescription = String(pin.csvDescription ?? pin.description ?? '').replace(/\*\*(.*?)\*\*/g, '$1');
    const mediaUrl = getPinPublicMediaUrl(pin);
    if (pin.csvKeywords === undefined) pin.csvKeywords = pinterestSeoKeywords(pin);

    // Build publish date dropdown options
    const availableSlots = pin.csvPublishDate && !publishDateSlots.includes(pin.csvPublishDate)
      ? [pin.csvPublishDate, ...publishDateSlots] : publishDateSlots;
    const publishDateOptions = availableSlots.map(slot =>
      `<option value="${escapeHtml(slot)}" ${pin.csvPublishDate === slot ? 'selected' : ''}>${escapeHtml(slot)}</option>`
    ).join('');

    row.innerHTML = `
      <td><input type="text" data-pin-id="${pin.id}" data-field="title" value="${escapeHtml(pin.csvTitle || pin.title || '')}" /></td>
      <td><input type="text" data-pin-id="${pin.id}" data-field="mediaUrl" value="${escapeHtml(mediaUrl)}" placeholder="ImgBB URL (auto-filled)" /></td>
      <td>${boardFieldHtml(pin)}</td>
      <td><input type="text" data-pin-id="${pin.id}" data-field="thumbnail" value="${escapeHtml(pin.csvThumbnail || '')}" placeholder="Optional" /></td>
      <td><textarea data-pin-id="${pin.id}" data-field="description">${escapeHtml(cleanDescription)}</textarea></td>
      <td><input type="text" data-pin-id="${pin.id}" data-field="link" value="${escapeHtml(pin.csvLink ?? pin.url ?? '')}" /></td>
      <td>
        <select data-pin-id="${pin.id}" data-field="publishDate" style="width: 100%; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 6px; padding: 8px 12px; font-size: 13px; color: var(--text-input); cursor: pointer;">
          <option value="">Select date/time...</option>
          ${publishDateOptions}
        </select>
      </td>
      <td><input type="text" data-pin-id="${pin.id}" data-field="keywords" value="${escapeHtml(pin.csvKeywords || '')}" placeholder="e.g., healthy, recipes" /></td>
    `;

    tableBody.appendChild(row);
  });

  // Add event listeners for auto-save
  tableBody.querySelectorAll('input, textarea, select').forEach(element => {
    if (element.tagName === 'SELECT') {
      // Special handling for select elements
      element.addEventListener('change', (e) => {
        const pinId = Number(e.target.dataset.pinId); // Convert string to number
        const field = e.target.dataset.field;


        const pin = pins.find(p => p.id === pinId);


        if (pin) {
          // Store the edited value in the pin object with csv prefix
          const value = field === 'board' ? (exactSavedBoard(e.target.value) || e.target.value) : e.target.value;
          pin[`csv${field.charAt(0).toUpperCase() + field.slice(1)}`] = value;
          if (field === 'board') pin.csvBoardAuto = false;
          savePins();

          // Auto-increment publish dates
          if (field === 'publishDate' && e.target.value) {
            autoIncrementPublishDates(e.target);
          }
        } else {
          console.error('Pin not found for id:', pinId);
        }
      });
    } else {
      // Handle input and textarea
      element.addEventListener('input', (e) => {
        const pinId = Number(e.target.dataset.pinId); // Convert string to number
        const field = e.target.dataset.field;
        const pin = pins.find(p => p.id === pinId);

        if (pin) {
          // Store the edited value in the pin object with csv prefix
          if (field === 'title') pin.title = e.target.value;
          else if (field === 'description') pin.description = e.target.value;
          else if (field === 'mediaUrl') pin.imgurUrl = e.target.value;
          else if (field === 'link') pin.url = e.target.value;
          else {
            pin[`csv${field.charAt(0).toUpperCase() + field.slice(1)}`] = e.target.value;
            if (field === 'board') pin.csvBoardAuto = false;
          }

          savePins();
        }
      });
    }
  });

  // Don't auto-show CSV editor - let user toggle it
  // document.getElementById('csvEditorSection').style.display = 'block';
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

function safeDomId(value) {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function safeLinkUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function safeMediaUrl(value) {
  const text = String(value || '').trim();
  if (/^data:image\//i.test(text) || /^blob:/i.test(text)) return text;
  try {
    const parsed = new URL(text);
    return ['http:', 'https:', 'file:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function parseGhlScheduleDate(value) {
  const text = String(value || '').trim();
  if (!text) return new Date(Date.now() + 30 * 60 * 1000);
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date(Date.now() + 30 * 60 * 1000) : date;
}

function formatGhlScheduleDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`;
}

function formatDateTimeLocalValue(value) {
  const date = parseGhlScheduleDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function collectSocialCsvEdits() {
  if (!socialCsvTableBody) return;
  socialCsvTableBody.querySelectorAll('[data-row][data-col]').forEach((input) => {
    const rowIndex = Number(input.dataset.row);
    const colIndex = Number(input.dataset.col);
    if (!socialCsvRows[rowIndex]) return;
    socialCsvRows[rowIndex][colIndex] = input.value;
  });
}

function renderSocialCsvEditor() {
  if (!socialCsvEditorSection || !socialCsvTableHead || !socialCsvTableBody) return;
  socialCsvEditorSection.style.display = 'block';
  if (socialCsvRowCount) socialCsvRowCount.textContent = `${socialCsvRows.length} row${socialCsvRows.length === 1 ? '' : 's'} ready`;
  if (socialCsvStartTime) socialCsvStartTime.value = formatDateTimeLocalValue(socialCsvRows[0]?.[0]);
  if (socialCsvInterval) socialCsvInterval.value = String(Math.max(1, Number(pinCreatorScheduleSettings.postInterval || 120)));

  socialCsvTableHead.innerHTML = `<tr>${socialCsvHeaders.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`;
  socialCsvTableBody.innerHTML = socialCsvRows.map((row, rowIndex) => {
    const cells = socialCsvHeaders.map((header, colIndex) => {
      const value = row[colIndex] || '';
      const lowerHeader = String(header || '').toLowerCase();
      const field = lowerHeader.includes('content') || lowerHeader.includes('comment')
        ? `<textarea data-row="${rowIndex}" data-col="${colIndex}">${escapeHtml(value)}</textarea>`
        : `<input data-row="${rowIndex}" data-col="${colIndex}" value="${escapeHtml(value)}" />`;
      return `<td>${field}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
}

async function prepareSocialCsvRows(force = false) {
  if (!force && socialCsvHeaders.length && socialCsvRows.length) return true;
  if (!socialRepurposePacks.length) {
    alert('Create a social repurpose pack first.');
    return false;
  }
  editSocialCsvBtn.disabled = true;
  exportSocialPackBtn.disabled = true;
  exportEditedSocialCsvBtn.disabled = true;
  editSocialCsvBtn.textContent = 'Preparing...';
  try {
    const result = await window.electronAPI.prepareRepurposeGhlRows({ packs: socialRepurposePacks });
    if (!result.success) throw new Error(result.error || 'Could not prepare GoHighLevel rows');
    socialCsvHeaders = result.headers || [];
    socialCsvRows = result.rows || [];
    if (!socialCsvRows.length) throw new Error('No rows were created for the current social pack');
    return true;
  } catch (error) {
    alert(`Could not prepare the editable CSV. ${error.message || ''}`);
    return false;
  } finally {
    editSocialCsvBtn.disabled = false;
    exportSocialPackBtn.disabled = false;
    exportEditedSocialCsvBtn.disabled = false;
    editSocialCsvBtn.textContent = 'Edit GHL CSV';
  }
}

async function handleEditSocialCsv() {
  const ready = await prepareSocialCsvRows();
  if (!ready) return;
  renderSocialCsvEditor();
  requestAnimationFrame(() => {
    resultsSection.scrollTo({ top: resultsSection.scrollHeight, behavior: 'smooth' });
  });
}

function applySocialCsvSchedule() {
  collectSocialCsvEdits();
  const minStart = new Date(Date.now() + 30 * 60 * 1000);
  const parsedStart = parseGhlScheduleDate(socialCsvStartTime?.value);
  const start = parsedStart < minStart ? minStart : parsedStart;
  const intervalMinutes = Math.max(1, Number(socialCsvInterval?.value || pinCreatorScheduleSettings.postInterval || 120));
  const intervalMs = intervalMinutes * 60 * 1000;
  socialCsvRows = socialCsvRows.map((row, index) => {
    const updated = [...row];
    updated[0] = formatGhlScheduleDate(new Date(start.getTime() + index * intervalMs));
    return updated;
  });
  pinCreatorScheduleSettings.postInterval = intervalMinutes;
  renderSocialCsvEditor();
  showToast(`Applied ${intervalMinutes}-minute spacing to ${socialCsvRows.length} rows.`);
}

// Generate publish date/time slots based on user settings
async function generatePublishDateSlots() {
  const slots = [];
  const now = new Date();

  await loadBoardSettings();
  const intervalMinutes = Number(pinCreatorScheduleSettings.postInterval || 120);
  const slotMinutes = Math.max(1, intervalMinutes);

  // Round up to next slot (works for any slot minutes)
  const nextSlot = new Date(now);
  nextSlot.setSeconds(0, 0);
  const intervalMs = slotMinutes * 60 * 1000;
  const roundedMs = Math.ceil(nextSlot.getTime() / intervalMs) * intervalMs;
  nextSlot.setTime(roundedMs);

  // Generate slots for 30 days (not capped by pinsPerDay; the daily cap is enforced during auto-increment)
  let currentSlot = new Date(nextSlot);
  const end = new Date(nextSlot);
  end.setDate(end.getDate() + 30);
  while (currentSlot < end) {
    // Format: YYYY-MM-DD HH:MM
    const formatted = `${currentSlot.getFullYear()}-${String(currentSlot.getMonth() + 1).padStart(2, '0')}-${String(currentSlot.getDate()).padStart(2, '0')} ${String(currentSlot.getHours()).padStart(2, '0')}:${String(currentSlot.getMinutes()).padStart(2, '0')}`;
    slots.push(formatted);
    currentSlot = new Date(currentSlot.getTime() + slotMinutes * 60 * 1000);
  }

  return slots;
}

// Auto-increment publish dates based on user's interval setting
async function autoIncrementPublishDates(changedSelect) {

  await loadBoardSettings();
  const intervalMinutes = Number(pinCreatorScheduleSettings.postInterval || 120);
  const pinsPerDay = Number(pinCreatorScheduleSettings.pinsPerDay || 15);


  const tableBody = document.getElementById('csvTableBody');
  if (!tableBody) {
    console.error('csvTableBody not found');
    return;
  }

  const allRows = Array.from(tableBody.querySelectorAll('tr'));

  const changedRow = changedSelect.closest('tr');
  const changedRowIndex = allRows.indexOf(changedRow);


  if (changedRowIndex === -1) {
    console.error('Changed row not found in rows array');
    return;
  }

  const selectedDateTime = changedSelect.value;

  if (!selectedDateTime) {
    console.error('No datetime selected');
    return;
  }

  // Parse the selected date/time
  const [datePart, timePart] = selectedDateTime.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);

  let currentDate = new Date(year, month - 1, day, hours, minutes);
  let currentDay = currentDate.getDate();
  let slotsAddedToday = 1; // Count the current selected slot


  // Update all rows below this one
  for (let i = changedRowIndex + 1; i < allRows.length; i++) {
    // Add interval
    currentDate = new Date(currentDate.getTime() + intervalMinutes * 60 * 1000);

    // Check if we've moved to a new day
    if (currentDate.getDate() !== currentDay) {
      currentDay = currentDate.getDate();
      slotsAddedToday = 0; // Reset counter for new day
    }

    // If we've hit the daily limit, skip to next day at 00:00
    if (slotsAddedToday >= pinsPerDay) {
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
      currentDay = currentDate.getDate();
      slotsAddedToday = 0;
    }

    slotsAddedToday++;

    // Format: YYYY-MM-DD HH:MM
    const formatted = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')} ${String(currentDate.getHours()).padStart(2, '0')}:${String(currentDate.getMinutes()).padStart(2, '0')}`;


    // Find the publish date select in this row
    const selectElement = allRows[i].querySelector('select[data-field="publishDate"]');
    if (selectElement) {
      ensureSelectHasOption(selectElement, formatted);
      selectElement.value = formatted;
      // Update the pin data
      const pinId = Number(selectElement.dataset.pinId); // Convert string to number
      const pin = pins.find(p => p.id === pinId);
      if (pin) {
        pin.csvPublishDate = formatted;
      }
    } else {
      console.error('Select element not found in row', i);
    }
  }


  // Save all changes
  savePins();
}

function ensureSelectHasOption(selectElement, value) {
  if (!selectElement || !value) return;
  const existing = Array.from(selectElement.options).some(opt => opt.value === value);
  if (existing) return;
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = value;
  selectElement.appendChild(opt);
}

const csvFieldIndex = {
  title: 0,
  mediaUrl: 1,
  board: 2,
  thumbnail: 3,
  description: 4,
  link: 5,
  publishDate: 6,
  keywords: 7
};

function csvKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getCsvEditorRecords(tableBody) {
  return Array.from(tableBody.querySelectorAll('tr')).map((row, index) => {
    const fields = Array.from(row.querySelectorAll('input, textarea, select'));
    return {
      row,
      index,
      pinId: Number(fields[0]?.dataset?.pinId || 0),
      fields,
      values: fields.map(field => field.value.trim())
    };
  });
}

function duplicateGroups(records, fieldName) {
  const fieldIndex = csvFieldIndex[fieldName];
  const groups = new Map();
  records.forEach((record) => {
    const key = csvKey(record.values[fieldIndex]);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  return Array.from(groups.values()).filter(group => group.length > 1);
}

function duplicateComboGroups(records) {
  const groups = new Map();
  records.forEach((record) => {
    const key = [
      record.values[csvFieldIndex.title],
      record.values[csvFieldIndex.mediaUrl],
      record.values[csvFieldIndex.link],
      record.values[csvFieldIndex.board]
    ].map(csvKey).join('|');
    if (!key.replace(/\|/g, '')) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  return Array.from(groups.values()).filter(group => group.length > 1);
}

function summarizeDuplicateGroups(label, groups) {
  if (!groups.length) return '';
  const sample = groups
    .slice(0, 3)
    .map(group => `rows ${group.map(record => record.index + 1).join(', ')}`)
    .join('; ');
  return `${label}: ${groups.length} group${groups.length === 1 ? '' : 's'} (${sample})`;
}

function inspectPinterestCsv(records) {
  const missing = [];
  records.forEach((record) => {
    [
      ['Title', csvFieldIndex.title],
      ['Description', csvFieldIndex.description],
      ['Media URL', csvFieldIndex.mediaUrl],
      ['Link', csvFieldIndex.link],
      ['Pinterest Board', csvFieldIndex.board]
    ].forEach(([label, fieldIndex]) => {
      if (!record.values[fieldIndex]) missing.push(`Row ${record.index + 1}: missing ${label}`);
    });
  });

  return {
    missing,
    duplicateLinks: duplicateGroups(records, 'link'),
    duplicateTitles: duplicateGroups(records, 'title'),
    duplicateMedia: duplicateGroups(records, 'mediaUrl'),
    duplicateCombos: duplicateComboGroups(records)
  };
}

function appendPinHash(value, rowNumber) {
  const suffix = `pin-${rowNumber}`;
  try {
    const url = new URL(value);
    const hash = url.hash.replace(/^#/, '');
    url.hash = hash ? `${hash}-${suffix}` : suffix;
    return url.toString();
  } catch {
    const [base, hash = ''] = String(value || '').split('#');
    return `${base}#${hash ? `${hash}-` : ''}${suffix}`;
  }
}

function titleWithIdeaSuffix(title, ideaNumber) {
  const suffix = ` Idea ${ideaNumber}`;
  const maxLength = 100;
  const trimmedTitle = String(title || '').trim();
  if (trimmedTitle.length + suffix.length <= maxLength) return `${trimmedTitle}${suffix}`;
  return `${trimmedTitle.slice(0, maxLength - suffix.length).trim()}${suffix}`;
}

function setCsvRecordValue(record, fieldName, value) {
  const fieldIndex = csvFieldIndex[fieldName];
  const field = record.fields[fieldIndex];
  if (!field) return;
  field.value = value;
  record.values[fieldIndex] = value;

  const pin = pins.find(p => p.id === record.pinId);
  if (!pin) return;
  if (fieldName === 'title') pin.title = value;
  if (fieldName === 'link') pin.url = value;
  if (fieldName === 'board') {
    pin.csvBoard = value;
    pin.csvBoardAuto = true;
  }
}

function autoFixPinterestDuplicates(records, validation) {
  validation.duplicateLinks.forEach((group) => {
    group.forEach((record, index) => {
      if (index === 0) return;
      setCsvRecordValue(record, 'link', appendPinHash(record.values[csvFieldIndex.link], record.index + 1));
    });
  });

  validation.duplicateTitles.forEach((group) => {
    group.forEach((record, index) => {
      if (index === 0) return;
      setCsvRecordValue(record, 'title', titleWithIdeaSuffix(record.values[csvFieldIndex.title], index + 1));
    });
  });

  savePins();
}

function runPinterestDuplicateProtection(records) {
  const validation = inspectPinterestCsv(records);
  if (validation.missing.length) {
    alert(`Pinterest CSV is missing required fields:\n\n${validation.missing.slice(0, 12).join('\n')}${validation.missing.length > 12 ? '\n...' : ''}`);
    return false;
  }

  const duplicateSummaries = [
    summarizeDuplicateGroups('Repeated destination links', validation.duplicateLinks),
    summarizeDuplicateGroups('Repeated titles', validation.duplicateTitles),
    summarizeDuplicateGroups('Repeated media URLs', validation.duplicateMedia),
    summarizeDuplicateGroups('Identical pin rows', validation.duplicateCombos)
  ].filter(Boolean);

  if (!duplicateSummaries.length) return true;

  const shouldAutoFix = confirm(
    `Pinterest Duplicate Protection found possible bulk-upload problems:\n\n${duplicateSummaries.join('\n')}\n\nClick OK to auto-fix repeated links and titles, then export.\nClick Cancel to return to the CSV editor.\n\nNote: repeated Media URLs need different uploaded images if Pinterest rejects them.`
  );
  if (!shouldAutoFix) return false;

  autoFixPinterestDuplicates(records, validation);
  showToast('Duplicate links and titles were made unique before export.', 'success');
  return true;
}

// Show CSV Editor and hide pin cards
function showCSVEditor() {
  localStorage.setItem('pinCreatorActiveView', 'csv');
  populateCSVEditor(); // Refresh data before showing
  csvEditorSection.style.display = 'block';
  resultsSection.style.display = 'none';
  inputSection.classList.add('hidden');
}

// Show pin cards and hide CSV editor
function showPinCards() {
  localStorage.setItem('pinCreatorActiveView', 'cards');
  csvEditorSection.style.display = 'none';
  resultsSection.style.display = 'block';
  inputSection.classList.remove('hidden');
}

// Export CSV for Pinterest bulk upload
async function handleExportCSV() {
  await populateCSVEditor();
  // Get data directly from the CSV editor table
  const tableBody = document.getElementById('csvTableBody');
  const rows = tableBody.querySelectorAll('tr');

  if (rows.length === 0) {
    alert('No data to export. Generate titles and descriptions first.');
    return;
  }

  // CSV headers for Pinterest bulk upload
  const records = getCsvEditorRecords(tableBody);
  savePins();
  if (!runPinterestDuplicateProtection(records)) return;

  const csvRows = records.map(record => {
    const cells = record.fields.map(field => field.value.trim());
    const local = cells[6];
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(local)) {
      const date = new Date(local.replace(' ', 'T') + ':00');
      const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];
      if (parts.every((part, index) => part === Number(local.match(/\d+/g)[index]))) cells[6] = date.toISOString().slice(0, 19);
    }
    return cells;
  });
  try {
    const result = await window.electronAPI.exportPinterestCsv({ rows: csvRows, boardNames });
    if (result.canceled) return;
    if (!result.success) {
      alert((result.validation?.errors || []).map(error => `Row ${error.rowIndex || '?'} "${error.title || ''}" ${error.field}: ${error.message}`).join('\n'));
      return;
    }
    showToast(`Exported ${result.rowCount} pins to CSV.`);
  } catch (error) { alert(error.message || 'Pinterest CSV export failed.'); }
}

// Clear all
function handleClear() {
  pins = [];
  localStorage.removeItem('pins'); // Clear saved pins
  localStorage.removeItem('pinCreatorActiveView');
  urlInput.value = '';
  urlInput.disabled = false;
  loadUrlsBtn.style.display = 'flex';
  generatePromptsBtn.style.display = 'none';
  createTitlesBtn.style.display = 'none';
  createAllBtn.style.display = 'none';
  downloadAllBtn.style.display = 'none';
  socialRepurposeBtn.style.display = 'none';
  viewCSVBtn.style.display = 'none';
  exportCSVBtn.style.display = 'none';
  csvEditorSection.style.display = 'none';
  socialRepurposeSection.style.display = 'none';
  socialCsvEditorSection.style.display = 'none';
  socialRepurposeContainer.innerHTML = '';
  socialRepurposePacks = [];
  socialCsvHeaders = [];
  socialCsvRows = [];
  resultsSection.classList.remove('social-mode');
  resultsSection.style.display = 'block';
  resultsContainer.innerHTML = `
    <div class="empty-state">
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" x2="12" y1="3" y2="15"/>
      </svg>
      <p>Enter URLs above to generate Pinterest pin prompts</p>
    </div>
  `;
  createTitlesBtn.style.display = 'none';
  createAllBtn.style.display = 'none';
  downloadAllBtn.style.display = 'none';
  socialRepurposeBtn.style.display = 'none';
  exportCSVBtn.style.display = 'none';
}

// Render pin card
function renderPin(pin) {
  const card = document.createElement('div');
  card.className = pin.status === 'completed' ? 'pin-card completed' : 'pin-card';
  card.id = `pin-${safeDomId(pin.id)}`;
  card.innerHTML = getPinHTML(pin);

  if (resultsContainer.querySelector('.empty-state')) {
    resultsContainer.innerHTML = '';
  }

  resultsContainer.appendChild(card);

  // Add event listeners
  attachPinEventListeners(pin.id);
}

// Update existing pin card
// Note: savePins() is called separately to reduce I/O during bulk operations
function updatePin(pin, skipSave = false) {
  const card = document.getElementById(`pin-${safeDomId(pin.id)}`);
  if (card) {
    card.className = pin.status === 'completed' ? 'pin-card completed' : 'pin-card';
    card.innerHTML = getPinHTML(pin);
    attachPinEventListeners(pin.id);
  }
  if (!skipSave) {
    savePins();
  }
}

// Minimal update - only updates status indicator without full re-render
// Used during bulk operations to reduce DOM work
function updatePinMinimal(pin) {
  const card = document.getElementById(`pin-${safeDomId(pin.id)}`);
  if (!card) return;

  // Find and update just the status message area
  const statusMsg = card.querySelector('.status-message');
  if (statusMsg && pin.status === 'generating-title') {
    statusMsg.className = 'status-message loading';
    statusMsg.innerHTML = `
      <div class="spinner"></div>
      <span>Generating title & description...</span>
    `;
  }
}

// Attach event listeners to pin card
function attachPinEventListeners(pinId) {
  const safeId = safeDomId(pinId);
  const card = document.getElementById(`pin-${safeId}`);
  if (!card) return;

  card.querySelector(`#copy-url-${safeId}`)?.addEventListener('click', () => window.copyPinUrl(pinId));
  card.querySelector(`#copy-title-${safeId}`)?.addEventListener('click', () => window.copyPinTitle(pinId));
  card.querySelector(`#copy-desc-${safeId}`)?.addEventListener('click', () => window.copyPinDescription(pinId));
  card.querySelector(`#regen-title-${safeId}`)?.addEventListener('click', () => window.createSingleTitle(pinId));
  card.querySelector(`#create-title-${safeId}`)?.addEventListener('click', () => window.createSingleTitle(pinId));
  const pinImage = card.querySelector('.pin-image');
  pinImage?.addEventListener('error', () => window.handlePinImageError(pinId, pinImage));

  const promptTextarea = card.querySelector('.prompt-textarea');
  if (promptTextarea) {
    promptTextarea.addEventListener('input', (e) => {
      handlePromptChange(pinId, e.target.value);
    });
  }

  const createBtn = card.querySelector(`#create-${safeId}`);
  if (createBtn) {
    createBtn.addEventListener('click', () => handleCreateSinglePin(pinId));
  }

  const downloadBtn = card.querySelector(`#download-${safeId}`);
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => handleDownload(pinId));
  }

  const regenerateBtn = card.querySelector(`#regenerate-${safeId}`);
  if (regenerateBtn) {
    regenerateBtn.addEventListener('click', () => handleRegeneratePin(pinId));
  }

  // Copy buttons now use onclick attributes in HTML, no need for event listeners here
}

// Show toast notification
function showToast(message, type = 'success') {
  // Remove any existing toasts
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }

  // Create new toast
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    <span>${escapeHtml(message)}</span>
  `;

  document.body.appendChild(toast);

  // Remove after 2 seconds
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 2000);
}

// Global copy functions for onclick handlers
window.copyPinUrl = async function(pinId) {
  try {
    // Convert to number since onclick passes strings
    const numericId = Number(pinId);
    const pin = pins.find(p => p.id == numericId);

    if (pin?.url) {
      await window.copyToClipboard(pin.url, `copy-url-${pinId}`);
    } else {
      showToast('No URL to copy', 'error');
    }
  } catch (error) {
    console.error('Error in copyPinUrl:', error);
    showToast('Error copying URL', 'error');
  }
};

window.copyPinTitle = async function(pinId) {
  try {
    const numericId = Number(pinId);
    const pin = pins.find(p => p.id == numericId);

    if (pin?.title) {
      await window.copyToClipboard(pin.title, `copy-title-${pinId}`);
    } else {
      showToast('No title to copy', 'error');
    }
  } catch (error) {
    console.error('Error in copyPinTitle:', error);
    showToast('Error copying title', 'error');
  }
};

window.copyPinDescription = async function(pinId) {
  try {
    const numericId = Number(pinId);
    const pin = pins.find(p => p.id == numericId);

    if (pin?.description) {
      const cleanDescription = pin.description.replace(/\*\*(.*?)\*\*/g, '$1');
      await window.copyToClipboard(cleanDescription, `copy-desc-${pinId}`);
    } else {
      showToast('No description to copy', 'error');
    }
  } catch (error) {
    console.error('Error in copyPinDescription:', error);
    showToast('Error copying description', 'error');
  }
};

window.copySocialPackText = async function(packId, platform) {
  const pack = socialRepurposePacks.find(item => item.id === packId);
  if (!pack) {
    showToast('Social pack not found', 'error');
    return;
  }
  const textMap = {
    instagram: pack.content?.instagram?.caption,
    facebook: pack.content?.facebook?.pagePost,
    threads: (pack.content?.threads?.posts || []).join('\n\n'),
    reddit: [
      pack.content?.reddit?.postTitle,
      pack.content?.reddit?.body,
      pack.content?.reddit?.subredditIdeas?.length ? `Subreddit ideas: ${pack.content.reddit.subredditIdeas.join(', ')}` : '',
      pack.content?.reddit?.commentSeed ? `First comment: ${pack.content.reddit.commentSeed}` : ''
    ].filter(Boolean).join('\n\n'),
    pinterest: [
      pack.content?.pinterest?.title,
      pack.content?.pinterest?.description,
      pack.content?.pinterest?.overlayText ? `Overlay: ${pack.content.pinterest.overlayText}` : ''
    ].filter(Boolean).join('\n\n')
  };
  const text = textMap[platform] || '';
  if (!text) {
    showToast('No social copy to copy', 'error');
    return;
  }
  await window.copyToClipboard(text, '');
};

// Create single title and description for a pin
window.createSingleTitle = async function(pinId) {
  const numericId = Number(pinId);
  const pin = pins.find(p => p.id == numericId);
  if (!pin) return;

  // Get the button and show loading state (works for both create and regen buttons)
  const createBtn = document.getElementById(`create-title-${pinId}`);
  const regenBtn = document.getElementById(`regen-title-${pinId}`);
  const activeBtn = createBtn || regenBtn;
  if (activeBtn) {
    activeBtn.disabled = true;
    activeBtn.innerHTML = '<div class="spinner"></div> Regenerating...';
  }
  // Also dim the title/description area to show it's updating
  const card = document.getElementById(`pin-${pinId}`);
  const titleEl = card?.querySelector('.pin-title');
  const descEl = card?.querySelector('.pin-description');
  if (titleEl) titleEl.style.opacity = '0.4';
  if (descEl) descEl.style.opacity = '0.4';

  // Get the latest interests from the input field
  const interestsInput = document.getElementById(`interests-${pin.id}`);
  if (interestsInput) {
    const interestsValue = interestsInput.value.trim();
    pin.interests = interestsValue
      ? interestsValue.split(',').map(i => i.trim()).filter(i => i)
      : [];
  }

  try {
    const result = await window.electronAPI.generateTitleDescription(pin.url, pin.interests, pinStyle.value);

    if (result.success) {
      pin.title = result.title;
      pin.description = result.description;
      ensurePinBoard(pin);
      delete pin.titleError;
      showToast('Title & description created!');
    } else {
      pin.titleError = result.error;
      showToast('Failed: ' + result.error, 'error');
    }
  } catch (error) {
    pin.titleError = error.message;
    showToast('Error: ' + error.message, 'error');
  }

  updatePin(pin);
};

// Copy to clipboard function (make it available globally)
window.copyToClipboard = async function(text, buttonId) {

  if (!text) {
    showToast('Nothing to copy', 'error');
    return;
  }

  try {
    // Use the Clipboard API
    await navigator.clipboard.writeText(text);

    // Show toast notification
    showToast('Copied to clipboard!');

    // Update button visual feedback
    const button = document.getElementById(buttonId);
    if (button) {
      const originalHTML = button.innerHTML;
      button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      setTimeout(() => {
        button.innerHTML = originalHTML;
      }, 1500);
    }
  } catch (err) {
    console.error('Copy failed:', err);
    showToast('Failed to copy', 'error');
  }
};

// Get display name for selected model
function getModelDisplayName() {
  const model = imageModel.value;
  switch (model) {
    case 'ideogram':
      return 'Ideogram';
    case 'seedream':
      return 'SeeDream-4';
    case 'seedream45':
      return 'SeeDream-4.5';
    case 'imagen':
      return 'Google Imagen';
    case 'flux2max':
      return 'Flux 2 Max';
    case 'recraft':
      return 'Recraft v3';
    case 'recraftv4':
      return 'Recraft V4';
    case 'gptimage2low':
      return 'GPT Image 2 (Low)';
    case 'gptimage2med':
      return 'GPT Image 2 (Medium)';
    case 'pruna':
      return 'Pruna AI ($0.01/img)';
    default:
      return 'Ideogram';
  }
}

// Generate HTML for pin card
function getPinHTML(pin) {
  const safeId = safeDomId(pin.id);
  const pinUrlText = escapeHtml(pin.url || '');
  const pinHref = escapeHtml(safeLinkUrl(pin.url));
  const interestsText = escapeHtml(Array.isArray(pin.interests) ? pin.interests.join(', ') : '');
  const promptText = escapeHtml(pin.prompt || '');
  const titleText = escapeHtml(pin.title || '');
  const descriptionHtml = escapeHtml(pin.description || '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  const errorText = escapeHtml(pin.error || 'Unknown error');
  let content = `
    <div class="url-with-copy">
      <a href="${pinHref}" class="pin-url" target="_blank" rel="noopener noreferrer">${pinUrlText}</a>
      <button type="button" id="copy-url-${safeId}" class="copy-btn" title="Copy URL">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
        </svg>
        Copy
      </button>
    </div>
  `;

  if (pin.status === 'loaded') {
    // Show interests input field for loaded pins
    content += `
      <div class="interests-input-container">
        <label class="interests-label">Annotated Interests (Optional)</label>
        <input
          type="text"
          id="interests-${safeId}"
          class="interests-input"
          placeholder="e.g., vegan, healthy, meal prep"
          value="${interestsText}"
        />
      </div>
      <div class="status-message" style="background: var(--input-bg); color: var(--text-secondary); border: 1px solid var(--input-border);">
        <span>Ready to generate prompt</span>
      </div>
    `;
  } else if (pin.status === 'generating-prompt') {
    // Keep interests visible while generating
    content += `
      <div class="interests-input-container">
        <label class="interests-label">Annotated Interests (for titles/descriptions)</label>
        <input
          type="text"
          id="interests-${safeId}"
          class="interests-input"
          placeholder="e.g., vegan, healthy, meal prep"
          value="${interestsText}"
          disabled
        />
      </div>
      <div class="status-message loading">
        <div class="spinner"></div>
        <span>Generating prompt...</span>
      </div>
    `;
  } else if (pin.status === 'error') {
    content += `
      <div class="status-message error">
        <span>Error: ${errorText}</span>
      </div>
    `;
  } else if (pin.status === 'generating-title') {
    // Keep interests editable
    content += `
      <div class="interests-input-container">
        <label class="interests-label">Annotated Interests (for titles/descriptions)</label>
        <input
          type="text"
          id="interests-${safeId}"
          class="interests-input"
          placeholder="e.g., vegan, healthy, meal prep"
          value="${interestsText}"
        />
      </div>
      <div class="prompt-container">
        <label class="prompt-label">Prompt</label>
        <textarea class="prompt-textarea" disabled>${promptText}</textarea>
      </div>
      <div class="status-message loading">
        <div class="spinner"></div>
        <span>Generating title & description...</span>
      </div>
    `;
  } else if (pin.status === 'ready') {
    // Keep interests editable for titles/descriptions
    content += `
      <div class="interests-input-container">
        <label class="interests-label">Annotated Interests (for titles/descriptions)</label>
        <input
          type="text"
          id="interests-${safeId}"
          class="interests-input"
          placeholder="e.g., vegan, healthy, meal prep"
          value="${interestsText}"
        />
      </div>
    `;

    content += `
      <div class="prompt-container">
        <label class="prompt-label">AI-Generated Prompt</label>
        <textarea class="prompt-textarea">${promptText}</textarea>
      </div>
    `;

    // Show title and description if available, or show create button
    if (pin.title && pin.description) {
      content += `
        <div class="title-desc-container">
          <div class="title-with-copy">
            <label class="field-label">Title</label>
            <button type="button" id="copy-title-${safeId}" class="copy-btn" title="Copy Title">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
              Copy
            </button>
          </div>
          <div class="pin-title">${titleText}</div>
          <div class="desc-with-copy">
            <label class="field-label">Description</label>
            <button type="button" id="copy-desc-${safeId}" class="copy-btn" title="Copy Description">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
              Copy
            </button>
          </div>
          <div class="pin-description">${descriptionHtml}</div>
          <button id="regen-title-${safeId}" class="btn btn-secondary btn-sm" style="width: 100%; margin-top: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Regenerate Title & Description
          </button>
        </div>
      `;
    } else {
      // Show button to create title for this pin
      content += `
        <div class="missing-title-container" style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 8px; padding: 12px; margin: 8px 0;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span style="color: #8b5cf6; font-weight: 500;">Missing Title & Description</span>
          </div>
          <button id="create-title-${safeId}" class="btn btn-secondary btn-sm" style="width: 100%;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Create Title & Description
          </button>
        </div>
      `;
    }

    content += `
      <div class="pin-actions">
        <button id="create-${safeId}" class="btn btn-primary btn-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
            <circle cx="9" cy="9" r="2"/>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
          </svg>
          Create Pin
        </button>
      </div>
    `;
  } else if (pin.status === 'generating-image') {
    // Keep interests editable
    content += `
      <div class="interests-input-container">
        <label class="interests-label">Annotated Interests (for titles/descriptions)</label>
        <input
          type="text"
          id="interests-${safeId}"
          class="interests-input"
          placeholder="e.g., vegan, healthy, meal prep"
          value="${interestsText}"
        />
      </div>
      <div class="prompt-container">
        <label class="prompt-label">Prompt</label>
        <textarea class="prompt-textarea" disabled>${promptText}</textarea>
      </div>
      <div class="status-message loading">
        <div class="spinner"></div>
        <span>Generating image with ${getModelDisplayName()}...</span>
      </div>
    `;
  } else if (pin.status === 'completed') {
    const displayUrl = escapeHtml(safeMediaUrl(getPinDisplayUrl(pin)));
    content += `
      <div class="image-container">
        ${displayUrl ? `<img src="${displayUrl}" alt="Generated pin" class="pin-image" />` : '<div class="status-message error">Pin image could not be loaded. Try Regenerate Pin.</div>'}
      </div>
    `;

    // Keep interests editable for titles/descriptions
    content += `
      <div class="interests-input-container">
        <label class="interests-label">Annotated Interests (for titles/descriptions)</label>
        <input
          type="text"
          id="interests-${safeId}"
          class="interests-input"
          placeholder="e.g., vegan, healthy, meal prep"
          value="${interestsText}"
        />
      </div>
    `;

    // Show title and description if available, or show create button
    if (pin.title && pin.description) {
      content += `
        <div class="title-desc-container">
          <div class="title-with-copy">
            <label class="field-label">Title</label>
            <button type="button" id="copy-title-${safeId}" class="copy-btn" title="Copy Title">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
              Copy
            </button>
          </div>
          <div class="pin-title">${titleText}</div>
          <div class="desc-with-copy">
            <label class="field-label">Description</label>
            <button type="button" id="copy-desc-${safeId}" class="copy-btn" title="Copy Description">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
              Copy
            </button>
          </div>
          <div class="pin-description">${descriptionHtml}</div>
          <button id="regen-title-${safeId}" class="btn btn-secondary btn-sm" style="width: 100%; margin-top: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Regenerate Title & Description
          </button>
        </div>
      `;
    } else {
      // Show button to create title for this pin
      content += `
        <div class="missing-title-container" style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 8px; padding: 12px; margin: 8px 0;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span style="color: #8b5cf6; font-weight: 500;">Missing Title & Description</span>
          </div>
          <button id="create-title-${safeId}" class="btn btn-secondary btn-sm" style="width: 100%;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Create Title & Description
          </button>
        </div>
      `;
    }

    content += `
      <div class="prompt-container">
        <label class="prompt-label">Image Prompt (editable)</label>
        <textarea id="prompt-${safeId}" class="prompt-textarea">${promptText}</textarea>
      </div>
      <div class="pin-actions">
        <button id="regenerate-${safeId}" class="btn btn-secondary btn-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
          Regenerate Image
        </button>
        <button id="download-${safeId}" class="btn btn-accent btn-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" x2="12" y1="15" y2="3"/>
          </svg>
          Download Pin
        </button>
      </div>
    `;
  }

  return content;
}
