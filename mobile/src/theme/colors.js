// Single source of truth for SecretEye colours.
// Used by tailwind.config.js (class names) and by components that need raw
// values (icons, status bar, navigation theme). Keep in sync with admin/.
const colors = {
  bg: "#0B1220",
  surface: "#131C2E",
  surface2: "#1B2638",
  border: "#24324A",
  accent: "#22D3EE",
  "accent-ink": "#04222A",
  text: "#E5E7EB",
  muted: "#94A3B8",
  subtle: "#64748B",
  danger: "#EF4444",
  warn: "#F59E0B",
  ok: "#22C55E",
};

module.exports = { colors };
