// builds public/data/ftcPrograms.json and public/data/ftcReport.json
// FIRST Tech Challenge teams from FTCScout, which needs no API key.
// run with: npm run data:ftc
import fs from 'node:fs'
import path from 'node:path'
import {
  outDir, acsYear, gazYear, toStateCode, toNum, pct,
  getAcsFromFiles, getZipPoints, readGazetteer,
} from './shared.mjs'

const ftcApi = 'https://api.ftcscout.org/graphql'
// most recent season that has finished. FTCScout lists every team under the
// current season, so we only keep teams that competed last season or are
// rookies this season
const lastSeason = 2025
const thisSeason = 2026

async function getTeams() {
  console.log('downloading FTC teams from FTCScout (this takes a minute or two)')
  const query = `{ teamsSearch(limit: 100000, region: UnitedStates) {
    number name schoolName rookieYear activeSeasons
    location { city state country } } }`
  const res = await fetch(ftcApi, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`FTCScout failed (${res.status})`)
  const body = await res.json()
  if (body.errors) throw new Error(`FTCScout error: ${body.errors[0].message}`)
  return body.data.teamsSearch
}

// "Saint Louis city" and "St. Louis" should both become "saint louis"
const suffixes = /\s+(city and borough|consolidated government|metro government|metropolitan government|unified government|urban county|city|town|village|borough|township|municipality|plantation|cdp|charter township|comunidad|zona urbana)$/
export function cityKey(name) {
  let s = String(name || '').toLowerCase().trim()
  s = s.replace(/\(.*?\)/g, ' ').replace(/,.*$/, '')
  s = s.replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 2; i++) s = s.replace(suffixes, '')
  s = s.replace(/^st\.?\s+/, 'saint ').replace(/^ft\.?\s+/, 'fort ').replace(/^mt\.?\s+/, 'mount ')
  s = s.replace(/^mc\s+/, 'mc').replace(/^urban\s+/, '')
  s = s.replace(/[.'’]/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  return s
}

// "East Greenwich RI" -> "East Greenwich"
function cleanTeamCity(city, state) {
  return String(city || '').trim().replace(new RegExp(`\\s+${state}$`, 'i'), '')
}

// state + city -> best center point. incorporated places beat CDPs, places
// beat county subdivisions (which cover New England towns), and bigger land
// area breaks ties
async function getCityPoints() {
  const index = new Map()
  const add = (row, rank, name = row.NAME) => {
    const key = `${row.USPS}|${cityKey(name)}`
    const lat = Number(row.INTPTLAT)
    const lng = Number(row.INTPTLONG)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    const cand = { lat, lng, rank, land: Number(row.ALAND) || 0 }
    const old = index.get(key)
    if (!old || cand.rank < old.rank || (cand.rank === old.rank && cand.land > old.land)) {
      index.set(key, cand)
    }
  }
  for (const row of await readGazetteer('place')) {
    add(row, row.FUNCSTAT === 'A' ? 0 : 1)
    // consolidated city-counties like "Athens-Clarke County" are also known
    // by the first part of the name
    const first = row.NAME.match(/^([^-]+)-.*\b(county|government)\b/i)
    if (first) add(row, 3, first[1])
  }
  for (const row of await readGazetteer('cousubs')) {
    if (/\b(CCD|UT|unorganized)\b/i.test(row.NAME)) continue
    add(row, 2)
  }
  return index
}

function nearestZip(lat, lng, zipList) {
  const cos = Math.cos((lat * Math.PI) / 180)
  let best = null
  let bestD = Infinity
  for (const z of zipList) {
    const dy = z.lat - lat
    const dx = (z.lng - lng) * cos
    const d = dx * dx + dy * dy
    if (d < bestD) { bestD = d; best = z }
  }
  // degrees to km, rough
  return { zip: best.zip, km: Math.sqrt(bestD) * 111 }
}

async function main() {
  const teams = await getTeams()
  const acs = await getAcsFromFiles()
  const zipPoints = await getZipPoints()
  const zipList = Object.entries(zipPoints).map(([zip, [lat, lng]]) => ({ zip, lat, lng }))
  const cityPoints = await getCityPoints()

  const dropped = { notUs: 0, noState: 0, inactive: 0, noLocation: 0 }
  const seen = new Set()
  let duplicates = 0
  let joined = 0
  const unmatchedCities = []
  const programs = []

  for (const t of teams) {
    const loc = t.location || {}
    if (!/^(usa|united states)$/i.test(String(loc.country || '').trim())) { dropped.notUs++; continue }
    const state = toStateCode(loc.state)
    if (!state) { dropped.noState++; continue }
    const seasons = t.activeSeasons || []
    const active = seasons.includes(lastSeason) || t.rookieYear === thisSeason
    if (!active) { dropped.inactive++; continue }
    if (seen.has(t.number)) { duplicates++; continue }

    const point = cityPoints.get(`${state}|${cityKey(cleanTeamCity(loc.city, state))}`)
    if (!point) {
      dropped.noLocation++
      unmatchedCities.push(`${loc.city}, ${state}`)
      continue
    }
    seen.add(t.number)

    const near = nearestZip(point.lat, point.lng, zipList)
    const d = acs[near.zip] || null
    if (d) joined++

    programs.push({
      id: `ftc-${t.number}`,
      name: t.name ? `FTC ${t.number} ${t.name}` : `FTC ${t.number}`,
      type: 'FIRST Tech Challenge (FTC)',
      org: t.schoolName || null,
      address: null,
      city: loc.city || null,
      state,
      zip: near.zip,
      lat: Math.round(point.lat * 100000) / 100000,
      lng: Math.round(point.lng * 100000) / 100000,
      geoLevel: 'city',
      source: 'FTCScout API',
      totalPop: d ? toNum(d.B01003_001E) : null,
      medIncome: d ? toNum(d.B19013_001E) : null,
      povertyPct: d ? pct(d.B17001_002E, d.B17001_001E) : null,
      pctWhite: d ? pct(d.B03002_003E, d.B03002_001E) : null,
      pctBlack: d ? pct(d.B03002_004E, d.B03002_001E) : null,
      pctAsian: d ? pct(d.B03002_006E, d.B03002_001E) : null,
      pctHispanic: d ? pct(d.B03002_012E, d.B03002_001E) : null,
    })
  }

  programs.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))

  const report = {
    buildDate: new Date().toISOString().slice(0, 10),
    acsYear,
    gazetteerYear: gazYear,
    seasonKept: `${lastSeason}-${String(lastSeason + 1).slice(2)} competitors and ${thisSeason}-${String(thisSeason + 1).slice(2)} rookies`,
    rawTeams: teams.length,
    finalPrograms: programs.length,
    duplicatesRemoved: duplicates,
    dropped: {
      total: dropped.notUs + dropped.noState + dropped.inactive + dropped.noLocation,
      outsideUs: dropped.notUs,
      noUsableStateCode: dropped.noState,
      notActive: dropped.inactive,
      cityNotFound: dropped.noLocation,
    },
    geocodedCityCenter: programs.length,
    withDemographics: joined,
    withDemographicsPct: Math.round((joined / programs.length) * 1000) / 10,
    programTypes: ['FIRST Tech Challenge (FTC)'],
    sources: {
      programs: 'https://ftcscout.org/api',
      demographics: `https://www.census.gov/data/developers/data-sets/acs-5year.html (ACS 5-year ${acsYear}, ZCTA level)`,
      geocoding: `https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html (${gazYear} place, county subdivision and ZCTA gazetteers)`,
    },
  }

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'ftcPrograms.json'), JSON.stringify(programs))
  fs.writeFileSync(path.join(outDir, 'ftcReport.json'), JSON.stringify(report, null, 2))

  console.log('\n--- STEMAI FTC data build ---')
  console.log(JSON.stringify(report, null, 2))
  console.log(`sample unmatched cities: ${unmatchedCities.slice(0, 25).join('; ')}`)
}

main().catch((err) => {
  console.error(`\nbuild failed: ${err.message}`)
  process.exit(1)
})
