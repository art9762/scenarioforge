"""Tests for project isolation: user A cannot access user B's projects."""

import pytest
from tests.conftest import auth_header


@pytest.mark.asyncio
async def test_user_cannot_list_others_projects(client, auth_enabled, token_a, token_b):
    await client.post("/api/projects", json={
        "idea": "User A's secret project",
        "type": "youtube",
    }, headers=auth_header(token_a))

    resp = await client.get("/api/projects", headers=auth_header(token_b))
    assert resp.status_code == 200
    projects = resp.json()
    ids = [p["idea"] for p in projects] if isinstance(projects, list) else []
    assert "User A's secret project" not in ids


@pytest.mark.asyncio
async def test_user_cannot_get_others_project(client, auth_enabled, token_a, token_b):
    create_resp = await client.post("/api/projects", json={
        "idea": "Private idea",
        "type": "short_film",
    }, headers=auth_header(token_a))
    project_id = create_resp.json()["id"]

    resp = await client.get(f"/api/projects/{project_id}", headers=auth_header(token_b))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_user_cannot_delete_others_project(client, auth_enabled, token_a, token_b):
    create_resp = await client.post("/api/projects", json={
        "idea": "To be deleted",
        "type": "miniature",
    }, headers=auth_header(token_a))
    project_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/projects/{project_id}", headers=auth_header(token_b))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_user_cannot_generate_on_others_project(client, auth_enabled, token_a, token_b):
    create_resp = await client.post("/api/projects", json={
        "idea": "Protected project",
        "type": "youtube",
    }, headers=auth_header(token_a))
    project_id = create_resp.json()["id"]

    resp = await client.post(f"/api/projects/{project_id}/generate", json={
        "depth_mode": "fast",
    }, headers=auth_header(token_b))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_team_member_can_see_team_projects(client, auth_enabled, token_a, token_b, user_b):
    team_resp = await client.post("/api/teams", json={"name": "SharedTeam"}, headers=auth_header(token_a))
    slug = team_resp.json()["slug"]

    await client.post(f"/api/teams/{slug}/members", json={
        "email": "user_b@test.com", "role": "editor",
    }, headers=auth_header(token_a))

    await client.post("/api/projects", json={
        "idea": "Team project",
        "type": "youtube",
        "team_slug": slug,
    }, headers=auth_header(token_a))

    resp = await client.get(f"/api/projects?team={slug}", headers=auth_header(token_b))
    assert resp.status_code == 200
    projects = resp.json()
    assert len(projects) >= 1


@pytest.mark.asyncio
async def test_non_member_cannot_see_team_projects(client, auth_enabled, token_a, token_b):
    team_resp = await client.post("/api/teams", json={"name": "ClosedTeam"}, headers=auth_header(token_a))
    slug = team_resp.json()["slug"]

    await client.post("/api/projects", json={
        "idea": "Secret team project",
        "type": "youtube",
        "team_slug": slug,
    }, headers=auth_header(token_a))

    resp = await client.get(f"/api/projects?team={slug}", headers=auth_header(token_b))
    assert resp.status_code == 403
