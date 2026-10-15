import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = resolve(root, "package.json");
const confPath = resolve(root, "src-tauri/tauri.conf.json");
const cargoPath = resolve(root, "src-tauri/Cargo.toml");
const lockPath = resolve(root, "src-tauri/Cargo.lock");

const arg = (process.argv[2] ?? "").trim().replace(/^v/, "");
if (!arg) {
  console.error("usage: node scripts/bump-version.mjs <patch|minor|major|x.y.z>");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const current = pkg.version;

function bump(version, type) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`current version is not semver: ${version}`);
  let [major, minor, patch] = match.slice(1).map(Number);
  if (type === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (type === "minor") {
    minor += 1;
    patch = 0;
  } else if (type === "patch") {
    patch += 1;
  } else {
    throw new Error(`unknown bump type: ${type}`);
  }
  return `${major}.${minor}.${patch}`;
}

const next = /^\d+\.\d+\.\d+$/.test(arg) ? arg : bump(current, arg);
if (next === current) {
  console.error(`version is already ${current}`);
  process.exit(1);
}

pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const conf = JSON.parse(readFileSync(confPath, "utf8"));
conf.version = next;
writeFileSync(confPath, `${JSON.stringify(conf, null, 2)}\n`);

const cargo = readFileSync(cargoPath, "utf8").replace(
  /^version = "[^"]*"/m,
  `version = "${next}"`,
);
writeFileSync(cargoPath, cargo);

const lock = readFileSync(lockPath, "utf8").replace(
  /(\[\[package\]\]\nname = "datapulse"\nversion = ")[^"]*(")/,
  `$1${next}$2`,
);
writeFileSync(lockPath, lock);

console.log(next);
