#!/usr/bin/env node

/**
 * Verifies that npm run build:all covers every service in the monorepo.
 * Scans for directories with package.json and checks each is referenced
 * in the root build:all script.
 *
 * Usage: node scripts/verify-build-all.js
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const buildAllScript = rootPkg.scripts?.["build:all"] ?? "";
const devScript = rootPkg.scripts?.dev ?? "";
const workspaces = rootPkg.workspaces ?? [];

// Find all service directories (subdirectories with package.json, excluding node_modules)
const IGNORE = new Set(["node_modules", ".git", ".claude", "scripts", "dist"]);

const services = readdirSync(ROOT).filter((name) => {
  if (IGNORE.has(name) || name.startsWith(".")) return false;
  const dir = join(ROOT, name);
  return (
    statSync(dir).isDirectory() && existsSync(join(dir, "package.json"))
  );
});

let warnings = 0;

console.log("=== build:all coverage check ===\n");
console.log(`Found ${services.length} services: ${services.join(", ")}\n`);

// Check build:all
const buildScriptNames = Object.keys(rootPkg.scripts ?? {}).filter(
  (k) => k.startsWith("build:") && k !== "build" && k !== "build:all"
);

const buildAllRefs = buildScriptNames.filter((name) =>
  buildAllScript.includes(`npm run ${name}`)
);

for (const service of services) {
  const covered = buildScriptNames.some((scriptName) => {
    const scriptCmd = rootPkg.scripts[scriptName];
    return (
      buildAllScript.includes(`npm run ${scriptName}`) &&
      scriptCmd.includes(service)
    );
  });

  if (covered) {
    console.log(`  ✅ ${service} — covered in build:all`);
  } else {
    console.log(`  ⚠️  ${service} — NOT in build:all!`);
    warnings++;
  }
}

// Check dev script
console.log("\n=== dev script coverage check ===\n");

for (const service of services) {
  const devScriptNames = Object.keys(rootPkg.scripts ?? {}).filter(
    (k) => k.startsWith("dev:") && k !== "dev"
  );

  const covered = devScriptNames.some((scriptName) => {
    const scriptCmd = rootPkg.scripts[scriptName];
    return (
      devScript.includes(`npm run ${scriptName}`) &&
      scriptCmd.includes(service)
    );
  });

  if (covered) {
    console.log(`  ✅ ${service} — covered in dev`);
  } else {
    console.log(`  ⚠️  ${service} — NOT in dev!`);
    warnings++;
  }
}

// Check workspaces
console.log("\n=== workspaces coverage check ===\n");

for (const service of services) {
  if (workspaces.includes(service)) {
    console.log(`  ✅ ${service} — in workspaces`);
  } else {
    console.log(`  ⚠️  ${service} — NOT in workspaces!`);
    warnings++;
  }
}

// Summary
console.log("\n" + "=".repeat(40));
if (warnings > 0) {
  console.log(`\n❌ ${warnings} warning(s) found! Fix root package.json.\n`);
  process.exit(1);
} else {
  console.log(`\n✅ All ${services.length} services fully covered.\n`);
  process.exit(0);
}
