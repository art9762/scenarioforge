# ScenarioForge — Technical Specification

## Overview
Multi-agent AI pipeline for generating professional screenplays/scenarios for YouTube videos, short films, and miniatures (mini cinematic sketches).

## Architecture

### Stack
- **Backend:** Python 3.11+, FastAPI, async
- **Frontend:** React + Vite, dark minimalist UI
- **PDF Export:** WeasyPrint
- **AI Proxy:** Trinity (gate.trinity.tg) — Anthropic-compatible (Aurora) and OpenAI-compatible (Orion) endpoints
- **Storage:** File-based (markdown files in workspace directories)

### Agent Roles
Each agent is an LLM call with a specific system prompt and role:

1. **Director (Режиссёр)** — Orchestrator. Analyzes the idea, creates a brief, generates clarifying questions for the user. Controls the pipeline flow.
2. **Screenwriter (Сценарист)** — Writes story structure, scene breakdowns, character arcs, dialogue drafts.
3. **Visual Director (Визуал-директор)** — Describes shots, camera angles, lighting setups, maps equipment to scenes.
4. **Copywriter (Копирайтер)** — Polishes dialogue, makes it natural and punchy.
5. **Editor (Редактор)** — Final review: logic check, continuity, timing, formatting.

### Pipeline Flow
1. User submits idea + selects type (YouTube / Short Film / Miniature)
2. User fills equipment profile (camera, lenses, lighting, audio, locations)
3. **Briefing Phase:** Director analyzes idea → generates clarifying questions → user answers
4. **Generation Phase:** Sequential agent pipeline with configurable depth
5. **Output:** Formatted scenario (MD + PDF)
6. **Revision:** User can edit manually, send specific scenes back to specific agents, or regenerate

### Depth Modes
| Mode | Iterations | Models | Use Case |
|------|-----------|--------|----------|
| ⚡ Fast | 1 pass (Director → Screenwriter → output) | Haiku / GPT-fast | Quick drafts |
| 🎯 Standard | 2-3 passes (all agents, 1 review cycle) | Sonnet / GPT | Normal work |
| 🏆 Deep | Full cycle (all agents, cross-review, multiple iterations) | Opus | Premium quality |

### Model Configuration
Users can override which model each agent uses. Defaults per depth mode:

**Fast:**
- All agents: `claude-haiku-4-5` or `gpt-5.2`

**Standard:**
- Director: `claude-sonnet-4-6`
- Screenwriter: `claude-sonnet-4-6`
- Visual Director: `claude-sonnet-4-6`
- Copywriter: `claude-sonnet-4-6`
- Editor: `claude-sonnet-4-6`

**Deep:**
- Director: `claude-opus-4-6`
- Screenwriter: `claude-opus-4-6`
- Visual Director: `claude-sonnet-4-6`
- Copywriter: `claude-opus-4-6`
- Editor: `claude-opus-4-6`

### Scenario Output Format
```
# [Title]
**Type:** YouTube / Short Film / Miniature
**Genre:** ...
**Duration:** estimated runtime
**Date:** generation date

## Equipment & Technical Requirements
- Camera: ...
- Lenses: ...
- Lighting: ...
- Audio: ...
- Special: ...

## Characters
| Character | Description | Notes |
|-----------|-------------|-------|

## Scene Breakdown

### Scene 1 — [Title]
**Location:** ...
**Time of Day:** ...
**Duration:** MM:SS - MM:SS
**Equipment Setup:** camera, lens, lighting notes

**Shot List:**
1. [Shot type] — [Description]

**Dialogue:**
> CHARACTER: Line

**Director Notes:** ...
**Audio/SFX:** ...

---
(repeat for each scene)

## Production Notes
- ...
```

### API Endpoints

#### Projects
- `POST /api/projects` — Create new project (idea + type + equipment)
- `GET /api/projects` — List projects
- `GET /api/projects/{id}` — Get project with current scenario
- `DELETE /api/projects/{id}` — Delete project

#### Pipeline
- `POST /api/projects/{id}/brief` — Start briefing (returns questions)
- `POST /api/projects/{id}/brief/answers` — Submit answers to briefing questions
- `POST /api/projects/{id}/generate` — Start generation with selected depth mode
- `GET /api/projects/{id}/status` — Get pipeline status (which agent is working, progress)
- `POST /api/projects/{id}/stop` — Stop generation

#### Revisions
- `POST /api/projects/{id}/revise` — Send revision request (specific scene + agent)
- `PUT /api/projects/{id}/scenario` — Manual edit of scenario

#### Export
- `GET /api/projects/{id}/export/md` — Download as Markdown
- `GET /api/projects/{id}/export/pdf` — Download as PDF

#### Config
- `GET /api/config/models` — Available models
- `GET /api/config/depth-modes` — Depth mode configs

### File Structure
```
scenarioforge/
├── backend/
│   ├── main.py                 # FastAPI app
│   ├── config.py               # Settings, model configs
│   ├── agents/
│   │   ├── base.py             # Base agent class
│   │   ├── director.py
│   │   ├── screenwriter.py
│   │   ├── visual_director.py
│   │   ├── copywriter.py
│   │   └── editor.py
│   ├── pipeline/
│   │   ├── orchestrator.py     # Pipeline orchestration
│   │   └── depth_modes.py      # Mode configurations
│   ├── models/
│   │   ├── project.py          # Project data models
│   │   └── scenario.py         # Scenario data models
│   ├── services/
│   │   ├── llm.py              # LLM client (Trinity proxy)
│   │   ├── storage.py          # File-based storage
│   │   └── export.py           # MD/PDF export
│   ├── tests/
│   │   ├── test_agents.py
│   │   ├── test_pipeline.py
│   │   ├── test_api.py
│   │   └── test_export.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── pages/
│   │   └── api/
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   └── SPEC.md
├── .gitignore
├── .env.example
└── README.md
```

### Environment Variables
```
TRINITY_API_KEY=<key>
TRINITY_AURORA_URL=https://gate.trinity.tg/aurora/v1
TRINITY_ORION_URL=https://gate.trinity.tg/orion/v1
STORAGE_DIR=./data
HOST=0.0.0.0
PORT=8000
```

### No Auth (Phase 1)
Single user, no authentication. Will be added later.
