# Static Unpacker

A dependency-free JavaScript unpacker, ported from the
[original Python project](https://github.com/mos9527/evbunpack).

The web app entry point is `unpacker/index.html`. The browser/static library is
`unpacker/unpacker.js`; it does not use Node APIs and can be imported by a
static website:

```js
import {
  listFiles,
  restoreExecutable,
  unpack,
  unpackBlob,
} from "./unpacker/unpacker.js";

const result = await unpackBlob(fileInput.files[0]);
for (const file of result.files) {
  console.log(file.path, file.data);
}

const restoredExe = restoreExecutable(await fileInput.files[0].arrayBuffer(), {
  peVariant: "10_70",
});
```

`file.data` is a `Uint8Array`. A website can feed those bytes to a ZIP writer,
the File System Access API, or any other static/client-side download flow.
`restoreExecutable` returns the reconstructed PE as a `Uint8Array`.

The shipped static app lets a user choose a directory, confirms `Game.exe` (or
the largest file if no `Game.exe` is present), extracts the contents, then
offers a full ZIP download or a browser folder write that skips `.exe` and
`.dll` files.

## Node helpers

The helper scripts are only for local verification and command-line use:

```sh
node unpacker/cli.mjs input.exe output-dir
node unpacker/verify-fixture.mjs
```

For local browser testing:

```sh
python dev-server.py
```

The dev server intentionally lives outside `unpacker/`; `unpacker/` contains
only the static app, the pure JavaScript utility, and local verification/CLI
helpers.

The CLI restores the executable by default. Use `--ignore-pe` for VFS-only
extraction or `--ignore-fs` for executable-only reconstruction. The default PE
variant is `9_70`, matching the Python CLI default; pass `--pe-variant 10_70`
or `--pe-variant 7_80` for those packer versions.

`verify-fixture.mjs` expects the local ignored `transpile-test/` fixture to be
present.

## License

Apache-2.0. This repository keeps the Apache license from the original project
and identifies the upstream source above and in `NOTICE` for attribution.
