import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const distDir = resolve(process.cwd(), "dist");
const outputPath = resolve(distDir, "zendora-eb-source.zip");
const requiredFiles = [
  ".ebextensions/01_environment.config",
  ".ebextensions/02_health.config",
  ".ebextensions/03_command.config",
  ".platform/hooks/prebuild/00_add_swap.sh",
  ".platform/hooks/predeploy/10_next_build.sh",
  ".platform/nginx/conf.d/10_uploads.conf",
  "Buildfile",
  "Procfile",
  "next.config.ts",
  "package-lock.json",
  "package.json",
];
const requiredExecutableFiles = [
  ".platform/hooks/prebuild/00_add_swap.sh",
  ".platform/hooks/predeploy/10_next_build.sh",
];
const forbiddenBundleFiles = new Set([".env"]);
const forbiddenBundlePrefixes = [
  ".env.",
  ".next/",
  ".vercel/",
  "build/",
  "coverage/",
  "dist/",
  "node_modules/",
  "out/",
];

function isForbiddenBundleFile(file) {
  return (
    forbiddenBundleFiles.has(file) ||
    forbiddenBundlePrefixes.some((prefix) => file.startsWith(prefix))
  );
}

if (!existsSync(distDir)) {
  mkdirSync(distDir);
}

if (existsSync(outputPath)) {
  rmSync(outputPath);
}

const gitFiles = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
);

if (gitFiles.error) {
  console.error("Could not list source files with git.");
  console.error(gitFiles.error.message);
  process.exit(1);
}

if (gitFiles.status !== 0) {
  process.exit(gitFiles.status ?? 1);
}

const files = gitFiles.stdout
  .split("\0")
  .filter(Boolean)
  .filter((file) => !isForbiddenBundleFile(file));

if (files.length === 0) {
  console.error("No source files found to package.");
  process.exit(1);
}

const missingRequiredFiles = requiredFiles.filter((file) => !files.includes(file));

if (missingRequiredFiles.length > 0) {
  console.error("EB source bundle is missing required files:");
  for (const file of missingRequiredFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const nonExecutableRequiredFiles = requiredExecutableFiles.filter((file) => {
  if (!files.includes(file)) {
    return true;
  }

  return (statSync(file).mode & 0o111) === 0;
});

if (nonExecutableRequiredFiles.length > 0) {
  console.error("EB source bundle has required hook files that are missing or not executable:");
  for (const file of nonExecutableRequiredFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const forbiddenFiles = files.filter(isForbiddenBundleFile);

if (forbiddenFiles.length > 0) {
  console.error("EB source bundle includes forbidden files:");
  for (const file of forbiddenFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

const result = spawnSync(
  "zip",
  ["-q", "-r", outputPath, ...files],
  { stdio: "inherit" },
);

if (result.error) {
  console.error("Could not create EB source bundle. Is `zip` installed?");
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const zipListing = spawnSync("unzip", ["-Z1", outputPath], {
  encoding: "utf8",
});

if (zipListing.error) {
  console.error("Could not inspect EB source bundle. Is `unzip` installed?");
  console.error(zipListing.error.message);
  process.exit(1);
}

if (zipListing.status !== 0) {
  process.exit(zipListing.status ?? 1);
}

const bundledForbiddenFiles = zipListing.stdout
  .split("\n")
  .filter(Boolean)
  .filter(isForbiddenBundleFile);
const bundledFiles = new Set(
  zipListing.stdout
    .split("\n")
    .filter(Boolean),
);
const missingBundledRequiredFiles = requiredFiles.filter(
  (file) => !bundledFiles.has(file),
);

if (missingBundledRequiredFiles.length > 0) {
  console.error("Created EB source bundle is missing required files:");
  for (const file of missingBundledRequiredFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

if (bundledForbiddenFiles.length > 0) {
  console.error("Created EB source bundle contains forbidden files:");
  for (const file of bundledForbiddenFiles) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log(`Created ${outputPath}`);
