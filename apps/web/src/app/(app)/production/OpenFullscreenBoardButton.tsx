"use client";

const buttonStyle = {
  justifySelf: "end",
  border: 0,
  borderRadius: 999,
  background: "#0f172a",
  color: "#fff",
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 950,
  textDecoration: "none",
  boxShadow: "0 12px 24px rgba(15,23,42,0.16)",
  cursor: "pointer"
} as const;

export function OpenFullscreenBoardButton() {
  return (
    <button
      type="button"
      onClick={() => {
        const width = window.screen?.availWidth || 1920;
        const height = window.screen?.availHeight || 1080;
        const features = [
          "popup=yes",
          "toolbar=no",
          "location=no",
          "status=no",
          "menubar=no",
          "scrollbars=yes",
          "resizable=yes",
          "left=0",
          "top=0",
          `width=${width}`,
          `height=${height}`
        ].join(",");
        const boardWindow = window.open("/production/board?display=fullscreen", "production-manager-board", features);
        boardWindow?.focus();
      }}
      style={buttonStyle}
    >
      Open fullscreen board
    </button>
  );
}
