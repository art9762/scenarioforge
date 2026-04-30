"""FastAPI dependencies for authentication."""

from typing import Optional

from fastapi import Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.jwt import verify_token
from backend.config import settings
from backend.db.models import User
from backend.db.session import get_db


async def get_current_user_optional(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Returns current user if auth is enabled and token is valid, else None."""
    if not settings.auth_enabled:
        return None

    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization[7:]
    user_id = verify_token(token)
    if not user_id:
        return None

    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    return result.scalar_one_or_none()


async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Returns current user. Raises 401 if auth is enabled and user is not authenticated."""
    if not settings.auth_enabled:
        return None  # Auth disabled — no user context

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization[7:]
    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user
