import { expect, test } from '@playwright/test';
import rawData from '../src/atlas/data.json' with { type: 'json' };
import type { Dataset } from '../src/atlas/types';

const data = rawData as Dataset;

const mappableSpots = data.spots.filter(
  (spot) => spot.lat !== null && spot.lon !== null && spot.confidence !== 'open',
);

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    await route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQUdABAACsAGE+I1nmAAAAAElFTkSuQmCC',
        'base64',
      ),
    });
  });
  await page.route('https://i.ytimg.com/**', async (route) => {
    await route.abort();
  });
  await page.route('https://photon.komoot.io/**', async (route) => {
    await route.fulfill({
      json: {
        features: [
          {
            geometry: { coordinates: [13.405, 52.52] },
            properties: { name: 'Berlin', city: 'Berlin', country: 'Deutschland' },
          },
        ],
      },
    });
  });
});

test('blank origin shows every spot and independent map pins under the Pages path', async ({
  page,
}) => {
  await page.goto('atlas/');
  await expect(page.locator('#origin-search')).toHaveValue('');
  await expect(page.locator('.spot-card')).toHaveCount(data.spots.length);
  await expect(page.locator('.atlas-marker')).toHaveCount(mappableSpots.length);
  await expect(page.locator('#radius')).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Hauptkarte', exact: true })).toHaveAttribute(
    'href',
    '../',
  );
  await expect(page).toHaveURL(/\/fpv-bando-map\/atlas\/$/);
});

test('origin and list radius change results without moving or replacing map pins', async ({
  page,
}) => {
  await page.goto('atlas/');
  const markers = page.locator('.atlas-marker');
  await expect(markers).toHaveCount(mappableSpots.length);
  const positionsBefore = await markers.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('style')),
  );
  const paneBefore = await page.locator('.leaflet-map-pane').getAttribute('style');
  await page.locator('#origin-search').fill('Berlin');
  await page.getByRole('option', { name: 'Berlin Berlin · Deutschland' }).click();
  await page.locator('#radius').selectOption('50');
  await expect(page.locator('#result-count')).toContainText('Luftlinie ab Berlin');
  await expect.poll(async () => page.locator('.spot-card').count()).toBeLessThan(data.spots.length);
  await expect(page.locator('.spot-card').first()).toBeVisible();
  await expect(markers).toHaveCount(mappableSpots.length);
  expect(
    await markers.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('style')),
    ),
  ).toEqual(positionsBefore);
  expect(await page.locator('.leaflet-map-pane').getAttribute('style')).toBe(paneBefore);
  await page.getByRole('button', { name: 'Ort entfernen', exact: true }).click();
  await expect(page.locator('.spot-card')).toHaveCount(data.spots.length);
  await expect(page.locator('#origin-search')).toHaveValue('');
});

test('dossier deep link exposes sources and a normal coordinate search', async ({ page }) => {
  await page.goto('atlas/?spot=camp-hitfeld');
  await expect(page.locator('#spot-dialog')).toBeVisible();
  await expect(page.locator('#spot-title')).toContainText('Camp Hitfeld');
  const mapLink = page.getByRole('link', { name: 'Auf Google Maps öffnen' });
  const href = await mapLink.getAttribute('href');
  expect(href).toBeTruthy();
  const url = new URL(href ?? '');
  expect(url.origin + url.pathname).toBe('https://www.google.com/maps/search/');
  expect(url.searchParams.get('api')).toBe('1');
  expect(url.searchParams.get('query')).toBe('50.73164,6.1305');
  await expect(page.locator('.source-link').first()).toBeVisible();
  await page.getByRole('button', { name: 'Spotdetails schließen' }).click();
  await expect(page.locator('#spot-dialog')).not.toBeVisible();
  await expect(page).not.toHaveURL(/spot=/);
});

test('network selections and filters survive switching between 2D and 3D', async ({ page }) => {
  await page.goto('netzwerk/');
  const node = page.locator('.pilot-node').first();
  const pilotId = await node.getAttribute('data-pilot');
  const pilot = data.pilots.find((candidate) => candidate.id === pilotId);
  expect(pilot).toBeDefined();
  await node.focus();
  await page.keyboard.press('Enter');
  await expect(node).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#pilot-detail h2')).toHaveText(pilot?.name ?? '');
  await page.locator('#edge-filter').selectOption('session');
  const sessionCount = data.edges.filter(
    (edge) => edge.type === 'session' && (edge.sourceId === pilotId || edge.targetId === pilotId),
  ).length;
  await expect(page.locator('.edge-evidence')).toHaveCount(sessionCount);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.locator('.network-3d-canvas')).toBeVisible();
  await expect(page.locator('#graph')).toBeHidden();
  await page.locator('#edge-filter').selectOption('reference');
  const referenceCount = data.edges.filter(
    (edge) => edge.type === 'reference' && (edge.sourceId === pilotId || edge.targetId === pilotId),
  ).length;
  await expect(page.locator('.edge-evidence')).toHaveCount(referenceCount);
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(node).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#edge-filter')).toHaveValue('reference');
  await page.locator('.pilot-spot').first().click();
  await expect(page).toHaveURL(/\/fpv-bando-map\/atlas\/\?spot=/);
  await expect(page.locator('#spot-dialog')).toBeVisible();
});

test('dated selection links reach the Atlas dossier and shared navigation', async ({ page }) => {
  await page.goto('auswahl/');
  await expect(page.locator('.hero time')).toHaveAttribute('datetime', '2026-10-03');
  await expect(page.getByRole('link', { name: 'Hauptkarte', exact: true })).toHaveAttribute(
    'href',
    '../',
  );
  await expect(page.getByRole('link', { name: 'Pilotennetz', exact: true })).toHaveAttribute(
    'href',
    '../netzwerk/',
  );
  await page.getByRole('link', { name: 'Im Atlas ansehen →', exact: true }).first().click();
  await expect(page).toHaveURL(/\/fpv-bando-map\/atlas\/\?spot=camp-hitfeld$/);
  await expect(page.locator('#spot-title')).toContainText('Camp Hitfeld');
});
