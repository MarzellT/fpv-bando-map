import { required } from './utils';
import type { Origin } from './types';
import { escape, icon } from './utils';
import './origin-search.css';
interface Place {
  origin: Origin;
  detail: string;
}
const cache = new Map<string, Place[]>();
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function parsePlaces(data: unknown): Place[] {
  if (!data || typeof data !== 'object' || !('features' in data) || !Array.isArray(data.features))
    return [];
  const places: Place[] = [];
  for (const feature of data.features as unknown[]) {
    if (!isRecord(feature) || !isRecord(feature.geometry) || !isRecord(feature.properties))
      continue;
    const coords = feature.geometry.coordinates;
    const props = feature.properties;
    if (!Array.isArray(coords) || typeof coords[0] !== 'number' || typeof coords[1] !== 'number')
      continue;
    const lon = coords[0];
    const lat = coords[1];
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
      continue;
    const part = (key: string): string => {
      const value = props[key];
      return typeof value === 'string' ? value.trim() : '';
    };
    const town = part('city') || part('town') || part('village') || part('locality');
    const name = part('name') || town;
    if (!name) continue;
    const detail = [...new Set([town, part('state'), part('country')].filter(Boolean))].join(' · ');
    if (
      places.some(
        (place) =>
          place.origin.name === name && place.origin.lat === lat && place.origin.lon === lon,
      )
    )
      continue;
    places.push({ origin: { id: 'custom', name, lat, lon }, detail });
    if (places.length === 5) break;
  }
  return places;
}
export function initOriginSearch(
  container: HTMLElement,
  initial: Origin | null,
  onSelect: (origin: Origin | null) => void,
): void {
  container.classList.add('origin-place-search');
  container.innerHTML = `
    <label class="mini-label" for="origin-search">ENTFERNUNG AB</label>
    <form class="origin-place-form" role="search">
      <div class="origin-place-field">
        ${icon('pin')}
        <input id="origin-search" type="text" value="${escape(initial?.name ?? '')}" placeholder="Stadt oder Ort weltweit" role="combobox" aria-label="Entfernung ab" aria-autocomplete="list" aria-controls="origin-results" aria-expanded="false" autocomplete="off" spellcheck="false">
        <button id="clear-origin" class="origin-place-clear" type="button" aria-label="Ort entfernen" title="Ort entfernen" ${initial ? '' : 'hidden'}>${icon('close')}</button>
        <button class="origin-place-submit" type="submit" aria-label="Ort suchen" title="Ort suchen">${icon('search')}</button>
      </div>
      <div id="origin-results" class="origin-place-results" role="listbox" aria-label="Gefundene Orte" hidden></div>
    </form>
    <p class="origin-place-status" role="status" aria-live="polite"></p>
    <p class="origin-place-attribution">Ortssuche: <a href="https://photon.komoot.io/" target="_blank" rel="noopener noreferrer">Photon</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></p>`;
  const input = required(container.querySelector<HTMLInputElement>('#origin-search'));
  const form = required(container.querySelector<HTMLFormElement>('form'));
  const list = required(container.querySelector<HTMLElement>('#origin-results'));
  const status = required(container.querySelector<HTMLElement>('.origin-place-status'));
  const clearButton = required(container.querySelector<HTMLButtonElement>('#clear-origin'));
  let selected = initial;
  let places: Place[] = [];
  let resultsQuery = '';
  let active = -1;
  let generation = 0;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const current = () =>
    selected ? `Aktuell: ${selected.name}` : 'Optional: Ort für Entfernungen wählen.';
  const query = () => input.value.trim();
  const invalidate = () => {
    generation++;
    clearTimeout(debounce);
    controller?.abort();
    controller = undefined;
  };
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };
  const highlight = (index: number) => {
    active = index;
    list.querySelectorAll<HTMLElement>('[role=option]').forEach((option, i) => {
      option.setAttribute('aria-selected', String(i === index));
      if (i === index) option.scrollIntoView({ block: 'nearest' });
    });
    if (index >= 0) input.setAttribute('aria-activedescendant', `origin-result-${index}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const showResults = () => {
    list.innerHTML = places
      .map(
        (place, index) =>
          `<button type="button" role="option" id="origin-result-${index}" data-origin-result="${index}" aria-selected="false" tabindex="-1"><span>${escape(place.origin.name)}</span><small>${escape(place.detail)}</small></button>`,
      )
      .join('');
    list.hidden = places.length === 0;
    input.setAttribute('aria-expanded', String(places.length > 0));
    highlight(-1);
  };
  const pick = (index: number) => {
    const place = places[index];
    if (!place) return;
    invalidate();
    selected = { ...place.origin };
    clearButton.hidden = false;
    input.value = selected.name;
    places = [];
    resultsQuery = '';
    close();
    status.textContent = current();
    input.focus();
    onSelect({ ...selected });
  };
  const search = async () => {
    invalidate();
    const value = query();
    close();
    if (value.length < 2) {
      status.textContent = `Mindestens 2 Zeichen eingeben. ${current()}`;
      return;
    }
    const requestGeneration = generation;
    const key = value.toLocaleLowerCase('de');
    const cached = cache.get(key);
    if (cached) {
      places = cached;
      resultsQuery = value;
      showResults();
      status.textContent = places.length
        ? `${places.length} Orte gefunden. ${current()}`
        : `Keine Orte gefunden. ${current()}`;
      return;
    }
    const request = new AbortController();
    controller = request;
    const timeout = setTimeout(() => {
      request.abort();
    }, 8000);
    status.textContent = `Orte werden gesucht … ${current()}`;
    try {
      const response = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(value)}&lang=de&limit=5`,
        { signal: request.signal },
      );
      if (!response.ok) throw new Error('Place search failed');
      const found = parsePlaces(await response.json());
      if (requestGeneration !== generation || value !== query() || !container.isConnected) return;
      cache.set(key, found);
      if (cache.size > 50) cache.delete(required(cache.keys().next().value));
      places = found;
      resultsQuery = value;
      showResults();
      status.textContent = places.length
        ? `${places.length} Orte gefunden. ${current()}`
        : `Keine Orte gefunden. ${current()}`;
    } catch {
      if (requestGeneration !== generation || !container.isConnected) return;
      places = [];
      resultsQuery = '';
      close();
      status.textContent = `Ortssuche gerade nicht erreichbar. Bitte erneut versuchen. ${current()}`;
    } finally {
      clearTimeout(timeout);
      if (controller === request) controller = undefined;
    }
  };
  status.textContent = current();
  clearButton.addEventListener('click', () => {
    invalidate();
    selected = null;
    input.value = '';
    places = [];
    resultsQuery = '';
    clearButton.hidden = true;
    close();
    status.textContent = current();
    input.focus();
    onSelect(null);
  });
  input.addEventListener('input', () => {
    invalidate();
    places = [];
    resultsQuery = '';
    close();
    status.textContent =
      query().length > 0 && query().length < 2
        ? `Mindestens 2 Zeichen eingeben. ${current()}`
        : current();
    if (query().length >= 2) debounce = setTimeout(() => void search(), 500);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!list.hidden && active >= 0) pick(active);
    else void search();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      invalidate();
      close();
      status.textContent = current();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!places.length || resultsQuery !== query()) return;
      event.preventDefault();
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      highlight(
        event.key === 'ArrowDown'
          ? (active + 1) % places.length
          : active < 0
            ? places.length - 1
            : (active - 1 + places.length) % places.length,
      );
    } else if (event.key === 'Tab') {
      invalidate();
      close();
      status.textContent = current();
    }
  });
  list.addEventListener('click', (event) => {
    const option = (event.target as HTMLElement).closest<HTMLElement>('[data-origin-result]');
    if (option) pick(Number(option.dataset.originResult));
  });
  const outsidePointer = (event: PointerEvent) => {
    if (!container.isConnected) {
      invalidate();
      document.removeEventListener('pointerdown', outsidePointer);
      return;
    }
    if (!container.contains(event.target as Node)) {
      invalidate();
      close();
      status.textContent = current();
    }
  };
  document.addEventListener('pointerdown', outsidePointer);
}
