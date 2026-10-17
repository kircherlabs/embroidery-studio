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
