from __future__ import annotations

import json
from pathlib import Path

from demo_kit.models import Minutes, Participant, Transcript
from demo_kit.paths import ensure_out
from demo_kit.validate import load_minutes, load_transcript, point_start_ms

UI = {
    "uk": {
        "transcript": "Стенограма",
        "minutes": "Протокол",
        "summary": "Коротко",
        "decisions": "Рішення",
        "agreements": "Домовленості",
        "tasks": "Задачі",
        "deadlines": "Строки й факти",
        "open": "Відкрите",
        "rename": "Перейменувати спікерів",
        "tab_text": "Текст",
        "tab_minutes": "Протокол",
        "duration": "Тривалість",
        "recorded": "Запис",
    },
    "en": {
        "transcript": "Transcript",
        "minutes": "Minutes",
        "summary": "Summary",
        "decisions": "Decisions",
        "agreements": "Agreements",
        "tasks": "Tasks",
        "deadlines": "Deadlines & facts",
        "open": "Open questions",
        "rename": "Rename speakers",
        "tab_text": "Text",
        "tab_minutes": "Minutes",
        "duration": "Duration",
        "recorded": "Recorded",
    },
}

SPEAKER_TONES = ["ochre", "teal", "plum", "olive", "slate", "rust"]


def render(slug: str) -> Path:
    out = ensure_out(slug)
    transcript = load_transcript(out / "transcript.json")
    minutes = load_minutes(out / "minutes.json")
    audio_name = _pick_audio(out)
    html = build_html(transcript, minutes, audio_name=audio_name, slug=slug)
    dest = out / "index.html"
    dest.write_text(html, encoding="utf-8")
    return dest


def _pick_audio(out: Path) -> str:
    for name in ("audio.m4a", "audio.wav", "audio.mp3"):
        if (out / name).is_file():
            return name
    return ""


def _speaker_defaults(
    speaker_ids: list[str],
    participants: list[Participant],
    party_label: dict[str, str],
) -> dict[str, str]:
    by_id = {p.speaker: p for p in participants}
    out: dict[str, str] = {}
    for sid in speaker_ids:
        p = by_id.get(sid)
        if not p:
            out[sid] = sid
            continue
        name = p.suggested_name or p.suggested_role or sid
        party = party_label.get(p.party_id or "", "")
        out[sid] = f"{name} · {party}" if party else name
    return out


def _json_for_script(obj: object) -> str:
    """S2: prevent </script> / <!-- breakout from JSON in a script tag."""
    raw = json.dumps(obj, ensure_ascii=False)
    return raw.replace("</", "<\\/").replace("<!--", "<\\!--")


def build_html(
    transcript: Transcript,
    minutes: Minutes,
    *,
    audio_name: str,
    slug: str,
) -> str:
    lang = (
        minutes.language
        if minutes.language in UI
        else ("uk" if transcript.language.startswith("uk") else "en")
    )
    ui = UI[lang]
    speaker_ids = [s.id for s in transcript.speakers] or sorted(
        {seg.speaker for seg in transcript.segments}
    )
    tone_map = {sid: SPEAKER_TONES[i % len(SPEAKER_TONES)] for i, sid in enumerate(speaker_ids)}
    party_label = {p.id: p.label for p in minutes.parties}
    defaults = _speaker_defaults(speaker_ids, minutes.participants, party_label)

    def fmt_ms(ms: int) -> str:
        m, s = divmod(ms // 1000, 60)
        h, m = divmod(m, 60)
        if h:
            return f"{h}:{m:02d}:{s:02d}"
        return f"{m:02d}:{s:02d}"

    def item_html(text: str, segment_ids: list[str], extra: str = "") -> str:
        start = point_start_ms(transcript, segment_ids)
        first = segment_ids[0]
        return (
            f'<button type="button" class="item" data-seek-ms="{start}" '
            f'data-seg="{_esc(first)}" data-segs="{",".join(segment_ids)}">'
            f'<span class="item__text">{_esc(text)}{extra}</span>'
            f'<span class="stamp">{fmt_ms(start)}</span>'
            f"</button>"
        )

    sections: list[str] = []
    if minutes.summary:
        sections.append(
            _group(ui["summary"], [item_html(p.text, p.segment_ids) for p in minutes.summary])
        )
    if minutes.decisions:
        sections.append(
            _group(
                ui["decisions"],
                [item_html(p.text, p.segment_ids) for p in minutes.decisions],
            )
        )
    by_party: dict[str, list[str]] = {}
    for a in minutes.agreements:
        by_party.setdefault(a.party_id, []).append(item_html(a.text, a.segment_ids))
    for t in minutes.tasks:
        due = f" · {_esc(t.due_text)}" if t.due_text else ""
        by_party.setdefault(t.party_id, []).append(item_html(t.text, t.segment_ids, extra=due))
    for pid, items in by_party.items():
        label = party_label.get(pid, pid)
        sections.append(_group(f"{ui['agreements']} — {label}", items))
    if minutes.deadlines_and_facts:
        sections.append(
            _group(
                ui["deadlines"],
                [item_html(p.text, p.segment_ids) for p in minutes.deadlines_and_facts],
            )
        )
    if minutes.open_questions:
        sections.append(
            _group(
                ui["open"],
                [item_html(p.text, p.segment_ids) for p in minutes.open_questions],
            )
        )

    lines_html: list[str] = []
    for seg in transcript.segments:
        tone = tone_map.get(seg.speaker, "slate")
        if seg.words:
            words = "".join(
                f'<span class="w" data-s="{w.s}" data-e="{w.e}">{_esc(w.w)} </span>'
                for w in seg.words
            )
        else:
            words = _esc(seg.text)
        label = defaults.get(seg.speaker, seg.speaker)
        lines_html.append(
            f'<button type="button" class="line" data-seg="{_esc(seg.id)}" '
            f'data-seek-ms="{seg.start_ms}" data-speaker="{_esc(seg.speaker)}">'
            f'<span class="mark tone-{tone}" aria-hidden="true"></span>'
            f'<span class="meta"><span class="spk" data-spk="{_esc(seg.speaker)}">'
            f"{_esc(label)}</span>"
            f'<span class="stamp">{fmt_ms(seg.start_ms)}</span></span>'
            f'<span class="text">{words}</span></button>'
        )

    rename_rows = "".join(
        f'<label class="rename__row"><code>{_esc(sid)}</code>'
        f'<input data-rename="{_esc(sid)}" '
        f'placeholder="{_esc(defaults.get(sid, sid))}" /></label>'
        for sid in speaker_ids
    )

    recorded = transcript.recorded_at or ""
    meta_bits = [f"{ui['duration']} {fmt_ms(transcript.duration_ms)}"]
    if recorded:
        meta_bits.append(f"{ui['recorded']} {_esc(recorded)}")
    header_meta = " · ".join(meta_bits)

    payload = {
        "durationMs": transcript.duration_ms,
        "slug": slug,
        "speakers": speaker_ids,
        "defaults": defaults,
    }

    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>{_esc(minutes.title)} · Dictably demo</title>
<style>
:root {{
  --paper:#f6f4ef; --ink:#1b1a17; --muted:#6b675f; --rule:#e2ded5;
  --accent:#e4472b; --accent-text:#b93820;
  --ochre:#b8842a; --teal:#2f6f6a; --plum:#7a4e6e;
  --olive:#5f6b3a; --slate:#5a6570; --rust:#a24f2f;
  --serif:Georgia,"Times New Roman",serif;
  --sans:system-ui,-apple-system,"Segoe UI",sans-serif;
  --mono:ui-monospace,"Cascadia Code",monospace;
}}
@media (prefers-color-scheme: dark) {{
  :root {{
    --paper:#121211; --ink:#eceae4; --muted:#9a968d; --rule:#2a2926;
    --accent-text:#f07860;
  }}
}}
* {{ box-sizing:border-box; }}
body {{
  margin:0; background:var(--paper); color:var(--ink);
  font:15px/1.5 var(--sans); -webkit-font-smoothing:antialiased;
}}
header {{
  display:flex; flex-wrap:wrap; gap:.75rem; align-items:baseline;
  justify-content:space-between; padding:1rem 1.25rem;
  border-bottom:1px solid var(--rule);
}}
header h1 {{
  margin:0; font:600 1.35rem/1.2 var(--serif); letter-spacing:-.02em;
}}
.header__meta {{ font:600 12px/1.3 var(--mono); color:var(--muted); }}
.shell {{ width:min(1100px,100%); margin:0 auto; padding:0 1rem 5.5rem; }}
.tabs {{ display:flex; gap:.5rem; padding: .75rem 0; }}
.tabs button {{
  min-height:44px; padding:.4rem .9rem; border:1px solid var(--rule);
  background:transparent; color:var(--ink); border-radius:4px; cursor:pointer;
  font:550 13px/1 var(--sans);
}}
.tabs button.is-on {{ border-color:var(--accent); color:var(--accent-text); }}
@media (min-width:860px) {{ .tabs {{ display:none; }} }}
.layout {{
  display:grid; gap:0; border:1px solid var(--rule); border-radius:4px;
  background:var(--paper); overflow:hidden;
}}
@media (min-width:860px) {{
  .layout {{ grid-template-columns:1.2fr .8fr; }}
  .panel--minutes {{ border-left:1px solid var(--rule); }}
}}
.panel__head {{
  display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between;
  gap:.5rem; padding:.55rem .85rem; border-bottom:1px solid var(--rule);
}}
.panel__title {{
  margin:0;
  font:550 11px/1 var(--sans); letter-spacing:.04em; text-transform:uppercase;
  color:var(--muted);
}}
.rename {{ position:relative; }}
.rename > summary {{
  cursor:pointer; list-style:none; font-size:12px; color:var(--muted);
  min-height:32px; display:inline-flex; align-items:center;
}}
.rename > summary::-webkit-details-marker {{ display:none; }}
.rename__panel {{
  position:absolute; right:0; top:100%; z-index:5; min-width:14rem;
  margin-top:.25rem; padding:.55rem; border:1px solid var(--rule);
  border-radius:4px; background:var(--paper); display:grid; gap:.4rem;
}}
.rename__row {{
  display:flex; flex-wrap:wrap; gap:.4rem; align-items:center;
  font-size:12px; color:var(--muted);
}}
.rename input {{
  min-height:36px; border:1px solid var(--rule); border-radius:4px;
  background:var(--paper); color:var(--ink); padding:.3rem .45rem;
  font:inherit; min-width:8rem; flex:1;
}}
.scroll {{ max-height:min(62vh,560px); overflow:auto; padding:.35rem 0; }}
.line {{
  width:100%; display:grid; grid-template-columns:4px 1fr; column-gap:.65rem;
  row-gap:.1rem; text-align:left; border:0; background:transparent; color:inherit;
  padding:.55rem .85rem; cursor:pointer; font:inherit;
}}
.line.is-active {{ background:color-mix(in srgb, var(--accent) 8%, transparent); }}
.mark {{ grid-row:1 / span 2; width:3px; border-radius:1px; margin-top:.2rem; }}
.tone-ochre {{ background:var(--ochre); }} .tone-teal {{ background:var(--teal); }}
.tone-plum {{ background:var(--plum); }} .tone-olive {{ background:var(--olive); }}
.tone-slate {{ background:var(--slate); }} .tone-rust {{ background:var(--rust); }}
.meta {{ display:flex; justify-content:space-between; gap:.5rem; font-size:11px; color:var(--muted); }}
.spk {{ font-weight:550; }}
.text {{ grid-column:2; font:400 17px/1.5 var(--serif); }}
.w.is-on {{ background:color-mix(in srgb, var(--accent) 12%, transparent); }}
.group {{ padding:.35rem .85rem .75rem; }}
.group h3 {{ margin:0 0 .4rem; font:600 15px/1.3 var(--serif); }}
.item {{
  width:100%; display:grid; grid-template-columns:1fr auto; gap:.5rem;
  text-align:left; border:0; background:transparent; color:inherit;
  padding:.45rem .2rem; border-radius:2px; cursor:pointer; font:inherit;
}}
.item:hover {{ background:color-mix(in srgb, var(--ink) 4%, transparent); }}
.item__text {{ font-size:13px; line-height:1.45; }}
.stamp {{
  font:600 12px/1 var(--mono); color:var(--accent-text);
  font-variant-numeric:tabular-nums; white-space:nowrap;
}}
.player {{
  position:fixed; left:0; right:0; bottom:0; z-index:20;
  border-top:1px solid var(--rule); background:var(--paper);
  padding:.55rem 1rem; display:flex; gap:.75rem; align-items:center;
}}
.player audio {{ flex:1; min-width:0; height:36px; }}
.time {{ font:600 12px/1 var(--mono); color:var(--muted); min-width:5.5rem; }}
@media (max-width:859px) {{
  .panel.is-hide {{ display:none; }}
}}
:focus-visible {{ outline:2px solid var(--accent); outline-offset:2px; }}
</style>
</head>
<body>
<header>
  <h1>{_esc(minutes.title)}</h1>
  <span class="header__meta">{header_meta}</span>
</header>
<main class="shell">
  <div class="tabs" role="tablist">
    <button type="button" class="is-on" data-tab="transcript">{ui["tab_text"]}</button>
    <button type="button" data-tab="minutes">{ui["tab_minutes"]}</button>
  </div>
  <div class="layout">
    <section class="panel panel--transcript" data-panel="transcript">
      <div class="panel__head">
        <h2 class="panel__title">{ui["transcript"]}</h2>
        <details class="rename">
          <summary>{ui["rename"]}</summary>
          <div class="rename__panel">{rename_rows}</div>
        </details>
      </div>
      <div class="scroll" id="transcript">{"".join(lines_html)}</div>
    </section>
    <section class="panel panel--minutes" data-panel="minutes">
      <div class="panel__head">
        <h2 class="panel__title">{ui["minutes"]}</h2>
      </div>
      <div class="scroll" id="minutes">{"".join(sections)}</div>
    </section>
  </div>
</main>
<div class="player">
  <span class="time" id="clock">00:00</span>
  <audio id="audio" controls preload="metadata"{f' src="{_esc(audio_name)}"' if audio_name else ""}></audio>
</div>
<script type="application/json" id="payload">{_json_for_script(payload)}</script>
<script>
(function () {{
  const payload = JSON.parse(document.getElementById("payload").textContent);
  const audio = document.getElementById("audio");
  const clock = document.getElementById("clock");
  const key = "dictably-demo-speakers:" + payload.slug;
  const custom = JSON.parse(localStorage.getItem(key) || "{{}}");
  const defaults = payload.defaults || {{}};

  function labelFor(id) {{
    return custom[id] || defaults[id] || id;
  }}

  function fmt(ms) {{
    const t = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(t / 60)).padStart(2, "0");
    const s = String(t % 60).padStart(2, "0");
    return m + ":" + s;
  }}

  function applyNames() {{
    document.querySelectorAll("[data-spk]").forEach((el) => {{
      el.textContent = labelFor(el.getAttribute("data-spk"));
    }});
    document.querySelectorAll("[data-rename]").forEach((input) => {{
      const id = input.getAttribute("data-rename");
      input.value = custom[id] || "";
      input.placeholder = defaults[id] || id;
    }});
  }}
  applyNames();
  document.querySelectorAll("[data-rename]").forEach((input) => {{
    input.addEventListener("change", () => {{
      const id = input.getAttribute("data-rename");
      const v = input.value.trim();
      if (v) custom[id] = v; else delete custom[id];
      localStorage.setItem(key, JSON.stringify(custom));
      applyNames();
    }});
  }});

  function switchTab(which) {{
    document.querySelectorAll("[data-tab]").forEach((t) => {{
      t.classList.toggle("is-on", t.getAttribute("data-tab") === which);
    }});
    document.querySelectorAll("[data-panel]").forEach((p) => {{
      p.classList.toggle("is-hide", p.getAttribute("data-panel") !== which);
    }});
  }}

  function seekMs(ms) {{
    if (!audio.getAttribute("src") && !audio.src) return;
    audio.currentTime = Math.min(
      Math.max(0, ms / 1000),
      Number.isFinite(audio.duration) ? audio.duration : ms / 1000
    );
    audio.play().catch(() => {{}});
  }}

  function showEvidence(ms, segId) {{
    const mobile = matchMedia("(max-width:859px)").matches;
    if (mobile) switchTab("transcript");
    seekMs(ms);
    const line = segId
      ? document.querySelector('.line[data-seg="' + segId + '"]')
      : null;
    if (line) {{
      document.querySelectorAll(".line.is-active").forEach((el) => el.classList.remove("is-active"));
      line.classList.add("is-active");
      requestAnimationFrame(() => {{
        line.scrollIntoView({{ block: "center", behavior: "smooth" }});
      }});
    }}
  }}

  document.addEventListener("click", (e) => {{
    const item = e.target.closest(".item[data-seek-ms]");
    if (item) {{
      showEvidence(
        Number(item.getAttribute("data-seek-ms")),
        item.getAttribute("data-seg")
      );
      return;
    }}
    const line = e.target.closest(".line[data-seek-ms]");
    if (line) {{
      seekMs(Number(line.getAttribute("data-seek-ms")));
    }}
  }});

  document.querySelectorAll("[data-tab]").forEach((tab) => {{
    tab.addEventListener("click", () => switchTab(tab.getAttribute("data-tab")));
  }});
  if (matchMedia("(max-width:859px)").matches) {{
    document.querySelector('[data-panel="minutes"]').classList.add("is-hide");
  }}

  function tick() {{
    const ms = (audio.currentTime || 0) * 1000;
    clock.textContent = fmt(ms);
    let active = null;
    document.querySelectorAll(".line").forEach((line) => {{
      const start = Number(line.getAttribute("data-seek-ms"));
      const next = line.nextElementSibling;
      const end = next ? Number(next.getAttribute("data-seek-ms")) : payload.durationMs;
      const on = ms >= start && ms < end;
      line.classList.toggle("is-active", on);
      if (on) active = line;
      line.querySelectorAll(".w").forEach((w) => {{
        const s = Number(w.getAttribute("data-s"));
        const e = Number(w.getAttribute("data-e"));
        w.classList.toggle("is-on", ms >= s && ms < e);
      }});
    }});
    if (active) active.scrollIntoView({{ block: "nearest" }});
  }}
  audio.addEventListener("timeupdate", tick);
  audio.addEventListener("seeked", tick);

  document.addEventListener("keydown", (e) => {{
    if (e.target.matches("input,textarea,summary")) return;
    if (e.code === "Space") {{ e.preventDefault(); audio.paused ? audio.play() : audio.pause(); }}
    if (e.key === "j" || e.key === "J") audio.currentTime = Math.max(0, audio.currentTime - 5);
    if (e.key === "l" || e.key === "L") audio.currentTime = audio.currentTime + 5;
    if (e.key === "k" || e.key === "K") audio.pause();
  }});
}})();
</script>
</body>
</html>
"""


def _group(title: str, items: list[str]) -> str:
    return f'<div class="group"><h3>{_esc(title)}</h3>{"".join(items)}</div>'


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
