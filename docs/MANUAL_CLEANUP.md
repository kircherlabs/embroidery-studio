# Manual cleanup and sequence inspection

In **Stitch preview → Display**, enable **Show Manual Trims** beside **Show Jumps**.
This is a diagnostic estimate of connecting threads to inspect after embroidery,
not an optimizer or an instruction to the machine to cut.

- Blue dashed lines show jump movement.
- Orange crosses show trim commands/decoded trim markers. They do not prove a
  physical cut occurred.
- Solid red connections and filled circles indicate no effective trim in the
  assessed sequence. Dashed red connections and hollow circles are trim-dependent:
  inspect them if the machine leaves the connection uncut.
- Explicitly annotated exposed travel is distinguished from jumps and described
  as sewn travel. Inspect it carefully before cutting sewn thread.

**Potential manual trims** counts connecting threads, not raw jump commands. Its
disclosure separates untrimmed and trim-dependent estimates and lists locations
in pages of 25. Select a location to synchronize playback and highlight/focus that
connection on the canvas. Length is the approximate straight span between the
last sewn anchor and the next needle penetration; routed jump movement is reported
separately. Explicit exposed travel uses its actual sewn polyline and length.

The estimate follows the authoritative sequence. Consecutive jumps form one
connection; initial positioning, free end tails, coincident anchors and color-change
boundaries do not create false bridges. Stops alone do not sever a thread. Normal
running stitches, ties, underlay and known internal fill travel are not inferred
to need cutting based on distance. Later coverage, fabric/thread behavior and
hidden travel in imported files cannot be reliably inferred, so these are estimates.

## Readable command timeline

The existing command track uses separate lanes/shapes for cleanup, jump, trim and
pause events. Ordinary sewing marks aggregate into screen-pixel bins. Important
events remain inspectable even when co-located: hover for details, click/tap a
marker, and use **‹ / ›** to inspect individual members of its cluster. **Zoom here**
separates a dense group. Different pause types in the same bin remain individually
accessible, including color changes and stops.

Use **+ / − / Fit** to zoom around the playback cursor. The compact pan slider
appears only when zoomed. Ctrl/Command-wheel zooms at the pointer; Shift-wheel pans.
Focus the command track and use Left/Right for significant events, Home/End for
first/last, and +/− for zoom. The original full-sequence scrubber, playback and
single-command navigation remain unchanged. The Sequence panel keeps its existing
resize, collapse and mobile toggle behavior.

## Machine and format assumptions

Generated plans are assessed for the saved preferred export format of the current
machine. An individual export switches the existing simulator to its decoded file;
the cleanup report then uses those actual returned events, without decoding again
during rendering. ZIP export keeps the existing view. Machine imports retain their
source format as optional object metadata, including through project save/reload.
The selected output format still governs the current generated-plan estimate.

The [Brother SE700 operation manual](https://download.brother.com/welcome/doch102582/888p10_om01en.pdf)
documents thread cutting at completion of a color **when automatic thread cutting
is enabled**. Studio cannot read that machine setting or verify execution of
same-color jump trims. The estimator therefore does not equate a PES trim request
or decoded trim event with a guaranteed physical cut. No new hardware capability
or machine setting is assumed.

The pinned PyEmbroidery bridge requests explicit trims, but formats differ:

- PES/PEC and EXP represent trim information; physical execution remains uncertain.
- DST uses jump sequences as a trimming convention; machine interpretation varies.
- **JEF's writer omits explicit trims. Its reader may infer trim events from jump
  distance (default 3 mm).** Those decoded markers do not suppress cleanup candidates
  or count as proof of encoded cuts. Existing jump/trim statistics are unchanged.
- VP3 travel/trim representation differs from a raw jump stream. The decoded view
  is preferable, and hardware behavior remains unverified.
- Unknown source interpretations remain explicitly uncertain.

Relevant implementation evidence: `src/codec.py`, the pinned
`vendor/pyembroidery.zip` JefReader/JefWriter/DstReader/EXP/PEC modules and existing
`src/export-safety.js`. Writers, decoder behavior, origins and routing are unchanged.

The report is cached per displayed plan. Playback reuses it; ordinary timeline
marks aggregate by pixel and important markers cluster without losing members.
There is no additional decoding, history entry or project edit when toggling,
zooming, panning or inspecting cleanup. Export commands remain unchanged.
