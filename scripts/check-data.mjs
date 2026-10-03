import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../src/atlas/data.json', import.meta.url), 'utf8'));
const berlinDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const errors = [];
const fail = (path, message) => errors.push(`${path}: ${message}`);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const videoId = /^[A-Za-z0-9_-]{11}$/;

function shape(value, required, optional, path) {
  if (!object(value)) {
    fail(path, 'expected an object');
    return false;
  }
  for (const key of required) if (!(key in value)) fail(path, `missing ${key}`);
  for (const key of Object.keys(value)) {
    if (![...required, ...optional].includes(key)) fail(path, `unexpected field ${key}`);
  }
  return true;
}

function strings(value, fields, path) {
  for (const field of fields)
    if (!text(value[field])) fail(`${path}.${field}`, 'expected nonempty text');
}

function oneOf(value, allowed, path) {
  if (!allowed.includes(value)) fail(path, `expected one of ${allowed.join(', ')}`);
}

function date(value, path, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(path, 'expected an exact YYYY-MM-DD date');
    return;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail(path, 'invalid calendar date');
    return;
  }
  if (path !== 'checkedAt' && value > data.checkedAt)
    fail(path, 'evidence is newer than the research cutoff');
}

function url(value, path) {
  if (typeof value !== 'string' || /\s/.test(value)) {
    fail(path, 'expected URL without whitespace');
    return;
  }
  try {
    const parsed = new URL(value);
    if (
      !['https:', 'http:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      fail(path, 'expected a public HTTP(S) URL without credentials');
    }
    if (['youtube.com', 'www.youtube.com', 'youtu.be'].includes(parsed.hostname)) {
      const id =
        parsed.hostname === 'youtu.be'
          ? parsed.pathname.slice(1)
          : parsed.pathname === '/watch'
            ? parsed.searchParams.get('v')
            : parsed.pathname.startsWith('/shorts/')
              ? parsed.pathname.split('/')[2]
              : null;
      if (id !== null && !videoId.test(id)) fail(path, 'malformed YouTube video ID in URL');
    }
  } catch {
    fail(path, 'invalid URL');
  }
}

function coordinates(value, path, nullable = false) {
  const { lat, lon } = value;
  if (lat === null || lon === null) {
    if (!nullable || lat !== null || lon !== null)
      fail(path, 'coordinates must both be present or both null');
    if (nullable && value.confidence !== 'open')
      fail(path, 'missing coordinates require open confidence');
    return;
  }
  // The current atlas is deliberately limited to Germany; this catches swaps and city-pin typos.
  if (!Number.isFinite(lat) || lat < 47 || lat > 55.5)
    fail(`${path}.lat`, 'outside the German atlas bounds');
  if (!Number.isFinite(lon) || lon < 5.5 || lon > 16)
    fail(`${path}.lon`, 'outside the German atlas bounds');
}

function collection(value, path) {
  if (!Array.isArray(value)) {
    fail(path, 'expected an array');
    return [];
  }
  return value;
}

function uniqueIds(items, path) {
  const ids = new Set();
  for (const [i, item] of items.entries()) {
    if (!object(item)) {
      fail(`${path}[${i}]`, 'expected an object');
      continue;
    }
    if (!slug.test(item.id ?? '')) fail(`${path}[${i}].id`, 'expected a canonical slug');
    if (ids.has(item.id)) fail(`${path}[${i}].id`, `duplicate ID ${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

shape(data, ['checkedAt', 'origins', 'spots', 'pilots', 'edges'], [], 'dataset');
date(data.checkedAt, 'checkedAt');
if (data.checkedAt > berlinDate)
  fail('checkedAt', `cannot be later than today in Europe/Berlin (${berlinDate})`);
const origins = collection(data.origins, 'origins');
const spots = collection(data.spots, 'spots');
const pilots = collection(data.pilots, 'pilots');
const edges = collection(data.edges, 'edges');
uniqueIds(origins, 'origins');
uniqueIds(spots, 'spots');
const pilotIds = uniqueIds(pilots, 'pilots');

for (const [i, origin] of origins.entries()) {
  const path = `origins[${i}]`;
  if (!shape(origin, ['id', 'name', 'lat', 'lon'], [], path)) continue;
  strings(origin, ['name'], path);
  coordinates(origin, path);
}

const channelUrls = new Set();
for (const [i, pilot] of pilots.entries()) {
  const path = `pilots[${i}]`;
  if (!shape(pilot, ['id', 'name', 'handle', 'url'], ['region', 'description'], path)) continue;
  strings(pilot, ['name', 'handle', 'url'], path);
  for (const key of ['region', 'description'])
    if (key in pilot && !text(pilot[key])) fail(`${path}.${key}`, 'expected nonempty text');
  url(pilot.url, `${path}.url`);
  const canonicalUrl = String(pilot.url).replace(/\/$/, '');
  if (channelUrls.has(canonicalUrl))
    fail(`${path}.url`, 'duplicate channel; merge canonical pilot IDs');
  channelUrls.add(canonicalUrl);
}

const videoMetadata = new Map();
let videoCount = 0;
for (const [i, spot] of spots.entries()) {
  const path = `spots[${i}]`;
  if (
    !shape(
      spot,
      [
        'id',
        'name',
        'city',
        'region',
        'type',
        'lat',
        'lon',
        'coordinatePrecision',
        'confidence',
        'summary',
        'features',
        'status',
        'videos',
        'sources',
      ],
      [],
      path,
    )
  )
    continue;
  strings(spot, ['name', 'city', 'region', 'type', 'summary'], path);
  coordinates(spot, path, true);
  oneOf(spot.coordinatePrecision, ['site', 'approximate'], `${path}.coordinatePrecision`);
  oneOf(spot.confidence, ['confirmed', 'likely', 'open'], `${path}.confidence`);
  for (const [j, feature] of collection(spot.features, `${path}.features`).entries()) {
    if (!text(feature)) fail(`${path}.features[${j}]`, 'expected nonempty text');
  }
  if (shape(spot.status, ['label', 'tone', 'note', 'lastEvidence'], [], `${path}.status`)) {
    strings(spot.status, ['label', 'note'], `${path}.status`);
    oneOf(spot.status.tone, ['documented', 'caution', 'uncertain'], `${path}.status.tone`);
    date(spot.status.lastEvidence, `${path}.status.lastEvidence`, true);
  }
  const localVideos = new Set();
  for (const [j, video] of collection(spot.videos, `${path}.videos`).entries()) {
    const vp = `${path}.videos[${j}]`;
    if (
      !shape(
        video,
        ['id', 'title', 'pilotId', 'publishedAt', 'match', 'timestampSeconds', 'note'],
        [],
        vp,
      )
    )
      continue;
    videoCount++;
    if (!videoId.test(video.id ?? '')) fail(`${vp}.id`, 'expected an 11-character YouTube ID');
    if (localVideos.has(video.id)) fail(`${vp}.id`, 'duplicate video within a spot');
    localVideos.add(video.id);
    strings(video, ['title', 'note'], vp);
    if (!pilotIds.has(video.pilotId)) fail(`${vp}.pilotId`, `unknown pilot ${video.pilotId}`);
    date(video.publishedAt, `${vp}.publishedAt`);
    oneOf(video.match, ['named', 'visual', 'likely'], `${vp}.match`);
    if (!Number.isInteger(video.timestampSeconds) || video.timestampSeconds < 0)
      fail(`${vp}.timestampSeconds`, 'expected a nonnegative integer');
    const metadata = JSON.stringify([video.title, video.pilotId, video.publishedAt]);
    if (videoMetadata.has(video.id) && videoMetadata.get(video.id) !== metadata)
      fail(vp, 'same YouTube ID has inconsistent title, publisher or date');
    videoMetadata.set(video.id, metadata);
  }
  const sources = collection(spot.sources, `${path}.sources`);
  if (!sources.length) fail(`${path}.sources`, 'spot needs a reviewable location source');
  const sourceUrls = new Set();
  for (const [j, source] of sources.entries()) {
    const sp = `${path}.sources[${j}]`;
    if (!shape(source, ['title', 'url', 'type'], ['date'], sp)) continue;
    strings(source, ['title', 'type'], sp);
    url(source.url, `${sp}.url`);
    if ('date' in source) date(source.date, `${sp}.date`);
    if (sourceUrls.has(source.url)) fail(`${sp}.url`, 'duplicate source within a spot');
    sourceUrls.add(source.url);
  }
}

const edgeKeys = new Set();
for (const [i, edge] of edges.entries()) {
  const path = `edges[${i}]`;
  if (!shape(edge, ['sourceId', 'targetId', 'type', 'label', 'url', 'date'], [], path)) continue;
  for (const key of ['sourceId', 'targetId'])
    if (!pilotIds.has(edge[key])) fail(`${path}.${key}`, `unknown pilot ${edge[key]}`);
  if (edge.sourceId === edge.targetId) fail(path, 'self-link');
  oneOf(edge.type, ['session', 'same-spot', 'reference'], `${path}.type`);
  strings(edge, ['label'], path);
  url(edge.url, `${path}.url`);
  date(edge.date, `${path}.date`, true);
  const key = JSON.stringify([
    ...[edge.sourceId, edge.targetId].sort(),
    edge.type,
    edge.url,
    edge.date,
  ]);
  if (edgeKeys.has(key)) fail(path, 'duplicate relationship evidence');
  edgeKeys.add(key);
}

const mapData = JSON.parse(
  await readFile(new URL('../src/data/bandos.json', import.meta.url), 'utf8'),
);
const links = JSON.parse(
  await readFile(new URL('../src/data/atlas-links.json', import.meta.url), 'utf8'),
);
const linkedNames = new Set();
for (const [id, name] of Object.entries(links)) {
  const linkedSpot = spots.find((spot) => spot.id === id);
  if (!linkedSpot) fail(`atlas-links.${id}`, 'unknown Atlas spot');
  else if (linkedSpot.lat === null || linkedSpot.lon === null)
    fail(`atlas-links.${id}`, 'unmapped Atlas record must not inherit an unverified legacy point');
  if (mapData.filter((spot) => spot.name === name).length !== 1)
    fail(`atlas-links.${id}`, 'must identify exactly one original map record');
  if (linkedNames.has(name)) fail(`atlas-links.${id}`, 'original map record linked more than once');
  linkedNames.add(name);
}
for (const [index, spot] of mapData.entries()) {
  coordinates(spot, `map[${index}]`);
  oneOf(spot.cat, ['go', 'club', 'ask', 'hot', 'zone'], `map[${index}].cat`);
  strings(spot, ['name', 'town'], `map[${index}]`);
}

if (errors.length) {
  console.error(
    `Data integrity failed (${errors.length}):\n${errors.map((e) => `- ${e}`).join('\n')}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Data integrity OK: ${spots.length} spots, ${pilots.length} pilots/channels, ${edges.length} edges, ${videoCount} video associations (${videoMetadata.size} unique videos).`,
  );
  const additions = spots.filter(
    (spot) => spot.lat !== null && spot.lon !== null && !Object.hasOwn(links, spot.id),
  ).length;
  console.log(
    `Map merge OK: ${mapData.length} original + ${additions} new = ${mapData.length + additions} pins; ${linkedNames.size} linked records.`,
  );
  console.log(
    'Checks cover schema, IDs/references, coordinates, calendar dates/cutoff and URL syntax; they do not certify current site access or remote availability.',
  );
}
