"use client";

import { useRef, useState } from "react";

type AutoSubmitProofInputsProps = {
  fileName?: string;
  urlName?: string;
};

const inputStyle = {
  minHeight: 38,
  borderRadius: 14,
  border: "1px solid #cfd9e8",
  padding: "8px 12px",
  width: "100%",
  boxSizing: "border-box",
  background: "#fff",
  fontSize: 12
} as const;

function submitClosestForm(input: HTMLInputElement, message: string) {
  const form = input.form;
  if (!form) return;
  window.dispatchEvent(new CustomEvent("pm:loading", { detail: { message } }));
  form.requestSubmit();
}

export function AutoSubmitProofInputs({ fileName = "proofFile", urlName = "imageUrl" }: AutoSubmitProofInputsProps) {
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState("Select a file and it will upload into this proof page automatically.");

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        name={fileName}
        type="file"
        accept="image/*,.pdf"
        style={inputStyle}
        onChange={(event) => {
          const input = event.currentTarget;
          if (!input.files || input.files.length === 0) return;
          setStatus("Uploading proof artwork…");
          submitClosestForm(input, "Uploading proof artwork…");
        }}
      />
      <input
        name={urlName}
        placeholder="Or paste proof image URL"
        style={inputStyle}
        onPaste={(event) => {
          const input = event.currentTarget;
          if (urlTimer.current) clearTimeout(urlTimer.current);
          urlTimer.current = setTimeout(() => {
            if (!input.value.trim()) return;
            setStatus("Loading proof artwork URL…");
            submitClosestForm(input, "Loading proof artwork URL…");
          }, 120);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          const input = event.currentTarget;
          if (!input.value.trim()) return;
          setStatus("Loading proof artwork URL…");
          submitClosestForm(input, "Loading proof artwork URL…");
        }}
      />
      <span style={{ color: "#64748b", fontSize: 11, lineHeight: 1.35 }}>{status}</span>
    </div>
  );
}
