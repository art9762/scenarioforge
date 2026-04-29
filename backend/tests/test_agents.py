import pytest
from unittest.mock import AsyncMock, patch
from backend.agents.director import director
from backend.agents.screenwriter import screenwriter
from backend.agents.visual_director import visual_director
from backend.agents.copywriter import copywriter
from backend.agents.editor import editor


@pytest.mark.asyncio
async def test_director_has_system_prompt():
    assert director.name == "director"
    assert "Режиссёр" in director.system_prompt
    assert len(director.system_prompt) > 100


@pytest.mark.asyncio
async def test_screenwriter_has_system_prompt():
    assert screenwriter.name == "screenwriter"
    assert "Сценарист" in screenwriter.system_prompt


@pytest.mark.asyncio
async def test_visual_director_has_system_prompt():
    assert visual_director.name == "visual_director"
    assert "Визуал-директор" in visual_director.system_prompt


@pytest.mark.asyncio
async def test_copywriter_has_system_prompt():
    assert copywriter.name == "copywriter"
    assert "Копирайтер" in copywriter.system_prompt


@pytest.mark.asyncio
async def test_editor_has_system_prompt():
    assert editor.name == "editor"
    assert "Редактор" in editor.system_prompt


@pytest.mark.asyncio
async def test_agent_run_calls_llm():
    with patch("backend.agents.base.llm_client") as mock_llm:
        mock_llm.generate = AsyncMock(return_value="Test response")
        result = await director.run("Test context", model="claude-haiku-4-5")
        assert result == "Test response"
        mock_llm.generate.assert_called_once_with(
            model="claude-haiku-4-5",
            system_prompt=director.system_prompt,
            messages=[{"role": "user", "content": "Test context"}],
        )
