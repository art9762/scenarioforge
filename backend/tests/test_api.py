import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
from tests.conftest import auth_header


@pytest_asyncio.fixture
async def sample_project(client, auth_enabled, token_a):
    response = await client.post(
        "/api/projects",
        json={"idea": "Test idea", "type": "youtube", "equipment": {"camera": "Canon R5"}},
        headers=auth_header(token_a),
    )
    assert response.status_code == 200
    project = response.json()
    project["scenario"] = "# Test Scenario\n\nHello world"
    response = await client.put(
        f"/api/projects/{project['id']}/scenario",
        json={"scenario": project["scenario"]},
        headers=auth_header(token_a),
    )
    assert response.status_code == 200
    return project


@pytest.mark.asyncio
async def test_create_project(client, auth_enabled, token_a):
    resp = await client.post("/api/projects", json={
        "idea": "Test",
        "type": "youtube",
        "equipment": {"camera": "Sony"},
    }, headers=auth_header(token_a))
    assert resp.status_code == 200
    data = resp.json()
    assert data["idea"] == "Test"
    assert data["type"] == "youtube"
    assert data["equipment"]["camera"] == "Sony"
    saved = await client.get(f"/api/projects/{data['id']}", headers=auth_header(token_a))
    assert saved.status_code == 200
    assert saved.json() == data


@pytest.mark.asyncio
async def test_get_project(client, sample_project, token_a):
    resp = await client.get(f"/api/projects/{sample_project['id']}", headers=auth_header(token_a))
    assert resp.status_code == 200
    assert resp.json() == sample_project


@pytest.mark.asyncio
async def test_get_project_not_found(client, auth_enabled, token_a):
    resp = await client.get("/api/projects/nonexistent", headers=auth_header(token_a))
    assert resp.status_code == 404
    assert resp.json() == {"detail": "Project not found"}


@pytest.mark.asyncio
async def test_export_md(client, sample_project, token_a):
    resp = await client.get(f"/api/projects/{sample_project['id']}/export/md", headers=auth_header(token_a))
    assert resp.status_code == 200
    assert resp.text == sample_project["scenario"]


@pytest.mark.asyncio
async def test_get_models(client):
    resp = await client.get("/api/config/models")
    assert resp.status_code == 200
    models = resp.json()
    assert len(models) >= 3


@pytest.mark.asyncio
async def test_get_depth_modes(client):
    resp = await client.get("/api/config/depth-modes")
    assert resp.status_code == 200
    modes = resp.json()
    assert "fast" in modes
    assert "standard" in modes
    assert "deep" in modes


@pytest.mark.asyncio
async def test_test_models(client):
    with patch("backend.main.llm_client") as mock_llm:
        mock_llm.generate = AsyncMock(return_value="OK")
        resp = await client.post("/api/test/models")
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data
        assert len(data["results"]) >= 3
        for r in data["results"]:
            assert r["ok"] is True
            assert r["latency"] >= 0
            assert "model" in r


@pytest.mark.asyncio
async def test_test_models_failure(client):
    with patch("backend.main.llm_client") as mock_llm:
        mock_llm.generate = AsyncMock(side_effect=Exception("Connection refused"))
        resp = await client.post("/api/test/models")
        assert resp.status_code == 200
        data = resp.json()
        for r in data["results"]:
            assert r["ok"] is False
            assert "Connection refused" in r["error"]
