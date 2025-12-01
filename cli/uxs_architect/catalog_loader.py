from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

DEFAULT_CATALOG_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "catalog.json"


def load_catalog(path: Path | str | None = None) -> Dict[str, Any]:
    """Load a catalog JSON file.

    The catalog stays intentionally schema-simple so the tool can run
    offline and be inspected or edited directly in the field.
    """

    catalog_path = Path(path) if path else DEFAULT_CATALOG_PATH
    if not catalog_path.exists():
        raise FileNotFoundError(f"Catalog not found: {catalog_path}")

    with catalog_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)
