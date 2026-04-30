# ScenarioForge

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61dafb.svg)](https://react.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Multi-agent AI pipeline for generating professional screenplays** for YouTube videos, short films, and miniatures (mini cinematic sketches).

ScenarioForge orchestrates 5 specialized AI agents to transform a raw idea into a production-ready scenario with shot lists, dialogue, equipment setups, and director notes — exportable as Markdown or PDF.

---

## Architecture Overview

```
User Idea → [Director] → [Screenwriter] → [Visual Director] → [Copywriter] → [Editor] → Scenario
                ↑                                                                    |
                └────────────────── Revision Loop ←──────────────────────────────────┘
```

### The 5 Agents

| # | Agent | Role |
|---|-------|------|
| 1 | **Director** (Режиссёр) | Orchestrator — analyzes idea, creates brief, generates clarifying questions |
| 2 | **Screenwriter** (Сценарист) | Story structure, scene breakdowns, character arcs, dialogue drafts |
| 3 | **Visual Director** (Визуал-директор) | Shot descriptions, camera angles, lighting, equipment mapping |
| 4 | **Copywriter** (Копирайтер) | Dialogue polish — natural, punchy, character-appropriate |
| 5 | **Editor** (Редактор) | Final review — logic, continuity, timing, formatting |

---

## Features

- Multi-agent screenplay generation pipeline
- 3 depth modes (Fast / Standard / Deep) with configurable models
- Equipment profile integration (camera, lenses, lighting, audio)
- Briefing phase with AI-generated clarifying questions
- Scene-level revision with agent targeting
- Markdown + PDF export (WeasyPrint)
- Dark minimalist React UI
- Real-time pipeline status tracking
- File-based storage (no database required)

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Trinity API key (gate.trinity.tg)

### Installation

```bash
git clone https://github.com/art9762/scenarioforge.git
cd scenarioforge

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### Environment Setup

```bash
cp .env.example .env
# Edit .env with your values:
#   TRINITY_API_KEY=<your-key>
#   TRINITY_AURORA_URL=https://gate.trinity.tg/aurora/v1
#   TRINITY_ORION_URL=https://gate.trinity.tg/orion/v1
#   STORAGE_DIR=./data
#   HOST=0.0.0.0
#   PORT=8000
```

### Running

```bash
# Backend (from project root)
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (separate terminal)
cd frontend
npm run dev
```

The API will be available at `http://localhost:8000` and the UI at `http://localhost:5173`.

---

## API Endpoints

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects` | Create project (idea + type + equipment) |
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/{id}` | Get project with scenario |
| DELETE | `/api/projects/{id}` | Delete project |

### Pipeline
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/{id}/brief` | Start briefing phase |
| POST | `/api/projects/{id}/brief/answers` | Submit answers |
| POST | `/api/projects/{id}/generate` | Start generation |
| GET | `/api/projects/{id}/status` | Pipeline status |
| POST | `/api/projects/{id}/stop` | Stop generation |

### Revisions & Export
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/{id}/revise` | Revision request |
| PUT | `/api/projects/{id}/scenario` | Manual edit |
| GET | `/api/projects/{id}/export/md` | Export Markdown |
| GET | `/api/projects/{id}/export/pdf` | Export PDF |

---

## Depth Modes

| Mode | Passes | Models | Use Case |
|------|--------|--------|----------|
| ⚡ **Fast** | 1 pass (Director → Screenwriter → output) | Haiku / GPT-fast | Quick drafts |
| 🎯 **Standard** | 2-3 passes (all agents, 1 review) | Sonnet / GPT | Normal work |
| 🏆 **Deep** | Full cycle (cross-review, multiple iterations) | Opus | Premium quality |

---

## Project Structure

```
scenarioforge/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── config.py            # Settings & model configs
│   ├── agents/              # AI agent implementations
│   │   ├── base.py          # Base agent class
│   │   ├── director.py
│   │   ├── screenwriter.py
│   │   ├── visual_director.py
│   │   ├── copywriter.py
│   │   └── editor.py
│   ├── pipeline/
│   │   ├── orchestrator.py  # Pipeline orchestration
│   │   └── depth_modes.py   # Mode configurations
│   ├── models/
│   │   └── project.py       # Data models
│   ├── services/
│   │   ├── llm.py           # LLM client (Trinity proxy)
│   │   ├── storage.py       # File-based storage
│   │   └── export.py        # MD/PDF export
│   ├── tests/
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
│   ├── SPEC.md
│   ├── ARCHITECTURE.md
│   └── DEPLOYMENT.md
├── .env.example
└── README.md
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m "feat: add my feature"`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## License

This project is licensed under the MIT License.
