"""Authenticated export transport checks without an LLM or native PDF renderer."""

import pytest
import pytest_asyncio

from tests.conftest import auth_header


SCENARIO = "# Сценарий\n\n🎬 Первая сцена"
PDF_BYTES = b"%PDF-1.7\n\x00\x80\xff"


@pytest_asyncio.fixture
async def export_project(client, auth_enabled, token_a, tmp_path, monkeypatch):
    monkeypatch.setattr("backend.main.storage._base_dir", str(tmp_path))
    # Check PDF response bytes even where WeasyPrint's system libraries are absent.
    monkeypatch.setattr("backend.main.export_service.export_pdf", lambda scenario: PDF_BYTES)
    response = await client.post(
        "/api/projects",
        json={"idea": "Export test", "type": "youtube"},
        headers=auth_header(token_a),
    )
    assert response.status_code == 200
    project_id = response.json()["id"]
    response = await client.put(
        f"/api/projects/{project_id}/scenario",
        json={"scenario": SCENARIO},
        headers=auth_header(token_a),
    )
    assert response.status_code == 200
    return project_id


@pytest.mark.asyncio
@pytest.mark.parametrize("format", ["md", "pdf"])
async def test_owner_downloads_scenario(client, export_project, token_a, format):
    response = await client.get(
        f"/api/projects/{export_project}/export/{format}",
        headers=auth_header(token_a),
    )
    assert response.status_code == 200
    assert response.content == (SCENARIO.encode("utf-8") if format == "md" else PDF_BYTES)
    assert response.headers["content-disposition"] == (
        f"attachment; filename=scenario_{export_project}.{format}"
    )
    assert response.headers["content-type"].startswith(
        "text/markdown" if format == "md" else "application/pdf"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("format", ["md", "pdf"])
async def test_export_requires_bearer_token(client, export_project, format):
    response = await client.get(f"/api/projects/{export_project}/export/{format}")
    assert response.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("format", ["md", "pdf"])
async def test_export_rejects_other_owner(client, export_project, token_b, format):
    response = await client.get(
        f"/api/projects/{export_project}/export/{format}",
        headers=auth_header(token_b),
    )
    assert response.status_code == 403
