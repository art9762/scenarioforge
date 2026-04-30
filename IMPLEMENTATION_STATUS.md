# V2 Implementation Status - Fresh Analysis (April 30, 2026)

## Quick Summary
The v2 branch has been thoroughly audited. Below is the current state with critical blockers identified.

---

## CRITICAL BLOCKERS (Must Fix to Run)

### 1. Missing Environment Variables in backend/config.py
**Status:** 🔴 BLOCKING  
**Files:** `backend/config.py` (lines 8-16)

Current state:
```python
class Settings(BaseSettings):
    trinity_api_key: str = ""
    trinity_aurora_url: str = "https://gate.trinity.tg/aurora/v1"
    trinity_orion_url: str = "https://gate.trinity.tg/orion/v1"
    storage_dir: str = "./data"
    host: str = "0.0.0.0"
    port: int = 8000
```

**Missing Settings Required By Other Code:**
- `settings.auth_enabled` - Referenced in `backend/auth/deps.py:20` and `deps.py:40`
- `settings.jwt_secret` - Referenced in `backend/auth/jwt.py:22` and `jwt.py:32, 38`
- `settings.database_url` - Referenced in `backend/db/session.py:7`

**Impact:** Any request to auth endpoints or database access will throw `AttributeError`

**Fix Required:**
```python
class Settings(BaseSettings):
    # ... existing settings ...
    auth_enabled: bool = True
    jwt_secret: str = "your-secret-key-change-in-production"
    database_url: str = "sqlite+aiosqlite:///./scenarioforge.db"
```

---

### 2. Missing Dependencies in backend/requirements.txt
**Status:** 🔴 BLOCKING  
**File:** `backend/requirements.txt`

**Currently Missing:**
- `sqlalchemy[asyncio]` - Required by `backend/db/session.py`, `backend/db/models.py`
- `passlib[bcrypt]` - Required by `backend/auth/routes.py:17`
- `python-jose` - Required by `backend/auth/jwt.py:6`
- `aiosqlite` - Required by database URL dialect
- `email-validator` - Required for `EmailStr` validation in Pydantic

**Current file has:** (13 packages)
- fastapi, uvicorn, pydantic, pydantic-settings, httpx, python-dotenv, weasyprint, markdown, pytest, pytest-asyncio, aiofiles

**Impact:** ImportError on startup. Auth system, database layer will not load.

---

### 3. Database Not Initialized in Lifespan
**Status:** 🔴 BLOCKING  
**File:** `backend/main.py:27-34`

Current code:
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-migrate legacy projects on startup
    migrated = await storage.migrate_all_legacy()
    if migrated:
        print(f"Migrated {migrated} legacy projects to v2 storage format")
    yield
    await llm_client.close()
```

**Issue:** `init_db()` is never called. Tables won't be created.
- `backend/db/session.py:25-29` has the `init_db()` function
- It's never imported or invoked in main.py

**Impact:** AttributeError when trying to use database: "NoneType has no attribute..."

**Fix:** Add to lifespan:
```python
from backend.db.session import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()  # Create tables
    migrated = await storage.migrate_all_legacy()
    if migrated:
        print(f"Migrated {migrated} legacy projects to v2 storage format")
    yield
    await llm_client.close()
```

---

### 4. Auth Routes Not Registered in main.py
**Status:** 🔴 BLOCKING  
**File:** `backend/main.py` - Missing ~5 lines after line 45

**Current Code (lines 37-45):**
```python
app = FastAPI(title="ScenarioForge", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Missing:** Auth router registration

**Impact:** `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh` endpoints don't exist

**Required Fix (after line 45):**
```python
from backend.auth.routes import router as auth_router

# ... existing middleware code ...

app.include_router(auth_router)
```

---

### 5. Stub Endpoint: backend/auth/routes.py:112-117
**Status:** 🟡 INCOMPLETE  
**File:** `backend/auth/routes.py`

Current code:
```python
@router.get("/me")
async def get_me(
    user: User = Depends(lambda authorization=None, db=None: None),
):
    """Get current user info. This is a placeholder — real dependency injection happens in main.py."""
    pass
```

**Issues:**
- Function body is just `pass` - returns None
- Dependency injection is a lambda that ignores params - doesn't actually authenticate
- Should use `get_current_user_optional` from `backend/auth/deps.py`

**Fix:**
```python
from backend.auth.deps import get_current_user_optional

@router.get("/me")
async def get_me(user: Optional[User] = Depends(get_current_user_optional)):
    """Get current user info."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "tier": user.tier,
    }
```

---

## MAJOR ISSUES (Work but Incomplete)

### 6. Usage Service Not Wired Into Generation
**Status:** 🟡 NOT INTEGRATED  
**File:** `backend/main.py:107-120`

The usage service exists (`backend/services/usage.py`) with:
- ✓ `check_generation_allowed()` - Rate limiting
- ✓ `record_generation()` - Track generations
- ✓ `record_tokens()` - Track token usage
- ✓ `get_usage_stats()` - Get user stats

But it's never called from the generation endpoint.

**Missing from `start_generation()` endpoint:**
1. Import the service
2. Check user tier limits before starting
3. Record generation attempt
4. Record token usage after generation completes
5. Return usage stats

---

### 7. No Auth Integration in Endpoints
**Status:** 🟡 ENDPOINTS NOT PROTECTED  
**File:** `backend/main.py` - All CRUD endpoints (lines 50+)

**Current Issue:** All endpoints are public (no auth requirement)
- `POST /api/projects` - Anyone can create projects
- `GET /api/projects` - No user filtering
- No way to associate projects with users

**Missing:** Should inject `get_current_user` into endpoints and filter by user

---

### 8. Frontend Missing Auth Routes
**Status:** 🟡 NO LOGIN/REGISTER UI  
**File:** `frontend/src/App.tsx`

Current routes (lines 14-28):
```javascript
<Route path="/" element={<Layout />}>
  <Route index element={<ProjectList />} />
  <Route path="new" element={<NewProject />} />
  <Route path="projects/:id/briefing" element={<Briefing />} />
  // ... more routes
</Routes>
```

**Missing Routes:**
- `/auth/login` - Login page
- `/auth/register` - Registration page

**Missing:** Auth context/state management, token storage, logout functionality

---

### 9. Frontend API Client Missing Auth Methods
**Status:** 🟡 NO AUTH API CALLS  
**File:** `frontend/src/api/client.ts`

Current exports (79 lines): Project, Pipeline, Scenario, Agent, Export, Config, Test methods

**Missing Methods:**
- `register(email, password, displayName)` - Call POST /api/auth/register
- `login(email, password)` - Call POST /api/auth/login
- `logout()` - Clear token from localStorage
- `refresh()` - Call POST /api/auth/refresh
- `getMe()` - Call GET /api/auth/me
- `getUsageStats(userId)` - Call GET /api/usage/stats

**Missing Token Management:**
- No `getToken()` method to retrieve stored JWT
- No `setToken()` method to store JWT after login
- No automatic token injection into request headers
- No automatic token refresh when expired

---

## MINOR ISSUES (Polish)

### 10. database_url Setting Not Validated
**File:** `backend/db/session.py:7`

If `database_url` is missing from config, this line throws AttributeError:
```python
DATABASE_URL = settings.database_url
```

Should validate or provide sensible default.

---

## FILE READINESS SUMMARY

| File | Status | Notes |
|------|--------|-------|
| backend/config.py | 🔴 BROKEN | Missing settings: auth_enabled, jwt_secret, database_url |
| backend/requirements.txt | 🔴 BROKEN | Missing 5 critical packages |
| backend/main.py | 🔴 BROKEN | No DB init, no auth router, no usage service |
| backend/auth/routes.py | 🟡 INCOMPLETE | get_me() is stub |
| backend/auth/jwt.py | ✅ COMPLETE | Working |
| backend/auth/deps.py | ✅ COMPLETE | Working |
| backend/db/models.py | ✅ COMPLETE | Well-designed |
| backend/db/session.py | ✅ COMPLETE | init_db() ready, just not called |
| backend/services/usage.py | ✅ COMPLETE | All functions ready, just not called |
| backend/services/storage.py | ✅ COMPLETE | File storage working |
| backend/pipeline/orchestrator.py | ✅ COMPLETE | Pipeline working |
| frontend/src/App.tsx | 🟡 INCOMPLETE | Missing auth routes |
| frontend/src/api/client.ts | 🟡 INCOMPLETE | Missing auth methods |
| frontend/src/types/index.ts | ✅ COMPLETE | Good type definitions |
| frontend/src/utils/scenario.ts | ✅ COMPLETE | Normalizer working |
| frontend/src/pages/ScenarioView.tsx | ✅ COMPLETE | Uses normalizer correctly |

---

## IMPLEMENTATION ORDER

1. **Fix backend/config.py** - Add missing settings
2. **Fix backend/requirements.txt** - Add missing dependencies
3. **Fix backend/main.py** - Add DB init, auth router, usage service integration
4. **Fix backend/auth/routes.py** - Implement get_me() endpoint
5. **Protect backend endpoints** - Add user context to CRUD operations
6. **Wire usage service** - Check limits, record usage in generation
7. **Create frontend auth pages** - Login/register UI
8. **Add frontend auth API calls** - client.ts auth methods
9. **Implement token management** - localStorage, headers, refresh
10. **Test auth flow end-to-end**

---

## Quick Test Checklist

Once fixed, verify:
- [ ] Backend starts without errors
- [ ] `POST /api/auth/register` returns tokens
- [ ] `POST /api/auth/login` returns tokens
- [ ] `GET /api/auth/me` returns user info
- [ ] Invalid token returns 401
- [ ] Database file created at ./scenarioforge.db
- [ ] Frontend login/register pages load
- [ ] Can register and see redirect to projects
- [ ] Projects filtered by user
- [ ] Generation respects rate limits
- [ ] Usage stats endpoint returns data

