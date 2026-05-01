# Security & Test Audit — 2026-05-01

## Scope
Full project verification and baseline security audit for:
- backend Python service
- frontend React/Vite app
- dependency vulnerability posture
- static security checks

## Executed checks

### Functional and quality checks
1. `cd backend && pytest -q`
   - Result: **21 passed, 1 skipped**
2. `cd frontend && npm run -s lint`
   - Result: **passed** (no lint output)
3. `cd frontend && npm run -s build`
   - Result: **passed**

### Security checks
4. `cd frontend && npm audit --audit-level=moderate --json`
   - Result: **0 vulnerabilities** (0 low / 0 moderate / 0 high / 0 critical)
5. `cd backend && pip-audit -r requirements.txt`
   - Result: **10 known vulnerabilities in 6 packages**
6. `cd backend && bandit -q -r . -x tests`
   - Result: **exit code 1** with findings, but the command scope still scanned test files due to exclusion pattern mismatch.

## Vulnerabilities from pip-audit

| Package | Version | Advisory | Fixed in |
|---|---:|---|---:|
| python-dotenv | 1.0.1 | CVE-2026-28684 | 1.2.2 |
| weasyprint | 61.2 | CVE-2025-68616 | 68.0 |
| markdown | 3.7 | CVE-2025-69534 | 3.8.1 |
| pytest | 8.3.3 | CVE-2025-71176 | 9.0.3 |
| python-jose | 3.3.0 | PYSEC-2024-232 / PYSEC-2024-233 | 3.4.0 |
| starlette | 0.38.6 | CVE-2024-47874 / CVE-2025-54121 | 0.40.0 / 0.47.2 |

## Static scan notes (Bandit)

High-volume low-severity findings are dominated by tests (`B101 assert_used`) and test subprocess usage (`B603`).
One medium-severity signal in runtime config:
- `B104`: default bind to `0.0.0.0` in `backend/config.py`

Potential true-positive low-severity signals in runtime code:
- token-type string literals (`"access"`, `"refresh"`) flagged as hardcoded passwords (`B106/B107`) in auth paths; likely false positives but should be annotated/suppressed with rationale.

## Risk summary

- **Overall status:** functional tests are green, but dependency risk is **not acceptable for production** until upgrades are applied.
- **Primary risk driver:** vulnerable backend dependencies (`starlette`, `python-jose`, `weasyprint`, etc.).
- **Secondary risk driver:** noisy static policy (Bandit) configuration needs tuning to reduce false positives and focus on exploitable paths.

## Recommended remediation plan

### Priority 0 (immediate)
1. Upgrade vulnerable runtime dependencies:
   - `starlette` to `>=0.47.2`
   - `python-jose` to `>=3.4.0`
   - `weasyprint` to `>=68.0`
   - `markdown` to `>=3.8.1`
   - `python-dotenv` to `>=1.2.2`
2. Re-run backend tests and integration checks after upgrades.

### Priority 1 (short-term)
3. Separate dev/test packages from runtime lockset so `pytest` CVE does not affect production image posture.
4. Fix Bandit scope by excluding tests robustly (e.g., from repo root: `bandit -q -r backend -x backend/tests`).
5. Add a baseline policy file to suppress known false positives (`B106/B107` for JWT token-type literals) with justification.

### Priority 2 (hardening)
6. Avoid default `0.0.0.0` for local/dev defaults when possible; document environment-specific binding strategy.
7. Add CI security gates:
   - `pip-audit` fail on high/critical
   - `npm audit` fail on moderate+
   - `bandit` with tuned profile + baseline

## Conclusion
Project behavior is stable by test/build results, frontend dependency posture is clean, and backend requires dependency modernization plus static-check tuning before a production security sign-off can be granted.
