"""PyInstaller entry point – uses absolute import so there is no parent-package dependency."""
from icuewidget_cli.cli import main

if __name__ == "__main__":
    raise SystemExit(main())

