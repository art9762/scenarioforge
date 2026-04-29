import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from backend.main import app
from backend.models.project import Project, ProjectType, Equipment, ProjectStatus


@pytest.fixture
def sample_project():
    return Project(
        id="test-123",
        idea="Test idea",
        type=ProjectType.youtube,
        equipment=Equipment(camera="Canon R5"),
        status=ProjectStatus.completed,
        scenario="# Test Scenario\n\nHello world",
    )


@pytest.mark.asyncio
async def test_create_project():
    with patch("backend.main.storage") as mock_storage:
        mock_storage.save_project = AsyncMock()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/projects", json={
                "idea": "Test",
                "type": "youtube",
                "equipment": {"camera": "Sony"},
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data["idea"] == "Test"
            assert data["type"] == "youtube"


@pytest.mark.asyncio
async def test_get_project(sample_project):
    with patch("backend.main.storage") as mock_storage:
        mock_storage.get_project = AsyncMock(return_value=sample_project)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/projects/test-123")
            assert resp.status_code == 200
            assert resp.json()["id"] == "test-123"


@pytest.mark.asyncio
async def test_get_project_not_found():
    with patch("backend.main.storage") as mock_storage:
        mock_storage.get_project = AsyncMock(return_value=None)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/projects/nonexistent")
            assert resp.status_code == 404


@pytest.mark.asyncio
async def test_export_md(sample_project):
    with patch("backend.main.storage") as mock_storage:
        mock_storage.get_project = AsyncMock(return_value=sample_project)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/projects/test-123/export/md")
            assert resp.status_code == 200
            assert "Test Scenario" in resp.text


@pytest.mark.asyncio
async def test_get_models():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/config/models")
        assert resp.status_code == 200
        models = resp.json()
        assert len(models) >= 3


@pytest.mark.asyncio
async def test_get_depth_modes():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/config/depth-modes")
        assert resp.status_code == 200
        modes = resp.json()
        assert "fast" in modes
        assert "standard" in modes
        assert "deep" in modes
