import type { Origin, Spot } from './types';
export const escape = (value: string | number | boolean | null | undefined): string =>
  String(value ?? '').replace(/[&<>"']/g, (c) =>
    required({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
export const formatDate = (date: string | null | undefined) =>
  date
    ? new Date(date.slice(0, 10) + 'T12:00:00').toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : 'Datum offen';
export function distance(origin: Origin, spot: Spot): number {
  if (spot.lat === null || spot.lon === null) return Infinity;
  const rad = Math.PI / 180;
  const a =
    Math.sin(((spot.lat - origin.lat) * rad) / 2) ** 2 +
    Math.cos(origin.lat * rad) *
      Math.cos(spot.lat * rad) *
      Math.sin(((spot.lon - origin.lon) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function loadSaved(): Set<string> {
  try {
    const a: unknown = JSON.parse(localStorage.getItem('bando-atlas:saved') ?? '[]');
    return new Set(Array.isArray(a) ? a.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}
export function persistSaved(ids: Set<string>) {
  try {
    localStorage.setItem('bando-atlas:saved', JSON.stringify([...ids]));
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
}
const paths: Record<string, string> = {
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  external:
    '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  bookmark: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16m6-14v16"/>',
  network:
    '<circle cx="12" cy="5" r="3"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="m10 8-4 7m8-7 4 7M8 18h8"/>',
  building: '<path d="M3 21V8l6 3V5l6 6V2h6v19ZM7 15v2m5-2v2m5-2v2M1 21h22"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  crosshair: '<circle cx="12" cy="12" r="7"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/>',
  link: '<path d="m10 13 4-4m-5 7-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-2 2"/>',
};
export const icon = (name: string, className = '') =>
  `<svg class="icon ${className}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.building}</svg>`;

/** Check DOM and graph invariants before using their values. */
export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Missing Atlas element or graph value');
  return value;
}
