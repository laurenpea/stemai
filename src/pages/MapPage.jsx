import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'

// colors picked from the Okabe-Ito color blind safe set.
// adding a new program type later only means adding a line here.
const typeColors = {
  'FIRST Robotics (FRC)': '#0072B2',
}
const otherColor = '#D55E00'

function colorFor(type) {
  return typeColors[type] || otherColor
}

function dotIcon(type) {
  return L.divIcon({
    className: 'dotWrap',
    html: `<span class="dot" style="background:${colorFor(type)}"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

function show(value, suffix) {
  if (value === null || value === undefined) return 'not available'
  return suffix ? `${value}${suffix}` : String(value)
}

function money(value) {
  if (value === null || value === undefined) return 'not available'
  return `$${value.toLocaleString()}`
}

export default function MapPage() {
  const [mapData, setMapData] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [stateFilter, setStateFilter] = useState('all')
  const [incomeMin, setIncomeMin] = useState('')
  const [incomeMax, setIncomeMax] = useState('')
  const [typesOn, setTypesOn] = useState(['FIRST Robotics (FRC)'])

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    Promise.all([
      fetch(`${base}data/programs.json`).then((r) => r.json()),
      fetch(`${base}data/cleaningReport.json`).then((r) => r.json()),
    ])
      .then(([programs, cleaning]) => {
        setMapData(programs)
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

  const shown = useMemo(() => {
    const min = incomeMin === '' ? null : Number(incomeMin)
    const max = incomeMax === '' ? null : Number(incomeMax)
    return mapData.filter((p) => {
      if (!typesOn.includes(p.type)) return false
      if (stateFilter !== 'all' && p.state !== stateFilter) return false
      if (min !== null) {
        if (p.medIncome === null || p.medIncome < min) return false
      }
      if (max !== null) {
        if (p.medIncome === null || p.medIncome > max) return false
      }
      return true
    })
  }, [mapData, stateFilter, incomeMin, incomeMax, typesOn])

  function toggleType(type) {
    setTypesOn((old) =>
      old.includes(type) ? old.filter((t) => t !== type) : [...old, type]
    )
  }

  function resetFilters() {
    setStateFilter('all')
    setIncomeMin('')
    setIncomeMax('')
    setTypesOn(allTypes)
  }

  const acsYear = report ? report.acsYear : ''

  return (
    <div className="page mapPage">
      <h1>K-12 STEM program map</h1>
      <p className="lede">
        Each marker is one program location. Click a marker to see the program
        details and the American Community Survey estimates for the ZIP area
        around it. Right now the map shows FIRST Robotics Competition teams
        only. Other program types such as PLTW are planned and are not in the
        map yet.
      </p>

      {loadError && <p className="error">{loadError}</p>}
      {loading && <p>Loading the map data...</p>}

      {!loading && !loadError && (
        <>
          <div className="filters">
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
              <label htmlFor="incomeMin">Median household income, min</label>
              <input
                id="incomeMin"
                type="number"
                min="0"
                step="1000"
                placeholder="no minimum"
                value={incomeMin}
                onChange={(e) => setIncomeMin(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="incomeMax">Median household income, max</label>
              <input
                id="incomeMax"
                type="number"
                min="0"
                step="1000"
                placeholder="no maximum"
                value={incomeMax}
                onChange={(e) => setIncomeMax(e.target.value)}
              />
            </div>

            <fieldset className="field typeBox">
              <legend>Program type</legend>
              {allTypes.map((t) => (
                <label key={t} className="checkRow">
                  <input
                    type="checkbox"
                    checked={typesOn.includes(t)}
                    onChange={() => toggleType(t)}
                  />
                  <span className="dot" style={{ background: colorFor(t) }} />
                  {t}
                </label>
              ))}
            </fieldset>

            <button type="button" className="resetBtn" onClick={resetFilters}>
              Reset filters
            </button>
          </div>

          <p className="count" role="status">
            Showing {shown.length.toLocaleString()} of{' '}
            {mapData.length.toLocaleString()} programs
          </p>

          <div className="mapBox">
            <MapContainer
              center={[39.5, -98.35]}
              zoom={4}
              scrollWheelZoom
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
                {shown.map((p) => (
                  <Marker key={p.id} position={[p.lat, p.lng]} icon={dotIcon(p.type)}>
                    <Popup>
                      <div className="popup">
                        <h2>{p.name}</h2>
                        <p className="popupType">
                          <span className="dot" style={{ background: colorFor(p.type) }} />
                          {p.type}
                        </p>
                        <dl>
                          <dt>School or organization</dt>
                          <dd>{show(p.org)}</dd>
                          <dt>City and state</dt>
                          <dd>{p.city ? `${p.city}, ${p.state}` : p.state}</dd>
                          <dt>Address</dt>
                          <dd>{show(p.address)}</dd>
                          <dt>ZIP</dt>
                          <dd>{show(p.zip)}</dd>
                        </dl>

                        {p.geoLevel === 'zip' && (
                          <p className="approx">Location approximate (ZIP center)</p>
                        )}

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
                          These are estimates for the whole ZIP area around the
                          program, not for the program itself.
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MarkerClusterGroup>
            </MapContainer>
          </div>

          <div className="legend">
            <h2>Legend</h2>
            <ul>
              {allTypes.map((t) => (
                <li key={t}>
                  <span className="dot" style={{ background: colorFor(t) }} />
                  {t}
                </li>
              ))}
              <li>
                <span className="clusterKey">25</span>
                Numbered circles group nearby programs. Zoom in to split them
                apart.
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
