// helpers shared by the program build scripts: state codes, number
// cleaning, cached downloads and the Census ACS and gazetteer readers
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { pipeline } from 'node:stream/promises'

export const outDir = 'public/data'
const cacheDir = '.cache'
export const acsYear = 2024
export const gazYear = 2026

// tiny .env loader so we do not need a package
export function loadEnv() {
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
export const validCodes = new Set(Object.values(stateCodes))

export function toStateCode(raw) {
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

export function toZip(raw) {
  if (!raw) return null
  const digits = String(raw).trim().match(/\d{4,5}/)
  if (!digits) return null
  return digits[0].padStart(5, '0')
}

// -666666666 style sentinels mean no data
export function toNum(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  if (n <= -666666) return null
  return n
}

export function pct(part, whole) {
  const a = toNum(part)
  const b = toNum(whole)
  if (a === null || b === null || b <= 0) return null
  return Math.round((a / b) * 1000) / 10
}

// download with a local cache so reruns are fast. some census files are
// over 100 MB so we stream them to disk and retry if the socket drops
export async function cachedGet(url, fileName) {
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

// STEP B - demographics at ZCTA level
export const acsVars = [
  'B01003_001E', 'B19013_001E', 'B17001_001E', 'B17001_002E',
  'B03002_001E', 'B03002_003E', 'B03002_004E', 'B03002_006E', 'B03002_012E',
]

// the Census API needs a key now, so with no key we read the public bulk
// summary files instead. one file per table, pipe delimited, ZCTA rows
// start with 860Z200US
export async function getAcsFromFiles() {
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
export async function getZipPoints() {
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
export function unzipFirstFile(buf) {
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

// read any national gazetteer file (zcta, place, cousubs) into row objects
export async function readGazetteer(kind) {
  const fileName = `${gazYear}_Gaz_${kind}_national.zip`
  const url = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${gazYear}_Gazetteer/${fileName}`
  const text = unzipFirstFile(await cachedGet(url, `gaz${gazYear}_${kind}.zip`))
  const lines = text.split('\n')
  const sep = lines[0].includes('|') ? '|' : '\t'
  const header = lines[0].split(sep).map((h) => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep)
    if (cells.length < header.length) continue
    const row = {}
    header.forEach((h, j) => { row[h] = cells[j].trim() })
    rows.push(row)
  }
  return rows
}
