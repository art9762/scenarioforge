"""Admin API routes — user management, invite codes, credit codes, teams, activity."""

import json
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.auth.deps import get_current_admin
from backend.db.models import (
    User, InviteCode, CreditCode, ProjectRecord, UsageRecord,
    Team, TeamMember, AuditLog,
)
from backend.db.session import get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _generate_code(length: int = 12) -> str:
    return secrets.token_urlsafe(length)[:length].upper()


async def _log_action(db: AsyncSession, user_id: str | None, action: str, details: dict | None = None):
    entry = AuditLog(
        user_id=user_id,
        action=action,
        details=json.dumps(details, ensure_ascii=False) if details else None,
    )
    db.add(entry)
    await db.flush()


# --- Schemas ---

class GenerateCodesRequest(BaseModel):
    count: int = 1


class GenerateCreditCodesRequest(BaseModel):
    count: int = 1
    amount: int  # credits per code


class UpdateUserRequest(BaseModel):
    credits: int | None = None
    is_active: bool | None = None
    is_admin: bool | None = None
    tier: str | None = None


class UpdateTeamRequest(BaseModel):
    credits: int | None = None


# --- Users ---

@router.get("/users")
async def list_users(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "display_name": u.display_name,
            "is_active": u.is_active,
            "is_admin": u.is_admin,
            "credits": u.credits,
            "tier": u.tier,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    data: UpdateUserRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    changes = {}
    if data.credits is not None:
        changes["credits"] = {"from": user.credits, "to": data.credits}
        user.credits = data.credits
    if data.is_active is not None:
        changes["is_active"] = {"from": user.is_active, "to": data.is_active}
        user.is_active = data.is_active
    if data.is_admin is not None:
        changes["is_admin"] = {"from": user.is_admin, "to": data.is_admin}
        user.is_admin = data.is_admin
    if data.tier is not None and data.tier in ("free", "pro"):
        changes["tier"] = {"from": user.tier, "to": data.tier}
        user.tier = data.tier

    if changes:
        await _log_action(db, admin.id, "admin_update_user", {"target_user": user_id, "email": user.email, **changes})

    return {"status": "updated", "credits": user.credits, "is_active": user.is_active, "is_admin": user.is_admin, "tier": user.tier}


# --- Invite Codes ---

@router.post("/invite-codes")
async def generate_invite_codes(
    data: GenerateCodesRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    codes = []
    for _ in range(min(data.count, 100)):
        code = InviteCode(code=_generate_code(), created_by=admin.id)
        db.add(code)
        codes.append(code.code)
    await db.flush()
    return {"codes": codes}


@router.get("/invite-codes")
async def list_invite_codes(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(InviteCode).order_by(InviteCode.created_at.desc()))
    codes = result.scalars().all()
    return [
        {
            "id": c.id,
            "code": c.code,
            "created_by": c.created_by,
            "used_by": c.used_by,
            "used_at": c.used_at.isoformat() if c.used_at else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in codes
    ]


# --- Credit Codes ---

@router.post("/credit-codes")
async def generate_credit_codes(
    data: GenerateCreditCodesRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    codes = []
    for _ in range(min(data.count, 100)):
        code = CreditCode(code=_generate_code(), amount=data.amount, created_by=admin.id)
        db.add(code)
        codes.append({"code": code.code, "amount": code.amount})
    await db.flush()
    return {"codes": codes}


@router.get("/credit-codes")
async def list_credit_codes(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CreditCode).order_by(CreditCode.created_at.desc()))
    codes = result.scalars().all()
    return [
        {
            "id": c.id,
            "code": c.code,
            "amount": c.amount,
            "created_by": c.created_by,
            "used_by": c.used_by,
            "used_at": c.used_at.isoformat() if c.used_at else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in codes
    ]


# --- Teams (admin) ---

@router.get("/teams")
async def list_teams(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Team).options(selectinload(Team.members)).order_by(Team.created_at.desc())
    )
    teams = result.scalars().all()

    creator_ids = {t.created_by for t in teams}
    if creator_ids:
        users_result = await db.execute(select(User).where(User.id.in_(creator_ids)))
        users_map = {u.id: u for u in users_result.scalars().all()}
    else:
        users_map = {}

    return [
        {
            "id": t.id,
            "name": t.name,
            "slug": t.slug,
            "credits": t.credits,
            "members_count": len(t.members),
            "created_by_email": users_map.get(t.created_by, None) and users_map[t.created_by].email,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in teams
    ]


@router.patch("/teams/{team_id}")
async def update_team(
    team_id: str,
    data: UpdateTeamRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    changes = {}
    if data.credits is not None:
        changes["credits"] = {"from": team.credits, "to": data.credits}
        team.credits = data.credits

    if changes:
        await _log_action(db, admin.id, "admin_update_team", {"team_id": team_id, "team_name": team.name, **changes})

    return {"status": "updated", "credits": team.credits}


@router.delete("/teams/{team_id}")
async def delete_team(
    team_id: str,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    await _log_action(db, admin.id, "admin_delete_team", {"team_id": team_id, "team_name": team.name})
    await db.delete(team)
    return {"status": "deleted"}


# --- Activity Log ---

@router.get("/activity")
async def get_activity(
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    entries = result.scalars().all()

    user_ids = {e.user_id for e in entries if e.user_id}
    if user_ids:
        users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        users_map = {u.id: u.email for u in users_result.scalars().all()}
    else:
        users_map = {}

    return [
        {
            "id": e.id,
            "user_email": users_map.get(e.user_id),
            "action": e.action,
            "details": json.loads(e.details) if e.details else None,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]


# --- Stats ---

@router.get("/stats")
async def get_stats(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    users_count = (await db.execute(select(func.count(User.id)))).scalar()
    projects_count = (await db.execute(select(func.count(ProjectRecord.id)))).scalar()
    teams_count = (await db.execute(select(func.count(Team.id)))).scalar()
    invite_used = (await db.execute(select(func.count(InviteCode.id)).where(InviteCode.used_by != None))).scalar()
    invite_total = (await db.execute(select(func.count(InviteCode.id)))).scalar()
    credit_used = (await db.execute(select(func.count(CreditCode.id)).where(CreditCode.used_by != None))).scalar()
    credit_total = (await db.execute(select(func.count(CreditCode.id)))).scalar()
    total_input = (await db.execute(select(func.coalesce(func.sum(UsageRecord.tokens_input), 0)))).scalar()
    total_output = (await db.execute(select(func.coalesce(func.sum(UsageRecord.tokens_output), 0)))).scalar()
    total_generations = (await db.execute(select(func.coalesce(func.sum(UsageRecord.generations_count), 0)))).scalar()

    return {
        "users": users_count,
        "projects": projects_count,
        "teams": teams_count,
        "invite_codes": {"used": invite_used, "total": invite_total},
        "credit_codes": {"used": credit_used, "total": credit_total},
        "tokens": {"input": total_input, "output": total_output, "total": total_input + total_output},
        "total_generations": total_generations,
    }
