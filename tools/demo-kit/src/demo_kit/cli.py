from __future__ import annotations

from pathlib import Path

import typer
from dotenv import load_dotenv

from demo_kit.paths import ROOT, ensure_out, slug_dir
from demo_kit.validate import ValidationError, load_minutes, load_transcript, validate_minutes

app = typer.Typer(
    add_completion=False,
    no_args_is_help=True,
    help="Dictably demo-kit: transcribe -> minutes -> HTML",
)

load_dotenv(ROOT / ".env")


def _default_slug(source: Path | None, explicit: str | None) -> str:
    if explicit:
        return explicit
    if source is None:
        return "sample"
    return source.stem.lower().replace(" ", "-")[:64]


@app.command()
def transcribe(
    source: Path | None = typer.Argument(
        None,
        help="Audio/video file (not needed for --mode fixture)",
    ),
    mode: str = typer.Option(
        "fixture",
        "--mode",
        help="fixture | assemblyai (demos) | local (no diarization — not for demos)",
    ),
    slug: str | None = typer.Option(None, "--slug"),
    fixture: str = typer.Option("sample", "--fixture", help="Fixture name under fixtures/"),
) -> None:
    """Write out/<slug>/transcript.json (+ audio). Prefer assemblyai for real demos."""
    from demo_kit.transcribe import run_transcribe

    s = _default_slug(source, slug)
    path = run_transcribe(source, slug=s, mode=mode, fixture_name=fixture)
    typer.echo(f"OK transcript -> {path}")


@app.command()
def minutes(
    slug: str = typer.Argument(..., help="Slug under out/"),
    mode: str = typer.Option(
        "manual",
        "--mode",
        help="manual | anthropic | fixture",
    ),
    fixture: str = typer.Option("sample", "--fixture"),
) -> None:
    """Write minutes_request.md and/or minutes.json."""
    from demo_kit.minutes import run_minutes

    path = run_minutes(slug, mode=mode, fixture_name=fixture)
    if path.name == "minutes_request.md":
        typer.echo(
            f"Wrote {path}\n"
            "Claude: create minutes.json in the same folder, then:\n"
            f"   uv run demo validate {slug}\n"
            f"   uv run demo render {slug}"
        )
    else:
        typer.echo(f"OK minutes -> {path}")


@app.command()
def validate(
    slug: str = typer.Argument(...),
) -> None:
    """Validate minutes.json against transcript segment ids."""
    out = slug_dir(slug)
    try:
        t = load_transcript(out / "transcript.json")
        m = load_minutes(out / "minutes.json")
        validate_minutes(t, m)
    except FileNotFoundError as e:
        typer.secho(str(e), fg=typer.colors.RED, err=True)
        raise typer.Exit(1) from e
    except ValidationError as e:
        typer.secho("Validation failed:", fg=typer.colors.RED, err=True)
        for line in e.errors:
            typer.echo(f"  - {line}", err=True)
        raise typer.Exit(1) from e
    typer.echo(f"OK validate -> {out / 'minutes.json'}")


@app.command()
def render(
    slug: str = typer.Argument(...),
    open_browser: bool = typer.Option(False, "--open"),
) -> None:
    """Render out/<slug>/index.html."""
    from demo_kit.render import render as do_render

    out = slug_dir(slug)
    try:
        validate_minutes(
            load_transcript(out / "transcript.json"),
            load_minutes(out / "minutes.json"),
        )
        path = do_render(slug)
    except FileNotFoundError as e:
        typer.secho(str(e), fg=typer.colors.RED, err=True)
        raise typer.Exit(1) from e
    except ValidationError as e:
        typer.secho("Validation failed:", fg=typer.colors.RED, err=True)
        for line in e.errors:
            typer.echo(f"  - {line}", err=True)
        raise typer.Exit(1) from e
    typer.echo(f"OK render -> {path}")
    if open_browser:
        import webbrowser

        webbrowser.open(path.resolve().as_uri())


@app.command("all")
def run_all(
    source: Path | None = typer.Argument(
        None,
        help="Audio file; omit with --transcribe-mode fixture",
    ),
    transcribe_mode: str = typer.Option("fixture", "--transcribe-mode"),
    minutes_mode: str = typer.Option("fixture", "--minutes-mode"),
    slug: str | None = typer.Option(None, "--slug"),
    fixture: str = typer.Option("sample", "--fixture"),
    open_browser: bool = typer.Option(False, "--open"),
) -> None:
    """transcribe -> minutes -> validate -> render."""
    from demo_kit.minutes import run_minutes
    from demo_kit.render import render as do_render
    from demo_kit.transcribe import run_transcribe

    s = _default_slug(source, slug)
    run_transcribe(source, slug=s, mode=transcribe_mode, fixture_name=fixture)
    result = run_minutes(s, mode=minutes_mode, fixture_name=fixture)
    if result.name == "minutes_request.md":
        typer.echo(
            f"Stopped after manual request -> {result}\n"
            "Add minutes.json, then: uv run demo validate && uv run demo render"
        )
        raise typer.Exit(0)
    out = ensure_out(s)
    validate_minutes(
        load_transcript(out / "transcript.json"),
        load_minutes(out / "minutes.json"),
    )
    path = do_render(s)
    typer.echo(f"OK all -> {path}")
    if open_browser:
        import webbrowser

        webbrowser.open(path.resolve().as_uri())


if __name__ == "__main__":
    app()
