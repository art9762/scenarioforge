"""SQLAlchemy models for ScenarioForge v2."""

from datetime import datetime, timezone
import uuid

from sqlalchemy import Column, String, DateTime, Integer, Float, ForeignKey, Text, Boolean
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: str = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: str = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password: str = Column(String(255), nullable=False)
    display_name: str = Column(String(255), nullable=True)
    is_active: bool = Column(Boolean, default=True, nullable=False)
    is_admin: bool = Column(Boolean, default=False, nullable=False)
    credits: int = Column(Integer, default=0, nullable=False)
    invited_by: str = Column(String(36), nullable=True)
    tier: str = Column(String(20), default="free", nullable=False)  # free, pro
    created_at: datetime = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    projects = relationship("ProjectRecord", back_populates="user", cascade="all, delete-orphan")
    usage_records = relationship("UsageRecord", back_populates="user", cascade="all, delete-orphan")


class ProjectRecord(Base):
    """Project metadata in DB. Actual content (scenario, agents, revisions) stays on filesystem."""
    __tablename__ = "projects"

    id: str = Column(String(36), primary_key=True)
    user_id: str = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    idea: str = Column(Text, nullable=False)
    type: str = Column(String(50), nullable=False)
    status: str = Column(String(50), default="created", nullable=False)
    depth_mode: str = Column(String(20), default="standard")
    created_at: datetime = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: datetime = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="projects")


class UsageRecord(Base):
    """Track token usage per user per month."""
    __tablename__ = "usage"

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    user_id: str = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    year_month: str = Column(String(7), nullable=False)  # e.g., "2026-04"
    generations_count: int = Column(Integer, default=0, nullable=False)
    tokens_input: int = Column(Integer, default=0, nullable=False)
    tokens_output: int = Column(Integer, default=0, nullable=False)

    user = relationship("User", back_populates="usage_records")


class InviteCode(Base):
    """Invite codes for registration."""
    __tablename__ = "invite_codes"

    id: str = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: str = Column(String(32), unique=True, nullable=False, index=True)
    created_by: str = Column(String(36), ForeignKey("users.id"), nullable=False)
    used_by: str = Column(String(36), ForeignKey("users.id"), nullable=True)
    used_at: datetime = Column(DateTime(timezone=True), nullable=True)
    created_at: datetime = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class CreditCode(Base):
    """Codes that add credits to user balance."""
    __tablename__ = "credit_codes"

    id: str = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: str = Column(String(32), unique=True, nullable=False, index=True)
    amount: int = Column(Integer, nullable=False)
    created_by: str = Column(String(36), ForeignKey("users.id"), nullable=False)
    used_by: str = Column(String(36), ForeignKey("users.id"), nullable=True)
    used_at: datetime = Column(DateTime(timezone=True), nullable=True)
    created_at: datetime = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
