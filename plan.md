# v2 Full Implementation Plan

## Context

ScenarioForge v2 branch has backend scaffolding (auth, DB, storage v2, SSE, usage tracking, agent chat) and frontend pages (generation with SSE, scenario view with text selection, agent chat). But these pieces aren't wired together. Auth isn't integrated into project endpoints, there's no login UI, no usage dashboard, and usage checks aren't called before generation.

## Current State (already implemented)

- **Backend**: auth routes (`/api/auth/*`), SQLAlchemy models (User, ProjectRecord, UsageRecord), DB session, JWT, storage v2 (directory-based, atomic writes, revisions, agent results, chat history), SSE streaming, usage service, agent chat endpoints, ask-about-fragment endpoint
- **Frontend**: Generation page (SSE + pipeline viz + draft preview), ScenarioView (text selection menu, inline chat, revision history, split view), AgentChat page, Settings page, all types defined
- **Both compile and run** without errors

## What Needs to Be Done

### 1. Backend: Integrate Auth into Project Endpoints

**File: `backend/main.py`**

Add `get_current_user` dependency to all project endpoints. When `auth_enabled=False` (default), user is `None` and everything works as before. When enabled, filter projects by user.

Changes:
- Import `get_current_user` from `backend.auth.deps`
- Import `Depends` (already imported)
- Import `AsyncSession` and `get_db` from `backend.db.session`
- Import `check_generation_allowed`, `record_generation`, `record_tokens` from `backend.services.usage`
- Import `ProjectRecord` from `backend.db.models`

For each endpoint, add `user: Optional[User] = Depends(get_current_user)` and `db: AsyncSession = Depends(get_db)`:

- `POST /api/projects` — if user, also create `ProjectRecord` in DB with `user_id=user.id`
- `GET /api/projects` — if user, filter by user's project IDs from DB; else return all
- `GET /api/projects/{id}` — if user, check ownership via `ProjectRecord`
- `DELETE /api/projects/{id}` — if user, check ownership
- `POST /api/projects/{id}/generate` — call `check_generation_allowed(db, user, depth_mode)` before starting; call `record_generation(db, user.id)` on start
- All other project sub-endpoints (`/brief`, `/brief/answers`, `/status`, `/stop`, `/revise`, `/scenario`, `/agents/*`, `/revisions/*`, `/chat/*`, `/ask`, `/export/*`, `/stream`) — if user, check ownership

Create a helper function `_check_project_access(project_id, user, db)` that:
1. If user is None (auth disabled), just returns
2. If user, queries `ProjectRecord` where `id=project_id AND user_id=user.id`
3. If not found, raises 403

### 2. Backend: Usage Check Before Generation

**File: `backend/main.py`**, in `start_generation`:
```python
if user:
    allowed, reason = await check_generation_allowed(db, user, data.depth_mode)
    if not allowed:
        raise HTTPException(status_code=403, detail=reason)
    await record_generation(db, user.id)
```

### 3. Backend: Usage Stats Endpoint

**File: `backend/main.py`**, add:
```
GET /api/usage — returns usage stats for current user
```
Uses `get_usage_stats(db, user.id)` from `backend.services.usage`.

### 4. Frontend: Auth Context & Token Management

**New file: `frontend/src/contexts/AuthContext.tsx`**

React context providing:
- `user: { id, email, display_name, tier } | null`
- `token: string | null` (access token)
- `login(email, password)` — calls `/api/auth/login`, stores tokens in localStorage
- `register(email, password, displayName)` — calls `/api/auth/register`, stores tokens
- `logout()` — clears tokens
- `isAuthenticated: boolean`
- Auto-refresh token on mount if refresh_token exists in localStorage
- Auto-detect if auth is enabled via `GET /api/auth/me`

### 5. Frontend: Update API Client to Send Auth Headers

**File: `frontend/src/api/client.ts`**

Modify `request()` to:
- Read token from localStorage (`sf_access_token`)
- Add `Authorization: Bearer <token>` header if token exists
- On 401 response, try refresh token; if fails, redirect to login

Add auth API methods:
```typescript
auth: {
  login: (email, password) => request<TokenResponse>('/auth/login', { method: 'POST', body: ... }),
  register: (email, password, displayName) => request<TokenResponse>('/auth/register', { method: 'POST', body: ... }),
  refresh: (refreshToken) => request<TokenResponse>('/auth/refresh', { method: 'POST', body: ... }),
  me: () => request<UserInfo>('/auth/me'),
}
```

### 6. Frontend: Login/Register Page

**New file: `frontend/src/pages/Login.tsx`**

- Toggle between login and register forms
- Fields: email, password, display_name (register only)
- On success, store tokens, redirect to `/`
- Dark minimalist UI matching existing style
- Show error messages from API

### 7. Frontend: Protected Routes

**File: `frontend/src/App.tsx`**

- Wrap app with `<AuthProvider>`
- If auth enabled and not authenticated, redirect to `/login`
- Add `/login` route
- Show user info + logout in Layout header

### 8. Frontend: Usage Dashboard

**New file: `frontend/src/pages/Usage.tsx`** (or add section to Settings page)

- Call `GET /api/usage`
- Show: tier, generations this month / limit, tokens used, allowed depth modes
- Progress bar for generation limit
- Upgrade prompt for free tier

**File: `frontend/src/App.tsx`** — add route `/usage`
**File: `frontend/src/components/Layout.tsx`** — add nav link

### 9. Frontend: Types Update

**File: `frontend/src/types/index.ts`**

Add:
```typescript
export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user_id: string
  email: string
  display_name: string
}

export interface UserInfo {
  user_id: string
  email: string
  display_name: string
  tier: string
  is_active: boolean
  auth_enabled: boolean
}

export interface UsageStats {
  tier: string
  month: string
  generations: number
  generations_limit: number
  tokens_input: number
  tokens_output: number
  allowed_depths: string[]
}
```

## File Summary

| File | Action |
|------|--------|
| `backend/main.py` | Edit: add auth deps to all endpoints, usage check, `/api/usage` endpoint |
| `frontend/src/contexts/AuthContext.tsx` | New: auth context provider |
| `frontend/src/pages/Login.tsx` | New: login/register page |
| `frontend/src/pages/Usage.tsx` | New: usage dashboard |
| `frontend/src/api/client.ts` | Edit: add auth headers, auth methods, token refresh |
| `frontend/src/types/index.ts` | Edit: add TokenResponse, UserInfo, UsageStats types |
| `frontend/src/App.tsx` | Edit: wrap with AuthProvider, add routes |
| `frontend/src/components/Layout.tsx` | Edit: show user info, logout, usage link |

## Implementation Order

1. Types (`types/index.ts`)
2. API client update (`client.ts`)
3. Auth context (`AuthContext.tsx`)
4. Login page (`Login.tsx`)
5. App.tsx + Layout.tsx updates
6. Backend auth integration (`main.py`)
7. Usage endpoint (backend `main.py`)
8. Usage page (frontend `Usage.tsx`)

## Verification

1. `cd backend && source .venv/bin/activate && pytest` — all tests pass
2. `cd frontend && npm run build` — compiles without errors
3. With `AUTH_ENABLED=false` (default): app works exactly as before, no login required
4. With `AUTH_ENABLED=true`:
   - `/login` shows login/register form
   - After register → redirected to `/`, projects visible
   - Another user's projects not visible
   - Free tier: only fast mode, 5 gens/month
   - Generation blocked when limit reached (403 with message)
   - `/usage` shows stats
5. SSE streaming still works during generation
6. Agent chat, text selection, inline chat, revisions all still work
