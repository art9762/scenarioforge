"""Database session management using SQLAlchemy async."""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from backend.config import settings

engine_kwargs: dict = {"echo": False}
if settings.database_url.startswith("postgresql"):
    engine_kwargs.update(pool_size=5, max_overflow=10)

engine = create_async_engine(settings.database_url, **engine_kwargs)

async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    """Dependency for FastAPI — yields a DB session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db():
    """Create all tables (for development). In production, use Alembic."""
    from backend.db.models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
