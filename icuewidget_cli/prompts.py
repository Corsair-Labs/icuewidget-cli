from __future__ import annotations

from typing import Any, Callable

import questionary
from rich.console import Console

console = Console()


def prompt(label: str, default: str) -> str:
    result = questionary.text(label, default=default).ask()
    return _ensure_answer(result, default).strip() or default


def prompt_required(label: str) -> str:
    while True:
        result = questionary.text(label).ask()
        value = _ensure_answer(result, "").strip()
        if value:
            return value
        console.print(f"[yellow]{label} is required.[/yellow]")


def prompt_validated(
    label: str, default: str, validator: Callable[[str], bool], error_message: str
) -> str:
    while True:
        value = prompt(label, default)
        if validator(value):
            return value
        console.print(f"[yellow]{error_message}[/yellow]")


def _ensure_answer(value: Any | None, default: Any) -> Any:
    if value is None:
        return default
    return value

