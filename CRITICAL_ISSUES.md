# Critical Issues - v2 Branch

## 🔴 BLOCKING ISSUES (Fix Before Any Production Use)

### 1. **NO USER ISOLATION** ⚠️ SECURITY CRITICAL
**Location**: `backend/main.py` (all endpoints)  
**Problem**: All endpoints lack authentication checks  
**Impact**: Any user can see/edit/delete all projects  
**Example**: User A can delete User B's projects
```python
# CURRENT (INSECURE):
@app.get("/api/projects")
async def list_projects():
    return await storage.list_projects()  # Returns ALL projects

# SHOULD BE:
@app.get("/api/projects")
async def list_projects(user: User = Depends(get_current_user)):
    return await storage.list_projects(user_id=user.id)  # Filter by user
```

### 2. **USAGE TRACKING DISABLED** ⚠️ BUSINESS CRITICAL
**Location**: `backend/services/usage.py` (never called)  
**Problem**: Usage service exists but is never integrated  
**Impact**: 
- Tier limits don't work (free users can use Pro features)
- No billing data (can't charge Pro users)
- `check_generation_allowed()` unreachable dead code
```python
# usage.py functions are never called from main.py:
# - check_generation_allowed()
# - record_generation()
# - record_tokens()
```

### 3. **DATABASE NOT SYNCED WITH FILESYSTEM** ⚠️ DATA CRITICAL
**Location**: `backend/main.py:59` + `backend/db/models.py:29`  
**Problem**: Projects saved to filesystem only, DB never written  
**Impact**: 
- `ProjectRecord` table stays empty
- User isolation impossible (can't filter by user_id)
- Scaling to multiple servers breaks (no shared DB state)
```python
# CURRENT:
project = Project(idea=data.idea, type=data.type, equipment=data.equipment)
await storage.save_project(project)  # Only filesystem, no DB insert

# SHOULD ALSO DO:
proj_record = ProjectRecord(
    id=project.id, 
    user_id=user.id,  # Link to user!
    idea=project.idea,
    type=project.type,
    # ...
)
db.add(proj_record)
await db.commit()
```

### 4. **NO TOKEN TRACKING FOR BILLING** ⚠️ BUSINESS CRITICAL
**Location**: `backend/services/llm.py` + `backend/pipeline/orchestrator.py`  
**Problem**: LLM token usage never collected or reported  
**Impact**: Can't bill Pro users accurately  
```python
# llm_client.generate() returns string only, no token counts
response = await llm_client.generate(...)  # Missing token data

# Should return:
{
    "text": "...",
    "tokens": {
        "input": 1250,
        "output": 3847
    }
}
```

### 5. **FRONTEND DOESN'T SEND AUTH TOKENS** ⚠️ AUTH CRITICAL
**Location**: `frontend/src/api/client.ts:5`  
**Problem**: No JWT token in Authorization header  
**Impact**: If `auth_enabled=True`, all API calls return 401  
```typescript
// CURRENT (no auth):
const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
})

// SHOULD BE:
const token = localStorage.getItem('access_token')
const headers: HeadersInit = { 'Content-Type': 'application/json' }
if (token) {
    headers['Authorization'] = `Bearer ${token}`
}
const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
})
```

---

## 🟠 HIGH PRIORITY ISSUES (Week 1 Fixes)

### 6. **User Registration Doesn't Commit to DB**
**Location**: `backend/auth/routes.py:62`
```python
user = User(email=data.email, ...)
db.add(user)
await db.flush()  # ❌ Missing: await db.commit()
```

### 7. **No Alembic Migrations Setup**
**Location**: Missing entire `/backend/alembic/` directory
```
❌ No alembic/ directory
❌ No alembic.ini  
❌ No versions/ migrations
```
In production, schema changes impossible.

### 8. **Frontend/Backend API Mismatch**
**Location**: `frontend/src/api/client.ts:35` vs `backend/main.py:163`
```typescript
// Frontend calls:
reviseScene(id, sceneId, agent)  // 3 params

// Backend expects:
@app.post("/api/projects/{id}/revise")
async def revise_project(data: ReviseRequest):  // Expects: scene_number, agent, instructions
```
Missing `instructions` parameter!

### 9. **Status Enum Mismatch**
**Location**: Multiple places  
```
Backend: ProjectStatus.completed  
Frontend: checks for both 'done' AND 'completed'  
SSE: might send 'done' or 'completed'
```

### 10. **Revision Filename Parsing Breaks with Underscores**
**Location**: `backend/services/storage.py:290`
```python
# Current format: {ts}_{source}.md
# Problem: If source has underscores (e.g., "before_manual_edit")
# Split fails: "20260430_125030_before_manual_edit.md".split("_", 2)
# Result: time="125030_before", source="manual_edit" ❌

# Fix: Use different delimiter
# New format: {ts}--{source}.md
# Result: "20260430_125030--before_manual_edit.md".split("--", 1) ✓
```

---

## 🟡 MEDIUM PRIORITY ISSUES (Week 1-2 Fixes)

### 11. **Memory Leaks - Unbounded Lock Dictionary**
**Location**: `backend/services/storage.py:37`
```python
self._locks: dict[str, asyncio.Lock] = {}  # Grows unbounded!
# After 10,000 projects, 10,000+ locks in memory
# Fix: Use LRU cache or weakref
```

### 12. **No Error Recovery in LLM Client**
**Location**: `backend/services/llm.py`
```python
# Direct POST, no retry logic
resp = await self._client.post(url, json=payload, headers=headers)
# If Trinity times out → immediate failure
# Should: Retry with exponential backoff
```

### 13. **Chat History Missing Timestamps**
**Location**: `backend/main.py:281-282`
```python
history.append({
    "role": "user", 
    "content": data.message, 
    "timestamp": datetime.now(timezone.utc).isoformat()  # ✓ Added
})
```
But `get_chat_history()` might return old history without timestamps.

### 14. **No Concurrent Generation Limits**
**Location**: `backend/services/usage.py` + `backend/main.py`
```python
TIER_LIMITS = {
    "free": {"max_concurrent": 1},    # Defined but never checked!
    "pro": {"max_concurrent": 3},     # Defined but never checked!
}
```

### 15. **No Logging or Monitoring**
**Location**: All backend files
```
❌ No structured logging
❌ No health check endpoint
❌ No metrics collection
❌ Can't debug production issues
```

---

## 📋 Quick Fix Checklist

### Priority 1 (Today):
- [ ] Add `user: User = Depends(get_current_user)` to all endpoints
- [ ] Filter `storage.list_projects()` by `user_id`
- [ ] Create `ProjectRecord` in DB when project created
- [ ] Wire usage tracking into generation endpoint
- [ ] Add JWT header injection in frontend api/client.ts
- [ ] Add `await db.commit()` in auth/routes.py

### Priority 2 (This Week):
- [ ] Set up Alembic migrations
- [ ] Fix revision filename parsing
- [ ] Fix status enum consistency
- [ ] Fix reviseScene API parameter mismatch
- [ ] Add error retry logic to LLM client
- [ ] Implement token counting in llm_client.generate()

### Priority 3 (This Week/Next):
- [ ] Clean up memory leaks (locks, _running dict)
- [ ] Add health check endpoint
- [ ] Add structured logging
- [ ] Implement concurrent generation limiting
- [ ] Add comprehensive tests (integration, auth, storage)
- [ ] Write deployment guide

---

## Files Requiring Changes (by Priority)

| File | Priority | Changes |
|------|----------|---------|
| `backend/main.py` | P0 | Add auth to ALL endpoints, wire usage tracking, fix ProjectRecord creation |
| `frontend/src/api/client.ts` | P0 | Add JWT header, fix reviseScene signature |
| `backend/auth/routes.py` | P0 | Add `await db.commit()` in register |
| `backend/services/storage.py` | P1 | Fix revision parsing, add lock cleanup |
| `backend/services/llm.py` | P1 | Add token counting, retry logic |
| `backend/db/session.py` | P1 | Set up Alembic |
| `frontend/src/types/index.ts` | P1 | Fix status enum |
| `backend/services/usage.py` | P2 | Add concurrent limiting |

---

## Testing Strategy

Current state: **3 unit tests, 0 integration tests**

Required before production:
1. **Auth tests** - Verify 401 on missing token, 403 on invalid user_id
2. **Multi-tenant tests** - User A can't access User B's projects
3. **Usage tracking tests** - Verify generation count increments
4. **API mismatch tests** - Frontend/backend contract verification
5. **Alembic tests** - Migration up/down works

```bash
pytest backend/tests/ -v --cov
```

---

## Deployment Readiness

| Component | Status | Notes |
|-----------|--------|-------|
| Auth | 🟠 Partial | Backend ready, frontend missing tokens |
| Multi-tenancy | 🔴 Broken | No user_id filtering |
| Usage tracking | 🔴 Broken | Dead code, never called |
| Database | 🟠 Partial | Schema ready, never written |
| Migrations | 🔴 Missing | No Alembic setup |
| Error handling | 🟠 Basic | No retry logic, poor error messages |
| Logging | 🔴 None | No observability |
| Tests | 🟡 Sparse | 3 tests only |

**Summary**: **NOT production-ready**. Estimated 2-3 weeks to fix blocking issues.

