# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

No build step. Open directly or serve locally:

```bash
open index.html
# or
python3 -m http.server 8080
```

The CDN scripts (D3 v7, topojson-client v3, world-atlas TopoJSON) require network access; using `file://` may cause CORS issues with the map fetch, so the local server is preferred.

## Architecture

Four static files — no framework, no bundler, no backend.

- **`data.js`** — defines the global `COUNTRIES` array (~180 entries). Each entry: `{ name, capital, continent, id, lat, lng, alternates? }`. `id` is the ISO 3166-1 numeric code used to match features in the TopoJSON world map. `alternates` lists accepted variant spellings.
- **`app.js`** — all quiz logic and D3 map rendering. Reads `COUNTRIES` (global from `data.js`). Key areas:
  - *Fuzzy matching*: `normalize()` strips diacritics + punctuation; `levenshtein()` with length-based threshold (1/2/3 edits for short/medium/long answers); `isCorrect()` checks against capital and all alternates.
  - *Map*: `initMap()` builds the SVG once; `renderMap(country)` updates it per question. Country polygons come from world-atlas TopoJSON fetched at init — if the fetch fails, polygons won't render but the capital dot still plots from lat/lng.
  - *Queue*: `state.queue` is a plain array. Wrong answers are re-inserted via `scheduleRepeat()` using `splice()` at `currentIndex + randomInt(2,6)`.
- **`index.html`** — three `.screen` divs (`#setup-screen`, `#quiz-screen`, `#results-screen`); `.hidden` class toggled to switch between them.
- **`style.css`** — two-panel quiz layout: fixed 320px left panel (prev result + question), flex-grow right panel (map). Stacks vertically at ≤700px.

## Data notes

- TopoJSON numeric IDs are strings when read back from D3 features; comparisons use `String(d.id) === String(targetCountry.id)`.
- Small island nations (Nauru, Tuvalu, etc.) may not have polygons in the 50m TopoJSON — the capital dot still appears even without a highlighted country shape.
