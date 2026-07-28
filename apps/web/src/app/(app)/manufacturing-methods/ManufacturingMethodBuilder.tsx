"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import type { MaterialRecord } from "@/server/materials";
import type { ProcessRecord, RecipeRecord } from "@/server/productionResources";

type BuilderAction = (formData: FormData) => void | Promise<void>;

type Props = {
  action: BuilderAction;
  materials: MaterialRecord[];
  processes: ProcessRecord[];
  recipe?: RecipeRecord;
  mode?: "create" | "edit";
};

type StepNumber = 1 | 2 | 3 | 4;

const departmentOptions = [
  { value: "signage", label: "Signage", description: "Boards, roll media, vinyl and fabricated signs" },
  { value: "print", label: "Small format", description: "Business cards, flyers, books and paper products" },
  { value: "plans", label: "Plan printing", description: "Architectural plans and technical drawings" },
  { value: "display", label: "Displays & posters", description: "Posters, display graphics and presentation products" },
  { value: "vehicle", label: "Vehicle graphics", description: "Vehicle print, laminate, cut and installation" },
  { value: "general", label: "General / service", description: "Install-only, labour or shared production methods" }
] as const;

const panel: CSSProperties = {
  border: "1px solid #dbe4f0",
  borderRadius: 18,
  padding: 18,
  background: "#fff"
};

const input: CSSProperties = {
  width: "100%",
  minHeight: 46,
  border: "1px solid #cbd5e1",
  borderRadius: 11,
  padding: "0 12px",
  fontSize: 15,
  boxSizing: "border-box",
  background: "#fff"
};

const primaryButton: CSSProperties = {
  minHeight: 46,
  border: 0,
  borderRadius: 11,
  background: "#0f766e",
  color: "#fff",
  fontWeight: 900,
  padding: "0 20px",
  cursor: "pointer"
};

const secondaryButton: CSSProperties = {
  minHeight: 40,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  background: "#fff",
  color: "#0f172a",
  fontWeight: 800,
  padding: "0 13px",
  cursor: "pointer"
};

function departmentLabel(value: string): string {
  return departmentOptions.find((option) => option.value === value)?.label ?? value;
}

function normaliseMaterialGroup(value: string | null): string {
  return String(value ?? "").trim().toLowerCase().replace(/_/g, "-");
}

function materialDepartmentScore(material: MaterialRecord, department: string): number {
  const group = normaliseMaterialGroup(material.materialGroup);
  const type = String(material.materialType ?? "").toLowerCase();
  const haystack = `${material.name} ${material.notes ?? ""}`.toLowerCase();

  if (department === "signage") {
    if (group === "signage") return 4;
    if (/sheet|roll|laminate|vinyl/.test(type)) return 3;
    if (/acm|corflute|coreflute|acrylic|pvc|vinyl|banner/.test(haystack)) return 2;
  }
  if (department === "print") {
    if (group === "small-format") return 4;
    if (/paper|card|cello|binding/.test(type)) return 3;
  }
  if (department === "plans" && group === "plan-printing") return 4;
  if (department === "display" && group === "poster-printing") return 4;
  if (group === "shared" || group === "general") return 1;
  return 0;
}

function materialMeta(material: MaterialRecord): string {
  const dimensions = material.rollWidthMm
    ? `${material.rollWidthMm} mm roll`
    : material.widthMm && material.lengthMm
      ? `${material.widthMm} × ${material.lengthMm} mm`
      : "Dimensions not set";
  const cost = Number(material.purchaseCost || 0);
  return `${dimensions} · $${Number.isFinite(cost) ? cost.toFixed(2) : "0.00"}/${material.purchaseUom || "unit"}`;
}

function StepButton({ number, current, title, complete, onClick }: { number: StepNumber; current: StepNumber; title: string; complete: boolean; onClick: () => void }) {
  const active = current === number;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        minHeight: 44,
        border: active ? "2px solid #0f766e" : "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "0 13px",
        background: active ? "#f0fdfa" : "#fff",
        color: active ? "#115e59" : "#334155",
        fontWeight: 900,
        cursor: "pointer"
      }}
    >
      <span style={{ display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 999, background: complete ? "#0f766e" : active ? "#ccfbf1" : "#e2e8f0", color: complete ? "#fff" : "#334155", fontSize: 12 }}>
        {complete ? "✓" : number}
      </span>
      {title}
    </button>
  );
}

export function ManufacturingMethodBuilder({ action, materials, processes, recipe, mode = "create" }: Props) {
  const initialMaterialId = recipe?.materialId ?? "";
  const initialMaterial = materials.find((material) => material.id === initialMaterialId);
  const [step, setStep] = useState<StepNumber>(1);
  const [department, setDepartment] = useState(recipe?.department ?? "signage");
  const [name, setName] = useState(recipe?.name ?? "");
  const [materialId, setMaterialId] = useState(initialMaterialId);
  const [materialSearch, setMaterialSearch] = useState("");
  const [processIds, setProcessIds] = useState<string[]>(recipe?.processIds ?? []);
  const [wastePercent, setWastePercent] = useState(recipe?.wastePercent ?? "5");
  const [markupMultiplier, setMarkupMultiplier] = useState(recipe?.markupMultiplier ?? "1.5");
  const [profitMultiplier, setProfitMultiplier] = useState(recipe?.profitMultiplier ?? "1.2");

  const activeMaterials = useMemo(() => materials.filter((material) => material.active || material.id === initialMaterialId), [materials, initialMaterialId]);
  const selectedMaterial = activeMaterials.find((material) => material.id === materialId) ?? initialMaterial;
  const selectedProcesses = processIds.map((id) => processes.find((process) => process.id === id)).filter((process): process is ProcessRecord => Boolean(process));

  const visibleMaterials = useMemo(() => {
    const terms = materialSearch.toLowerCase().split(/\s+/).filter(Boolean);
    return [...activeMaterials]
      .filter((material) => {
        const searchable = `${material.name} ${material.sku ?? ""} ${material.materialType} ${material.materialGroup ?? ""} ${material.notes ?? ""}`.toLowerCase();
        return terms.every((term) => searchable.includes(term));
      })
      .sort((a, b) => materialDepartmentScore(b, department) - materialDepartmentScore(a, department) || a.name.localeCompare(b.name));
  }, [activeMaterials, department, materialSearch]);

  const availableProcesses = useMemo(() => {
    return processes
      .filter((process) => process.active && !processIds.includes(process.id))
      .sort((a, b) => {
        const aRecommended = a.department === department ? 2 : a.department === "general" ? 1 : 0;
        const bRecommended = b.department === department ? 2 : b.department === "general" ? 1 : 0;
        return bRecommended - aRecommended || a.name.localeCompare(b.name);
      });
  }, [department, processIds, processes]);

  const addProcess = (id: string) => setProcessIds((current) => current.includes(id) ? current : [...current, id]);
  const removeProcess = (id: string) => setProcessIds((current) => current.filter((item) => item !== id));
  const moveProcess = (index: number, direction: -1 | 1) => {
    setProcessIds((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const chooseMaterial = (id: string) => {
    setMaterialId(id);
    if (!id) return;
    const material = activeMaterials.find((row) => row.id === id);
    if (material && (!name.trim() || name === selectedMaterial?.name)) setName(material.name);
  };

  const stepComplete = {
    1: Boolean(name.trim() && department),
    2: true,
    3: processIds.length > 0,
    4: true
  };

  return (
    <form action={action} style={{ display: "grid", gap: 17 }}>
      {recipe ? <input type="hidden" name="id" value={recipe.id} /> : null}
      <input type="hidden" name="department" value={department} />
      <input type="hidden" name="materialId" value={materialId} />
      <input type="hidden" name="wastePercent" value={wastePercent} />
      <input type="hidden" name="markupMultiplier" value={markupMultiplier} />
      <input type="hidden" name="profitMultiplier" value={profitMultiplier} />
      {processIds.map((id) => <input key={id} type="hidden" name="processIds" value={id} />)}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <StepButton number={1} current={step} title="What are you making?" complete={stepComplete[1]} onClick={() => setStep(1)} />
        <StepButton number={2} current={step} title="Material" complete={Boolean(materialId) || department === "general"} onClick={() => setStep(2)} />
        <StepButton number={3} current={step} title="Production steps" complete={stepComplete[3]} onClick={() => setStep(3)} />
        <StepButton number={4} current={step} title="Review" complete={stepComplete[4]} onClick={() => setStep(4)} />
      </div>

      {step === 1 ? (
        <section style={panel}>
          <div style={{ fontSize: 12, fontWeight: 950, textTransform: "uppercase", color: "#0f766e" }}>Step 1</div>
          <h3 style={{ margin: "6px 0 4px", fontSize: 24 }}>What type of work is this method for?</h3>
          <p style={{ margin: "0 0 16px", color: "#64748b", lineHeight: 1.55 }}>Choose the department, then give the method a plain name your team will recognise in the Product builder.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
            {departmentOptions.map((option) => {
              const selected = department === option.value;
              return (
                <button key={option.value} type="button" onClick={() => setDepartment(option.value)} style={{ textAlign: "left", minHeight: 92, border: selected ? "2px solid #0f766e" : "1px solid #dbe4f0", borderRadius: 14, padding: 14, background: selected ? "#f0fdfa" : "#fff", cursor: "pointer" }}>
                  <div style={{ fontWeight: 950, color: selected ? "#115e59" : "#0f172a" }}>{option.label}</div>
                  <div style={{ marginTop: 5, color: "#64748b", fontSize: 13, lineHeight: 1.4 }}>{option.description}</div>
                </button>
              );
            })}
          </div>
          <label style={{ display: "grid", gap: 7, marginTop: 16, fontWeight: 900 }}>
            Method name
            <input name="name" value={name} onChange={(event: { target: { value: string } }) => setName(event.target.value)} placeholder="e.g. Corflute 5mm — Direct print and eyelets" required style={input} />
          </label>
        </section>
      ) : null}

      {step === 2 ? (
        <section style={panel}>
          <div style={{ fontSize: 12, fontWeight: 950, textTransform: "uppercase", color: "#0f766e" }}>Step 2</div>
          <h3 style={{ margin: "6px 0 4px", fontSize: 24 }}>Choose the main material</h3>
          <p style={{ margin: "0 0 16px", color: "#64748b", lineHeight: 1.55 }}>This is the physical stock the costing engine measures. Install-only and service methods can use no material.</p>
          <input value={materialSearch} onChange={(event: { target: { value: string } }) => setMaterialSearch(event.target.value)} placeholder="Search materials…" style={{ ...input, marginBottom: 11 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(255px,1fr))", gap: 10, maxHeight: 430, overflowY: "auto", paddingRight: 3 }}>
            <button type="button" onClick={() => chooseMaterial("")} style={{ textAlign: "left", minHeight: 92, border: !materialId ? "2px solid #0f766e" : "1px solid #dbe4f0", borderRadius: 14, padding: 14, background: !materialId ? "#f0fdfa" : "#fff", cursor: "pointer" }}>
              <div style={{ fontWeight: 950 }}>No physical material</div>
              <div style={{ marginTop: 5, color: "#64748b", fontSize: 13 }}>Install-only, service, labour or customer-supplied signage</div>
            </button>
            {visibleMaterials.map((material) => {
              const selected = materialId === material.id;
              const recommended = materialDepartmentScore(material, department) > 0;
              return (
                <button key={material.id} type="button" onClick={() => chooseMaterial(material.id)} style={{ textAlign: "left", minHeight: 92, border: selected ? "2px solid #0f766e" : "1px solid #dbe4f0", borderRadius: 14, padding: 14, background: selected ? "#f0fdfa" : "#fff", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 950 }}>{material.name}</span>
                    {recommended ? <span style={{ flexShrink: 0, borderRadius: 999, background: "#ecfdf5", color: "#047857", padding: "3px 7px", fontSize: 10, fontWeight: 900 }}>Recommended</span> : null}
                  </div>
                  <div style={{ marginTop: 5, color: "#64748b", fontSize: 13, lineHeight: 1.4 }}>{materialMeta(material)}</div>
                </button>
              );
            })}
          </div>
          {!visibleMaterials.length ? <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: "#fff7ed", color: "#9a3412" }}>No materials match this search. <Link href="/materials" style={{ color: "inherit", fontWeight: 900 }}>Add or edit materials →</Link></div> : null}
        </section>
      ) : null}

      {step === 3 ? (
        <section style={panel}>
          <div style={{ fontSize: 12, fontWeight: 950, textTransform: "uppercase", color: "#0f766e" }}>Step 3</div>
          <h3 style={{ margin: "6px 0 4px", fontSize: 24 }}>Add the production steps in order</h3>
          <p style={{ margin: "0 0 16px", color: "#64748b", lineHeight: 1.55 }}>Add only what this method normally requires. The order below becomes the production sequence and determines the compatible machine and labour costs.</p>

          {selectedProcesses.length ? (
            <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
              {selectedProcesses.map((process, index) => (
                <div key={process.id} style={{ display: "grid", gridTemplateColumns: "38px minmax(0,1fr) auto", gap: 10, alignItems: "center", border: "1px solid #99f6e4", borderRadius: 13, padding: 10, background: "#f0fdfa" }}>
                  <div style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 999, background: "#0f766e", color: "#fff", fontWeight: 950 }}>{index + 1}</div>
                  <div>
                    <div style={{ fontWeight: 950 }}>{process.name}</div>
                    <div style={{ marginTop: 3, color: "#64748b", fontSize: 12 }}>{process.processType} · {departmentLabel(process.department)}{process.labourOperationName ? ` · ${process.labourOperationName}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => moveProcess(index, -1)} style={{ ...secondaryButton, minHeight: 34, padding: "0 10px", opacity: index === 0 ? 0.4 : 1 }}>↑</button>
                    <button type="button" aria-label="Move down" disabled={index === selectedProcesses.length - 1} onClick={() => moveProcess(index, 1)} style={{ ...secondaryButton, minHeight: 34, padding: "0 10px", opacity: index === selectedProcesses.length - 1 ? 0.4 : 1 }}>↓</button>
                    <button type="button" onClick={() => removeProcess(process.id)} style={{ ...secondaryButton, minHeight: 34, color: "#b42318", borderColor: "#fecaca" }}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginBottom: 16, padding: 16, border: "1px dashed #94a3b8", borderRadius: 13, background: "#f8fafc", color: "#475569" }}>No steps added yet. Select them below in the order the job is produced.</div>
          )}

          {availableProcesses.length ? (
            <div>
              <div style={{ fontWeight: 900, marginBottom: 9 }}>Available steps</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {availableProcesses.map((process) => {
                  const recommended = process.department === department || process.department === "general";
                  return (
                    <button key={process.id} type="button" onClick={() => addProcess(process.id)} style={{ minHeight: 42, border: recommended ? "1px solid #5eead4" : "1px solid #cbd5e1", borderRadius: 11, background: recommended ? "#f0fdfa" : "#fff", color: "#0f172a", padding: "0 13px", fontWeight: 850, cursor: "pointer" }}>
                      + {process.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ padding: 16, borderRadius: 13, border: "1px solid #fed7aa", background: "#fff7ed", color: "#9a3412" }}>
              <strong>No production steps are available.</strong> Create simple steps such as Direct print, Trim, Laminate, Eyelets or Install first. <Link href="/processes" style={{ color: "inherit", fontWeight: 950 }}>Open Production Steps →</Link>
            </div>
          )}
        </section>
      ) : null}

      {step === 4 ? (
        <section style={panel}>
          <div style={{ fontSize: 12, fontWeight: 950, textTransform: "uppercase", color: "#0f766e" }}>Step 4</div>
          <h3 style={{ margin: "6px 0 4px", fontSize: 24 }}>Review the method</h3>
          <p style={{ margin: "0 0 16px", color: "#64748b", lineHeight: 1.55 }}>This method will appear as one choice in the Product Build tab. WordPress and internal quotes will then use the same costing recipe.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
            <div style={{ padding: 14, borderRadius: 13, background: "#f8fafc", border: "1px solid #e2e8f0" }}><div style={{ color: "#64748b", fontSize: 12 }}>Method</div><div style={{ marginTop: 5, fontWeight: 950 }}>{name || "Name not entered"}</div></div>
            <div style={{ padding: 14, borderRadius: 13, background: "#f8fafc", border: "1px solid #e2e8f0" }}><div style={{ color: "#64748b", fontSize: 12 }}>Department</div><div style={{ marginTop: 5, fontWeight: 950 }}>{departmentLabel(department)}</div></div>
            <div style={{ padding: 14, borderRadius: 13, background: "#f8fafc", border: "1px solid #e2e8f0" }}><div style={{ color: "#64748b", fontSize: 12 }}>Material</div><div style={{ marginTop: 5, fontWeight: 950 }}>{selectedMaterial?.name ?? "No physical material"}</div></div>
            <div style={{ padding: 14, borderRadius: 13, background: "#f8fafc", border: "1px solid #e2e8f0" }}><div style={{ color: "#64748b", fontSize: 12 }}>Sequence</div><div style={{ marginTop: 5, fontWeight: 950 }}>{selectedProcesses.map((process) => process.name).join(" → ") || "No production steps"}</div></div>
          </div>

          <details style={{ marginTop: 14, border: "1px solid #dbe4f0", borderRadius: 13, padding: 13, background: "#fff" }}>
            <summary style={{ cursor: "pointer", fontWeight: 900 }}>Advanced pricing defaults</summary>
            <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>Most methods can keep these defaults. Waste increases material usage; markup and profit are applied after production cost.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(150px,1fr))", gap: 10 }}>
              <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Material waste %<input type="number" min="0" step="0.1" value={wastePercent} onChange={(event: { target: { value: string } }) => setWastePercent(event.target.value)} style={input} /></label>
              <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Markup multiplier<input type="number" min="0" step="0.01" value={markupMultiplier} onChange={(event: { target: { value: string } }) => setMarkupMultiplier(event.target.value)} style={input} /></label>
              <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Profit multiplier<input type="number" min="0" step="0.01" value={profitMultiplier} onChange={(event: { target: { value: string } }) => setProfitMultiplier(event.target.value)} style={input} /></label>
            </div>
          </details>
        </section>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ color: "#64748b", fontSize: 13 }}>
          {mode === "create" ? "After creating it, open a Product → Build and select this method." : "Changes immediately affect products linked to this method."}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {step > 1 ? <button type="button" onClick={() => setStep((step - 1) as StepNumber)} style={secondaryButton}>Back</button> : null}
          {step < 4 ? <button type="button" onClick={() => setStep((step + 1) as StepNumber)} style={primaryButton}>Continue</button> : <button type="submit" disabled={!name.trim()} style={{ ...primaryButton, opacity: name.trim() ? 1 : 0.45 }}>{mode === "create" ? "Create method" : "Save method"}</button>}
        </div>
      </div>
    </form>
  );
}
