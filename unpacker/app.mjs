import {
  restoreExecutable,
  unpack,
} from "./unpacker.js";
import { createStoredZipBlob } from "./zip-store.mjs";

const state = {
  directoryFiles: [],
  directoryName: "",
  packedFile: null,
  packedFileIndex: -1,
  outputEntries: [],
  safeEntries: [],
  unsafeEntries: [],
  peVariant: "9_70",
  busy: false,
  logs: [],
};

const chooseDirectoryButton = document.querySelector("#choose-directory-button");
const directoryInput = document.querySelector("#directory-input");
const extractButton = document.querySelector("#extract-button");
const packedFileSelect = document.querySelector("#packed-file-select");
const peVariantSelect = document.querySelector("#pe-variant-select");
const downloadZipButton = document.querySelector("#download-zip-button");
const writeFolderButton = document.querySelector("#write-folder-button");
const outputActions = document.querySelector("#output-actions");
const filesystemWarning = document.querySelector("#filesystem-warning");
const selectionStatus = document.querySelector("#selection-status");
const outputStatus = document.querySelector("#output-status");
const directoryName = document.querySelector("#directory-name");
const directoryFileCount = document.querySelector("#directory-file-count");
const packedFileSummary = document.querySelector("#packed-file-summary");
const unpackedFileCount = document.querySelector("#unpacked-file-count");
const unpackedSize = document.querySelector("#unpacked-size");
const unsafeFileCount = document.querySelector("#unsafe-file-count");
const logList = document.querySelector("#log-list");

chooseDirectoryButton.addEventListener("click", () => {
  directoryInput.value = "";
  directoryInput.click();
});
directoryInput.addEventListener("change", handleDirectoryInput);
packedFileSelect.addEventListener("change", handlePackedFileChange);
peVariantSelect.addEventListener("change", handlePeVariantChange);
extractButton.addEventListener("click", handleExtract);
downloadZipButton.addEventListener("click", handleDownloadZip);
writeFolderButton.addEventListener("click", handleWriteFolder);

render();

function handleDirectoryInput(event) {
  const files = [...event.target.files];
  resetOutput();

  if (files.length === 0) {
    state.directoryFiles = [];
    state.directoryName = "";
    state.packedFile = null;
    state.packedFileIndex = -1;
    pushLog("Directory selection was cancelled.", "warning");
    render();
    return;
  }

  state.directoryFiles = files;
  state.directoryName = getPickedDirectoryName(files);
  state.packedFileIndex = chooseDefaultPackedFileIndex(files);
  state.packedFile = files[state.packedFileIndex] ?? null;
  pushLog(`Selected ${state.directoryName || "directory"} with ${files.length} files.`, "success");
  if (state.packedFile) {
    pushLog(`Packed file selected: ${getDisplayPath(state.packedFile)}.`, "info");
  }
  render();
}

function handlePackedFileChange() {
  state.packedFileIndex = Number(packedFileSelect.value);
  state.packedFile = state.directoryFiles[state.packedFileIndex] ?? null;
  resetOutput();
  if (state.packedFile) {
    pushLog(`Packed file selected: ${getDisplayPath(state.packedFile)}.`, "info");
  }
  render();
}

function handlePeVariantChange() {
  state.peVariant = peVariantSelect.value;
  resetOutput();
  pushLog(`Executable format selected: ${getPeVariantLabel(state.peVariant)}.`, "info");
  render();
}

async function handleExtract() {
  if (!state.packedFile || state.busy) {
    return;
  }

  setBusy(true);
  resetOutput();
  render();
  pushLog(`Reading ${state.packedFile.name}.`, "info");

  try {
    const input = new Uint8Array(await state.packedFile.arrayBuffer());
    pushLog("Extracting virtual filesystem.", "info");
    const extracted = unpack(input);
    pushLog(`Restoring executable (${getPeVariantLabel(state.peVariant)}).`, "info");
    const restoredExecutable = restoreExecutable(input, {
      peVariant: state.peVariant,
    });
    const outputEntries = createOutputEntries(extracted.files, restoredExecutable, state.packedFile.name);

    state.outputEntries = outputEntries;
    state.unsafeEntries = outputEntries.filter((entry) => isExecutableOrDllPath(entry.path));
    state.safeEntries = outputEntries.filter((entry) => !isExecutableOrDllPath(entry.path));
    pushLog(
      `Prepared ${outputEntries.length} files (${formatBytes(sumEntrySizes(outputEntries))}).`,
      "success",
    );
  } catch (error) {
    pushLog(`Extraction failed: ${error.message}`, "error");
  } finally {
    setBusy(false);
    render();
  }
}

async function handleDownloadZip() {
  if (state.outputEntries.length === 0 || state.busy) {
    return;
  }

  setBusy(true);
  pushLog("Building ZIP archive.", "info");
  render();

  try {
    const zipBlob = createStoredZipBlob(state.outputEntries);
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitizeFileBase(state.directoryName || state.packedFile?.name || "unpacked")}-unpacked.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    pushLog(`ZIP ready: ${formatBytes(zipBlob.size)}.`, "success");
  } catch (error) {
    pushLog(`ZIP creation failed: ${error.message}`, "error");
  } finally {
    setBusy(false);
    render();
  }
}

async function handleWriteFolder() {
  if (state.safeEntries.length === 0 || state.busy) {
    return;
  }

  if (typeof window.showDirectoryPicker !== "function") {
    pushLog("This browser does not support folder writing.", "error");
    return;
  }

  setBusy(true);
  render();

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    if (!(await ensureReadWritePermission(directoryHandle))) {
      throw new Error("Write permission was not granted.");
    }

    let written = 0;
    for (const entry of state.safeEntries) {
      await writeEntry(directoryHandle, entry);
      written += 1;
    }

    pushLog(
      `Wrote ${written} files. Skipped ${state.unsafeEntries.length} .exe/.dll files.`,
      "success",
    );
  } catch (error) {
    if (error?.name !== "AbortError") {
      pushLog(`Folder write failed: ${error.message}`, "error");
    }
  } finally {
    setBusy(false);
    render();
  }
}

function createOutputEntries(files, restoredExecutable, executableName) {
  const output = new Map();
  for (const file of files) {
    output.set(normalizeOutputPath(file.path), {
      path: normalizeOutputPath(file.path),
      data: file.data,
    });
  }

  const restoredPath = sanitizeFileName(executableName || "Game.exe");
  output.set(restoredPath, {
    path: restoredPath,
    data: restoredExecutable,
  });

  return [...output.values()].sort((a, b) => a.path.localeCompare(b.path));
}

async function writeEntry(rootHandle, entry) {
  const segments = normalizeOutputPath(entry.path).split("/");
  let directoryHandle = rootHandle;
  for (const directoryName of segments.slice(0, -1)) {
    directoryHandle = await directoryHandle.getDirectoryHandle(directoryName, {
      create: true,
    });
  }

  const fileHandle = await directoryHandle.getFileHandle(segments.at(-1), {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(entry.data);
  await writable.close();
}

async function ensureReadWritePermission(handle) {
  if (!handle?.queryPermission || !handle?.requestPermission) {
    return true;
  }

  const options = { mode: "readwrite" };
  if ((await handle.queryPermission(options)) === "granted") {
    return true;
  }
  return (await handle.requestPermission(options)) === "granted";
}

function render() {
  renderSelection();
  renderOutput();
  renderActions();
  renderLogs();
}

function renderSelection() {
  directoryName.textContent = state.directoryName || "None";
  directoryFileCount.textContent = String(state.directoryFiles.length);
  packedFileSummary.textContent = state.packedFile
    ? `${getDisplayPath(state.packedFile)} (${formatBytes(state.packedFile.size)})`
    : "None";

  setStatus(
    selectionStatus,
    state.directoryFiles.length > 0
      ? "Confirm the packed file before extraction."
      : "No directory selected.",
    state.directoryFiles.length > 0 ? "success" : "neutral",
  );

  packedFileSelect.replaceChildren();
  if (state.directoryFiles.length === 0) {
    packedFileSelect.append(new Option("Select a directory first", ""));
    packedFileSelect.disabled = true;
    return;
  }

  for (const index of getPackedFileOptionIndexes(state.directoryFiles)) {
    const file = state.directoryFiles[index];
    const option = new Option(
      `${getDisplayPath(file)} (${formatBytes(file.size)})`,
      String(index),
    );
    packedFileSelect.append(option);
  }
  packedFileSelect.value = String(state.packedFileIndex);
  packedFileSelect.disabled = state.busy;
  peVariantSelect.value = state.peVariant;
  peVariantSelect.disabled = state.busy;
}

function renderOutput() {
  const totalSize = sumEntrySizes(state.outputEntries);
  unpackedFileCount.textContent = String(state.outputEntries.length);
  unpackedSize.textContent = formatBytes(totalSize);
  unsafeFileCount.textContent = String(state.unsafeEntries.length);

  if (state.outputEntries.length === 0) {
    setStatus(outputStatus, "Extracted output will appear here.", "neutral");
    outputActions.hidden = true;
    filesystemWarning.hidden = true;
    return;
  }

  setStatus(
    outputStatus,
    `${state.outputEntries.length} files ready for export.`,
    "success",
  );
  outputActions.hidden = false;
  filesystemWarning.hidden = false;
}

function renderActions() {
  chooseDirectoryButton.disabled = state.busy;
  extractButton.disabled = state.busy || !state.packedFile;
  peVariantSelect.disabled = state.busy;
  downloadZipButton.disabled = state.busy || state.outputEntries.length === 0;
  writeFolderButton.disabled = state.busy
    || state.safeEntries.length === 0
    || typeof window.showDirectoryPicker !== "function";
}

function renderLogs() {
  logList.textContent = "";
  const entries = state.logs.length > 0
    ? state.logs
    : [{ message: "Waiting for a directory selection.", tone: "info" }];

  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = `log-entry ${entry.tone}`;
    item.textContent = entry.message;
    logList.append(item);
  }
}

function resetOutput() {
  state.outputEntries = [];
  state.safeEntries = [];
  state.unsafeEntries = [];
}

function setBusy(value) {
  state.busy = value;
  renderActions();
}

function pushLog(message, tone = "info") {
  state.logs.push({
    message,
    tone,
  });
  state.logs = state.logs.slice(-80);
  renderLogs();
}

function setStatus(element, message, tone) {
  element.textContent = message;
  element.classList.remove("is-neutral", "is-warning", "is-error", "is-success");
  element.classList.add(`is-${tone}`);
}

function chooseDefaultPackedFileIndex(files) {
  const gameCandidates = files
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => file.name.toLowerCase() === "game.exe")
    .sort((a, b) => pathDepth(a.file) - pathDepth(b.file) || b.file.size - a.file.size);

  if (gameCandidates.length > 0) {
    return gameCandidates[0].index;
  }

  let largestIndex = 0;
  for (let index = 1; index < files.length; index += 1) {
    if (files[index].size > files[largestIndex].size) {
      largestIndex = index;
    }
  }
  return largestIndex;
}

function getPackedFileOptionIndexes(files) {
  const selected = state.packedFileIndex;
  const indexes = files.map((_file, index) => index);
  indexes.sort((left, right) => {
    if (left === selected) {
      return -1;
    }
    if (right === selected) {
      return 1;
    }
    const leftGame = files[left].name.toLowerCase() === "game.exe";
    const rightGame = files[right].name.toLowerCase() === "game.exe";
    if (leftGame !== rightGame) {
      return leftGame ? -1 : 1;
    }
    return files[right].size - files[left].size
      || getDisplayPath(files[left]).localeCompare(getDisplayPath(files[right]));
  });
  return indexes;
}

function getPickedDirectoryName(files) {
  const firstPath = String(files[0]?.webkitRelativePath ?? "");
  const slash = firstPath.indexOf("/");
  return slash > 0 ? firstPath.slice(0, slash) : "";
}

function getDisplayPath(file) {
  const relativePath = String(file.webkitRelativePath || file.name);
  const slash = relativePath.indexOf("/");
  return slash >= 0 ? relativePath.slice(slash + 1) : relativePath;
}

function pathDepth(file) {
  return getDisplayPath(file).split("/").length;
}

function normalizeOutputPath(path) {
  const normalized = String(path ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/g, "")
    .replace(/\/+$/g, "");
  const segments = normalized.split("/");
  if (
    !normalized
      || segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid output path: ${path}`);
  }
  return segments.join("/");
}

function sanitizeFileName(fileName) {
  return String(fileName ?? "Game.exe")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/^\.+$/g, "_")
    .trim() || "Game.exe";
}

function sanitizeFileBase(fileName) {
  return sanitizeFileName(fileName).replace(/\.[^.]+$/u, "") || "unpacked";
}

function isExecutableOrDllPath(path) {
  return /\.(?:exe|dll)$/iu.test(path.split("/").at(-1) ?? "");
}

function sumEntrySizes(entries) {
  return entries.reduce((total, entry) => total + entry.data.byteLength, 0);
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function getPeVariantLabel(value) {
  return `${String(value).replace("_", ".")} layout`;
}
