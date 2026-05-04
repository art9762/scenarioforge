"""Auth API routes — register, login, refresh."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.jwt import create_access_token, create_refresh_token, verify_token
from backend.auth.deps import get_current_user
from backend.auth.passwords import hash_password, verify_password
from backend.db.models import User, InviteCode, CreditCode
from backend.db.session import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


# --- Request/Response schemas ---

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str = ""
    invite_code: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    display_name: str


class RefreshRequest(BaseModel):
    refresh_token: str


# --- Routes ---

@router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Validate invite code
    result = await db.execute(select(InviteCode).where(InviteCode.code == data.invite_code, InviteCode.used_by == None))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=400, detail="Invalid or already used invite code")

    # Check if user already exists
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        display_name=data.display_name or data.email.split("@")[0],
        invited_by=invite.created_by,
    )
    db.add(user)
    await db.flush()

    # Mark invite as used
    invite.used_by = user.id
    invite.used_at = datetime.now(timezone.utc)
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user_id=user.id,
        email=user.email,
        display_name=user.display_name or "",
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user_id=user.id,
        email=user.email,
        display_name=user.display_name or "",
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    user_id = verify_token(data.refresh_token, token_type="refresh")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user_id=user.id,
        email=user.email,
        display_name=user.display_name or "",
    )


@router.get("/me")
async def get_me(
    user: User = Depends(get_current_user),
):
    """Get current authenticated user info."""
    if user is None:
        return {"user": None, "auth_enabled": False}
    return {
        "user_id": user.id,
        "email": user.email,
        "display_name": user.display_name or "",
        "tier": user.tier,
        "is_active": user.is_active,
        "is_admin": user.is_admin,
        "credits": user.credits,
        "auth_enabled": True,
    }


class RedeemRequest(BaseModel):
    code: str


@router.post("/redeem")
async def redeem_credit_code(
    data: RedeemRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Redeem a credit code to add credits to user balance."""
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = await db.execute(select(CreditCode).where(CreditCode.code == data.code, CreditCode.used_by == None))
    credit_code = result.scalar_one_or_none()
    if not credit_code:
        raise HTTPException(status_code=400, detail="Invalid or already used credit code")

    # Apply credits
    credit_code.used_by = user.id
    credit_code.used_at = datetime.now(timezone.utc)
    user.credits += credit_code.amount

    return {"credits": user.credits, "added": credit_code.amount}
