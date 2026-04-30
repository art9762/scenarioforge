import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import ProjectList from './pages/ProjectList'
import NewProject from './pages/NewProject'
import Briefing from './pages/Briefing'
import Generation from './pages/Generation'
import ScenarioView from './pages/ScenarioView'
import ScenarioEditor from './pages/ScenarioEditor'
import Settings from './pages/Settings'
import TestModels from './pages/TestModels'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<ProjectList />} />
        <Route path="new" element={<NewProject />} />
        <Route path="projects/:id/briefing" element={<Briefing />} />
        <Route path="projects/:id/generation" element={<Generation />} />
        <Route path="projects/:id/scenario" element={<ScenarioView />} />
        <Route path="projects/:id/edit" element={<ScenarioEditor />} />
        <Route path="settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
        <Route path="test" element={<TestModels />} />
      </Route>
    </Routes>
  )
}

export default App
