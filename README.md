# Find ODS codes for GP surgeries

A prototype that helps people find the ODS codes of open GP surgeries in the areas they choose.

> [!IMPORTANT]
> This is a prototype for user research. It is not a live NHS service. The data is a snapshot and may be out of date, so do not rely on it for real decisions.

## What it does

People choose a type of area, select areas of that type, and get a list of the GP surgeries in them, with their ODS (Organisation Data Service) codes.

There are 2 ways in:

1. **Choose areas on a map** (`/`). People pick a type of area, then select one or more areas on a map, or from a list instead of the map. The area types are:
   - region
   - local authority district
   - ward
   - parish
   - built-up area

   Smaller areas (wards, parishes and built-up areas) appear when people zoom in.
2. **Choose regions from a list** (`/regions`). People tick 1 or more of the 9 English regions.

The results page shows:

- how many GP surgeries were found
- a box with every ODS code, 1 on each line, ready to copy
- a map with the chosen areas shaded and each surgery as a dot, so people can check they chose the right places
- a list of the surgeries, 25 on each page, with their address and phone number

### Which surgeries are included

A GP surgery is included if it is:

- in the ODS GP practices report (`epraccur`)
- `ACTIVE`
- has the GP practice role, `RO76`, in its prescribing setting

Surgeries are placed using the location of their postcode, from the ONS National Statistics Postcode Lookup (NSPL):

- **Regions** are matched using the region code the NSPL gives the postcode.
- **Other areas** are matched by checking which area's boundary the postcode's location falls inside, using the full-detail boundaries. The data build works this out once and stores it with each surgery.

We do not use the NSPL's ward and district codes, because they can come from a different year than the boundaries on planning.data.gov.uk. The NSPL also has no parish codes.

Practices in Wales are left out, because their postcodes are not in an English region. The data build lists them in `app/data/gp-practices-unmatched.json`.

## Before you start

You need:

- Node.js: a version that matches `engines` in `package.json` (currently `^22.16.0`, `^24.11.0` or `>= 26.13.0`). `.nvmrc` names the version we use
- npm
- Git

To rebuild the data (most people do not need to), you also need:

- about 1.5GB of free disk space for the source files
- about 4GB of free memory while the build runs

## Install and run

```bash
git clone <this repository's URL>
```

```bash
cd find-an-ods-code
```

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:3000.

The data the prototype needs is already in the repository, in `app/data/`, so you do not need to build it to run the prototype. The prototype does not call any data services while it runs. The only thing it loads from the internet is the map background (tiles) from OpenStreetMap.

To change the port, edit `app/config.js`.

## Rebuild the data

Rebuild the data when you want newer GP practice, postcode or boundary data.

### 1. Get the source files

| File | Where to get it | Where to put it |
|---|---|---|
| ODS GP practices report, `epraccur.csv` | [ODS Data Search and Export](https://www.odsdatasearchandexport.nhs.uk/), report "GP Practices" (`epraccur`). The columns are described on the "GP Practices (Prescribing Cost Centres)" page of the ODS Reference Data Catalogue | `app/data/epraccur.csv` |
| ONS National Statistics Postcode Lookup (NSPL), the UK CSV | [ONS Open Geography Portal](https://geoportal.statistics.gov.uk/). Search for "National Statistics Postcode Lookup" and download the latest edition. Unzip it | the main `NSPL_*_UK.csv` file in `data-sources/nspl/` |
| Area boundaries from planning.data.gov.uk | run `npm run areas:download`, which saves the region, local authority district, ward, parish and built-up area datasets (about 475MB) | `data-sources/planning-data/` (the script does this) |

`data-sources/` is in `.gitignore`, because the files are too big to commit.

The build finds the NSPL columns by name pattern (for example `rgn` followed by 2 digits and `cd`), so newer editions should work without code changes.

### 2. Run the build

```bash
npm run areas:download
```

```bash
npm run data:build
```

The build does not call any websites. It writes:

| File | What it has |
|---|---|
| `app/data/gp-practices.json` | open GP practices with their address, phone number, ICB code, region, postcode location and the areas they are in |
| `app/data/regions.json` | the 9 English regions, in ONS order, with a count of practices |
| `app/data/gp-practices-unmatched.json` | practices that could not be given an English region, with the reason |
| `app/data/areas/<type>.geojson.gz` | simplified area boundaries for the maps |

It prints a summary: practices read, kept, matched and unmatched, the count per region, and how many practices are not in any area of each type. Many practices are not in a parish. This is expected, because large towns and cities such as most of London are not parished.

If the prototype is running while you rebuild, restart it afterwards with `npm start`.

## Run the tests

The first time, install the browser the tests use:

```bash
npx playwright install chromium
```

Then run all the tests:

```bash
npm run test:all
```

Or run each set on its own:

| Command | What it runs |
|---|---|
| `npm test` | unit tests (Node's built-in test runner) for the data build, branching, filtering, matching and map helpers. They use small made-up files in `tests/fixtures/` |
| `npm run test:e2e` | Playwright journey tests on a phone-sized screen and a desktop screen, with automated accessibility checks (axe, WCAG 2.2 A and AA) on every page |

The journey tests start their own copy of the prototype on port 3100, so they can run while you have the prototype open on port 3000. They block the OpenStreetMap tiles, so they do not need the internet.

Automated checks find only some accessibility problems. Also check pages with a keyboard only, with a screen reader, and at 400% zoom.

## How the code is organised

| Path | What it is |
|---|---|
| `app/views/` | page templates (Nunjucks). `index.html` is the map, `regions.html` the list of regions, and `gp-surgeries.html` the results |
| `app/routes.js` | routes and branching. These are kept thin |
| `app/lib/` | logic that is unit tested: area types, the area store, matching, filtering, pagination and the data build |
| `app/javascripts/area-map.js` | the map for choosing areas |
| `app/javascripts/surgeries-map.js` | the map on the results pages |
| `app/data/` | data built by `npm run data:build` |
| `scripts/` | `download-areas.js` and `build-gp-practices.js` |
| `tests/unit/`, `tests/e2e/` | unit and journey tests |

The prototype is built with the [NHS prototype kit](https://prototype-kit.service-manual.nhs.uk/) and [NHS.UK frontend](https://service-manual.nhs.uk/design-system). Maps use [Leaflet](https://leafletjs.com/).

Wording written as a placeholder is marked in the templates with `CONTENT:` comments, so a content designer can review it.

## Publishing the prototype

- Published prototypes must be password-protected. The NHS prototype kit has a password page. Do not commit a password to the repository. See the kit's [publishing guide](https://prototype-kit.service-manual.nhs.uk/guides).
- The running prototype keeps area boundaries in memory once they have been used. With every area type loaded, it uses up to about 400MB, so choose a host with enough memory.
- The map background uses OpenStreetMap's tile server. Its [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) allows light use like a prototype, but there is no guarantee of service, and access can be withdrawn without notice. A live service should use a tile provider with a service agreement.

## Licences

### Code

The code in this repository is released under the [MIT licence](LICENSE).

The MIT licence covers only the code. It does not cover the data listed below, or the NHS logo and brand. These keep their own licences and terms, and including them in this repository does not change those terms.

### Data

The prototype uses, and this repository includes data derived from, the following sources. If you reuse the data, follow each source's licence and include its attribution statement.

| Data | Used for | Licence | Attribution |
|---|---|---|---|
| ODS GP practices report (`epraccur`), from NHS England. NHS Prescription Services supplies the GP practice data | the GP surgeries, their ODS codes, addresses and phone numbers | [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/), under the [NHS England Digital terms and conditions](https://digital.nhs.uk/about-nhs-digital/terms-and-conditions) (section 8) | Contains information from NHS England, licenced under the current version of the Open Government Licence |
| ONS National Statistics Postcode Lookup (NSPL) | the location and region of each surgery's postcode | [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). See the [ONS geography licences page](https://www.ons.gov.uk/methodology/geography/licences) | Source: Office for National Statistics licensed under the Open Government Licence v.3.0<br>Contains OS data © Crown copyright and database right 2026<br>Contains Royal Mail data © Royal Mail copyright and database right 2026 |
| Region, local authority district, ward, parish and built-up area boundaries, from [planning.data.gov.uk](https://www.planning.data.gov.uk/) (Ministry of Housing, Communities and Local Government) | the shapes on the maps, region names, and which areas each surgery is in | [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) | Source: Office for National Statistics licensed under the Open Government Licence v.3.0<br>Contains OS data © Crown copyright and database right 2026 |
| [OpenStreetMap](https://www.openstreetmap.org/) map tiles, loaded while the prototype runs and not stored in this repository | the map background | Data: [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/). Use of the tile server: [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) | © OpenStreetMap contributors, linking to https://www.openstreetmap.org/copyright. The maps show this in the bottom-right corner |

Notes:

- **Northern Ireland postcodes:** the NSPL includes Northern Ireland postcodes (starting `BT`), which have their own, more restrictive licence from Land and Property Services. This repository does not include the NSPL. The data built from it only covers practices in English regions, so it contains no Northern Ireland postcode data.
- **ODS data licence:** the ODS download pages do not have their own licence statement. The licence and attribution above come from the NHS England Digital site's general terms. Check with the ODS team before using the data beyond this prototype.
- **NHS logo and brand:** the Open Government Licence does not cover logos. The NHS logo and brand are not covered by this repository's licence. Follow the [NHS identity guidelines](https://www.england.nhs.uk/nhsidentity/).
- **Attribution in the prototype:** the maps show the OpenStreetMap attribution. The other attribution statements are in this README but are not shown on the prototype's pages yet.

### Software this prototype uses

These keep their own licences:

| Package | Licence |
|---|---|
| [NHS prototype kit](https://github.com/nhsuk/nhsuk-prototype-kit-package) (`nhsuk-prototype-kit`) | MIT |
| [NHS.UK frontend](https://github.com/nhsuk/nhsuk-frontend) (`nhsuk-frontend`) | MIT |
| [Leaflet](https://github.com/Leaflet/Leaflet) (`leaflet`) | BSD 2-Clause |
| [Playwright](https://github.com/microsoft/playwright) (`@playwright/test`, for testing only) | Apache 2.0 |
| [axe-core for Playwright](https://github.com/dequelabs/axe-core-npm) (`@axe-core/playwright`, for testing only) | MPL 2.0 |
