import { MapLibreMap, NavigationControl, ScaleControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import bandosData from './data/bandos.json';
import type { FeatureCollection, Point } from 'geojson';
import type { Bando, Category, CategoryMeta } from './types';

const bandos = bandosData as Bando[];

const CATEGORIES: Record<Category, CategoryMeta> = {
  go: { label: 'Open to fly', color: '#4fd1a5' },
  club: { label: 'Model flight club', color: '#f472b6' },
  ask: { label: 'Ask the owner', color: '#f0b429' },
  hot: { label: 'Standing ruin', color: '#e5484d' },
  zone: { label: 'Restricted', color: '#8c99ff' },
};
const CAT_ORDER: Category[] = ['go', 'club', 'ask', 'hot', 'zone'];

const DARMSTADT = { lat: 49.8728, lon: 8.6512 };
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

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );
}

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
});

function applyFilter(): void {
  if (!map.getLayer('bando-dots')) return;
  map.setFilter('bando-dots', ['in', ['get', 'cat'], ['literal', [...activeCats]]]);
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
  const meta = CATEGORIES[b.cat];
  const km = Math.round(haversineKm(DARMSTADT.lat, DARMSTADT.lon, b.lat, b.lon));
  const coord = `${b.lat.toFixed(5)}, ${b.lon.toFixed(5)}`;
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lon}`;
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  sidebar.innerHTML = `
    <article class="detail">
      <h2>${escapeHtml(b.name)}</h2>
      <p class="town">${escapeHtml(b.town)}</p>
      <p class="cat" style="color:${meta.color};border-color:${meta.color}">${meta.label}</p>
      <div class="kv">
        <span><b>From Darmstadt</b> ~${km} km</span>
        ${b.status ? `<span><b>Status</b> ${escapeHtml(b.status)}</span>` : ''}
      </div>
      <div class="body">${b.body}</div>
      ${b.next ? `<p class="next"><span>Next step</span>${escapeHtml(b.next)}</p>` : ''}
      <p class="coord"><code>${coord}</code>
        <a href="${gmaps}" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a></p>
    </article>`;
  map.flyTo({ center: [b.lon, b.lat], zoom: Math.max(map.getZoom(), 12), speed: 0.9 });
}

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
if (countEl) countEl.textContent = `${bandos.length} spots · OpenStreetMap & Esri imagery`;
