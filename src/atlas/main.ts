import { required } from './utils';
import './style.css';
import rawData from './data.json';
import type { Dataset, Origin, Spot } from './types';
import { escape as e, formatDate, distance, icon, loadSaved, persistSaved } from './utils';
import { createSpotMap } from './map';
import { renderNetwork } from './network';
import { initOriginSearch } from './origin-search';
const data = rawData as Dataset;
const params = new URLSearchParams(location.search);
const networkPage = /\/netzwerk(?:\/|\/index\.html)?$/.test(location.pathname);
const rootLink = '../';
const atlasLink = networkPage ? '../atlas/' : './';
const saved = loadSaved();
function initialOrigin(): Origin | null {
  const fallback = data.origins.find((o) => o.id === params.get('origin')) ?? null;
  if (params.get('origin') !== 'custom') return fallback;
  const name = params.get('originName')?.trim();
  const latText = params.get('lat')?.trim();
  const lonText = params.get('lon')?.trim();
  if (!name || !latText || !lonText) return fallback;
  const lat = Number(latText),
    lon = Number(lonText);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180)
    return fallback;
  return { id: 'custom', name: name.slice(0, 200), lat, lon };
}
const state = {
  origin: initialOrigin(),
  query: params.get('q') ?? '',
  radius: Number(params.get('radius') ?? 150),
  type: params.get('type') ?? 'all',
  videoOnly: params.get('video') === '1',
  savedOnly: params.get('saved') === '1',
  confidence: params.get('confidence') ?? 'all',
  sort: params.get('sort') ?? 'distance',
  view: 'spots',
  mobileMap: false,
};
if (![50, 100, 150, 250, 0].includes(state.radius)) state.radius = 150;
const app = required(document.querySelector<HTMLDivElement>('#app'));
const number = new Intl.NumberFormat('de-DE');
const videoCount = new Set(data.spots.flatMap((s) => s.videos.map((v) => v.id))).size;
const confirmedLabel = (spot: Spot) =>
  spot.confidence === 'confirmed'
    ? 'Ort zugeordnet'
    : spot.confidence === 'likely'
      ? 'Wahrscheinlicher Ort'
      : 'Offene Spur';
app.innerHTML = `
<header class="site-header"><a href="${networkPage ? `${atlasLink}#spots` : '#spots'}" class="brand" aria-label="Bando Atlas Startseite"><span class="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m16 3 11 25-11-6-11 6Z" fill="currentColor"/><circle cx="16" cy="16" r="2.5" fill="#ed6039"/></svg></span><span>BANDO<span class="brand-light">ATLAS</span><small>FPV FIELD NOTES</small></span></a><nav aria-label="Hauptnavigation"><a href="${rootLink}">Hauptkarte</a><a href="${networkPage ? `${atlasLink}#spots` : '#spots'}" data-nav="spots">Spots entdecken</a><a href="${rootLink}netzwerk/" data-nav="piloten">Netzwerk</a><a href="#recherche" data-nav="recherche">Die Recherche</a><a href="${rootLink}auswahl/">Auswahl 03.10.2026</a></nav><button id="saved-toggle" class="save-nav" aria-pressed="${state.savedOnly}">${icon('bookmark')}<span>Merkliste</span><b id="saved-count">${saved.size}</b></button></header>
<main id="main">
  <section id="spots-view" class="view">
    <div class="intro"><div><p class="eyebrow"><span class="live-dot"></span> EIN ATLAS FÜR DEINE NÄCHSTE SESSION</p><h1>Neue Orte.<br><span>Andere Perspektiven.</span></h1><p class="intro-copy">Industrie, Ruinen und die Piloten, die dort fliegen.<br> Recherchierte Spots in ganz Deutschland.</p></div><div class="intro-aside"><div class="compass-decoration" aria-hidden="true"><span>N</span><svg viewBox="0 0 130 130"><circle cx="65" cy="65" r="51"/><circle cx="65" cy="65" r="38" stroke-dasharray="1 7"/><path d="M65 1v28m0 72v28M1 65h28m72 0h28M29 29l9 9m54 54 9 9M29 101l9-9m54-54 9-9"/><path class="compass-needle" d="m65 26 12 39-12 39-12-39Z"/><path class="compass-fill" d="m65 26 12 39H53Z"/></svg></div><div class="stats"><div><strong>${data.spots.length}</strong><span>Spots</span></div><div><strong>${videoCount}</strong><span>Videos</span></div><div><strong>${data.pilots.length}</strong><span>Kanäle</span></div></div><p class="edition">AUSGABE 01 <span>·</span> STAND ${formatDate(data.checkedAt)}</p></div></div>
    <div class="filter-bar"><div id="origin-control" class="origin-control"></div><label class="search-field">${icon('search')}<input id="search" type="search" placeholder="Spot, Ort oder Pilot suchen …" aria-label="Spots durchsuchen" value="${e(state.query)}"/></label></div>
    <div class="filter-options"><label>Umkreis (Liste) <select id="radius"><option value="50">50 km</option><option value="100">100 km</option><option value="150">150 km</option><option value="250">250 km</option><option value="0">Deutschlandweit</option></select></label><label>Typ <select id="type"><option value="all">Alle Orte</option>${[
      ...new Set(data.spots.map((s) => s.type)),
    ]
      .sort()
      .map((t) => `<option value="${e(t)}">${e(t)}</option>`)
      .join(
        '',
      )}</select></label><label>Zuordnung <select id="confidence"><option value="all">Alle Belege</option><option value="confirmed">Ort zugeordnet</option><option value="likely">Wahrscheinlicher Ort</option><option value="open">Offene Spuren</option></select></label><label class="check-label"><input type="checkbox" id="video-only" ${state.videoOnly ? 'checked' : ''}>${icon('play')}Mit Flugvideo</label><button id="reset-filters" class="reset-button">${icon('reset')}Zurücksetzen</button></div>
    <div class="results-top"><p id="result-count" role="status" aria-live="polite"></p><div class="result-actions"><div class="mobile-view-toggle" role="group" aria-label="Ansicht"><button data-layout="list" aria-pressed="true">${icon('list')}Liste</button><button data-layout="map" aria-pressed="false">${icon('map')}Karte</button></div><label class="sort-label">Sortierung <select id="sort"><option value="distance">Nächste zuerst</option><option value="evidence">Neuester Beleg</option><option value="videos">Meiste Videos</option><option value="name">Name A–Z</option></select></label></div></div>
    <div class="explorer"><div id="spot-list" class="spot-list"></div><aside class="map-panel" aria-label="Spotkarte"><div class="map-topline"><span>${icon('map')}SPOTKARTE</span><button id="map-reset" title="Alle Kartenpins anzeigen" aria-label="Kartenansicht zurücksetzen">${icon('crosshair')}</button></div><div id="spot-map" aria-label="Interaktive Karte mit recherchierten Spots"></div><div class="map-bottom"><span><i class="legend-dot"></i> Recherchierter Spot</span><small id="map-count"></small></div><div class="map-note">${icon('info')}<p>Die Karte zeigt Spots unabhängig von Startpunkt und Umkreis. Suche und weitere Filter gelten für Liste und Karte.</p></div></aside></div>
  </section>
  <section id="piloten-view" class="view" hidden></section>
  <section id="recherche-view" class="view" hidden></section>
</main>
<footer class="site-footer"><a class="footer-brand" href="${atlasLink}#spots">BANDO ATLAS <span>↗</span></a><p>Öffentliche Quellen. Echte Flugvideos. Neue Perspektiven.</p><a href="#recherche">Stand & Quellen ${icon('arrow')}</a></footer>
<dialog id="spot-dialog" class="spot-dialog" aria-labelledby="spot-title"><div id="spot-detail"></div></dialog><div id="toast" class="toast" role="status" aria-live="polite"></div>`;
const spotNumbers = new Map(data.spots.map((spot, index) => [spot.id, index + 1]));
const map = createSpotMap(
  required(document.querySelector<HTMLElement>('#spot-map')),
  openSpot,
  spotNumbers,
);
const dialog = required(document.querySelector<HTMLDialogElement>('#spot-dialog'));
let returnFocus: HTMLElement | null = null;
let focusedSpot = '';
const pilotById = new Map(data.pilots.map((p) => [p.id, p]));
let filtered: Spot[] = [];
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string) {
  const el = required(document.querySelector<HTMLElement>('#toast'));
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 2600);
}
function syncUrl() {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({
    origin: state.origin?.id ?? '',
    originName: state.origin?.id === 'custom' ? state.origin.name : '',
    lat: state.origin?.id === 'custom' ? String(state.origin.lat) : '',
    lon: state.origin?.id === 'custom' ? String(state.origin.lon) : '',
    q: state.query,
    radius: state.radius === 150 ? '' : String(state.radius),
    type: state.type === 'all' ? '' : state.type,
    confidence: state.confidence === 'all' ? '' : state.confidence,
    video: state.videoOnly ? '1' : '',
    saved: state.savedOnly ? '1' : '',
    sort: state.sort === 'distance' ? '' : state.sort,
  })) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  history.replaceState(null, '', url);
}
function thumb(spot: Spot, large = false): string {
  const video = spot.videos[0];
  return video
    ? `<img src="https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/${large ? 'hqdefault' : 'mqdefault'}.jpg" alt="Videovorschau: ${e(spot.name)}" loading="lazy" referrerpolicy="no-referrer"/><span class="thumbnail-play">${icon('play')}</span>`
    : `<div class="photo-placeholder">${icon('building')}<span>${e(spot.type)}</span><small>QUELLEN & ORTSDOKUMENTATION</small></div>`;
}
function bookmarkButton(spot: Spot) {
  const isSaved = saved.has(spot.id);
  return `<button class="bookmark-button ${isSaved ? 'is-saved' : ''}" data-save="${e(spot.id)}" aria-pressed="${isSaved}" aria-label="${e(spot.name)} ${isSaved ? 'aus Merkliste entfernen' : 'merken'}">${icon('bookmark')}</button>`;
}
function refresh() {
  const q = state.query.toLocaleLowerCase('de');
  const matchingSpots = data.spots.filter((spot) => {
    const haystack = [
      spot.name,
      spot.city,
      spot.region,
      spot.type,
      spot.summary,
      ...spot.features,
      ...spot.videos.map((v) => pilotById.get(v.pilotId)?.name ?? ''),
    ]
      .join(' ')
      .toLocaleLowerCase('de');
    return (
      (!q || haystack.includes(q)) &&
      (state.type === 'all' || spot.type === state.type) &&
      (state.confidence === 'all' || spot.confidence === state.confidence) &&
      (!state.videoOnly || spot.videos.length > 0) &&
      (!state.savedOnly || saved.has(spot.id))
    );
  });
  filtered = matchingSpots
    .filter(
      (spot) => !state.origin || !state.radius || distance(state.origin, spot) <= state.radius,
    )
    .sort((a, b) =>
      state.sort === 'name'
        ? a.name.localeCompare(b.name, 'de')
        : state.sort === 'videos'
          ? b.videos.length - a.videos.length ||
            (state.origin
              ? distance(state.origin, a) - distance(state.origin, b)
              : a.name.localeCompare(b.name, 'de'))
          : state.sort === 'evidence'
            ? (b.status.lastEvidence ?? '').localeCompare(a.status.lastEvidence ?? '')
            : state.origin
              ? distance(state.origin, a) - distance(state.origin, b)
              : a.name.localeCompare(b.name, 'de'),
    );
  required(document.querySelector('#result-count')).innerHTML =
    `<strong>${filtered.length} ${filtered.length === 1 ? 'Spot' : 'Spots'}${state.savedOnly ? ' auf deiner Merkliste' : ' für dich'}</strong><span>${state.origin ? `Entfernung als Luftlinie ab ${e(state.origin.name)}` : 'Alle Orte · ohne Entfernungsfilter'}</span>`;
  required(document.querySelector('#spot-list')).innerHTML = filtered.length
    ? filtered
        .map(
          (spot) =>
            `<article class="spot-card" data-card="${e(spot.id)}"><button class="card-image" data-open="${e(spot.id)}" aria-label="${e(spot.name)} ansehen">${thumb(spot)}<span class="card-index">${String(spotNumbers.get(spot.id)).padStart(2, '0')}</span>${spot.videos.length ? `<span class="video-count">${icon('play')}${spot.videos.length} ${spot.videos.length === 1 ? 'Video' : 'Videos'}</span>` : ''}</button><div class="card-body"><div class="card-meta"><span>${e(spot.type)} <span>·</span> ${e(spot.region)}</span>${bookmarkButton(spot)}</div><h2><button data-open="${e(spot.id)}">${e(spot.name)}</button></h2><p class="card-summary">${e(spot.summary)}</p><p class="card-status ${spot.status.tone}">${icon('info')}${e(spot.status.label)}</p><div class="card-bottom">${state.origin ? `<span class="distance">${icon('pin')}${Number.isFinite(distance(state.origin, spot)) ? `${number.format(Math.round(distance(state.origin, spot)))} km` : 'Ort offen'}</span>` : ''}<span class="evidence-badge ${spot.confidence}"><i></i>${confirmedLabel(spot)}</span><button class="card-arrow" data-open="${e(spot.id)}" aria-label="Details zu ${e(spot.name)}">${icon('arrow')}</button></div></div></article>`,
        )
        .join('')
    : `<div class="empty-state">${icon(state.savedOnly ? 'bookmark' : 'search')}<h2>${state.savedOnly ? 'Hier ist noch Platz für neue Orte.' : 'Für diese Auswahl gibt es noch keinen Spot.'}</h2><p>${state.savedOnly ? 'Merke einen Spot über das Lesezeichen. Deine Auswahl bleibt in diesem Browser gespeichert.' : 'Vergrößere den Umkreis oder setze die Filter zurück.'}</p><button class="primary-button" id="empty-reset">Alle Spots entdecken ${icon('arrow')}</button></div>`;
  required(document.querySelector('#saved-count')).textContent = String(saved.size);
  required(document.querySelector('#saved-toggle')).setAttribute(
    'aria-pressed',
    String(state.savedOnly),
  );
  required(document.querySelector('#map-count')).textContent =
    `${matchingSpots.filter((s) => s.lat !== null && s.lon !== null && s.confidence !== 'open').length} Pins`;
  map.refresh(matchingSpots);
  syncControls();
  syncUrl();
}
function resetFilters() {
  Object.assign(state, {
    query: '',
    radius: 150,
    type: 'all',
    videoOnly: false,
    confidence: 'all',
    savedOnly: false,
    sort: 'distance',
  });
  required(document.querySelector<HTMLInputElement>('#search')).value = '';
  required(document.querySelector<HTMLInputElement>('#video-only')).checked = false;
  syncControls();
  refresh();
}
function syncControls() {
  for (const key of ['radius', 'type', 'confidence', 'sort'] as const)
    required(document.querySelector<HTMLSelectElement>(`#${key}`)).value = String(state[key]);
  const radius = required(document.querySelector<HTMLSelectElement>('#radius'));
  radius.disabled = !state.origin;
  radius.title = state.origin ? 'Umkreis für die Liste' : 'Zuerst einen Ort auswählen';
  if (!state.origin) radius.value = '0';
  required(document.querySelector<HTMLOptionElement>('#sort option[value="distance"]')).disabled =
    !state.origin;
  if (!state.origin && state.sort === 'distance')
    required(document.querySelector<HTMLSelectElement>('#sort')).value = 'name';
}
syncControls();
function saveSpot(id: string) {
  if (saved.has(id)) saved.delete(id);
  else saved.add(id);
  persistSaved(saved);
  refresh();
  const spot = data.spots.find((s) => s.id === id);
  if (spot && dialog.open)
    required(document.querySelector('#detail-bookmark')).innerHTML = bookmarkButton(spot);
  toast(
    saved.has(id) ? 'Spot auf deiner Merkliste gespeichert.' : 'Spot aus der Merkliste entfernt.',
  );
}
function closeSpot() {
  dialog.close();
}
dialog.addEventListener('close', () => {
  document.body.classList.remove('dialog-open');
  required(document.querySelector('#spot-detail')).innerHTML = '';
  const url = new URL(location.href);
  url.searchParams.delete('spot');
  history.replaceState(null, '', url);
  if (returnFocus?.isConnected) returnFocus.focus();
  else document.querySelector<HTMLButtonElement>(`[data-open="${focusedSpot}"]`)?.focus();
});
dialog.addEventListener('click', (event) => {
  if (event.target === dialog && event.clientX < dialog.getBoundingClientRect().left) closeSpot();
});
function openSpot(id: string) {
  const spot = data.spots.find((s) => s.id === id);
  if (!spot) return;
  returnFocus = document.activeElement as HTMLElement;
  focusedSpot = id;
  const url = new URL(location.href);
  url.searchParams.set('spot', spot.id);
  history.replaceState(null, '', url);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lon}`;
  required(document.querySelector('#spot-detail')).innerHTML =
    `<div class="dialog-top"><span class="mini-label">SPOT DOSSIER / ${e(spot.city)}</span><button id="close-dialog" class="icon-button" aria-label="Spotdetails schließen">${icon('close')}</button></div><div class="detail-image">${thumb(spot, true)}<span class="detail-image-caption">${spot.videos[0] ? `Videovorschau · ${e(pilotById.get(spot.videos[0].pilotId)?.name ?? '')}` : 'Ortsdokumentation verlinkt'}</span></div><div class="detail-content"><div class="detail-kicker"><span class="eyebrow">${e(spot.type)} / ${e(spot.region)}</span><span id="detail-bookmark">${bookmarkButton(spot)}</span></div><h2 id="spot-title">${e(spot.name)}</h2><p class="detail-summary">${e(spot.summary)}</p><div class="features">${spot.features.map((f) => `<span>${e(f)}</span>`).join('')}</div><div class="detail-actions">${spot.lat !== null && spot.lon !== null ? `<a class="primary-button" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">${icon('pin')}Auf Google Maps öffnen ${icon('external')}</a>` : ''}<button class="secondary-button" id="share-spot">${icon('link')}Link kopieren</button></div><p class="coordinate-note">${spot.lat !== null && spot.lon !== null ? `${e(spot.lat.toFixed(5))}° N · ${e(spot.lon.toFixed(5))}° E${spot.coordinatePrecision === 'approximate' ? ' · ungefähre Position' : ''}` : 'Noch keine belastbare Kartenposition'}</p><section class="status-box ${spot.status.tone}"><div><span class="status-dot"></span><strong>${e(spot.status.label)}</strong></div><p>${e(spot.status.note)}</p><small>Letzter erfasster Beleg: ${formatDate(spot.status.lastEvidence)}</small></section><section class="detail-section"><div class="section-line"><h3>Die Flugvideos</h3><span>${spot.videos.length}</span></div>${spot.videos.length ? spot.videos.map((v) => `<article class="video-entry"><button class="video-thumb" data-play="${e(v.id)}" data-time="${v.timestampSeconds || 0}" aria-label="${e(v.title)} hier abspielen"><img src="https://i.ytimg.com/vi/${e(v.id)}/mqdefault.jpg" alt="" loading="lazy"/>${icon('play')}</button><div><h4>${e(v.title)}</h4><p>${e(pilotById.get(v.pilotId)?.name ?? v.pilotId)} · ${formatDate(v.publishedAt)}</p><span class="match-label">${v.match === 'named' ? 'Ort im Video benannt' : v.match === 'visual' ? 'Visuell abgeglichen' : 'Zuordnung wahrscheinlich'}</span><a href="https://www.youtube.com/watch?v=${e(v.id)}${v.timestampSeconds ? `&t=${v.timestampSeconds}s` : ''}" target="_blank" rel="noopener noreferrer">Auf YouTube ansehen ${icon('external')}</a></div><div class="video-player" id="player-${e(v.id)}"></div>${v.note ? `<p class="video-note">${e(v.note)}</p>` : ''}</article>`).join('') : '<p class="muted">Bisher kein eindeutig zugeordnetes Flugvideo. Dieser Ort ist über die unten verlinkten Quellen dokumentiert.</p>'}<p class="small-note">Datumsangaben sind Uploadtermine, keine bestätigten Flugtage. Der YouTube-Player lädt erst beim Abspielen.</p></section><section class="detail-section"><div class="section-line"><h3>Quellen & Ortsabgleich</h3><span>${spot.sources.length}</span></div>${spot.sources.map((source) => `<a class="source-link" href="${e(source.url)}" target="_blank" rel="noopener noreferrer"><span><small>${e(({ official: 'OFFIZIELLE QUELLE', community: 'COMMUNITY', press: 'LOKALPRESSE', photo: 'FOTODOKUMENTATION' } as Record<string, string>)[source.type] ?? 'QUELLE')}${source.date ? ` · ${formatDate(source.date)}` : ''}</small><strong>${e(source.title)}</strong></span>${icon('external')}</a>`).join('')}</section><p class="detail-footnote">Dokumentierte Flüge bestätigen keine aktuelle Zutritts- oder Flugfreigabe. Recherche geprüft am ${formatDate(data.checkedAt)}.</p></div>`;
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('dialog-open');
  dialog.scrollTop = 0;
  required(document.querySelector<HTMLButtonElement>('#close-dialog')).focus();
}
app.addEventListener('click', (event) => {
  void handleClick(event);
});
async function handleClick(event: MouseEvent) {
  const target = event.target as Element;
  const open = target.closest<HTMLElement>('[data-open]');
  if (open) openSpot(required(open.dataset.open));
  const save = target.closest<HTMLElement>('[data-save]');
  if (save) saveSpot(required(save.dataset.save));
  if (target.closest('#reset-filters, #empty-reset')) resetFilters();
  if (target.closest('#close-dialog')) closeSpot();
  if (target.closest('#map-reset')) map.reset();
  if (target.closest('#saved-toggle')) {
    state.savedOnly = !state.savedOnly;
    location.hash = 'spots';
    refresh();
  }
  const layout = target.closest<HTMLElement>('[data-layout]');
  if (layout) {
    state.mobileMap = layout.dataset.layout === 'map';
    required(document.querySelector('.explorer')).classList.toggle('show-map', state.mobileMap);
    document.querySelectorAll<HTMLElement>('[data-layout]').forEach((b) => {
      b.setAttribute('aria-pressed', String((b.dataset.layout === 'map') === state.mobileMap));
    });
    setTimeout(() => {
      map.resize();
    }, 20);
  }
  const play = target.closest<HTMLElement>('[data-play]');
  if (play) {
    const id = required(play.dataset.play);
    const player = required(document.getElementById(`player-${id}`));
    player.innerHTML = `<iframe title="YouTube-Flugvideo" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?start=${Number(play.dataset.time) || 0}&autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    player.classList.add('loaded');
    play.setAttribute('aria-expanded', 'true');
  }
  if (target.closest('#share-spot')) {
    try {
      const sharedUrl = new URL(atlasLink, location.href);
      sharedUrl.searchParams.set('spot', focusedSpot);
      await navigator.clipboard.writeText(sharedUrl.href);
      toast('Link zu diesem Spot kopiert.');
    } catch {
      toast('Du kannst den Spotlink aus der Adresszeile kopieren.');
    }
  }
}
let searchTimer: ReturnType<typeof setTimeout>;
required(document.querySelector<HTMLInputElement>('#search')).addEventListener('input', (event) => {
  state.query = (event.target as HTMLInputElement).value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(refresh, 150);
});
for (const key of ['radius', 'type', 'confidence', 'sort'] as const)
  required(document.querySelector<HTMLSelectElement>(`#${key}`)).addEventListener(
    'change',
    (event) => {
      const value = (event.target as HTMLSelectElement).value;
      if (key === 'radius') state.radius = Number(value);
      else state[key] = value;
      refresh();
    },
  );
required(document.querySelector<HTMLInputElement>('#video-only')).addEventListener(
  'change',
  (event) => {
    state.videoOnly = (event.target as HTMLInputElement).checked;
    refresh();
  },
);
required(document.querySelector('#spot-list')).addEventListener('pointerover', (event) => {
  const card = (event.target as Element).closest<HTMLElement>('[data-card]');
  if (card) map.highlight(required(card.dataset.card), true);
});
required(document.querySelector('#spot-list')).addEventListener('pointerout', (event) => {
  const card = (event.target as Element).closest<HTMLElement>('[data-card]');
  if (card) map.highlight(required(card.dataset.card), false);
});
function renderResearch() {
  required(document.querySelector('#recherche-view')).innerHTML =
    `<div class="section-heading"><div><p class="eyebrow">VOM VIDEO ZUM ORT</p><h1>Nachvollziehbar statt geraten.</h1><p>Was dieser Atlas weiß. Und was noch offen ist.</p></div><span class="section-number">03 / FIELD NOTES</span></div><div class="research-grid"><article class="research-intro"><span class="research-index">01</span><h2>Den Aufnahmen folgen.</h2><p>Ausgangspunkt war ein FPV-Clip aus dem Chemiewerk Rüdersdorf. Von dort führt die Recherche über öffentlich genannte Mitflieger und verlinkte Videos zu weiteren Orten.</p><p>Wir vergleichen ausgewählte Videobilder mit benannten Fotos, Ortsdokumentationen und aktuellen Berichten. Ein passender Suchtreffer allein ist keine Ortsbestätigung.</p><a class="primary-button" href="${rootLink}research/youtube-netz.md" target="_blank" rel="noopener">Recherche-Notizen öffnen ${icon('external')}</a></article><article><span class="research-index">02</span><h2>Die Belege lesen.</h2><dl><dt><i class="evidence-dot confirmed"></i>Ort zugeordnet</dt><dd>Öffentlich benannt oder anhand charakteristischer Gebäude mit Ortsquellen abgeglichen.</dd><dt><i class="evidence-dot likely"></i>Wahrscheinlicher Ort</dt><dd>Mehrere Merkmale passen. Die genaue Zuordnung bleibt als Schlussfolgerung gekennzeichnet.</dd><dt><i class="evidence-dot open"></i>Offene Spur</dt><dd>Interessante Aufnahmen, deren Standort noch nicht belastbar geklärt ist.</dd></dl></article><article><span class="research-index">03</span><h2>Zeit macht einen Unterschied.</h2><p>Uploaddatum und Flugdatum sind nicht dasselbe. Ältere Videos zeigen möglicherweise Gebäude, die heute verändert, genutzt oder abgerissen sind.</p><p>Deshalb gibt es pro Spot einen separaten Hinweis zum Zustand, ein Datum des letzten erfassten Belegs und direkte Quellenlinks.</p><div class="research-stamp">ZULETZT GEPRÜFT<strong>${formatDate(data.checkedAt)}</strong></div></article><article><span class="research-index">04</span><h2>Ein Fund ist keine Freigabe.</h2><p>Dieser Atlas dokumentiert Orte und öffentliche Flugvideos. Er bestätigt keine aktuelle Erlaubnis zum Betreten oder Fliegen.</p><p>Konkrete Hinweise wie Umnutzung, Flugplatznähe oder eingestürzte Bauteile stehen direkt am jeweiligen Spot.</p><p class="small-note">Entfernungen in der Übersicht sind berechnete Luftlinien. Der Google-Maps-Link zeigt den Standort des Spots.</p></article></div><div class="research-bottom"><div><h2>Deine Auswahl bleibt bei dir.</h2><p>Die Merkliste wird nur in diesem Browser gespeichert. Ohne Konto, ohne eigenes Tracking.</p></div><div><p>Kartenkacheln: OpenStreetMap. Ortssuche: Photon / OpenStreetMap; eingegebene Ortsnamen werden für die Suche an Photon gesendet. Videovorschaubilder: YouTube. Beim Anzeigen dieser Inhalte werden die jeweiligen Dienste geladen; eingebettete Videos erst auf Klick.</p></div></div>`;
}
initOriginSearch(
  required(document.querySelector<HTMLElement>('#origin-control')),
  state.origin,
  (origin) => {
    state.origin = origin;
    refresh();
  },
);
renderNetwork(required(document.querySelector<HTMLElement>('#piloten-view')), data, (id) => {
  if (networkPage) location.assign(`${atlasLink}?spot=${encodeURIComponent(id)}`);
  else openSpot(id);
});
renderResearch();
function setView() {
  const hash = location.hash.slice(1);
  state.view = ['spots', 'piloten', 'recherche'].includes(hash)
    ? hash
    : networkPage
      ? 'piloten'
      : 'spots';
  for (const view of ['spots', 'piloten', 'recherche']) {
    required(document.querySelector<HTMLElement>(`#${view}-view`)).hidden = view !== state.view;
    const link = required(document.querySelector(`[data-nav="${view}"]`));
    if (view === state.view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (state.view === 'spots')
    setTimeout(() => {
      map.resize();
    }, 20);
}
window.addEventListener('hashchange', () => {
  setView();
  window.scrollTo({ top: 0 });
});
refresh();
setView();
const initialSpot = params.get('spot');
if (initialSpot) openSpot(initialSpot);
window.addEventListener('resize', () => {
  map.resize();
});
