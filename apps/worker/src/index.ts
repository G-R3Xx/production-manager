export function startWorker(): void {
  console.log("[worker] Production Manager worker scaffold is running.");
}

if (process.env.NODE_ENV !== "test") {
  startWorker();
}
