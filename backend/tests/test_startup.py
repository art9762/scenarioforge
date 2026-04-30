import subprocess
import sys
from pathlib import Path


def test_main_imports_from_backend_working_directory():
    backend_dir = Path(__file__).resolve().parents[1]

    result = subprocess.run(
        [sys.executable, "-c", "import main; print(main.app.title)"],
        cwd=backend_dir,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "ScenarioForge" in result.stdout
