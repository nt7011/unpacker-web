#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { restoreExecutable, unpack } from "./unpacker.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const fixtureDir = path.join(repoRoot, "transpile-test");
const inputPath = path.join(fixtureDir, "Game.exe");
const expectedDir = path.join(fixtureDir, "Game-unpacked");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function toRelativePath(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

async function collectFiles(root) {
  const found = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        found.push(fullPath);
      }
    }
  }
  await walk(root);
  return found.sort((a, b) => a.localeCompare(b));
}

async function main() {
  await stat(inputPath);
  await stat(expectedDir);

  const input = await readFile(inputPath);
  const result = unpack(input);
  const actual = new Map(
    result.files.map((file) => [
      file.path,
      {
        size: file.data.byteLength,
        hash: sha256(file.data),
      },
    ]),
  );

  const restoredExecutable = restoreExecutable(input, {
    peVariant: "9_70",
  });
  actual.set("Game.exe", {
    size: restoredExecutable.byteLength,
    hash: sha256(restoredExecutable),
  });

  const expectedFiles = (await collectFiles(expectedDir)).map((filePath) =>
    toRelativePath(expectedDir, filePath),
  );

  const failures = [];

  for (const relativePath of expectedFiles) {
    const actualFile = actual.get(relativePath);
    if (!actualFile) {
      failures.push(`missing: ${relativePath}`);
      continue;
    }
    const expectedBytes = await readFile(path.join(expectedDir, relativePath));
    const expectedHash = sha256(expectedBytes);
    if (
      actualFile.size !== expectedBytes.byteLength ||
      actualFile.hash !== expectedHash
    ) {
      failures.push(
        `mismatch: ${relativePath} expected ${expectedBytes.byteLength}/${expectedHash}, got ${actualFile.size}/${actualFile.hash}`,
      );
    }
  }

  for (const relativePath of actual.keys()) {
    if (!expectedFiles.includes(relativePath)) {
      failures.push(`extra: ${relativePath}`);
    }
  }

  if (failures.length > 0) {
    console.error(`Verification failed with ${failures.length} issue(s):`);
    for (const failure of failures.slice(0, 50)) {
      console.error(`  ${failure}`);
    }
    if (failures.length > 50) {
      console.error(`  ... ${failures.length - 50} more`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Verified ${expectedFiles.length} files against local fixture output.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
