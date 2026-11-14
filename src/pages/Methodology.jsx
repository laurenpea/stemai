import { useEffect, useState } from 'react'

export default function Methodology() {
  const [report, setReport] = useState(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/cleaningReport.json`)
      .then((r) => r.json())
      .then(setReport)
      .catch(() => setReport(null))
  }, [])

  // every number on this page comes from cleaningReport.json
  const n = (value) =>
    value === null || value === undefined ? '...' : value.toLocaleString()

  return (
    <div className="page textPage">
      <h1>Methodology</h1>
      <p className="lede">
        Everything on the map is built by one script that downloads public
        data, cleans it and writes two files. The counts below are read
        straight from that script's report, so nothing on this page is typed
        in by hand.
      </p>

      {report && (
        <section>
          <h2>Counts from the current build</h2>
          <table className="numTable">
            <tbody>
              <tr><th scope="row">Build date</th><td>{report.buildDate}</td></tr>
              <tr><th scope="row">Teams downloaded from The Blue Alliance</th><td>{n(report.rawTeams)}</td></tr>
              <tr><th scope="row">Rows dropped</th><td>{n(report.dropped.total)}</td></tr>
              <tr><th scope="row">Dropped, outside the United States</th><td>{n(report.dropped.outsideUs)}</td></tr>
              <tr><th scope="row">Dropped, no usable state code</th><td>{n(report.dropped.noUsableStateCode)}</td></tr>
              <tr><th scope="row">Dropped, no usable location</th><td>{n(report.dropped.noUsableLocation)}</td></tr>
              <tr><th scope="row">Duplicate team numbers removed</th><td>{n(report.duplicatesRemoved)}</td></tr>
              <tr><th scope="row">Programs on the map</th><td>{n(report.finalPrograms)}</td></tr>
              <tr><th scope="row">Placed at an exact point</th><td>{n(report.geocodedExact)}</td></tr>
              <tr><th scope="row">Placed at a ZIP area center</th><td>{n(report.geocodedZipCenter)}</td></tr>
              <tr><th scope="row">Joined to demographic data</th><td>{n(report.withDemographics)} ({report.withDemographicsPct}%)</td></tr>
              <tr><th scope="row">ACS 5-year data year</th><td>{report.acsYear}</td></tr>
              <tr><th scope="row">Gazetteer file year</th><td>{report.gazetteerYear}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2>Data sources</h2>
        <ul className="resourceList">
          <li>
            <strong>Program locations.</strong>{' '}
            <a href="https://www.thebluealliance.com/apidocs/v3" target="_blank" rel="noreferrer">
              The Blue Alliance API version 3
            </a>
            . We request every page of the team list and keep the team number,
            nickname, school name, city, state, country, postal code, latitude,
            longitude and rookie year.
          </li>
          <li>
            <strong>Demographics.</strong>{' '}
            <a
              href="https://www.census.gov/data/developers/data-sets/acs-5year.html"
              target="_blank"
              rel="noreferrer"
            >
              American Community Survey 5-year estimates
            </a>
            {report ? `, ${report.acsYear}` : ''}, at the ZIP Code Tabulation
            Area level. We use total population (B01003), median household
            income (B19013), poverty status (B17001) and race and Hispanic
            origin (B03002). The Census API now requires a free key, so when no
            key is set the script reads the same numbers from the public ACS
            summary files instead. That is how the data on this site was built,
            which means anyone can rebuild it without an account.
          </li>
          <li>
            <strong>Map locations for ZIP areas.</strong>{' '}
            <a
              href="https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html"
              target="_blank"
              rel="noreferrer"
            >
              Census ZCTA Gazetteer file
            </a>
            {report ? `, ${report.gazetteerYear}` : ''}. We use the internal
            point that the Census publishes for each ZIP area.
          </li>
          <li>
            <strong>Base map.</strong> Tiles from{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap contributors
            </a>
            .
          </li>
        </ul>
      </section>

      <section>
        <h2>How we collected and cleaned the data</h2>
        <ol>
          <li>
            Download every page of the FIRST Robotics Competition team list
            from The Blue Alliance.
          </li>
          <li>
            Drop teams whose country is not the United States, and drop rows
            with no information in them at all.
          </li>
          <li>
            Turn the state field into a two letter code. FIRST data is typed in
            by team mentors, so this field arrives in several formats and we
            match full state names as well as codes. We keep the 50 states and
            Washington, D.C. only, so teams in Puerto Rico and other
            territories are dropped.
          </li>
          <li>
            Pull a five digit ZIP out of the postal code field and keep leading
            zeros, so a ZIP like 02139 stays correct.
          </li>
          <li>
            Remove duplicate team numbers, keeping the first one seen.
          </li>
          <li>
            Drop any team we cannot place on the map, which means it has
            neither coordinates nor a usable ZIP.
          </li>
        </ol>
      </section>

      <section>
        <h2>How we placed each program on the map</h2>
        <p>
          If The Blue Alliance gives latitude and longitude for a team we use
          it and mark the program as exact. If it does not, we look up the
          team's ZIP in the Census gazetteer and use the center point the
          Census publishes for that ZIP area. Those programs are marked as
          approximate and the popup says so. In this build The Blue Alliance
          returned no coordinates for any team, so every program on the map is
          placed at a ZIP area center.
        </p>
      </section>

      <section>
        <h2>How we joined the demographic data</h2>
        <p>
          We match a program's five digit ZIP to the ZIP Code Tabulation Area
          with the same number and attach that area's ACS estimates. Poverty
          percent is the number of people below the poverty line divided by the
          population that poverty status was determined for. Race and ethnicity
          shares are each group divided by the total population in table
          B03002. Census sentinel values such as -666666666 are treated as
          missing, and missing numbers show as "not available" in a popup
          rather than as a zero.
        </p>
      </section>

      <section>
        <h2>About the geographic level</h2>
        <p>
          The demographics are for a ZIP Code Tabulation Area, which is the
          Census Bureau's approximation of a ZIP code built out of census
          blocks. A ZIP code itself is a mail delivery route, not an area with
          a boundary, so a ZCTA and a ZIP code are close but not identical.
          They are also much larger than a school attendance zone or a
          neighborhood, so the numbers describe a wide area around a program.
        </p>
      </section>

      <section>
        <h2>Limitations</h2>
        <ul>
          <li>
            FIRST team data is self reported by mentors, so school names,
            cities and ZIPs can be wrong, out of date or missing.
          </li>
          <li>
            Only FIRST Robotics Competition is included so far. PLTW has no
            bulk download from its School Locator, so it still needs a
            legitimate way to collect the data and is not in the map.
          </li>
          <li>
            Every location in this build is a ZIP area center, so markers sit
            near a program rather than on it.
          </li>
          <li>
            ACS figures are survey estimates with margins of error. Small ZIP
            areas have the largest error, and we do not show the margins.
          </li>
          <li>
            The data is a snapshot from the build date above. Teams start and
            stop every season and this site does not update itself.
          </li>
          <li>
            Only the 50 states and Washington, D.C. are included. Territories
            and other countries are dropped.
          </li>
          <li>
            FRC registers teams, not schools. A team may draw students from
            several schools, and some teams are based at a community
            organization rather than a school.
          </li>
          <li>
            The demographics describe the ZIP area around a program. They do not
            describe the students in that program, and we have no data on who
            takes part.
          </li>
        </ul>
      </section>

      <section>
        <h2>Rebuilding the data</h2>
        <p>
          The script is <code>scripts/buildData.mjs</code> in our repository. It
          needs a free Blue Alliance read API key in a local <code>.env</code>{' '}
          file and writes <code>programs.json</code> and{' '}
          <code>cleaningReport.json</code>. Keys are never committed.
        </p>
      </section>
    </div>
  )
}
