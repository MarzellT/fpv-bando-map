# FPV Bando Map — Germany

**[Open the map](https://marzellt.github.io/fpv-bando-map/)** · [Atlas & videos](https://marzellt.github.io/fpv-bando-map/atlas/) · [Pilot network](https://marzellt.github.io/fpv-bando-map/netzwerk/)

A Germany-wide FPV spot map with high-resolution satellite tiles, sourced spot dossiers, public flight videos and an interactive pilot network in 2D and 3D.

The map and Bando Atlas now live in this repository. The research snapshot of **3 October 2026** contains **577 map points**, **71 dossiers**, **98 public pilot/channel profiles**, **92 sourced relationships** and **120 distinct spot videos**. Four dossiers remain without coordinates. The 549 original map records retain their coordinates; 39 are linked to Atlas evidence instead of duplicated.

The [nationwide day selection](https://marzellt.github.io/fpv-bando-map/tagesauswahl/) presents the day's 16 new dossiers and distinguishes nine additional map positions from new evidence at existing points. New positions include managed facilities, a small mining relic and a newly documented part of an existing airfield; they are not all abandoned industrial halls. Publication dates do not establish flight dates or current access.

## Explore

- **Main map:** MapLibre raster map and satellite layers, wheel zoom, category filters, spot/pilot search and a searchable list. Selecting a place in “Entfernung ab” sorts the list by straight-line distance; it never moves the map or removes pins. No starting place is selected by default.
- **Atlas (`/atlas/`):** detailed sources, publication dates, video timestamps, confidence, bookmarks and a Leaflet map. Unlocated research remains searchable without invented coordinates.
- **Pilot network (`/netzwerk/`):** interactive 2D/3D views distinguish joint sessions, separate visits to the same place and public references. Links lead to supporting evidence and dossiers.
- **Historical selection (`/auswahl/`):** the dated morning selection from 3 October 2026 remains a snapshot.
- **Day selection (`/tagesauswahl/`):** a separate nationwide snapshot of the day's findings, with timed video links, ordinary Maps links, dated sources and unresolved questions.

Google Maps links open a place search, not a preconfigured route. Main-map views remain shareable as `#zoom/lat/lng`; `?spot=ID` opens a detail card. Atlas dossiers use `/atlas/?spot=ID`.

## Run and verify

Node 22.12+ and npm are required.

```bash
npm ci
npm run dev
npm run check   # format, strict lint/types, data and merge integrity
npm run build
npm test        # Chromium integration tests under /fpv-bando-map/
npm run test:automation # runner tests with a fake model and local Git remote
```

Tests use installed Chromium when available, or Playwright's browser (`npx playwright install chromium`). `CHROMIUM_PATH` can select another executable. Tile and place-search requests are mocked in tests.

Vite builds all five entry pages. Relative asset and navigation paths support GitHub Pages project URLs. CI checks formatting, lint, types, data, browser behavior and the build before deploying `main` to Pages.

## Data and merge rules

- [`src/data/bandos.json`](src/data/bandos.json): the 549 original map records. Source-backed corrections to individual records are documented in [`public/research/weekly-log.md`](public/research/weekly-log.md); research additions are merged separately.
- [`src/atlas/data.json`](src/atlas/data.json): shared structured Atlas dataset for dossiers, the pilot graph and map evidence. Add future sourced Atlas research here.
- [`src/data/atlas-links.json`](src/data/atlas-links.json): reviewed site-identity matches to original record names. No proximity-based deduplication.
- [`src/data/merged.ts`](src/data/merged.ts): combines these inputs at build time without maintaining a second copy of the research.

Existing pins retain their original coordinates. When Atlas coordinates differ, both are attributed in the detail card. New pins use Atlas coordinates with their recorded precision. Linked records and additions use the cyan **Atlas-Belege** category; their original descriptions and categories remain available in the older-record disclosure. A flight video or a historical access label does not establish current permission.

The original categories remain green (open to fly), magenta (club), amber (ask owner), red (ruin), and indigo (restricted) for records without Atlas evidence. They are inherited classifications, not a fresh review of all sites.

See [merge provenance and limitations](docs/atlas-merge.md). Only curated place and public creator information is published. Private work logs and browser caches were not imported. The existing weekly runner now updates the merged dataset; it runs locally, separately from the website.

## Stack and map attribution

Vite + strict TypeScript, MapLibre GL JS for the main map, Leaflet for Atlas, and Canvas/SVG for the network. No backend or map API keys.

Main-map tiles use Esri Dark Gray Canvas, World Imagery and reference labels; Atlas uses OpenStreetMap. Optional place search uses Photon / OpenStreetMap. Attribution is shown in the corresponding views.

Map © Esri, HERE, Garmin, OpenStreetMap contributors. Imagery © Esri, Maxar, Earthstar Geographics. Sources, dates and uncertainty are recorded per dossier; conditions and access can change.

## Weekly local research

The existing systemd timer remains Monday at 09:00 Europe/Berlin. Its service now targets this repository. `scripts/weekly-research.sh --check` checks prerequisites without calling a model. The script uses an isolated worktree, skips a dirty main checkout, limits permitted output files, validates formatting/data/build, and advances main only after a successful push.

The bounded prompt in `automation/weekly-prompt.md` checks at most six public channels and three candidates per run, with a 20-minute model timeout. Logs remain in the user's local state directory; the committed protocol must contain only public evidence. The application itself does not schedule or perform searches.

The runner uses [Codex non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode). The systemd unit files are examples for an already configured local Codex installation; they do not run on GitHub Pages.
