# ScenarioForge v2 Branch - Comprehensive Audit Report

**Date**: 2026-04-30  
**Branch**: v2  
**Status**: Clean working tree

---

## EXECUTIVE SUMMARY

The v2 branch implements a complete redesign of ScenarioForge with:
- **User authentication** (JWT + SQLAlchemy DB)
- **Tier-based usage tracking** (free/pro with limits)
- **Hybrid storage** (filesystem + metadata DB)
- **Multi-agent screenplay generation** pipeline
- **Real-time frontend** with SSE streaming
- **Agent chat interface** for interactive collaboration
- **Revision tracking** and scenario export (MD/PDF)

**Overall Quality**: **GOOD** with several **CRITICAL ISSUES** identified.

---

## I. BACKEND ARCHITECTURE

### A. Authentication & Authorization

#### Files:
- `backend/auth/__init__.py` (empty)
- `backend/auth/jwt.py` (45 lines)
- `backend/auth/deps.py` (57 lines)
- `backend/auth/routes.py` (128 lines)

#### Features Implemented:
✅ JWT tokens (access + refresh with different expiry)  
✅ Password hashing with bcrypt  
✅ User registration & login  
✅ Token refresh endpoint  
✅ `/api/auth/me` user info endpoint  
✅ Optional auth (controlled by `settings.auth_enabled`)  
✅ Active user filtering  

#### Issues Found:
1. **CRITICAL** - No `db.commit()` after user creation in register/login
   - Line 62 in `routes.py`: `await db.flush()` but never commits
   - The user row won't persist if transaction rolls back
   - **Fix**: Add `await db.commit()` after flush

2. **ISSUE** - `TokenResponse` doesn't return `refresh_token` 
   - But code returns it (lines 66, 86, 106) ✓ OK after checking

3. **MINOR** - No token type hint in `verify_token` return
   - Should be `Optional[str]` (already is ✓)

### B. Database Models & Session

#### Files:
- `backend/db/__init__.py` (empty)
- `backend/db/models.py` (57 lines)
- `backend/db/session.py` (30 lines)

#### Features Implemented:
✅ User model with UUID PK, email unique index, tier/is_active flags  
✅ ProjectRecord metadata (stores only project.json fields, scenario separately)  
✅ UsageRecord for monthly token tracking (year_month composite key)  
✅ Async SQLAlchemy with aiosqlite  
✅ Atomic transactions with rollback  
✅ Cascade delete on user deletion  
✅ Timezone-aware datetime defaults  

#### Issues Found:
1. **ISSUE** - No `await db.commit()` in `get_db()` dependency
   - Line 19: `await session.commit()` is good, but not explicit handling of flush vs commit
   - On exception, rollback is called ✓ (line 21)
   - **Minor**: Works but could be clearer with explicit flush

2. **TODO** - `init_db()` comment says "use Alembic in production" but NO ALEMBIC SETUP EXISTS
   - No `alembic/` folder
   - No `alembic.ini`
   - In production, migrations would fail
   - **Action Required**: Set up Alembic or document migration strategy

3. **NOTE** - `ProjectRecord.id` has no default generator
   - Will require UUID provided by app layer ✓ (Project model has it)
   - But could auto-generate here instead

### C. Configuration

#### File:
- `backend/config.py` (68 lines)

#### Features:
✅ Pydantic Settings with env file support  
✅ Auth feature flag (`auth_enabled`, default False)  
✅ JWT secret management  
✅ Model catalog (Aurora Haiku/Sonnet/Opus + Orion GPT-5.2)  
✅ Depth modes with agent configs and model assignments  

#### Issues Found:
1. **SECURITY** - Default `jwt_secret = "dev-secret-change-me"`
   - Must be changed in production
   - Should error if used in production mode
   - **Recommendation**: Validate in __init__ if `auth_enabled=True`

2. **CONFIG** - Hardcoded Trinity gateway URLs
   - Lines 10-11: URLs are hardcoded
   - Should be env vars
   - **Fix**: Add `trinity_aurora_url` and `trinity_orion_url` to BaseSettings (already done ✓)

### D. LLM Client

#### File:
- `backend/services/llm.py` (78 lines)

#### Features:
✅ Dual-provider support (Aurora/Orion via Trinity proxy)  
✅ Model detection (gpt → Orion, claude → Aurora)  
✅ Async httpx with 120s timeout  
✅ Proper Anthropic Messages API format  
✅ OpenAI-compatible Orion format  

#### Issues Found:
1. **ISSUE** - No retry logic on network failures
   - If Trinity is down, generates immediately fail
   - **Recommendation**: Add exponential backoff

2. **MINOR** - `max_tokens` hardcoded to 4096 in some calls
   - Wastes tokens on small outputs
   - No dynamic sizing

3. **ISSUE** - No token counting
   - Doesn't return token usage to track against tier limits
   - Usage service expects `tokens` dict but orchestrator doesn't populate it
   - **Critical for Pro tier**: Line 226 in `storage.py` accepts `tokens: Optional[dict]` but never passed

### E. Storage Service

#### File:
- `backend/services/storage.py` (356 lines)

#### Features:
✅ Directory-based project storage with atomic writes  
✅ Hybrid format: project.json + brief.json + scenario.md + subdirectories  
✅ Per-agent intermediate results (agents/{agent}.json)  
✅ Revision history with timestamps (revisions/{ts}_{source}.md)  
✅ Chat history (chats/{agent}.json)  
✅ Legacy migration (auto-converts old flat .json files)  
✅ Per-project async locks  
✅ Proper cleanup of temp files  

#### Issues Found:
1. **ISSUE** - `_locks` is module-level and grows unbounded
   - Line 37: `self._locks: dict[str, asyncio.Lock] = {}`
   - Never cleaned up → memory leak on long-running servers
   - **Fix**: Add LRU or periodic cleanup

2. **ISSUE** - `_load_legacy()` silently returns None on JSON errors
   - Line 163-169: No logging of which files failed
   - Makes debugging hard
   - **Recommendation**: Add debug logging

3. **LOGIC BUG** - Revision filename parsing is fragile
   - Line 290: `fname[:-3].split("_", 2)` assumes `YYYYMMDD_HHMMSS_{source}.md`
   - But source can contain underscores (e.g., `before-manual-edit`)
   - If source has `_`, parsing breaks
   - **Example**: `20260430_125030_before_manual_edit.md` → time parsed as `125030_before`, source as `manual_edit`
   - **Fix**: Change filename format to use different delimiter

4. **ISSUE** - No atomic directory creation
   - Calling `os.makedirs()` multiple times is safe but not optimal
   - OK for SQLite but would be issue for network FS

### F. Usage Tracking Service

#### File:
- `backend/services/usage.py` (97 lines)

#### Features:
✅ Tier-based limits (free: 5 gen/month fast only; pro: unlimited)  
✅ Monthly tracking with year_month keys  
✅ Generation count + token tracking  
✅ Usage stats endpoint  
✅ Depth mode validation per tier  

#### Issues Found:
1. **CRITICAL** - No calls to `record_generation()` or `record_tokens()`
   - Functions exist but NEVER CALLED from `main.py`
   - **Result**: Usage never tracked, limits never enforced
   - **Fix**: Integrate into `/api/projects/{id}/generate` endpoint

2. **ISSUE** - `check_generation_allowed()` never called
   - Line 47-64: Validation logic exists but unreachable from main.py
   - **Result**: Free tier users can use Pro features
   - **Fix**: Call in generation start endpoint

3. **MINOR** - No concurrent generation counter
   - Tier has `max_concurrent` (free: 1, pro: 3) but never checked
   - **Missing feature**: Enforce concurrent limits

### G. Pipeline Orchestrator

#### File:
- `backend/pipeline/orchestrator.py` (185 lines)

#### Features:
✅ Multi-iteration pipeline (fast/standard/deep)  
✅ Agent chaining (director → screenwriter → visual_director → copywriter → editor)  
✅ Progressive scenario building  
✅ Stop signal handling  
✅ Revision saving after each agent  
✅ Per-agent result storage  
✅ Question generation from briefing  

#### Issues Found:
1. **ISSUE** - Question parsing is brittle
   - Lines 36-46: Splits on `\n` and strips numbering
   - If LLM returns unnumbered list, gets single response back
   - **Fallback is reasonable** but line 45 returns full response as single question

2. **BUG** - `on_progress` callback never awaited properly
   - Line 83: `await on_progress(...)` but callback is not async in all callers
   - **Result**: If called with sync callback, will error
   - **Recommendation**: Make callback optional/typed

3. **ISSUE** - No token usage tracking
   - Orchestrator calls agents but doesn't collect token counts
   - Can't feed to usage service
   - **Impact**: Pro tier billing impossible

4. **LOGIC** - `_running` dict uses project_id but never cleaned up
   - Line 107: `pop()` is called but on 1000 projects = 1000 entries
   - **Minor memory leak** (same as storage locks issue)

### H. Agents

#### Files:
- `backend/agents/base.py` (21 lines)
- `backend/agents/{director,screenwriter,visual_director,copywriter,editor}.py`

#### Features:
✅ BaseAgent ABC with standard interface  
✅ 5 agents with specialized system prompts (Russian)  
✅ Model override support  

#### Issues Found:
1. **NOTE** - Agents are stateless ✓
2. **NOTE** - System prompts are in Russian and detailed ✓
3. **MINOR** - No max_tokens override in agent.run()
   - Always uses 4096, could be optimized per agent type

---

## II. FRONTEND ARCHITECTURE

### A. Type Definitions

#### File:
- `frontend/src/types/index.ts` (87 lines)

#### Issues:
1. **MISMATCH** - `Project.title` not set by backend
   - Backend Project model has no title field
   - Line 3: `title: string` but backend never sets it
   - **Result**: Title always undefined on frontend
   - **Fix**: Remove or auto-generate from idea

2. **MISMATCH** - Status values inconsistent
   - Backend has: `ProjectStatus.created | briefing | questions_ready | answers_submitted | generating | completed | error | stopped`
   - Frontend expects: `created | draft | briefing | questions_ready | answers_submitted | generating | completed | done | error | stopped`
   - `done` vs `completed` mismatch
   - **Issue**: Generation completion might not redirect (line 42 in Generation.tsx checks both)

3. **GOOD** - `ChatMessage.timestamp` optional, role is strict ✓

### B. API Client

#### File:
- `frontend/src/api/client.ts` (79 lines)

#### Features:
✅ Typed API interface  
✅ SSE stream support  
✅ Proper error handling  
✅ Export URL generation (not fetch)  

#### Issues:
1. **ISSUE** - No auth token handling
   - No `Authorization` header added to requests
   - `get_current_user()` backend dep expects Bearer token
   - **Result**: All requests fail if `auth_enabled=True`
   - **Fix**: Add localStorage token retrieval + header injection

2. **ISSUE** - `reviseScene()` doesn't match backend
   - Line 35: `reviseScene(id, sceneId, agent)` sends only scene_number & agent
   - Backend expects: `scene_number, agent, instructions`
   - **Missing**: instructions parameter
   - **Result**: Endpoint always fails
   - **Fix**: Add instructions parameter or change backend

3. **MINOR** - No retry logic on network failures

### C. Pages

#### ScenarioView.tsx (265 lines)
✅ Revision history with diff view  
✅ Text selection menu integration  
✅ Inline chat panel  
✅ Scene navigation  
✅ Export links  
⚠️ **Issue**: Calls `normalizeScenarioResponse()` but scenarios might be plain strings from backend

#### Generation.tsx (298 lines)
✅ SSE streaming updates  
✅ Agent pipeline visualization  
✅ Progress bar  
✅ Draft preview toggle  
✅ Fallback to polling on SSE error  
⚠️ **Issue**: Line 42 checks `s.status === 'done' || 'completed'` but enum is `ProjectStatus.completed`
⚠️ **Issue**: `draft_preview` populated from SSE but SSE returns at most 500 chars

#### AgentChat.tsx (196 lines)
✅ Full-featured agent chat UI  
✅ Optimistic message updates  
✅ Persistent history loading  
✅ Clear history option  
✅ Smooth auto-scroll  
⚠️ **Issue**: Chat history `timestamp` might not exist (nullable in response)

#### Others:
- **Briefing.tsx**: Not in changed files list but imported in App.tsx → **EXISTS**
- **ScenarioEditor.tsx**: Not in changed files list but imported in App.tsx → **EXISTS**
- **NewProject.tsx**: Not in changed files list but in pages folder → **EXISTS**
- **ProjectList.tsx**: Not in changed files list but in pages folder → **EXISTS**
- **Settings.tsx**: Not in changed files list but imported → **EXISTS**
- **TestModels.tsx**: Not in changed files list but imported → **EXISTS**

### D. Components

#### InlineChat.tsx (59 lines)
✅ Right-side panel  
✅ Fragment display + truncation  
✅ Loading state  
✓ Clean code

#### TextSelectionMenu.tsx (138 lines)
✅ Context menu on text selection  
✅ Ask + rewrite options  
✅ Agent selector  
✅ Enter-to-send  
✓ Clean implementation

#### Layout & ErrorBoundary
✅ Both referenced in App.tsx but not in changed files

### E. Utilities

#### frontend/src/utils/scenario.ts (56 lines)
✅ Scenario response normalization  
✅ Handles both structured & markdown responses  
✅ Safe type guards  
✓ Defensive coding

---

## III. Main Backend Entry Point

#### File:
- `backend/main.py` (485 lines)

#### Issues Found:

1. **CRITICAL** - No authentication on any endpoints
   - Lines 56-82 (projects): No `get_current_user` dependency
   - Lines 86-158 (pipeline): No auth
   - Lines 163-210 (agents): No auth
   - **Result**: Multi-tenant system has no isolation
   - **Fix**: Add `user: User = Depends(get_current_user)` to all endpoints + filter by user_id

2. **CRITICAL** - No usage tracking
   - `check_generation_allowed()` from usage.py never called
   - `record_generation()` never called
   - `record_tokens()` never called
   - **Result**: Tier limits don't work, usage never tracked
   - **Fix**: Integrate usage service into `/api/projects/{id}/generate`

3. **CRITICAL** - ProjectRecord metadata incomplete
   - Creates projects but never saves to DB
   - Line 59: `await storage.save_project(project)` saves to filesystem only
   - ProjectRecord needs insert in DB
   - **Result**: DB is out of sync with filesystem
   - **Fix**: Create ProjectRecord row in DB, link to user_id

4. **ISSUE** - Model overrides not validated
   - Line 121: Accepts any model_overrides without checking if models exist
   - **Result**: Invalid model IDs might be requested
   - **Recommendation**: Validate against AVAILABLE_MODELS

5. **ISSUE** - Chat endpoints don't require project access check
   - Line 243-244: No verification that user owns project
   - **Result**: User A can chat with user B's projects
   - **Fix**: Add ownership check with get_current_user

6. **ISSUE** - SSE stream doesn't filter by user
   - Line 368-414: Stream returns full project status
   - **Result**: Any user can stream any project
   - **Fix**: Add user ownership verification

7. **ISSUE** - Export endpoints open to all users
   - Line 336-363: No auth on export
   - **Result**: Any user can export any project
   - **Fix**: Add ownership check

8. **MINOR** - `_run_pipeline` error handling creates bad scenario state
   - Line 134: Sets `project.scenario = f"Error: {str(e)}"`
   - **Result**: Can't distinguish real scenarios from errors
   - **Recommendation**: Add error_message field instead

---

## IV. Tests

#### File:
- `backend/tests/test_pipeline.py` (64 lines)

#### Coverage:
✅ Briefing question generation  
✅ Fast pipeline execution  
✅ Stop signal handling  
✅ Proper mocking  

#### Issues:
1. **INCOMPLETE** - Only 3 tests for massive codebase
   - No tests for storage operations
   - No tests for auth
   - No tests for usage tracking
   - No tests for API endpoints
   - **Recommendation**: Add comprehensive integration tests

---

## V. Dependencies

#### backend/requirements.txt
✅ All critical deps present:
- FastAPI 0.115 ✓
- SQLAlchemy 2.0.35 + aiosqlite async ✓
- Pydantic 2.9 + pydantic-settings ✓
- python-jose + passlib for auth ✓
- weasyprint for PDF ✓
- pytest + pytest-asyncio ✓

#### frontend/package.json
✅ React 19.2.5 ✓
✅ React Router 7.14.2 ✓
✅ Tailwind 4.2.4 ✓
✅ TypeScript 6.0.2 ✓
⚠️ **NOTE**: No state management library (Redux/Zustand/Jotai)
- Relying on React Context or local state
- Should be OK for current size

---

## VI. Storage Strategy

### Filesystem Layout (v2):
```
data/
  {project_id}/
    project.json          ← metadata (no scenario)
    brief.json            ← briefing Q&A
    scenario.md           ← current scenario
    agents/
      director.json       ← agent result
      screenwriter.json
      ...
    revisions/
      {ts}_director.md
      {ts}_before-manual-edit.md
      ...
    chats/
      director.json       ← chat history
      ...
```

✅ Good separation of concerns  
✅ Human-readable markdown  
✅ Atomic writes with temp files  
⚠️ **Issue**: No database sync (v2 ignores DB for projects)

### Database Schema:
```
users
  id (UUID PK)
  email (unique)
  hashed_password
  display_name
  tier (free/pro)
  is_active
  created_at

projects  ← metadata only, not used!
  id (UUID PK)
  user_id (FK)
  idea
  type
  status
  depth_mode
  created_at, updated_at

usage
  id (INT PK)
  user_id (FK)
  year_month (e.g., "2026-04")
  generations_count
  tokens_input, tokens_output
```

⚠️ **ISSUE**: ProjectRecord table has no data
- Created but never written to
- Breaks multi-tenancy isolation

---

## VII. Missing Infrastructure

### Alembic Migrations
- ❌ NO `alembic/` directory
- ❌ NO `alembic.ini`
- ❌ NO migration scripts
- **Critical for production**: Cannot manage schema changes
- **Action**: Set up Alembic immediately if DB used

### Test Coverage
- ❌ Only 3 test functions
- ❌ No integration tests
- ❌ No API endpoint tests
- ❌ No auth tests
- ❌ No storage tests

### Documentation
- ❌ No API docs generated
- ❌ No database migration guide
- ❌ No deployment guide
- ❌ No environment variable docs

### Monitoring
- ❌ No logging
- ❌ No metrics
- ❌ No health check endpoint
- ❌ No structured logging

---

## VIII. Critical Issues Summary

### BLOCKING ISSUES (Must Fix Before Production):

1. **No User Isolation** - All endpoints open to all users
   - Add `get_current_user` to all endpoints
   - Filter projects by user_id

2. **Tier Limits Not Enforced** - Usage service never called
   - Integrate `check_generation_allowed()` into generation endpoint
   - Call `record_generation()` and `record_tokens()` after completion

3. **ProjectRecord Never Saved** - DB/filesystem out of sync
   - Create ProjectRecord row when project created
   - Link to user_id for isolation

4. **No Token Tracking** - Can't bill Pro users
   - LLMClient must return token counts
   - Orchestrator must track and pass to usage service

5. **API/Frontend Auth Mismatch** - Frontend doesn't send JWT
   - Add token storage & header injection in api/client.ts
   - Handle 401 responses with re-login

### HIGH PRIORITY ISSUES:

6. **Broken Registration** - User not committed to DB
   - Add `await db.commit()` after creating user

7. **No Alembic Setup** - Cannot manage schema changes
   - Set up alembic directory + migration templates

8. **Chat Endpoint Mismatches** - Frontend/backend API mismatch
   - Fix `reviseScene()` to include instructions parameter
   - Fix status enum mismatch (done vs completed)

9. **Revision Filename Parsing Fragile** - Underscores in source break parsing
   - Change delimiter scheme (e.g., use `--` instead of `_`)

10. **Memory Leaks** - Locks and running dict grow unbounded
    - Implement LRU cache or periodic cleanup

### MEDIUM PRIORITY ISSUES:

11. Draft previews truncated (500 chars limit)
12. No error recovery/retry logic in LLM calls
13. No concurrent generation limiting
14. No health check endpoint
15. No structured logging

---

## IX. Integration Points Verification

### ✅ Working Connections:
1. **Storage → Orchestrator** ✓
   - Orchestrator calls `storage.save_project()`, `save_revision()`, `save_agent_result()`
   
2. **Orchestrator → Agents** ✓
   - AGENTS dict imported, agents called with context

3. **Agents → LLM Client** ✓
   - BaseAgent calls `llm_client.generate()`

4. **Frontend → API** ✓
   - api/client.ts maps all endpoints correctly (mostly)

5. **Storage → Frontend (via API)** ✓
   - API loads from storage and returns to frontend

### ⚠️ Broken Connections:
1. **Database → Projects** ✗
   - ProjectRecord never written
   
2. **Usage Service → Generation** ✗
   - Never called from main.py

3. **Auth Deps → Endpoints** ✗
   - Imported but not used

4. **Frontend Auth → API** ✗
   - No JWT header sent

5. **LLM Tokens → Usage Tracking** ✗
   - No token collection

---

## X. Recommendations & Action Plan

### IMMEDIATE (Before Any Production Deployment):
- [ ] Add user_id filtering to ALL endpoints
- [ ] Implement user project isolation in storage service
- [ ] Wire usage tracking into generation pipeline
- [ ] Fix user registration DB commit
- [ ] Fix API/frontend auth header injection
- [ ] Set up Alembic migrations
- [ ] Fix status enum consistency (done → completed)
- [ ] Fix revision filename parsing

### SHORT TERM (Week 1):
- [ ] Add comprehensive integration tests
- [ ] Implement error retry logic in LLM client
- [ ] Add structured logging
- [ ] Fix concurrent generation limiting
- [ ] Clean up memory leaks (locks, running dict)
- [ ] Add health check endpoint

### MEDIUM TERM (Week 2):
- [ ] Add monitoring/metrics
- [ ] Implement request validation middleware
- [ ] Add rate limiting
- [ ] Implement API documentation (OpenAPI/Swagger)
- [ ] Add deployment guide + env var documentation

### LONG TERM:
- [ ] Add caching layer (Redis)
- [ ] Implement queue system for generations
- [ ] Add webhook support for async notifications
- [ ] Implement payment integration for Pro tier

---

## XI. File Quality Assessment

| File | Lines | Quality | Issues |
|------|-------|---------|--------|
| auth/jwt.py | 45 | ✅ Good | None |
| auth/deps.py | 57 | ✅ Good | None |
| auth/routes.py | 128 | ⚠️ OK | No DB commit |
| config.py | 68 | ✅ Good | Secret not validated |
| db/models.py | 57 | ✅ Good | ProjectRecord never used |
| db/session.py | 30 | ✅ Good | No Alembic |
| services/llm.py | 78 | ✅ Good | No retry, no token return |
| services/storage.py | 356 | ✅ Good | Memory leaks, fragile parsing |
| services/usage.py | 97 | ⚠️ OK | Never called |
| pipeline/orchestrator.py | 185 | ✅ Good | No token tracking |
| main.py | 485 | ❌ Critical | No auth, no isolation, no usage tracking |
| tests/test_pipeline.py | 64 | ⚠️ Sparse | Only 3 tests |
| types/index.ts | 87 | ⚠️ OK | Type mismatches |
| api/client.ts | 79 | ⚠️ OK | No auth, API mismatches |
| Generation.tsx | 298 | ✅ Good | Minor status issues |
| ScenarioView.tsx | 265 | ✅ Good | None |
| AgentChat.tsx | 196 | ✅ Good | None |

---

## XII. Conclusion

The v2 branch shows **solid architectural foundation** with proper separation of concerns, async/await patterns, and good frontend UI. However, it has **critical security and operational issues** that make it unsuitable for production:

### Strengths:
- Clean, modular code structure
- Proper async patterns throughout
- Good TypeScript typing on frontend
- Comprehensive agent system
- Nice revision tracking UI

### Critical Gaps:
- No user isolation (all projects visible to all users)
- No tier enforcement (usage tracking dead code)
- Database/filesystem misalignment
- Auth infrastructure incomplete (frontend doesn't send tokens)
- Missing migration system
- Minimal test coverage

### Verdict:
**NOT READY FOR PRODUCTION** - Needs 2-3 weeks of critical fixes before any user-facing deployment. Current state suitable only for **single-user development** or **internal testing**.

