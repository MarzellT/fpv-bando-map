# Atlas integration — 3 October 2026

The existing FPV Bando Map remains the main application, including its MapLibre worker configuration, map tiles, satellite layer, camera links and Pages deployment. Atlas dossiers and the pilot network are additional entry pages built in the same Vite project.

Imported curated Atlas snapshot: `bee5bdf`. Counts: 55 dossiers, 52 coordinate-bearing records, 89 channels, 85 relationships and 100 distinct videos. Personal preset origins were removed; the free place search starts empty. Research cutoffs and historical publication dates were preserved. This integration is not a new survey of the locations.

## Identity and coordinates

The 33 reviewed matches in `src/data/atlas-links.json` attach evidence to existing records. The remaining 19 geolocated Atlas records add pins. Three records without coordinates remain in the Atlas only. The combined map contains 568 pins.

A shared facility identity does not prove two coordinates identify the same building. Existing map coordinates are retained and different Atlas coordinates are explicitly linked separately. Examples include Area One (an older municipality-level point), the broad Gail and Göttelborn complexes, and the approximate Salzmünde works location. Salzmünde retains its uncertain attribution to an individual filmed hall.

The Wiesbaden match joins the historic Bierstadt brickworks record to its Atlas dossier. A [municipal resolution of 11 December 2025](https://piwi.wiesbaden.de/dokument/v/3581824) describes the former Nauroder Straße brickworks and surviving Ringofen. The [municipal planning-area resolution](https://piwi.wiesbaden.de/dokument/v/3356717) explicitly names Nath und Oeder in Bierstadt. The match is an inference from this shared identity; it does not verify the community coordinate. The original and Atlas positions differ by approximately 1.99 km and remain separately attributed.

## Evidence and access

Atlas evidence is shown before older map prose. Original records are preserved unchanged in `src/data/bandos.json` and in the detail-card disclosure. This matters where an older record described a place as open or enterable while newer evidence reports damage, reuse or uncertainty. Neither the merge nor the presence of FPV footage grants access or flight permission.

Video dates are publication dates unless an individual note explicitly identifies a filming date. Joint sessions, visits to the same site on different occasions and public references remain distinct relationship types.

## Further updates

Maintain `src/atlas/data.json` for sourced place, video and network updates. Add a reviewed link in `src/data/atlas-links.json` when the place already exists in the original map. The data checker rejects broken identities, duplicate links and invalid references. Preserve null coordinates for unresolved locations and retain the dated historical selection.

The existing local weekly runner is adapted to the merged data paths. Its systemd schedule is unchanged; the website does not execute it. Private work logs and browser caches were not migrated. Future published protocols must contain public source evidence only.
