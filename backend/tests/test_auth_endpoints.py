"""Tests for auth endpoints: 401/403, register, login."""

import pytest
from tests.conftest import auth_header


@pytest.mark.asyncio
async def test_protected_endpoint_returns_401_without_token(client, auth_enabled):
    resp = await client.get("/api/projects")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_protected_endpoint_returns_401_with_invalid_token(client, auth_enabled):
    resp = await client.get("/api/projects", headers=auth_header("garbage-token"))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_user_info(client, auth_enabled, token_a, user_a):
    resp = await client.get("/api/auth/me", headers=auth_header(token_a))
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "user_a@test.com"
    assert data["auth_enabled"] is True


@pytest.mark.asyncio
async def test_me_returns_401_without_token(client, auth_enabled):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_success(client, auth_enabled, user_a):
    resp = await client.post("/api/auth/login", json={
        "email": "user_a@test.com",
        "password": "password123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["email"] == "user_a@test.com"


@pytest.mark.asyncio
async def test_login_wrong_password(client, auth_enabled, user_a):
    resp = await client.post("/api/auth/login", json={
        "email": "user_a@test.com",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_user(client, auth_enabled):
    resp = await client.post("/api/auth/login", json={
        "email": "nobody@test.com",
        "password": "password123",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_register_with_valid_invite_code(client, auth_enabled, invite_code):
    resp = await client.post("/api/auth/register", json={
        "email": "newuser@test.com",
        "password": "securepass123",
        "display_name": "New User",
        "invite_code": "TESTINVITE123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "newuser@test.com"
    assert "access_token" in data


@pytest.mark.asyncio
async def test_register_with_invalid_invite_code(client, auth_enabled):
    resp = await client.post("/api/auth/register", json={
        "email": "newuser@test.com",
        "password": "securepass123",
        "display_name": "New User",
        "invite_code": "INVALID",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_register_duplicate_email(client, auth_enabled, user_a, invite_code):
    resp = await client.post("/api/auth/register", json={
        "email": "user_a@test.com",
        "password": "securepass123",
        "invite_code": "TESTINVITE123",
    })
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_register_password_too_short(client, auth_enabled, invite_code):
    resp = await client.post("/api/auth/register", json={
        "email": "short@test.com",
        "password": "short",
        "invite_code": "TESTINVITE123",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_refresh_token_flow(client, auth_enabled, user_a):
    login_resp = await client.post("/api/auth/login", json={
        "email": "user_a@test.com",
        "password": "password123",
    })
    refresh_token = login_resp.json()["refresh_token"]

    resp = await client.post("/api/auth/refresh", json={
        "refresh_token": refresh_token,
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_refresh_with_invalid_token(client, auth_enabled):
    resp = await client.post("/api/auth/refresh", json={
        "refresh_token": "invalid-token",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_redeem_credit_code(client, auth_enabled, token_a, credit_code, user_a):
    resp = await client.post("/api/auth/redeem", json={"code": "CREDIT100"}, headers=auth_header(token_a))
    assert resp.status_code == 200
    data = resp.json()
    assert data["added"] == 100
    assert data["credits"] == user_a.credits + 100


@pytest.mark.asyncio
async def test_redeem_invalid_credit_code(client, auth_enabled, token_a):
    resp = await client.post("/api/auth/redeem", json={"code": "NONEXISTENT"}, headers=auth_header(token_a))
    assert resp.status_code == 400
