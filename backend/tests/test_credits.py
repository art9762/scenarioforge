"""Tests for credit system: deduction, rejection, redemption, transfer."""

import pytest
from tests.conftest import auth_header


@pytest.mark.asyncio
async def test_transfer_credits_to_team(client, auth_enabled, token_a, user_a):
    team_resp = await client.post("/api/teams", json={"name": "CreditTeam"}, headers=auth_header(token_a))
    slug = team_resp.json()["slug"]

    resp = await client.post(f"/api/teams/{slug}/transfer-credits", json={
        "amount": 5,
    }, headers=auth_header(token_a))
    assert resp.status_code == 200
    data = resp.json()
    assert data["team_credits"] == 5
    assert data["user_credits"] == user_a.credits - 5


@pytest.mark.asyncio
async def test_transfer_more_than_balance_rejected(client, auth_enabled, token_a, user_a):
    team_resp = await client.post("/api/teams", json={"name": "OverTeam"}, headers=auth_header(token_a))
    slug = team_resp.json()["slug"]

    resp = await client.post(f"/api/teams/{slug}/transfer-credits", json={
        "amount": 99999,
    }, headers=auth_header(token_a))
    assert resp.status_code == 400
    assert "Insufficient" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_redeem_credit_code_on_team(client, auth_enabled, token_a, credit_code):
    team_resp = await client.post("/api/teams", json={"name": "RedeemTeam"}, headers=auth_header(token_a))
    slug = team_resp.json()["slug"]

    resp = await client.post(f"/api/teams/{slug}/redeem", json={
        "code": "CREDIT100",
    }, headers=auth_header(token_a))
    assert resp.status_code == 200
    data = resp.json()
    assert data["added"] == 100
    assert data["team_credits"] == 100


@pytest.mark.asyncio
async def test_redeem_used_credit_code_on_team_rejected(client, auth_enabled, token_a, credit_code):
    team_resp = await client.post("/api/teams", json={"name": "UsedTeam"}, headers=auth_header(token_a))
    slug = team_resp.json()["slug"]

    await client.post(f"/api/teams/{slug}/redeem", json={"code": "CREDIT100"}, headers=auth_header(token_a))

    resp = await client.post(f"/api/teams/{slug}/redeem", json={"code": "CREDIT100"}, headers=auth_header(token_a))
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_redeem_credit_code_on_user(client, auth_enabled, token_a, credit_code, user_a):
    resp = await client.post("/api/auth/redeem", json={"code": "CREDIT100"}, headers=auth_header(token_a))
    assert resp.status_code == 200
    data = resp.json()
    assert data["added"] == 100


@pytest.mark.asyncio
async def test_generation_rejected_at_zero_user_credits(client, auth_enabled, token_a, user_a, db_session):
    user_a.credits = 0
    await db_session.commit()

    project_resp = await client.post("/api/projects", json={
        "idea": "Test project",
        "type": "youtube",
    }, headers=auth_header(token_a))
    project_id = project_resp.json()["id"]

    resp = await client.post(f"/api/projects/{project_id}/generate", json={
        "depth_mode": "fast",
    }, headers=auth_header(token_a))
    assert resp.status_code == 403
    assert "credits" in resp.json()["detail"].lower() or "Insufficient" in resp.json()["detail"]
