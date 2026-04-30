import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from typing import AsyncGenerator

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
from backend.pipeline.orchestrator import orchestrator


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await llm_client.close()


app = FastAPI(title="ScenarioForge", version="1.0.0", lifespan=lifespan)

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
async def start_generation(project_id: str, data: GenerateRequest, background_tasks: BackgroundTasks):
    project = await storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.depth_mode = data.depth_mode
    project.model_overrides = data.model_overrides
    project.status = ProjectStatus.generating
    project.progress = 0.0
    await storage.save_project(project)
    background_tasks.add_task(_run_pipeline, project)
    return {"status": "generating"}


async def _run_pipeline(project: Project):
    try:
        await orchestrator.run_pipeline(project)
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
    project.scenario = data.scenario
    await storage.save_project(project)
    return {"status": "updated"}


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
    """SSE endpoint for real-time pipeline status updates."""
    async def event_generator() -> AsyncGenerator[str, None]:
        prev_status = None
        prev_agent = None
        while True:
            project = await storage.get_project(project_id)
            if not project:
                yield f"data: {{\"error\": \"not_found\"}}\n\n"
                break
            status_data = {
                "status": project.status.value,
                "current_agent": project.current_agent,
                "progress": project.progress,
            }
            if project.status != prev_status or project.current_agent != prev_agent:
                import json
                yield f"data: {json.dumps(status_data)}\n\n"
                prev_status = project.status
                prev_agent = project.current_agent
            if project.status in (ProjectStatus.completed, ProjectStatus.error, ProjectStatus.stopped):
                break
            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# --- Config ---

@app.get("/api/config/models")
async def get_models():
    return AVAILABLE_MODELS


@app.get("/api/config/depth-modes")
async def get_depth_modes():
    return DEPTH_MODES


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.host, port=settings.port)
