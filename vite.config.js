const path = require("node:path");
const react = require("@vitejs/plugin-react");
const { defineConfig } = require("vite");
const { version } = require("./package.json");

module.exports = defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version)
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});
