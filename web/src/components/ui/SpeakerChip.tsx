export function SpeakerChip({
  name,
  role,
  colorIdx = 0,
  editable = false,
}: {
  name: string;
  role?: string;
  colorIdx?: number;
  editable?: boolean;
}) {
  const sp = ((colorIdx % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
  return (
    <span className={`dy-speaker${editable ? " dy-speaker--edit" : ""}`}>
      <span className={`dy-speaker__dot sp-${sp}`} aria-hidden />
      {name}
      {role ? <span className="dy-speaker__role">{role}</span> : null}
    </span>
  );
}
