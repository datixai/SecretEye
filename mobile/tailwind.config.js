/** @type {import('tailwindcss').Config} */
const { colors } = require("./src/theme/colors");

module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  // The app is always dark; "class" stops NativeWind fighting the browser's scheme.
  darkMode: "class",
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: ["Inter_400Regular"],
        "sans-medium": ["Inter_500Medium"],
        "sans-semibold": ["Inter_600SemiBold"],
        "sans-bold": ["Inter_700Bold"],
      },
    },
  },
  plugins: [],
};
