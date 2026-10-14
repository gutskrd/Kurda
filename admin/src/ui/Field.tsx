/**
 * Form fields with their label, a hint and an error, wired together the way a
 * screen reader needs: the label names the control, the hint and the error
 * describe it, and an error marks it invalid. Pages used placeholders as
 * labels ("lesson id (uuid)"), which vanish as soon as you type and which most
 * screen readers do not announce as a name.
 */
import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** the label beside the control rather than above it */
  inline?: boolean;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}

/** Wraps one control: `<Field label="SKU" hint="…"><input … /></Field>`. */
export function Field({ label, hint, error, required, inline = false, className, children }: FieldProps): React.JSX.Element {
  const auto = useId();
  const id = (isValidElement(children) && typeof children.props.id === 'string' ? children.props.id : null) ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [children.props['aria-describedby'] as string | undefined, hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = cloneElement(children, {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : (children.props['aria-invalid'] as boolean | undefined),
    required: required ?? children.props.required,
  });
  return (
    <div className={`field${inline ? ' is-inline' : ''}${error ? ' has-error' : ''}${className ? ` ${className}` : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="field-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {control}
      {hint && (
        <div id={hintId} className="field-hint">
          {hint}
        </div>
      )}
      {error && (
        <div id={errorId} className="field-error">
          {error}
        </div>
      )}
    </div>
  );
}

type Common = { label: ReactNode; hint?: ReactNode; error?: ReactNode; fieldClassName?: string };

export function TextInput({ label, hint, error, fieldClassName, ...input }: Common & InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <Field label={label} hint={hint} error={error} required={input.required} className={fieldClassName}>
      <input {...input} />
    </Field>
  );
}

export function Select({
  label,
  hint,
  error,
  fieldClassName,
  options,
  ...select
}: Common &
  SelectHTMLAttributes<HTMLSelectElement> & {
    options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  }): React.JSX.Element {
  return (
    <Field label={label} hint={hint} error={error} required={select.required} className={fieldClassName}>
      <select {...select}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Textarea({ label, hint, error, fieldClassName, ...area }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return (
    <Field label={label} hint={hint} error={error} required={area.required} className={fieldClassName}>
      <textarea {...area} />
    </Field>
  );
}

/** A checkbox with its label beside it, the whole row a target. */
export function Checkbox({
  label,
  hint,
  checked,
  onChange,
  disabled,
  name,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
}): React.JSX.Element {
  const id = useId();
  return (
    <div className="check">
      <input
        id={id}
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="check-text">
        <label htmlFor={id}>{label}</label>
        {hint && (
          <div id={`${id}-hint`} className="field-hint">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

/** A row of fields that sit side by side on a wide screen and stack on a phone. */
export function FieldRow({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="field-row">{children}</div>;
}

/** A form's buttons: the main one last, on the right (first and full width on a phone). */
export function FormActions({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="form-actions">{children}</div>;
}
