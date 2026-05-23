export const DEFAULT_LOCALE = "en";

const STRINGS = Object.freeze({
  en: Object.freeze({
    "document.title": "Browser Based Unpacker",
    "nav.goBack": "← Back to Version Select",
    "page.eyebrow": "Browser based unpacker",
    "page.heading": "Unpack a Game",
    "page.intro": "Select the game directory, confirm the packed executable, then export the unpacked output.",
    "section.selection": "Selection",
    "button.chooseDirectory": "Choose Directory",
    "selection.fieldDirectory": "Directory",
    "selection.fieldFiles": "Files",
    "selection.none": "None",
    "selection.packedFile": "Packed file",
    "selection.selectDirectoryFirst": "Select a directory first",
    "selection.executableFormat": "Executable format",
    "pe.auto": "Auto detect",
    "pe.layout": "{version} layout",
    "section.output": "Output",
    "button.extract": "Extract",
    "output.fieldUnpackedFiles": "Unpacked files",
    "output.fieldTotalSize": "Total size",
    "output.fieldSkippedForFolderWrite": "Skipped for folder write",
    "button.downloadZip": "Download Everything as ZIP",
    "button.writeFolder": "Modify the Game Folder",
    "download.heading": "Update NW.js Runtime",
    "download.copy": "The browser couldn't replace the old <code>Game.exe</code>.",
    "download.link": "nwjs-v0.110.1-win-x64.zip",
    "download.step1": "Save the ZIP in the folder with <code>Game.exe</code>.",
    "download.step2": "Unzip it there.",
    "download.step3": "Remove old <code>Game.exe</code> and rename <code>nwjs.exe</code> to <code>Game.exe</code>.",
    "section.activity": "Activity",
    "log.waitingForDirectory": "Waiting for a directory selection.",
    "log.directorySelectionCancelled": "Directory selection was cancelled.",
    "log.selectedDirectory": "Selected {name} with {count} files.",
    "log.packedFileSelected": "Packed file selected: {path}.",
    "status.choosePackedFile": "Choose a packed file before extraction.",
    "log.executableFormatSelected": "Executable format selected: {label}.",
    "status.extractingExecutable": "Extracting selected executable.",
    "log.readingFile": "Reading {fileName}.",
    "log.extractingVfs": "Extracting virtual filesystem.",
    "log.restoringExecutable": "Restoring executable ({label}).",
    "log.executableFormatDetected": "Executable format detected: {label}.",
    "log.executableWarning": "Executable warning: {message}",
    "status.filesReady": "{count} files ready for export.",
    "log.filesPrepared": "Prepared {count} files ({size}).",
    "error.extractionFailed": "Extraction failed: {message}",
    "log.buildingZip": "Building ZIP archive.",
    "status.zipReady": "ZIP ready: {size}.",
    "error.zipCreationFailed": "ZIP creation failed: {message}",
    "error.folderWriteUnsupported": "This browser does not support folder writing.",
    "error.writePermissionDenied": "Write permission was not granted.",
    "log.filesWritten": "Wrote {written} files. Skipped {skipped} .exe/.dll files.",
    "error.folderWriteFailed": "Folder write failed: {message}",
    "error.outputFolderMismatch": "Selected output folder \"{actualName}\" does not match input folder \"{expectedName}\".",
    "error.outputFolderUnverified": "Could not verify the selected output folder.",
    "log.outputFolderNameMatched": "Output folder name matched \"{expectedName}\".",
    "error.sizeMismatch": "expected {expectedSize}, found {actualSize}",
    "error.outputFolderSentinelFailed": "Selected output folder does not match the input folder. Could not verify {path}: {message}",
    "log.outputFolderCheckPassed": "Output folder check passed using {path}.",
    "error.invalidOutputPath": "Invalid output path: {path}",
  }),
  ko: Object.freeze({
    "document.title": "브라우저 언패커",
    "nav.goBack": "← 버전 선택으로 돌아가기",
    "page.eyebrow": "브라우저 언패커",
    "page.heading": "게임 언팩",
    "page.intro": "게임 폴더를 선택하고 패킹된 실행 파일을 확인한 뒤 언팩된 결과물을 내보내세요.",
    "section.selection": "선택",
    "button.chooseDirectory": "게임 폴더 선택",
    "selection.fieldDirectory": "폴더",
    "selection.fieldFiles": "파일 수",
    "selection.none": "없음",
    "selection.packedFile": "패킹된 파일",
    "selection.selectDirectoryFirst": "먼저 폴더를 선택하세요",
    "selection.executableFormat": "실행 파일 형식",
    "pe.auto": "자동 감지",
    "pe.layout": "{version} 구조",
    "section.output": "출력",
    "button.extract": "추출",
    "output.fieldUnpackedFiles": "언팩된 파일",
    "output.fieldTotalSize": "총 크기",
    "output.fieldSkippedForFolderWrite": "폴더 쓰기에서 제외됨",
    "button.downloadZip": "모두 ZIP으로 다운로드",
    "button.writeFolder": "게임 폴더에 적용",
    "download.heading": "NW.js 런타임 업데이트",
    "download.copy": "브라우저가 기존 <code>Game.exe</code>를 교체할 수 없습니다.",
    "download.link": "nwjs-v0.110.1-win-x64.zip",
    "download.step1": "<code>Game.exe</code>가 있는 폴더에 ZIP 파일을 저장하세요.",
    "download.step2": "그 위치에서 압축을 해제하세요.",
    "download.step3": "기존 <code>Game.exe</code>를 제거하고 <code>nwjs.exe</code> 이름을 <code>Game.exe</code>로 바꾸세요.",
    "section.activity": "활동 로그",
    "log.waitingForDirectory": "폴더가 선택되기를 기다리는 중입니다.",
    "log.directorySelectionCancelled": "폴더 선택이 취소되었습니다.",
    "log.selectedDirectory": "선택한 폴더: {name}. 파일 {count}개.",
    "log.packedFileSelected": "패킹된 파일 선택: {path}",
    "status.choosePackedFile": "추출하기 전에 패킹된 파일을 선택하세요.",
    "log.executableFormatSelected": "실행 파일 형식 선택: {label}",
    "status.extractingExecutable": "선택한 실행 파일을 추출하는 중입니다.",
    "log.readingFile": "파일을 읽는 중입니다: {fileName}",
    "log.extractingVfs": "가상 파일 시스템을 추출하는 중입니다.",
    "log.restoringExecutable": "실행 파일을 복원하는 중입니다({label}).",
    "log.executableFormatDetected": "실행 파일 형식 감지: {label}",
    "log.executableWarning": "실행 파일 경고: {message}",
    "status.filesReady": "내보낼 파일 {count}개가 준비되었습니다.",
    "log.filesPrepared": "파일 {count}개를 준비했습니다({size}).",
    "error.extractionFailed": "추출 실패: {message}",
    "log.buildingZip": "ZIP 아카이브를 만드는 중입니다.",
    "status.zipReady": "ZIP 준비 완료: {size}.",
    "error.zipCreationFailed": "ZIP 생성 실패: {message}",
    "error.folderWriteUnsupported": "이 브라우저는 폴더 쓰기를 지원하지 않습니다.",
    "error.writePermissionDenied": "쓰기 권한이 허용되지 않았습니다.",
    "log.filesWritten": "파일 {written}개를 기록했습니다. .exe/.dll 파일 {skipped}개를 건너뛰었습니다.",
    "error.folderWriteFailed": "폴더 쓰기 실패: {message}",
    "error.outputFolderMismatch": "선택한 출력 폴더는 {actualName}이고 입력 폴더는 {expectedName}입니다.",
    "error.outputFolderUnverified": "선택한 출력 폴더를 확인할 수 없습니다.",
    "log.outputFolderNameMatched": "출력 폴더 이름이 일치합니다: {expectedName}.",
    "error.sizeMismatch": "예상 {expectedSize}, 실제 {actualSize}",
    "error.outputFolderSentinelFailed": "선택한 출력 폴더가 입력 폴더와 일치하지 않습니다. {path} 파일을 확인할 수 없습니다: {message}",
    "log.outputFolderCheckPassed": "출력 폴더 확인 완료: {path}.",
    "error.invalidOutputPath": "잘못된 출력 경로: {path}",
  }),
});

export function resolveLocale(locale) {
  return normalizeLocale(locale).startsWith("ko") ? "ko" : DEFAULT_LOCALE;
}

export function detectPreferredLocale(navigatorLike = globalThis.navigator) {
  const candidates = [];

  if (Array.isArray(navigatorLike?.languages)) {
    candidates.push(...navigatorLike.languages);
  }

  if (navigatorLike?.language) {
    candidates.push(navigatorLike.language);
  }

  for (const candidate of candidates) {
    if (resolveLocale(candidate) === "ko") {
      return "ko";
    }
  }

  return DEFAULT_LOCALE;
}

export function createTranslator(locale = DEFAULT_LOCALE) {
  const resolvedLocale = resolveLocale(locale);
  const messages = STRINGS[resolvedLocale] ?? STRINGS[DEFAULT_LOCALE];
  const fallbackMessages = STRINGS[DEFAULT_LOCALE];

  return (key, params = {}) => {
    const template = messages[key] ?? fallbackMessages[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, token) => (
      Object.prototype.hasOwnProperty.call(params, token)
        ? String(params[token])
        : `{${token}}`
    ));
  };
}

function normalizeLocale(locale) {
  return String(locale ?? "").trim().toLowerCase();
}
