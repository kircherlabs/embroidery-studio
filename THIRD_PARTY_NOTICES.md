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

## Research references

Ink/Stitch (GPL-3.0-or-later) and EmbroideryIO (MIT) were reviewed for architecture,
format capabilities and algorithm concepts. No source from either is included.
The studio geometry, scanline fill, centerline satin, tracing, interface and
simulation code are original. See `docs/RESEARCH.md` for the engineering rationale.
