import type { InputHTMLAttributes, ReactNode } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  help?: string;
  error?: string;
};

export function Input({
  label,
  help,
  error,
  id,
  className = "",
  ...rest
}: InputProps) {
  const fieldId = id ?? rest.name;
  const helpText = error || help;
  return (
    <label className={`dy-field${error ? " is-error" : ""}`}>
      {label ? (
        <span className="dy-field__label" id={fieldId ? `${fieldId}-label` : undefined}>
          {label}
        </span>
      ) : null}
      <input
        id={fieldId}
        className={`dy-input ${className}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={helpText && fieldId ? `${fieldId}-help` : undefined}
        {...rest}
      />
      {helpText ? (
        <span className="dy-field__help" id={fieldId ? `${fieldId}-help` : undefined}>
          {helpText}
        </span>
      ) : null}
    </label>
  );
}

export function FieldHelp({ children }: { children: ReactNode }) {
  return <span className="dy-field__help">{children}</span>;
}
