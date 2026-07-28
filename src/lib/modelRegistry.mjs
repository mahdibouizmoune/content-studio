// Shared by model selectors and the opt-in model registry screen.
export const TEXT_MODEL_OPTIONS = Object.freeze([
  { id: "gpt5nano", name: "GPT-5 Nano", provider: "OpenAI on Replicate", contentType: "text", cost: "~$0.001/text call", uses: "Fast, low-cost drafting", fallback: "gpt41mini", contextLimit: "Provider managed", ratios: [], verifiedAt: "2026-07-28", enabled: true },
  { id: "gpt5mini", name: "GPT-5 Mini", provider: "OpenAI on Replicate", contentType: "text", cost: "~$0.004/text call", uses: "Long-form quality at moderate cost", fallback: "gpt5nano", contextLimit: "Provider managed", ratios: [], verifiedAt: "2026-07-28", enabled: true },
  { id: "gpt41mini", name: "GPT-4.1 Mini", provider: "OpenAI on Replicate", contentType: "text", cost: "~$0.003/text call", uses: "Reliable instruction following", fallback: "gpt5nano", contextLimit: "Provider managed", ratios: [], verifiedAt: "2026-07-28", enabled: true },
  { id: "chatgpt", name: "GPT-5", provider: "OpenAI on Replicate", contentType: "text", cost: "~$0.015/text call", uses: "Higher-quality editorial work", fallback: "gpt5mini", contextLimit: "Provider managed", ratios: [], verifiedAt: "2026-07-28", enabled: true },
  { id: "claude", name: "Claude 4.5 Sonnet", provider: "Anthropic on Replicate", contentType: "text", cost: "~$0.018/text call", uses: "Long-form structure", fallback: "gpt5mini", contextLimit: "Provider managed", ratios: [], verifiedAt: "2026-07-28", enabled: true },
  { id: "gemini", name: "Gemini 2.5 Flash", provider: "Google on Replicate", contentType: "text", cost: "~$0.005/text call", uses: "Balanced speed and price", fallback: "gpt5nano", contextLimit: "Provider managed", ratios: [], verifiedAt: "2026-07-28", enabled: true },
  { id: "deepseek", name: "DeepSeek V3", provider: "DeepSeek on Replicate", contentType: "text", cost: "~$0.003/text call", uses: "Budget-friendly drafting", fallback: "gpt5nano", contextLimit: "Provider managed", ratios: [], verifiedAt: "2026-07-28", enabled: true },
  { id: "qwen3", name: "Qwen3 Instruct", provider: "Qwen on Replicate", contentType: "text", cost: "~$0.002/text call", uses: "Low-cost instruction following", fallback: "gpt5nano", contextLimit: "Provider managed", ratios: [], verifiedAt: "2026-07-28", enabled: true },
  { id: "llama4scout", name: "Llama 4 Scout", provider: "Meta on Replicate", contentType: "text", cost: "~$0.002/text call", uses: "Low-cost long-context drafting", fallback: "gpt5nano", contextLimit: "Provider managed", ratios: [], verifiedAt: "2026-07-28", enabled: true }
]);

export const IMAGE_MODEL_OPTIONS = Object.freeze([
  { id: "z-image-turbo", name: "Z-Image Turbo", provider: "Pruna on Replicate", contentType: "image", cost: "~$0.003/image", uses: "Fast default food images", fallback: "flux-schnell", contextLimit: "Prompt", ratios: ["1:1", "3:2", "4:3", "4:5", "2:3", "9:16"], verifiedAt: "2026-07-28", enabled: true },
  { id: "flux-schnell", name: "Flux Schnell", provider: "Black Forest Labs on Replicate", contentType: "image", cost: "~$0.003/image", uses: "Very fast drafts", fallback: "z-image-turbo", contextLimit: "Prompt", ratios: ["1:1", "3:2", "4:3", "4:5", "2:3", "9:16"], verifiedAt: "2026-07-28", enabled: true },
  { id: "seedream-4.5", name: "Seedream 4.5", provider: "ByteDance on Replicate", contentType: "image", cost: "~$0.04/image", uses: "Detailed food photography", fallback: "z-image-turbo", contextLimit: "Prompt", ratios: ["1:1", "3:2", "4:3", "4:5", "2:3", "9:16"], verifiedAt: "2026-07-28", enabled: true },
  { id: "qwen-image", name: "Qwen Image", provider: "Qwen on Replicate", contentType: "image", cost: "~$0.02/image", uses: "Text and poster-style images", fallback: "z-image-turbo", contextLimit: "Prompt", ratios: ["1:1", "3:2", "4:3", "4:5", "2:3"], verifiedAt: "2026-07-28", enabled: true },
  { id: "flux-pro-2", name: "Flux 2 Max", provider: "Black Forest Labs on Replicate", contentType: "image", cost: "~$0.04/image", uses: "Premium image quality", fallback: "seedream-4.5", contextLimit: "Prompt", ratios: ["1:1", "3:2", "4:3", "4:5", "2:3", "9:16"], verifiedAt: "2026-07-28", enabled: true },
  { id: "recraft-v4", name: "Recraft V4", provider: "Recraft on Replicate", contentType: "image", cost: "~$0.04/image", uses: "Designed visual assets", fallback: "qwen-image", contextLimit: "Prompt", ratios: ["1:1", "3:2", "4:3", "4:5"], verifiedAt: "2026-07-28", enabled: true },
  { id: "gpt-image-2", name: "GPT Image 2", provider: "OpenAI on Replicate", contentType: "image", cost: "~$0.04/image", uses: "Instruction-heavy edits", fallback: "seedream-4.5", contextLimit: "Prompt", ratios: ["1:1", "3:2", "2:3"], verifiedAt: "2026-07-28", enabled: true },
  { id: "imagen-4-fast", name: "Imagen 4 Fast", provider: "Google on Replicate", contentType: "image", cost: "~$0.02/image", uses: "Fast polished images", fallback: "z-image-turbo", contextLimit: "Prompt", ratios: ["1:1", "3:2", "4:3", "4:5", "9:16"], verifiedAt: "2026-07-28", enabled: true },
  { id: "imagen-4-ultra", name: "Imagen 4 Ultra", provider: "Google on Replicate", contentType: "image", cost: "~$0.06/image", uses: "Highest-quality Imagen option", fallback: "imagen-4-fast", contextLimit: "Prompt", ratios: ["1:1", "3:2", "4:3", "4:5", "9:16"], verifiedAt: "2026-07-28", enabled: true }
]);

export const VIDEO_MODEL_OPTIONS = Object.freeze([
  { id: "pruna-p-video", name: "Pruna P-Video", provider: "Pruna on Replicate", contentType: "video", cost: "720p $0.02/sec, 1080p $0.04/sec", uses: "Fast recipe and social tests", fallback: "seedance-1-lite", durations: ["5", "8", "10", "15", "20"], resolutions: ["720p", "1080p"], fpsOptions: ["24", "48"], supportsDraft: true, supportsFps: true, supportsAspect: true, supportsSeed: true, ratios: ["1:1", "16:9", "9:16"], contextLimit: "20 seconds", verifiedAt: "2026-07-28", enabled: true },
  { id: "seedance-1-lite", name: "Seedance 1 Lite", provider: "ByteDance on Replicate", contentType: "video", cost: "est. ~$0.08 5s 480p, ~$0.18 5s 720p", uses: "Budget food motion", fallback: "pruna-p-video", durations: ["5", "8", "10", "12"], resolutions: ["720p", "480p"], fpsOptions: ["24", "30"], supportsDraft: false, supportsFps: true, supportsAspect: true, supportsSeed: true, ratios: ["1:1", "16:9", "9:16"], contextLimit: "12 seconds", verifiedAt: "2026-07-28", enabled: true },
  { id: "seedance-1-pro-fast", name: "Seedance 1 Pro Fast", provider: "ByteDance on Replicate", contentType: "video", cost: "Faster, lower compute than Pro", uses: "Efficient polished motion", fallback: "seedance-1-lite", durations: ["5", "8", "10", "12"], resolutions: ["480p", "1080p"], fpsOptions: ["24", "30"], supportsDraft: false, supportsFps: true, supportsAspect: true, supportsSeed: true, ratios: ["1:1", "16:9", "9:16"], contextLimit: "12 seconds", verifiedAt: "2026-07-28", enabled: true },
  { id: "seedance-1-pro", name: "Seedance 1 Pro", provider: "ByteDance on Replicate", contentType: "video", cost: "Higher cost than Pro Fast", uses: "Premium hero clips", fallback: "seedance-1-pro-fast", durations: ["5", "8", "10", "12"], resolutions: ["480p", "1080p"], fpsOptions: ["24", "30"], supportsDraft: false, supportsFps: true, supportsAspect: true, supportsSeed: true, ratios: ["1:1", "16:9", "9:16"], contextLimit: "12 seconds", verifiedAt: "2026-07-28", enabled: true },
  { id: "hailuo-02", name: "MiniMax Hailuo 02", provider: "MiniMax on Replicate", contentType: "video", cost: "est. ~$0.45/generation", uses: "Cinematic short clips", fallback: "pruna-p-video", durations: ["6", "10"], resolutions: ["768p", "1080p"], fpsOptions: ["24"], supportsDraft: false, supportsFps: false, supportsAspect: false, supportsSeed: false, ratios: ["model controlled"], contextLimit: "10 seconds", verifiedAt: "2026-07-28", enabled: true }
]);

const MODEL_ENDPOINTS = Object.freeze({
  gpt5nano: "openai/gpt-5-nano",
  gpt5mini: "openai/gpt-5-mini",
  gpt41mini: "openai/gpt-4.1-mini",
  chatgpt: "openai/gpt-5",
  claude: "anthropic/claude-4.5-sonnet",
  gemini: "google/gemini-2.5-flash",
  deepseek: "deepseek-ai/deepseek-v3",
  qwen3: "qwen/qwen3-235b-a22b-instruct-2507",
  llama4scout: "meta/meta-llama-4-scout-instruct",
  "z-image-turbo": "prunaai/z-image-turbo",
  "flux-schnell": "black-forest-labs/flux-schnell",
  "seedream-4.5": "bytedance/seedream-4.5",
  "qwen-image": "qwen/qwen-image",
  "flux-pro-2": "black-forest-labs/flux-2-max",
  "recraft-v4": "recraft-ai/recraft-v4",
  "gpt-image-2": "openai/gpt-image-2",
  "imagen-4-fast": "google/imagen-4-fast",
  "imagen-4-ultra": "google/imagen-4-ultra",
  "pruna-p-video": "prunaai/p-video",
  "seedance-1-lite": "bytedance/seedance-1-lite",
  "seedance-1-pro-fast": "bytedance/seedance-1-pro-fast",
  "seedance-1-pro": "bytedance/seedance-1-pro",
  "hailuo-02": "minimax/hailuo-02"
});

export const MODEL_REGISTRY = Object.freeze([
  ...TEXT_MODEL_OPTIONS,
  ...IMAGE_MODEL_OPTIONS,
  ...VIDEO_MODEL_OPTIONS
].map((model) => ({
  ...model,
  endpoint: `https://replicate.com/${MODEL_ENDPOINTS[model.id]}`
})));

export const textModelCards = TEXT_MODEL_OPTIONS.map((model) => [model.id, model.name, model.uses]);
export const imageModelCards = IMAGE_MODEL_OPTIONS.map((model) => [model.id, model.name, model.cost]);
