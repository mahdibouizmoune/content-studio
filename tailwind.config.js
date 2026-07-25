module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Segoe UI Variable", "Aptos", "Segoe UI", "ui-sans-serif", "system-ui", "Arial", "sans-serif"]
      },
      colors: {
        ink: "#1d2428",
        paper: "#f7f7f2",
        moss: "#547568",
        accentA: "#7c3aed",
        accentB: "#8b5cf6",
        sky: "#4f88a8"
      },
      boxShadow: {
        panel: "0 1px 2px rgb(15 23 42 / 0.04), 0 10px 28px rgb(15 23 42 / 0.06)"
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
