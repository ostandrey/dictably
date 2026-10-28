"use client";

import type { DragEvent, ReactNode } from "react";
import { useState } from "react";

export function UploadZone({
  title,
  hint,
  busy = false,
  progress,
  onFiles,
  children,
}: {
  title: string;
  hint?: string;
  busy?: boolean;
  progress?: number;
  onFiles?: (files: FileList) => void;
  children?: ReactNode;
}) {
  const [drag, setDrag] = useState(false);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files?.length) onFiles?.(e.dataTransfer.files);
  }

  return (
    <div
      className={`dy-upload${drag ? " is-drag" : ""}${busy ? " is-busy" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <p className="dy-upload__title">{title}</p>
      {hint ? <p className="dy-upload__hint">{hint}</p> : null}
      {busy && progress != null ? (
        <div className="dy-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="dy-progress__fill" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {children}
    </div>
  );
}
