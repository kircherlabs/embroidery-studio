# Machines and design fields

Open **Machine & hoop** above the canvas. Choose **Brand → Model → Hoop**.
The library contains 42 documented model profiles across seven brands, with common
discontinued models and generation-specific module requirements. Find a model searches
across brands; Brand → Model → Hoop remains available. Included/optional hoop labels
appear where verified. Each profile links to its evidence under Profile details & sources.
See [expanded model coverage and source register](EQUIPMENT_EXPANSION.md). This remains
a curated library, not a promise that every model generation or optional hoop is supported.

Dimensions are usable design-field envelopes in millimeters, with approximate
inches in the hoop selector. Outer physical hoop dimensions are separate and
remain unknown unless sourced. An oval envelope does not guarantee clearance at
its corners: inspect the physical template. Multi-position hoops and automatic
split-hoop production are not offered as larger continuous fields.

Switching equipment never scales, crops or moves artwork. Canvas bounds and
stitch-fit checks update immediately. If a design is outside the field, use
**View full design**, **Center design in hoop**, or the existing selection handles
and numerical transform controls. These actions are explicit and reversible;
locked artwork stays protected. Export remains blocked for out-of-field commands.

**Generic / Custom** includes common field dimensions without asserting machine
compatibility. **Custom machine…** creates a named profile using millimeters or
inches (5–1000 mm application range), plus a preferred export format. Custom
profiles can be edited, duplicated or deleted, with named hoop presets within
their maximum continuous field. Custom data is always labeled user-provided.

**Use as My Machine** remembers the machine and hoop for new designs on this
device. Editing a preferred custom profile updates that preference. Each project
also carries its own equipment snapshot; opening a project does not overwrite
personal defaults. Deleting a local preset does not invalidate previously saved
projects. Profile-library edits are personal settings; project Undo restores the
project selection and its snapshot, not the personal preset library.

Storage key: `embroidery-equipment-v1`. Project version stays 1; optional
`equipment` metadata has its own schema and catalog revision. Legacy `se700`,
`brother130` and `generic200` load without rewriting artwork. The latter two are
dimension presets, not verified machine models. Unknown real-machine movement
limits and speeds are not invented: the existing 7 mm planning limit and 400/600
SPM timing assumptions are application defaults, explicitly not official specs.

Documented dimensions, implemented file encoding, software round-trip checks and
physical machine tests are different evidence levels. The independently repaired
SE700 PES file was stitched previously; current exports and other models still
require hardware validation. Stage B tracks format-specific restrictions and
additional model evidence in [the milestone report](EQUIPMENT_THREADS_PROGRESS.md).
