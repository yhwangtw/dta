#!/usr/bin/env node

// Backward-compatible source-checkout entry point:
//   npm run agent -- meeting --task "..."
import { main } from "./dta-core.mjs";

await main(["run", ...process.argv.slice(2)]);
