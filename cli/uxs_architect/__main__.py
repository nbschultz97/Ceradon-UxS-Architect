"""Module entrypoint to keep the CLI runnable via ``python -m``.

This keeps the tool single-file and dependency-light for fielded use.
"""

from .cli import main


if __name__ == "__main__":  # pragma: no cover - thin wrapper
    main()
