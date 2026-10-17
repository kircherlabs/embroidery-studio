# SVG regression artwork

`generated-artwork.svg` is the user's original `generated-artwork (1).svg`, copied
byte-for-byte for the SVG import regression requested by the repository owner.
It is not a synthetic substitute and must not be reformatted or simplified.

- 268,080 bytes; 96 paths, all with nonempty `d` attributes.
- SHA-256: `2c4ccb6e5bd29986956cc6943e1294dbbb5440ea4418476007846af43d223ee89`
- Includes compact signed coordinates, implicit command repetitions, relative
  subpaths, cubic/smooth curves, arcs and many closed contours.

The old moveto regex misreads 49 fragments, including `m602 0-1.5…`: it consumes
`0-1.5` as a single number and creates `NaN` in temporary path data. The original
XML remains valid; the importer creates the empty geometry that triggers the
native `getPointAtLength` exception.

The fixture yields 95 nondegenerate fill objects and 96 running outlines. Browser
regressions verify geometry and rendering against the original SVG, as well as
successful stitch generation and file-input import. Other synthetic cases cover
degenerate/unsupported elements, mixed stroke closure, transform handling,
resource cleanup and expected-versus-unexpected geometry exceptions.

`picsvg-outline.svg` is the user's `picsvg_modified (6).svg`, copied byte-for-byte
for the object travel regression. Do not reformat or simplify this fixture.

- 25,461 bytes, 11 black fill objects.
- SHA-256: `3d0cae6ce217addc0ab932a70eda680447349b655017fee3efb3c88d44fe9d78`
- On commit `575694a`, default import produced 5,417 sewing penetrations,
  694 jumps and 463 requested trims. The jumps comprise 683 within fills,
  10 between objects and one initial positioning command.
- The travel browser test checks every required top-fill needle position,
  contiguous source objects, sequence pinning/undo and an optional real PES
  round trip. No small-detail or duplicate-outline suppression is involved.
