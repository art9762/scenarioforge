import asyncio
import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import AsyncGenerator, Optional
from sqlalchemy.ext.asyncio import AsyncSession

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
from backend.auth.deps import get_current_user, get_current_user_optional
from backend.db.models import User as DBUser
from backend.db.session import init_db, get_db
from backend.auth.routes import router as auth_router
from backend.admin.routes import router as admin_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables
    await init_db()
    # Create default admin if no users exist
    await _ensure_admin()
    # Auto-migrate legacy projects on startup
    migrated = await storage.migrate_all_legacy()
    if migrated:
        print(f"Migrated {migrated} legacy projects to v2 storage format")
    yield
    await llm_client.close()


async def _ensure_admin():
    """Create default admin user on first startup if no users exist."""
    from sqlalchemy import select, func
    from backend.auth.passwords import hash_password
    from backend.db.models import User

    async for db in get_db():
        count = (await db.execute(select(func.count(User.id)))).scalar()
        if count == 0:
            admin = User(
                email=settings.admin_email,
                hashed_password=hash_password(settings.admin_password),
                display_name="Admin",
                is_admin=True,
                credits=999999,
            )
            db.add(admin)
            await db.commit()
            print(f"Created default admin user: {settings.admin_email}")
        break


app = FastAPI(title="ScenarioForge", version="2.1.0", lifespan=lifespan)

app.include_router(auth_router)
app.include_router(admin_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Projects ---

@app.post("/api/projects", response_model=Project)
async def create_project(data: ProjectCreate):
    project = Project(idea=data.idea, type=data.type, equipment=data.equipment)
    await storage.save_project(project)
    return project


@app.get("/api/projects", response_model=list[Project])
async def list_projects():
    return await storage.list_projects()


@app.get("/api/projects/{project_id}", response_model=Project)
async def get_project(project_id: str):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    deleted = await storage.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "deleted"}


# --- Pipeline ---

@app.post("/api/projects/{project_id}/brief")
async def start_briefing(project_id: str):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.briefing_questions:
        return {"questions": project.briefing_questions}
    project.status = ProjectStatus.briefing
    await storage.save_project(project)
    questions = await orchestrator.generate_briefing(project)
    project.briefing_questions = questions
    project.status = ProjectStatus.questions_ready
    await storage.save_project(project)
    return {"questions": questions}


@app.post("/api/projects/{project_id}/brief/answers")
async def submit_brief_answers(project_id: str, data: BriefAnswers):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.briefing_answers = data.answers
    project.status = ProjectStatus.answers_submitted
    await storage.save_project(project)
    return {"status": "answers_submitted"}


@app.post("/api/projects/{project_id}/generate")
async def start_generation(project_id: str, data: GenerateRequest, background_tasks: BackgroundTasks,
                           user: DBUser = Depends(get_current_user_optional),
                           db: AsyncSession = Depends(get_db)):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status == ProjectStatus.generating:
        raise HTTPException(status_code=409, detail="Generation already in progress")

    # Credit check (if auth enabled and user exists)
    if user is not None:
        if user.credits <= 0:
            raise HTTPException(status_code=403, detail="Insufficient credits")
        user.credits -= 1
        await db.commit()

    project.depth_mode = data.depth_mode
    project.model_overrides = data.model_overrides
    project.status = ProjectStatus.generating
    project.progress = 0.0
    await storage.save_project(project)
    user_id = user.id if user else None
    background_tasks.add_task(_run_pipeline, project, user_id)
    return {"status": "generating"}


async def _run_pipeline(project: Project, user_id: str | None = None):
    try:
        scenario, input_tokens, output_tokens = await orchestrator.run_pipeline(project)
        # Record token usage
        if user_id:
            from backend.services.usage import record_tokens
            async for db in get_db():
                await record_tokens(db, user_id, input_tokens, output_tokens)
                await db.commit()
                break
    except Exception as e:
        project.status = ProjectStatus.error
        project.scenario = f"Error: {str(e)}"
        await storage.save_project(project)


@app.get("/api/projects/{project_id}/status")
async def get_status(project_id: str):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "status": project.status,
        "current_agent": project.current_agent,
        "progress": project.progress,
    }


@app.post("/api/projects/{project_id}/stop")
async def stop_generation(project_id: str):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    orchestrator.stop(project_id)
    project.status = ProjectStatus.stopped
    await storage.save_project(project)
    return {"status": "stopped"}


# --- Revisions ---

@app.post("/api/projects/{project_id}/revise")
async def revise_project(project_id: str, data: ReviseRequest):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.scenario:
        raise HTTPException(status_code=400, detail="No scenario to revise")
    result = await orchestrator.revise(project, data.agent, data.instructions, data.scene_number)
    return {"scenario": result}


@app.put("/api/projects/{project_id}/scenario")
async def update_scenario(project_id: str, data: ScenarioUpdate):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Save revision before manual edit
    if project.scenario:
        await storage.save_revision(project.id, project.scenario, source="before-manual-edit")
    project.scenario = data.scenario
    await storage.save_project(project)
    await storage.save_revision(project.id, data.scenario, source="manual-edit")
    return {"status": "updated"}


# --- Agent results ---

@app.get("/api/projects/{project_id}/agents")
async def list_agent_results(project_id: str):
    """List all agent intermediate results for a project."""
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    results = await storage.list_agent_results(project_id)
    return {"results": results}


@app.get("/api/projects/{project_id}/agents/{agent_name}")
async def get_agent_result(project_id: str, agent_name: str):
    """Get a specific agent's last result."""
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    result = await storage.get_agent_result(project_id, agent_name)
    if not result:
        raise HTTPException(status_code=404, detail="Agent result not found")
    return result


# --- Revision history ---

@app.get("/api/projects/{project_id}/revisions")
async def list_revisions(project_id: str):
    """List all scenario revisions."""
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    revisions = await storage.list_revisions(project_id)
    return {"revisions": revisions}


@app.get("/api/projects/{project_id}/revisions/{filename}")
async def get_revision(project_id: str, filename: str):
    """Get a specific revision."""
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    content = await storage.get_revision(project_id, filename)
    if content is None:
        raise HTTPException(status_code=404, detail="Revision not found")
    return {"filename": filename, "content": content}


# --- Agent Chat ---

class ChatMessage(BaseModel):
    message: str
    context_fragment: Optional[str] = None


@app.post("/api/projects/{project_id}/chat/{agent_name}")
async def chat_with_agent(project_id: str, agent_name: str, data: ChatMessage):
    """Send a message to a specific agent in context of the project."""
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if agent_name not in AGENTS:
        raise HTTPException(status_code=400, detail=f"Unknown agent: {agent_name}")

    agent = AGENTS[agent_name]
    model = project.model_overrides.get(agent_name) or DEPTH_MODES[project.depth_mode]["default_models"].get(agent_name, "claude-sonnet-4-6")

    # Load chat history
    history = await storage.get_chat_history(project_id, agent_name)

    # Build context with scenario
    scenario_ctx = ""
    if project.scenario:
        scenario_ctx = f"\n\n## Текущий сценарий:\n\n{project.scenario}"
    if data.context_fragment:
        scenario_ctx += f"\n\n## Выделенный фрагмент:\n\n{data.context_fragment}"

    # Build messages for LLM
    system_prompt = agent.system_prompt + scenario_ctx
    messages = []
    for msg in history[-20:]:  # Last 20 messages for context window
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": data.message})

    # Call agent
    response = await llm_client.generate(
        model=model,
        system_prompt=system_prompt,
        messages=messages,
        max_tokens=4096,
    )

    # Save to history
    history.append({"role": "user", "content": data.message, "timestamp": datetime.now(timezone.utc).isoformat()})
    history.append({"role": "assistant", "content": response, "timestamp": datetime.now(timezone.utc).isoformat()})
    await storage.save_chat_history(project_id, agent_name, history)

    return {"response": response, "agent": agent_name}


@app.get("/api/projects/{project_id}/chat/{agent_name}")
async def get_chat_history(project_id: str, agent_name: str):
    """Get chat history with a specific agent."""
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    history = await storage.get_chat_history(project_id, agent_name)
    return {"messages": history, "agent": agent_name}


@app.delete("/api/projects/{project_id}/chat/{agent_name}")
async def clear_chat_history(project_id: str, agent_name: str):
    """Clear chat history with a specific agent."""
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await storage.save_chat_history(project_id, agent_name, [])
    return {"status": "cleared"}


# --- Ask about fragment ---

class AskRequest(BaseModel):
    question: str
    fragment: str
    agent: str = "director"


@app.post("/api/projects/{project_id}/ask")
async def ask_about_fragment(project_id: str, data: AskRequest):
    """Ask a question about a specific scenario fragment."""
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if data.agent not in AGENTS:
        raise HTTPException(status_code=400, detail=f"Unknown agent: {data.agent}")

    agent = AGENTS[data.agent]
    model = project.model_overrides.get(data.agent) or DEPTH_MODES[project.depth_mode]["default_models"].get(data.agent, "claude-sonnet-4-6")

    context = f"""## Полный сценарий:\n\n{project.scenario}\n\n## Выделенный фрагмент:\n\n{data.fragment}\n\n## Вопрос:\n\n{data.question}"""

    response = await agent.run(context, model=model)
    return {"response": response, "agent": data.agent}


# --- Export ---

@app.get("/api/projects/{project_id}/export/md")
async def export_md(project_id: str):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.scenario:
        raise HTTPException(status_code=400, detail="No scenario to export")
    content = export_service.export_md(project.scenario)
    return Response(
        content=content,
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename=scenario_{project_id}.md"},
    )


@app.get("/api/projects/{project_id}/export/pdf")
async def export_pdf(project_id: str):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.scenario:
        raise HTTPException(status_code=400, detail="No scenario to export")
    pdf_bytes = export_service.export_pdf(project.scenario)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=scenario_{project_id}.pdf"},
    )


# --- SSE for real-time updates ---

@app.get("/api/projects/{project_id}/stream")
async def stream_status(project_id: str):
    """SSE endpoint for real-time pipeline status updates with agent drafts."""
    async def event_generator() -> AsyncGenerator[str, None]:
        prev_status = None
        prev_agent = None
        prev_progress = None
        while True:
            project = await storage.get_project(project_id)
            if not project:
                yield f"data: {json.dumps({'error': 'not_found'})}\n\n"
                break

            status_data = {
                "status": project.status.value,
                "current_agent": project.current_agent,
                "progress": project.progress,
            }

            # Include agent results summary
            agent_results = await storage.list_agent_results(project_id)
            status_data["completed_agents"] = [r["agent"] for r in agent_results]

            # Include current draft if available
            if agent_results:
                latest = agent_results[-1]
                # Send a truncated preview of the latest draft
                draft_preview = latest.get("result", "")[:500]
                status_data["draft_preview"] = draft_preview

            changed = (
                project.status != prev_status
                or project.current_agent != prev_agent
                or project.progress != prev_progress
            )

            if changed:
                yield f"data: {json.dumps(status_data, ensure_ascii=False)}\n\n"
                prev_status = project.status
                prev_agent = project.current_agent
                prev_progress = project.progress

            if project.status in (ProjectStatus.completed, ProjectStatus.error, ProjectStatus.stopped):
                break
            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# --- Test Models ---

@app.post("/api/test/models")
async def test_models():
    """Send a tiny request to every configured model and report status."""
    import time

    results = []

    async def _test_one(model_info: dict):
        model_id = model_info["id"]
        t0 = time.monotonic()
        try:
            reply = await llm_client.generate(
                model=model_id,
                system_prompt="You are a test assistant.",
                messages=[{"role": "user", "content": "Say OK"}],
                max_tokens=16,
            )
            elapsed = round(time.monotonic() - t0, 2)
            results.append({
                "model": model_id,
                "name": model_info["name"],
                "provider": model_info["provider"],
                "ok": True,
                "latency": elapsed,
                "reply": reply.strip()[:100],
            })
        except Exception as e:
            elapsed = round(time.monotonic() - t0, 2)
            results.append({
                "model": model_id,
                "name": model_info["name"],
                "provider": model_info["provider"],
                "ok": False,
                "latency": elapsed,
                "error": str(e)[:200],
            })

    await asyncio.gather(*[_test_one(m) for m in AVAILABLE_MODELS])
    results.sort(key=lambda r: r["model"])
    return {"results": results}


# --- Config ---

@app.get("/api/config/models")
async def get_models():
    return AVAILABLE_MODELS


@app.get("/api/config/depth-modes")
async def get_depth_modes():
    return DEPTH_MODES


# --- Migration ---

@app.post("/api/admin/migrate")
async def migrate_legacy():
    """Manually trigger migration of legacy projects."""
    count = await storage.migrate_all_legacy()
    return {"migrated": count}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.host, port=settings.port)
