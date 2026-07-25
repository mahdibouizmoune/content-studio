const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "best", "by", "for", "from", "how", "in", "into", "is", "it", "of", "on", "or", "that", "the", "this", "to", "with", "you", "your"
]);

export function normalizeTopic(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function topicTokens(value = "") {
  return normalizeTopic(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function unique(items = []) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

function overlapScore(left = [], right = []) {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  const overlap = left.filter((token) => rightSet.has(token)).length;
  return Math.round((overlap / Math.max(left.length, right.length)) * 100);
}

export function detectCannibalization(title = "", articles = [], options = {}) {
  const threshold = Number(options.threshold || 62);
  const sourceTokens = topicTokens(title);
  const normalizedTitle = normalizeTopic(title);
  return (articles || [])
    .map((article) => {
      const existingTitle = article.generatedTitle || article.title || "";
      const score = normalizedTitle && normalizeTopic(existingTitle) === normalizedTitle
        ? 100
        : overlapScore(sourceTokens, topicTokens(existingTitle));
      return {
        article,
        score,
        reason: score === 100 ? "Exact title match" : "Topic overlap"
      };
    })
    .filter((match) => match.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function buildClusterPlan(seedTopic = "", settings = {}, count = 10) {
  const topic = seedTopic.trim() || "Easy Recipe Ideas";
  const baseTokens = topicTokens(topic);
  const keywordRoot = baseTokens.slice(0, 4).join(" ") || normalizeTopic(topic) || topic;
  const ideas = [
    {
      role: "Pillar",
      title: `${topic}: Complete Guide For Better Meal Planning`,
      intent: "informational",
      angle: "Complete hub article that introduces the topic and links to every support post."
    },
    {
      role: "Support",
      title: `Easy ${topic} For Busy Weeknights`,
      intent: "informational",
      angle: "Practical weeknight version with speed, prep, and simple swaps."
    },
    {
      role: "Support",
      title: `Healthy ${topic} Ideas That Still Feel Comforting`,
      intent: "informational",
      angle: "Health-conscious angle with ingredient swaps and meal prep notes."
    },
    {
      role: "Support",
      title: `Budget Friendly ${topic} With Pantry Staples`,
      intent: "commercial",
      angle: "Cost-saving recipe angle using easy grocery and pantry options."
    },
    {
      role: "Support",
      title: `${topic} Meal Prep Plan For The Week`,
      intent: "informational",
      angle: "Batching, storage, reheating, and make-ahead workflow."
    },
    {
      role: "Support",
      title: `Air Fryer ${topic} Ideas For Fast Dinners`,
      intent: "informational",
      angle: "Appliance-specific post for fast Pinterest and search demand."
    },
    {
      role: "Support",
      title: `One Pan ${topic} Recipes With Easy Cleanup`,
      intent: "informational",
      angle: "Convenience and cleanup angle for families and busy cooks."
    },
    {
      role: "Support",
      title: `${topic} For Parties, Potlucks, And Holidays`,
      intent: "commercial",
      angle: "Occasion-focused post for seasonal and sharing traffic."
    },
    {
      role: "Support",
      title: `Common ${topic} Mistakes And How To Fix Them`,
      intent: "informational",
      angle: "Troubleshooting post that builds authority and internal links."
    },
    {
      role: "Support",
      title: `What To Serve With ${topic}`,
      intent: "informational",
      angle: "Side dishes, sauces, salads, drinks, and dessert pairing post."
    }
  ].slice(0, Math.max(1, Math.min(30, Number(count || 10))));

  const pillarTitle = ideas[0]?.title || topic;
  return ideas.map((item, index) => ({
    id: `cluster-${Date.now()}-${index}`,
    ...item,
    targetKeyword: index === 0 ? keywordRoot : unique([item.title, keywordRoot]).join(", "),
    secondaryKeywords: unique([
      `${keywordRoot} recipes`,
      `easy ${keywordRoot}`,
      `healthy ${keywordRoot}`,
      `quick ${keywordRoot}`,
      "meal prep",
      "weeknight dinner",
      "family dinner"
    ]).join(", "),
    audience: settings.defaultAudience || "Home cooks looking for practical recipe ideas they can save, cook, and share.",
    internalLinkTargets: index === 0 ? ideas.slice(1, 5).map((idea) => idea.title) : [pillarTitle, ...ideas.filter((_, i) => i !== index && i > 0).slice(0, 2).map((idea) => idea.title)],
    pinAngle: index === 0 ? `Save this ${keywordRoot} guide` : item.title.split(" ").slice(0, 8).join(" "),
    notes: [
      item.angle,
      "Include a complete recipe card at the end when relevant, FAQ, storage, reheating, substitutions, and no em dashes in headings.",
      index === 0 ? "Make this the cluster hub and link to support articles." : `Link back to the pillar: ${pillarTitle}`
    ].join("\n")
  }));
}
