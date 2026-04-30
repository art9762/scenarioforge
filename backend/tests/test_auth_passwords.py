import subprocess
import sys
from pathlib import Path

from backend.auth.passwords import pwd_context


def test_password_context_hashes_passwords_longer_than_bcrypt_limit():
    password = "x" * 100

    hashed = pwd_context.hash(password)

    assert hashed.startswith("$bcrypt-sha256$")
    assert pwd_context.verify(password, hashed)
    assert not pwd_context.verify(password + "wrong", hashed)


def test_password_hashing_does_not_emit_bcrypt_backend_warning():
    project_root = Path(__file__).resolve().parents[2]

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from backend.auth.passwords import hash_password; print(hash_password('admin')[:16])",
        ],
        cwd=project_root,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "error reading bcrypt version" not in result.stderr
    assert "Traceback" not in result.stderr
