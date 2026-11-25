# STEMAI, the STEM Accessibility Index

A map of K-12 STEM program locations in the US shown next to demographic data
for the surrounding area. You explore the data and draw your own conclusions.
The site does not rank places and does not claim a cause for why any area has
more or fewer programs.

**Live site: https://laurenpea.github.io/stemai/**

Right now the map includes FIRST Robotics Competition (FRC) and FIRST Tech
Challenge (FTC) teams. Project Lead The Way and other program types are planned
and are not in the map yet.

## Pages

- **Map** - every program as a marker, with filters for state, median household
  income and program type, plus a popup with the ZIP area demographics. The
  same programs are listed in a table under the map for screen reader and
  keyboard users
- **Research** - summaries of published research on early STEM exposure and
  access, each one linked to its source
- **Context** - the problem, the programs, and the resources that already exist
- **Methodology** - every data source, how the data was cleaned and joined, and
  the limitations

## Running it locally

```
npm install
npm run dev
```

`npm run build` makes the production build in `dist`.

## Rebuilding the data

The site reads static files in `public/data`: `programs.json` and
`cleaningReport.json` for FRC, and `ftcPrograms.json` and `ftcReport.json` for
FTC. All are committed, so the site and CI build without any API keys.

FTC data comes from the FTCScout public API and needs no key:
`npm run data:ftc`.

To rebuild the FRC data:

1. Get a free read API key from
   [The Blue Alliance account page](https://www.thebluealliance.com/account).
2. Make a `.env` file in this folder with one line:
   ```
   TBA_KEY=your_key_here
   ```
3. Run `npm run data:frc` (or `npm run data` to rebuild FRC and FTC).
4. Run `npm run checkdata` to verify the result.

`.env` is in `.gitignore`, so keys are never committed.

Census data comes from the public ACS summary files and needs no key. If you do
have a free [Census API key](https://api.census.gov/data/key_signup.html), add
`CENSUS_KEY=your_key_here` to `.env` and the script will use the faster API
instead.

Downloads are cached in `.cache`, which is also gitignored, so re-running the
script is quick.

## Data sources

- Program locations: [The Blue Alliance API v3](https://www.thebluealliance.com/apidocs/v3)
- Demographics: [Census ACS 5-year estimates](https://www.census.gov/data/developers/data-sets/acs-5year.html) at the ZCTA level
- ZIP area locations: [Census ZCTA Gazetteer files](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html)
- Base map: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site and
publishes it to GitHub Pages. Pages must be set to build from GitHub Actions in
the repository settings.

## Accessibility

- Skip link, a page title per route, and focus moves to the page heading on
  navigation so screen readers announce the new page
- Map markers and cluster bubbles have spoken names and are reachable by
  keyboard; focus moves into a popup when it opens and back to the marker
  when it closes
- Every program on the map is also in a paginated data table
- Program types differ by shape as well as color (Okabe-Ito palette)
- Colors are defined in `src/tokens.css`, with the checked contrast ratio
  next to each one
