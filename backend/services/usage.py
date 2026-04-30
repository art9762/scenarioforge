"""Usage tracking and rate limiting service."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import User, UsageRecord


# Tier limits
TIER_LIMITS = {
    "free": {
        "max_generations_per_month": 5,
        "allowed_depths": ["fast"],
        "max_concurrent": 1,
    },
    "pro": {
        "max_generations_per_month": -1,  # unlimited
        "allowed_depths": ["fast", "standard", "deep"],
        "max_concurrent": 3,
    },
}


def get_current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


async def get_or_create_usage(db: AsyncSession, user_id: str) -> UsageRecord:
    """Get or create usage record for current month."""
    month = get_current_month()
    result = await db.execute(
        select(UsageRecord).where(
            UsageRecord.user_id == user_id,
            UsageRecord.year_month == month,
        )
    )
    usage = result.scalar_one_or_none()
    if not usage:
        usage = UsageRecord(user_id=user_id, year_month=month)
        db.add(usage)
        await db.flush()
    return usage


async def check_generation_allowed(db: AsyncSession, user: User, depth_mode: str) -> tuple[bool, str]:
    """Check if a user can start a generation. Returns (allowed, reason)."""
    if user is None:
        return True, ""  # Auth disabled

    limits = TIER_LIMITS.get(user.tier, TIER_LIMITS["free"])

    # Check depth mode allowed
    if depth_mode not in limits["allowed_depths"]:
        return False, f"Режим '{depth_mode}' недоступен на тарифе '{user.tier}'. Обновите до Pro."

    # Check monthly limit
    if limits["max_generations_per_month"] >= 0:
        usage = await get_or_create_usage(db, user.id)
        if usage.generations_count >= limits["max_generations_per_month"]:
            return False, f"Достигнут лимит генераций ({limits['max_generations_per_month']}/мес). Обновите до Pro."

    return True, ""


async def record_generation(db: AsyncSession, user_id: str) -> None:
    """Record a generation attempt."""
    usage = await get_or_create_usage(db, user_id)
    usage.generations_count += 1


async def record_tokens(db: AsyncSession, user_id: str, input_tokens: int, output_tokens: int) -> None:
    """Record token usage."""
    usage = await get_or_create_usage(db, user_id)
    usage.tokens_input += input_tokens
    usage.tokens_output += output_tokens


async def get_usage_stats(db: AsyncSession, user_id: str) -> dict:
    """Get usage stats for current month."""
    usage = await get_or_create_usage(db, user_id)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    tier = user.tier if user else "free"
    limits = TIER_LIMITS.get(tier, TIER_LIMITS["free"])

    return {
        "tier": tier,
        "month": usage.year_month,
        "generations": usage.generations_count,
        "generations_limit": limits["max_generations_per_month"],
        "tokens_input": usage.tokens_input,
        "tokens_output": usage.tokens_output,
        "allowed_depths": limits["allowed_depths"],
    }
