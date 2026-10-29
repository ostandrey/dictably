"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/app/AuthProvider";
import { stashFiles } from "@/lib/fileQueue";

type Props = {
  dropLabel: string;
  recordingsHref: string;
};

/** Full-screen drop target for any /app page while authenticated. */
export function AppDropOverlay({ dropLabel, recordingsHref }: Props) {
  const { status } = useAuth();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    if (status !== "authenticated") {
      depth.current = 0;
      return;
    }

    function hasFiles(e: DragEvent): boolean {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      return Array.from(types).includes("Files");
    }

    function onEnter(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setActive(true);
    }

    function onOver(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }

    function onLeave(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    }

    function onDrop(e: DragEvent) {
      e.preventDefault();
      depth.current = 0;
      setActive(false);
      if (!e.dataTransfer?.files?.length) return;
      const onHome =
        window.location.pathname === recordingsHref ||
        window.location.pathname === recordingsHref.replace(/\/+$/, "");
      if (onHome) {
        window.dispatchEvent(
          new CustomEvent("dictably:files", { detail: e.dataTransfer.files }),
        );
      } else {
        stashFiles(e.dataTransfer.files);
        router.push(recordingsHref);
      }
    }

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [recordingsHref, router, status]);

  if (status !== "authenticated" || !active) return null;

  return (
    <div className="app-drop-overlay" data-drop="overlay" aria-hidden>
      <div className="app-drop-overlay__card">
        <p className="app-drop-overlay__title">{dropLabel}</p>
      </div>
    </div>
  );
}
