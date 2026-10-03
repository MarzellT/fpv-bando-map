import { required } from './utils';
import type { Dataset } from './types';
import { escape as e, formatDate, icon } from './utils';
import { createNetwork3D, type Network3D } from './network-3d';
import './network-3d.css';
export function renderNetwork(
  container: HTMLElement,
  data: Dataset,
  openSpot: (id: string) => void,
) {
  const connected = data.pilots.filter((p) =>
    data.edges.some((edge) => edge.sourceId === p.id || edge.targetId === p.id),
  );
  let selected = connected.find((p) => /basil/i.test(p.name))?.id ?? connected[0]?.id ?? '';
  let relation = 'all';
  let view = '2d';
  let scene: Network3D | undefined;
  const researchRoot = '../';
  const latestEdge = data.edges
    .map((edge) => edge.date)
    .filter((date): date is string => date !== null)
    .sort()
    .at(-1);
  container.innerHTML = `<div class="section-heading"><div><p class="eyebrow">DEN PILOTEN FOLGEN</p><h1>Ein Spot führt zum nächsten.</h1><p>Gemeinsame Sessions, wiederkehrende Orte und die Videos dazwischen.</p></div><span class="section-number">02 / NETZWERK</span></div>
    <div class="network-summary" aria-label="Netzwerk in Zahlen"><span><strong>${data.pilots.length}</strong> Piloten & Kanäle</span><span><strong>${data.edges.length}</strong> belegte Verbindungen</span><span><strong>${data.spots.length}</strong> Spots im Atlas</span></div><p class="network-research-note">Letzte Recherche: ${formatDate(data.checkedAt)}${latestEdge ? ` · Neuester Verbindungsbeleg: ${formatDate(latestEdge)}` : ''}. Die räumliche Anordnung zeigt Beziehungen, keine geografischen Positionen.</p><p class="network-research-note">Veröffentlichter Recherchestand · <a class="text-link" href="${researchRoot}research/weekly-log.md" target="_blank" rel="noopener">Stand und Übernahme ${icon('external')}</a></p><div class="network-layout"><section class="network-canvas"><div class="network-toolbar"><span class="mini-label">${connected.length} vernetzte Kanäle</span><div class="network-view-toggle" role="group" aria-label="Netzwerkansicht"><button type="button" data-network-view="2d" aria-pressed="true">2D</button><button type="button" data-network-view="3d" aria-pressed="false">3D</button></div><label>Verbindung <select id="edge-filter"><option value="all">Alle Beziehungen</option><option value="session">Gemeinsame Session</option><option value="same-spot">Gleicher Spot</option><option value="reference">Videoverweis</option></select></label></div><div id="graph" class="graph"></div><div id="graph-3d" class="network-3d" hidden></div><div class="network-legend"><span><i></i> Gemeinsame Session</span><span><i class="dashed"></i> Gleicher Spot / Verweis</span><small>Piloten anklicken, um Belege zu sehen.</small></div></section><aside id="pilot-detail" class="pilot-detail"></aside></div>
    <div class="section-heading small"><div><p class="eyebrow">WEITERE PERSPEKTIVEN</p><h2>Piloten & Kanäle im Atlas</h2></div><span>${data.pilots.length} öffentliche Kanäle</span></div><label class="network-pilot-search">${icon('search')}<input id="pilot-search" type="search" aria-label="Piloten und Kanäle suchen" placeholder="Pilot oder Kanal suchen" autocomplete="off"></label><p class="network-pilot-empty" role="status" hidden>Keine passenden Piloten gefunden.</p><div class="pilot-grid">${data.pilots.map((p) => `<button class="pilot-tile" data-pilot="${e(p.id)}"><span class="avatar">${e(p.name.slice(0, 2).toUpperCase())}</span><span><strong>${e(p.name)}</strong><small>${data.spots.filter((s) => s.videos.some((v) => v.pilotId === p.id)).length} Spots im Atlas</small></span>${icon('arrow')}</button>`).join('')}</div>`;
  // Stable connected components keep unrelated scenes apart and leave room for every name.
  const order = new Map(connected.map((pilot, index) => [pilot.id, index]));
  const neighbors = new Map(connected.map((pilot) => [pilot.id, new Set<string>()]));
  data.edges.forEach((edge) => {
    neighbors.get(edge.sourceId)?.add(edge.targetId);
    neighbors.get(edge.targetId)?.add(edge.sourceId);
  });
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const pilot of connected) {
    if (visited.has(pilot.id)) continue;
    const component: string[] = [],
      queue = [pilot.id];
    visited.add(pilot.id);
    while (queue.length) {
      const id = required(queue.shift());
      component.push(id);
      for (const neighbor of neighbors.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    const hub = [...component].sort(
      (a, b) =>
        required(neighbors.get(b)).size - required(neighbors.get(a)).size ||
        required(order.get(a)) - required(order.get(b)),
    )[0];
    if (!hub) continue;
    const ranked = [hub],
      remaining = new Set(component.filter((id) => id !== hub));
    for (const id of ranked) {
      const next = [...(neighbors.get(id) ?? [])]
        .filter((id) => remaining.has(id))
        .sort((a, b) => required(order.get(a)) - required(order.get(b)));
      next.forEach((id) => {
        remaining.delete(id);
        ranked.push(id);
      });
    }
    components.push(ranked);
  }
  components.sort(
    (a, b) =>
      b.length - a.length ||
      required(order.get(required(a[0]))) - required(order.get(required(b[0]))),
  );
  const positions = new Map<string, [number, number]>();
  const panels: {
    x: number;
    y: number;
    width: number;
    height: number;
    ids: string[];
  }[] = [];
  const width = 900,
    rowGap = 96;
  function place(ids: string[], x: number, y: number, panelWidth: number, maxColumns: number) {
    const columns = Math.min(maxColumns, ids.length);
    const panelHeight = 36 + Math.ceil(ids.length / columns) * rowGap;
    ids.forEach((id, index) =>
      positions.set(id, [
        x + (panelWidth / columns) * ((index % columns) + 0.5),
        y + 69 + Math.floor(index / columns) * rowGap,
      ]),
    );
    panels.push({ x, y, width: panelWidth, height: panelHeight, ids });
    return panelHeight;
  }
  let nextY = 18;
  if (components[0]) nextY += place(components[0], 18, nextY, 864, 5) + 16;
  for (let i = 1; i < components.length; i += 2) {
    const leftHeight = place(required(components[i]), 18, nextY, 526, 3);
    const rightHeight = components[i + 1]
      ? place(required(components[i + 1]), 560, nextY, 322, 2)
      : 0;
    nextY += Math.max(leftHeight, rightHeight) + 16;
  }
  const height = Math.max(360, nextY + 2);
  function draw() {
    scene?.update(selected, relation);
    const shown = data.edges.filter((edge) => relation === 'all' || relation === edge.type);
    const adjacent = new Set(
      shown
        .filter((edge) => edge.sourceId === selected || edge.targetId === selected)
        .flatMap((edge) => [edge.sourceId, edge.targetId]),
    );
    required(container.querySelector('#graph')).innerHTML =
      `<svg viewBox="0 0 ${width} ${height}" role="group" aria-label="Interaktives Pilotennetz"><defs><pattern id="dots" width="25" height="25" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#d9ddd6"/></pattern></defs><rect width="${width}" height="${height}" fill="url(#dots)"/>${panels
        .map((panel) => {
          const hub = required(connected.find((p) => p.id === panel.ids[0]));
          return `<rect x="${panel.x}" y="${panel.y}" width="${panel.width}" height="${panel.height}" rx="9" fill="#f7f7f1" fill-opacity=".8" stroke="#e0e4da"/><text x="${panel.x + 17}" y="${panel.y + 25}" fill="#62706a" font-size="11" font-weight="600">${e(hub.name)} &amp; Umfeld · ${panel.ids.length}</text>`;
        })
        .join('')}${[...shown]
        .sort(
          (a, b) =>
            Number(a.sourceId === selected || a.targetId === selected) -
            Number(b.sourceId === selected || b.targetId === selected),
        )
        .map((edge) => {
          const a = positions.get(edge.sourceId),
            b = positions.get(edge.targetId);
          if (!a || !b) return '';
          const active = edge.sourceId === selected || edge.targetId === selected;
          const midY = (a[1] + b[1]) / 2;
          const path =
            a[1] === b[1]
              ? `M ${a[0]} ${a[1]} C ${a[0]} ${a[1] - 40}, ${b[0]} ${b[1] - 40}, ${b[0]} ${b[1]}`
              : `M ${a[0]} ${a[1]} C ${a[0]} ${midY}, ${b[0]} ${midY}, ${b[0]} ${b[1]}`;
          return `<path d="${path}" fill="none" stroke="${active ? '#e95c36' : '#b4beb3'}" stroke-width="${active ? 2.4 : 1.2}" ${edge.type === 'session' ? '' : 'stroke-dasharray="5 6"'} opacity="${active ? 1 : 0.6}"/>`;
        })
        .join('')}${connected
        .map((p) => {
          const [x, y] = required(positions.get(p.id));
          const active = p.id === selected;
          return `<g class="pilot-node" data-pilot="${e(p.id)}" role="button" tabindex="0" aria-label="${e(p.name)}, Verbindungen anzeigen" aria-pressed="${active}" transform="translate(${x},${y})"><circle r="${active ? 22 : 20}" fill="${active ? '#e95c36' : adjacent.has(p.id) ? '#23312e' : '#62706a'}"/><text y="4.5" text-anchor="middle" fill="#fff" font-size="12" font-weight="600">${e(p.name.slice(0, 2).toUpperCase())}</text><rect x="-78" y="28" width="156" height="25" rx="5" fill="#f7f7f1"/><text y="45" text-anchor="middle" fill="#23312e" font-size="12.5" font-weight="600">${e(p.name)}</text></g>`;
        })
        .join('')}</svg>`;
    const pilot = data.pilots.find((p) => p.id === selected);
    if (!pilot) return;
    const edges = data.edges.filter(
      (edge) =>
        (edge.sourceId === selected || edge.targetId === selected) &&
        (relation === 'all' || relation === edge.type),
    );
    const spots = data.spots.filter((s) => s.videos.some((v) => v.pilotId === selected));
    required(container.querySelector('#pilot-detail')).innerHTML =
      `<p class="eyebrow">KANALPROFIL</p><span class="avatar large">${e(pilot.name.slice(0, 2).toUpperCase())}</span><h2>${e(pilot.name)}</h2><p>${e(pilot.description ?? 'Öffentliche Flugvideos und belegte Verbindungen aus unserer Recherche.')}</p><a class="text-link" href="${e(pilot.url)}" target="_blank" rel="noopener noreferrer">YouTube-Kanal ${icon('external')}</a><div class="divider"></div><h3>${edges.length} belegte Verbindungen</h3>${
        edges.length
          ? edges
              .map((edge) => {
                const other = data.pilots.find(
                  (p) => p.id === (edge.sourceId === selected ? edge.targetId : edge.sourceId),
                );
                return `<a class="edge-evidence" href="${e(edge.url)}" target="_blank" rel="noopener noreferrer"><strong>${e(other?.name)}</strong><span>${e(edge.label)}</span><small>${formatDate(edge.date)} · ${edge.type === 'session' ? 'Gemeinsame Session' : edge.type === 'same-spot' ? 'Gleicher Spot' : 'Videoverweis'} ${icon('external')}</small></a>`;
              })
              .join('')
          : '<p class="muted">Für diese Auswahl ist keine Verbindung dokumentiert.</p>'
      }<div class="divider"></div><h3>${spots.length} Spots im Atlas</h3>${spots.map((spot) => `<button class="pilot-spot" data-spot="${e(spot.id)}">${icon('pin')}<span>${e(spot.name)}<small>${e(spot.city)}</small></span>${icon('arrow')}</button>`).join('') || '<p class="muted">Noch kein konkret zugeordnetes Spotvideo.</p>'}`;
  }
  required(container.querySelector('#edge-filter')).addEventListener('change', (event) => {
    relation = (event.target as HTMLSelectElement).value;
    draw();
  });
  container.addEventListener('click', (event) => {
    const target = event.target as Element;
    const toggle = target.closest<HTMLElement>('[data-network-view]');
    if (toggle && toggle.dataset.networkView !== view) {
      view = required(toggle.dataset.networkView);
      const flat = required(container.querySelector<HTMLElement>('#graph'));
      const spatial = required(container.querySelector<HTMLElement>('#graph-3d'));
      flat.hidden = view !== '2d';
      spatial.hidden = view !== '3d';
      container.querySelectorAll<HTMLElement>('[data-network-view]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.networkView === view));
      });
      scene?.destroy();
      scene = undefined;
      if (view === '3d') {
        scene = createNetwork3D(spatial, connected, data.edges, (id) => {
          selected = id;
          draw();
        });
        scene.update(selected, relation);
      }
    }
    const pilot = target.closest<HTMLElement>('[data-pilot]');
    if (pilot) {
      selected = required(pilot.dataset.pilot);
      draw();
      if (pilot.classList.contains('pilot-tile'))
        container.querySelector('.network-layout')?.scrollIntoView({ block: 'start' });
    }
    const spot = target.closest<HTMLElement>('[data-spot]');
    if (spot) openSpot(required(spot.dataset.spot));
  });
  required(container.querySelector<HTMLInputElement>('#pilot-search')).addEventListener(
    'input',
    (event) => {
      const query = (event.target as HTMLInputElement).value.trim().toLocaleLowerCase('de');
      let visible = 0;
      container.querySelectorAll<HTMLElement>('.pilot-tile').forEach((tile) => {
        const pilot = data.pilots.find((p) => p.id === tile.dataset.pilot);
        tile.hidden = !`${pilot?.name ?? ''} ${pilot?.handle ?? ''}`
          .toLocaleLowerCase('de')
          .includes(query);
        if (!tile.hidden) visible++;
      });
      required(container.querySelector<HTMLElement>('.network-pilot-empty')).hidden = visible > 0;
    },
  );
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const node = (event.target as Element).closest<HTMLElement>('.pilot-node');
    if (node) {
      event.preventDefault();
      selected = required(node.dataset.pilot);
      draw();
      container.querySelector<SVGElement>(`.pilot-node[data-pilot="${selected}"]`)?.focus();
    }
  });
  draw();
}
