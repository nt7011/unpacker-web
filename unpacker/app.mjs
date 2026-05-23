import {
  restoreExecutableWithInfo,
  unpack,
} from "./unpacker.js";
import {
  createTranslator,
  detectPreferredLocale,
} from "./i18n.mjs";
import { createStoredZipBlob } from "./zip-store.mjs";

const locale = detectPreferredLocale(window.navigator);
const t = createTranslator(locale);

const state = {
  directoryFiles: [],
  directoryName: "",
  packedFile: null,
  packedFileIndex: -1,
  outputEntries: [],
  safeEntries: [],
  unsafeEntries: [],
  peVariant: "auto",
  folderWriteComplete: false,
  selectionStatus: null,
  outputStatus: null,
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
const nwjsReminder = document.querySelector("#nwjs-reminder");
const selectionStatus = document.querySelector("#selection-status");
const outputStatus = document.querySelector("#output-status");
const directoryName = document.querySelector("#directory-name");
const directoryFileCount = document.querySelector("#directory-file-count");
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

applyDocumentTranslations();
render();

function applyDocumentTranslations() {
  document.documentElement.lang = locale;

  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n, element.dataset);
  }

  for (const element of document.querySelectorAll("[data-i18n-html]")) {
    element.innerHTML = t(element.dataset.i18nHtml, element.dataset);
  }
}

function handleDirectoryInput(event) {
  const files = [...event.target.files];
  resetOutput();
  state.selectionStatus = null;

  if (files.length === 0) {
    state.directoryFiles = [];
    state.directoryName = "";
    state.packedFile = null;
    state.packedFileIndex = -1;
    state.selectionStatus = {
      message: t("log.directorySelectionCancelled"),
      tone: "warning",
    };
    pushLog(t("log.directorySelectionCancelled"), "warning");
    render();
    return;
  }

  state.directoryFiles = files;
  state.directoryName = getPickedDirectoryName(files);
  state.packedFileIndex = chooseDefaultPackedFileIndex(files);
  state.packedFile = files[state.packedFileIndex] ?? null;
  pushLog(
    t("log.selectedDirectory", {
      name: state.directoryName || t("selection.fieldDirectory"),
      count: files.length,
    }),
    "success",
  );
  if (state.packedFile) {
    pushLog(t("log.packedFileSelected", { path: getDisplayPath(state.packedFile) }), "info");
  } else {
    state.selectionStatus = {
      message: t("status.choosePackedFile"),
      tone: "warning",
    };
  }
  render();
}

function handlePackedFileChange() {
  state.packedFileIndex = Number(packedFileSelect.value);
  state.packedFile = state.directoryFiles[state.packedFileIndex] ?? null;
  resetOutput();
  if (state.packedFile) {
    state.selectionStatus = null;
    pushLog(t("log.packedFileSelected", { path: getDisplayPath(state.packedFile) }), "info");
  } else {
    state.selectionStatus = {
      message: t("status.choosePackedFile"),
      tone: "warning",
    };
  }
  render();
}

function handlePeVariantChange() {
  state.peVariant = peVariantSelect.value;
  resetOutput();
  pushLog(
    t("log.executableFormatSelected", { label: getPeVariantLabel(state.peVariant) }),
    "info",
  );
  render();
}

async function handleExtract() {
  if (!state.packedFile || state.busy) {
    return;
  }

  setBusy(true);
  resetOutput();
  state.outputStatus = {
    message: t("status.extractingExecutable"),
    tone: "neutral",
  };
  render();
  pushLog(t("log.readingFile", { fileName: state.packedFile.name }), "info");

  try {
    const input = new Uint8Array(await state.packedFile.arrayBuffer());
    pushLog(t("log.extractingVfs"), "info");
    const extracted = unpack(input);
    pushLog(
      t("log.restoringExecutable", { label: getPeVariantLabel(state.peVariant) }),
      "info",
    );
    const restoredExecutable = restoreExecutableWithInfo(input, {
      peVariant: state.peVariant,
    });
    if (restoredExecutable.autoDetected) {
      pushLog(
        t("log.executableFormatDetected", {
          label: getPeVariantLabel(restoredExecutable.peVariant),
        }),
        "success",
      );
    }
    for (const warning of restoredExecutable.warnings) {
      pushLog(t("log.executableWarning", { message: warning }), "warning");
    }
    const outputEntries = createOutputEntries(
      extracted.files,
      restoredExecutable.data,
      state.packedFile.name,
    );

    state.outputEntries = outputEntries;
    state.unsafeEntries = outputEntries.filter((entry) => isExecutableOrDllPath(entry.path));
    state.safeEntries = outputEntries.filter((entry) => !isExecutableOrDllPath(entry.path));
    state.outputStatus = {
      message: t("status.filesReady", { count: outputEntries.length }),
      tone: "success",
    };
    pushLog(
      t("log.filesPrepared", {
        count: outputEntries.length,
        size: formatBytes(sumEntrySizes(outputEntries)),
      }),
      "success",
    );
  } catch (error) {
    state.outputStatus = {
      message: t("error.extractionFailed", { message: error.message }),
      tone: "error",
    };
    pushLog(t("error.extractionFailed", { message: error.message }), "error");
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
  pushLog(t("log.buildingZip"), "info");
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
    state.outputStatus = {
      message: t("status.zipReady", { size: formatBytes(zipBlob.size) }),
      tone: "success",
    };
    pushLog(t("status.zipReady", { size: formatBytes(zipBlob.size) }), "success");
  } catch (error) {
    state.outputStatus = {
      message: t("error.zipCreationFailed", { message: error.message }),
      tone: "error",
    };
    pushLog(t("error.zipCreationFailed", { message: error.message }), "error");
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
    state.outputStatus = {
      message: t("error.folderWriteUnsupported"),
      tone: "error",
    };
    pushLog(t("error.folderWriteUnsupported"), "error");
    render();
    return;
  }

  setBusy(true);
  render();

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    if (!(await ensureReadWritePermission(directoryHandle))) {
      throw new Error(t("error.writePermissionDenied"));
    }
    const matchMessage = await ensureOutputDirectoryMatchesInput(directoryHandle);
    pushLog(matchMessage, "success");

    let written = 0;
    for (const entry of state.safeEntries) {
      await writeEntry(directoryHandle, entry);
      written += 1;
    }

    const writtenMessage = t("log.filesWritten", {
      written,
      skipped: state.unsafeEntries.length,
    });
    pushLog(writtenMessage, "success");
    state.folderWriteComplete = true;
    state.outputStatus = {
      message: writtenMessage,
      tone: "success",
    };
  } catch (error) {
    if (error?.name !== "AbortError") {
      state.outputStatus = {
        message: t("error.folderWriteFailed", { message: error.message }),
        tone: "error",
      };
      pushLog(t("error.folderWriteFailed", { message: error.message }), "error");
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

async function ensureOutputDirectoryMatchesInput(directoryHandle) {
  const expectedName = state.directoryName;
  const actualName = String(directoryHandle?.name ?? "");
  if (expectedName && actualName && actualName !== expectedName) {
    throw new Error(
      t("error.outputFolderMismatch", { actualName, expectedName }),
    );
  }

  const sentinel = findOutputDirectorySentinel();
  if (!sentinel) {
    if (!expectedName) {
      throw new Error(t("error.outputFolderUnverified"));
    }
    return t("log.outputFolderNameMatched", { expectedName });
  }

  const sentinelPath = getDisplayPath(sentinel);
  try {
    const fileHandle = await getExistingFileHandle(directoryHandle, sentinelPath);
    const outputFile = await fileHandle.getFile();
    if (outputFile.size !== sentinel.size) {
      throw new Error(
        t("error.sizeMismatch", {
          expectedSize: formatBytes(sentinel.size),
          actualSize: formatBytes(outputFile.size),
        }),
      );
    }
  } catch (error) {
    throw new Error(
      t("error.outputFolderSentinelFailed", {
        path: sentinelPath,
        message: error.message,
      }),
    );
  }

  return t("log.outputFolderCheckPassed", { path: sentinelPath });
}

async function getExistingFileHandle(rootHandle, path) {
  const segments = normalizeOutputPath(path).split("/");
  let directoryHandle = rootHandle;
  for (const segment of segments.slice(0, -1)) {
    directoryHandle = await directoryHandle.getDirectoryHandle(segment);
  }
  return directoryHandle.getFileHandle(segments.at(-1));
}

function render() {
  renderSelection();
  renderOutput();
  renderActions();
  renderLogs();
}

function renderSelection() {
  directoryName.textContent = state.directoryName || t("selection.none");
  directoryFileCount.textContent = String(state.directoryFiles.length);

  renderStatus(selectionStatus, state.selectionStatus);

  packedFileSelect.replaceChildren();
  if (state.directoryFiles.length === 0) {
    packedFileSelect.append(new Option(t("selection.selectDirectoryFirst"), ""));
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
  nwjsReminder.hidden = !state.folderWriteComplete;
  renderStatus(outputStatus, state.outputStatus);
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
    : [{ message: t("log.waitingForDirectory"), tone: "info" }];

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
  state.folderWriteComplete = false;
  state.outputStatus = null;
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

function renderStatus(element, status) {
  if (!status) {
    element.hidden = true;
    return;
  }
  element.hidden = false;
  element.textContent = status.message;
  element.classList.remove("is-neutral", "is-warning", "is-error", "is-success");
  element.classList.add(`is-${status.tone}`);
}

function chooseDefaultPackedFileIndex(files) {
  return getPackedFileOptionIndexes(files)[0] ?? -1;
}

function getPackedFileOptionIndexes(files) {
  const indexes = files.map((_file, index) => index);
  indexes.sort((left, right) => comparePackedFileCandidates(files[left], files[right]));
  return indexes;
}

function comparePackedFileCandidates(left, right) {
  const leftRank = getPackedFileRank(left);
  const rightRank = getPackedFileRank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  if (leftRank === 0) {
    return pathDepth(left) - pathDepth(right)
      || right.size - left.size
      || getDisplayPath(left).localeCompare(getDisplayPath(right));
  }

  return right.size - left.size
    || getDisplayPath(left).localeCompare(getDisplayPath(right));
}

function getPackedFileRank(file) {
  const name = file.name.toLowerCase();
  if (name === "game.exe") {
    return 0;
  }
  if (name.endsWith(".exe")) {
    return 1;
  }
  if (name.endsWith(".dll")) {
    return 2;
  }
  return 3;
}

function findOutputDirectorySentinel() {
  const candidates = state.directoryFiles
    .filter((file) => file !== state.packedFile)
    .filter((file) => !isExecutableOrDllPath(getDisplayPath(file)))
    .filter((file) => getDisplayPath(file));

  candidates.sort((left, right) =>
    Number(right.size > 0) - Number(left.size > 0)
      || pathDepth(left) - pathDepth(right)
      || right.size - left.size
      || getDisplayPath(left).localeCompare(getDisplayPath(right)),
  );

  return candidates[0] ?? null;
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
    throw new Error(t("error.invalidOutputPath", { path }));
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
  if (value === "auto") {
    return t("pe.auto");
  }
  return t("pe.layout", { version: String(value).replace("_", ".") });
}
