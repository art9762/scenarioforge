import asyncio
from typing import AsyncGenerator, Optional
from backend.agents.director import director
from backend.agents.screenwriter import screenwriter
from backend.agents.visual_director import visual_director
from backend.agents.copywriter import copywriter
from backend.agents.editor import editor
from backend.agents.base import BaseAgent
from backend.models.project import Project, ProjectStatus
from backend.config import DEPTH_MODES
from backend.services.storage import storage


AGENTS: dict[str, BaseAgent] = {
    "director": director,
    "screenwriter": screenwriter,
    "visual_director": visual_director,
    "copywriter": copywriter,
    "editor": editor,
}


class PipelineOrchestrator:
    """Orchestrates the multi-agent screenplay generation pipeline."""

    def __init__(self):
        self._running: dict[str, bool] = {}

    async def generate_briefing(self, project: Project) -> list[str]:
        """Director generates clarifying questions."""
        context = self._build_briefing_context(project)
        model = project.model_overrides.get("director") or DEPTH_MODES[project.depth_mode]["default_models"]["director"]
        response = await director.run(context, model=model)
        # Parse questions from response (numbered list)
        questions = []
        for line in response.strip().split("\n"):
            line = line.strip()
            if line and (line[0].isdigit() or line.startswith("-")):
                # Remove numbering
                q = line.lstrip("0123456789.-) ").strip()
                if q:
                    questions.append(q)
        if not questions:
            questions = [response]
        return questions

    async def run_pipeline(
        self, project: Project, on_progress: Optional[callable] = None
    ) -> str:
        """Run the full generation pipeline. Returns final scenario."""
        self._running[project.id] = True
        mode_config = DEPTH_MODES[project.depth_mode]
        agent_names = mode_config["agents"]
        iterations = mode_config["iterations"]
        default_models = mode_config["default_models"]

        context = self._build_generation_context(project)
        scenario = ""
        total_steps = len(agent_names) * iterations
        current_step = 0

        for iteration in range(iterations):
            for agent_name in agent_names:
                if not self._running.get(project.id, False):
                    return scenario or "Generation stopped."

                agent = AGENTS[agent_name]
                model = project.model_overrides.get(agent_name) or default_models[agent_name]

                # Build agent-specific context
                if iteration == 0 and agent_name == agent_names[0]:
                    agent_context = context
                else:
                    agent_context = f"{context}\n\n## Текущая версия сценария:\n\n{scenario}\n\n## Задача:\nУлучши и дополни сценарий согласно своей роли. Итерация {iteration + 1}/{iterations}."

                project.current_agent = agent_name
                current_step += 1
                project.progress = current_step / total_steps
                await storage.save_project(project)

                if on_progress:
                    await on_progress(agent_name, project.progress)

                scenario = await agent.run(agent_context, model=model)

        project.scenario = scenario
        project.status = ProjectStatus.completed
        project.current_agent = None
        project.progress = 1.0
        await storage.save_project(project)
        self._running.pop(project.id, None)
        return scenario

    async def revise(self, project: Project, agent_name: str, instructions: str, scene_number: Optional[int] = None) -> str:
        """Send a revision request to a specific agent."""
        agent = AGENTS.get(agent_name, editor)
        model = project.model_overrides.get(agent_name) or DEPTH_MODES[project.depth_mode]["default_models"].get(agent_name, "claude-sonnet-4-6")

        context = f"""## Текущий сценарий:\n\n{project.scenario}\n\n## Запрос на ревизию:\n{instructions}"""
        if scene_number:
            context += f"\n\nФокус на сцене #{scene_number}."

        result = await agent.run(context, model=model)
        project.scenario = result
        project.updated_at = project.updated_at.__class__.utcnow()
        await storage.save_project(project)
        return result

    def stop(self, project_id: str):
        self._running[project_id] = False

    def _build_briefing_context(self, project: Project) -> str:
        return f"""Идея проекта: {project.idea}
Тип: {project.type.value}
Оборудование:
- Камера: {project.equipment.camera}
- Объективы: {project.equipment.lenses}
- Свет: {project.equipment.lighting}
- Звук: {project.equipment.audio}
- Локации: {project.equipment.locations}
- Спецэффекты: {project.equipment.special}

Сгенерируй 5-7 уточняющих вопросов автору, чтобы лучше понять его видение и создать качественный бриф для команды."""

    def _build_generation_context(self, project: Project) -> str:
        answers_text = ""
        if project.briefing_questions and project.briefing_answers:
            pairs = zip(project.briefing_questions, project.briefing_answers)
            answers_text = "\n".join(f"В: {q}\nО: {a}" for q, a in pairs)

        return f"""# Бриф проекта

**Идея:** {project.idea}
**Тип:** {project.type.value}
**Режим глубины:** {project.depth_mode}

## Оборудование:
- Камера: {project.equipment.camera}
- Объективы: {project.equipment.lenses}
- Свет: {project.equipment.lighting}
- Звук: {project.equipment.audio}
- Локации: {project.equipment.locations}
- Спецэффекты: {project.equipment.special}

## Ответы на вопросы брифинга:
{answers_text}

## Задача:
Создай полный профессиональный сценарий в формате ScenarioForge. Включи все обязательные секции: заголовок, метаданные, оборудование, персонажей, разбивку по сценам с shot list, диалогами и режиссёрскими заметками."""


orchestrator = PipelineOrchestrator()
