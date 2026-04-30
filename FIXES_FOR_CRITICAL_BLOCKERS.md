# Critical Blocker Fixes - Exact Code Changes

This document provides the exact code changes needed to fix the 5 critical blockers and get the backend running.

---

## FIX #1: Add Missing Settings to backend/config.py

**File:** `backend/config.py`  
**Current State:** Lines 8-16 define class Settings with 7 properties  
**Change Type:** Add 3 properties

**BEFORE (lines 8-16):**
```python
class Settings(BaseSettings):
    trinity_api_key: str = ""
    trinity_aurora_url: str = "https://gate.trinity.tg/aurora/v1"
    trinity_orion_url: str = "https://gate.trinity.tg/orion/v1"
    storage_dir: str = "./data"
    host: str = "0.0.0.0"
    port: int = 8000

    model_config = {"env_file": str(PROJECT_ROOT / ".env")}
```

**AFTER:**
```python
class Settings(BaseSettings):
    trinity_api_key: str = ""
    trinity_aurora_url: str = "https://gate.trinity.tg/aurora/v1"
    trinity_orion_url: str = "https://gate.trinity.tg/orion/v1"
    storage_dir: str = "./data"
    host: str = "0.0.0.0"
    port: int = 8000
    
    # Authentication and database settings (ADDED)
    auth_enabled: bool = True
    jwt_secret: str = "your-secret-key-change-in-production"
    database_url: str = "sqlite+aiosqlite:///./scenarioforge.db"

    model_config = {"env_file": str(PROJECT_ROOT / ".env")}
```

**Also Update:** `.env.example` to include:
```
AUTH_ENABLED=true
JWT_SECRET=your-secret-key-change-in-production
DATABASE_URL=sqlite+aiosqlite:///./scenarioforge.db
```

**Why:** These settings are referenced in:
- `backend/auth/deps.py:20` - `if not settings.auth_enabled`
- `backend/auth/jwt.py:22,38` - `settings.jwt_secret`
- `backend/db/session.py:7` - `settings.database_url`

Without these, any auth or database access throws `AttributeError: 'Settings' object has no attribute 'auth_enabled'`

---

## FIX #2: Add Missing Dependencies to backend/requirements.txt

**File:** `backend/requirements.txt`  
**Current State:** 13 packages listed  
**Change Type:** Add 5 packages

**BEFORE (entire file - 13 lines):**
```
fastapi==0.115.0
uvicorn[standard]==0.30.6
pydantic==2.9.2
pydantic-settings==2.5.2
httpx==0.27.2
python-dotenv==1.0.1
weasyprint==61.2
markdown==3.7
pytest==8.3.3
pytest-asyncio==0.24.0
httpx[http2]==0.27.2
aiofiles==24.1.0
```

**AFTER (add these 5 lines):**
```
fastapi==0.115.0
uvicorn[standard]==0.30.6
pydantic==2.9.2
pydantic-settings==2.5.2
httpx==0.27.2
python-dotenv==1.0.1
weasyprint==61.2
markdown==3.7
pytest==8.3.3
pytest-asyncio==0.24.0
httpx[http2]==0.27.2
aiofiles==24.1.0
# Database and authentication (ADDED)
sqlalchemy[asyncio]==2.0.25
passlib[bcrypt]==1.7.4
python-jose[cryptography]==3.3.0
aiosqlite==1.3.0
email-validator==2.1.0
```

**Why Each Dependency:**
- `sqlalchemy[asyncio]` - ORM with async support (imported in `backend/db/session.py`, `backend/db/models.py`)
- `passlib[bcrypt]` - Password hashing (used in `backend/auth/routes.py:17` - `CryptContext`)
- `python-jose[cryptography]` - JWT tokens (imported in `backend/auth/jwt.py:6` - `from jose import jwt`)
- `aiosqlite` - SQLite async driver (required by database URL protocol)
- `email-validator` - Email validation (required for Pydantic `EmailStr` type in `backend/auth/routes.py:23`)

**How to Test After:**
```bash
pip install -r backend/requirements.txt
python -c "import sqlalchemy; import passlib; import jose; import aiosqlite; print('All imports successful')"
```

---

## FIX #3: Initialize Database in backend/main.py Lifespan

**File:** `backend/main.py`  
**Current State:** Lines 1-35 define lifespan with storage migration but no DB init  
**Change Type:** Add import + 1 line in lifespan function

**BEFORE (lines 1-35):**
```python
import asyncio
import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import AsyncGenerator, Optional

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.config import settings, AVAILABLE_MODELS, DEPTH_MODES
from backend.models.project import (
    Project, ProjectCreate, ProjectStatus, GenerateRequest,
    ReviseRequest, BriefAnswers, ScenarioUpdate,
)
from backend.services.storage import storage
from backend.services.export import export_service
from backend.services.llm import llm_client
from backend.pipeline.orchestrator import orchestrator, AGENTS


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-migrate legacy projects on startup
    migrated = await storage.migrate_all_legacy()
    if migrated:
        print(f"Migrated {migrated} legacy projects to v2 storage format")
    yield
    await llm_client.close()
```

**AFTER:**
```python
import asyncio
import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import AsyncGenerator, Optional

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.config import settings, AVAILABLE_MODELS, DEPTH_MODES
from backend.models.project import (
    Project, ProjectCreate, ProjectStatus, GenerateRequest,
    ReviseRequest, BriefAnswers, ScenarioUpdate,
)
from backend.services.storage import storage
from backend.services.export import export_service
from backend.services.llm import llm_client
from backend.pipeline.orchestrator import orchestrator, AGENTS
from backend.db.session import init_db  # ADDED


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database
    await init_db()  # ADDED
    
    # Auto-migrate legacy projects on startup
    migrated = await storage.migrate_all_legacy()
    if migrated:
        print(f"Migrated {migrated} legacy projects to v2 storage format")
    yield
    await llm_client.close()
```

**What This Does:**
- Imports `init_db()` from `backend/db/session.py`
- Calls it on startup before anything else
- Creates all SQLAlchemy tables (User, ProjectRecord, UsageRecord)
- Creates SQLite database file at `./scenarioforge.db`

**How to Test:**
```bash
python -m backend.main  # or uvicorn backend.main:app
# Should see startup logs, then check if ./scenarioforge.db exists
ls -la scenarioforge.db
```

---

## FIX #4: Register Auth Routes in backend/main.py

**File:** `backend/main.py`  
**Current State:** Lines 37-45 create app with CORS middleware  
**Change Type:** Add import + 1 line after middleware

**BEFORE (lines 16-46):**
```python
from backend.config import settings, AVAILABLE_MODELS, DEPTH_MODES
from backend.models.project import (
    Project, ProjectCreate, ProjectStatus, GenerateRequest,
    ReviseRequest, BriefAnswers, ScenarioUpdate,
)
from backend.services.storage import storage
from backend.services.export import export_service
from backend.services.llm import llm_client
from backend.pipeline.orchestrator import orchestrator, AGENTS


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ... existing code ...


app = FastAPI(title="ScenarioForge", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Projects ---
```

**AFTER:**
```python
from backend.config import settings, AVAILABLE_MODELS, DEPTH_MODES
from backend.models.project import (
    Project, ProjectCreate, ProjectStatus, GenerateRequest,
    ReviseRequest, BriefAnswers, ScenarioUpdate,
)
from backend.services.storage import storage
from backend.services.export import export_service
from backend.services.llm import llm_client
from backend.pipeline.orchestrator import orchestrator, AGENTS
from backend.auth.routes import router as auth_router  # ADDED


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ... existing code ...


app = FastAPI(title="ScenarioForge", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register auth routes (ADDED)
app.include_router(auth_router)

# --- Projects ---
```

**What This Does:**
- Imports the auth router from `backend/auth/routes.py`
- Registers it with FastAPI
- Makes `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh` available

**How to Test:**
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"pass123","display_name":"Test"}'
# Should return tokens (or validation error, but not 404)
```

---

## FIX #5: Implement backend/auth/routes.py get_me() Endpoint

**File:** `backend/auth/routes.py`  
**Current State:** Lines 112-117 are a stub with just `pass`  
**Change Type:** Add import + replace function body

**BEFORE (lines 1-10, 112-117):**
```python
"""Auth API routes — register, login, refresh."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.jwt import create_access_token, create_refresh_token, verify_token
from backend.db.models import User
from backend.db.session import get_db

# ... routes code ...

@router.get("/me")
async def get_me(
    user: User = Depends(lambda authorization=None, db=None: None),
):
    """Get current user info. This is a placeholder — real dependency injection happens in main.py."""
    pass
```

**AFTER:**
```python
"""Auth API routes — register, login, refresh."""

from datetime import datetime, timezone
from typing import Optional  # ADDED

from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.jwt import create_access_token, create_refresh_token, verify_token
from backend.auth.deps import get_current_user_optional  # ADDED
from backend.db.models import User
from backend.db.session import get_db

# ... routes code ...

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

**What Changed:**
- Removed the lambda placeholder dependency
- Added proper import of `get_current_user_optional` from `backend/auth/deps.py`
- Added type hint `Optional[User]`
- Returns proper user info JSON instead of `pass`
- Returns 401 if not authenticated

**How to Test:**
```bash
# Without token
curl http://localhost:8000/api/auth/me
# Should return 401

# With token (after login)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/api/auth/me
# Should return {"id": "...", "email": "...", "display_name": "...", "tier": "free"}
```

---

## Summary: 5 Changes, 5 Files

| Priority | File | Change | Lines |
|----------|------|--------|-------|
| 1️⃣ | backend/config.py | Add 3 settings | +3 |
| 2️⃣ | backend/requirements.txt | Add 5 packages | +5 |
| 3️⃣ | backend/main.py | Add import + 1 call in lifespan | +2 |
| 4️⃣ | backend/main.py | Add import + 1 router registration | +2 |
| 5️⃣ | backend/auth/routes.py | Add import + implement get_me() | +7 |

**Total:** ~19 lines of code added across 4 files

**Time to Implement:** 10-15 minutes  
**Risk Level:** Very Low (all changes are additive, no modifications to existing logic)

---

## Implementation Checklist

- [ ] Update backend/config.py with auth_enabled, jwt_secret, database_url
- [ ] Update .env.example with AUTH_ENABLED, JWT_SECRET, DATABASE_URL
- [ ] Add 5 packages to backend/requirements.txt
- [ ] Run `pip install -r backend/requirements.txt`
- [ ] Add `from backend.db.session import init_db` to backend/main.py imports
- [ ] Add `await init_db()` as first line in lifespan()
- [ ] Add `from backend.auth.routes import router as auth_router` to backend/main.py imports
- [ ] Add `app.include_router(auth_router)` after CORS middleware
- [ ] Add import of `Optional` and `get_current_user_optional` to backend/auth/routes.py
- [ ] Replace get_me() function body with proper implementation
- [ ] Test: `python -m backend.main` should start without errors
- [ ] Test: `POST /api/auth/register` should work
- [ ] Test: Database file created at `./scenarioforge.db`

---

## After These 5 Fixes

Backend will be **runnable** but still needs:
- Usage service integration (import + wire into generation endpoint)
- Auth middleware for protecting endpoints
- Frontend auth pages and token management
- Frontend auth API methods

But the critical blocking issues will be resolved.

