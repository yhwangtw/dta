import { createFixtures } from "./fixtures";

export default function globalSetup(): void {
  const root = process.env.E2E_ROOT;
  if (!root) throw new Error("E2E_ROOT not set (playwright.config.ts sets it)");
  const { cwd } = createFixtures(root);
  // Specs read this to type paths into the picker's autocomplete/browse.
  process.env.E2E_PROJECT_CWD = cwd;
}
