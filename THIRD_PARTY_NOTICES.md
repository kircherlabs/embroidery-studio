# Third-party notices

## pyembroidery

The unchanged Python modules in `vendor/pyembroidery.zip` are from
[EmbroidePy/pyembroidery](https://github.com/EmbroidePy/pyembroidery), commit
`c16d1b46390a1632ee36ff98eb8b3ec01934a8e9`.
License: MIT. Copyright (c) 2018. The full license is included in the archive and
in `vendor/pyembroidery-LICENSE.txt`. Only `.py` source modules and the license
are packaged. No third-party executable is bundled.

`src/vp3_compat.py` adapts the VP3 reader from the same MIT-licensed pinned
source. It corrects absolute color-block start handling when X or Y is zero.
The archive remains unchanged; the compatibility reader retains upstream license
and copyright attribution. No writer bytes are altered by this reader correction.

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

## Clipper

`vendor/clipper.js` contains the original **clipper-lib 6.4.2** npm package
(JavaScript implementation version 6.4.2.2), with a local CommonJS-to-ESM export
adapter. Source: [junmer/clipper-lib](https://github.com/junmer/clipper-lib).
Copyright Angus Johnson 2010–2017 and Timo; Boost Software License 1.0, retained
in `vendor/clipper-LICENSE.txt`. Its embedded JSBN code is copyright Tom Wu
2003–2005, with the full original notice in `vendor/jsbn-LICENSE.txt` (mirrored
from [andyperlitch/jsbn](https://github.com/andyperlitch/jsbn/blob/master/LICENSE)).
All original source copyright headers remain intact. Used for closed contour
offsets; no runtime download or npm dependency is required.

Pinned npm tarball SHA-256:
`634d7d7627939bbe63405f8876c43ba4009b1fec7ef8de153b0bed28e42466ec`.

## Research references

Ink/Stitch (GPL-3.0-or-later) and EmbroideryIO (MIT) were reviewed for architecture,
format capabilities and algorithm concepts. No source from either is included.
The studio scanline fill, centerline satin, tracing, sequencing, interface and
simulation code are original; boolean operations use polygon-clipping as noted
above. See `docs/RESEARCH.md` for the engineering rationale.

The stroke-satin topology, branch partition, rails and travel algorithms are
original implementations. Ink/Stitch documentation, topology-thinning descriptions
and the MIT MAT/SAT project were reviewed conceptually; no source from those
projects is bundled. See `docs/SATIN.md` for references and limits.

## Personal physical thread catalogs

No third-party physical thread RGB catalog or official conversion dataset is bundled.
Manufacturer names identify user-provided products and do not imply endorsement or
identical colors between brands. The existing MIT PEC palette is machine-format data,
not a physical Brother/New brothread/Simthread product catalog. Local user import does
not grant redistribution rights. Build policy blocks known research files and physical
catalog assets until an explicit redistribution review is completed.
