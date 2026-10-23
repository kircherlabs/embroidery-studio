# Standard multi-hoop embroidery

Open **Machine & hoop → Multi-Hoop**. Export also offers this workflow for a
design exceeding one field. One `.embstudio` master retains all editable artwork,
text, curves, rails, groups, colors, effects and sewing actions. Layout changes
never resize artwork or enlarge the machine's continuous field.

## Place and inspect

**Auto place fields** suggests a two-dimensional layout using the selected real
machine/hoop dimensions, stitch footprint, safety clearance and requested minimum
overlap. Fields can also be added above/below/left/right, moved freely by dragging
their boundaries/number labels, or positioned by exact shared X/Y coordinates.
Alt bypasses 0.1 mm drag rounding. Reorder the fields with the arrow buttons.
Undo/Redo restores placement, assignments and source edits.

**Done positioning** returns Select to ordinary artwork editing. The production
layout stays active; subtle numbered field outlines remain available. **Use single
hoop** disables multi-hoop production without deleting its saved layout. Entering
again restores it. Normal single-hoop exports keep their existing behavior.

Blue/green and selected brown dashed boundaries are the actual sewing fields.
Fine dashed domains show source ownership; red source areas are uncovered.
Overlapping fields provide alignment space, not duplicate stitches. Safety margin
reserves clearance inside the field. The overlap value affects Auto place and Add;
it does not silently move manually positioned fields.

**Seams, assignments & clearance** exposes optional whole-object assignment and
split-balance X/Y. Split balance shifts ownership within overlaps while leaving
the physical field in place. It supports vertical and irregular arrangements.
Use **Selected hooping → Stitch preview** to inspect the real generated stitches
at each join, or **Assembled design** to inspect production order. The existing
Sequence, playback, jumps, trim markers and cleanup estimates apply to that view.
Master edits invalidate all derived sections. Export rejects stale source/layout
revisions, including changes made during package preparation.

## Splitting behavior and limits

Whole objects, complete sewing-action stacks and groups are preferred. Linked
fabric construction remains one atomic block; its placement, tackdown, stops and
finish cannot be silently scattered across files. A disconnected compound design
or word can distribute complete contours, including their counters, without
cutting a satin stroke or changing the master lettering's editability.

Oversized continuous **Tatami** and **Embossed Tatami** can be partitioned from
source polygons, preserving holes and exclusive area. Shared row/texture frames
avoid a phase reset between sections. Compensation extensions are capped at the
ownership domain before routing; underlay, ties and entry/exit are regenerated.
The underlying single-hoop fill paths retain their historical behavior.
Running, Bean and Triple source paths can also be cut and regenerated as open
fragments, preserving the intended repetition and avoiding artificial closing
edges. No finished machine sequence is clipped to manufacture sections.

Automatic interior cuts through satin columns/bands, paired rails, connected
lettering, appliqué, or contour/meander/cross/ripple/spiral fills are **blocked**
when their construction cannot be preserved. Complete versions still work when
assigned to a field. Move the split between disconnected contours, use existing
source/rail split tools, or explicitly revise the construction. Unsupported actions
are never silently converted to Tatami or dropped from an export.
Overlapping paint whose layering would reverse across hooping order also blocks
export; revise assignment or order deliberately.

Default clearance is 2 mm; actual decoded commands still must fit the real field.
Very complex jobs have interactive work safeguards: at most 64 field placements,
one million assembled preview commands, and the existing 250,000-command limit per
section. Expensive path/registration searches explain how to reduce work. These
are application budgets, not manufacturer capabilities.

## Registration and printing

**Stitch registration marks** is opt-in. Neighboring fields need two clear shared
points at least 8 mm apart. The search avoids finished source artwork and checks
both physical fields. If no connected clear pair is found, move fields or disable
stitched marks and use measured templates. No marks are placed through artwork
without notice. Only sections containing artwork receive registration stitches.

Marks use temporary running thread as the first action, followed by a required
operator pause before artwork. Before starting a subsequent file, align both
shared points and TOP with a dry needle. Restitching marks verifies an already
aligned placement; it does not automatically align the fabric. Replace temporary
thread at the pause, and remove marks after assembly. VP3 is omitted while a
required standalone pause is present; DST/EXP retain their documented color-pause
substitution. These existing format restrictions are not bypassed.

The ZIP includes actual-size SVGs and **PRINT-AT-100-PERCENT.html**. Open the HTML
in a browser, print on A4 at **100% / Actual size**, disable Fit/Shrink and browser
headers/footers, and **measure the 50 mm ruler**. Large fields tile with 10 mm page
overlap. Coordinates use millimeters: X right, Y down, TOP at negative Y.
Do not rotate, mirror, resize or auto-center individual sections at the machine.
Preserve fabric/stabilizer tension and verify at least two distant points each time.
Some formats or machines normalize file origins or center a design when loading.
The planned hoop frame is not a promise about that default machine placement.
Restore the planned position using the template, the guide's sewn-bounds center
offset, and two dry-needle alignment points before sewing. The manifest records
planned needle bounds separately from motion bounds; independent decoding checks
geometry/order, not physical machine placement.

## Export and compatibility

**Export hoopings** prepares a ZIP for a selected format or all six tested writers:
PES, PEC, DST, EXP, JEF and VP3. Each section runs the existing format preflight,
writer, decoder, needle/pause-order and physical-field checks. If one section
fails, the entire format set is omitted with reasons; incomplete sets are never
presented as usable. Review the result before downloading.

Choose **one compatible format directory**, then sew numbered files in order.
Do not sew every format. Non-native formats remain clearly labeled conversion
outputs; software encoding does not document compatibility with every machine.
JEF's legacy header limit (design dimensions reaching 200 mm), trim limitations,
VP3 travel/stop behavior, PEC palette/origin ranges, and oval-envelope warnings all
remain in force. Choose a smaller documented field where needed. Brother PES/PEC
writers and corrected origin handling are unchanged.

Contents: numbered format/hooping files, `START-HERE.txt`, shared-coordinate
`HOOPING-MANIFEST.json`, `OVERVIEW.svg`, per-hoop thread CSV/notes and templates.
Empty placements are identified and have no machine file. Digital colors and
physical spool snapshots remain in the master and companion thread instructions;
formats retain their existing metadata limitations. Save the master separately.

This implements standard physical rehooping with separate files. It does not
encode proprietary sliding/rotating/multi-position hoops or automatic reposition
commands. Tests validate software geometry, instructions, fields and print units.
**No physical alignment, fabric distortion or machine sew-out quality is claimed.**
Test seams and registration on scrap before a production sew-out.

## Research basis

[Hatch's multi-hooping reference](https://hatch.embroideryhelp.net/v3/en/OnlineHelp/References/quick_reference/Multi-Hooping_toolbox.htm)
separates field placement, overlaps, object distribution and registration preview.
Its [splitting-guide documentation](https://hatch.embroideryhelp.net/v4/en/OnlineHelp/Hints/hints_hoops/Add_splitting_lines.htm)
places adjustable splits within overlap. Brother's
[split-pattern guidance](https://support.brother.com/g/s/hf/htmldoc/hsm/om/ev1/en/pages/07_1117345.html)
emphasizes consistent physical alignment between hoopings; its specialized camera
and positioning features are not assumed for SE700 or other Studio profiles.
Implementation uses existing licensed geometry libraries and machine writers;
no proprietary splitting code or multi-position format was copied.
