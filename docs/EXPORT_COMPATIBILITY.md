# Export evidence and restrictions

The application distinguishes four things: a writer exists, file round-trip tests
pass, a manufacturer documents the exact model/format, and hardware has been used.
Passing the first three does not establish physical sew-out compatibility.

The pinned MIT pyembroidery implementation exports PES, PEC, DST, EXP, JEF and VP3.
HUS, VIP and PHC have no writer in that dependency and are not export choices.

| Format | Software evidence | Important current restriction |
| --- | --- | --- |
| PES v6 | Native and browser round trips; independent PEC/CSewSeg decoding | Up to 255 encoded color/pause blocks; corrected PEC 12-bit origin must fit. |
| PEC | Native and browser round trips; independent origin/needle checks | Fixed PEC palette; stops consume encoded blocks; same origin guard. |
| DST | Native and browser round trips; bounded movement splitting | No embedded spool colors; standalone stops appear as color-change pauses. |
| EXP | Native/browser and independent test delta decoder | No embedded spool colors or BERNINA companion color file; stops appear as color pauses. |
| JEF | Native/browser and independent test delta decoder | Fixed Janome palette; no explicit trim commands in this writer; legacy hoop headers only. |
| VP3 | Native/browser needle checks, absolute block-start regression | Writer cannot preserve standalone stops; those exports are blocked. Travel representation differs from explicit jumps. |

JEF's pinned writer chooses a legacy hoop code from design dimensions independently
of the selected physical hoop. At 200 mm or above on either axis it falls back to
an incorrect older hoop code. These exports are blocked. Full RE28b field export
is **not verified**; choose a smaller design or use machine-vendor conversion.
For smaller designs, confirm the required physical hoop and placement at the machine.
Jump-trim behavior depends on machine settings; decoded trim heuristics do not prove
that an explicit trim instruction was encoded.

The export dialog reports relevant limits before conversion. It then compares actual
decoded needle positions and pause order with the generated plan before allowing a
download. Format-induced extra needle positions are reported. Project artwork,
sewing actions, original colors and equipment selection remain unchanged. The simulator
continues to show the actual decoded file after a successful export.

The VP3 compatibility reader corrects a pinned-reader defect at absolute color-block
starts with X=0, Y=0 or (0,0). It is MIT-attributed derived reader code; the vendor
archive, writers, stitch algorithms and on-disk geometry are not changed by that fix.

## Exact models

- SE700: PES (app default), DST documented by [Brother](https://support.brother.com/g/b/sp/faqend.aspx?c=us&faqid=faqh00100271_002&ftype3=2103&lang=en&prod=hf_se700eus).
- Flourish II: PES (app default), DST documented by [Baby Lock](https://babylock.com/flourish-ii).
- MC500E: JEF documented by [Janome](https://www.janome.ca/product/memory-craft-500e/); legacy-header restrictions above still apply.
- B 500 SDT: EXP (app default), DST, PES, PEC, JEF are among the documented formats in
  [BERNINA's 5 Series brochure](https://www.bernina.com/bernina/media/products/Sewing%2C%20Quilting%20and%20Embroidery/NEW%20BERNINA%205%20Series/Brosch%C3%BCren/B%20540/BERNINA_5_Series_Broschuere_B540_EN_SDT.pdf).
- creative 1.5: VP3 documented by the [Pfaff brand blog](https://www.pfaffblog.de/blog/software/details/items/fuer-alle-pfaff-creative-15-besitzer.html).
- SE9180: VP3 documented by [Singer](https://www.singer.com/products/singer-se9180-sewing-and-embroidery-machine).
- Jade 35: field documented; exact-format primary manual review remains pending.

Generic/custom profiles make no manufacturer compatibility claim. Users may select
other implemented formats for conversion; the dialog explains the lack of model
evidence. The previously independently repaired SE700 PES file was physically stitched;
newly generated files and other models have no additional hardware validation here.

Tests: `tests/export-safety.test.mjs`, `tests/test_format_safety.py`,
`tests/export-safety-browser.mjs`, existing codec/PES suites. These inspect real needle
coordinates, signed movement, orientation, colors/pauses, origins, headers and rejection
paths. They are not physical machine tests.


Physical spool IDs are distinct from approximate RGB. With physical assignments,
PES/PEC same-RGB transitions (including transitions to/from an unassigned paint)
decode as repeated-color operator stops. The required pauses remain present; follow
the project thread list and choose spools for unassigned entries. Round-trip safety
checks verify pause count/order as well as every original needle position. Six-format
browser tests cover both assigned spools and mixed assigned/unassigned directions.
