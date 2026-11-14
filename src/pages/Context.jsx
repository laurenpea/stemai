export default function Context() {
  return (
    <div className="page textPage">
      <h1>Context</h1>

      <section>
        <h2>The problem we are looking at</h2>
        <p>
          Hands on STEM programs like competitive robotics and engineering
          courses are not spread evenly across the country. Some students have
          several options at their own school. Others have none nearby. Public
          data already exists on where some of these programs are, and public
          data already exists on the communities around them, but the two are
          usually kept apart. That makes it hard for a student, a parent, a
          teacher or a district to look at one place and see both at once.
        </p>
        <p>
          STEMAI puts them side by side. We show where programs are and what
          the Census reports about the ZIP area around each one. We do not
          rank places, score them, or say why any area has the programs it has.
          A marker missing from a spot on the map means we do not have a
          program in our data there. It does not mean there is nothing there.
        </p>
      </section>

      <section>
        <h2>The programs</h2>
        <h3>FIRST Robotics Competition</h3>
        <p>
          FRC is a high school robotics competition run by FIRST. Teams are
          usually based at a school or a community organization, work with
          mentors, build a robot for a new game each season and compete at
          regional and championship events. Teams register with FIRST each
          season and their information is published through The Blue Alliance,
          which is where our program locations come from. FRC is the only
          program type in the map right now.
        </p>
        <h3>Project Lead The Way</h3>
        <p>
          PLTW is a nonprofit that provides STEM curriculum to schools in
          computer science, engineering and biomedical science. Unlike a
          robotics team, PLTW is coursework that a school adopts, so its
          footprint looks different from a club or competition team.{' '}
          <strong>
            PLTW is not in the map yet. Neither is any other program type.
          </strong>{' '}
          Adding PLTW is the next thing we plan to do.
        </p>
      </section>

      <section>
        <h2>Resources that already exist</h2>
        <ul className="resourceList">
          <li>
            <a href="https://www.firstinspires.org/team-event-search" target="_blank" rel="noreferrer">
              FIRST team and event search
            </a>{' '}
            and{' '}
            <a href="https://www.thebluealliance.com/" target="_blank" rel="noreferrer">
              The Blue Alliance
            </a>
            . Both let you look up FIRST teams, and The Blue Alliance is the
            source of our team data. They are built for finding and following
            teams, so they do not show demographic data for the area around a
            team.
          </li>
          <li>
            <a href="https://www.pltw.org/school-locator" target="_blank" rel="noreferrer">
              PLTW School Locator
            </a>
            . Lets you search for schools that offer PLTW programs. It is a
            search tool rather than a dataset, and there is no bulk download.
          </li>
          <li>
            <a href="https://nces.ed.gov/" target="_blank" rel="noreferrer">
              National Center for Education Statistics
            </a>
            . The main federal source for school and district data, including
            enrollment and school characteristics. It is thorough but it does
            not track out of school programs like robotics teams.
          </li>
          <li>
            <a href="https://datacatalog.urban.org/" target="_blank" rel="noreferrer">
              Urban Institute data catalog
            </a>
            . Publishes cleaned education and community datasets and tools built
            on them. Again the focus is schools and districts rather than
            specific STEM programs.
          </li>
          <li>
            <a href="https://civilrightsdata.ed.gov/" target="_blank" rel="noreferrer">
              Civil Rights Data Collection
            </a>
            . Shows which courses schools offer, broken out by student group.
            It covers courses inside school, not outside programs.
          </li>
        </ul>
      </section>

      <section>
        <h2>How STEMAI is different</h2>
        <p>
          To our knowledge, the existing tools do one of these things at a
          time. They either help you find a program, or they publish community
          and school data, or they summarize research. STEMAI combines program
          locations, demographic data for the surrounding area and the research
          background in one place, so you can look at a point on the map and
          see all three.
        </p>
        <p className="note">
          We are still finishing our gap analysis of these existing resources,
          so this comparison may change as we check more of them.
        </p>
      </section>

      <section>
        <h2>What this prototype is not</h2>
        <ul>
          <li>It is not a complete list of STEM programs. It is FRC teams only so far.</li>
          <li>It is not a ranking or a score for any place.</li>
          <li>
            It does not claim a cause. We show the data next to each other and
            leave the interpretation to you.
          </li>
        </ul>
      </section>
    </div>
  )
}
