# Closed Shape curve editing

Select an ordinary closed vector outline and choose **Edit Points**.

- Double-click an **anchor** to toggle Corner / Smooth. Smooth keeps a continuous
  tangent with independently sized handles; dragging one retains the opposite
  handle's length. Double-click again restores the saved corner and its handles.
- Double-click an **edge** to toggle Straight / Curved. A new curve starts with
  a modest outward bow. Only that edge's outgoing/incoming controls change;
  neighboring edge handles stay in place. Later toggles retain edited curves.
- Double-click **empty filled interior** to smooth/restore its containing contour.
  Anchor positions stay fixed. Restoration retains original handles and geometry.
  Holes and other contours remain separate. Invalid crossings, collapsed contours
  or changed hole topology reject the operation without modifying the artwork.

The existing node-editing toolbar provides **Change to Corner (1)**,
**Change to Smooth (2)**, **Break Handles (3)** and **Add & Remove Points (4)**.
Names/shortcuts appear on hover; Hints adds detailed explanations. Only the
directly selected active object exposes editable nodes. Selecting an anchor shows
only its incoming/outgoing handle pair; selecting an edge shows only the start
anchor’s outgoing handle and end anchor’s incoming handle. Other tangents stay
hidden and cannot accept pointer hits. With no node or edge selected, only anchors
are shown. Selecting another node/edge switches the pair immediately. Multiselection,
group selection, hidden/locked objects and leaving Edit Points hide their controls
without changing stored geometry. Properties retains a contour selector for holes
or disconnected outlines and the optional equal-length Symmetric action.

**Change to Corner** releases tangent constraints without deleting handles.
**Break Handles** explicitly unlinks two existing curved controls, retaining their
positions. It is never an automatic double-click action. **Change to Smooth**
reconnects tangent directions while retaining independent lengths. The existing
equal-length **Symmetric handles** action remains available in Properties.
For an existing edge, **Ctrl/Command-double-click** inserts an anchor without
changing its cubic geometry. Shift-double-click remains an alternative. The
canvas context menu (right-click, touch hold, or Shift+F10 after selecting an edge)
also provides edge toggling, contour smoothing/restoration and insertion.

**Add & Remove Points** is a toggle, not a new drawing mode or dropdown. Click/tap
an edge to add a point, or a highlighted anchor to remove it. Select the button
again to return to ordinary node editing. Curved insertion uses exact de Casteljau
subdivision. Removing a split point recovers its parent curve when possible;
other curved removals use a tangent-based fit with a sampled two-way 0.25 mm
physical-deviation guard. This tolerance is a removal safety limit, not a stitch
spacing setting or a guarantee for arbitrary unsampled geometry. Unsafe edits,
collapsed contours and changes to holes are rejected without modifying artwork.
Closed contours retain at least three anchors; open paths retain two. The point
tool applies to ordinary vector artwork; rails, live lettering and manual needle
data retain their dedicated editing workflows. Smart Shapes become paths when
their source points are explicitly edited. Undo restores the original source.

Point edits commit on pointer release, so touch navigation, cancellation and
accidental drags do not insert/delete anchors. Selecting another object or leaving
node editing exits the point tool. Geometry hover marks are editing aids only.

Smooth anchors are circular; corners are square. Explicitly broken controls use
the existing guide color. All retain the application's high-contrast editing style.
Click an anchor or edge before choosing its contextual action.

These shortcuts apply only while editing a selected closed vector. Open paths,
manual rails, lettering baselines and ordinary selection retain their existing
double-click behavior, including nested Focus Mode. Backgrounds, tangent handles
and other objects do not trigger whole-shape smoothing.

Each operation is one Undo/Redo edit and regenerates ordinary sewing actions.
Source nodes, independent handles and restoration data survive project files,
duplication, group transforms and My Artwork. Smart Shapes become editable paths
when their nodes are explicitly edited; Undo restores their parametric source.
Live lettering, effects and linked copies retain their dedicated editing controls.

The existing 2,000-anchor Bézier budget and interactive geometry-validation budget
still apply. Large/invalid outlines receive an explanation instead of destructive
smoothing. This changes editable source geometry, never the embroidery algorithms.
