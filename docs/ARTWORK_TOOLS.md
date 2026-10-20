# Reversible effects, sewing styles and repeats

Version 0.12.0 completes the advanced-artwork milestone alongside the editable
path lettering delivered in 0.11.0. These tools change real geometry and sewing
actions; simulation and exports use their generated results.

## Artwork effects

Select unlocked vector artwork and open **Properties → Artwork → Artwork effects**.
Set simplification tolerance (0–1 mm) and expansion/contraction (−5 to +5 mm), then
choose **Apply / update effects**. Simplification runs before the contour offset.
Positive offset expands material and contracts holes; negative offset insets it.
Offsets require closed areas. Open curves can be simplified while keeping endpoints.

Every update reconstructs from the retained original, avoiding cumulative erosion.
Original Smart Shape parameters, Bézier handles, editable lettering, baselines and
prior corner rounding are saved inside the effect source. **Remove · edit original**
restores that source at the current transform without changing sewing actions.
Zero effect values also restore it. **Bake to paths** explicitly converts the result
to ordinary editable contours; Undo restores both the source and effect.

Whole-shape and vertex corner rounding remain under **Round shape corners**. Apply
rounding before the new effects, or remove them to edit the original first. Node,
Knife, Eraser and join edits require removing or baking effects. Existing Boolean
tools explicitly convert their result to paths and remain reversible through Undo.

Effects reject collapsed contours and changes in island/counter topology, rather
than silently deleting details or merging pieces. Very aggressive simplification
may be rejected. Values use source millimeters before subsequent scaling, just like
Smart Shape source dimensions. Source transforms are stored separately, so moving,
resizing, rotating and mirroring never repeatedly apply an offset.

Paired satin rails retain their dedicated width and source editing tools. Reference
images and manual needle data do not accept these vector contour effects.

## Transfer sewing style

Use **Arrange → Copy sewing style** on one object and its selected sewing action.
Then select targets and choose **Arrange → Transfer sewing style…**. The same menu
is available through canvas right-click. Alternatively, choose any project artwork
as the source directly in the transfer dialog, then choose its sewing action.

- **Thread color only:** changes the target action's thread without changing its
  method, settings or geometry.
- **One sewing action's method & settings:** updates the existing target action.
  Does not add an action or replace neighboring actions. Includes relevant density,
  stitch length, satin width, underlay, compensation and other compatible settings.
- **Complete sewing-action setup:** replaces the target's full ordered setup,
  including names, enabled states and stops. Requires checking an explicit replacement
  confirmation. Creates independent action identities; it does not copy source IDs.

For one object, the selected action is edited. Multiselection follows the inspector's
first-action/all-sewing-actions bulk scope, displayed in the dialog. Incompatible
targets reject the whole transfer with a named explanation. A collapsed construction
inset is rejected. Undo restores the previous setup.

Geometry-specific direction guides and start points are not transplanted. Existing
target guides remain when its method stays the same. Paired-rail satin styles require
paired-rail targets. External patch/artwork links are never copied as a style. Existing
construction stages remain attached when changing a single action. Whole-setup
replacement is an intentional construction change; review its stops and sequence.

## Repeat artwork

Select artwork or a complete SVG/group, then choose **Arrange → Repeat artwork…**.

- **Linear / duplicate offset:** specify total instances, including the original,
  and X/Y distance between successive copies.
- **Radial:** specify total instances, angle per copy and center X/Y in hoop
  coordinates. Rotate copies with the pattern, or keep their orientation unchanged.
- **Duplicate & flip horizontally/vertically:** makes one reflected copy about the
  selection center, then applies the X/Y offset. Editable lettering is also mirrored;
  the dialog says so explicitly.

Copies retain nested groups, contours, holes, Bézier handles, portable lettering,
effects, references and complete sewing actions. The original stays unchanged.
The dialog reports actual artwork bounds, hoop clearance and repeated stop counts.
Reference-image bounds remain excluded from embroidery clearance and exports.

Manual sewing order retains the source's own ordering and inserts each complete copy
block after it. Tree-linked manual order continues to follow hierarchy. Automatic
color/travel optimization remains automatic. Operations and patch dependencies are
not interleaved arbitrarily: repeating a linked patch requires its whole artwork block.
New patch links and action IDs are remapped inside each copied group.

Patterns are limited to 64 total instances and 2,000 new objects per command. Locked
descendants must be unlocked first. Over-hoop patterns may be created deliberately;
they are clearly reported and remain subject to normal export clearance checks.

### Optional linked geometry

Enable **Link copies to original geometry** to keep ordinary vector or lettering
copies connected to their source. Geometry edits and source transformations propagate;
each instance retains its own additional placement transform and independent sewing
actions. This includes updates to the source's effects and text/font changes.

Select a linked instance and use **Artwork → Linked artwork → Select original** to
reshape it, or **Unlink selected copies** to restore independent editable source
parameters at the instance transform. Node and other direct source edits explain
this distinction. Moving/resizing/rotating an instance changes only its transform.
Deleting the original freezes copies at their last contours and reports that change;
Undo restores the link. No artwork silently disappears.

Linked repeats of paired satin rails, manual needle data and reference images are
excluded with guidance to use independent copies. Links point directly to an original,
never to another link; repeating a linked copy resolves to its original. Copy/paste of
a whole linked group remaps internal source IDs. Pasting a copy into a project without
its original retains the last contours as independent artwork.

Sources, effects, instance transforms and links persist in `.embstudio` files.
Linked geometry resolves before stitch planning as well as after edits, so stale cached
contours cannot drive machine export. The embroidery algorithms, graph travel optimizer
and Brother PES/PEC origin encoding are unchanged.

The Brother reader bridge also handles adjacent pause commands individually. The
pinned library previously waited for a stitch before classifying repeated-thread
pauses, mislabeling a stop immediately followed by a color change. The fix reads
each existing pause in order; it changes neither writer bytes nor needle positions.
Raw PEC pause counts and independently decoded coordinates are tested separately.

## Validation and limits

Automated tests inspect source recovery, bounded simplification, islands/counters,
reflection/rotation, nested groups, linked propagation/unlinking/deletion, sewing order,
action identity, reinforcement needle commands, stops and project persistence.
Browser tests exercise the real dialogs, canvas movement, Undo/Redo, save/reload,
mobile access and export. Independent PES decoding compares every needle coordinate,
full dimensions, origin fields and pause/color-change instructions with the plan.

This is software validation. Material-specific coverage and the newly generated
combinations still require physical sew-outs on the SE700. Effects are not a general
parametric modifier stack, and style transfer does not automatically redigitize
geometry-specific satin guides. Review guide placement after changing source shapes.
