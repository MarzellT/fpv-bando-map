import { MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { atlas, bandos, unmapped } from './data/merged';
import { escapeHtml, renderSpotDetail } from './details';
import { initOriginSearch } from './atlas/origin-search';
import type { Origin } from './atlas/types';
import type { FeatureCollection, Point } from 'geojson';
import type { Category, CategoryMeta } from './types';

// MapLibre derives its worker URL at runtime from `import.meta.url` with a
// filename it computes on the spot:
//
//   const file = url.endsWith('-dev.mjs') ? 'maplibre-gl-worker-dev.mjs' : 'maplibre-gl-worker.mjs'
//
// No bundler can statically follow that, so the worker chunk is never emitted
// and the URL 404s as soon as the app is served from a hashed asset directory.
// Raster tiles are decoded on the main thread and kept working, but GeoJSON
// sources are parsed in the worker — so the basemap rendered fine while every
// spot silently vanished. Hand MapLibre a URL Vite actually emits.
setWorkerUrl(maplibreWorkerUrl);

const CATEGORIES: Record<Category, CategoryMeta> = {
  go: { label: 'Open to fly', color: '#4fd1a5' },
  club: { label: 'Model flight club', color: '#f472b6' },
  ask: { label: 'Ask the owner', color: '#f0b429' },
  hot: { label: 'Standing ruin', color: '#e5484d' },
  zone: { label: 'Restricted', color: '#8c99ff' },
  research: { label: 'Atlas-Belege', color: '#65c7ee' },
};
const CAT_ORDER: Category[] = ['research', 'go', 'club', 'ask', 'hot', 'zone'];

const GERMANY_BOUNDS: [number, number, number, number] = [5.87, 47.27, 15.04, 55.06];

// Free, key-less raster tile sources. All four are Esri's public ArcGIS Online
// services: no API key, and — unlike CARTO's key-less CDN — no watermark.
const esri = (service: string) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`;

const DARK_BASE = esri('Canvas/World_Dark_Gray_Base');
const DARK_REF = esri('Canvas/World_Dark_Gray_Reference');
const ESRI_SAT = esri('World_Imagery');
const ESRI_REF = esri('Reference/World_Boundaries_and_Places');

// Dark Gray Canvas tops out at z16; World Imagery goes to z19 (building level).
const DARK_MAXZOOM = 16;
const SAT_MAXZOOM = 19;

const activeCats = new Set<Category>(CAT_ORDER);
let query = '';
let researchOnly = false;
let origin: Origin | null = null;
let selected: number | undefined;
const pilotNames = new Map(atlas.pilots.map((pilot) => [pilot.id, pilot.name]));

const featureCollection: FeatureCollection<Point, { cat: Category; idx: number }> = {
  type: 'FeatureCollection',
  features: bandos.map((b, i) => ({
    type: 'Feature',
    id: i,
    geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
    properties: { cat: b.cat, idx: i },
  })),
};

const map = new MapLibreMap({
  container: 'map',
  style: {
    version: 8,
    sources: {
      darkbase: {
        type: 'raster',
        tiles: [DARK_BASE],
        tileSize: 256,
        maxzoom: DARK_MAXZOOM,
        attribution: '© Esri · HERE · Garmin · © OpenStreetMap contributors',
      },
      darkref: {
        type: 'raster',
        tiles: [DARK_REF],
        tileSize: 256,
        maxzoom: DARK_MAXZOOM,
      },
      esrisat: {
        type: 'raster',
        tiles: [ESRI_SAT],
        tileSize: 256,
        maxzoom: SAT_MAXZOOM,
        attribution: 'Imagery © Esri · Maxar · Earthstar Geographics',
      },
      esriref: {
        type: 'raster',
        tiles: [ESRI_REF],
        tileSize: 256,
        maxzoom: SAT_MAXZOOM,
      },
    },
    layers: [
      // Esri's "dark" canvas is really a mid-grey. Blending it over the app's
      // own background deepens it to match the chrome and lets the coloured
      // spot markers carry the contrast. Labels stay at full strength.
      { id: 'bg', type: 'background', paint: { 'background-color': '#0e1620' } },
      { id: 'darkbase', type: 'raster', source: 'darkbase', paint: { 'raster-opacity': 0.62 } },
      { id: 'darkref', type: 'raster', source: 'darkref' },
      { id: 'esrisat', type: 'raster', source: 'esrisat', layout: { visibility: 'none' } },
      {
        id: 'esriref',
        type: 'raster',
        source: 'esriref',
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.85 },
      },
    ],
  },
  // Frame the country at construction rather than in a `load` handler. MapLibre
  // applies `bounds` before it starts mirroring the camera into the URL, so the
  // hash a visitor ends up sharing is the framed view — where the spots are —
  // instead of some wider default. A hash already in the URL still wins, so
  // deep links are unaffected.
  bounds: GERMANY_BOUNDS,
  fitBoundsOptions: { padding: 24 },
  minZoom: 4,
  maxZoom: SAT_MAXZOOM,
  // Keeps #zoom/lat/lng in the URL, so a view of a specific site is shareable.
  hash: true,
  scrollZoom: true,
  attributionControl: { compact: true },
});

// MapLibre reports failures through an event rather than throwing; without a
// listener a broken tile source degrades to a silently blank map.
map.on('error', (e) => {
  console.error('[map]', e.error);
});

map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
map.addControl(new ScaleControl({ maxWidth: 130, unit: 'metric' }), 'bottom-left');

map.on('load', () => {
  map.addSource('bandos', { type: 'geojson', data: featureCollection });
  map.addLayer({
    id: 'bando-dots',
    type: 'circle',
    source: 'bandos',
    paint: {
      // At country zoom the whole point of the map is "where are the spots", so
      // keep them clearly readable rather than hairline dots.
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 6, 5.5, 9, 6.5, 12, 8, 16, 11],
      'circle-color': [
        'match',
        ['get', 'cat'],
        'go',
        CATEGORIES.go.color,
        'club',
        CATEGORIES.club.color,
        'ask',
        CATEGORIES.ask.color,
        'hot',
        CATEGORIES.hot.color,
        'zone',
        CATEGORIES.zone.color,
        'research',
        CATEGORIES.research.color,
        '#9aa5b1',
      ],
      // Dark ring keeps overlapping dots separable where spots cluster.
      'circle-stroke-width': 1.4,
      'circle-stroke-color': 'rgba(6,10,16,0.85)',
      'circle-opacity': 1,
    },
  });

  map.on('click', 'bando-dots', (e) => {
    const feature = e.features?.[0];
    if (feature) showDetail((feature.properties as { idx: number }).idx);
  });
  map.on('mouseenter', 'bando-dots', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'bando-dots', () => {
    map.getCanvas().style.cursor = '';
  });
  applyFilter();
  document.querySelectorAll<HTMLButtonElement>('#basetoggle button').forEach((button) => {
    button.disabled = false;
  });
  const requested = new URLSearchParams(location.search).get('spot');
  const index = bandos.findIndex((spot) => spot.id === requested);
  if (index >= 0) showDetail(index);
});

function matchingIndices(): number[] {
  return bandos.flatMap((b, index) => {
    const haystack = [
      b.name,
      b.town,
      b.original?.name,
      b.atlas?.summary,
      ...(b.atlas?.videos.map((video) => pilotNames.get(video.pilotId)) ?? []),
    ]
      .join(' ')
      .toLocaleLowerCase('de');
    return activeCats.has(b.cat) &&
      (!researchOnly || b.atlas) &&
      (!query || haystack.includes(query))
      ? [index]
      : [];
  });
}

function applyFilter(): void {
  if (!map.getLayer('bando-dots')) return;
  map.setFilter('bando-dots', ['in', ['get', 'idx'], ['literal', matchingIndices()]]);
}

function setBase(satellite: boolean): void {
  const show = (id: string, on: boolean) =>
    map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  show('darkbase', !satellite);
  show('darkref', !satellite);
  show('esrisat', satellite);
  show('esriref', satellite);
}

function showDetail(idx: number): void {
  const b = bandos[idx];
  if (!b) return;
  selected = idx;
  renderSidebar();
  document.getElementById('sidebar')?.scrollTo({ top: 0 });
  const url = new URL(location.href);
  url.searchParams.set('spot', b.id);
  history.replaceState(null, '', url);
  map.flyTo({ center: [b.lon, b.lat], zoom: Math.max(map.getZoom(), 12), speed: 0.9 });
}

function kilometers(lat: number, lon: number): number | undefined {
  if (!origin) return undefined;
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat - origin.lat) * rad) / 2) ** 2 +
    Math.cos(origin.lat * rad) *
      Math.cos(lat * rad) *
      Math.sin(((lon - origin.lon) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

function renderSidebar(): void {
  const content = document.getElementById('sidebar-content');
  if (!content) return;
  const b = selected === undefined ? undefined : bandos[selected];
  if (b) {
    content.innerHTML = renderSpotDetail(b, CATEGORIES);
    return;
  }
  const indices = matchingIndices().sort((a, b) => {
    const left = bandos[a],
      right = bandos[b];
    if (!left || !right) return 0;
    return origin
      ? (kilometers(left.lat, left.lon) ?? 0) - (kilometers(right.lat, right.lon) ?? 0)
      : left.name.localeCompare(right.name, 'de');
  });
  content.innerHTML = `<p id="list-count" role="status">${indices.length} Kartenpunkte${origin ? ` · Luftlinie ab ${escapeHtml(origin.name)}` : ''}</p>
    <p class="list-note">${unmapped.length} weitere Spuren ohne Kartenpin im <a href="./atlas/?confidence=open">Atlas</a>. Startpunkt und Entfernungen ändern die Karte nicht.</p>
    <div class="spot-results">${indices
      .map((index) => {
        const spot = bandos[index];
        if (!spot) return '';
        const km = kilometers(spot.lat, spot.lon);
        return `<button type="button" class="spot-result" data-select="${index}" data-id="${escapeHtml(spot.id)}"><span class="result-name"><i style="background:${CATEGORIES[spot.cat].color}"></i>${escapeHtml(spot.name)}</span><small>${escapeHtml(spot.town)}${km === undefined ? '' : ` · ${Math.round(km)} km`}</small>${spot.atlas ? `<small>${spot.atlas.videos.length} Videos · ${escapeHtml(spot.atlas.status.label)}</small>` : ''}</button>`;
      })
      .join('')}</div>`;
}

function returnToList(): void {
  selected = undefined;
  const url = new URL(location.href);
  url.searchParams.delete('spot');
  history.replaceState(null, '', url);
  renderSidebar();
  document.getElementById('sidebar')?.scrollTo({ top: 0 });
}

document.getElementById('sidebar-content')?.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLElement>('[data-select]');
  if (button) showDetail(Number(button.dataset.select));
  if (event.target.closest('#back-to-list')) returnToList();
});

document.getElementById('spot-search')?.addEventListener('input', (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  query = event.target.value.trim().toLocaleLowerCase('de');
  returnToList();
  applyFilter();
});
document.getElementById('research-only')?.addEventListener('change', (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  researchOnly = event.target.checked;
  returnToList();
  applyFilter();
});
const originControl = document.getElementById('origin-control');
if (originControl)
  initOriginSearch(originControl, null, (value) => {
    origin = value;
    renderSidebar();
  });
renderSidebar();

// Dev-only console handle for poking at the map (`__map.getZoom()`, layer state,
// queryRenderedFeatures). `import.meta.env.DEV` is statically false in a
// production build, so this block is dropped from the bundle.
if (import.meta.env.DEV) {
  Object.assign(window, { __map: map, __bandos: bandos });
}

/* ---- filter chips ---- */
const filtersEl = document.getElementById('filters');
if (filtersEl) {
  for (const cat of CAT_ORDER) {
    const count = bandos.filter((b) => b.cat === cat).length;
    if (!count) continue;
    const btn = document.createElement('button');
    btn.className = 'chip active';
    btn.type = 'button';
    btn.setAttribute('aria-pressed', 'true');
    btn.innerHTML = `<span class="dot" style="background:${CATEGORIES[cat].color}"></span>${CATEGORIES[cat].label} <span class="n">${count}</span>`;
    btn.addEventListener('click', () => {
      const on = activeCats.has(cat);
      if (on) activeCats.delete(cat);
      else activeCats.add(cat);
      btn.classList.toggle('active', !on);
      btn.setAttribute('aria-pressed', String(!on));
      applyFilter();
      returnToList();
    });
    filtersEl.appendChild(btn);
  }
}

/* ---- base layer toggle ---- */
document.querySelectorAll<HTMLButtonElement>('#basetoggle button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#basetoggle button').forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    setBase(btn.dataset.base === 'sat');
  });
});

/* ---- header count ---- */
const countEl = document.getElementById('count');
if (countEl)
  countEl.textContent = `${bandos.length} Kartenpunkte · ${atlas.pilots.length} Kanäle · Deutschland`;
