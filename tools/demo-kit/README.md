# Dictably demo-kit (T-000b)

Turn a meeting recording into an offline HTML page: speaker transcript + clickable minutes.

Spec: [`docs/t000/DEMO-KIT.md`](../../docs/t000/DEMO-KIT.md).

## Setup

```bash
cd tools/demo-kit
uv sync
```

Optional providers:

```bash
uv sync --extra anthropic   # --minutes-mode anthropic
uv sync --extra local       # --transcribe-mode local (NOT for demos — no diarization)
```

Copy `.env.example` → `.env` when you have keys. **Defaults need no keys.**

`ffmpeg` on PATH is required only for real `assemblyai` / `local` transcribe (converts to mono m4a 64 kbps).

### Owner: AssemblyAI privacy (required before real recordings)

In the AssemblyAI account, confirm data-use / model-training opt-out so uploaded audio is not used to train models. The kit also **deletes** each transcript via `DELETE /v2/transcript/{id}` after a successful run (failure to delete is a warning, not a hard error).

## Commands

```bash
# For demos / real meetings with speakers: use assemblyai (not local)
uv run demo transcribe [file] --mode fixture|assemblyai|local
uv run demo minutes <slug> --mode manual|anthropic|fixture
uv run demo validate <slug>
uv run demo render <slug> [--open]
uv run demo all [file] --transcribe-mode fixture --minutes-mode fixture [--open]
```

`local` = faster-whisper `large-v3-turbo` only — **all speech becomes speaker A** (no diarization). Prefer `assemblyai` for demos.

### No-keys happy path

```bash
uv run demo all --transcribe-mode fixture --minutes-mode fixture --open
```

Writes `out/sample/index.html` (+ silent `audio.wav` for the full transcript duration at 8 kHz / 8-bit).

### Manual minutes (Claude in Claude Code)

```bash
uv run demo transcribe recording.m4a --mode assemblyai --slug call-1
uv run demo minutes call-1 --mode manual
# -> out/call-1/minutes_request.md  — Claude writes minutes.json beside it
uv run demo validate call-1
uv run demo render call-1 --open
```

## Layout

| Path | Role |
|------|------|
| `fixtures/sample/` | Checked-in transcript + minutes |
| `out/<slug>/` | Generated (gitignored): audio, JSON, `index.html` |
| `src/demo_kit/` | CLI + pipeline |

## Tests

```bash
uv run pytest
```
