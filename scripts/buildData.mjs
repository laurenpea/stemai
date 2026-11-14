// builds public/data/programs.json and public/data/cleaningReport.json
// run with: npm run data
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { pipeline } from 'node:stream/promises'

const outDir = 'public/data'
const cacheDir = '.cache'

// tiny .env loader so we do not need a package
function loadEnv() {
  if (!fs.existsSync('.env')) return
  const text = fs.readFileSync('.env', 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    if (!process.env[key]) process.env[key] = val
  }
}
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

const acsYear = 2024
const gazYear = 2026

// full state name -> 2 letter code, 50 states + DC only
const stateCodes = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL',
  Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA',
  Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI',
  Wyoming: 'WY', 'Washington, D.C.': 'DC', 'Washington DC': 'DC',
}
const validCodes = new Set(Object.values(stateCodes))

function toStateCode(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  if (s.length === 2 && validCodes.has(s.toUpperCase())) return s.toUpperCase()
  const titled = s.replace(/\s+/g, ' ')
  if (stateCodes[titled]) return stateCodes[titled]
  // try case insensitive match on the full names
  for (const name in stateCodes) {
    if (name.toLowerCase() === titled.toLowerCase()) return stateCodes[name]
  }
  return null
}

function toZip(raw) {
  if (!raw) return null
  const digits = String(raw).trim().match(/\d{4,5}/)
  if (!digits) return null
  return digits[0].padStart(5, '0')
}

// -666666666 style sentinels mean no data
function toNum(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  if (n <= -666666) return null
  return n
}

function pct(part, whole) {
  const a = toNum(part)
  const b = toNum(whole)
  if (a === null || b === null || b <= 0) return null
  return Math.round((a / b) * 1000) / 10
}

// download with a local cache so reruns are fast. some census files are
// over 100 MB so we stream them to disk and retry if the socket drops
async function cachedGet(url, fileName) {
  fs.mkdirSync(cacheDir, { recursive: true })
  const file = path.join(cacheDir, fileName)
  if (fs.existsSync(file) && fs.statSync(file).size > 0) {
    console.log(`cached ${fileName}`)
    return fs.readFileSync(file)
  }
  const temp = `${file}.part`
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      console.log(`downloading ${fileName} (try ${attempt})`)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`status ${res.status}`)
      const expected = Number(res.headers.get('content-length')) || 0
      await pipeline(res.body, fs.createWriteStream(temp))
      const got = fs.statSync(temp).size
      if (expected && got !== expected) throw new Error(`got ${got} of ${expected} bytes`)
      fs.renameSync(temp, file)
      return fs.readFileSync(file)
    } catch (err) {
      console.log(`  retrying, ${err.message}`)
      if (fs.existsSync(temp)) fs.unlinkSync(temp)
    }
  }
  throw new Error(`could not download ${url}`)
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

// STEP B - demographics at ZCTA level
const acsVars = [
  'B01003_001E', 'B19013_001E', 'B17001_001E', 'B17001_002E',
  'B03002_001E', 'B03002_003E', 'B03002_004E', 'B03002_006E', 'B03002_012E',
]

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

// the Census API needs a key now, so with no key we read the public bulk
// summary files instead. one file per table, pipe delimited, ZCTA rows
// start with 860Z200US
async function getAcsFromFiles() {
  console.log('using the public ACS summary files (no CENSUS_KEY set)')
  const tables = ['b01003', 'b19013', 'b17001', 'b03002']
  const byZip = {}
  for (const table of tables) {
    const url = `https://www2.census.gov/programs-surveys/acs/summary_file/${acsYear}/table-based-SF/data/5YRData/acsdt5y${acsYear}-${table}.dat`
    const buf = await cachedGet(url, `acs${acsYear}-${table}.dat`)
    const lines = buf.toString('utf8').split('\n')
    const header = lines[0].trim().split('|')
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (!line.startsWith('860Z200US')) continue
      const cells = line.trim().split('|')
      const zip = toZip(cells[0].slice('860Z200US'.length))
      if (!zip) continue
      if (!byZip[zip]) byZip[zip] = {}
      for (let j = 1; j < header.length; j++) {
        // header looks like B19013_E001, we want B19013_001E
        const m = header[j].match(/^([A-Z0-9]+)_E(\d+)$/)
        if (!m) continue
        byZip[zip][`${m[1]}_${m[2]}E`] = cells[j]
      }
    }
    console.log(`  ${table}: ${Object.keys(byZip).length} zip areas so far`)
  }
  return byZip
}

// STEP C - ZCTA center points from the Census gazetteer
async function getZipPoints() {
  const url = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${gazYear}_Gazetteer/${gazYear}_Gaz_zcta_national.zip`
  const zip = await cachedGet(url, `gaz${gazYear}_zcta.zip`)
  const text = unzipFirstFile(zip)
  const lines = text.split('\n')
  // older gazetteer files are tab separated, newer ones are pipe separated
  const sep = lines[0].includes('|') ? '|' : '\t'
  const header = lines[0].split(sep).map((h) => h.trim())
  const zipCol = header.indexOf('GEOID')
  const latCol = header.indexOf('INTPTLAT')
  const lngCol = header.indexOf('INTPTLONG')
  const points = {}
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep)
    if (cells.length < header.length) continue
    const z = toZip(cells[zipCol])
    const lat = Number(cells[latCol])
    const lng = Number(cells[lngCol])
    if (z && Number.isFinite(lat) && Number.isFinite(lng)) points[z] = [lat, lng]
  }
  return points
}

// read the single file inside a plain zip archive
function unzipFirstFile(buf) {
  // local file header: PK 03 04
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('not a zip file')
  const method = buf.readUInt16LE(8)
  const nameLen = buf.readUInt16LE(26)
  const extraLen = buf.readUInt16LE(28)
  const start = 30 + nameLen + extraLen
  // find the central directory to get the compressed size
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const cdOffset = buf.readUInt32LE(eocd + 16)
  const compSize = buf.readUInt32LE(cdOffset + 20)
  const body = buf.subarray(start, start + compSize)
  if (method === 0) return body.toString('latin1')
  return zlib.inflateRawSync(body).toString('latin1')
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
