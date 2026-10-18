module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Segoe UI Variable", "Aptos", "Segoe UI", "ui-sans-serif", "system-ui", "Arial", "sans-serif"]
      },
      colors: {
        ink: "#1d2428",
        paper: "#f6f7f8",
        moss: "#547568",
        accentA: "#12694e",
        accentB: "#21748b",
        sky: "#4f88a8"
      },
      boxShadow: {
        panel: "0 2px 8px rgb(24 34 39 / 0.06)"
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(12px)" },
          to: { opacity: "1", transform: "translateX(0)" }
        }
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out both",
        "slide-in": "slide-in 220ms ease-out both"
      }
    }
  },
  plugins: []
};
