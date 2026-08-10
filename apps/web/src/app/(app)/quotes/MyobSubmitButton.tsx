"use client";

import { useFormStatus } from "react-dom";

type Props = {
  label: string;
  pendingLabel: string;
  background: string;
  name?: string;
  value?: string;
  disabled?: boolean;
};

export function MyobSubmitButton({ label, pendingLabel, background, name, value, disabled = false }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={disabled || pending}
      aria-busy={pending}
      style={{
        minHeight: 44,
        borderRadius: 14,
        border: "none",
        background: pending ? "#94a3b8" : background,
        color: "#fff",
        fontWeight: 950,
        cursor: disabled || pending ? "wait" : "pointer",
        padding: "0 16px",
        opacity: disabled ? 0.62 : 1
      }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
