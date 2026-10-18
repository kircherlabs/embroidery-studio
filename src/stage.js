import {
  detachSource,
  curveRings,
  mapPoint,
  inversePoint,
  splitCurve,
  regenerateShape,
} from "./smart-geometry.js";
import { objectBounds, pointsOf, bounds, MACHINES } from "./model.js";
import { inside, distance } from "./engine.js";
import { movementSegments } from "./preview.js";
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
          op.columnMode === "stroke",
      );
    return op ? { o, op } : null;
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
    this.pointers = new Map();
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
      } else if (this.state.tool === "node") this.insertNode(this.toWorld(e));
      else if (this.state.tool === "select") {
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
    const m = MACHINES[this.state.project.machine];
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
    const objects = this.state.project.objects.filter((o) =>
      isVisible(this.state.project, o),
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
    const x = (b.minX + b.maxX) / 2,
      y = (b.minY + b.maxY) / 2;
    return [
      ["nw", b.minX, b.minY],
      ["n", x, b.minY],
      ["ne", b.maxX, b.minY],
      ["e", b.maxX, y],
      ["se", b.maxX, b.maxY],
      ["s", x, b.maxY],
      ["sw", b.minX, b.maxY],
      ["w", b.minX, y],
      ["rotate", x, b.minY - 22 / this.scale],
    ].map(([id, x, y]) => ({ id, x, y }));
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
      m = MACHINES[s.project.machine];
    const editing =
      this.drag &&
      ["move", "resize", "rotate", "node"].includes(this.drag.type);
    if (scale <= 0) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = "#d9dccf";
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.translate(c.x, c.y);
    ctx.scale(scale, scale);
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
    if (s.mode === "design")
      for (const o of s.project.objects.filter((o) =>
        isVisible(s.project, o),
      )) {
        if (s.isolation && !within(s.project, o, s.isolation)) continue;
        ctx.globalAlpha = s.showStitches && !editing ? 0.13 : 0.8;
        ctx.fillStyle = o.color;
        ctx.strokeStyle = o.color;
        if (o.type === "fill") {
          this.path(ctx, o.rings);
          ctx.fill(o.fillRule || "evenodd");
        } else if (o.type !== "manual") {
          ctx.globalAlpha = s.showStitches ? 0.25 : 0.85;
          ctx.lineWidth = o.type === "satin" ? o.width : 0.3;
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
        !(editing && focus.has(e.objectId)) &&
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
    const selection = selectedLeaves(s, { editable: true }),
      selected = selection.length === 1 ? selection[0] : null;
    if (selection.length && s.mode === "design") {
      const b = selectionBounds(selection);
      ctx.strokeStyle = "#395943";
      ctx.lineWidth = 1 / scale;
      ctx.setLineDash([4 / scale, 3 / scale]);
      ctx.strokeRect(b.minX, b.minY, b.width, b.height);
      ctx.setLineDash([]);
      if (
        s.tool === "node" &&
        selected &&
        selectionIds(s).length === 1 &&
        s.selection === selected.id
      ) {
        const points = selected.curve
          ? selected.curve.nodes.map((p) => mapPoint(p, selected.curve.frame))
          : pointsOf(selected);
        if (selected.curve)
          for (const n of selected.curve.nodes)
            for (const key of ["in", "out"])
              if (n[key]) {
                const a = mapPoint(n, selected.curve.frame),
                  b = mapPoint(n[key], selected.curve.frame);
                ctx.strokeStyle = "#936c47";
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(b.x, b.y, 3 / scale, 0, Math.PI * 2);
                ctx.fillStyle = "#e7b784";
                ctx.fill();
                ctx.stroke();
              }
        points.forEach((p, i) => {
          ctx.fillStyle = this.node === i ? "#e7b784" : "#fcf7e6";
          ctx.strokeStyle = "#3a5941";
          ctx.lineWidth = 1 / scale;
          ctx.beginPath();
          ctx.rect(p.x - 3 / scale, p.y - 3 / scale, 6 / scale, 6 / scale);
          ctx.fill();
          ctx.stroke();
        });
      } else {
        ctx.fillStyle = "#f8f1df";
        ctx.beginPath();
        ctx.moveTo((b.minX + b.maxX) / 2, b.minY);
        ctx.lineTo((b.minX + b.maxX) / 2, b.minY - 22 / scale);
        ctx.stroke();
        if (selected?.shape?.kind === "rect") {
          const sh = selected.shape,
            pt = mapPoint(
              {
                x: sh.width / 2 - Math.max(sh.radius, 2),
                y: -sh.height / 2 + 2,
              },
              sh.frame,
            );
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4 / scale, 0, Math.PI * 2);
          ctx.fillStyle = "#e7b784";
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#f8f1df";
        }
        for (const { id, x, y } of this.handles(b)) {
          ctx.beginPath();
          if (id === "rotate") ctx.arc(x, y, 4 / scale, 0, Math.PI * 2);
          else ctx.rect(x - 3.5 / scale, y - 3.5 / scale, 7 / scale, 7 / scale);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    if (s.satinStructure || s.satinGuideEdit) {
      ctx.save();
      ctx.lineWidth = 1.1 / scale;
      const ids = new Set(selection.map((o) => o.id));
      if (s.satinStructure)
        for (const result of s.plan?.diagnostics?.satin || [])
          if (ids.has(result.objectId))
            for (const stroke of result.strokes) {
              ctx.strokeStyle = result.fallback ? "#9d6446" : "#597bac";
              this.path(ctx, [stroke.center], false);
              ctx.stroke();
              ctx.globalAlpha = 0.55;
              for (let i = 0; i < stroke.sections.length; i += 3) {
                const q = stroke.sections[i];
                this.path(ctx, [[q.a, q.b]], false);
                ctx.stroke();
              }
              ctx.globalAlpha = 1;
            }
      for (const o of selection)
        for (const op of o.operations || [])
          if (
            op.type === "column" &&
            (!s.activeOperationId || op.id === s.activeOperationId)
          )
            for (const g of op.satinGuides || []) {
              ctx.strokeStyle = "#a24779";
              this.path(ctx, [[g.a, g.b]], false);
              ctx.stroke();
              for (const p of [g.a, g.b]) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5 / scale, 0, Math.PI * 2);
                ctx.fillStyle = "#fff4e3";
                ctx.fill();
                ctx.stroke();
              }
            }
      ctx.restore();
    }
    if (this.guides?.length) {
      ctx.save();
      ctx.strokeStyle = "#a95636";
      ctx.lineWidth = 1.3 / scale;
      ctx.setLineDash([5 / scale, 3 / scale]);
      for (const guide of this.guides) {
        ctx.beginPath();
        if (guide.axis === "x") {
          ctx.moveTo(guide.position, -c.y / scale);
          ctx.lineTo(guide.position, (this.h - c.y) / scale);
        } else {
          ctx.moveTo(-c.x / scale, guide.position);
          ctx.lineTo((this.w - c.x) / scale, guide.position);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (this.draft.length) {
      ctx.strokeStyle = "#3d5b40";
      ctx.fillStyle = "#59794d25";
      ctx.lineWidth = 1.5 / scale;
      this.path(
        ctx,
        s.tool === "pen"
          ? curveRings({ nodes: this.draft, closed: false })
          : [this.draft],
        s.tool === "polygon",
      );
      if (s.tool === "polygon") ctx.fill();
      ctx.stroke();
      for (const p of this.draft) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 / scale, 0, Math.PI * 2);
        ctx.fillStyle = "#e7b784";
        ctx.fill();
        ctx.stroke();
      }
    }
    if (this.shape || this.marquee) {
      const { start: a, end: b } = this.shape || this.marquee;
      ctx.strokeStyle = "#345b3f";
      ctx.lineWidth = 1 / scale;
      ctx.setLineDash([3 / scale, 2 / scale]);
      ctx.strokeRect(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.abs(a.x - b.x),
        Math.abs(a.y - b.y),
      );
      ctx.setLineDash([]);
    }
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
      s.tool === "pan" || s.space || this.drag?.type === "pan"
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
  down(e) {
    if (e.button !== 0 && e.button !== 1) return;
    if (e.button === 1) e.preventDefault();
    this.canvas.focus();
    const s = this.state,
      p = this.toWorld(e);
    this.canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === "touch") {
      if (!this.pointers.size) this.touchDraft = structuredClone(this.draft);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        if (this.drag?.before)
          this.state.project = JSON.parse(this.drag.before);
        this.drag = null;
        this.shape = null;
        this.marquee = null;
        this.draft = this.touchDraft || [];
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
    if (s.tool === "pen") {
      const node = { x: p.x, y: p.y };
      this.draft.push(node);
      this.drag = { type: "pen", node, start: p };
      this.actions.draft();
      this.render();
      return;
    }
    if (["polygon", "run", "satin", "manual"].includes(s.tool)) {
      this.draft.push({
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
      });
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
      !isLocked(s.project, selected) &&
      selectionIds(s).length === 1
    ) {
      if (selected.curve) {
        const c = selected.curve;
        for (let i = 0; i < c.nodes.length; i++)
          for (const key of ["anchor", "in", "out"]) {
            const point = key === "anchor" ? c.nodes[i] : c.nodes[i][key];
            if (!point) continue;
            if (distance(p, mapPoint(point, c.frame)) < 8 / this.scale) {
              this.node = i;
              this.drag = {
                type: "curve",
                o: selected,
                index: i,
                key,
                start: p,
                original: structuredClone(c),
                before: JSON.stringify(s.project),
              };
              this.render();
              return;
            }
          }
      }
      const pts = selected.curve ? [] : pointsOf(selected);
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
      const b = selectionBounds(selection),
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
    if (!d) return;
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
        const center = {
          x: (d.b.minX + d.b.maxX) / 2,
          y: (d.b.minY + d.b.maxY) / 2,
        };
        let angle =
          ((Math.atan2(p.y - center.y, p.x - center.x) -
            Math.atan2(d.start.y - center.y, d.start.x - center.x)) *
            180) /
          Math.PI;
        if (e.shiftKey) angle = Math.round(angle / 15) * 15;
        transformSelection(d.objects, { angle, pivot: center });
      } else {
        const horizontal = /[we]/.test(d.handle.id),
          vertical = /[ns]/.test(d.handle.id);
        const pivot = {
          x: d.handle.id.includes("w")
            ? d.b.maxX
            : d.handle.id.includes("e")
              ? d.b.minX
              : (d.b.minX + d.b.maxX) / 2,
          y: d.handle.id.includes("n")
            ? d.b.maxY
            : d.handle.id.includes("s")
              ? d.b.minY
              : (d.b.minY + d.b.maxY) / 2,
        };
        const target =
          this.state.snapGrid && !e.altKey
            ? { x: Math.round(p.x), y: Math.round(p.y) }
            : p;
        let sx = horizontal
            ? Math.max(0.02, (target.x - pivot.x) / (d.handle.x - pivot.x || 1))
            : 1,
          sy = vertical
            ? Math.max(0.02, (target.y - pivot.y) / (d.handle.y - pivot.y || 1))
            : 1;
        if (
          horizontal &&
          vertical &&
          (this.state.proportional !== false) !== !!e.shiftKey
        )
          sx = sy = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
        transformSelection(d.objects, { sx, sy, pivot });
      }
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
      } else n[d.key] = q;
      d.o.curve = c;
      d.o.rings = curveRings(c);
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
      if (
        d.type === "satin-guide" &&
        distance(d.op.satinGuides[d.index].a, d.op.satinGuides[d.index].b) < 0.2
      ) {
        this.state.project = JSON.parse(d.before);
        this.actions.refresh();
      } else if (!["pan", "pen"].includes(d.type))
        this.actions.changed(d.before);
      this.render();
    }
  }
  cancelDrag() {
    this.guides = [];
    if (this.pointers.size && this.touchDraft) {
      this.draft = this.touchDraft;
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
  insertNode(p) {
    const o = this.state.project.objects.find(
      (o) => o.id === this.state.selection,
    );
    if (!o || o.type === "manual" || isLocked(this.state.project, o)) return;
    if (o.curve) {
      const c = o.curve;
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
          o.rings = curveRings(c);
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
      for (const key of ["shape", "textSource", "rounding", "curve"]) {
        if (original[key]) o[key] = structuredClone(original[key]);
        else delete o[key];
      }
      if (original.operations)
        o.operations = structuredClone(original.operations);
    });
  }
}
