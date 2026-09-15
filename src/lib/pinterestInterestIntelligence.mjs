const STOP_WORDS = new Set([
  "a", "an", "and", "are", "best", "by", "for", "from", "how", "in", "is", "of", "on", "or", "recipe", "recipes", "that", "the", "this", "to", "with", "you", "your"
]);

const CORE_TOPICS = [
  ["mocktails", /\b(mocktail|non alcoholic|alcohol free)\b/i],
  ["drinks", /\b(drink|cocktail|lemonade|smoothie|sipper|latte|tea)\b/i],
  ["desserts", /\b(dessert|cake|cookie|brownie|pie|pudding|jell-?o|sweet treat)\b/i],
  ["breakfast", /\b(breakfast|brunch|pancake|waffle|oat|egg)\b/i],
  ["soups and stews", /\b(soup|stew|chili|chowder)\b/i],
  ["salads and bowls", /\b(salad|bowl|poke)\b/i],
  ["pasta", /\b(pasta|spaghetti|lasagna|macaroni|noodle)\b/i],
  ["chicken", /\b(chicken|turkey)\b/i],
  ["beef", /\b(beef|steak|burger|meatball)\b/i],
  ["pork", /\b(pork|bacon|ham|sausage)\b/i],
  ["shrimp", /\b(shrimp|prawn)\b/i],
  ["salmon", /\bsalmon\b/i],
  ["tuna", /\btuna\b/i],
  ["seafood", /\b(seafood|fish|cod|sardine)\b/i],
  ["vegetarian meals", /\b(vegetarian|vegan|meatless|tofu|lentil|chickpea)\b/i],
  ["appetizers", /\b(appetizer|snack|dip|finger food)\b/i],
  ["side dishes", /\b(side dish|sides|potato|vegetable)\b/i]
];

const GOALS = [
  ["high protein", /\b(high protein|protein packed|protein)\b/i],
  ["healthy", /\b(healthy|clean eating|wellness|low calorie|nutritious)\b/i],
  ["quick", /\b(quick|30 minute|20 minute|15 minute|fast|weeknight)\b/i],
  ["meal prep", /\b(meal prep|make ahead|freezer friendly)\b/i],
  ["budget", /\b(budget|cheap|affordable|pantry staple)\b/i],
  ["comfort food", /\b(comfort|cozy|hearty)\b/i],
  ["family friendly", /\b(family|kid friendly|crowd pleasing)\b/i]
];

const METHODS = [
  ["air fryer", /\bair fryer\b/i],
  ["slow cooker", /\b(slow cooker|crockpot|crock pot)\b/i],
  ["one pot", /\b(one pot|one pan)\b/i],
  ["sheet pan", /\bsheet pan\b/i],
  ["skillet", /\bskillet\b/i],
  ["grilled", /\b(grill|grilled|barbecue|bbq)\b/i],
  ["baked", /\b(bake|baked|oven)\b/i],
  ["no bake", /\bno bake\b/i]
];

const OCCASIONS = [
  ["weeknight dinners", /\b(weeknight|dinner|tonight)\b/i],
  ["lunch and meal prep", /\b(lunch|meal prep)\b/i],
  ["parties and gatherings", /\b(party|potluck|game day|gathering|crowd)\b/i],
  ["holiday cooking", /\b(holiday|christmas|thanksgiving|easter|halloween)\b/i],
  ["summer cooking", /\b(summer|picnic|cookout)\b/i],
  ["fall cooking", /\b(fall|autumn)\b/i],
  ["spring cooking", /\bspring\b/i]
];

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value = "") {
  return String(value || "").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slug(value = "") {
  return normalize(value).replace(/\s+/g, "-").replace(/-+/g, "-");
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function listValues(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return value == null || value === "" ? [] : [value];
}

function tokens(value = "") {
  return normalize(value).split(/\s+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function inputText(input = {}) {
  const recipe = input.sourceSnapshot?.recipe || input.recipe || {};
  return [
    input.generatedTitle,
    input.suggestedTitle,
    input.sourceTitle,
    input.title,
    input.keyword,
    input.targetKeyword,
    input.description,
    input.excerpt,
    input.prompt,
    input.cluster,
    input.board,
    input.csvBoard,
    ...listValues(input.interests),
    recipe.name,
    ...listValues(recipe.ingredients).map((ingredient) => (
      ingredient && typeof ingredient === "object"
        ? [ingredient.amount, ingredient.unit, ingredient.item, ingredient.name].filter(Boolean).join(" ")
        : ingredient
    ))
  ].filter(Boolean).join(" ");
}

function matches(definitions, text) {
  return definitions.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function fallbackCore(text) {
  const useful = tokens(text).filter((token) => !["easy", "ideas", "simple", "ready", "minutes"].includes(token)).slice(0, 3);
  return useful.length ? useful.join(" ") : "recipe ideas";
}

function buildClusterLabel({ core, goals, method, occasion }) {
  const descriptors = unique([
    goals.includes("quick") ? "quick" : "",
    goals.find((goal) => goal !== "quick" && goal !== "family friendly") || "",
    method || "",
    core,
    occasion && !occasion.includes("meal prep") ? occasion : ""
  ]);
  return titleCase(descriptors.join(" ").replace(/\bQuick Weeknight Dinners\b/i, "Quick Weeknight Dinners"));
}

function lifecycleFor(input = {}, options = {}) {
  const evidence = normalize([input.trendSignal, input.evidenceType, input.evidenceLabel, input.publishWindow, input.seasonalTiming].join(" "));
  const current = Number(options.currentEngagement ?? input.currentEngagement ?? input.pinterestEvidence?.outboundClicks ?? 0);
  const previous = Number(options.previousEngagement ?? input.previousEngagement ?? 0);
  const highConfidence = String(input.evidenceConfidence || "").toLowerCase() === "high";
  if (/breakout|new trend|emerging|unseen|new interest/.test(evidence)) {
    return { stage: "emerging", confidence: highConfidence ? "high" : "medium", basis: "Fresh trend evidence" };
  }
  if (/live search|live_search|combined|rising|growing|surging|publish within/.test(evidence)) {
    return { stage: "growing", confidence: highConfidence ? "high" : "medium", basis: "Current search or Pinterest momentum" };
  }
  if (previous > 0 && current >= previous * 1.2) return { stage: "growing", confidence: "high", basis: "Engagement increased at least 20%" };
  if (previous > 0 && current <= previous * 0.75) return { stage: "fading", confidence: "high", basis: "Engagement declined at least 25%" };
  if (/seasonal/.test(evidence)) return { stage: "established", confidence: "medium", basis: "Recurring seasonal use case" };
  return { stage: "established", confidence: current > 0 ? "medium" : "low", basis: current > 0 ? "Existing Pinterest engagement" : "Evergreen inference" };
}

function adjacentLabels(profile) {
  const core = profile.dimensions.core;
  const method = profile.dimensions.method;
  const goals = profile.dimensions.goals;
  const candidates = [
    goals.includes("quick") ? `Meal Prep ${core}` : `Quick Weeknight ${core}`,
    goals.includes("healthy") ? `High Protein ${core}` : `Healthy ${core}`,
    method ? `Beginner ${core}` : `Air Fryer ${core}`,
    `Budget ${core}`,
    `Family Friendly ${core}`
  ];
  return unique(candidates.map(titleCase)).filter((label) => normalize(label) !== normalize(profile.primary.label)).slice(0, 4);
}

export function buildInterestProfile(input = {}, options = {}) {
  const text = inputText(input);
  const normalized = normalize(text);
  const cores = matches(CORE_TOPICS, normalized);
  const goals = matches(GOALS, normalized);
  const methods = matches(METHODS, normalized);
  const occasions = matches(OCCASIONS, normalized);
  const core = cores[0] || fallbackCore(text);
  const method = methods[0] || "";
  const occasion = occasions[0] || (goals.includes("meal prep") ? "lunch and meal prep" : "");
  const label = buildClusterLabel({ core, goals, method, occasion });
  const confidence = Math.min(100, 30 + (cores.length ? 25 : 0) + Math.min(20, goals.length * 10) + (method ? 15 : 0) + (occasion ? 10 : 0));
  const lifecycle = lifecycleFor(input, options);
  const profile = {
    primary: { id: slug(label), label, confidence },
    dimensions: { core, goals: goals.slice(0, 2), method, occasion },
    lifecycle,
    source: "content-studio-use-case-inference"
  };
  profile.adjacent = adjacentLabels(profile);
  profile.relatedTopics = unique([
    label,
    core,
    ...goals.map((goal) => `${goal} ${core}`),
    method ? `${method} ${core}` : "",
    occasion ? `${core} ${occasion}` : "",
    ...profile.adjacent
  ]).map(titleCase).slice(0, 10);
  return profile;
}

export function resolveInterestProfile(input = {}, candidate = input?.interestProfile) {
  const inferred = buildInterestProfile(input);
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return inferred;

  const candidatePrimary = candidate.primary && typeof candidate.primary === "object" ? candidate.primary : {};
  const candidateDimensions = candidate.dimensions && typeof candidate.dimensions === "object" ? candidate.dimensions : {};
  const candidateLifecycle = candidate.lifecycle && typeof candidate.lifecycle === "object" ? candidate.lifecycle : {};
  const label = String(candidatePrimary.label || "").trim() || inferred.primary.label;
  const id = String(candidatePrimary.id || "").trim() || slug(label) || inferred.primary.id;
  const relatedTopics = unique(listValues(candidate.relatedTopics));
  const adjacent = unique(listValues(candidate.adjacent));

  return {
    primary: {
      id,
      label,
      confidence: Math.max(0, Math.min(100, Number(candidatePrimary.confidence ?? inferred.primary.confidence) || 0))
    },
    dimensions: {
      core: String(candidateDimensions.core || "").trim() || inferred.dimensions.core,
      goals: unique(listValues(candidateDimensions.goals)).slice(0, 2).length
        ? unique(listValues(candidateDimensions.goals)).slice(0, 2)
        : inferred.dimensions.goals,
      method: String(candidateDimensions.method || "").trim() || inferred.dimensions.method,
      occasion: String(candidateDimensions.occasion || "").trim() || inferred.dimensions.occasion
    },
    lifecycle: {
      stage: String(candidateLifecycle.stage || "").trim() || inferred.lifecycle.stage,
      confidence: String(candidateLifecycle.confidence || "").trim() || inferred.lifecycle.confidence,
      basis: String(candidateLifecycle.basis || "").trim() || inferred.lifecycle.basis
    },
    adjacent: adjacent.length ? adjacent.slice(0, 6) : inferred.adjacent,
    relatedTopics: relatedTopics.length ? relatedTopics.slice(0, 10) : inferred.relatedTopics,
    source: String(candidate.source || "").trim() || inferred.source
  };
}

export function scoreBoardForInterest(board = "", profile, input = {}) {
  const resolved = resolveInterestProfile(input, profile);
  const boardText = normalize(board);
  const boardTokens = new Set(tokens(boardText));
  const profileTokens = tokens([
    resolved.primary.label,
    resolved.dimensions.core,
    ...resolved.dimensions.goals,
    resolved.dimensions.method,
    resolved.dimensions.occasion
  ].join(" "));
  const overlap = profileTokens.filter((token) => boardTokens.has(token)).length;
  let score = overlap * 14;
  if (boardText.includes(normalize(resolved.dimensions.core))) score += 34;
  for (const goal of resolved.dimensions.goals) if (boardText.includes(normalize(goal))) score += 18;
  if (resolved.dimensions.method && boardText.includes(normalize(resolved.dimensions.method))) score += 22;
  if (resolved.dimensions.occasion && tokens(resolved.dimensions.occasion).some((token) => boardTokens.has(token))) score += 12;
  if (/^(recipe blog|recipes blog|recipe ideas|easy recipes|food ideas|home cooking)$/.test(boardText)) score -= 18;
  const confidence = Math.max(0, Math.min(100, score));
  return {
    board,
    score,
    confidence,
    reason: confidence >= 80 ? "Specific use-case match" : confidence >= 55 ? "Strong topical match" : confidence >= 30 ? "Adjacent topic match" : "Broad fallback"
  };
}

export function rankBoardsByInterest(input = {}, boardNames = []) {
  const profile = resolveInterestProfile(input);
  return (boardNames || [])
    .map((board) => scoreBoardForInterest(board, profile, input))
    .sort((left, right) => right.score - left.score || left.board.localeCompare(right.board));
}

export function interestAlignmentPreflight(input = {}, board = "", profile = null) {
  const resolved = resolveInterestProfile(input, profile);
  const coreTokens = tokens(resolved.dimensions.core);
  const titleText = normalize(input.title || input.generatedTitle || input.suggestedTitle || input.sourceTitle);
  const descriptionText = normalize(input.description || input.excerpt);
  const promptText = normalize(input.prompt || input.sourceSnapshot?.title || input.sourceTitle);
  const boardMatch = scoreBoardForInterest(board, resolved, input);
  const titleAligned = coreTokens.some((token) => titleText.includes(token));
  const descriptionAligned = coreTokens.some((token) => descriptionText.includes(token));
  const promptAligned = !input.prompt || coreTokens.some((token) => promptText.includes(token));
  const publicDestination = /^https?:\/\//i.test(String(input.url || input.wordpressPostUrl || ""));
  const relatedTopicsReady = resolved.relatedTopics.length >= 5;
  const checks = [
    { label: "Title matches use case", ok: titleAligned, weight: 20 },
    { label: "Description reinforces use case", ok: descriptionAligned, weight: 20 },
    { label: "Board confidence", ok: boardMatch.confidence >= 55, weight: 25 },
    { label: "Image prompt matches topic", ok: promptAligned, weight: 15 },
    { label: "Public destination", ok: publicDestination, weight: 10 },
    { label: "Related topics", ok: relatedTopicsReady, weight: 10 }
  ];
  return {
    score: checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0),
    checks,
    issues: checks.filter((check) => !check.ok).map((check) => check.label),
    boardMatch,
    profile: resolved
  };
}

export function diversifyByInterest(items = []) {
  const groups = new Map();
  for (const item of items || []) {
    const profile = resolveInterestProfile(item);
    const key = profile.primary.id || "general";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const queues = [...groups.values()];
  if (queues.length < 2) return [...(items || [])];
  const output = [];
  while (queues.some((queue) => queue.length)) {
    for (const queue of queues) if (queue.length) output.push(queue.shift());
  }
  return output;
}

export function aggregatePinterestClusters(rows = []) {
  const clusters = new Map();
  for (const row of rows || []) {
    const profile = resolveInterestProfile(row);
    const key = profile.primary.id;
    const current = clusters.get(key) || {
      id: key,
      label: profile.primary.label,
      pins: 0,
      impressions: 0,
      pinClicks: 0,
      outboundClicks: 0,
      saves: 0,
      lifecycle: profile.lifecycle
    };
    const metrics = row.metrics || {};
    current.pins += 1;
    current.impressions += Number(metrics.IMPRESSION ?? row.impressions ?? 0);
    current.pinClicks += Number(metrics.PIN_CLICK ?? row.pinClicks ?? 0);
    current.outboundClicks += Number(metrics.OUTBOUND_CLICK ?? row.outboundClicks ?? 0);
    current.saves += Number(metrics.SAVE ?? row.saves ?? 0);
    clusters.set(key, current);
  }
  return [...clusters.values()].map((cluster) => ({
    ...cluster,
    saveRate: cluster.impressions ? cluster.saves / cluster.impressions : 0,
    outboundRate: cluster.impressions ? cluster.outboundClicks / cluster.impressions : 0,
    habitScore: Math.round(cluster.saves * 3 + cluster.outboundClicks * 5 + cluster.pinClicks)
  })).sort((left, right) => right.habitScore - left.habitScore || right.impressions - left.impressions);
}
