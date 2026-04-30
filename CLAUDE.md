# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ScenarioForge is a multi-agent AI pipeline for generating professional screenplays. It orchestrates 5 specialized AI agents (Director → Screenwriter → Visual Director → Copywriter → Editor) to transform a raw idea into a production-ready scenario with shot lists, dialogue, and equipment setups.

## Commands

### Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev          # dev server at localhost:5173
npm run build        # tsc -b && vite build
npm run lint         # eslint
```

### Tests
```bash
cd backend
pytest                           # all tests
pytest tests/test_agents.py      # single test file
pytest tests/test_api.py -k "test_name"  # single test
```

Tests use `pytest-asyncio` (strict mode, configured in `backend/pytest.ini`). The `conftest.py` adds the project root to `sys.path`.

## Architecture

### Agent System
All 5 agents inherit from `BaseAgent` (`backend/agents/base.py`) which provides LLM client init, system prompt injection, structured output parsing, and token tracking. Each agent file (`director.py`, `screenwriter.py`, `visual_director.py`, `copywriter.py`, `editor.py`) defines a role-specific system prompt and processing logic.

### Pipeline
`backend/pipeline/orchestrator.py` runs agents sequentially. `depth_modes.py` configures three modes (fast/standard/deep) that control which agents run and how many iteration passes occur. Fast mode skips Visual Director, Copywriter, and Editor.

### LLM Integration
`backend/services/llm.py` wraps the Trinity proxy (gate.trinity.tg) which exposes Anthropic-compatible (Aurora) and OpenAI-compatible (Orion) endpoints. Model selection is per-agent and per-depth-mode, configurable in `backend/config.py`.

### Storage
File-based, no database. Projects stored as directories under `STORAGE_DIR` (default `./data`): `project.json`, `brief.json`, `scenario.md`, and a `revisions/` subdirectory. Managed by `backend/services/storage.py`.

### Frontend
React 19 + Vite + Tailwind CSS 4 + React Router 7. Dark minimalist UI. API client in `frontend/src/api/`.

### Export
`backend/services/export.py` handles Markdown and PDF (WeasyPrint) export.

### Test Mode
`POST /api/test/models` sends a short ping to every model in `AVAILABLE_MODELS` concurrently and returns ok/fail, latency, and reply. Frontend page at `/test` (`frontend/src/pages/TestModels.tsx`).

## Environment

Requires `.env` at project root (copy from `.env.example`). Key variable: `TRINITY_API_KEY`. The backend reads env via `pydantic-settings` in `backend/config.py`.

## Conventions

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
- Backend is async Python (FastAPI). Frontend is TypeScript.
- All Russian agent names in comments are intentional (Режиссёр, Сценарист, etc.).
- Use `datetime.now(timezone.utc)` (not deprecated `utcnow()`).
- Use pydantic `model_config = {...}` dict (not deprecated `class Config`).
