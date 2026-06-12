# ArchiVox User Guide

## Color Themes for Floor Plans

ArchiVox lets you personalize the visual style of generated floor plans by choosing from five built-in color themes. Themes affect the colors of walls, room fills, text labels, and the plan background. The underlying geometry and AutoCAD `.scr` export are not affected.

---

### Available Themes

| Theme | Description |
|-------|-------------|
| **Blueprint** *(default)* | Classic architect's blue on light-blue paper |
| **Modern** | Clean grayscale, white background |
| **Warm Wood** | Warm browns and creams — earthy interior palette |
| **Night Mode** | Dark navy and indigo — easy on the eyes in low light |
| **Nature** | Greens and soft sage — organic, biophilic feel |

---

### How to Select a Theme

#### Via the Settings Panel (UI)

1. Open the **Settings Panel** in the ArchiVox interface.
2. Locate the **Floor Plan Color Theme** section.
3. Choose a theme from the dropdown or click a tile to see an instant preview.
4. The preview swatch updates to show how walls, rooms, and text will look.
5. Generate (or regenerate) your floor plan — the selected theme is applied automatically.

#### Via the API

Pass a `colorTheme` string in your request payload to `generateArchiVoxResponse`:

```js
const { generateArchiVoxResponse } = require('./archivox');

const result = await generateArchiVoxResponse(formData, chatHistory, 'warmwood');
```

Valid values: `blueprint`, `modern`, `warmwood`, `nightmode`, `nature`.

If the value is omitted or unrecognized, the **blueprint** theme is used.

#### Via the Renderer Directly

If you call `generateFloorPlan` from `planweaver.js` yourself, pass the theme as the second argument:

```js
const { generateFloorPlan } = require('./planweaver');

const { svg, script } = generateFloorPlan(layoutData, 'nightmode');
```

---

### Adding Custom Themes

Custom themes are not yet supported through the UI, but developers can add new entries to `themes.js`:

```js
// themes.js
const COLOR_THEMES = {
  // ... existing themes ...
  myTheme: {
    wall:       '#hex',
    room:       '#hex',
    text:       '#hex',
    background: '#hex',
    furniture:  '#hex'   // reserved for future furniture rendering
  }
};
```

After adding a theme, surface it in `components/SettingsPanel.js` by calling `getThemeOptions()` — the new entry appears automatically.

---

### Theme Preview Component

The `components/SettingsPanel.js` module exports two helpers for building a theme picker in any frontend:

```js
const { getThemeOptions, buildThemePreviewSVG } = require('./components/SettingsPanel');

// Array of { value, label, preview } objects — use to render a dropdown or tile grid
const options = getThemeOptions();

// Inline SVG swatch for a given theme (120×80 px)
const svgMarkup = buildThemePreviewSVG('nature');
```
