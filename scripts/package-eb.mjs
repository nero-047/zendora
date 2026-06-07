import { existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const distDir = resolve(process.cwd(), "dist");
const outputPath = resolve(distDir, "zendora-eb-source.zip");

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
  .filter(
    (file) =>
      file !== ".env" &&
      !file.startsWith(".env.") &&
      !file.startsWith("dist/"),
  );

if (files.length === 0) {
  console.error("No source files found to package.");
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

console.log(`Created ${outputPath}`);
