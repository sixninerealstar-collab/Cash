/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#1e1b4b", light: "#312e81" },
        brand: { purple: "#7c3aed", violet: "#8b5cf6" }
      },
      transitionDuration: { 250: "250ms", 300: "300ms" }
    }
  },
  plugins: []
};
