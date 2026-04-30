# Integration Work After Critical Blockers Fixed

Once the 5 critical blockers are resolved (see FIXES_FOR_CRITICAL_BLOCKERS.md), the backend will be **runnable but incomplete**. This document covers the integration work needed next.

---

## PRIORITY 1: Usage Service Integration

**Status:** Code exists but not wired  
**Time Estimate:** 30-45 minutes  
**Files:** `backend/main.py`, `backend/services/usage.py`, `backend/db/session.py`

### What Needs to Happen

The usage service (`backend/services/usage.py`) has all the right functions:
- ✓ `check_generation_allowed()` - Rate limiting by tier
- ✓ `record_generation()` - Track generation count
- ✓ `record_tokens()` - Track token usage
- ✓ `get_usage_stats()` - Return user stats

But they're never called. We need to:

1. **Add rate limit check before generation starts**
   - In `start_generation()` endpoint (line 107)
   - Call `check_generation_allowed(db, user, depth_mode)`
   - Raise HTTPException if rate limited

2. **Record generation attempt**
   - After generation starts, call `record_generation(db, user_id)`
   - Happens in `_run_pipeline()` or after orchestrator completes

3. **Record token usage after generation completes**
   - After `orchestrator.run_pipeline()` completes
   - Loop through agent results and sum tokens
   - Call `record_tokens(db, user_id, input_total, output_total)`

4. **Add usage stats endpoint**
   - New route: `GET /api/usage/stats`
   - Protected endpoint (requires auth)
   - Returns result from `get_usage_stats(db, user_id)`

5. **Pass user context through pipeline**
   - Currently `_run_pipeline()` receives only `Project`
   - Need to also pass `User` or `user_id`
   - So tokens can be properly tracked

### Code Changes Overview

**File:** `backend/main.py`

**Import:**
```python
from backend.services.usage import (
    check_generation_allowed,
    record_generation,
    record_tokens,
    get_usage_stats,
)
from backend.auth.deps import get_current_user  # For protected endpoints
```

**Modify `start_generation()`:**
```python
@app.post("/api/projects/{project_id}/generate")
async def start_generation(
    project_id: str, 
    data: GenerateRequest, 
    background_tasks: BackgroundTasks,
    user: Optional[User] = Depends(get_current_user_optional),  # ADDED
    db: AsyncSession = Depends(get_db),  # ADDED
):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # NEW: Check rate limits
    allowed, reason = await check_generation_allowed(db, user, data.depth_mode)
    if not allowed:
        raise HTTPException(status_code=429, detail=reason)
    
    if project.status == ProjectStatus.generating:
        raise HTTPException(status_code=409, detail="Generation already in progress")
    
    project.depth_mode = data.depth_mode
    project.model_overrides = data.model_overrides
    project.status = ProjectStatus.generating
    project.progress = 0.0
    await storage.save_project(project)
    
    # NEW: Record generation attempt
    if user:
        await record_generation(db, user.id)
        await db.commit()
    
    background_tasks.add_task(_run_pipeline, project, user.id if user else None)
    return {"status": "generating"}
```

**Modify `_run_pipeline()` signature:**
```python
async def _run_pipeline(project: Project, user_id: Optional[str] = None):
    try:
        await orchestrator.run_pipeline(project)
        
        # NEW: Record tokens if user
        if user_id:
            # Fetch agent results and sum tokens
            agent_results = await storage.list_agent_results(project.id)
            total_input = 0
            total_output = 0
            for result in agent_results:
                tokens = result.get("tokens") or {}
                total_input += tokens.get("input", 0)
                total_output += tokens.get("output", 0)
            
            # Record usage
            db = async_session_factory()
            try:
                await record_tokens(db, user_id, total_input, total_output)
                await db.commit()
            finally:
                await db.close()
    except Exception as e:
        project.status = ProjectStatus.error
        project.scenario = f"Error: {str(e)}"
        await storage.save_project(project)
```

**Add new endpoint:**
```python
@app.get("/api/usage/stats")
async def get_usage(
    user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's usage statistics for the month."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    stats = await get_usage_stats(db, user.id)
    return stats
```

---

## PRIORITY 2: Backend Endpoint Protection

**Status:** No auth requirement on endpoints  
**Time Estimate:** 45-60 minutes  
**Files:** `backend/main.py`, `backend/db/session.py`, `backend/models/project.py`

### What Needs to Happen

Currently all endpoints are public. We need to:

1. **Add user context injection to all endpoints**
   - `get_current_user_optional` for optional auth
   - `get_current_user` for required auth
   - Check tier permissions where needed

2. **Filter projects by user**
   - Modify `list_projects()` to return only user's projects
   - Modify `get_project()` to verify user ownership
   - Modify `delete_project()` to verify user ownership
   - Modify all generation/revision/chat endpoints to verify ownership

3. **Store user_id with projects**
   - Update ProjectRecord model to include user_id
   - Update file storage to use user_id in paths
   - Or add user_id to Project model

4. **Protect tier-specific features**
   - Deep/Standard modes only for Pro users
   - Some agents only for Pro users
   - Storage/token limits based on tier

### Architecture Decision

Two options:

**Option A:** Hybrid storage (current approach)
- ProjectRecord in DB with user_id foreign key
- Project content (scenario, agents) stays on filesystem
- Storage paths become `/data/{user_id}/{project_id}/`
- File-based but with DB index

**Option B:** Full database storage
- Move scenario, agents, revisions to database
- More complex but cleaner permissions
- Better for multi-user scenarios

**Recommendation:** Option A (smaller change)

### Code Changes Overview

**File:** `backend/models/project.py`

Add to Project model:
```python
class Project(BaseModel):
    id: str
    user_id: Optional[str] = None  # NEW
    idea: str
    type: str
    # ... rest of fields
```

**File:** `backend/main.py`

Modify `list_projects()`:
```python
@app.get("/api/projects", response_model=list[Project])
async def list_projects(
    user: Optional[User] = Depends(get_current_user_optional),
):
    """List projects (filtered by user if authenticated)."""
    projects = await storage.list_projects()
    
    # Filter to user's projects if authenticated
    if user:
        projects = [p for p in projects if p.user_id == user.id]
    else:
        # For unauthenticated, return empty or public projects
        projects = []
    
    return projects
```

Modify `create_project()`:
```python
@app.post("/api/projects", response_model=Project)
async def create_project(
    data: ProjectCreate,
    user: Optional[User] = Depends(get_current_user_optional),
):
    project = Project(
        idea=data.idea,
        type=data.type,
        equipment=data.equipment,
        user_id=user.id if user else None,  # NEW
    )
    await storage.save_project(project)
    return project
```

Add ownership check helper:
```python
async def _check_project_access(project: Project, user: Optional[User]):
    """Verify user can access project."""
    if not project:
        return False
    
    # If project has user_id, must match
    if project.user_id:
        return user and user.id == project.user_id
    
    # Public project
    return True
```

Use in all endpoints:
```python
@app.get("/api/projects/{project_id}", response_model=Project)
async def get_project(
    project_id: str,
    user: Optional[User] = Depends(get_current_user_optional),
):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not await _check_project_access(project, user):
        raise HTTPException(status_code=403, detail="Access denied")
    
    return project
```

---

## PRIORITY 3: Frontend Auth System

**Status:** No login/register pages  
**Time Estimate:** 60-90 minutes  
**Files:** `frontend/src/pages/Login.tsx`, `frontend/src/pages/Register.tsx`, `frontend/src/context/AuthContext.tsx`, `frontend/src/App.tsx`, `frontend/src/api/client.ts`

### What Needs to Happen

1. **Create Auth Context**
   - Store token and user info
   - Provide login/logout functions
   - Handle token refresh

2. **Create Login Page**
   - Email + password form
   - Error display
   - Redirect to projects on success

3. **Create Register Page**
   - Email + password + display name form
   - Validate password strength
   - Error display
   - Redirect to projects on success

4. **Add Auth Routes**
   - `/auth/login`
   - `/auth/register`
   - Redirect to `/` if already logged in

5. **Protect Frontend Routes**
   - ProjectList requires auth
   - NewProject requires auth
   - Settings requires auth
   - Generation requires auth

6. **Add Token Management**
   - Store token in localStorage
   - Inject token in request headers
   - Handle 401 responses (token expired)
   - Auto-refresh when needed

### Code Structure

**File:** `frontend/src/context/AuthContext.tsx`

```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api } from '../api/client'

interface User {
  id: string
  email: string
  display_name: string
  tier: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('auth_token')
  })
  const [loading, setLoading] = useState(true)

  // Load user on mount if token exists
  useEffect(() => {
    if (token) {
      api.setToken(token)
      api.getMe()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('auth_token')
          setToken(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const response = await api.login(email, password)
    localStorage.setItem('auth_token', response.access_token)
    setToken(response.access_token)
    api.setToken(response.access_token)
    setUser({
      id: response.user_id,
      email: response.email,
      display_name: response.display_name,
      tier: 'free',
    })
  }

  const register = async (email: string, password: string, displayName: string) => {
    const response = await api.register(email, password, displayName)
    localStorage.setItem('auth_token', response.access_token)
    setToken(response.access_token)
    api.setToken(response.access_token)
    setUser({
      id: response.user_id,
      email: response.email,
      display_name: response.display_name,
      tier: 'free',
    })
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    setToken(null)
    setUser(null)
    api.setToken(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
```

**File:** `frontend/src/api/client.ts`

Add to api object:
```typescript
let authToken: string | null = null

export function setToken(token: string | null) {
  authToken = token
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = { 'Content-Type': 'application/json' }
  if (authToken) {
    (headers as any)['Authorization'] = `Bearer ${authToken}`
  }
  
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers || {}) },
  })
  
  if (res.status === 401) {
    // Token expired, clear it
    setToken(null)
  }
  
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export const api = {
  // ... existing methods ...
  
  // Auth (ADDED)
  register: (email: string, password: string, displayName: string) =>
    request<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName }),
    }),
  login: (email: string, password: string) =>
    request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  getMe: () => request<User>('/auth/me'),
  logout: () => {
    setToken(null)
  },
  
  // Usage stats (ADDED)
  getUsageStats: () => request<any>('/usage/stats'),
}
```

**File:** `frontend/src/App.tsx`

```typescript
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
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
import Login from './pages/Login'        // NEW
import Register from './pages/Register'  // NEW

function PrivateRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  
  if (loading) return <div>Loading...</div>
  if (!user) return <Navigate to="/auth/login" replace />
  
  return children
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Auth routes - public */}
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/register" element={<Register />} />
        
        {/* Protected routes */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<ProjectList />} />
          <Route path="new" element={<NewProject />} />
          <Route path="projects/:id/briefing" element={<Briefing />} />
          <Route path="projects/:id/generation" element={<Generation />} />
          <Route path="projects/:id/scenario" element={<ScenarioView />} />
          <Route path="projects/:id/edit" element={<ScenarioEditor />} />
          <Route path="projects/:id/chat/:agent" element={<AgentChat />} />
          <Route path="settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
          <Route path="test" element={<TestModels />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}

export default App
```

---

## PRIORITY 4: Test Coverage

**Status:** Limited  
**Time Estimate:** 30-45 minutes  
**Files:** New test files in `backend/tests/`

### What Needs Coverage

1. **Auth flow**
   - Register creates user and returns tokens
   - Login with correct password works
   - Login with wrong password fails
   - Token verification works
   - Expired token returns 401

2. **Usage tracking**
   - Free tier limited to 5 generations/month
   - Pro tier unlimited
   - Deep mode only available for Pro
   - Token usage properly recorded

3. **Project access control**
   - User sees only their projects
   - User can't access others' projects
   - Public projects visible to all

4. **Rate limiting**
   - Generation blocked when limit reached
   - Error message clear

### Example Test File

**File:** `backend/tests/test_auth.py`

```python
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

@pytest.mark.asyncio
async def test_register():
    """Test user registration."""
    response = client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "securepass123",
        "display_name": "Test User"
    })
    
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["email"] == "test@example.com"

@pytest.mark.asyncio
async def test_login():
    """Test user login."""
    # Register first
    client.post("/api/auth/register", json={
        "email": "login@example.com",
        "password": "pass123",
        "display_name": "Login Test"
    })
    
    # Login
    response = client.post("/api/auth/login", json={
        "email": "login@example.com",
        "password": "pass123"
    })
    
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data

@pytest.mark.asyncio
async def test_get_me():
    """Test getting current user info."""
    # Register
    reg_response = client.post("/api/auth/register", json={
        "email": "me@example.com",
        "password": "pass123",
        "display_name": "Me Test"
    })
    token = reg_response.json()["access_token"]
    
    # Get me
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "me@example.com"
```

---

## Implementation Order

1. **Usage Service Integration** (Priority 1)
   - Wire service into generation endpoint
   - Add rate limit checks
   - Add usage stats endpoint
   - ~45 min

2. **Endpoint Protection** (Priority 2)
   - Add user context to endpoints
   - Implement project access control
   - Filter by tier
   - ~60 min

3. **Frontend Auth** (Priority 3)
   - Create Auth Context
   - Create login/register pages
   - Update API client with auth
   - Add route protection
   - ~90 min

4. **Test Coverage** (Priority 4)
   - Auth flow tests
   - Usage tracking tests
   - Access control tests
   - ~45 min

**Total Time:** ~5 hours of integration work

---

## Verification Checklist

After completing all integration work:

- [ ] Can register new user via frontend
- [ ] Can login with registered email/password
- [ ] Auth token stored in localStorage
- [ ] Logged-in user sees only their projects
- [ ] Projects show usage stats in sidebar
- [ ] Free users limited to 5 generations/month
- [ ] Free users can't use Deep mode
- [ ] Pro users can use all modes
- [ ] Token usage tracked after generation
- [ ] Usage endpoint returns current month stats
- [ ] Logout clears token and redirects to login
- [ ] All endpoints protected with 401 when not authenticated
- [ ] Invalid token returns 401
- [ ] All auth tests pass
- [ ] Integration tests for auth→generation→usage flow pass

