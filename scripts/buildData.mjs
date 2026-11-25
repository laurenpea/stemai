// builds public/data/programs.json and public/data/cleaningReport.json
// run with: npm run data
import fs from 'node:fs'
import path from 'node:path'
import {
  loadEnv, outDir, acsYear, gazYear, acsVars, toStateCode, toZip, toNum, pct,
  getAcsFromFiles, getZipPoints,
} from './shared.mjs'

loadEnv()

const tbaKey = process.env.TBA_KEY
const censusKey = process.env.CENSUS_KEY

if (!tbaKey) {
  console.error(`
TBA_KEY is missing.

1. Make a free account at https://www.thebluealliance.com/account
2. Under "Read API Keys" add a key with any description and copy it
3. In the project folder create a file called .env with this one line:

   TBA_KEY=your_key_here

4. Run npm run data again

.env is already in .gitignore so the key never gets committed.
`)
  process.exit(1)
}

// STEP A - FRC teams from The Blue Alliance
async function getTeams() {
  const teams = []
  for (let page = 0; page < 40; page++) {
    const res = await fetch(`https://www.thebluealliance.com/api/v3/teams/${page}`, {
      headers: { 'X-TBA-Auth-Key': tbaKey },
    })
    if (res.status === 401) throw new Error('TBA rejected the key. Check TBA_KEY in .env')
    if (!res.ok) throw new Error(`TBA page ${page} failed (${res.status})`)
    const rows = await res.json()
    if (rows.length === 0) break
    teams.push(...rows)
    console.log(`tba page ${page}: ${rows.length} teams (total ${teams.length})`)
  }
  return teams
}

async function getAcsFromApi() {
  console.log('using the Census API (CENSUS_KEY found)')
  const url = `https://api.census.gov/data/${acsYear}/acs/acs5?get=${acsVars.join(',')}&for=zip%20code%20tabulation%20area:*&key=${censusKey}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Census API failed (${res.status})`)
  const rows = await res.json()
  const header = rows[0]
  const byZip = {}
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const rec = {}
    header.forEach((h, j) => { rec[h] = row[j] })
    const zip = toZip(rec['zip code tabulation area'])
    if (zip) byZip[zip] = rec
  }
  return byZip
}

async function main() {
  const teams = await getTeams()
  const acs = censusKey ? await getAcsFromApi() : await getAcsFromFiles()
  const zipPoints = await getZipPoints()
  console.log(`acs zip areas: ${Object.keys(acs).length}, gazetteer zip points: ${Object.keys(zipPoints).length}`)

  const dropped = { notUs: 0, noState: 0, noLocation: 0, placeholder: 0 }
  const seen = new Set()
  let duplicates = 0
  let exactCount = 0
  let zipCount = 0
  let joined = 0
  const programs = []

  for (const t of teams) {
    // TBA has placeholder rows like "Team 2" with no real info
    if (!t.nickname && !t.school_name && !t.city) { dropped.placeholder++; continue }

    if (t.country && !/^(usa|united states)$/i.test(String(t.country).trim())) { dropped.notUs++; continue }

    const state = toStateCode(t.state_prov)
    if (!state) { dropped.noState++; continue }

    if (seen.has(t.team_number)) { duplicates++; continue }

    const zip = toZip(t.postal_code)
    let lat = toNum(t.lat)
    let lng = toNum(t.lng)
    let geoLevel = 'exact'

    if (lat === null || lng === null) {
      const point = zip ? zipPoints[zip] : null
      if (!point) { dropped.noLocation++; continue }
      lat = point[0]
      lng = point[1]
      geoLevel = 'zip'
    }

    seen.add(t.team_number)
    if (geoLevel === 'exact') exactCount++
    else zipCount++

    const d = (zip && acs[zip]) || null
    if (d) joined++

    programs.push({
      id: `frc-${t.team_number}`,
      name: t.nickname ? `FRC ${t.team_number} ${t.nickname}` : `FRC ${t.team_number}`,
      type: 'FIRST Robotics (FRC)',
      org: t.school_name || null,
      address: t.address || null,
      city: t.city || null,
      state,
      zip,
      lat: Math.round(lat * 100000) / 100000,
      lng: Math.round(lng * 100000) / 100000,
      geoLevel,
      source: 'The Blue Alliance API v3',
      totalPop: d ? toNum(d.B01003_001E) : null,
      medIncome: d ? toNum(d.B19013_001E) : null,
      povertyPct: d ? pct(d.B17001_002E, d.B17001_001E) : null,
      pctWhite: d ? pct(d.B03002_003E, d.B03002_001E) : null,
      pctBlack: d ? pct(d.B03002_004E, d.B03002_001E) : null,
      pctAsian: d ? pct(d.B03002_006E, d.B03002_001E) : null,
      pctHispanic: d ? pct(d.B03002_012E, d.B03002_001E) : null,
    })
  }

  programs.sort((a, b) => a.id.localeCompare(b.id))

  const report = {
    buildDate: new Date().toISOString().slice(0, 10),
    acsYear,
    gazetteerYear: gazYear,
    rawTeams: teams.length,
    finalPrograms: programs.length,
    duplicatesRemoved: duplicates,
    dropped: {
      total: dropped.notUs + dropped.noState + dropped.noLocation + dropped.placeholder,
      placeholderOrEmptyRow: dropped.placeholder,
      outsideUs: dropped.notUs,
      noUsableStateCode: dropped.noState,
      noUsableLocation: dropped.noLocation,
    },
    geocodedExact: exactCount,
    geocodedZipCenter: zipCount,
    withDemographics: joined,
    withDemographicsPct: Math.round((joined / programs.length) * 1000) / 10,
    programTypes: ['FIRST Robotics (FRC)'],
    sources: {
      programs: 'https://www.thebluealliance.com/apidocs/v3',
      demographics: `https://www.census.gov/data/developers/data-sets/acs-5year.html (ACS 5-year ${acsYear}, ZCTA level)`,
      geocoding: `https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html (${gazYear} ZCTA gazetteer)`,
    },
  }

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'programs.json'), JSON.stringify(programs))
  fs.writeFileSync(path.join(outDir, 'cleaningReport.json'), JSON.stringify(report, null, 2))

  const sizeMb = fs.statSync(path.join(outDir, 'programs.json')).size / 1024 / 1024

  console.log('\n--- STEMAI data build ---')
  console.log(`build date           ${report.buildDate}`)
  console.log(`ACS year             ${report.acsYear} (5-year, ZCTA)`)
  console.log(`raw teams from TBA   ${report.rawTeams}`)
  console.log(`dropped              ${report.dropped.total}`)
  console.log(`  empty rows         ${report.dropped.placeholderOrEmptyRow}`)
  console.log(`  outside the US     ${report.dropped.outsideUs}`)
  console.log(`  no state code      ${report.dropped.noUsableStateCode}`)
  console.log(`  no usable location ${report.dropped.noUsableLocation}`)
  console.log(`duplicates removed   ${report.duplicatesRemoved}`)
  console.log(`final programs       ${report.finalPrograms}`)
  console.log(`  exact lat/lng      ${report.geocodedExact}`)
  console.log(`  zip center         ${report.geocodedZipCenter}`)
  console.log(`with demographics    ${report.withDemographics} (${report.withDemographicsPct}%)`)
  console.log(`programs.json size   ${sizeMb.toFixed(2)} MB`)
  if (sizeMb > 8) console.log('WARNING programs.json is over 8 MB, trim some fields')
}

main().catch((err) => {
  console.error(`\nbuild failed: ${err.message}`)
  process.exit(1)
})
