"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { QuoteProduct } from "./QuoteLineBuilder";
import type { MyobMatrixItem, PricingSettings, QuoteMaterial } from "./QuoteMaterialFlowBuilder";
import type { QuoteCostingResources } from "./quoteCostingResources";

const QuoteLineBuilder = lazy(() => import("./QuoteLineBuilder").then((module) => ({ default: module.QuoteLineBuilder })));
const QuoteMaterialFlowBuilder = lazy(() => import("./QuoteMaterialFlowBuilder").then((module) => ({ default: module.QuoteMaterialFlowBuilder })));

type Props = {
  quoteId: string;
  products: QuoteProduct[];
  materials: QuoteMaterial[];
  myobMatrixItems?: MyobMatrixItem[];
  pricingSettings?: PricingSettings;
  canOverrideMarkup?: boolean;
  costingResources?: QuoteCostingResources;
};

type DepartmentFilter = "all" | "signage" | "small_format";
type ModalMode = { kind: "saved"; productId: string } | { kind: "quick" };

const PAGE_SIZE = 8;

function departmentLabel(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase() === "small_format" ? "Small format" : "Signage";
}

function productGraphic(product: QuoteProduct) {
  if (product.imageUrl) {
    return (
      <div
        aria-hidden="true"
        style={{
          height: 132,
          backgroundImage: `url(${JSON.stringify(product.imageUrl).slice(1, -1)})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          borderBottom: "1px solid #e2e8f0"
        }}
      />
    );
  }

  const text = product.name.trim().slice(0, 2).toUpperCase() || "PM";
  return (
    <div
      aria-hidden="true"
      style={{
        height: 132,
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(135deg,#dbeafe 0%,#eef2ff 48%,#f5d0fe 100%)",
        color: "#1e3a8a",
        fontSize: 38,
        fontWeight: 1000,
        letterSpacing: "-0.05em",
        borderBottom: "1px solid #dbeafe"
      }}
    >
      {text}
    </div>
  );
}

export function VisualQuoteCatalogue({
  quoteId,
  products,
  materials,
  myobMatrixItems = [],
  pricingSettings,
  canOverrideMarkup = false,
  costingResources
}: Props) {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<DepartmentFilter>("all");
  const [page, setPage] = useState(1);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const eligibleProducts = useMemo(
    () => products.filter((product) => ["signage", "small_format"].includes(String(product.department ?? "").toLowerCase())),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return eligibleProducts.filter((product) => {
      const productDepartment = String(product.department ?? "").toLowerCase();
      if (department !== "all" && productDepartment !== department) return false;
      if (!needle) return true;
      return `${product.name} ${product.sku ?? ""} ${product.productFamily ?? ""}`.toLowerCase().includes(needle);
    });
  }, [eligibleProducts, search, department]);

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleProducts = filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selectedProduct = modalMode?.kind === "saved" ? eligibleProducts.find((product) => product.id === modalMode.productId) : null;

  useEffect(() => {
    setPage(1);
  }, [search, department]);

  useEffect(() => {
    if (!modalOpen) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = oldOverflow;
    };
  }, [modalOpen]);

  function openSaved(productId: string) {
    setModalMode({ kind: "saved", productId });
    setModalOpen(true);
  }

  function openQuick() {
    setModalMode({ kind: "quick" });
    setModalOpen(true);
  }

  const chipStyle = (active: boolean) => ({
    minHeight: 36,
    borderRadius: 999,
    border: active ? "2px solid #2563eb" : "1px solid #cbd5e1",
    background: active ? "#eff6ff" : "#fff",
    color: active ? "#1d4ed8" : "#475569",
    fontWeight: 900,
    padding: "0 13px",
    cursor: "pointer"
  });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={{ display: "grid", gridTemplateColumns: "minmax(240px,1fr) auto", gap: 12, alignItems: "center" }}>
        <label style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 13, top: 12, color: "#64748b", pointerEvents: "none" }}>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search saved products…"
            style={{ width: "100%", minHeight: 44, borderRadius: 14, border: "1px solid #cbd5e1", padding: "0 14px 0 38px", boxSizing: "border-box", fontWeight: 750 }}
          />
        </label>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" onClick={() => setDepartment("all")} style={chipStyle(department === "all")}>All</button>
          <button type="button" onClick={() => setDepartment("signage")} style={chipStyle(department === "signage")}>Signage</button>
          <button type="button" onClick={() => setDepartment("small_format")} style={chipStyle(department === "small_format")}>Small format</button>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(205px,1fr))", gap: 12 }}>
        <button
          type="button"
          onClick={openQuick}
          style={{ border: "2px solid #7c3aed", borderRadius: 18, overflow: "hidden", background: "#fff", padding: 0, cursor: "pointer", textAlign: "left", minHeight: 245, boxShadow: "0 9px 24px rgba(124,58,237,0.10)" }}
        >
          <div style={{ height: 132, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#ede9fe,#fae8ff)", color: "#6d28d9", fontSize: 50, fontWeight: 900, borderBottom: "1px solid #ddd6fe" }}>＋</div>
          <div style={{ padding: 13, display: "grid", gap: 5 }}>
            <strong style={{ fontSize: 16, color: "#4c1d95" }}>Quick / custom line</strong>
            <span style={{ color: "#6b7280", fontSize: 12, lineHeight: 1.45 }}>Signage, print, plans, posters, delivery, install or custom component.</span>
          </div>
        </button>

        {visibleProducts.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => openSaved(product.id)}
            style={{ border: "1px solid #dbe3ef", borderRadius: 18, overflow: "hidden", background: "#fff", padding: 0, cursor: "pointer", textAlign: "left", minHeight: 245, boxShadow: "0 8px 22px rgba(15,23,42,0.06)" }}
          >
            {productGraphic(product)}
            <div style={{ padding: 13, display: "grid", gap: 6 }}>
              <span style={{ width: "fit-content", borderRadius: 999, background: "#f1f5f9", color: "#475569", padding: "3px 8px", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {departmentLabel(product.department)}
              </span>
              <strong style={{ fontSize: 15, color: "#0f172a", lineHeight: 1.25 }}>{product.name}</strong>
              <span style={{ color: "#64748b", fontSize: 12 }}>{product.sku || product.productFamily || "Saved product"}</span>
            </div>
          </button>
        ))}
      </section>

      {visibleProducts.length === 0 ? (
        <div style={{ border: "1px dashed #cbd5e1", borderRadius: 16, padding: 24, color: "#64748b", background: "#f8fafc", textAlign: "center" }}>
          No saved products match this search. You can still use <strong>Quick / custom line</strong>.
        </div>
      ) : null}

      {pageCount > 1 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} style={{ minHeight: 38, borderRadius: 12, border: "1px solid #cbd5e1", background: "#fff", padding: "0 13px", fontWeight: 900, cursor: safePage <= 1 ? "not-allowed" : "pointer", opacity: safePage <= 1 ? 0.5 : 1 }}>← Previous</button>
          <span style={{ color: "#475569", fontSize: 12, fontWeight: 900 }}>Page {safePage} of {pageCount}</span>
          <button type="button" disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} style={{ minHeight: 38, borderRadius: 12, border: "1px solid #cbd5e1", background: "#fff", padding: "0 13px", fontWeight: 900, cursor: safePage >= pageCount ? "not-allowed" : "pointer", opacity: safePage >= pageCount ? 0.5 : 1 }}>Next →</button>
        </div>
      ) : null}

      {modalMode ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={modalMode.kind === "saved" ? selectedProduct?.name ?? "Saved product quote builder" : "Quick quote builder"}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setModalOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            display: modalOpen ? "grid" : "none",
            placeItems: "center",
            padding: 18,
            background: "rgba(15,23,42,0.58)",
            backdropFilter: "blur(3px)"
          }}
        >
          <div style={{ width: "min(1120px,96vw)", maxHeight: "92vh", overflow: "auto", borderRadius: 22, background: "#fff", boxShadow: "0 28px 90px rgba(15,23,42,0.32)" }}>
            <header style={{ position: "sticky", top: 0, zIndex: 4, display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", padding: "15px 18px", borderBottom: "1px solid #e2e8f0", background: "rgba(255,255,255,0.97)", backdropFilter: "blur(10px)" }}>
              <div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.06em" }}>{modalMode.kind === "saved" ? "Saved product" : "Quick / custom"}</div>
                <strong style={{ fontSize: 19, color: "#0f172a" }}>{modalMode.kind === "saved" ? selectedProduct?.name ?? "Product" : "Build quote line"}</strong>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="Close quote builder" style={{ width: 40, height: 40, borderRadius: 999, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", cursor: "pointer", fontSize: 22, lineHeight: 1 }}>×</button>
            </header>
            <div style={{ padding: 18 }}>
              <Suspense fallback={<div style={{ minHeight: 160, display: "grid", placeItems: "center", color: "#64748b", fontWeight: 850 }}>Loading quote builder…</div>}>
                {modalMode.kind === "saved" ? (
                  <QuoteLineBuilder
                    key={`saved-${modalMode.productId}`}
                    quoteId={quoteId}
                    products={products}
                    materials={materials}
                    pricingSettings={pricingSettings}
                    costingResources={costingResources}
                    initialProductId={modalMode.productId}
                    hideProductPicker
                  />
                ) : (
                  <QuoteMaterialFlowBuilder
                    key="quick-catalogue-builder"
                    quoteId={quoteId}
                    materials={materials}
                    myobMatrixItems={myobMatrixItems}
                    canOverrideMarkup={canOverrideMarkup}
                    pricingSettings={pricingSettings}
                    costingResources={costingResources}
                    presentation="wizard"
                  />
                )}
              </Suspense>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
