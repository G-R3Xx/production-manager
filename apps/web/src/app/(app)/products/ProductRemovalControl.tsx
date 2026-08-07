"use client";

import { deleteProductAction, restoreProductAction } from "./actions";

type ProductRemovalControlProps = {
  productId: string;
  productName: string;
  status: string;
  source?: "library" | "detail" | "advanced";
  compact?: boolean;
};

export function ProductRemovalControl({
  productId,
  productName,
  status,
  source = "library",
  compact = false
}: ProductRemovalControlProps) {
  const removed = status === "deleted";
  const action = removed ? restoreProductAction : deleteProductAction;
  const label = removed ? "Restore product" : "Remove product";

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (removed) return;
        const confirmed = window.confirm(
          `Remove “${productName}” from Production Manager?\n\nIt will disappear from current product and quote lists, but existing quotes and orders will remain intact. Any linked MYOB item will NOT be changed or deleted, and future MYOB syncs will keep this product hidden until you restore it.`
        );
        if (!confirmed) event.preventDefault();
      }}
      style={{ margin: 0 }}
    >
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="source" value={source} />
      <button
        type="submit"
        title={removed ? `Restore ${productName}` : `Remove ${productName}`}
        style={{
          minHeight: compact ? 34 : 40,
          border: `1px solid ${removed ? "#bbf7d0" : "#fecaca"}`,
          borderRadius: 10,
          background: removed ? "#f0fdf4" : "#fff7f7",
          color: removed ? "#067647" : "#b42318",
          fontWeight: 900,
          padding: compact ? "0 11px" : "0 14px",
          cursor: "pointer",
          whiteSpace: "nowrap"
        }}
      >
        {label}
      </button>
    </form>
  );
}
