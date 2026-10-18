const rules = [
  { signal: /\b(?:appetizers?|holiday|potluck|parties|party|baked brie)\b/i, board: /holiday|appetizer|party/i },
  { signal: /\b(?:breakfast|parfaits?|overnight oats|pancakes?)\b/i, board: /breakfast/i },
  { signal: /\b(?:desserts?|cookies?|cakes?|brownies?|cheesecake)\b/i, board: /dessert|baking/i },
  { signal: /\b(?:lunch|salads?|meal prep|meal-prep)\b/i, board: /healthy.*meal prep|meal prep|healthy|salad|lunch/i },
  { signal: /\b(?:weeknight|dinners?|soup|stew|pasta)\b/i, board: /weeknight|dinner/i }
];
export function canonicalBoardMatch(pin = {}, boards = []) { const content = [pin.title, pin.sourceTitle, pin.description].filter(Boolean).join(' '); for (const rule of rules) { if (!rule.signal.test(content)) continue; const board = boards.find((name) => rule.board.test(name)); if (board) return { board, fallback: false }; } return { board: boards.find((name) => /^(?:recipes|easy recipe finds|quick & easy recipes)$/i.test(name)) || boards[0] || '', fallback: true }; }
