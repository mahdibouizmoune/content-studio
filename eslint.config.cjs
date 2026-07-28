const js = require("@eslint/js");
const reactHooks = require("eslint-plugin-react-hooks");
const reactRefresh = require("eslint-plugin-react-refresh");

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  localStorage: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Blob: "readonly",
  DOMParser: "readonly",
  FileReader: "readonly",
  FormData: "readonly",
  fetch: "readonly",
  crypto: "readonly",
  structuredClone: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  console: "readonly",
  alert: "readonly",
  confirm: "readonly",
  __APP_VERSION__: "readonly"
};

const nodeGlobals = {
  require: "readonly",
  module: "readonly",
  exports: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  process: "readonly",
  Buffer: "readonly",
  Blob: "readonly",
  console: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  fetch: "readonly",
  FormData: "readonly",
  AbortController: "readonly",
  structuredClone: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly"
};

const sharedRules = {
  ...js.configs.recommended.rules,
  "no-empty": ["error", { allowEmptyCatch: true }],
  "no-control-regex": "off",
  "no-useless-assignment": "off",
  "no-useless-escape": "warn",
  "preserve-caught-error": "off",
  "no-unused-vars": ["warn", {
    args: "after-used",
    argsIgnorePattern: "^_",
    caughtErrors: "none",
    varsIgnorePattern: "^(React)$"
  }]
};

module.exports = [
  {
    ignores: [
      "dist/**",
      "release/**",
      "node_modules/**",
      ".codex-tools/**",
      "electron/pin-creator/vendor/**"
    ]
  },
  {
    files: ["src/**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: browserGlobals
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...sharedRules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": "off"
    }
  },
  {
    files: [
      "electron/**/*.js",
      "scripts/**/*.js",
      "tests/**/*.js",
      "*.config.js",
      "*.config.cjs"
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: nodeGlobals
    },
    rules: sharedRules
  },
  {
    files: ["electron/pin-creator/renderer.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...browserGlobals,
        JSZip: "readonly"
      }
    },
    rules: sharedRules
  }
];
