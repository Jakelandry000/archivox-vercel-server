// themes.js
// Shared color theme definitions for ArchiVox floor plan rendering.

const COLOR_THEMES = {
  blueprint: {
    wall:       '#003366',
    room:       '#cce5ff',
    text:       '#001a33',
    background: '#e6f2ff',
    furniture:  '#0066cc'
  },
  modern: {
    wall:       '#2d2d2d',
    room:       '#f5f5f5',
    text:       '#1a1a1a',
    background: '#ffffff',
    furniture:  '#666666'
  },
  warmwood: {
    wall:       '#5c3d1e',
    room:       '#f9e4c8',
    text:       '#3b1f0a',
    background: '#fff8f0',
    furniture:  '#a0522d'
  },
  nightmode: {
    wall:       '#1a1a2e',
    room:       '#16213e',
    text:       '#e0e0e0',
    background: '#0f0f1a',
    furniture:  '#4a4a8a'
  },
  nature: {
    wall:       '#2d5a27',
    room:       '#d4edda',
    text:       '#1a3a17',
    background: '#f0fff0',
    furniture:  '#6aaa3e'
  }
};

const DEFAULT_THEME = 'blueprint';

/**
 * Resolve a theme by name, falling back to the default.
 * @param {string} [name] - Theme name (case-insensitive).
 * @returns {{ name: string, colors: object }}
 */
function resolveTheme(name) {
  const key = (name || DEFAULT_THEME).toLowerCase();
  const colors = COLOR_THEMES[key] || COLOR_THEMES[DEFAULT_THEME];
  return { name: key in COLOR_THEMES ? key : DEFAULT_THEME, colors };
}

module.exports = {
  COLOR_THEMES,
  DEFAULT_THEME,
  resolveTheme
};
