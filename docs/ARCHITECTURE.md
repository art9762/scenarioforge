# Architecture

## Agent System

### Base Agent

All agents inherit from `BaseAgent` (backend/agents/base.py) which provides:
- LLM client initialization via Trinity proxy
- System prompt injection
- Structured output parsing
- Token tracking and cost estimation

### Agent Roles & Prompts

#### 1. Director (director.py)

**System prompt structure:**
```
You are a professional film director and project manager.
Your role: analyze the creative idea, identify gaps, generate
clarifying questions, and produce a production brief.

Context: {project_type}, {equipment_profile}
Input: {user_idea}
Output: structured brief + clarifying questions
```

**Responsibilities:**
- Idea analysis and feasibility assessment
- Brief generation with creative direction
- Clarifying question generation
- Pipeline flow control

#### 2. Screenwriter (screenwriter.py)

**System prompt structure:**
```
You are a professional screenwriter specializing in {project_type}.
Create scene breakdowns with character arcs and dialogue.

Context: {brief}, {equipment_constraints}, {user_answers}
Input: Director's brief
Output: Scene breakdown with dialogue drafts
```

#### 3. Visual Director (visual_director.py)

**System prompt structure:**
```
You are a visual director / cinematographer.
Design shot lists, camera setups, and lighting for each scene.

Context: {scene_breakdown}, {equipment_profile}
Input: Screenwriter's scene breakdown
Output: Shot lists with technical specifications
```

#### 4. Copywriter (copywriter.py)

**System prompt structure:**
```
You are a dialogue specialist.
Polish all dialogue to be natural, punchy, and character-appropriate.

Context: {character_profiles}, {scene_context}
Input: Current dialogue drafts
Output: Polished dialogue
```

#### 5. Editor (editor.py)

**System prompt structure:**
```
You are a senior script editor.
Review for: logic holes, continuity errors, timing issues, format compliance.

Context: {full_scenario}, {project_type_rules}
Input: Complete scenario draft
Output: Annotated corrections + final version
```

---

## Pipeline Flow

### Briefing Phase

```
User submits idea
        │
        ▼
┌─────────────┐
│  Director   │──→ Generates clarifying questions
└─────────────┘
        │
        ▼
User answers questions
        │
        ▼
┌─────────────┐
│  Director   │──→ Produces final brief
└─────────────┘
```

### Generation Phase

```
┌──────────────────────────────────────────────────────────┐
│                    FAST MODE (1 pass)                     │
├──────────────────────────────────────────────────────────┤
│  Director brief → Screenwriter → Output                  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                 STANDARD MODE (2-3 passes)                │
├──────────────────────────────────────────────────────────┤
│  Director → Screenwriter → Visual Director →             │
│  Copywriter → Editor → (1 revision cycle) → Output      │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                   DEEP MODE (full cycle)                  │
├──────────────────────────────────────────────────────────┤
│  Director → Screenwriter → Visual Director →             │
│  Copywriter → Editor →                                   │
│  Cross-review (agents review each other) →               │
│  Multiple iteration cycles → Output                      │
└──────────────────────────────────────────────────────────┘
```

### Revision Phase

```
User selects scene + target agent
        │
        ▼
┌────────────────┐
│ Target Agent   │──→ Revises specific section
└────────────────┘
        │
        ▼
┌────────────────┐
│    Editor      │──→ Validates revision
└────────────────┘
        │
        ▼
Updated scenario
```

---

## API Reference

### Projects

#### `POST /api/projects`
Create a new project.

**Request body:**
```json
{
  "idea": "A thriller short about a locked room mystery",
  "type": "short_film",
  "equipment": {
    "camera": "Sony A7IV",
    "lenses": ["24-70mm f/2.8", "85mm f/1.4"],
    "lighting": ["2x Aputure 300d", "RGB panels"],
    "audio": ["Rode NTG5", "wireless lavs"],
    "locations": ["apartment interior", "hallway"]
  }
}
```

**Response:** `201` with project object including generated `id`.

#### `GET /api/projects`
List all projects. Returns array of project summaries.

#### `GET /api/projects/{id}`
Get full project including current scenario state.

#### `DELETE /api/projects/{id}`
Delete project and all associated files.

### Pipeline

#### `POST /api/projects/{id}/brief`
Starts the briefing phase. Director agent analyzes the idea and returns clarifying questions.

**Response:**
```json
{
  "questions": [
    "What tone are you going for — psychological tension or action-thriller?",
    "How many characters do you envision?",
    "Any specific time period?"
  ]
}
```

#### `POST /api/projects/{id}/brief/answers`
Submit answers to briefing questions.

**Request body:**
```json
{
  "answers": ["Psychological tension", "3 characters", "Modern day"]
}
```

#### `POST /api/projects/{id}/generate`
Start scenario generation.

**Request body:**
```json
{
  "depth_mode": "standard",
  "model_overrides": {
    "director": "claude-opus-4-6",
    "screenwriter": "claude-sonnet-4-6"
  }
}
```

#### `GET /api/projects/{id}/status`
Returns current pipeline status.

**Response:**
```json
{
  "status": "generating",
  "current_agent": "visual_director",
  "progress": 0.6,
  "agents_completed": ["director", "screenwriter"],
  "agents_pending": ["copywriter", "editor"]
}
```

#### `POST /api/projects/{id}/stop`
Stop an in-progress generation.

### Revisions

#### `POST /api/projects/{id}/revise`
Request a revision of a specific scene by a specific agent.

**Request body:**
```json
{
  "scene_id": 3,
  "agent": "copywriter",
  "instructions": "Make the dialogue more confrontational"
}
```

#### `PUT /api/projects/{id}/scenario`
Manual edit — overwrites scenario content directly.

### Export

#### `GET /api/projects/{id}/export/md`
Download scenario as Markdown file.

#### `GET /api/projects/{id}/export/pdf`
Download scenario as formatted PDF (via WeasyPrint).

### Configuration

#### `GET /api/config/models`
Returns available models list.

#### `GET /api/config/depth-modes`
Returns depth mode configurations with default model assignments.

---

## Configuration Reference

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TRINITY_API_KEY` | API key for Trinity proxy | (required) |
| `TRINITY_AURORA_URL` | Anthropic-compatible endpoint | `https://gate.trinity.tg/aurora/v1` |
| `TRINITY_ORION_URL` | OpenAI-compatible endpoint | `https://gate.trinity.tg/orion/v1` |
| `STORAGE_DIR` | Directory for project files | `./data` |
| `HOST` | Server bind address | `0.0.0.0` |
| `PORT` | Server port | `8000` |

### Model Configuration (per depth mode)

**Fast mode:** `claude-haiku-4-5` or `gpt-5.2` for all agents

**Standard mode:** `claude-sonnet-4-6` for all agents

**Deep mode:**
- Director, Screenwriter, Copywriter, Editor: `claude-opus-4-6`
- Visual Director: `claude-sonnet-4-6`

Models can be overridden per-request via the `model_overrides` parameter in the generate endpoint.

### Storage

Projects are stored as directories under `STORAGE_DIR`:
```
data/
├── {project-id}/
│   ├── project.json      # Project metadata
│   ├── brief.json        # Director's brief
│   ├── scenario.md       # Current scenario
│   └── revisions/        # Revision history
```
