# Static Unpacker

A dependency-free JavaScript unpacker, ported from the
[original Python project](https://github.com/mos9527/evbunpack).

The browser/static entry point is `unpacker/unpacker.js`. It does not use Node
APIs and can be imported by a static website:

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

## Node helpers

The helper scripts are only for local verification and command-line use:

```sh
node unpacker/cli.mjs input.exe output-dir
node unpacker/verify-fixture.mjs
```

The CLI restores the executable by default. Use `--ignore-pe` for VFS-only
extraction or `--ignore-fs` for executable-only reconstruction. The default PE
variant is `9_70`, matching the Python CLI default; pass `--pe-variant 10_70`
or `--pe-variant 7_80` for those packer versions.

`verify-fixture.mjs` expects the local ignored `transpile-test/` fixture to be
present.

## License

Apache-2.0. This repository keeps the Apache license from the original project
and identifies the upstream source above and in `NOTICE` for attribution.
