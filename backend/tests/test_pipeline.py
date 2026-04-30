import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from backend.pipeline.orchestrator import PipelineOrchestrator, AGENTS
from backend.models.project import Project, ProjectType, Equipment, ProjectStatus
from backend.services.llm import LLMResponse


@pytest.fixture
def sample_project():
    return Project(
        idea="Короткометражка о роботе, который учится любить",
        type=ProjectType.short_film,
        equipment=Equipment(camera="Sony A7IV", lenses="35mm f/1.4"),
        depth_mode="fast",
        briefing_questions=["Какой жанр?"],
        briefing_answers=["Sci-fi драма"],
    )


def _make_resp(text: str) -> LLMResponse:
    return LLMResponse(text=text, input_tokens=100, output_tokens=200)


@pytest.mark.asyncio
async def test_generate_briefing(sample_project):
    orch = PipelineOrchestrator()
    with patch("backend.pipeline.orchestrator.director") as mock_dir:
        mock_dir.run = AsyncMock(return_value="1. Какой жанр?\n2. Какой хронометраж?\n3. Есть ли референсы?")
        questions = await orch.generate_briefing(sample_project)
        assert len(questions) == 3
        assert "жанр" in questions[0].lower()


@pytest.mark.asyncio
async def test_run_pipeline_fast(sample_project):
    orch = PipelineOrchestrator()
    with patch("backend.pipeline.orchestrator.storage") as mock_storage:
        mock_storage.save_project = AsyncMock()
        mock_storage.save_agent_result = AsyncMock()
        mock_storage.save_revision = AsyncMock()
        with patch.object(AGENTS["director"], "run_with_usage", new=AsyncMock(return_value=_make_resp("Director output"))):
            with patch.object(AGENTS["screenwriter"], "run_with_usage", new=AsyncMock(return_value=_make_resp("# Final Scenario"))):
                result = await orch.run_pipeline(sample_project)
                assert result == ("# Final Scenario", 200, 400)
                assert sample_project.status == ProjectStatus.completed
                assert mock_storage.save_agent_result.call_count == 2
                assert mock_storage.save_revision.call_count == 2


@pytest.mark.asyncio
async def test_stop_pipeline(sample_project):
    orch = PipelineOrchestrator()

    async def stop_after_first_call(ctx, model=None):
        orch.stop(sample_project.id)
        return _make_resp("director output")

    with patch("backend.pipeline.orchestrator.storage") as mock_storage:
        mock_storage.save_project = AsyncMock()
        mock_storage.save_agent_result = AsyncMock()
        mock_storage.save_revision = AsyncMock()
        with patch.object(AGENTS["director"], "run_with_usage", new=stop_after_first_call):
            with patch.object(AGENTS["screenwriter"], "run_with_usage", new=AsyncMock(return_value=_make_resp("should not reach"))):
                result = await orch.run_pipeline(sample_project)
                # Should stop before screenwriter runs — returns scenario + token counts
                assert result[0] == "director output"
                AGENTS["screenwriter"].run_with_usage.assert_not_called()
