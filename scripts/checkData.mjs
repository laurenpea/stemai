// quick checks on the built data. run with: npm run checkdata
import fs from 'node:fs'

const programs = JSON.parse(fs.readFileSync('public/data/programs.json', 'utf8'))
const report = JSON.parse(fs.readFileSync('public/data/cleaningReport.json', 'utf8'))

// rough bounding box for the 50 states and DC, including Alaska and Hawaii
const minLat = 18
const maxLat = 72
const minLng = -180
const maxLng = -65

let badLatLng = 0
let outOfBounds = 0
let withDemos = 0
let badZip = 0
let badState = 0
const ids = new Set()
let duplicateIds = 0

for (const p of programs) {
  if (typeof p.lat !== 'number' || typeof p.lng !== 'number') {
    badLatLng++
  } else if (p.lat < minLat || p.lat > maxLat || p.lng < minLng || p.lng > maxLng) {
    outOfBounds++
    console.log(`out of bounds: ${p.id} ${p.lat},${p.lng} ${p.city} ${p.state}`)
  }
  if (ids.has(p.id)) duplicateIds++
  ids.add(p.id)
  if (p.zip !== null && !/^\d{5}$/.test(p.zip)) badZip++
  if (!/^[A-Z]{2}$/.test(p.state)) badState++
  if (p.medIncome !== null || p.totalPop !== null) withDemos++
}

const pct = Math.round((withDemos / programs.length) * 1000) / 10

console.log('\n--- STEMAI data check ---')
console.log(`programs                 ${programs.length}`)
console.log(`missing lat or lng       ${badLatLng}`)
console.log(`outside US bounds        ${outOfBounds}`)
console.log(`duplicate ids            ${duplicateIds}`)
console.log(`bad zip format           ${badZip}`)
console.log(`bad state code           ${badState}`)
console.log(`with demographics        ${withDemos} (${pct}%)`)
console.log(`report says final count  ${report.finalPrograms}`)

const failed =
  badLatLng > 0 ||
  outOfBounds > 0 ||
  duplicateIds > 0 ||
  badZip > 0 ||
  badState > 0 ||
  programs.length !== report.finalPrograms

console.log(failed ? '\nFAILED' : '\nall checks passed')
process.exit(failed ? 1 : 0)
