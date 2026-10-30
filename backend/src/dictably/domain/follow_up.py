"""Draft follow-up email from stored minutes (T-028) — no ASR/LLM call."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from dictably.db.models import Media, Speaker
from dictably.domain.minutes_schema import Minutes
from dictably.domain.minutes_templates import TEMPLATE_OFFICIAL, group_by_agenda, normalize_template

# Include in letter body.
_INCLUDE = frozenset({None, "agreed"})
# Soft / unclear → open questions (not as agreements).
_TO_OPEN = frozenset({"proposed", "tentative"})
# Never send to counterparties.
_EXCLUDE = frozenset({"rejected", "changed_later"})

_STANDARD_OUR = frozenset(
    {
        "our",
        "our side",
        "us",
        "наші",
        "наша",
        "наша сторона",
    }
)
_STANDARD_THEIR = frozenset(
    {
        "their",
        "their side",
        "them",
        "їхні",
        "їхня",
        "їхня сторона",
    }
)


@dataclass(frozen=True)
class FollowUpEmail:
    subject: str
    body: str
    language: str
    weak_skipped: int = 0
    weak_texts: tuple[str, ...] = field(default_factory=tuple)


_COPY: dict[str, dict[str, str]] = {
    "en": {
        "subject": "Follow-up: {title}",
        "thanks": "Thank you for the meeting.",
        "summary": "Summary",
        "agreements": "Agreements — {label}",
        "our_side": "On our side",
        "your_side": "On your side",
        "tasks": "Action items",
        "decisions": "Decisions",
        "heard": "Discussed",
        "open": "Open questions",
        "other": "Other",
        "due": "due {due}",
        "owner": "({owner})",
        "closing": "Best regards",
    },
    "uk": {
        "subject": "Підсумок: {title}",
        "thanks": "Дякую за зустріч.",
        "summary": "Коротко",
        "agreements": "Домовленості — {label}",
        "our_side": "З нашого боку",
        "your_side": "З вашого боку",
        "tasks": "Задачі",
        "decisions": "Рішення",
        "heard": "Слухали",
        "open": "Відкриті питання",
        "other": "Інше",
        "due": "строк {due}",
        "owner": "({owner})",
        "closing": "З повагою",
    },
}


def _ui_lang(raw: str | None) -> str:
    code = (raw or "en").lower().replace("_", "-")
    if code.startswith("uk"):
        return "uk"
    return "en"


def _speaker_name(speakers: list[Speaker], label: str | None) -> str | None:
    if not label:
        return None
    for sp in speakers:
        if sp.label == label:
            name = (sp.display_name or "").strip()
            return name or sp.label
    return label


def _line_item(
    text: str,
    *,
    owner: str | None = None,
    due: str | None = None,
    copy: dict[str, str],
) -> str:
    bits = [text.strip()]
    if owner:
        bits.append(copy["owner"].format(owner=owner))
    if due:
        bits.append(copy["due"].format(due=due))
    return "- " + " ".join(bits)


def _item_text(item: Any) -> str:
    return (getattr(item, "text", None) or "").strip()


def _status(item: Any) -> str | None:
    raw = getattr(item, "status", None)
    return raw if raw else None


def _verify(item: Any) -> str | None:
    return getattr(item, "verify", None)


def _party_display(party_id: str, label: str, copy: dict[str, str]) -> str:
    """B3: generic our/their → 'On our/your side'; custom company names kept."""
    pid = (party_id or "").strip().lower()
    lab = (label or "").strip()
    lab_key = lab.lower()
    if pid == "our" and (not lab or lab_key in _STANDARD_OUR or lab_key == "our"):
        return copy["our_side"]
    if pid == "their" and (not lab or lab_key in _STANDARD_THEIR or lab_key == "their"):
        return copy["your_side"]
    return lab or party_id


def _classify(
    items: list[Any],
) -> tuple[list[Any], list[Any], list[str]]:
    """Return (include, to_open, weak_texts). Rejected/changed_later dropped."""
    include: list[Any] = []
    to_open: list[Any] = []
    weak: list[str] = []
    for item in items:
        if not _item_text(item):
            continue
        st = _status(item)
        if st in _EXCLUDE:
            continue
        if _verify(item) == "weak":
            weak.append(_item_text(item))
            continue
        if st in _TO_OPEN:
            to_open.append(item)
            continue
        if st in _INCLUDE:
            include.append(item)
            continue
        # Unknown status — treat as include only if agreed-like; else skip.
        include.append(item)
    return include, to_open, weak


def draft_follow_up_email(
    *,
    media: Media,
    minutes: Minutes,
    speakers: list[Speaker],
) -> FollowUpEmail:
    """Build subject+body only from minutes fields (no invented points)."""
    lang = _ui_lang(minutes.language or media.language)
    copy = _COPY[lang]
    title = (minutes.title or "").strip() or (media.filename or "Meeting").rsplit(".", 1)[0]
    subject = copy["subject"].format(title=title)
    tid = normalize_template(getattr(minutes, "template", None))

    weak_all: list[str] = []
    open_extra: list[Any] = []

    lines: list[str] = [copy["thanks"], ""]

    if tid == TEMPLATE_OFFICIAL:
        # S1: agenda-grouped decisions & tasks (not empty Summary).
        buckets = group_by_agenda(minutes)
        for n, bucket in enumerate(buckets, start=1):
            if bucket.agenda is not None:
                heading = f"{n}. {_item_text(bucket.agenda) or copy['other']}"
            else:
                heading = copy["other"]
            dec, dec_open, dec_weak = _classify(list(bucket.decisions))
            tasks, task_open, task_weak = _classify(list(bucket.tasks))
            # Heard is context for protocol; include only agreed/null, skip weak.
            heard, heard_open, heard_weak = _classify(list(bucket.heard))
            weak_all.extend(dec_weak + task_weak + heard_weak)
            open_extra.extend(dec_open + task_open + heard_open)
            if not (dec or tasks or heard):
                continue
            lines.append(heading)
            if heard:
                lines.append(copy["heard"])
                for h in heard:
                    lines.append(_line_item(_item_text(h), copy=copy))
            if dec:
                lines.append(copy["decisions"])
                for d in dec:
                    lines.append(_line_item(_item_text(d), copy=copy))
            if tasks:
                lines.append(copy["tasks"])
                for t in tasks:
                    owner = _speaker_name(speakers, getattr(t, "owner_speaker", None))
                    due = getattr(t, "due_text", None)
                    lines.append(_line_item(_item_text(t), owner=owner, due=due, copy=copy))
            lines.append("")
    else:
        summary, sum_open, sum_weak = _classify(list(minutes.summary or []))
        weak_all.extend(sum_weak)
        open_extra.extend(sum_open)
        if summary:
            lines.append(copy["summary"])
            for p in summary:
                lines.append(_line_item(_item_text(p), copy=copy))
            lines.append("")

        party_label = {p.id: p.label for p in minutes.parties}
        agreements, agr_open, agr_weak = _classify(list(minutes.agreements or []))
        weak_all.extend(agr_weak)
        open_extra.extend(agr_open)
        by_party: dict[str, list[Any]] = {}
        for a in agreements:
            by_party.setdefault(a.party_id or "_", []).append(a)
        ordered = [p.id for p in minutes.parties]
        for pid in list(by_party):
            if pid not in ordered:
                ordered.append(pid)
        for pid in ordered:
            items = by_party.get(pid) or []
            if not items:
                continue
            raw_label = (party_label.get(pid) or pid).strip() or pid
            label = _party_display(pid, raw_label, copy)
            lines.append(copy["agreements"].format(label=label))
            for a in items:
                lines.append(_line_item(_item_text(a), copy=copy))
            lines.append("")

        decisions, dec_open, dec_weak = _classify(list(minutes.decisions or []))
        weak_all.extend(dec_weak)
        open_extra.extend(dec_open)
        if decisions:
            lines.append(copy["decisions"])
            for p in decisions:
                lines.append(_line_item(_item_text(p), copy=copy))
            lines.append("")

        tasks, task_open, task_weak = _classify(list(minutes.tasks or []))
        weak_all.extend(task_weak)
        open_extra.extend(task_open)
        if tasks:
            lines.append(copy["tasks"])
            for t in tasks:
                owner = _speaker_name(speakers, getattr(t, "owner_speaker", None))
                due = getattr(t, "due_text", None)
                lines.append(_line_item(_item_text(t), owner=owner, due=due, copy=copy))
            lines.append("")

    opens_src, _, open_weak = _classify(list(minutes.open_questions or []))
    weak_all.extend(open_weak)
    # Open questions themselves: include agreed/null; proposed already in opens_src
    # via _classify — rejected dropped; weak skipped.
    opens = list(opens_src) + list(open_extra)
    # Dedupe by text while preserving order.
    seen: set[str] = set()
    unique_opens: list[Any] = []
    for p in opens:
        t = _item_text(p)
        if t in seen:
            continue
        seen.add(t)
        unique_opens.append(p)
    if unique_opens:
        lines.append(copy["open"])
        for p in unique_opens:
            lines.append(_line_item(_item_text(p), copy=copy))
        lines.append("")

    # T-029 recording link — omit until share links exist.
    lines.append(copy["closing"])
    body = "\n".join(lines).rstrip() + "\n"
    # Dedupe weak texts
    weak_unique: list[str] = []
    weak_seen: set[str] = set()
    for w in weak_all:
        if w in weak_seen:
            continue
        weak_seen.add(w)
        weak_unique.append(w)
    return FollowUpEmail(
        subject=subject,
        body=body,
        language=lang,
        weak_skipped=len(weak_unique),
        weak_texts=tuple(weak_unique),
    )


def assert_body_subset_of_minutes(body: str, minutes: Minutes) -> list[str]:
    """Return bullet texts from body that are not present in minutes (for tests)."""
    allowed: set[str] = set()
    for key in (
        "summary",
        "decisions",
        "agreements",
        "tasks",
        "open_questions",
        "agenda",
        "heard",
        "deadlines_and_facts",
    ):
        for item in getattr(minutes, key, None) or []:
            text = (getattr(item, "text", None) or "").strip()
            if text:
                allowed.add(text)
    bad: list[str] = []
    for line in body.splitlines():
        raw = line.strip()
        if not raw.startswith("- "):
            continue
        core = raw[2:].strip()
        if not any(core == a or core.startswith(a + " ") for a in allowed):
            bad.append(core)
    return bad
