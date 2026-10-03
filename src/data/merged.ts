import original from './bandos.json';
import links from './atlas-links.json';
import research from '../atlas/data.json';
import type { Dataset, Spot } from '../atlas/types';
import type { Bando } from '../types';

export interface MapSpot extends Bando {
  id: string;
  atlas?: Spot;
  original?: Bando;
}

export const atlas = research as Dataset;
const originals = original as Bando[];
const byName = new Map(Object.entries(links).map(([id, name]) => [name, id]));
const byId = new Map(atlas.spots.map((spot) => [spot.id, spot]));

function imported(spot: Spot, previous?: Bando): MapSpot | undefined {
  if (spot.lat === null || spot.lon === null) return undefined;
  return {
    id: spot.id,
    name: spot.name,
    town: `${spot.city} · ${spot.region}`,
    lat: previous?.lat ?? spot.lat,
    lon: previous?.lon ?? spot.lon,
    cat: 'research',
    status: spot.status.label,
    body: '',
    next: '',
    atlas: spot,
    ...(previous ? { original: previous } : {}),
  };
}

// Matches are reviewed by site identity, never inferred from proximity. The
// original records and their coordinates remain intact. Alternative Atlas
// coordinates are explicitly attributed in the detail card and dossier.
export const bandos: MapSpot[] = originals.map((spot, index) => {
  const atlasId = byName.get(spot.name);
  const match = atlasId ? byId.get(atlasId) : undefined;
  const linked = match ? imported(match, spot) : undefined;
  return linked ?? { ...spot, id: `map-${index}` };
});
for (const spot of atlas.spots) {
  if (Object.hasOwn(links, spot.id)) continue;
  const entry = imported(spot);
  if (entry) bandos.push(entry);
}

export const unmapped = atlas.spots.filter((spot) => spot.lat === null || spot.lon === null);
export const mergeCounts = {
  original: originals.length,
  linked: Object.keys(links).length,
  added: bandos.length - originals.length,
  mapped: bandos.length,
};
