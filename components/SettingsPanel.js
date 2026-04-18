// components/SettingsPanel.js
// Provides theme selection data and helpers for the ArchiVox settings UI.
// Consume this module in any frontend component to render the theme picker.

const { COLOR_THEMES, DEFAULT_THEME, resolveTheme } = require('../themes');

/**
 * Returns the list of available themes formatted for a dropdown or tile picker.
 * @returns {Array<{ value: string, label: string, preview: object }>}
 */
function getThemeOptions() {
  return Object.entries(COLOR_THEMES).map(([value, colors]) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
    preview: {
      wall:       colors.wall,
      room:       colors.room,
      background: colors.background
    }
  }));
}

/**
 * Generates an inline SVG swatch showing how the theme looks on a minimal room grid.
 * @param {string} themeName
 * @returns {string} SVG markup string
 */
function buildThemePreviewSVG(themeName) {
  const { colors } = resolveTheme(themeName);
  return `
<svg width="120" height="80" xmlns="http://www.w3.org/2000/svg">
  <rect width="120" height="80" fill="${colors.background}" />
  <rect x="5"  y="5"  width="50" height="35" fill="${colors.room}" stroke="${colors.wall}" stroke-width="2" />
  <rect x="65" y="5"  width="50" height="35" fill="${colors.room}" stroke="${colors.wall}" stroke-width="2" />
  <rect x="5"  y="45" width="110" height="30" fill="${colors.room}" stroke="${colors.wall}" stroke-width="2" />
  <text x="10" y="18" font-size="8" fill="${colors.text}">Bed</text>
  <text x="70" y="18" font-size="8" fill="${colors.text}">Bath</text>
  <text x="10" y="62" font-size="8" fill="${colors.text}">Living</text>
</svg>`.trim();
}

module.exports = {
  getThemeOptions,
  buildThemePreviewSVG,
  DEFAULT_THEME
};
