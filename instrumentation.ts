export async function register(): Promise<void> {
  // Keep the import inside Next's documented runtime branch so the Edge
  // instrumentation compiler never follows Node-only Pi dependencies.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // A production build must never execute a user's real schedules. The
    // runner belongs to the long-lived Node server process only.
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    const { registerScheduleRunner } = await import("./instrumentation.node");
    registerScheduleRunner();
  }
}
