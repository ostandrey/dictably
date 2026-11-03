"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/components/app/ToastProvider";
import { listMedia, listMediaStatus } from "@/lib/api";
import { mediaDisplayTitle } from "@/lib/mediaDisplay";

const ACTIVE = new Set([
  "uploaded",
  "queued",
  "processing",
  "transcribing",
  "analyzing",
]);

/**
 * App-wide “ready” toast + tab title (T-040 S2 / T-045 S7).
 * Visible: refresh watch list + poll 4s. Hidden: status-only poll 30s.
 */
export function ReadyNotify() {
  const t = useTranslations("app");
  const uiLocale = useLocale();
  const { push: pushToast } = useToast();
  const watched = useRef(new Set<string>());
  const notified = useRef(new Set<string>());
  const titles = useRef(new Map<string, string>());
  const baseTitle = useRef<string | null>(null);
  const titleOverride = useRef(false);
  const provisional = t("provisionalMeeting");
  const statusReady = t("statusReady");

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const restoreTitle = () => {
      if (!titleOverride.current) return;
      if (baseTitle.current != null) document.title = baseTitle.current;
      titleOverride.current = false;
    };

    const setReadyTitle = (label: string) => {
      if (!titleOverride.current) {
        baseTitle.current = document.title;
      }
      document.title = `✓ ${statusReady} — ${label}`;
      titleOverride.current = true;
    };

    const tick = async () => {
      const hidden = document.visibilityState === "hidden";
      try {
        if (!hidden) {
          const list = await listMedia({ limit: 40 });
          if (cancelled) return;
          for (const m of list.items) {
            if (ACTIVE.has(m.status)) {
              watched.current.add(m.id);
              const title =
                (m.title ?? "").trim() ||
                mediaDisplayTitle(m, uiLocale, provisional);
              titles.current.set(m.id, title);
            }
          }
        }
        const ids = [...watched.current].slice(0, 40);
        if (!ids.length) return;
        const statuses = await listMediaStatus(ids);
        if (cancelled || !statuses.length) return;
        for (const s of statuses) {
          if (s.status === "ready" && !notified.current.has(s.id)) {
            if (!watched.current.has(s.id)) continue;
            notified.current.add(s.id);
            watched.current.delete(s.id);
            const title = titles.current.get(s.id) ?? statusReady;
            titles.current.delete(s.id);
            setReadyTitle(title);
            pushToast(`${statusReady} — ${title}`);
          } else if (ACTIVE.has(s.status)) {
            /* keep watching */
          } else {
            watched.current.delete(s.id);
            titles.current.delete(s.id);
          }
        }
      } catch {
        /* ignore poll errors */
      }
    };

    const schedule = () => {
      if (timer != null) window.clearInterval(timer);
      const ms = document.visibilityState === "hidden" ? 30_000 : 4_000;
      timer = window.setInterval(() => {
        void tick();
      }, ms);
    };

    schedule();
    void tick();

    const onVis = () => {
      if (document.visibilityState === "visible") {
        restoreTitle();
        void tick();
      }
      schedule();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pushToast, provisional, statusReady, uiLocale, t]);

  return null;
}
