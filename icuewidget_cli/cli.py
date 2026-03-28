from __future__ import annotations

from pathlib import Path
from typing import Any, NoReturn

import click
import typer
import typer.core
from rich.console import Console
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table

from . import __version__
from .constants import (
    APP_NAME,
    DEFAULT_DEVICE_TYPE,
    DEFAULT_FRAMEWORK_VERSION,
    DEFAULT_PLATFORM,
    IDENTIFIER_RE,
    SEMVER_RE,
    SLUG_RE,
)
from .prompts import prompt, prompt_required, prompt_validated
from .scaffold import scaffold_widget
from .validation import (
    CliError,
    ValidationResult,
    create_package,
    validate_widget,
)


class CustomGroup(typer.core.TyperGroup):
    def format_usage(
        self, ctx: click.Context, formatter: click.HelpFormatter
    ) -> None:
        formatter.write_usage(
            APP_NAME,
            "[-v | --version] [-h | --help] <command> [<args>]",
        )


console = Console()
app = typer.Typer(
    name=APP_NAME,
    cls=CustomGroup,
    no_args_is_help=True,
    add_completion=False,
    rich_markup_mode="rich",
    help="Create, validate, and package iCUE widgets.",
    epilog=(
        "Examples:\n"
        "  icuewidget init HelloWidget\n"
        "  icuewidget validate HelloWidget\n"
        "  icuewidget package HelloWidget"
    ),
)


def main() -> None:
    app()


@app.callback(invoke_without_command=True)
def callback(
    version: bool = typer.Option(
        False,
        "--version",
        "-v",
        help="Show the CLI version and exit.",
        is_eager=True,
    ),
) -> None:
    if version:
        print_header()
        raise typer.Exit()


@app.command("validate")
def validate_command(
    path: str = typer.Argument(".", help="Widget directory name or path."),
) -> None:
    widget_dir = resolve_widget_dir(path)
    result = run_validation(widget_dir)

    print_header()
    console.print()
    console.print(
        Panel.fit("[green]Validation passed[/green]", border_style="green"))

    table = Table(show_header=False, box=None, pad_edge=False)
    table.add_row("Widget", str(result.manifest["name"]))
    table.add_row("Id", str(result.manifest["id"]))
    table.add_row("Version", str(result.manifest["version"]))
    table.add_row("Path", str(widget_dir))
    console.print(table)
    print_warnings(result.warnings)


@app.command("package")
def package_command(
    path: str = typer.Argument(".", help="Widget directory name or path."),
    output: str | None = typer.Option(
        None,
        "--output",
        "-o",
        help="Output .icuewidget file path (defaults to a sibling file named after widget name).",
        rich_help_panel="Packaging Options",
    ),
) -> None:
    widget_dir = resolve_widget_dir(path)
    result = run_validation(widget_dir)

    output_path = (
        Path(output).expanduser().resolve()
        if output
        else default_output_path(widget_dir, result.manifest)
    )
    if output_path.suffix != ".icuewidget":
        output_path = output_path.with_suffix(".icuewidget")

    create_package(widget_dir, output_path)

    print_header()
    console.print()
    console.print(
        Panel.fit("[green]Package created successfully[/green]",
                  border_style="green")
    )

    table = Table(show_header=False, box=None, pad_edge=False)
    table.add_row("Widget", str(result.manifest["name"]))
    table.add_row("Source", str(widget_dir))
    table.add_row("Output", str(output_path))
    console.print(table)
    print_warnings(result.warnings)


@app.command("init")
def init_command(
    path: str = typer.Argument(
        ".", help="Widget directory name or path to create."),
    force: bool = typer.Option(
        False,
        "--force",
        help="Allow scaffolding into a non-empty directory.",
        rich_help_panel="Scaffolding Options",
    ),
) -> None:
    target_dir = Path(path).expanduser().resolve()
    target_dir.mkdir(parents=True, exist_ok=True)

    if not force and any(target_dir.iterdir()):
        raise_cli_error(
            f"Target directory is not empty: {target_dir}\nUse --force to scaffold into a non-empty directory."
        )

    print_header()
    console.print()
    console.print(
        Panel.fit("Interactive widget initialization", border_style="blue"))
    console.print(
        f"[dim]A configurable hello-world widget for {DEFAULT_DEVICE_TYPE} on {DEFAULT_PLATFORM} will be created.[/dim]"
    )
    console.print(Rule(style="blue"))

    widget_name = prompt_required("Widget name")
    author = prompt_required("Author")
    fallback = target_dir.name if target_dir.name else "my-widget"
    widget_slug = slugify(widget_name) or slugify(fallback) or "widget"
    widget_id = prompt_validated(
        "Widget id",
        build_default_widget_id(author, widget_slug),
        validate_identifier,
        "Use only letters, digits, dots, and hyphens.",
    )
    description = prompt("Description", f"A widget named {widget_name}")
    version = prompt_validated(
        "Version", "1.0.0", is_semver, "Use semantic version format like 1.0.0."
    )
    preview_icon = prompt("Preview icon path", "resources/icon.svg")

    manifest = {
        "author": author,
        "id": widget_id,
        "name": widget_name,
        "description": description,
        "version": version,
        "preview_icon": preview_icon,
        "min_framework_version": DEFAULT_FRAMEWORK_VERSION,
        "os": [{"platform": DEFAULT_PLATFORM}],
        "supported_devices": [{"type": DEFAULT_DEVICE_TYPE}],
    }

    result = scaffold_widget(target_dir, manifest, widget_name)

    console.print()
    console.print(
        Panel.fit("[green]Widget scaffold created[/green]",
                  border_style="green")
    )

    files_table = Table(title="Generated files")
    files_table.add_column("File")
    files_table.add_column("Path")
    for label, file_path in result.files:
        files_table.add_row(label, str(file_path))
    console.print(files_table)

    summary_table = Table(show_header=False, box=None, pad_edge=False)
    summary_table.add_row("Directory", str(target_dir))
    summary_table.add_row("Widget id", widget_id)
    summary_table.add_row("Platform", DEFAULT_PLATFORM)
    summary_table.add_row("Device", DEFAULT_DEVICE_TYPE)
    console.print(summary_table)

    rel = target_dir.name or str(target_dir)
    next_steps = Table(show_header=False, box=None, pad_edge=False)
    next_steps.add_row("1.", f"Edit {target_dir / 'index.html'}")
    next_steps.add_row(
        "2.", f"Customize {target_dir / 'resources' / 'icon.svg'}")
    next_steps.add_row("3.", f"Run `{APP_NAME} validate {rel}`")
    next_steps.add_row(
        "4.", f"Run `{APP_NAME} package {rel}` when ready")
    console.print(
        Panel.fit(next_steps, title="Next steps", border_style="cyan"))


@app.command("initiate", hidden=True)
def initiate_alias(
    path: str = typer.Argument(
        ".", help="Widget directory name or path to create."),
    force: bool = typer.Option(
        False, "--force", help="Allow scaffolding into a non-empty directory."
    ),
) -> None:
    init_command(path=path, force=force)


def print_header() -> None:
    console.print(f"[bold]{APP_NAME}[/bold] [cyan]{__version__}[/cyan]")
    console.print("[dim]iCUE widget packaging and scaffolding CLI[/dim]")


def print_warnings(warnings: list[str]) -> None:
    if not warnings:
        return
    console.print()
    console.print(
        Panel.fit("[yellow]Warnings[/yellow]", border_style="yellow"))
    for warning in warnings:
        console.print(f"- {warning}")


def default_output_path(widget_dir: Path, manifest: dict[str, Any]) -> Path:
    widget_name = (
        slugify(str(manifest["name"])) or slugify(
            str(manifest["id"])) or "widget"
    )
    return widget_dir.parent / f"{widget_name}.icuewidget"


def resolve_widget_dir(path_value: str) -> Path:
    widget_dir = Path(path_value).expanduser().resolve()
    if not widget_dir.exists() or not widget_dir.is_dir():
        raise_cli_error(f"Widget directory not found: {widget_dir}")
    return widget_dir


def run_validation(widget_dir: Path) -> ValidationResult:
    try:
        return validate_widget(widget_dir)
    except CliError as exc:
        raise_cli_error(f"Validation failed: {exc}")
        assert False, "unreachable"  # help static analysers


def raise_cli_error(message: str) -> NoReturn:
    console.print(f"[red]Error:[/red] {message}")
    raise typer.Exit(code=1)


def is_semver(value: str) -> bool:
    return bool(SEMVER_RE.fullmatch(value))


def validate_identifier(value: str) -> bool:
    return bool(IDENTIFIER_RE.fullmatch(value))


def slugify(value: str) -> str:
    return SLUG_RE.sub("", value.lower())


def build_default_widget_id(author: str, widget_slug: str) -> str:
    author_slug = slugify(author)
    if author_slug:
        return f"com.{author_slug}.{widget_slug}"
    return f"com.example.{widget_slug}"
