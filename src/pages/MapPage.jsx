import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'

// colors from the Okabe-Ito color blind safe set, and every type also gets
// its own shape so color is never the only way to tell them apart.
// adding a new program type later only means adding a line here.
const typeStyles = {
  'FIRST Robotics (FRC)': { color: '#0072B2', shape: 'circle', short: 'FRC' },
  'FIRST Tech Challenge (FTC)': { color: '#D55E00', shape: 'diamond', short: 'FTC' },
}
const otherStyle = { color: '#5a6472', shape: 'square', short: 'Other' }

function styleFor(type) {
  return typeStyles[type] || otherStyle
}

function Swatch({ type }) {
  const s = styleFor(type)
  return <span className={`dot ${s.shape}`} style={{ background: s.color }} aria-hidden="true" />
}

const iconCache = {}
function dotIcon(type) {
  if (!iconCache[type]) {
    const s = styleFor(type)
    iconCache[type] = L.divIcon({
      className: 'dotWrap',
      html: `<span class="dot ${s.shape}" style="background:${s.color}"></span>`,
      // the visible mark is 13px, but the hit area is 24px (WCAG 2.5.8)
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })
  }
  return iconCache[type]
}

// cluster bubbles get a readable name instead of a bare number.
function clusterIcon(cluster) {
  const count = cluster.getChildCount()
  const size = count < 10 ? 'small' : count < 100 ? 'medium' : 'large'
  return L.divIcon({
    html: `<div><span>${count}</span></div>`,
    className: `marker-cluster marker-cluster-${size}`,
    iconSize: L.point(40, 40),
    // without an anchor Leaflet pans to the icon's corner on focus and the
    // bubble ends up half outside the map
    iconAnchor: L.point(20, 20),
  })
}

// cluster bubbles and markers are created by Leaflet, outside React, so we
// give them names as they are added to the map
function labelLayer(layer) {
  const el = layer.getElement && layer.getElement()
  if (!el) return
  if (layer.getChildCount) {
    el.setAttribute('role', 'button')
    el.setAttribute('aria-label', `Group of ${layer.getChildCount()} programs. Press Enter to zoom in.`)
  } else if (layer.options && layer.options.label) {
    el.setAttribute('role', 'button')
    el.setAttribute('aria-label', layer.options.label)
  }
}

function placeText(p) {
  return p.city ? `${p.city}, ${p.state}` : p.state
}

function show(value, suffix) {
  if (value === null || value === undefined) return 'not available'
  return suffix ? `${value}${suffix}` : String(value)
}

function money(value) {
  if (value === null || value === undefined) return 'not available'
  return `$${value.toLocaleString()}`
}

function locationNote(p) {
  if (p.geoLevel === 'zip') return 'Location approximate (ZIP area center)'
  if (p.geoLevel === 'city') return 'Location approximate (city center)'
  return null
}

// Leaflet does not label the map or move keyboard focus into a popup. we do, so screen reader
// and keyboard users land on the details, and we send focus back to the
// marker when the popup closes
function MapA11y() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    el.setAttribute('role', 'region')
    el.setAttribute('aria-label', 'Program map')
    el.setAttribute('aria-describedby', 'mapHelp')
    // put the zoom buttons before the markers in the tab order
    el.insertBefore(map._controlContainer, map.getPane('mapPane'))
  }, [map])
  useMapEvents({
    layeradd(e) {
      labelLayer(e.layer)
    },
    popupopen(e) {
      // react renders the popup content a moment after Leaflet opens it
      requestAnimationFrame(() => {
        const heading = e.popup.getElement()?.querySelector('h2')
        if (heading) heading.focus({ preventScroll: true })
      })
      // Leaflet only closes on Escape while the map itself has focus
      const popupEl = e.popup.getElement()
      if (popupEl && !popupEl.dataset.escBound) {
        popupEl.dataset.escBound = '1'
        popupEl.addEventListener('keydown', (ev) => {
          if (ev.key === 'Escape') {
            ev.stopPropagation()
            map.closePopup()
          }
        })
      }
    },
    popupclose(e) {
      const source = e.popup._source
      const el = source && source.getElement && source.getElement()
      if (el && document.body.contains(el)) el.focus()
    },
  })
  return null
}

const pageSize = 25

// Leaflet animates pans and zooms in JavaScript, which CSS cannot switch off
const reduceMotion =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function MapPage() {
  const [mapData, setMapData] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [stateFilter, setStateFilter] = useState('all')
  const [incomeMin, setIncomeMin] = useState('')
  const [incomeMax, setIncomeMax] = useState('')
  const [typesOn, setTypesOn] = useState(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    const get = (name) => fetch(`${base}data/${name}`).then((r) => {
      if (!r.ok) throw new Error(name)
      return r.json()
    })
    Promise.all([
      get('programs.json'),
      get('cleaningReport.json'),
      get('ftcPrograms.json').catch(() => []),
    ])
      .then(([frc, cleaning, ftc]) => {
        setMapData([...frc, ...ftc])
        setReport(cleaning)
        setLoading(false)
      })
      .catch(() => {
        setLoadError('Could not load the program data. Please refresh the page.')
        setLoading(false)
      })
  }, [])

  const states = useMemo(() => {
    const list = [...new Set(mapData.map((p) => p.state))]
    list.sort()
    return list
  }, [mapData])

  const allTypes = useMemo(() => {
    const list = [...new Set(mapData.map((p) => p.type))]
    list.sort()
    return list
  }, [mapData])

  const activeTypes = typesOn || allTypes

  const typeCounts = useMemo(() => {
    const counts = {}
    for (const p of mapData) counts[p.type] = (counts[p.type] || 0) + 1
    return counts
  }, [mapData])

  const min = incomeMin === '' ? null : Number(incomeMin)
  const max = incomeMax === '' ? null : Number(incomeMax)
  const rangeError = min !== null && max !== null && min > max

  const shown = useMemo(() => {
    return mapData.filter((p) => {
      if (!activeTypes.includes(p.type)) return false
      if (stateFilter !== 'all' && p.state !== stateFilter) return false
      if (min !== null) {
        if (p.medIncome === null || p.medIncome < min) return false
      }
      if (max !== null) {
        if (p.medIncome === null || p.medIncome > max) return false
      }
      return true
    })
  }, [mapData, stateFilter, min, max, activeTypes])

  // go back to the first table page whenever the filters change
  useEffect(() => setPage(0), [stateFilter, incomeMin, incomeMax, typesOn])

  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize))
  const pageRows = shown.slice(page * pageSize, page * pageSize + pageSize)

  function toggleType(type) {
    const old = activeTypes
    setTypesOn(old.includes(type) ? old.filter((t) => t !== type) : [...old, type])
  }

  function resetFilters() {
    setStateFilter('all')
    setIncomeMin('')
    setIncomeMax('')
    setTypesOn(null)
  }

  const acsYear = report ? report.acsYear : ''
  const typeSummary = allTypes
    .map((t) => `${(typeCounts[t] || 0).toLocaleString()} ${styleFor(t).short}`)
    .join(' and ')

  return (
    <div className="page mapPage">
      <h1>K-12 STEM program map</h1>
      <p className="lede">
        Each marker is one program location. Select a marker to see the
        program details and the American Community Survey estimates for the
        ZIP area around it. The map shows FIRST Robotics Competition (FRC) and
        FIRST Tech Challenge (FTC) teams. Other program types such as PLTW are
        planned and are not in the map yet.
      </p>

      {loadError && <p className="error" role="alert">{loadError}</p>}
      {loading && <p role="status">Loading the map data...</p>}

      {!loading && !loadError && (
        <>
          <div className="atlas">
            <form className="filters" aria-label="Filter programs" onSubmit={(e) => e.preventDefault()}>
              <div className="field">
                <label htmlFor="stateFilter">State</label>
                <select
                  id="stateFilter"
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                >
                  <option value="all">All states</option>
                  {states.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="incomeMin">Median household income, min (dollars)</label>
                <input
                  id="incomeMin"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1000"
                  placeholder="No minimum"
                  value={incomeMin}
                  aria-invalid={rangeError || undefined}
                  aria-describedby={rangeError ? 'rangeError' : undefined}
                  onChange={(e) => setIncomeMin(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="incomeMax">Median household income, max (dollars)</label>
                <input
                  id="incomeMax"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1000"
                  placeholder="No maximum"
                  value={incomeMax}
                  aria-invalid={rangeError || undefined}
                  aria-describedby={rangeError ? 'rangeError' : undefined}
                  onChange={(e) => setIncomeMax(e.target.value)}
                />
              </div>

              <fieldset className="field typeBox">
                <legend>Program type</legend>
                {allTypes.map((t) => (
                  <label key={t} className="checkRow">
                    <input
                      type="checkbox"
                      checked={activeTypes.includes(t)}
                      onChange={() => toggleType(t)}
                    />
                    <Swatch type={t} />
                    {t}
                  </label>
                ))}
              </fieldset>

              <button type="button" className="resetBtn" onClick={resetFilters}>
                Reset filters
              </button>

              {rangeError && (
                <p id="rangeError" className="error fieldError" role="alert">
                  The minimum income is higher than the maximum, so no programs
                  match.
                </p>
              )}
            </form>

            <p className="count" role="status">
              Showing{' '}
              <span className="countNum">{shown.length.toLocaleString()}</span>{' '}
              of {mapData.length.toLocaleString()} programs
            </p>

            <section className="mapSection" aria-labelledby="mapHeading">
              <h2 id="mapHeading" className="srOnly">Map</h2>
              <p className="srOnly" id="mapHelp">
                Interactive map of {shown.length.toLocaleString()} programs. Use
                the arrow keys to pan and the plus and minus keys to zoom. Every
                program on the map is also listed in the table after the map.
              </p>
              <a className="skipLink inline" href="#programTable" onClick={(e) => {
                e.preventDefault()
                const table = document.getElementById('programTable')
                if (table) {
                  table.focus({ preventScroll: true })
                  table.scrollIntoView({ block: 'start' })
                }
              }}>
                Skip the map and go to the program table
              </a>
              <div className="mapBox">
                <MapContainer
                  center={[39.5, -98.35]}
                  zoom={4}
                  scrollWheelZoom
                  zoomAnimation={!reduceMotion}
                  fadeAnimation={!reduceMotion}
                  markerZoomAnimation={!reduceMotion}
                  style={{ height: '100%', width: '100%' }}
                >
                  <MapA11y />
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MarkerClusterGroup
                    chunkedLoading
                    animate={!reduceMotion}
                    maxClusterRadius={50}
                    iconCreateFunction={clusterIcon}
                  >
                    {shown.map((p) => (
                      <Marker
                        key={p.id}
                        position={[p.lat, p.lng]}
                        icon={dotIcon(p.type)}
                        title={`${p.name}, ${placeText(p)}`}
                        label={`${p.name}, ${p.type}, ${placeText(p)}`}
                      >
                        {/* left padding keeps an open popup clear of the zoom buttons */}
                      <Popup autoPanPaddingTopLeft={[56, 12]}>
                          <ProgramDetails p={p} acsYear={acsYear} />
                        </Popup>
                      </Marker>
                    ))}
                  </MarkerClusterGroup>
                </MapContainer>
              </div>
            </section>

            <div className="legend">
              <h2 className="railHeading">Legend</h2>
              <ul>
                {allTypes.map((t) => (
                  <li key={t}>
                    <Swatch type={t} />
                    {t}, {styleFor(t).shape} marker
                  </li>
                ))}
                <li>
                  <span className="clusterKey" aria-hidden="true">25</span>
                  Numbered circles group nearby programs. Zoom in or select one
                  to split them apart.
                </li>
              </ul>
              <p className="cite">
                {typeSummary} programs in total. Every FRC team is placed at the
                center of its ZIP area and every FTC team at the center of its
                city, so markers sit near a program rather than on it.
              </p>
            </div>
          </div>

          <section className="tableSection" aria-labelledby="tableHeading">
            <h2 id="tableHeading">Programs as a table</h2>
            <p>
              The same programs as the map, with the same filters applied. The
              demographic columns describe the ZIP area around each program,
              from the ACS {acsYear} 5-year estimates.
            </p>
            <div className="tableScroll" role="region" aria-labelledby="tableCaption" tabIndex={0} id="programTable">
              <table className="dataTable">
                <caption id="tableCaption">
                  Programs {shown.length === 0 ? 0 : page * pageSize + 1} to{' '}
                  {Math.min(shown.length, (page + 1) * pageSize)} of{' '}
                  {shown.length.toLocaleString()}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Program</th>
                    <th scope="col">Type</th>
                    <th scope="col">School or organization</th>
                    <th scope="col">City and state</th>
                    <th scope="col">ZIP area</th>
                    <th scope="col" className="num">Median household income</th>
                    <th scope="col" className="num">Below poverty line</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => (
                    <tr key={p.id}>
                      <th scope="row">{p.name}</th>
                      <td>{styleFor(p.type).short}</td>
                      <td>{show(p.org)}</td>
                      <td>{placeText(p)}</td>
                      <td>{show(p.zip)}</td>
                      <td className="num">{money(p.medIncome)}</td>
                      <td className="num">{show(p.povertyPct, '%')}</td>
                    </tr>
                  ))}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={7}>No programs match the current filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <nav className="pager" aria-label="Table pages">
              <button
                type="button"
                aria-disabled={page === 0}
                onClick={() => page > 0 && setPage(page - 1)}
              >
                Previous page
              </button>
              <span className="pagerStatus" aria-live="polite">
                Page {page + 1} of {pageCount.toLocaleString()}
              </span>
              <button
                type="button"
                aria-disabled={page >= pageCount - 1}
                onClick={() => page < pageCount - 1 && setPage(page + 1)}
              >
                Next page
              </button>
            </nav>
          </section>
        </>
      )}
    </div>
  )
}

function ProgramDetails({ p, acsYear }) {
  const note = locationNote(p)
  return (
    <div className="popup">
      <h2 tabIndex={-1}>{p.name}</h2>
      <p className="popupType">
        <Swatch type={p.type} />
        {p.type}
      </p>
      <dl>
        <dt>School or organization</dt>
        <dd>{show(p.org)}</dd>
        <dt>City and state</dt>
        <dd>{placeText(p)}</dd>
        <dt>Address</dt>
        <dd>{show(p.address)}</dd>
        <dt>{p.geoLevel === 'city' ? 'Nearest ZIP area' : 'ZIP'}</dt>
        <dd>{show(p.zip)}</dd>
      </dl>

      {note && <p className="approx">{note}</p>}

      <h3>ZIP area, ACS {acsYear}</h3>
      <dl>
        <dt>Population</dt>
        <dd>{p.totalPop === null ? 'not available' : p.totalPop.toLocaleString()}</dd>
        <dt>Median household income</dt>
        <dd>{money(p.medIncome)}</dd>
        <dt>People below the poverty line</dt>
        <dd>{show(p.povertyPct, '%')}</dd>
        <dt>White, not Hispanic or Latino</dt>
        <dd>{show(p.pctWhite, '%')}</dd>
        <dt>Black or African American</dt>
        <dd>{show(p.pctBlack, '%')}</dd>
        <dt>Asian</dt>
        <dd>{show(p.pctAsian, '%')}</dd>
        <dt>Hispanic or Latino</dt>
        <dd>{show(p.pctHispanic, '%')}</dd>
      </dl>
      <p className="popupNote">
        These are estimates for the whole ZIP area around the program, not for
        the program itself.
      </p>
    </div>
  )
}
