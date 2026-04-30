"""Password hashing helpers."""

from types import SimpleNamespace

import bcrypt
from passlib.context import CryptContext


if not hasattr(bcrypt, "__about__"):
    # Passlib 1.7.4 still reads this legacy metadata attribute.
    bcrypt.__about__ = SimpleNamespace(__version__=bcrypt.__version__)


pwd_context = CryptContext(
    schemes=["bcrypt_sha256", "bcrypt"],
    deprecated="auto",
)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return pwd_context.verify(password, hashed_password)
