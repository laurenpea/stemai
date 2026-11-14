import { NavLink, Route, Routes } from 'react-router-dom'
import MapPage from './pages/MapPage.jsx'
import Research from './pages/Research.jsx'
import Context from './pages/Context.jsx'
import Methodology from './pages/Methodology.jsx'

export default function App() {
  return (
    <div className="app">
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

      <main id="main">
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
