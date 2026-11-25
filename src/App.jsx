import { useEffect, useRef } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import MapPage from './pages/MapPage.jsx'
import Research from './pages/Research.jsx'
import Context from './pages/Context.jsx'
import Methodology from './pages/Methodology.jsx'

const titles = {
  '/': 'Program map',
  '/research': 'Research',
  '/context': 'Context',
  '/methodology': 'Methodology',
}

// a single page app does not reload on navigation, so screen readers get no
// signal that the page changed. we set the title and move focus to the new
// page's heading, the same thing a full page load would announce
function useRouteAnnouncer() {
  const { pathname } = useLocation()
  const firstLoad = useRef(true)

  useEffect(() => {
    const title = titles[pathname] || titles['/']
    document.title = `${title} | STEMAI - STEM Accessibility Index`
    if (firstLoad.current) {
      firstLoad.current = false
      return
    }
    const heading = document.querySelector('main h1')
    if (heading) {
      heading.setAttribute('tabindex', '-1')
      heading.focus()
    }
    window.scrollTo(0, 0)
  }, [pathname])
}

function skipToMain(e) {
  // hash routing owns the URL hash, so move focus by hand instead of
  // following an in-page #main link
  e.preventDefault()
  const main = document.getElementById('main')
  main.focus()
  main.scrollIntoView()
}

export default function App() {
  useRouteAnnouncer()

  return (
    <div className="app">
      <a className="skipLink" href="#main" onClick={skipToMain}>
        Skip to main content
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brandName">STEMAI</span>
          <span className="brandSub">STEM Accessibility Index</span>
        </div>
        <nav aria-label="Main">
          <NavLink to="/" end>Map</NavLink>
          <NavLink to="/research">Research</NavLink>
          <NavLink to="/context">Context</NavLink>
          <NavLink to="/methodology">Methodology</NavLink>
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/research" element={<Research />} />
          <Route path="/context" element={<Context />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="*" element={<MapPage />} />
        </Routes>
      </main>

      <footer className="footer">
        <p>
          STEMAI is a student class project. It shows program locations and
          demographic data for the surrounding area side by side so you can
          explore the data and draw your own conclusions.
        </p>
      </footer>
    </div>
  )
}
