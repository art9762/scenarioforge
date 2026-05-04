"""Tests for team endpoints: roles, access control."""

import pytest
from tests.conftest import auth_header


@pytest.mark.asyncio
async def test_create_team(client, auth_enabled, token_a):
    resp = await client.post("/api/teams", json={"name": "Test Team"}, headers=auth_header(token_a))
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Team"
    assert data["role"] == "owner"
    assert "slug" in data


@pytest.mark.asyncio
async def test_list_teams(client, auth_enabled, token_a):
    await client.post("/api/teams", json={"name": "Team Alpha"}, headers=auth_header(token_a))
    resp = await client.get("/api/teams", headers=auth_header(token_a))
    assert resp.status_code == 200
    teams = resp.json()
    assert len(teams) >= 1
    assert teams[0]["name"] == "Team Alpha"


@pytest.mark.asyncio
async def test_owner_can_add_member(client, auth_enabled, token_a, user_b):
    team_resp = await client.post("/api/teams", json={"name": "Collab"}, headers=auth_header(token_a))
    slug = team_resp.json()["slug"]

    resp = await client.post(f"/api/teams/{slug}/members", json={
        "email": "user_b@test.com",
        "role": "editor",
    }, headers=auth_header(token_a))
    assert resp.status_code == 200
    assert resp.json()["role"] == "editor"


@pytest.mark.asyncio
async def test_owner_can_change_member_role(client, auth_enabled, token_a, user_b):
    team_resp = await client.post("/api/teams", json={"name": "RoleTest"}, headers=auth_header(token_a))
    slug = team_resp.json()["slug"]

    await client.post(f"/api/teams/{slug}/members", json={
        "email": "user_b@test.com", "role": "editor",
    }, headers=auth_header(token_a))

    resp = await client.patch(f"/api/teams/{slug}/members/{user_b.id}", json={
        "role": "viewer",
    }, headers=auth_header(token_a))
    assert resp.status_code == 200
    assert resp.json()["role"] == "viewer"


@pytest.mark.asyncio
async def test_editor_cannot_change_roles(client, auth_enabled, token_a, token_b, user_b, user_a):
    team_resp = await client.post("/api/teams", json={"name": "NoEdit"}, headers=auth_header(token_a))
    slug = team_resp.json()["slug"]

    await client.post(f"/api/teams/{slug}/members", json={
        "email": "user_b@test.com", "role": "editor",
    }, headers=auth_header(token_a))

    resp = await client.patch(f"/api/teams/{slug}/members/{user_a.id}", json={
        "role": "viewer",
    }, headers=auth_header(token_b))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_non_member_cannot_access_team(client, auth_enabled, token_a, token_b):
    team_resp = await client.post("/api/teams", json={"name": "Private"}, headers=auth_header(token_a))
    slug = team_resp.json()["slug"]

    resp = await client.get(f"/api/teams/{slug}", headers=auth_header(token_b))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_owner_can_delete_team(client, auth_enabled, token_a):
    team_resp = await client.post("/api/teams", json={"name": "ToDelete"}, headers=auth_header(token_a))
    slug = team_resp.json()["slug"]

    resp = await client.delete(f"/api/teams/{slug}", headers=auth_header(token_a))
    assert resp.status_code == 200

    resp = await client.get(f"/api/teams/{slug}", headers=auth_header(token_a))
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_editor_cannot_delete_team(client, auth_enabled, token_a, token_b, user_b):
    team_resp = await client.post("/api/teams", json={"name": "NoDel"}, headers=auth_header(token_a))
    slug = team_resp.json()["slug"]

    await client.post(f"/api/teams/{slug}/members", json={
        "email": "user_b@test.com", "role": "editor",
    }, headers=auth_header(token_a))

    resp = await client.delete(f"/api/teams/{slug}", headers=auth_header(token_b))
    assert resp.status_code == 403
