import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from httpx import AsyncClient, ASGITransport

from backend.db.models import Base, User, InviteCode, CreditCode
from backend.auth.passwords import hash_password
from backend.auth.jwt import create_access_token


TEST_DATABASE_URL = "sqlite+aiosqlite://"


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def db_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture
async def app_with_db(db_engine):
    from backend.main import app
    from backend.db.session import get_db

    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    yield app
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client(app_with_db):
    transport = ASGITransport(app=app_with_db)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def auth_enabled(monkeypatch):
    monkeypatch.setattr("backend.config.settings.auth_enabled", True)


@pytest_asyncio.fixture
async def user_a(db_session):
    user = User(
        email="user_a@test.com",
        hashed_password=hash_password("password123"),
        display_name="User A",
        credits=10,
        tier="pro",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def user_b(db_session):
    user = User(
        email="user_b@test.com",
        hashed_password=hash_password("password456"),
        display_name="User B",
        credits=10,
        tier="pro",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def token_a(user_a):
    return create_access_token(user_a.id)


@pytest_asyncio.fixture
async def token_b(user_b):
    return create_access_token(user_b.id)


@pytest_asyncio.fixture
async def invite_code(db_session, user_a):
    code = InviteCode(code="TESTINVITE123", created_by=user_a.id)
    db_session.add(code)
    await db_session.commit()
    await db_session.refresh(code)
    return code


@pytest_asyncio.fixture
async def credit_code(db_session, user_a):
    code = CreditCode(code="CREDIT100", amount=100, created_by=user_a.id)
    db_session.add(code)
    await db_session.commit()
    await db_session.refresh(code)
    return code
