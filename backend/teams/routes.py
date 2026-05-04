"""Team API routes — create, manage members, credits."""

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.auth.deps import get_current_user
from backend.db.models import User, Team, TeamMember, CreditCode
from backend.db.session import get_db

router = APIRouter(prefix="/api/teams", tags=["teams"])


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "team"


# --- Schemas ---

class CreateTeamRequest(BaseModel):
    name: str = Field(max_length=255)


class UpdateTeamRequest(BaseModel):
    name: str | None = Field(default=None, max_length=255)


class AddMemberRequest(BaseModel):
    email: str = Field(max_length=255)
    role: str = Field(default="editor", max_length=20)


class UpdateMemberRequest(BaseModel):
    role: str = Field(max_length=20)


class TransferCreditsRequest(BaseModel):
    amount: int


class RedeemOnTeamRequest(BaseModel):
    code: str = Field(max_length=32)


# --- Helpers ---

async def _get_team_by_slug(slug: str, db: AsyncSession) -> Team:
    result = await db.execute(
        select(Team).options(selectinload(Team.members).selectinload(TeamMember.user)).where(Team.slug == slug)
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


async def _get_membership(team: Team, user_id: str) -> TeamMember:
    for m in team.members:
        if m.user_id == user_id:
            return m
    raise HTTPException(status_code=403, detail="Not a team member")


async def _require_owner(team: Team, user_id: str) -> TeamMember:
    member = await _get_membership(team, user_id)
    if member.role != "owner":
        raise HTTPException(status_code=403, detail="Owner access required")
    return member


async def _ensure_unique_slug(db: AsyncSession, base_slug: str, exclude_id: str | None = None) -> str:
    slug = base_slug
    counter = 0
    while True:
        q = select(Team.id).where(Team.slug == slug)
        if exclude_id:
            q = q.where(Team.id != exclude_id)
        exists = (await db.execute(q)).scalar_one_or_none()
        if not exists:
            return slug
        counter += 1
        slug = f"{base_slug}-{counter}"


# --- Routes ---

@router.post("")
async def create_team(
    data: CreateTeamRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    name = data.name.strip()
    if not name or len(name) > 255:
        raise HTTPException(status_code=400, detail="Invalid team name")

    slug = await _ensure_unique_slug(db, _slugify(name))

    team = Team(name=name, slug=slug, created_by=user.id)
    db.add(team)
    await db.flush()

    member = TeamMember(team_id=team.id, user_id=user.id, role="owner")
    db.add(member)

    return {
        "id": team.id,
        "name": team.name,
        "slug": team.slug,
        "credits": team.credits,
        "role": "owner",
        "members_count": 1,
    }


@router.get("")
async def list_teams(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user is None:
        return []

    result = await db.execute(
        select(TeamMember).options(
            selectinload(TeamMember.team).selectinload(Team.members)
        ).where(TeamMember.user_id == user.id)
    )
    memberships = result.scalars().all()

    return [
        {
            "id": m.team.id,
            "name": m.team.name,
            "slug": m.team.slug,
            "credits": m.team.credits,
            "role": m.role,
            "members_count": len(m.team.members),
        }
        for m in memberships
    ]


@router.get("/{slug}")
async def get_team(
    slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    team = await _get_team_by_slug(slug, db)
    await _get_membership(team, user.id)

    return {
        "id": team.id,
        "name": team.name,
        "slug": team.slug,
        "credits": team.credits,
        "created_by": team.created_by,
        "created_at": team.created_at.isoformat() if team.created_at else None,
        "members": [
            {
                "id": m.id,
                "user_id": m.user_id,
                "email": m.user.email if m.user else None,
                "display_name": m.user.display_name if m.user else None,
                "role": m.role,
                "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            }
            for m in team.members
        ],
    }


@router.patch("/{slug}")
async def update_team(
    slug: str,
    data: UpdateTeamRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    team = await _get_team_by_slug(slug, db)
    await _require_owner(team, user.id)

    if data.name is not None:
        name = data.name.strip()
        if not name or len(name) > 255:
            raise HTTPException(status_code=400, detail="Invalid team name")
        team.name = name
        team.slug = await _ensure_unique_slug(db, _slugify(name), exclude_id=team.id)

    return {"id": team.id, "name": team.name, "slug": team.slug}


@router.delete("/{slug}")
async def delete_team(
    slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    team = await _get_team_by_slug(slug, db)
    await _require_owner(team, user.id)

    await db.delete(team)
    return {"status": "deleted"}


# --- Members ---

@router.post("/{slug}/members")
async def add_member(
    slug: str,
    data: AddMemberRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    team = await _get_team_by_slug(slug, db)
    await _require_owner(team, user.id)

    if data.role not in ("editor", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be 'editor' or 'viewer'")

    result = await db.execute(select(User).where(User.email == data.email))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    for m in team.members:
        if m.user_id == target_user.id:
            raise HTTPException(status_code=409, detail="User already in team")

    member = TeamMember(team_id=team.id, user_id=target_user.id, role=data.role)
    db.add(member)

    return {
        "id": member.id,
        "user_id": target_user.id,
        "email": target_user.email,
        "display_name": target_user.display_name,
        "role": member.role,
    }


@router.patch("/{slug}/members/{member_user_id}")
async def update_member(
    slug: str,
    member_user_id: str,
    data: UpdateMemberRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    team = await _get_team_by_slug(slug, db)
    await _require_owner(team, user.id)

    if data.role not in ("owner", "editor", "viewer"):
        raise HTTPException(status_code=400, detail="Invalid role")

    target = None
    for m in team.members:
        if m.user_id == member_user_id:
            target = m
            break
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    target.role = data.role
    return {"status": "updated", "role": target.role}


@router.delete("/{slug}/members/{member_user_id}")
async def remove_member(
    slug: str,
    member_user_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    team = await _get_team_by_slug(slug, db)
    await _require_owner(team, user.id)

    if member_user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself as owner")

    target = None
    for m in team.members:
        if m.user_id == member_user_id:
            target = m
            break
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.delete(target)
    return {"status": "removed"}


@router.post("/{slug}/leave")
async def leave_team(
    slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    team = await _get_team_by_slug(slug, db)
    member = await _get_membership(team, user.id)

    if member.role == "owner":
        raise HTTPException(status_code=400, detail="Owner cannot leave. Transfer ownership or delete the team.")

    await db.delete(member)
    return {"status": "left"}


# --- Credits ---

@router.post("/{slug}/transfer-credits")
async def transfer_credits(
    slug: str,
    data: TransferCreditsRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    team = await _get_team_by_slug(slug, db)
    await _get_membership(team, user.id)

    locked_user = (await db.execute(
        select(User).where(User.id == user.id).with_for_update()
    )).scalar_one()
    locked_team = (await db.execute(
        select(Team).where(Team.id == team.id).with_for_update()
    )).scalar_one()

    if locked_user.credits < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient personal credits")

    locked_user.credits -= data.amount
    locked_team.credits += data.amount

    return {"user_credits": locked_user.credits, "team_credits": locked_team.credits}


@router.post("/{slug}/redeem")
async def redeem_on_team(
    slug: str,
    data: RedeemOnTeamRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    team = await _get_team_by_slug(slug, db)
    await _require_owner(team, user.id)

    result = await db.execute(
        select(CreditCode).where(CreditCode.code == data.code, CreditCode.used_by == None)
    )
    credit_code = result.scalar_one_or_none()
    if not credit_code:
        raise HTTPException(status_code=400, detail="Invalid or already used credit code")

    credit_code.used_by = user.id
    credit_code.used_at = datetime.now(timezone.utc)
    team.credits += credit_code.amount

    return {"team_credits": team.credits, "added": credit_code.amount}
