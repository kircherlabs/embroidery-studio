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

The existing tool-context bar provides **Closed Shape → Node / edge action** for
keyboard/touch use. The Properties pane also has **Closed Shape node controls**,
including a contour selector for holes or disconnected outlines.

**Change to Corner** releases tangent constraints without deleting handles.
**Break Handles** explicitly unlinks two existing curved controls, retaining their
positions. It is never an automatic double-click action. **Change to Smooth**
reconnects tangent directions while retaining independent lengths. The existing
equal-length **Symmetric handles** action remains available in Properties.
**Insert anchor on selected edge** retains the previous node-insertion capability.

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
