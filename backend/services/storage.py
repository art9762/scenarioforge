import json
import os
import aiofiles
from typing import Optional
from backend.config import settings
from backend.models.project import Project


class StorageService:
    """File-based storage for projects."""

    def __init__(self):
        self._base_dir = settings.storage_dir
        os.makedirs(self._base_dir, exist_ok=True)

    def _project_path(self, project_id: str) -> str:
        return os.path.join(self._base_dir, f"{project_id}.json")

    async def save_project(self, project: Project) -> None:
        path = self._project_path(project.id)
        async with aiofiles.open(path, "w") as f:
            await f.write(project.model_dump_json(indent=2))

    async def get_project(self, project_id: str) -> Optional[Project]:
        path = self._project_path(project_id)
        if not os.path.exists(path):
            return None
        async with aiofiles.open(path, "r") as f:
            data = await f.read()
        return Project.model_validate_json(data)

    async def list_projects(self) -> list[Project]:
        projects = []
        if not os.path.exists(self._base_dir):
            return projects
        for fname in os.listdir(self._base_dir):
            if fname.endswith(".json"):
                path = os.path.join(self._base_dir, fname)
                async with aiofiles.open(path, "r") as f:
                    data = await f.read()
                projects.append(Project.model_validate_json(data))
        projects.sort(key=lambda p: p.created_at, reverse=True)
        return projects

    async def delete_project(self, project_id: str) -> bool:
        path = self._project_path(project_id)
        if os.path.exists(path):
            os.remove(path)
            return True
        return False


storage = StorageService()
