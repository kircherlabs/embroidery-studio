# Third-party notices

## pyembroidery

The unchanged Python modules in `vendor/pyembroidery.zip` are from
[EmbroidePy/pyembroidery](https://github.com/EmbroidePy/pyembroidery), commit
`c16d1b46390a1632ee36ff98eb8b3ec01934a8e9`.
License: MIT. Copyright (c) 2018. The full license is included in the archive and
in `vendor/pyembroidery-LICENSE.txt`. Only `.py` source modules and the license
are packaged. No third-party executable is bundled.

## Pyodide

Machine import/export lazily loads Pyodide **0.27.7** from
`https://cdn.jsdelivr.net/pyodide/v0.27.7/full/`. Pyodide is licensed under MPL-2.0;
its Python, Emscripten and other components retain their upstream licenses.
See [Pyodide licenses](https://github.com/pyodide/pyodide/tree/0.27.7) and
the runtime's distributed license notices. The runtime is loaded unmodified,
separately from studio code. No artwork is included in those network requests.

## polygon-clipping

Boolean polygon operations use the vendored **polygon-clipping 0.15.7** UMD
bundle from [mfogel/polygon-clipping](https://github.com/mfogel/polygon-clipping).
License: MIT; the full upstream notices and attributions are included in
`vendor/polygon-clipping-LICENSE.md`. The bundle has an ESM export adapter;
its geometry implementation is unchanged. The source-map URL is omitted.
No network access is required at runtime.

Pinned npm tarball SHA-256:
`23bdea671a65011107d91536881f527c8e2e6820f59e4bc1408a94d7cc11d5b7`.

## Research references

Ink/Stitch (GPL-3.0-or-later) and EmbroideryIO (MIT) were reviewed for architecture,
format capabilities and algorithm concepts. No source from either is included.
The studio scanline fill, centerline satin, tracing, sequencing, interface and
simulation code are original; boolean operations use polygon-clipping as noted
above. See `docs/RESEARCH.md` for the engineering rationale.
