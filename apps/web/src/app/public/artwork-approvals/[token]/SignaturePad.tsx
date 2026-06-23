"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type Point = { x: number; y: number };

function pointFromEvent(canvas: HTMLCanvasElement, event: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height
  };
}

export function SignaturePad() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.offsetWidth * ratio);
    canvas.height = Math.floor(canvas.offsetHeight * ratio);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3 * ratio;
    ctx.strokeStyle = "#0f172a";
  }, []);

  function saveCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDataUrl(canvas.toDataURL("image/png"));
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setDataUrl("");
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(canvas, event.nativeEvent);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !drawingRef.current || !lastPointRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const next = pointFromEvent(canvas, event.nativeEvent);
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    lastPointRef.current = next;
    saveCanvas();
  }

  function finishDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // ignored
    }
    saveCanvas();
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input type="hidden" name="signatureDataUrl" value={dataUrl} />
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
        style={{
          width: "100%",
          height: 160,
          border: "1px solid #dbe4f0",
          borderRadius: 16,
          background: "#fff",
          touchAction: "none",
          display: "block"
        }}
        aria-label="Signature pad"
      />
      <button type="button" onClick={clearCanvas} style={{ justifySelf: "start", minHeight: 36, borderRadius: 12, border: "1px solid #cfd9e8", background: "#fff", color: "#344054", fontWeight: 900, padding: "0 12px", cursor: "pointer" }}>Clear signature</button>
    </div>
  );
}
