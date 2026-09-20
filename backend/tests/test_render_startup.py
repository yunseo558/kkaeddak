"""Exercise the Render startup script with observable process commands."""

import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "start-render.sh"


@pytest.mark.parametrize("port", [None, "", "12345"])
def test_startup_migrates_before_serving(tmp_path: Path, port: str | None) -> None:
    env = _commands(tmp_path)
    if port is not None:
        env["PORT"] = port

    result = subprocess.run(["sh", str(SCRIPT)], env=env, capture_output=True, text=True)

    assert result.returncode == 0, result.stderr
    assert (tmp_path / "commands.log").read_text().splitlines() == [
        "alembic upgrade head",
        f"uvicorn kkaeddak.main:app --host 0.0.0.0 --port {port or '10000'}",
    ]


def test_startup_does_not_serve_after_failed_migration(tmp_path: Path) -> None:
    env = _commands(tmp_path)
    env["MIGRATION_EXIT"] = "7"

    result = subprocess.run(["sh", str(SCRIPT)], env=env, capture_output=True, text=True)

    assert result.returncode == 7
    assert (tmp_path / "commands.log").read_text().splitlines() == ["alembic upgrade head"]


def _commands(tmp_path: Path) -> dict[str, str]:
    for name in ("alembic", "uvicorn"):
        command = tmp_path / name
        command.write_text(
            "#!/bin/sh\n"
            f'echo "{name} $*" >> "$COMMAND_LOG"\n'
            + ('exit "${MIGRATION_EXIT:-0}"\n' if name == "alembic" else "")
        )
        command.chmod(0o755)
    env = {**os.environ, "PATH": f"{tmp_path}:/usr/bin:/bin"}
    env.pop("PORT", None)
    env.pop("MIGRATION_EXIT", None)
    env["COMMAND_LOG"] = str(tmp_path / "commands.log")
    return env
