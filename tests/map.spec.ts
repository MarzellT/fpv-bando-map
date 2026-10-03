import { test, expect, type Page } from '@playwright/test';
import type { MapLibreMap } from 'maplibre-gl';
import type { MapSpot } from '../src/data/merged';
import rawAtlas from '../src/atlas/data.json' with { type: 'json' };
import type { Dataset } from '../src/atlas/types';
import original from '../src/data/bandos.json' with { type: 'json' };
import links from '../src/data/atlas-links.json' with { type: 'json' };
const atlas = rawAtlas as Dataset;

type MapWindow = Window & { __map?: MapLibreMap; __bandos?: MapSpot[] };
let mapErrors: string[] = [];
const expectedCount =
  original.length +
  atlas.spots.filter(
    (spot) => spot.lat !== null && spot.lon !== null && !Object.hasOwn(links, spot.id),
  ).length;

async function mapState(page: Page) {
  return page.evaluate(() => {
    const map = (window as MapWindow).__map;
    if (!map) throw new Error('Map is not ready');
    return {
      center: map.getCenter().toArray(),
      zoom: map.getZoom(),
      filter: map.getFilter('bando-dots'),
      satellite: map.getLayoutProperty('esrisat', 'visibility'),
      wheel: map.scrollZoom.isEnabled(),
    };
  });
}

test.beforeEach(async ({ page }) => {
  mapErrors = [];
  page.on('pageerror', (error) => mapErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().startsWith('[map]'))
      mapErrors.push(message.text());
  });
  await page.route('https://server.arcgisonline.com/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQUdABAACsAGE+I1nmAAAAAElFTkSuQmCC',
        'base64',
      ),
    }),
  );
  await page.route('https://photon.komoot.io/api/**', (route) =>
    route.fulfill({
      json: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [13.405, 52.52] },
            properties: { name: 'Berlin', country: 'Deutschland' },
          },
        ],
      },
    }),
  );
  await page.goto('./');
  await page.waitForFunction(() => {
    const map = (window as MapWindow).__map;
    return map?.getLayer('bando-dots') && map.isSourceLoaded('bandos');
  });
});

test.afterEach(() => {
  expect(mapErrors).toEqual([]);
});

test('merges reviewed identities without losing existing pins or inventing unresolved ones', async ({
  page,
}) => {
  const records = await page.evaluate(() => (window as MapWindow).__bandos ?? []);
  expect(records).toHaveLength(expectedCount);
  expect(new Set(records.map((spot) => spot.id)).size).toBe(expectedCount);
  for (const old of original) {
    expect(
      records.some(
        (spot) =>
          spot.lat === old.lat &&
          spot.lon === old.lon &&
          (spot.name === old.name || spot.original?.name === old.name),
      ),
    ).toBe(true);
  }
  for (const spot of atlas.spots.filter((entry) => entry.lat === null)) {
    expect(records.find((entry) => entry.id === spot.id)).toBeUndefined();
  }
  await expect(page.locator('.spot-result')).toHaveCount(expectedCount);
  await page.locator('.spot-result').last().click();
  await expect(page.locator('.detail h2')).toBeVisible();
  expect(await page.locator('#sidebar').evaluate((element) => element.scrollTop)).toBe(0);
  await page.getByRole('button', { name: 'Alle Treffer' }).click();
  await page.getByLabel('Nur mit Atlas-Belegen').check();
  await expect(page.locator('.spot-result')).toHaveCount(
    atlas.spots.filter((spot) => spot.lat !== null).length,
  );
  await page.getByLabel('SPOT, ORT ODER PILOT').fill('Rüdersdorf');
  await expect(page.locator('.spot-result')).toHaveCount(1);
});

test('optional origin changes distances but preserves camera and pins; wheel and satellite work', async ({
  page,
}) => {
  const input = page.getByRole('combobox', { name: 'Entfernung ab' });
  await expect(input).toHaveValue('');
  const before = await mapState(page);
  expect(before.wheel).toBe(true);
  await input.fill('Berlin');
  await page.getByRole('option', { name: /Berlin/ }).click();
  await expect(page.locator('#list-count')).toContainText('Luftlinie ab Berlin');
  expect(await mapState(page)).toEqual(before);
  await expect(page.locator('.spot-result')).toHaveCount(expectedCount);
  await page.getByRole('button', { name: 'Ort entfernen' }).click();
  expect(await mapState(page)).toEqual(before);
  const bounds = await page.locator('#map').boundingBox();
  if (!bounds) throw new Error('Map bounds unavailable');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, -500);
  await expect.poll(async () => (await mapState(page)).zoom).toBeGreaterThan(before.zoom);
  await page.getByRole('button', { name: 'Satellit', exact: true }).click();
  expect((await mapState(page)).satellite).toBe('visible');
});

test('merged detail exposes evidence and separate coordinate sources with ordinary Maps links', async ({
  page,
}) => {
  await page.getByLabel('SPOT, ORT ODER PILOT').fill('Rüdersdorf');
  await page.locator('.spot-result').click();
  await expect(page.locator('.detail h2')).toHaveText('Chemiewerk Rüdersdorf');
  await expect(page.locator('.evidence')).toContainText('Veröffentlichungstage');
  const links = await page
    .locator('.detail a[href*="google.com/maps/"]')
    .evaluateAll((elements) => elements.map((el) => el.getAttribute('href')));
  expect(links.length).toBeGreaterThan(0);
  for (const link of links)
    expect(link).toMatch(/^https:\/\/www.google.com\/maps\/search\/\?api=1&query=/);
  await expect(page.locator('.evidence a[href*="youtube.com/watch"]')).not.toHaveCount(0);
  await page.locator('.legacy-record summary').click();
  await expect(page.locator('.legacy-record')).toContainText(
    'Der bisherige Kartenpunkt bleibt erhalten',
  );
  await page.getByRole('link', { name: 'Dossier im Atlas öffnen' }).click();
  await expect(page).toHaveURL(/\/fpv-bando-map\/atlas\/\?spot=ruedersdorf/);
  await expect(page.locator('#spot-dialog')).toBeVisible();
});

test('mobile navigation keeps the map usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Pilotennetz' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const bounds = await page.locator('#map').boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(180);
  await page.getByRole('navigation').getByRole('link', { name: 'Pilotennetz' }).click();
  await expect(page).toHaveURL(/\/fpv-bando-map\/netzwerk\//);
  await expect(page.locator('.network-summary')).toContainText(String(atlas.pilots.length));
});
