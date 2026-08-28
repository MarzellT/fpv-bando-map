# FPV Bando Map — Germany

An interactive map of FPV **bando** (abandoned-building / lost-place) flying spots across Germany,
with a **high-resolution, dynamically-tiled satellite layer**. Built as a proper web app so the
satellite streams real map tiles on demand — something a sandboxed artifact can't do.

Each spot carries what it is, how derelict it is, who to ask, and coordinates you can paste
straight into a maps app.

## Stack

- **[Vite](https://vitejs.dev/)** + **TypeScript** (strict)
- **[MapLibre GL JS](https://maplibre.org/)** — WebGL map, dynamic raster tiles, data-driven styling
- No API keys, no backend. Free, key-less tile sources.

## Run

Needs Node 20+ and npm.

```bash
npm install
npm run dev        # http://localhost:5173
```

Build a static bundle:

```bash
npm run build      # type-checks, then outputs to dist/
npm run preview    # serve the built bundle
```

`dist/` is self-contained static files — host it anywhere (GitHub Pages, Netlify, an S3 bucket…).

## How it works

- **Map base:** Esri Dark Gray Canvas, blended over the app background so the coloured spot
  markers carry the contrast.
- **Satellite base:** Esri World Imagery — sub-metre aerial in built-up areas, tiled and loaded
  on demand as you zoom/pan to z19 (this is the "dynamic" high-res satellite).
- **Place labels** overlay in both modes (Esri Dark Gray Reference / World Boundaries and Places).
- **Spots:** loaded from [`src/data/bandos.json`](src/data/bandos.json) into a GeoJSON source and
  drawn as a data-driven circle layer; click a dot for its detail card, filter by access category,
  and follow the per-spot **Open in Google Maps** link for building-level aerial.
- **Shareable views:** the camera is mirrored into the URL as `#zoom/lat/lng`, so a link points at
  the exact view you were looking at.

All four tile services are public ArcGIS Online endpoints — no API key, no watermark.

Colour encodes **access, not quality**:
green = open to fly · magenta = model-flight club · amber = ask the owner ·
red = standing ruin (no permission route) · indigo = legally restricted.

## Data

`src/data/bandos.json` — an array of `Bando` records (see [`src/types.ts`](src/types.ts)).
Coordinates are from public sources (OpenStreetMap, Wikipedia) and satellite-verified. To add or
edit spots, append to that file and reload — no build step for data.

### Provenance & guardrails

Every pin was located from **public information about the place** (OSM/Wikipedia/heritage records,
creators' own published footage) and confirmed on satellite. Deliberately-hidden spots that could
only be found by profiling a private individual were left out, as were sites adjacent to active
military/intelligence installations and in restricted airspace.

## Attribution

- Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors.
- Imagery © Esri, Maxar, Earthstar Geographics.

## Safety & legality

Entering a derelict building in Germany is normally **Hausfriedensbruch** (trespass) without the
owner's permission; many sites carry asbestos, collapse, and other hazards. Each card names the
most realistic next step — the amber ("ask the owner") sites are where a _yes_ is achievable.
Always check drone/airspace rules before flying.
