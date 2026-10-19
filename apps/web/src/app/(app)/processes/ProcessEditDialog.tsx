"use client";

import { useRef } from "react";
import type { CSSProperties } from "react";
import { updateProcessAction } from "./actions";
import styles from "./ProcessEditDialog.module.css";

type Option = { id: string; name: string; active: boolean };
type ProcessValue = {
  id: string;
  name: string;
  department: string;
  processType: string;
  machineIds: string[];
  labourOperationId: string | null;
};

const departments = [
  { value: "signage", label: "Signage" },
  { value: "small_format", label: "Small format" },
  { value: "plan_printing", label: "Plan printing" },
  { value: "displays", label: "Displays" },
  { value: "vehicle_graphics", label: "Vehicle graphics" },
  { value: "general", label: "General / service" }
];

const types = [
  { value: "print", label: "Printing" },
  { value: "laminate", label: "Laminating" },
  { value: "cut", label: "Cutting / trimming" },
  { value: "mount", label: "Mounting / application" },
  { value: "finish", label: "Finishing" },
  { value: "pack", label: "Packing" },
  { value: "install", label: "Installation" },
  { value: "other", label: "Other" }
];

export function ProcessEditDialog({
  row,
  labour,
  machines
}: {
  row: ProcessValue;
  labour: Option[];
  machines: Option[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function openDialog() {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }

  function discardAndClose() {
    formRef.current?.reset();
    dialogRef.current?.close();
  }

  return (
    <>
      <button type="button" style={secondaryButton} onClick={openDialog}>Edit</button>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        style={dialogStyle}
        onClose={() => formRef.current?.reset()}
        onClick={(event) => {
          if (event.target === dialogRef.current) discardAndClose();
        }}
      >
        <form ref={formRef} action={updateProcessAction} style={formStyle}>
          <input type="hidden" name="id" value={row.id} />

          <header style={dialogHeader}>
            <div style={{ minWidth: 0 }}>
              <div style={eyebrow}>Edit process</div>
              <h3 style={{ margin: "5px 0 0", fontSize: 23, overflowWrap: "anywhere" }}>{row.name}</h3>
            </div>
            <button
              type="button"
              aria-label="Close without saving"
              title="Close without saving"
              onClick={discardAndClose}
              style={closeButton}
            >
              ×
            </button>
          </header>

          <div style={dialogBody}>
            <div style={editGrid}>
              <label style={fieldLabel}>Process name<input name="name" defaultValue={row.name} required style={inputStyle} /></label>
              <label style={fieldLabel}>Work area<select name="department" defaultValue={row.department} style={inputStyle}>{departments.map((department) => <option key={department.value} value={department.value}>{department.label}</option>)}</select></label>
              <label style={fieldLabel}>Process category<select name="processType" defaultValue={row.processType} style={inputStyle}>{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
              <label style={fieldLabel}>Machine (optional)<select name="machineId" defaultValue={row.machineIds[0] ?? ""} style={inputStyle}><option value="">No machine needed</option>{machines.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " (archived)"}</option>)}</select></label>
              <label style={fieldLabel}>Shop operation<select name="labourOperationId" defaultValue={row.labourOperationId ?? ""} style={inputStyle}><option value="">No labour / consumable recipe</option>{labour.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " (archived)"}</option>)}</select></label>
            </div>
            <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>
              Simple finishing usually needs only a Shop Operation. Printers, cutters, CNCs and similar equipment can also link a Machine for run cost, wear, ink/bits and capacity.
            </div>
          </div>

          <footer style={dialogFooter}>
            <button type="button" onClick={discardAndClose} style={cancelButton}>Cancel</button>
            <button style={primaryButton}>Save changes</button>
          </footer>
        </form>
      </dialog>
    </>
  );
}

const eyebrow: CSSProperties = { fontSize: 12, fontWeight: 950, color: "#0f766e", textTransform: "uppercase", letterSpacing: ".07em" };
const secondaryButton: CSSProperties = { minHeight: 38, display: "grid", placeItems: "center", border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", color: "#334155", padding: "0 11px", fontWeight: 850, cursor: "pointer", font: "inherit" };
const primaryButton: CSSProperties = { minHeight: 44, border: 0, borderRadius: 10, background: "#0f766e", color: "#fff", fontWeight: 950, padding: "0 18px", cursor: "pointer", font: "inherit" };
const cancelButton: CSSProperties = { minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff", color: "#334155", fontWeight: 900, padding: "0 16px", cursor: "pointer", font: "inherit" };
const dialogStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "min(760px, calc(100vw - 32px))",
  maxWidth: "calc(100vw - 32px)",
  maxHeight: "calc(100dvh - 32px)",
  margin: "auto",
  padding: 0,
  border: "1px solid #cbd5e1",
  borderRadius: 16,
  background: "#fff",
  color: "#0f172a",
  boxShadow: "0 28px 90px rgba(15,23,42,.30)",
  overflow: "hidden"
};
const formStyle: CSSProperties = { display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - 32px)", minHeight: 0 };
const dialogHeader: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, padding: "20px 20px 14px", borderBottom: "1px solid #e2e8f0", flex: "0 0 auto" };
const dialogBody: CSSProperties = { display: "grid", gap: 16, padding: 20, overflowY: "auto", overscrollBehavior: "contain", minHeight: 0 };
const dialogFooter: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px 18px", borderTop: "1px solid #e2e8f0", background: "#fff", flex: "0 0 auto" };
const closeButton: CSSProperties = { width: 40, height: 40, flex: "0 0 40px", borderRadius: 999, border: "1px solid #cbd5e1", background: "#fff", color: "#475569", fontSize: 25, lineHeight: 1, display: "grid", placeItems: "center", cursor: "pointer", fontFamily: "inherit" };
const editGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 };
const fieldLabel: CSSProperties = { display: "grid", gap: 7, color: "#0f172a", fontWeight: 850 };
const inputStyle: CSSProperties = { width: "100%", minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 9, padding: "0 11px", font: "inherit", color: "#0f172a", background: "#fff" };
