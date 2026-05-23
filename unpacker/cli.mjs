#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles, restoreExecutableWithInfo, unpack } from "./unpacker.js";

function usage() {
  const script = path.basename(fileURLToPath(import.meta.url));
  return `Usage: node unpacker/${script} <input.exe|package> <output-dir> [options]

Options:
  --legacy-fs   Use legacy filesystem parsing.
  --ignore-fs   Restore the executable without extracting virtual files.
  --ignore-pe   Extract virtual files without restoring the executable.
  --pe-variant  PE restoration variant: 10_70, 9_70, or 7_80. Default: 9_70.
  --list        Print the virtual filesystem without writing files.
  --help        Show this help text.
`;
}

function parseArgs(argv) {
  const options = {
    legacyFs: false,
    ignoreFs: false,
    ignorePe: false,
    list: false,
    peVariant: "9_70",
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--legacy-fs") {
      options.legacyFs = true;
    } else if (arg === "--ignore-fs") {
      options.ignoreFs = true;
    } else if (arg === "--ignore-pe") {
      options.ignorePe = true;
    } else if (arg === "--pe-variant" || arg === "-pe") {
      i += 1;
      if (i >= argv.length) {
        throw new Error(`${arg} requires a value`);
      }
      options.peVariant = argv[i];
    } else if (arg === "--list") {
      options.list = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  return { ...options, positional };
}

function printableEntries(result) {
  const dirs = result.directories.map((entry) => ({
    path: entry.path || ".",
    type: "dir",
    size: "",
  }));
  const files = result.files.map((entry) => ({
    path: entry.path,
    type: "file",
    size: String(entry.originalSize),
  }));
  return [...dirs, ...files].sort((a, b) => a.path.localeCompare(b.path));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.positional.length !== 2) {
    throw new Error(usage());
  }

  const [inputPath, outputDir] = args.positional;
  const input = await readFile(inputPath);
  const unpackOptions = { legacyFs: args.legacyFs };

  if (args.list) {
    const result = listFiles(input, unpackOptions);
    for (const entry of printableEntries(result)) {
      console.log(`${entry.type.padEnd(4)} ${entry.size.padStart(10)} ${entry.path}`);
    }
    return;
  }

  await mkdir(outputDir, { recursive: true });

  if (!args.ignoreFs) {
    const result = unpack(input, unpackOptions);
    for (const directory of result.directories) {
      if (directory.path) {
        await mkdir(path.join(outputDir, directory.path), { recursive: true });
      }
    }

    for (const file of result.files) {
      const outputPath = path.join(outputDir, file.path);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, file.data);
    }

    console.log(`Extracted ${result.files.length} files to ${outputDir}`);
  }

  if (!args.ignorePe) {
    const restored = restoreExecutableWithInfo(input, {
      peVariant: args.peVariant,
    });
    const outputPath = path.join(outputDir, path.basename(inputPath));
    await writeFile(outputPath, restored.data);
    console.log(`Restored executable to ${outputPath}`);
    for (const warning of restored.warnings) {
      console.warn(`Warning: ${warning}`);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
