import { atlas, type MapSpot } from './data/merged';
import type { Category, CategoryMeta } from './types';

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

const e = escapeHtml;
const pilots = new Map(atlas.pilots.map((pilot) => [pilot.id, pilot]));
const date = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('de-DE');
const maps = (lat: number, lon: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

export function renderSpotDetail(b: MapSpot, categories: Record<Category, CategoryMeta>): string {
  const meta = categories[b.cat];
  const spot = b.atlas;
  const research = spot
    ? `<section class="evidence" aria-label="Atlas-Belege">
        <p>${e(spot.summary)}</p>
        <p class="evidence-status"><strong>${e(spot.status.label)}</strong><br>${e(spot.status.note)}</p>
        <p class="evidence-meta">${spot.confidence === 'confirmed' ? 'Ort zugeordnet' : spot.confidence === 'likely' ? 'Wahrscheinliche Zuordnung' : 'Offene Zuordnung'} · ${spot.coordinatePrecision === 'approximate' ? 'Ungefährer Arealpunkt' : 'Ortskoordinate'}${spot.status.lastEvidence ? ` · letzter datierter Beleg ${date(spot.status.lastEvidence)}` : ''}</p>
        <p class="evidence-meta">Flugvideos belegen keine aktuelle Zutritts- oder Flugfreigabe. Videodaten sind Veröffentlichungstage.</p>
        ${spot.videos.length ? `<h3>Flugvideos (${spot.videos.length})</h3><ul class="evidence-links">${spot.videos.map((video) => `<li><a href="https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}&amp;t=${video.timestampSeconds}s" target="_blank" rel="noopener noreferrer">${e(video.title)} ↗</a><small>${e(pilots.get(video.pilotId)?.name ?? video.pilotId)} · ${date(video.publishedAt)}</small><p>${e(video.note)}</p></li>`).join('')}</ul>` : ''}
        <h3>Orts- und Zustandsquellen</h3><ul class="evidence-links">${spot.sources.map((source) => `<li><a href="${e(source.url)}" target="_blank" rel="noopener noreferrer">${e(source.title)} ↗</a>${source.date ? `<small>${date(source.date)}</small>` : ''}</li>`).join('')}</ul>
        <a class="atlas-link" href="./atlas/?spot=${encodeURIComponent(spot.id)}">Dossier im Atlas öffnen →</a>
      </section>`
    : `<div class="body">${b.body}</div>${b.next ? `<p class="next"><span>Nächster Schritt</span>${e(b.next)}</p>` : ''}`;
  const previous = b.original;
  const differentPoint =
    previous && spot && (previous.lat !== spot.lat || previous.lon !== spot.lon);
  const coordinateNote =
    differentPoint && spot.lat !== null && spot.lon !== null
      ? `<p class="coordinate-note">Kartenpunkt aus der bisherigen Karte. Der Atlas führt einen abweichenden ${spot.coordinatePrecision === 'approximate' ? 'ungefähren Arealpunkt' : 'Ortskoordinaten-Eintrag'}: <a href="${maps(spot.lat, spot.lon)}" target="_blank" rel="noopener noreferrer">Atlas-Punkt in Google Maps ↗</a>. Die Punkte wurden beim Zusammenführen nicht als identisch bestätigt.</p>`
      : '';
  const original = previous
    ? `<details class="legacy-record"><summary>Bisheriger Karteneintrag</summary><p>Unveränderte ältere Beschreibung; die datierten Atlas-Belege oben ergänzen diesen Eintrag.</p><p><strong>${e(previous.name)}</strong> · ${e(categories[previous.cat].label)}<br>${e(previous.status)}</p><div class="body">${previous.body}</div><p>${e(previous.next)}</p><p>Der bisherige Kartenpunkt bleibt erhalten. Abweichende Atlas-Koordinaten sind oben separat verlinkt.</p></details>`
    : '';
  return `<article class="detail" data-spot-id="${e(b.id)}">
    <button type="button" id="back-to-list" class="back-button">← Alle Treffer</button>
    <h2>${e(b.name)}</h2><p class="town">${e(b.town)}</p>
    <p class="cat" style="color:${meta.color};border-color:${meta.color}">${e(meta.label)}</p>
    ${spot ? '' : `<div class="kv"><span><b>Status</b> ${e(b.status)}</span></div>`}
    <p class="coord"><code>${b.lat.toFixed(5)}, ${b.lon.toFixed(5)}</code><a href="${maps(b.lat, b.lon)}" target="_blank" rel="noopener noreferrer">In Google Maps öffnen ↗</a>${!previous && spot?.coordinatePrecision === 'approximate' ? '<small>Ungefährer Arealpunkt, kein bestätigter Eingang oder Startplatz.</small>' : ''}</p>
    ${coordinateNote}${research}${original}</article>`;
}
