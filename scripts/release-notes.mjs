// Prints the CHANGELOG.md section for the version in package.json.
// The updater's "What's new" text comes from latest.json's notes, which the
// release workflow fills from this, so latest.json and the release page agree.
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const heading = `## [${version}]`;

const lines = readFileSync("CHANGELOG.md", "utf8").split(/\r?\n/);
const start = lines.findIndex((line) => line.startsWith(heading));

if (start === -1) {
  console.error(`::warning::CHANGELOG.md has no ${heading} section`);
  process.stdout.write(
    "Download the installer for your platform below. Installed copies update automatically.",
  );
  process.exit(0);
}

const end = lines.findIndex((line, i) => i > start && line.startsWith("## ["));
const notes = lines
  .slice(start, end === -1 ? undefined : end)
  .join("\n")
  .trim();

if (!notes) {
  console.error(`::warning::CHANGELOG.md section for ${version} is empty`);
}

process.stdout.write(notes);
