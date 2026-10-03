import { required } from './utils';
import type { Edge, Pilot } from './types';
interface Point {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
}
type Projected = Point & {
  screenX: number;
  screenY: number;
  depth: number;
  radius: number;
};
export interface Network3D {
  update: (selected: string, relation: string) => void;
  destroy: () => void;
}
/** Perspective projection of a relationship graph. Coordinates are a layout, not geographic positions. */
export function createNetwork3D(
  host: HTMLElement,
  pilots: Pilot[],
  edges: Edge[],
  onSelect: (id: string) => void,
): Network3D {
  host.innerHTML = `<canvas class="network-3d-canvas" tabindex="0" role="img" aria-label="Dreidimensionales Pilotennetz. Ziehen zum Drehen, Mausrad oder Plus und Minus zum Zoomen, Pfeiltasten zum Drehen. Piloten per Klick oder über die Kanalliste wählen."></canvas><div class="network-3d-help"><span>Ziehen: drehen · Scrollen / Pinch: zoomen</span><button type="button" class="network-3d-reset">Ansicht zurücksetzen</button></div>`;
  const canvas = required(host.querySelector<HTMLCanvasElement>('canvas'));
  const context = canvas.getContext('2d');
  if (!context) {
    host.innerHTML =
      '<p class="network-3d-fallback">Die 3D-Ansicht ist in diesem Browser nicht verfügbar. Bitte die 2D-Ansicht verwenden.</p>';
    return {
      update: () => {
        return;
      },
      destroy: () => {
        return;
      },
    };
  }
  const ctx = context;
  const points: Point[] = pilots.map((pilot, index) => {
    const vertical = 1 - (2 * (index + 0.5)) / Math.max(1, pilots.length);
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const radius = Math.sqrt(1 - vertical * vertical);
    return {
      id: pilot.id,
      name: pilot.name,
      x: Math.cos(angle) * radius * 180,
      y: vertical * 160,
      z: Math.sin(angle) * radius * 180,
    };
  });
  let selected = '',
    relation = 'all';
  let yaw = -0.35,
    pitch = 0.16,
    zoom = 1;
  let width = 0,
    height = 0,
    projected: Projected[] = [];
  let frame = 0,
    destroyed = false;
  const events = new AbortController();
  const pointers = new Map<
    number,
    {
      x: number;
      y: number;
    }
  >();
  let startX = 0,
    startY = 0,
    moved = false;
  function project(point: Point): Projected {
    const x = point.x * Math.cos(yaw) + point.z * Math.sin(yaw);
    const rotatedZ = -point.x * Math.sin(yaw) + point.z * Math.cos(yaw);
    const y = point.y * Math.cos(pitch) - rotatedZ * Math.sin(pitch);
    const z = point.y * Math.sin(pitch) + rotatedZ * Math.cos(pitch);
    const scale = Math.min(width / 560, height / 470) * zoom;
    const perspective = 620 / (620 + z);
    return {
      ...point,
      screenX: width / 2 + x * perspective * scale,
      screenY: height / 2 + y * perspective * scale,
      depth: z,
      radius: Math.max(8, 14 * perspective * scale),
    };
  }
  function paint() {
    frame = 0;
    if (destroyed || !width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const background = ctx.createRadialGradient(
      width / 2,
      height / 2,
      20,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.7,
    );
    background.addColorStop(0, '#fffcf7');
    background.addColorStop(1, '#e9ede4');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#cdd5c8';
    for (let x = 16; x < width; x += 28)
      for (let y = 16; y < height; y += 28) {
        ctx.beginPath();
        ctx.arc(x, y, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    projected = points.map(project).sort((a, b) => b.depth - a.depth);
    const byId = new Map(projected.map((point) => [point.id, point]));
    const shown = edges.filter((edge) => relation === 'all' || edge.type === relation);
    const adjacent = new Set(
      shown
        .filter((edge) => edge.sourceId === selected || edge.targetId === selected)
        .flatMap((edge) => [edge.sourceId, edge.targetId]),
    );
    const sortedEdges = [...shown].sort(
      (a, b) =>
        Number(a.sourceId === selected || a.targetId === selected) -
        Number(b.sourceId === selected || b.targetId === selected),
    );
    for (const edge of sortedEdges) {
      const a = byId.get(edge.sourceId),
        b = byId.get(edge.targetId);
      if (!a || !b) continue;
      const active = edge.sourceId === selected || edge.targetId === selected;
      ctx.strokeStyle = active ? '#e45b34' : '#7e9587';
      ctx.globalAlpha = active ? 0.95 : 0.28;
      ctx.lineWidth = active ? 2 : 1;
      ctx.setLineDash(edge.type === 'session' ? [] : [4, 5]);
      ctx.beginPath();
      ctx.moveTo(a.screenX, a.screenY);
      ctx.lineTo(b.screenX, b.screenY);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    for (const point of projected) {
      const active = point.id === selected;
      const radius = point.radius * (active ? 1.2 : 1);
      if (active) {
        ctx.strokeStyle = '#e45b3455';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(point.screenX, point.screenY, radius + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = active ? '#e45b34' : adjacent.has(point.id) ? '#23312e' : '#61796b';
      ctx.beginPath();
      ctx.arc(point.screenX, point.screenY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fffcf7';
      ctx.font = `600 ${Math.max(9, Math.min(13, radius * 0.8))}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(point.name.slice(0, 2).toUpperCase(), point.screenX, point.screenY);
      const labelY = point.screenY + radius + 15;
      ctx.font = `${active ? 650 : 500} ${active ? 12 : 11}px system-ui`;
      const labelWidth = ctx.measureText(point.name).width + 12;
      ctx.fillStyle = '#fffcf7e8';
      ctx.fillRect(point.screenX - labelWidth / 2, labelY - 9, labelWidth, 18);
      ctx.fillStyle = '#23312e';
      ctx.fillText(point.name, point.screenX, labelY);
    }
  }
  function schedule() {
    if (!destroyed && !frame) frame = requestAnimationFrame(paint);
  }
  function resize() {
    if (!host.isConnected) {
      destroy();
      return;
    }
    width = host.clientWidth;
    height = Math.max(380, Math.min(580, width * 0.75));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    schedule();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const pinchDistance = () => {
    const values = [...pointers.values()];
    const [first, second] = values;
    return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
  };
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      startX = event.clientX;
      startY = event.clientY;
      moved = pointers.size > 1;
      canvas.classList.add('is-dragging');
    },
    { signal: events.signal },
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      const last = pointers.get(event.pointerId);
      if (!last) return;
      const before = pinchDistance();
      const dx = event.clientX - last.x,
        dy = event.clientY - last.y;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size > 1) {
        const after = pinchDistance();
        if (before) zoom = Math.max(0.5, Math.min(2.4, (zoom * after) / before));
        moved = true;
      } else {
        yaw += dx * 0.008;
        pitch = Math.max(-1.4, Math.min(1.4, pitch + dy * 0.008));
        if (Math.hypot(event.clientX - startX, event.clientY - startY) > 5) moved = true;
      }
      schedule();
    },
    { signal: events.signal },
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      pointers.delete(event.pointerId);
      if (!pointers.size) canvas.classList.remove('is-dragging');
      if (moved) return;
      const rect = canvas.getBoundingClientRect(),
        x = event.clientX - rect.left,
        y = event.clientY - rect.top;
      const hit = [...projected]
        .reverse()
        .find((point) => Math.hypot(point.screenX - x, point.screenY - y) <= point.radius + 10);
      if (hit) onSelect(hit.id);
    },
    { signal: events.signal },
  );
  canvas.addEventListener(
    'pointercancel',
    (event) => {
      pointers.delete(event.pointerId);
      moved = true;
      canvas.classList.remove('is-dragging');
    },
    { signal: events.signal },
  );
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      zoom = Math.max(0.5, Math.min(2.4, zoom * Math.exp(-event.deltaY * 0.001)));
      schedule();
    },
    { passive: false, signal: events.signal },
  );
  const reset = () => {
    yaw = -0.35;
    pitch = 0.16;
    zoom = 1;
    schedule();
  };
  canvas.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'ArrowLeft') yaw -= 0.12;
      else if (event.key === 'ArrowRight') yaw += 0.12;
      else if (event.key === 'ArrowUp') pitch = Math.max(-1.4, pitch - 0.12);
      else if (event.key === 'ArrowDown') pitch = Math.min(1.4, pitch + 0.12);
      else if (event.key === '+' || event.key === '=') zoom = Math.min(2.4, zoom + 0.1);
      else if (event.key === '-') zoom = Math.max(0.5, zoom - 0.1);
      else if (event.key === 'Home') reset();
      else return;
      event.preventDefault();
      schedule();
    },
    { signal: events.signal },
  );
  required(host.querySelector('button')).addEventListener('click', reset, {
    signal: events.signal,
  });
  function destroy() {
    destroyed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    events.abort();
  }
  resize();
  return {
    update: (id, filter) => {
      selected = id;
      relation = filter;
      schedule();
    },
    destroy,
  };
}
