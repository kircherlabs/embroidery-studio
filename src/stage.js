import { getMachine } from "./equipment.js";
import {
  selectionBox,
  boxPoint,
  boxHandles,
  resizeBox,
  handleCursor,
} from "./transform-box.js";
import {
  nearestSegment,
  worldCurve,
  sculptArtwork,
  alignHandle,
  pencilCurve,
  sculptCurve,
} from "./path-editing.js";
import { letteringCurve, updateLetteringCurve } from "./text-path.js";
import {
  detachSource,
  curveRings,
  curveContours,
  mapPoint,
  inversePoint,
  splitCurve,
  regenerateShape,
  regenerateRails,
  railWalk,
} from "./smart-geometry.js";
import { objectBounds, pointsOf, bounds } from "./model.js";
import { inside, distance } from "./engine.js";
import { movementSegments } from "./preview.js";
import {
  closedCurveEditable,
  editClosedCurve,
} from "./closed-curve-editing.js";
import { drawCleanupOverlay } from "./manual-cleanup.js";
import { drawHoopingOverlay } from "./multi-hoop-overlay.js";
import { closedOutlinePreview, drawClosedOutline } from "./outline-preview.js";
import {
  EDITING_STYLE,
  strokeEditingPath,
  editingHandle,
  drawSourceOverlay,
  sourceThread,
} from "./editing-overlay.js";
import { snapTranslation } from "./arrange.js";
import {
  selectedLeaves,
  selectionIds,
  selectionBounds,
  transformSelection,
  isVisible,
  isLocked,
  ancestors,
  within,
} from "./hierarchy.js";
export class Stage {
  satinGuideTarget() {
    const selection = selectedLeaves(this.state, { editable: true });
    if (selection.length !== 1 || !isVisible(this.state.project, selection[0]))
      return null;
    const o = selection[0],
      op = o.operations?.find(
        (op) =>
          op.id === this.state.satinGuideEdit &&
          op.type === "column" &&
          ["stroke", "rails"].includes(op.columnMode),
      );
    return op ? { o, op } : null;
  }

  activeCurve(o) {
    return o?.satinRails
      ? o.satinRails[this.state.railSide || "a"]
      : letteringCurve(o || {}) ||
          (o?.curve
            ? curveContours(o.curve)[this.contour || 0] || o.curve
            : null);
  }
  updateCurve(o, c) {
    if (o.satinRails) {
      o.satinRails[this.state.railSide || "a"] = c;
      regenerateRails(o);
    } else if (o.textSource?.path) {
      try {
        updateLetteringCurve(o, c);
        if (this.drag) this.drag.pathError = null;
      } catch (e) {
        if (!this.drag?.before) throw e;
        Object.assign(
          o,
          JSON.parse(this.drag.before).objects.find((n) => n.id === o.id),
        );
        this.drag.pathError = e.message;
      }
    } else {
      delete c.exactRing;
      if (o.curve?.contours && this.contour > 0) {
        const part = { ...c };
        delete part.frame;
        o.curve.contours[this.contour - 1] = part;
      } else o.curve = c;
      o.rings = curveRings(o.curve);
    }
  }
  constructor(canvas, state, actions) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = state;
    this.actions = actions;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.draft = [];
    this.node = null;
    this.contour = 0;
    this.segment = null;
    this.pointers = new Map();
    this.referenceImages = new Map();
    this.dpr = devicePixelRatio || 1;
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", () => this.cancelDrag());
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const dy =
            e.deltaY *
            (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.h : 1),
          dx = e.deltaX * (e.deltaMode === 1 ? 16 : 1),
          trackpad =
            this.navigationMode === "trackpad" ||
            (this.navigationMode !== "mouse" &&
              e.deltaMode === 0 &&
              (dx !== 0 || Math.abs(dy) < 40));
        if (e.ctrlKey || e.metaKey || !trackpad)
          this.zoomAt(
            Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.001)),
            e.offsetX,
            e.offsetY,
          );
        else {
          this.pan.x -= dx;
          this.pan.y -= dy;
          this.render();
        }
      },
      { passive: false },
    );
    canvas.addEventListener("dblclick", (e) => {
      if (this.satinGuideTarget()) return;
      if (this.draft.length) {
        this.draft.pop();
        this.actions.finish();
      } else if (this.state.tool === "node") {
        if (!this.closedDoubleClick(this.toWorld(e)))
          this.insertNode(this.toWorld(e));
      } else if (this.state.tool === "select") {
        const hit = this.hit(this.toWorld(e));
        if (hit) {
          const id = this.canvasTarget(hit);
          this.state.isolation = id;
          this.actions.select(id);
        }
      }
    });
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const world = this.toWorld(e);
      const hit =
        this.hit(
          world,
          selectedLeaves(this.state, { editable: true, visible: true }),
        ) || this.hit(world);
      if (hit && !selectedLeaves(this.state).some((o) => o.id === hit.id))
        this.actions.select(this.canvasTarget(hit, e.altKey));
      this.actions.contextMenu?.({ x: e.clientX, y: e.clientY });
    });
    canvas.addEventListener("keydown", (e) => {
      if (e.key === "Home" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        this.fit();
      }
      if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
        e.preventDefault();
        e.stopPropagation();
        const r = canvas.getBoundingClientRect();
        this.actions.contextMenu?.({
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
        });
      }
      if (["+", "=", "-"].includes(e.key) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        this.zoomAt(e.key === "-" ? 0.8 : 1.25);
      }
    });
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    this.dpr = devicePixelRatio || 1;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.render();
  }
  get scale() {
    const m = getMachine(this.state.project);
    return (
      Math.min(
        Math.max(20, this.w - 40) / (m.width + 12),
        Math.max(20, this.h - 40) / (m.height + 12),
      ) * this.zoom
    );
  }
  get center() {
    return { x: this.w / 2 + this.pan.x, y: this.h / 2 + this.pan.y };
  }
  toWorld(e) {
    const r = this.canvas.getBoundingClientRect(),
      c = this.center;
    return {
      x: (e.clientX - r.left - c.x) / this.scale,
      y: (e.clientY - r.top - c.y) / this.scale,
    };
  }
  fit() {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.render();
  }
  fitSelection() {
    const selected = selectedLeaves(this.state);
    if (!selected.length) {
      this.fitDesign();
      return;
    }
    this.fitObjects(selected);
  }
  fitDesign() {
    const objects = this.state.project.objects.filter(
      (o) => o.type !== "reference" && isVisible(this.state.project, o),
    );
    if (!objects.length) {
      this.fit();
      return;
    }
    this.fitObjects(objects, true);
  }
  fitObjects(objects, all = false) {
    const b = selectionBounds(objects),
      ids = new Set(objects.map((o) => o.id)),
      stitches = (this.state.plan?.events || []).filter(
        (e) => e.cmd === "stitch" && (all || ids.has(e.objectId)),
      );
    // Include generated borders/offsets without excluding retained source details.
    if (stitches.length) {
      const sewn = bounds(stitches);
      b.minX = Math.min(b.minX, sewn.minX);
      b.maxX = Math.max(b.maxX, sewn.maxX);
      b.minY = Math.min(b.minY, sewn.minY);
      b.maxY = Math.max(b.maxY, sewn.maxY);
      b.width = b.maxX - b.minX;
      b.height = b.maxY - b.minY;
    }
    this.fitBounds(b);
  }
  centerView() {
    this.pan = { x: 0, y: 0 };
    this.render();
  }
  fitBounds(b) {
    this.zoom = 1;
    const base = this.scale;
    this.zoom = Math.max(
      0.02,
      Math.min(
        32,
        Math.min(
          Math.max(20, this.w - 48) / (b.width + 4),
          Math.max(20, this.h - 48) / (b.height + 4),
        ) / base,
      ),
    );
    this.pan = {
      x: -((b.minX + b.maxX) / 2) * this.scale,
      y: -((b.minY + b.maxY) / 2) * this.scale,
    };
    this.render();
  }
  canvasTarget(o, direct = false) {
    if (direct) return o.id;
    const chain = [o, ...ancestors(this.state.project, o)];
    const index = chain.findIndex((n) => n.id === this.state.isolation);
    return (index > 0 ? chain[index - 1] : index === 0 ? o : chain.at(-1)).id;
  }
  handles(b) {
    return boxHandles(b, this.scale);
  }
  selectionBox(objects) {
    return selectionBox(objects, this.state.transformOrientation);
  }
  zoomAt(f, x = this.w / 2, y = this.h / 2) {
    const old = this.scale,
      c = this.center;
    this.zoom = Math.max(0.02, Math.min(32, this.zoom * f));
    const ratio = this.scale / old;
    this.pan.x += (x - c.x) * (1 - ratio);
    this.pan.y += (y - c.y) * (1 - ratio);
    this.render();
  }
  drawReferences(ctx) {
    const p = this.state.project;
    for (const id of this.referenceImages.keys())
      if (!p.referenceAssets?.[id]) this.referenceImages.delete(id);
    for (const o of p.objects)
      if (o.type === "reference" && isVisible(p, o)) {
        if (this.state.isolation && !within(p, o, this.state.isolation))
          continue;
        const r = o.reference,
          asset = p.referenceAssets?.[r.assetId];
        if (!asset) continue;
        let cached = this.referenceImages.get(r.assetId);
        if (!cached || cached.data !== asset.data) {
          const image = new Image();
          cached = { image, data: asset.data };
          this.referenceImages.set(r.assetId, cached);
          image.onload = () => this.render();
          image.src = asset.data;
        }
        if (!cached.image.complete || !cached.image.naturalWidth) continue;
        ctx.save();
        ctx.globalAlpha = r.opacity;
        ctx.transform(...r.frame);
        ctx.drawImage(cached.image, -0.5, -0.5, 1, 1);
        ctx.restore();
      }
  }
  invalidate() {
    this.render();
  }
  path(ctx, rings, close = true) {
    ctx.beginPath();
    for (const r of rings) {
      if (!r.length) continue;
      ctx.moveTo(r[0].x, r[0].y);
      for (let i = 1; i < r.length; i++) ctx.lineTo(r[i].x, r[i].y);
      if (close) ctx.closePath();
    }
  }
  render() {
    if (!this.w || !this.h) return;
    const ctx = this.ctx,
      s = this.state,
      scale = this.scale,
      c = this.center,
      m = getMachine(s.project);
    this.transformCage = null;
    const selection = selectedLeaves(s, { editable: true, visible: true }),
      selected = selection.length === 1 ? selection[0] : null,
      activeIds = new Set(selection.map((o) => o.id));
    const editing =
      this.drag &&
      [
        "move",
        "resize",
        "rotate",
        "node",
        "sculpt",
        "radius",
        "satin-guide",
      ].includes(this.drag.type);
    if (scale <= 0) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = "#d9dccf";
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.translate(c.x, c.y);
    ctx.scale(scale, scale);
    if (!s.project.multiHoop?.enabled) {
      ctx.fillStyle = "#b2bca3";
      ctx.strokeStyle = "#a4b195";
      ctx.lineWidth = 1 / scale;
      this.roundRect(
        ctx,
        -m.width / 2 - 6,
        -m.height / 2 - 6,
        m.width + 12,
        m.height + 12,
        9,
      );
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f3f0e1";
      this.roundRect(
        ctx,
        -m.width / 2 - 1.5,
        -m.height / 2 - 1.5,
        m.width + 3,
        m.height + 3,
        4,
      );
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.rect(-m.width / 2, -m.height / 2, m.width, m.height);
      ctx.clip();
      // Subtle woven substrate, kept at a fixed physical spacing.
      ctx.strokeStyle = "#e6e3d3";
      ctx.lineWidth = 0.4 / scale;
      ctx.beginPath();
      for (let x = -m.width / 2; x <= m.width / 2; x += 1) {
        ctx.moveTo(x, -m.height / 2);
        ctx.lineTo(x, m.height / 2);
      }
      for (let y = -m.height / 2; y <= m.height / 2; y += 1) {
        ctx.moveTo(-m.width / 2, y);
        ctx.lineTo(m.width / 2, y);
      }
      ctx.stroke();
      ctx.strokeStyle = "#c7cbb9";
      ctx.lineWidth = 0.6 / scale;
      ctx.beginPath();
      for (let x = -m.width / 2; x <= m.width / 2; x += 10) {
        ctx.moveTo(x, -m.height / 2);
        ctx.lineTo(x, m.height / 2);
      }
      for (let y = -m.height / 2; y <= m.height / 2; y += 10) {
        ctx.moveTo(-m.width / 2, y);
        ctx.lineTo(m.width / 2, y);
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "#a0aa92";
      ctx.lineWidth = 0.7 / scale;
      ctx.setLineDash([3 / scale, 4 / scale]);
      ctx.strokeRect(-m.width / 2, -m.height / 2, m.width, m.height);
      ctx.setLineDash([]);
      ctx.fillStyle = "#7c896f";
      ctx.font = `${8 / scale}px system-ui`;
      ctx.textAlign = "center";
      for (let x = -m.width / 2; x <= m.width / 2; x += 20)
        ctx.fillText(
          String(Math.round(x + m.width / 2)),
          x,
          -m.height / 2 - 8 / scale,
        );
      ctx.textAlign = "right";
      for (let y = -m.height / 2; y <= m.height / 2; y += 20)
        ctx.fillText(
          String(Math.round(y + m.height / 2)),
          -m.width / 2 - 9 / scale,
          y + 3 / scale,
        );
    } else {
      ctx.fillStyle = "#f3f0e1";
      ctx.fillRect(-c.x / scale, -c.y / scale, this.w / scale, this.h / scale);
      if (s.grid) {
        ctx.strokeStyle = "#9fac8d35";
        ctx.lineWidth = 0.5 / scale;
        ctx.beginPath();
        for (
          let x = Math.floor(-c.x / scale / 10) * 10;
          x < (this.w - c.x) / scale;
          x += 10
        ) {
          ctx.moveTo(x, -c.y / scale);
          ctx.lineTo(x, (this.h - c.y) / scale);
        }
        for (
          let y = Math.floor(-c.y / scale / 10) * 10;
          y < (this.h - c.y) / scale;
          y += 10
        ) {
          ctx.moveTo(-c.x / scale, y);
          ctx.lineTo((this.w - c.x) / scale, y);
        }
        ctx.stroke();
      }
    }
    if (s.mode === "design") this.drawReferences(ctx);
    if (s.mode === "design")
      for (const o of s.project.objects.filter(
        (o) => o.type !== "reference" && isVisible(s.project, o),
      )) {
        if (s.isolation && !within(s.project, o, s.isolation)) continue;
        const activeEditing = editing && activeIds.has(o.id),
          thread = activeEditing
            ? sourceThread(o, s.activeOperationId)
            : { color: o.color, type: o.type, width: o.width };
        ctx.globalAlpha = s.showStitches ? (activeEditing ? 0.22 : 0.13) : 0.8;
        ctx.fillStyle = activeEditing ? thread.color : o.color;
        ctx.strokeStyle = activeEditing ? thread.color : o.color;
        if (o.type === "fill") {
          this.path(ctx, o.rings);
          ctx.fill(o.fillRule || "evenodd");
        } else if (o.type !== "manual") {
          ctx.globalAlpha = s.showStitches
            ? activeEditing
              ? 0.4
              : 0.25
            : 0.85;
          ctx.lineWidth = (
            activeEditing ? thread.type === "satin" : o.type === "satin"
          )
            ? thread.width
            : 0.3;
          this.path(ctx, o.rings, o.closed);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    if (s.showStitches || s.mode === "preview") {
      const events = s.plan?.events || [],
        end =
          s.mode === "preview"
            ? Math.min(s.cursor, events.length)
            : events.length;
      let batchColor = null,
        batchPhase = null,
        batchAlpha = null;
      const focus = new Set(selectedLeaves(s).map((o) => o.id));
      const isolated = new Set(
        s.project.objects
          .filter((o) => !s.isolation || within(s.project, o, s.isolation))
          .map((o) => o.id),
      );
      const included = (e) =>
        !(editing && activeIds.has(e.objectId)) &&
        (!s.isolation || !e.objectId || isolated.has(e.objectId)) &&
        (!s.previewSelection ||
          !focus.size ||
          (focus.has(e.objectId) &&
            (!s.activeOperationId || e.operationId === s.activeOperationId)));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 0.19;
      ctx.beginPath();
      for (const { from: prev, event: e } of movementSegments(events, end)) {
        if (
          e.cmd === "stitch" &&
          included(e) &&
          (s.showUnderlay || !e.phase?.startsWith("underlay"))
        ) {
          const alpha = e.phase?.startsWith("underlay")
            ? 0.4
            : focus.size &&
                e.objectId &&
                (!focus.has(e.objectId) ||
                  (s.activeOperationId &&
                    e.operationId !== s.activeOperationId))
              ? 0.25
              : 0.92;
          if (
            e.color !== batchColor ||
            e.phase !== batchPhase ||
            alpha !== batchAlpha
          ) {
            ctx.stroke();
            ctx.beginPath();
            batchColor = e.color;
            batchPhase = e.phase;
            ctx.strokeStyle = e.color;
            ctx.globalAlpha = alpha;
            batchAlpha = alpha;
          }
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(e.x, e.y);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (s.showJumps) {
        ctx.setLineDash([1, 0.7]);
        ctx.lineWidth = 0.9 / scale;
        ctx.strokeStyle = "#467fa5";
        ctx.beginPath();
        for (const { from: prev, event: e } of movementSegments(events, end)) {
          if (e.cmd === "jump" && included(e)) {
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(e.x, e.y);
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (s.showManualTrims && !editing)
        drawCleanupOverlay(ctx, s.cleanupReport, {
          scale,
          end,
          selected: s.cleanupSelected,
          included: (c) =>
            included({
              objectId: c.toObjectId,
              operationId: events[c.resumeIndex]?.operationId,
            }) ||
            included({
              objectId: c.fromObjectId,
              operationId: events[c.startIndex]?.operationId,
            }),
        });
      if (s.showEvents) {
        for (let i = 0; i < end; i++) {
          const e = events[i];
          if (!["trim", "color", "stop"].includes(e.cmd) || !included(e))
            continue;
          ctx.lineWidth = 1 / scale;
          ctx.strokeStyle = e.cmd === "trim" ? "#be6e33" : e.color;
          ctx.beginPath();
          const r = 2.5 / scale;
          if (e.cmd === "trim") {
            ctx.moveTo(e.x - r, e.y - r);
            ctx.lineTo(e.x + r, e.y + r);
            ctx.moveTo(e.x - r, e.y + r);
            ctx.lineTo(e.x + r, e.y - r);
          } else if (e.cmd === "stop") ctx.rect(e.x - r, e.y - r, r * 2, r * 2);
          else ctx.arc(e.x, e.y, r * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (s.mode === "preview" && end > 0) {
        const e = events[end - 1];
        ctx.beginPath();
        ctx.arc(e.x, e.y, 4 / scale, 0, Math.PI * 2);
        ctx.fillStyle = "#fff4d7";
        ctx.fill();
        ctx.strokeStyle =
          e.cmd === "trim"
            ? "#be6e33"
            : e.cmd === "jump"
              ? "#467fa5"
              : e.cmd === "color"
                ? e.color
                : "#263c2a";
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(e.x - 8 / scale, e.y);
        ctx.lineTo(e.x + 8 / scale, e.y);
        ctx.moveTo(e.x, e.y - 8 / scale);
        ctx.lineTo(e.x, e.y + 8 / scale);
        ctx.stroke();
      }
    }
    if (selection.length && s.mode === "design") {
      for (const o of selection)
        drawSourceOverlay(ctx, o, scale, {
          band: !!editing,
          activeOperationId: s.activeOperationId,
          multiple: selection.length > 1,
        });
      // Hidden descendants still transform with a selected parent. Use the same
      // complete editable scope for the drawn cage and pointer hit testing.
      const b = this.selectionBox(selectedLeaves(s, { editable: true }));
      this.transformCage = { box: b, handles: this.handles(b) };
      strokeEditingPath(
        ctx,
        (c) => {
          for (const [i, p] of [
            [b.minX, b.minY],
            [b.maxX, b.minY],
            [b.maxX, b.maxY],
            [b.minX, b.maxY],
          ]
            .map(([x, y]) => boxPoint({ x, y }, b))
            .entries())
            i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
          c.closePath();
        },
        scale,
        { width: 1, dash: [4, 3] },
      );
      if (
        s.tool === "node" &&
        selected &&
        selected.type !== "reference" &&
        selectionIds(s).length === 1 &&
        s.selection === selected.id
      ) {
        const editableCurve = this.activeCurve(selected);
        const points = editableCurve
          ? editableCurve.nodes.map((p) => mapPoint(p, editableCurve.frame))
          : pointsOf(selected);
        if (editableCurve)
          for (const n of editableCurve.nodes)
            for (const key of ["in", "out"])
              if (n[key]) {
                const a = mapPoint(n, editableCurve.frame),
                  b = mapPoint(n[key], editableCurve.frame);
                strokeEditingPath(
                  ctx,
                  (c) => {
                    c.moveTo(a.x, a.y);
                    c.lineTo(b.x, b.y);
                  },
                  scale,
                  { color: EDITING_STYLE.guide, width: 1.1, dash: [3, 2] },
                );
                editingHandle(ctx, b, scale, {
                  shape: "circle",
                  radius: 3,
                  color: EDITING_STYLE.guide,
                });
              }
        points.forEach((p, i) => {
          editingHandle(ctx, p, scale, {
            radius: 3,
            active: this.node === i,
            shape:
              editableCurve?.nodes[i].mode === "smooth" ||
              editableCurve?.nodes[i].mode === "symmetric"
                ? "circle"
                : "square",
            color: editableCurve?.nodes[i].broken
              ? EDITING_STYLE.guide
              : EDITING_STYLE.ink,
          });
        });
      } else {
        strokeEditingPath(
          ctx,
          (c) => {
            const a = boxPoint({ x: (b.minX + b.maxX) / 2, y: b.minY }, b),
              r = this.handles(b).at(-1);
            c.moveTo(a.x, a.y);
            c.lineTo(r.x, r.y);
          },
          scale,
          { width: 1 },
        );
        if (selected?.shape?.kind === "rect") {
          const sh = selected.shape,
            pt = mapPoint(
              {
                x: sh.width / 2 - Math.max(sh.radius, 2),
                y: -sh.height / 2 + 2,
              },
              sh.frame,
            );
          editingHandle(ctx, pt, scale, {
            shape: "diamond",
            radius: 4,
            color: EDITING_STYLE.guide,
          });
        }
        for (const { id, x, y } of this.handles(b)) {
          editingHandle(ctx, { x, y }, scale, {
            shape: id === "rotate" ? "circle" : "square",
            radius: id === "rotate" ? 4 : 3.5,
          });
        }
      }
    }
    if (
      selected?.satinRails &&
      s.mode === "design" &&
      isVisible(s.project, selected)
    ) {
      for (const [side, color] of [
        ["a", EDITING_STYLE.railA],
        ["b", EDITING_STYLE.railB],
      ]) {
        const c = railWalk(selected.satinRails, side),
          r = curveRings(c)[0];
        strokeEditingPath(ctx, () => this.path(ctx, [r], c.closed), scale, {
          color,
          width: side === (s.railSide || "a") ? 2.2 : 1.3,
          dash: side === "a" ? [] : [4, 2],
        });
        const start = mapPoint(c.nodes[0], c.frame);
        editingHandle(ctx, start, scale, {
          color,
          shape: side === "a" ? "circle" : "diamond",
          radius: 4,
        });
      }
    }
    if (
      selected?.textSource?.path &&
      s.mode === "design" &&
      s.tool === "node" &&
      isVisible(s.project, selected)
    ) {
      const c = letteringCurve(selected);
      strokeEditingPath(
        ctx,
        () => this.path(ctx, curveRings(c), c.closed),
        scale,
        { color: EDITING_STYLE.guide, width: 1.5, dash: [6, 3] },
      );
    }
    if (this.railDraftA) {
      strokeEditingPath(
        ctx,
        () =>
          this.path(ctx, curveRings(this.railDraftA), this.railDraftA.closed),
        scale,
        { color: EDITING_STYLE.railA, width: 2 },
      );
    }
    if (s.satinStructure || s.satinGuideEdit) {
      ctx.save();
      ctx.lineWidth = 1.1 / scale;
      const ids = new Set(selection.map((o) => o.id));
      if (s.satinStructure)
        for (const result of s.plan?.diagnostics?.satin || [])
          if (ids.has(result.objectId))
            for (const stroke of result.strokes) {
              const color = result.fallback
                ? EDITING_STYLE.warning
                : EDITING_STYLE.railA;
              strokeEditingPath(
                ctx,
                () => this.path(ctx, [stroke.center], false),
                scale,
                { color, width: 1.1 },
              );
              for (let i = 0; i < stroke.sections.length; i += 3) {
                const q = stroke.sections[i];
                strokeEditingPath(
                  ctx,
                  () => this.path(ctx, [[q.a, q.b]], false),
                  scale,
                  { color, width: 1, dash: [2, 2], alpha: 0.85 },
                );
              }
            }
      for (const o of selection)
        for (const op of o.operations || [])
          if (
            op.type === "column" &&
            (!s.activeOperationId || op.id === s.activeOperationId)
          )
            for (const g of op.satinGuides || []) {
              strokeEditingPath(
                ctx,
                () => this.path(ctx, [[g.a, g.b]], false),
                scale,
                { color: EDITING_STYLE.guide, width: 1.5, dash: [3, 2] },
              );
              for (const p of [g.a, g.b]) {
                editingHandle(ctx, p, scale, {
                  shape: "diamond",
                  radius: 5,
                  color: EDITING_STYLE.guide,
                });
              }
            }
      ctx.restore();
    }
    if (this.guides?.length) {
      ctx.save();
      for (const guide of this.guides) {
        strokeEditingPath(
          ctx,
          (cx) => {
            if (guide.axis === "x") {
              cx.moveTo(guide.position, -c.y / scale);
              cx.lineTo(guide.position, (this.h - c.y) / scale);
            } else {
              cx.moveTo(-c.x / scale, guide.position);
              cx.lineTo((this.w - c.x) / scale, guide.position);
            }
          },
          scale,
          { color: EDITING_STYLE.snap, width: 1.1, dash: [5, 3] },
        );
      }
      ctx.restore();
    }
    if (this.draft.length) {
      if (s.tool === "polygon")
        drawClosedOutline(ctx, closedOutlinePreview(this.draft), scale);
      else {
        strokeEditingPath(
          ctx,
          () =>
            this.path(
              ctx,
              s.tool === "pencil" && this.pencilPreview
                ? curveRings(this.pencilPreview)
                : ["pen", "rails"].includes(s.tool)
                  ? curveRings({ nodes: this.draft, closed: false })
                  : [this.draft],
              false,
            ),
          scale,
          {
            color:
              s.tool === "rails"
                ? this.railDraftA
                  ? EDITING_STYLE.railB
                  : EDITING_STYLE.railA
                : EDITING_STYLE.ink,
          },
        );
      }
      for (const p of s.tool === "pencil" ? [] : this.draft) {
        editingHandle(ctx, p, scale, { shape: "circle", radius: 3 });
      }
    }
    if (this.drag?.type === "vector-stroke") {
      const erasing = this.drag.kind === "eraser";
      ctx.save();
      if (erasing) {
        ctx.strokeStyle = EDITING_STYLE.warning;
        ctx.lineWidth = s.eraseWidth || 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = 0.22;
        this.path(ctx, [this.drag.points], false);
        ctx.stroke();
      }
      strokeEditingPath(
        ctx,
        () => this.path(ctx, [this.drag.points], false),
        scale,
        { color: EDITING_STYLE.warning, dash: erasing ? [] : [5, 2] },
      );
      ctx.restore();
    }
    if (this.shape || this.marquee) {
      const { start: a, end: b } = this.shape || this.marquee;
      strokeEditingPath(
        ctx,
        (c) =>
          c.rect(
            Math.min(a.x, b.x),
            Math.min(a.y, b.y),
            Math.abs(a.x - b.x),
            Math.abs(a.y - b.y),
          ),
        scale,
        { width: 1.1, dash: [3, 2] },
      );
    }
    drawHoopingOverlay(ctx, s, scale, this.drag?.type === "multi-hoop");
    document.getElementById("zoom-value").textContent =
      Math.round(this.zoom * 100) + "%";
    document.getElementById("navigation-hint").textContent =
      this.drag?.type === "pan"
        ? "Panning view · artwork stays in place"
        : s.space
          ? "Pan view · release Space to return to editing"
          : s.tool === "pan"
            ? "Hand tool · drag to pan · + / − to zoom"
            : this.navigationMode === "trackpad"
              ? "Scroll to pan · pinch or Ctrl-scroll to zoom"
              : this.navigationMode === "mouse"
                ? "Wheel zoom · Space-drag to pan · F fits selection"
                : "Wheel zoom · trackpad scroll pan · pinch to zoom";
    document
      .querySelector('[data-tool="pan"]')
      ?.classList.toggle("temporary", Boolean(s.space));
    this.canvas.style.cursor =
      this.drag?.type === "resize"
        ? handleCursor(this.drag.handle, this.drag.b)
        : this.drag?.type === "rotate"
          ? "grabbing"
          : s.tool === "pan" || s.space || this.drag?.type === "pan"
            ? this.drag
              ? "grabbing"
              : "grab"
            : this.satinGuideTarget()
              ? "crosshair"
              : ["select", "node"].includes(s.tool)
                ? "default"
                : "crosshair";
  }
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
  hit(p, candidates = this.state.project.objects) {
    return [...candidates].reverse().find((o) => {
      if (
        !isVisible(this.state.project, o) ||
        isLocked(this.state.project, o) ||
        (this.state.isolation &&
          !within(this.state.project, o, this.state.isolation))
      )
        return false;
      const b = objectBounds(o),
        pad = (o.type === "satin" ? o.width / 2 : 0) + 4 / this.scale;
      if (
        p.x < b.minX - pad ||
        p.x > b.maxX + pad ||
        p.y < b.minY - pad ||
        p.y > b.maxY + pad
      )
        return false;
      if (o.type === "reference")
        return (
          selectionIds(this.state).some((id) =>
            within(this.state.project, o, id),
          ) && inside(p, o.rings)
        );
      if (o.type === "fill") return inside(p, o.rings, o.fillRule);
      for (const pts of o.type === "manual" ? [o.commands] : o.rings)
        for (
          let i = 1;
          i < pts.length + (o.type !== "manual" && o.closed ? 1 : 0);
          i++
        ) {
          if (o.type === "manual" && pts[i].cmd !== "stitch") continue;
          const a = pts[i - 1],
            b = pts[i % pts.length],
            l = distance(a, b) ** 2,
            t = l
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l,
                  ),
                )
              : 0;
          if (
            distance(p, {
              x: a.x + (b.x - a.x) * t,
              y: a.y + (b.y - a.y) * t,
            }) < pad
          )
            return true;
        }
      return false;
    });
  }
  undoDraft(redo = false) {
    if (
      this.state.mode !== "design" ||
      !["polygon", "run", "satin", "manual", "pen"].includes(this.state.tool) ||
      !this.draftEditing
    )
      return false;
    this.draftRedo ||= [];
    if (redo) {
      if (this.draftRedo.length) this.draft.push(this.draftRedo.pop());
    } else if (this.draft.length) this.draftRedo.push(this.draft.pop());
    if (this.drag?.type === "pen") this.drag = null;
    this.actions.draft();
    this.render();
    return true;
  }
  down(e) {
    if (e.button !== 0 && e.button !== 1) return;
    if (e.button === 1) e.preventDefault();
    this.canvas.focus();
    const s = this.state,
      p = this.toWorld(e);
    if (s.tool === "node") {
      const previous = this.nodeClickContext,
        now = performance.now();
      if (
        !previous ||
        now - previous.time > 500 ||
        distance(p, previous.point) > 5 / this.scale
      )
        this.nodeClickContext = { id: s.selection, time: now, point: p };
    }
    this.canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === "touch") {
      if (!this.pointers.size) {
        this.touchDraft = structuredClone(this.draft);
        this.touchDraftEditing = this.draftEditing;
        this.touchDraftRedo = structuredClone(this.draftRedo || []);
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        if (this.drag?.before)
          this.state.project = JSON.parse(this.drag.before);
        this.drag = null;
        this.shape = null;
        this.marquee = null;
        this.draft = this.touchDraft || [];
        this.draftEditing = this.touchDraftEditing;
        this.draftRedo = structuredClone(this.touchDraftRedo || []);
        this.actions.draft();
        this.actions.refresh();
        const [a, b] = [...this.pointers.values()];
        this.gesture = {
          distance: distance(a, b),
          center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
        this.render();
        return;
      }
      if (this.pointers.size > 2) return;
    }
    if (s.tool === "pan" || s.space || e.button === 1) {
      this.drag = {
        type: "pan",
        x: e.clientX,
        y: e.clientY,
        pan: { ...this.pan },
      };
      return;
    }
    if (s.mode === "preview") {
      let best = 10 / this.scale,
        index = -1;
      (s.plan?.events || []).forEach((v, i) => {
        if (!["stitch", "jump"].includes(v.cmd)) return;
        const d = distance(p, v);
        if (d < best) {
          best = d;
          index = i;
        }
      });
      if (index >= 0) this.actions.scrub(index + 1);
      return;
    }
    if (s.multiHoopMode && s.tool === "select") {
      const id = this.actions.hoopPick?.(p),
        h = s.project.multiHoop?.hoops.find((h) => h.id === id);
      if (h)
        this.drag = {
          type: "multi-hoop",
          id,
          start: p,
          x: h.x,
          y: h.y,
          before: JSON.stringify(s.project),
        };
      this.render();
      return;
    }
    const guideTarget = this.satinGuideTarget();
    if (guideTarget) {
      const { op } = guideTarget,
        before = JSON.stringify(s.project);
      op.satinGuides ||= [];
      let index = -1,
        nearest = 9 / this.scale,
        side = "b";
      for (let i = 0; i < op.satinGuides.length; i++)
        for (const key of ["a", "b"])
          if (distance(p, op.satinGuides[i][key]) < nearest) {
            nearest = distance(p, op.satinGuides[i][key]);
            index = i;
            side = key;
          }
      const added = index < 0;
      if (added) {
        if (op.satinGuides.length >= 64) return;
        index = op.satinGuides.length;
        op.satinGuides.push({ a: p, b: p });
      }
      this.drag = { type: "satin-guide", op, index, side, before, added };
      this.render();
      return;
    }
    if (s.tool === "pencil") {
      const previousDraft = this.draft;
      if (previousDraft.length > 1) {
        try {
          pencilCurve(
            previousDraft,
            s.pencilSmoothing || 0.15,
            s.pencilClosed || false,
          );
        } catch (e) {
          this.actions.notice?.(
            e.message + " Adjust the pending stroke before drawing another.",
          );
          return;
        }
      }
      this.draft = [p];
      this.pencilPreview = null;
      this.drag = { type: "pencil", start: p, previousDraft };
      this.actions.draft();
      this.render();
      return;
    }
    if (["knife", "eraser"].includes(s.tool)) {
      this.drag = { type: "vector-stroke", kind: s.tool, points: [p] };
      this.render();
      return;
    }
    if (["pen", "rails"].includes(s.tool)) {
      const node = { x: p.x, y: p.y };
      this.draftRedo = [];
      this.draftEditing = true;
      this.draft.push(node);
      this.drag = { type: "pen", node, start: p };
      this.actions.draft();
      this.render();
      return;
    }
    if (["polygon", "run", "satin", "manual"].includes(s.tool)) {
      this.draftRedo = [];
      this.draftEditing = true;
      this.draft.push(
        s.tool === "polygon"
          ? { x: p.x, y: p.y }
          : {
              x: Math.round(p.x * 10) / 10,
              y: Math.round(p.y * 10) / 10,
            },
      );
      this.actions.draft();
      this.render();
      return;
    }
    if (["rect", "ellipse", "regular", "star", "eyelet"].includes(s.tool)) {
      this.shape = { start: p, end: p };
      this.render();
      return;
    }
    const selected = s.project.objects.find((o) => o.id === s.selection);
    if (
      s.tool === "node" &&
      selected &&
      selected.type !== "reference" &&
      !isLocked(s.project, selected) &&
      isVisible(s.project, selected) &&
      selectionIds(s).length === 1
    ) {
      if (selected.linkedGeometry) {
        this.actions.notice?.(
          "Edit the linked original, or Unlink this copy in Artwork to edit its nodes independently.",
        );
        return;
      }
      if (selected.effects) {
        this.actions.notice?.(
          "Remove effects to edit the original nodes, or Bake effects to edit the result. Both are in Artwork effects.",
        );
        return;
      }
      if (closedCurveEditable(selected)) {
        this.segment = nearestSegment(selected, p);
        if (this.segment?.distance > 8 / this.scale) this.segment = null;
        if (selected.curve) {
          const parts = curveContours(selected.curve);
          for (let ri = 0; ri < parts.length; ri++)
            if (
              parts[ri].nodes.some(
                (n) =>
                  distance(p, mapPoint(n, parts[ri].frame)) < 8 / this.scale,
              )
            ) {
              this.contour = ri;
              break;
            }
        }
      }
      if (this.activeCurve(selected)) {
        const c = this.activeCurve(selected);
        let best = 8 / this.scale,
          hit = null;
        for (let i = 0; i < c.nodes.length; i++)
          for (const key of ["anchor", "in", "out"]) {
            const point = key === "anchor" ? c.nodes[i] : c.nodes[i][key];
            if (!point) continue;
            const d = distance(p, mapPoint(point, c.frame));
            if (d < best) {
              best = d;
              hit = { i, key };
            }
          }
        if (hit) {
          this.node = hit.i;
          this.drag = {
            type: "curve",
            o: selected,
            index: hit.i,
            key: hit.key,
            start: p,
            original: structuredClone(c),
            before: JSON.stringify(s.project),
          };
          this.render();
          return;
        }
      }
      const pts = this.activeCurve(selected) ? [] : pointsOf(selected);
      let index = pts.findIndex((q) => distance(p, q) < 7 / this.scale);
      if (index >= 0) {
        this.node = index;
        this.drag = {
          type: "node",
          o: selected,
          index,
          before: JSON.stringify(s.project),
          start: p,
          original: { ...pts[index] },
        };
        this.render();
        return;
      }
    }
    if (
      s.tool === "node" &&
      selected &&
      !["reference", "manual"].includes(selected.type) &&
      !isLocked(s.project, selected) &&
      isVisible(s.project, selected) &&
      selectionIds(s).length === 1
    ) {
      const hit = nearestSegment(
        this.activeCurve(selected)
          ? { curve: this.activeCurve(selected) }
          : selected,
        p,
      );
      if (hit && hit.distance < 8 / this.scale) {
        this.node = null;
        this.drag = {
          type: "sculpt",
          o: selected,
          hit,
          start: p,
          original: structuredClone(selected),
          before: JSON.stringify(s.project),
        };
        this.render();
        return;
      }
    }
    const selection = selectedLeaves(s, { editable: true });
    if (
      s.tool === "select" &&
      selection.length === 1 &&
      selection[0].shape?.kind === "rect"
    ) {
      const o = selection[0],
        sh = o.shape,
        pt = mapPoint(
          { x: sh.width / 2 - Math.max(sh.radius, 2), y: -sh.height / 2 + 2 },
          sh.frame,
        );
      if (distance(p, pt) < 7 / this.scale) {
        this.drag = { type: "radius", o, before: JSON.stringify(s.project) };
        return;
      }
    }
    if (s.tool === "select" && selection.length) {
      const b = this.selectionBox(selection),
        handle = this.handles(b).find(
          (h) =>
            distance(p, h) < (e.pointerType === "touch" ? 13 : 8) / this.scale,
        );
      if (handle) {
        this.drag = {
          type: handle.id === "rotate" ? "rotate" : "resize",
          handle,
          b,
          start: p,
          before: JSON.stringify(s.project),
          objects: selection,
          original: structuredClone(selection),
        };
        return;
      }
    }
    // Existing selection wins on its actual geometry, never on empty bounding-box space.
    // Alt-click cycles through overlapping eligible leaves; modifiers deliberately retarget.
    const hits = s.project.objects.filter((o) => this.hit(p, [o])).reverse();
    const current = selectedLeaves(s, { editable: true, visible: true });
    const at = hits.findIndex((o) => current.includes(o));
    const hit =
      e.altKey && hits.length
        ? hits[(at + 1) % hits.length]
        : !e.shiftKey && !e.ctrlKey && !e.metaKey
          ? this.hit(p, current) || hits[0]
          : hits[0];
    this.node = null;
    if (hit) {
      const id = this.canvasTarget(hit, e.altKey || e.ctrlKey || e.metaKey);
      if (e.shiftKey || e.ctrlKey || e.metaKey)
        this.actions.select(id, { toggle: true });
      else if (e.altKey || !selectedLeaves(s).some((o) => o.id === hit.id))
        this.actions.select(id);
      const objects = selectedLeaves(s, { editable: true });
      this.drag = {
        type: "move",
        objects,
        original: structuredClone(objects),
        b: selectionBounds(objects),
        start: p,
        last: p,
        before: JSON.stringify(s.project),
        snapTargets: s.project.objects
          .filter(
            (o) =>
              isVisible(s.project, o) &&
              !objects.includes(o) &&
              (!s.isolation || within(s.project, o, s.isolation)),
          )
          .map(objectBounds),
      };
    } else
      this.marquee = {
        start: p,
        end: p,
        additive: e.shiftKey || e.ctrlKey || e.metaKey,
        initial: selectionIds(s),
        direct: e.altKey,
      };
    this.render();
  }
  move(e) {
    if (this.pointers.has(e.pointerId))
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.gesture && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()],
        d = distance(a, b),
        center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        rect = this.canvas.getBoundingClientRect();
      this.zoomAt(
        d / (this.gesture.distance || d),
        center.x - rect.left,
        center.y - rect.top,
      );
      this.pan.x += center.x - this.gesture.center.x;
      this.pan.y += center.y - this.gesture.center.y;
      this.gesture = { distance: d, center };
      this.render();
      return;
    }
    const p = this.toWorld(e);
    if (this.marquee) {
      this.marquee.end = p;
      this.render();
      return;
    }
    if (this.shape) {
      this.shape.end = p;
      this.render();
      return;
    }
    const d = this.drag;
    if (d?.type === "multi-hoop") {
      const h = this.state.project.multiHoop?.hoops.find((h) => h.id === d.id);
      if (h) {
        const value = (v) => (e.altKey ? v : Math.round(v * 10) / 10);
        h.x = value(d.x + p.x - d.start.x);
        h.y = value(d.y + p.y - d.start.y);
        this.render();
        const note = document.getElementById("multi-summary");
        if (note)
          note.textContent =
            "Moving field · release to regenerate sections. Master artwork stays unchanged.";
      }
      return;
    }
    if (!d) {
      if (this.state.tool === "select" && !this.state.space) {
        // Reuse the last rendered frame: hovering must not walk every vertex of
        // a dense imported region on each pointer event.
        const cage = this.transformCage,
          h = cage?.handles.find((h) => distance(h, p) < 8 / this.scale);
        this.canvas.style.cursor = h ? handleCursor(h, cage.box) : "default";
      }
      return;
    }
    if (d.type === "pan") {
      this.pan = { x: d.pan.x + e.clientX - d.x, y: d.pan.y + e.clientY - d.y };
    } else if (d.type === "satin-guide") {
      d.op.satinGuides[d.index][d.side] = p;
    } else if (d.type === "move") {
      let dx = p.x - d.start.x,
        dy = p.y - d.start.y;
      if (!d.active && Math.hypot(dx, dy) * this.scale < 3) return;
      d.active = true;
      this.guides = [];
      if (this.state.snapObjects && !e.altKey) {
        const snapped = snapTranslation(
          d.b,
          dx,
          dy,
          d.snapTargets || [],
          7 / this.scale,
        );
        dx = snapped.dx;
        dy = snapped.dy;
        this.guides = snapped.guides;
      }
      if (this.state.snapGrid && !e.altKey) {
        if (!this.guides.some((g) => g.axis === "x"))
          dx = Math.round(d.b.minX + dx) - d.b.minX;
        if (!this.guides.some((g) => g.axis === "y"))
          dy = Math.round(d.b.minY + dy) - d.b.minY;
      }
      this.restoreGeometry(d);
      transformSelection(d.objects, { dx, dy });
    } else if (d.type === "resize" || d.type === "rotate") {
      this.restoreGeometry(d);
      if (d.type === "rotate") {
        const center = d.b.center;
        let angle =
          ((Math.atan2(p.y - center.y, p.x - center.x) -
            Math.atan2(d.start.y - center.y, d.start.x - center.x)) *
            180) /
          Math.PI;
        if (e.shiftKey) angle = Math.round(angle / 15) * 15;
        transformSelection(d.objects, { angle, pivot: center });
      } else {
        const target =
          this.state.snapGrid && !e.altKey
            ? { x: Math.round(p.x), y: Math.round(p.y) }
            : p;
        transformSelection(
          d.objects,
          resizeBox(d.b, d.handle, target, {
            center: e.altKey,
            proportional: (this.state.proportional !== false) !== !!e.shiftKey,
          }),
        );
      }
    } else if (d.type === "pencil") {
      for (const event of e.getCoalescedEvents?.().length
        ? e.getCoalescedEvents()
        : [e]) {
        const q = this.toWorld(event);
        if (
          this.draft.length < 6000 &&
          distance(q, this.draft.at(-1)) > 1 / this.scale
        )
          this.draft.push(q);
      }
      this.actions.draft();
    } else if (d.type === "vector-stroke") {
      if (
        distance(p, d.points.at(-1)) > 1 / this.scale &&
        d.points.length < 4000
      )
        d.points.push(p);
    } else if (d.type === "sculpt") {
      if (!d.active && distance(p, d.start) * this.scale < 2) return;
      d.active = true;
      Object.assign(d.o, structuredClone(d.original));
      const curve = this.activeCurve(d.original),
        q = curve ? inversePoint(p, curve.frame) : p,
        a = curve ? inversePoint(d.start, curve.frame) : d.start;
      if (d.o.satinRails || d.o.textSource?.path) {
        const c = this.activeCurve(d.o);
        sculptCurve(c, d.hit.index, d.hit.t, { x: q.x - a.x, y: q.y - a.y });
        this.updateCurve(d.o, c);
      } else
        sculptArtwork(
          d.o,
          d.hit,
          { x: q.x - a.x, y: q.y - a.y },
          this.state.sculptRadius || 2,
        );
    } else if (d.type === "pen") {
      const dx = p.x - d.start.x,
        dy = p.y - d.start.y;
      d.node.out = { x: p.x, y: p.y };
      d.node.in = { x: d.start.x - dx, y: d.start.y - dy };
    } else if (d.type === "radius") {
      const sh = d.o.shape,
        q = inversePoint(p, sh.frame);
      sh.radius = Math.max(
        0,
        Math.min(sh.width / 2, sh.height / 2, sh.width / 2 - q.x),
      );
      regenerateShape(d.o);
    } else if (d.type === "curve") {
      const c = structuredClone(d.original),
        q = inversePoint(p, c.frame),
        n = c.nodes[d.index],
        start = inversePoint(d.start, c.frame),
        dx = q.x - start.x,
        dy = q.y - start.y;
      if (d.key === "anchor") {
        n.x += dx;
        n.y += dy;
        for (const key of ["in", "out"])
          if (n[key]) {
            n[key].x += dx;
            n[key].y += dy;
          }
        for (const memory of [
          n.cornerMemory,
          ...Object.values(n.edgeMemory || {}),
        ].filter(Boolean)) {
          const keys = memory === n.cornerMemory ? ["in", "out"] : ["out"];
          for (const k of keys)
            if (memory[k]) {
              memory[k].x += dx;
              memory[k].y += dy;
            }
        }
        const previous =
          c.nodes[(d.index + c.nodes.length - 1) % c.nodes.length];
        for (const memory of Object.values(previous.edgeMemory || {}))
          if (memory.in) {
            memory.in.x += dx;
            memory.in.y += dy;
          }
      } else {
        n[d.key] = q;
        alignHandle(n, d.key);
      }
      this.updateCurve(d.o, c);
    } else if (d.type === "node") {
      detachSource(d.o);
      const q = pointsOf(d.o)[d.index];
      q.x = Math.round((d.original.x + p.x - d.start.x) * 10) / 10;
      q.y = Math.round((d.original.y + p.y - d.start.y) * 10) / 10;
    }
    this.render();
  }
  up(e) {
    this.guides = [];
    this.pointers.delete(e.pointerId);
    if (this.gesture) {
      this.gesture = null;
      this.actions.refresh();
      this.render();
      return;
    }
    if (this.marquee) {
      const m = this.marquee;
      this.marquee = null;
      const left = Math.min(m.start.x, m.end.x),
        right = Math.max(m.start.x, m.end.x),
        top = Math.min(m.start.y, m.end.y),
        bottom = Math.max(m.start.y, m.end.y);
      const ids =
        distance(m.start, m.end) > 3 / this.scale
          ? this.state.project.objects
              .filter((o) => {
                const b = objectBounds(o);
                return (
                  o.type !== "reference" &&
                  isVisible(this.state.project, o) &&
                  !isLocked(this.state.project, o) &&
                  (!this.state.isolation ||
                    within(this.state.project, o, this.state.isolation)) &&
                  b.minX >= left &&
                  b.maxX <= right &&
                  b.minY >= top &&
                  b.maxY <= bottom
                );
              })
              .map((o) => this.canvasTarget(o, m.direct))
          : [];
      this.actions.select(m.additive ? [...m.initial, ...ids] : ids);
      this.render();
    }
    if (this.shape) {
      const shape = this.shape;
      this.shape = null;
      if (this.state.tool === "eyelet" || distance(shape.start, shape.end) > 1)
        this.actions.shape(shape);
      this.render();
    }
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      if (d.type === "pencil") {
        const stroke = this.draft;
        if (stroke.length < 2) {
          this.draft = d.previousDraft;
          this.actions.draft();
          this.render();
          return;
        }
        if (d.previousDraft.length > 1) {
          this.draft = d.previousDraft;
          if (!this.actions.finish({ keepTool: true })) {
            this.actions.draft();
            this.render();
            return;
          }
          this.draft = stroke;
        }
        if (stroke.length >= 6000)
          this.actions.notice?.(
            "Pencil capture reached 6,000 points. Review this stroke and use shorter strokes for the rest.",
          );
        try {
          this.pencilPreview = pencilCurve(
            this.draft,
            this.state.pencilSmoothing || 0.15,
            this.state.pencilClosed || false,
          );
        } catch {
          this.pencilPreview = null;
        }
        this.actions.draft();
      } else if (d.type === "vector-stroke")
        this.actions.vectorStroke?.({
          kind: d.kind,
          points: d.points,
          scale: this.scale,
        });
      else if (d.type === "sculpt") {
        if (d.active) this.actions.sculptChanged?.(d.before);
      } else if (
        d.type === "satin-guide" &&
        distance(d.op.satinGuides[d.index].a, d.op.satinGuides[d.index].b) < 0.2
      ) {
        this.state.project = JSON.parse(d.before);
        this.actions.refresh();
      } else if (!["pan", "pen"].includes(d.type))
        this.actions.changed(d.before);
      if (d.pathError)
        this.actions.notice?.(d.pathError + " The baseline edit was restored.");
      this.render();
    }
  }
  cancelDrag() {
    this.guides = [];
    if (this.pointers.size && this.touchDraft) {
      this.draft = this.touchDraft;
      this.draftEditing = this.touchDraftEditing;
      this.draftRedo = structuredClone(this.touchDraftRedo || []);
      this.actions.draft();
    }
    if (this.drag?.type === "pencil") {
      this.draft = this.drag.previousDraft;
      this.actions.draft();
    }
    if (this.drag?.before) this.state.project = JSON.parse(this.drag.before);
    this.drag = null;
    this.shape = null;
    this.marquee = null;
    this.gesture = null;
    this.pointers.clear();
    this.actions.refresh();
    this.render();
  }
  closedAction(action, target = null) {
    const s = this.state,
      o = s.project.objects.find((o) => o.id === s.selection);
    if (
      s.tool !== "node" ||
      s.mode !== "design" ||
      selectionIds(s).length !== 1 ||
      !closedCurveEditable(o) ||
      isLocked(s.project, o)
    )
      return false;
    try {
      let ring = target?.ring ?? this.contour ?? 0,
        index = target?.index ?? this.node;
      if (
        !o.curve &&
        !target &&
        index !== null &&
        action !== "toggle-segment"
      ) {
        ring = 0;
        while (o.rings[ring] && index >= o.rings[ring].length)
          index -= o.rings[ring++].length;
      }
      if (action === "toggle-segment") {
        const hit = target || this.segment;
        if (!hit)
          throw Error(
            "Click an edge first, then choose Straight / Curved Segment.",
          );
        ring = hit.ring;
        index = hit.index;
      }
      const next = editClosedCurve(o, action, ring, index);
      this.contour = ring;
      this.node = index;
      this.actions.mutate(() => {
        for (const key of Object.keys(o)) delete o[key];
        Object.assign(o, next);
      });
      return true;
    } catch (e) {
      this.actions.notice?.(e.message);
      return true;
    }
  }
  closedDoubleClick(p) {
    const s = this.state,
      o = s.project.objects.find((o) => o.id === s.selection);
    if (s.space || !closedCurveEditable(o) || selectionIds(s).length !== 1)
      return false;
    if (this.nodeClickContext && this.nodeClickContext.id !== o.id) return true;
    if (isLocked(s.project, o) || !isVisible(s.project, o)) return true;
    const parts = o.curve
      ? curveContours(o.curve)
      : o.rings.map((_, i) => worldCurve(o, i));
    // Anchors win, even when their tangent handle is coincident with them.
    for (let ring = 0; ring < parts.length; ring++)
      for (let index = 0; index < parts[ring].nodes.length; index++) {
        if (
          distance(p, mapPoint(parts[ring].nodes[index], parts[ring].frame)) <
          8 / this.scale
        ) {
          this.closedAction("toggle-node", { ring, index });
          return true;
        }
      }
    for (const c of parts)
      for (const n of c.nodes)
        for (const key of ["in", "out"])
          if (n[key] && distance(p, mapPoint(n[key], c.frame)) < 8 / this.scale)
            return true;
    const hit = nearestSegment(o, p);
    if (hit?.distance < 8 / this.scale) {
      this.segment = hit;
      this.closedAction("toggle-segment", hit);
      return true;
    }
    if (
      this.hit(p)?.id === o.id &&
      inside(p, o.rings, o.fillRule || "evenodd")
    ) {
      const ring = parts.findIndex((c) =>
        inside(p, curveRings({ ...c, contours: undefined }), "evenodd"),
      );
      this.closedAction("toggle-whole", { ring: Math.max(0, ring), index: 0 });
    }
    return true;
  }
  insertNode(p) {
    const o = this.state.project.objects.find(
      (o) => o.id === this.state.selection,
    );
    if (
      !o ||
      ["manual", "reference"].includes(o.type) ||
      isLocked(this.state.project, o)
    )
      return;
    if (o.effects || o.linkedGeometry) {
      this.actions.notice?.(
        o.linkedGeometry
          ? "Edit the linked original or unlink this copy before editing nodes."
          : "Remove or bake Artwork effects before editing nodes.",
      );
      return;
    }
    if (this.activeCurve(o)) {
      const c = this.activeCurve(o);
      let best = 8 / this.scale,
        found = null;
      for (let i = 0; i < c.nodes.length - (c.closed ? 0 : 1); i++) {
        const a = c.nodes[i],
          b = c.nodes[(i + 1) % c.nodes.length],
          u = a.out || a,
          v = b.in || b;
        for (let j = 1; j < 40; j++) {
          const t = j / 40,
            k = 1 - t,
            q = mapPoint(
              {
                x:
                  k * k * k * a.x +
                  3 * k * k * t * u.x +
                  3 * k * t * t * v.x +
                  t * t * t * b.x,
                y:
                  k * k * k * a.y +
                  3 * k * k * t * u.y +
                  3 * k * t * t * v.y +
                  t * t * t * b.y,
              },
              c.frame,
            ),
            d = distance(p, q);
          if (d < best) {
            best = d;
            found = { i, t };
          }
        }
      }
      if (found)
        this.actions.mutate(() => {
          splitCurve(c, found.i, found.t);
          if (o.satinRails) {
            const key = this.state.railSide === "b" ? "seamB" : "seamA";
            if (found.i < o.satinRails[key]) o.satinRails[key]++;
          }
          this.updateCurve(o, c);
        });
      return;
    }
    let best = 8 / this.scale,
      found = null;
    for (const r of o.rings)
      for (
        let i = 1;
        i < r.length + (o.type === "fill" || o.closed ? 1 : 0);
        i++
      ) {
        const a = r[i - 1],
          b = r[i % r.length],
          l = distance(a, b) ** 2,
          t = l
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l,
                ),
              )
            : 0,
          d = distance(p, {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
          });
        if (d < best) {
          best = d;
          found = { r, i };
        }
      }
    if (found)
      this.actions.mutate(() => {
        detachSource(o);
        found.r.splice(found.i, 0, p);
      });
  }
  restoreGeometry(d) {
    d.objects.forEach((o, i) => {
      const original = d.original[i];
      if (o.type === "manual") o.commands = structuredClone(original.commands);
      else o.rings = structuredClone(original.rings);
      o.angle = original.angle;
      for (const key of [
        "localAxis",
        "satinRails",
        "satinGuides",
        "effects",
        "linkedGeometry",
        "shape",
        "textSource",
        "rounding",
        "curve",
        "reference",
      ]) {
        if (original[key]) o[key] = structuredClone(original[key]);
        else delete o[key];
      }
      if (original.operations)
        o.operations = structuredClone(original.operations);
    });
  }
}
