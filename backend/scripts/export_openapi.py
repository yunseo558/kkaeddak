"""Export the deterministic OpenAPI contract snapshot."""

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT / "src"))

from kkaeddak.main import app  # noqa: E402


def main() -> None:
    output = json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    (BACKEND_ROOT / "openapi.json").write_text(output, encoding="utf-8")


if __name__ == "__main__":
    main()
