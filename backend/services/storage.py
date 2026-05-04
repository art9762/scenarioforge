"""
Storage v2 — Directory-based project storage.

Each project stored as:
  data/{uuid}/
    project.json   — metadata (everything except scenario text)
    brief.json     — briefing questions + answers
    scenario.md    — current scenario (readable markdown)
    agents/        — per-agent intermediate results
      director.json, screenwriter.json, ...
    revisions/     — timestamped scenario versions
      {timestamp}_{source}.md
    chats/         — per-agent chat history (for v2 agent chats)
      {agent}.json
"""

import asyncio
import collections
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from typing import Optional

import aiofiles

from backend.config import settings
from backend.models.project import Project


class StorageService:
    """Directory-based storage for projects with atomic writes and locking."""

    MAX_LOCKS = 1024

    def __init__(self):
        self._base_dir = settings.storage_dir
        os.makedirs(self._base_dir, exist_ok=True)
        self._locks: collections.OrderedDict[str, asyncio.Lock] = collections.OrderedDict()

    def _get_lock(self, project_id: str) -> asyncio.Lock:
        if project_id in self._locks:
            self._locks.move_to_end(project_id)
            return self._locks[project_id]
        lock = asyncio.Lock()
        self._locks[project_id] = lock
        while len(self._locks) > self.MAX_LOCKS:
            self._locks.popitem(last=False)
        return lock

    def _project_dir(self, project_id: str) -> str:
        return os.path.join(self._base_dir, project_id)

    # --- Atomic file write ---

    async def _atomic_write(self, path: str, content: str) -> None:
        """Write content to file atomically (write to tmp, then rename)."""
        dir_path = os.path.dirname(path)
        os.makedirs(dir_path, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix=".tmp")
        try:
            async with aiofiles.open(fd, mode="w", closefd=True) as f:
                await f.write(content)
            os.replace(tmp_path, path)
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    async def _atomic_write_bytes(self, path: str, content: bytes) -> None:
        dir_path = os.path.dirname(path)
        os.makedirs(dir_path, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix=".tmp")
        try:
            async with aiofiles.open(fd, mode="wb", closefd=True) as f:
                await f.write(content)
            os.replace(tmp_path, path)
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    # --- Core project operations ---

    async def save_project(self, project: Project) -> None:
        """Save project to directory structure."""
        async with self._get_lock(project.id):
            proj_dir = self._project_dir(project.id)
            os.makedirs(proj_dir, exist_ok=True)
            os.makedirs(os.path.join(proj_dir, "agents"), exist_ok=True)
            os.makedirs(os.path.join(proj_dir, "revisions"), exist_ok=True)
            os.makedirs(os.path.join(proj_dir, "chats"), exist_ok=True)

            # Save project metadata (without scenario text — that goes to scenario.md)
            meta = project.model_dump(mode="json")
            scenario_text = meta.pop("scenario", None)

            # Extract brief data
            brief_data = {
                "questions": meta.pop("briefing_questions", []),
                "answers": meta.pop("briefing_answers", []),
            }

            await self._atomic_write(
                os.path.join(proj_dir, "project.json"),
                json.dumps(meta, indent=2, ensure_ascii=False),
            )

            await self._atomic_write(
                os.path.join(proj_dir, "brief.json"),
                json.dumps(brief_data, indent=2, ensure_ascii=False),
            )

            if scenario_text is not None:
                await self._atomic_write(
                    os.path.join(proj_dir, "scenario.md"),
                    scenario_text,
                )

    async def get_project(self, project_id: str) -> Optional[Project]:
        """Load project from directory structure. Falls back to legacy flat file."""
        proj_dir = self._project_dir(project_id)
        meta_path = os.path.join(proj_dir, "project.json")

        # Try directory-based storage first
        if os.path.exists(meta_path):
            return await self._load_from_dir(proj_dir)

        # Fallback: legacy flat JSON file
        legacy_path = os.path.join(self._base_dir, f"{project_id}.json")
        if os.path.exists(legacy_path):
            project = await self._load_legacy(legacy_path)
            # Auto-migrate to new format
            if project:
                await self.save_project(project)
                try:
                    os.remove(legacy_path)
                except OSError:
                    pass
            return project

        return None

    async def _load_from_dir(self, proj_dir: str) -> Optional[Project]:
        meta_path = os.path.join(proj_dir, "project.json")
        brief_path = os.path.join(proj_dir, "brief.json")
        scenario_path = os.path.join(proj_dir, "scenario.md")

        async with aiofiles.open(meta_path, "r") as f:
            meta = json.loads(await f.read())

        # Load brief
        if os.path.exists(brief_path):
            async with aiofiles.open(brief_path, "r") as f:
                brief = json.loads(await f.read())
            meta["briefing_questions"] = brief.get("questions", [])
            meta["briefing_answers"] = brief.get("answers", [])

        # Load scenario
        if os.path.exists(scenario_path):
            async with aiofiles.open(scenario_path, "r") as f:
                meta["scenario"] = await f.read()

        return Project.model_validate(meta)

    async def _load_legacy(self, path: str) -> Optional[Project]:
        try:
            async with aiofiles.open(path, "r") as f:
                data = await f.read()
            return Project.model_validate_json(data)
        except Exception:
            return None

    async def list_projects(self) -> list[Project]:
        """List all projects (both directory-based and legacy)."""
        projects = []
        if not os.path.exists(self._base_dir):
            return projects

        seen_ids = set()

        for entry in os.listdir(self._base_dir):
            full_path = os.path.join(self._base_dir, entry)

            # Directory-based project
            if os.path.isdir(full_path) and os.path.exists(
                os.path.join(full_path, "project.json")
            ):
                project = await self._load_from_dir(full_path)
                if project:
                    projects.append(project)
                    seen_ids.add(project.id)

            # Legacy flat file
            elif entry.endswith(".json") and os.path.isfile(full_path):
                project_id = entry[:-5]  # strip .json
                if project_id not in seen_ids:
                    project = await self._load_legacy(full_path)
                    if project:
                        projects.append(project)

        projects.sort(key=lambda p: p.created_at, reverse=True)
        return projects

    async def delete_project(self, project_id: str) -> bool:
        """Delete project (directory or legacy file)."""
        proj_dir = self._project_dir(project_id)
        if os.path.isdir(proj_dir):
            shutil.rmtree(proj_dir)
            self._locks.pop(project_id, None)
            return True

        # Legacy
        legacy_path = os.path.join(self._base_dir, f"{project_id}.json")
        if os.path.exists(legacy_path):
            os.remove(legacy_path)
            return True

        return False

    # --- Agent results ---

    async def save_agent_result(
        self,
        project_id: str,
        agent_name: str,
        result: str,
        model: str,
        tokens: Optional[dict] = None,
    ) -> None:
        """Save an agent's intermediate result."""
        proj_dir = self._project_dir(project_id)
        agents_dir = os.path.join(proj_dir, "agents")
        os.makedirs(agents_dir, exist_ok=True)

        data = {
            "agent": agent_name,
            "model": model,
            "result": result,
            "tokens": tokens,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self._atomic_write(
            os.path.join(agents_dir, f"{agent_name}.json"),
            json.dumps(data, indent=2, ensure_ascii=False),
        )

    async def get_agent_result(
        self, project_id: str, agent_name: str
    ) -> Optional[dict]:
        """Get an agent's last result."""
        path = os.path.join(
            self._project_dir(project_id), "agents", f"{agent_name}.json"
        )
        if not os.path.exists(path):
            return None
        async with aiofiles.open(path, "r") as f:
            return json.loads(await f.read())

    async def list_agent_results(self, project_id: str) -> list[dict]:
        """List all agent results for a project."""
        agents_dir = os.path.join(self._project_dir(project_id), "agents")
        if not os.path.isdir(agents_dir):
            return []
        results = []
        for fname in sorted(os.listdir(agents_dir)):
            if fname.endswith(".json"):
                async with aiofiles.open(os.path.join(agents_dir, fname), "r") as f:
                    results.append(json.loads(await f.read()))
        return results

    # --- Revision history ---

    async def save_revision(
        self, project_id: str, scenario: str, source: str = "manual"
    ) -> str:
        """Save a scenario revision. Returns the revision filename."""
        rev_dir = os.path.join(self._project_dir(project_id), "revisions")
        os.makedirs(rev_dir, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"{ts}--{source}.md"
        await self._atomic_write(os.path.join(rev_dir, filename), scenario)
        return filename

    async def list_revisions(self, project_id: str) -> list[dict]:
        """List all revisions for a project."""
        rev_dir = os.path.join(self._project_dir(project_id), "revisions")
        if not os.path.isdir(rev_dir):
            return []
        revisions = []
        for fname in sorted(os.listdir(rev_dir), reverse=True):
            if fname.endswith(".md"):
                name = fname[:-3]
                # New format: {date}_{time}--{source}.md
                if "--" in name:
                    ts_part, source = name.split("--", 1)
                    ts_parts = ts_part.split("_", 1)
                    date = ts_parts[0] if len(ts_parts) >= 1 else ""
                    time = ts_parts[1] if len(ts_parts) >= 2 else ""
                else:
                    # Legacy format: {date}_{time}_{source}.md
                    parts = name.split("_", 2)
                    date = parts[0] if len(parts) >= 1 else ""
                    time = parts[1] if len(parts) >= 2 else ""
                    source = parts[2] if len(parts) >= 3 else "unknown"
                revisions.append({
                    "filename": fname,
                    "date": date,
                    "time": time,
                    "source": source,
                })
        return revisions

    async def get_revision(self, project_id: str, filename: str) -> Optional[str]:
        """Get a specific revision content."""
        # Sanitize filename to prevent path traversal
        if "/" in filename or "\\" in filename or ".." in filename:
            return None
        path = os.path.join(self._project_dir(project_id), "revisions", filename)
        if not os.path.exists(path):
            return None
        async with aiofiles.open(path, "r") as f:
            return await f.read()

    # --- Chat history ---

    async def save_chat_history(
        self, project_id: str, agent_name: str, messages: list[dict]
    ) -> None:
        """Save chat history for an agent."""
        chats_dir = os.path.join(self._project_dir(project_id), "chats")
        os.makedirs(chats_dir, exist_ok=True)
        await self._atomic_write(
            os.path.join(chats_dir, f"{agent_name}.json"),
            json.dumps(messages, indent=2, ensure_ascii=False),
        )

    async def get_chat_history(
        self, project_id: str, agent_name: str
    ) -> list[dict]:
        """Get chat history for an agent."""
        path = os.path.join(
            self._project_dir(project_id), "chats", f"{agent_name}.json"
        )
        if not os.path.exists(path):
            return []
        async with aiofiles.open(path, "r") as f:
            return json.loads(await f.read())

    # --- Migration ---

    async def migrate_all_legacy(self) -> int:
        """Migrate all legacy flat-file projects to directory format. Returns count."""
        if not os.path.exists(self._base_dir):
            return 0
        count = 0
        for fname in os.listdir(self._base_dir):
            if fname.endswith(".json") and os.path.isfile(
                os.path.join(self._base_dir, fname)
            ):
                legacy_path = os.path.join(self._base_dir, fname)
                project = await self._load_legacy(legacy_path)
                if project:
                    await self.save_project(project)
                    os.remove(legacy_path)
                    count += 1
        return count


storage = StorageService()
