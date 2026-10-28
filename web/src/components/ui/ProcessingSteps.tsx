export type StepState = "done" | "current" | "todo";

export function ProcessingSteps({
  steps,
}: {
  steps: { id: string; label: string; state: StepState }[];
}) {
  return (
    <ol className="dy-steps">
      {steps.map((step) => (
        <li
          key={step.id}
          className={`dy-step${step.state === "done" ? " is-done" : ""}${
            step.state === "current" ? " is-current" : ""
          }`}
        >
          <span className="dy-step__icon" aria-hidden>
            {step.state === "done" ? "✓" : step.state === "current" ? "·" : ""}
          </span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}
