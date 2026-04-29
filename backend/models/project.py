from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum
import uuid


class ProjectType(str, Enum):
    youtube = "youtube"
    short_film = "short_film"
    miniature = "miniature"


class Equipment(BaseModel):
    camera: str = ""
    lenses: str = ""
    lighting: str = ""
    audio: str = ""
    locations: str = ""
    special: str = ""


class ProjectStatus(str, Enum):
    created = "created"
    briefing = "briefing"
    questions_ready = "questions_ready"
    answers_submitted = "answers_submitted"
    generating = "generating"
    completed = "completed"
    error = "error"
    stopped = "stopped"


class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    idea: str
    type: ProjectType
    equipment: Equipment = Field(default_factory=Equipment)
    status: ProjectStatus = ProjectStatus.created
    depth_mode: str = "standard"
    model_overrides: dict[str, str] = Field(default_factory=dict)
    briefing_questions: list[str] = Field(default_factory=list)
    briefing_answers: list[str] = Field(default_factory=list)
    scenario: Optional[str] = None
    current_agent: Optional[str] = None
    progress: float = 0.0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProjectCreate(BaseModel):
    idea: str
    type: ProjectType
    equipment: Equipment = Field(default_factory=Equipment)


class GenerateRequest(BaseModel):
    depth_mode: str = "standard"
    model_overrides: dict[str, str] = Field(default_factory=dict)


class ReviseRequest(BaseModel):
    scene_number: Optional[int] = None
    agent: str = "editor"
    instructions: str = ""


class BriefAnswers(BaseModel):
    answers: list[str]


class ScenarioUpdate(BaseModel):
    scenario: str
