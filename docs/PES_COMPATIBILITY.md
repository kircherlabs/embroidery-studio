# Brother PES origin compatibility

## Cause and focused repair

The supplied HayDave export declared **75.2 × 40.4 mm**, and contained the complete
5,660-stitch design. Its PEC dimensions, PES CSewSeg geometry and thumbnails were
already complete. The defect was the four-byte positioning/origin prefix before
the PEC stitch sequence. In this file it contained `(54, -33)` instead of
`(430, 169)`, in 0.1 mm units. The subsequent movement stream has minimum
coordinates `(-430, -169)` relative to its first head position; the required
prefix is `(-minX, -minY)`.

Brother SE700 testing by the repository owner confirmed that changing these four
bytes restored the entire design at its intended size. Intersecting the declared
rectangle with the actual stream bounds reproduces the reported half-size
37.6 × 20.2 mm failure. That intersection is an empirical diagnostic model,
**not a documented description of Brother firmware**.

The pinned PyEmbroidery writer emits an initial long jump in this location. Its
reader consumes the same words as an ordinary initial jump, so its own round trip
can preserve all relative geometry while missing the Brother placement problem.
Current upstream [PecWriter.py](https://github.com/EmbroidePy/pyembroidery/blob/main/pyembroidery/PecWriter.py)
uses the same layout. The [PEC format description](https://edutechwiki.unige.ch/en/Embroidery_format_PEC)
documents the big-endian `0x9000 - minX` / `0x9000 - minY` pair after the fixed
stitch-block header. This is a placement/header compatibility defect; no stitch
coordinate needs multiplying by two.

`src/pec_compat.py` independently walks the encoded movement stream after that
prefix, including jumps and trim movements. It checks framing, declared bounds
and the signed 12-bit range, then replaces only those four bytes. Invalid output
fails explicitly instead of silently wrapping. `src/codec.py` applies this to
PES and standalone PEC exports. The vendored library remains unchanged.

The PES v6 addendum, color tables, CSewSeg blocks, thumbnails, stitch deltas, trim
encoding and other formats remain intact. The adapter repairs the supplied
broken file **byte-for-byte identically** to the supplied hardware-tested file.

## Coordinate frames in the studio

PES/PEC place the design in a local positive-coordinate frame; the studio uses a
hoop-centered millimeter frame. On import, the bridge translates the whole design
into the centered frame. On export, it aligns the decoded sequence with the
source's first needle position for inspection in the original design frame.
Both operations are constant translations, preserving every relative position,
dimension and instruction. They do not modify the exported bytes or rescale
artwork. Absolute placement on the machine is subject to its placement controls.

## Regression coverage

`tests/pes-export.test.mjs` runs the production Python exporter and decodes its
bytes with an independent JavaScript decoder adapted from the supplied repair
package. It checks known dimensions (including 75.2 × 40.4 mm), short/long signed
movements, asymmetric orientation, multicolor generated designs, commands,
CSewSeg points, thumbnail preservation, standalone PEC, origin limits and a
mutation that reintroduces the faulty centered prefix. GitHub Actions runs this
suite automatically, with the existing native codec tests and browser checks.

For the actual browser/Pyodide path, start the server, install Playwright as
described in the README, then run:

```sh
node tests/pes-browser.mjs
```

This test requires access to the pinned Pyodide CDN. It imports the supplied
hardware-tested file, exports through the application's download dialog,
independently checks all 5,660 sewing positions and the full 75.2 × 40.4 mm
bounds, and verifies that the decoded simulator retains every needle position.
It writes a report, screenshot and re-exported PES to ignored `test-results/`.

The supplied fixed file has passed the owner's physical SE700 check. Files newly
exported by this integration still need a physical machine check: full artwork
and dimensions on the machine, a scrap-fabric sew-out, multicolor changes/trims,
and designs near the hoop limits. Automated geometry checks cannot validate
fabric response or undocumented firmware behavior.
