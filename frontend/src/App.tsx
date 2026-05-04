import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { TeamProvider } from './contexts/TeamContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import ProjectList from './pages/ProjectList'
import NewProject from './pages/NewProject'
import Briefing from './pages/Briefing'
import Generation from './pages/Generation'
import ScenarioView from './pages/ScenarioView'
import ScenarioEditor from './pages/ScenarioEditor'
import AgentChat from './pages/AgentChat'
import Settings from './pages/Settings'
import TestModels from './pages/TestModels'
import Admin from './pages/Admin'
import Login from './pages/Login'
import Register from './pages/Register'
import Teams from './pages/Teams'
import TeamSettings from './pages/TeamSettings'

function App() {
  return (
    <AuthProvider>
      <TeamProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<ProjectList />} />
            <Route path="new" element={<NewProject />} />
            <Route path="projects/:id/briefing" element={<Briefing />} />
            <Route path="projects/:id/generation" element={<Generation />} />
            <Route path="projects/:id/scenario" element={<ScenarioView />} />
            <Route path="projects/:id/edit" element={<ScenarioEditor />} />
            <Route path="projects/:id/chat/:agent" element={<AgentChat />} />
            <Route path="settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
            <Route path="test" element={<TestModels />} />
            <Route path="admin" element={<Admin />} />
            <Route path="teams" element={<Teams />} />
            <Route path="teams/:slug" element={<TeamSettings />} />
          </Route>
        </Routes>
      </TeamProvider>
    </AuthProvider>
  )
}

export default App
