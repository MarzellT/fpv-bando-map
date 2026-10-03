import { required } from './utils';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Spot } from './types';
import { escape } from './utils';
export function createSpotMap(
  element: HTMLElement,
  onSelect: (id: string) => void,
  spotNumbers: ReadonlyMap<string, number>,
) {
  const map = L.map(element, {
    zoomControl: false,
    scrollWheelZoom: true,
  }).setView([50.5, 8.3], 7);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);
  const group = L.layerGroup().addTo(map);
  const markers = new Map<string, L.Marker>();
  let currentBounds: L.LatLngBounds | null = null;
  let visibleIds: string | undefined;
  let needsFit = false;
  const reset = () => {
    const size = map.getSize();
    if (currentBounds?.isValid() && size.x > 0 && size.y > 0) {
      map.fitBounds(currentBounds, { padding: [45, 45], maxZoom: 11 });
      needsFit = false;
    }
  };
  return {
    refresh(spots: Spot[]) {
      const mappable = spots.filter(
        (spot) => spot.lat !== null && spot.lon !== null && spot.confidence !== 'open',
      );
      const ids = JSON.stringify(mappable.map((spot) => spot.id));
      // List distance, radius and ordering must not move or rebuild the map.
      if (ids === visibleIds) return;
      visibleIds = ids;
      group.clearLayers();
      markers.clear();
      const points: L.LatLngTuple[] = [];
      mappable.forEach((spot) => {
        const position: L.LatLngTuple = [required(spot.lat), required(spot.lon)];
        const marker = L.marker(position, {
          title: spot.name,
          icon: L.divIcon({
            className: 'atlas-marker',
            html: `<span class="${spot.confidence === 'likely' ? 'probable' : ''}">${String(spotNumbers.get(spot.id)).padStart(2, '0')}</span>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
        })
          .bindTooltip(escape(spot.name), {
            direction: 'top',
            offset: [0, -16],
          })
          .addTo(group);
        marker.getElement()?.setAttribute('data-spot-id', spot.id);
        marker.on('click', () => {
          onSelect(spot.id);
        });
        markers.set(spot.id, marker);
        points.push(position);
      });
      currentBounds = L.latLngBounds(points);
      needsFit = true;
      reset();
    },
    highlight(id: string, on: boolean) {
      markers.get(id)?.getElement()?.classList.toggle('highlight', on);
    },
    resize() {
      map.invalidateSize();
      if (needsFit) reset();
    },
    reset,
    destroy() {
      map.remove();
    },
  };
}
