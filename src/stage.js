import { objectBounds, pointsOf, translate, MACHINES } from "./model.js";
import { inside, distance } from "./engine.js";
import { movementSegments } from "./preview.js";
export class Stage {
  constructor(canvas, state, actions) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = state;
    this.actions = actions;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.draft = [];
    this.node = null;
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
        this.zoomAt(Math.exp(-e.deltaY * 0.001), e.offsetX, e.offsetY);
      },
      { passive: false },
    );
    canvas.addEventListener("dblclick", (e) => {
      if (this.draft.length) {
        this.draft.pop();
        this.actions.finish();
      } else if (this.state.tool === "node") this.insertNode(this.toWorld(e));
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
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
        (this.w - 105) / (m.width + 12),
        (this.h - 100) / (m.height + 12),
      ) * this.zoom
    );
  }
  get center() {
    return { x: this.w / 2 + 18 + this.pan.x, y: this.h / 2 + 19 + this.pan.y };
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
  zoomAt(f, x = this.w / 2, y = this.h / 2) {
    const old = this.scale,
      c = this.center;
    this.zoom = Math.max(0.3, Math.min(10, this.zoom * f));
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
      for (const o of s.project.objects.filter((o) => o.visible !== false)) {
        ctx.globalAlpha = s.showStitches ? 0.13 : 0.8;
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
        batchPhase = null;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 0.19;
      ctx.beginPath();
      for (const { from: prev, event: e } of movementSegments(events, end)) {
        if (
          e.cmd === "stitch" &&
          (s.showUnderlay || !e.phase?.startsWith("underlay"))
        ) {
          if (e.color !== batchColor || e.phase !== batchPhase) {
            ctx.stroke();
            ctx.beginPath();
            batchColor = e.color;
            batchPhase = e.phase;
            ctx.strokeStyle = e.color;
            ctx.globalAlpha = e.phase?.startsWith("underlay") ? 0.4 : 0.92;
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
          if (e.cmd === "jump") {
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
          if (e.cmd !== "trim" && e.cmd !== "color") continue;
          ctx.lineWidth = 1 / scale;
          ctx.strokeStyle = e.cmd === "trim" ? "#be6e33" : e.color;
          ctx.beginPath();
          const r = 2.5 / scale;
          if (e.cmd === "trim") {
            ctx.moveTo(e.x - r, e.y - r);
            ctx.lineTo(e.x + r, e.y + r);
            ctx.moveTo(e.x - r, e.y + r);
            ctx.lineTo(e.x + r, e.y - r);
          } else ctx.arc(e.x, e.y, r * 1.5, 0, Math.PI * 2);
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
    const selected = s.project.objects.find((o) => o.id === s.selection);
    if (selected && s.mode === "design") {
      const b = objectBounds(selected);
      ctx.strokeStyle = "#395943";
      ctx.lineWidth = 1 / scale;
      ctx.setLineDash([4 / scale, 3 / scale]);
      ctx.strokeRect(b.minX - 1, b.minY - 1, b.width + 2, b.height + 2);
      ctx.setLineDash([]);
      if (s.tool === "node") {
        pointsOf(selected).forEach((p, i) => {
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
        for (const [x, y] of [
          [b.minX - 1, b.minY - 1],
          [b.maxX + 1, b.minY - 1],
          [b.minX - 1, b.maxY + 1],
          [b.maxX + 1, b.maxY + 1],
        ]) {
          ctx.fillRect(x - 2.5 / scale, y - 2.5 / scale, 5 / scale, 5 / scale);
          ctx.strokeRect(
            x - 2.5 / scale,
            y - 2.5 / scale,
            5 / scale,
            5 / scale,
          );
        }
      }
    }
    if (this.draft.length) {
      ctx.strokeStyle = "#3d5b40";
      ctx.fillStyle = "#59794d25";
      ctx.lineWidth = 1.5 / scale;
      this.path(ctx, [this.draft], s.tool === "polygon");
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
    if (this.shape) {
      const { start: a, end: b } = this.shape;
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
    this.canvas.style.cursor =
      s.tool === "pan" || s.space
        ? "grab"
        : ["select", "node"].includes(s.tool)
          ? "default"
          : "crosshair";
  }
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
  hit(p) {
    return [...this.state.project.objects].reverse().find((o) => {
      if (o.visible === false) return false;
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
      const pts = pointsOf(o);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1],
          b = pts[i],
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
          distance(p, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) <
          pad
        )
          return true;
      }
      return false;
    });
  }
  down(e) {
    if (e.button !== 0 && e.button !== 1) return;
    this.canvas.focus();
    const s = this.state,
      p = this.toWorld(e);
    this.canvas.setPointerCapture(e.pointerId);
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
    if (["polygon", "run", "satin", "manual"].includes(s.tool)) {
      this.draft.push({
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
      });
      this.actions.draft();
      this.render();
      return;
    }
    if (["rect", "ellipse"].includes(s.tool)) {
      this.shape = { start: p, end: p };
      this.render();
      return;
    }
    const selected = s.project.objects.find((o) => o.id === s.selection);
    if (s.tool === "node" && selected) {
      const pts = pointsOf(selected);
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
    const hit = this.hit(p);
    this.node = null;
    this.actions.select(hit?.id || null);
    if (hit)
      this.drag = {
        type: "move",
        o: hit,
        start: p,
        last: p,
        before: JSON.stringify(s.project),
      };
    this.render();
  }
  move(e) {
    const p = this.toWorld(e);
    if (this.shape) {
      this.shape.end = p;
      this.render();
      return;
    }
    const d = this.drag;
    if (!d) return;
    if (d.type === "pan") {
      this.pan = { x: d.pan.x + e.clientX - d.x, y: d.pan.y + e.clientY - d.y };
    } else if (d.type === "move") {
      translate(d.o, p.x - d.last.x, p.y - d.last.y);
      d.last = p;
    } else if (d.type === "node") {
      const q = pointsOf(d.o)[d.index];
      q.x = Math.round((d.original.x + p.x - d.start.x) * 10) / 10;
      q.y = Math.round((d.original.y + p.y - d.start.y) * 10) / 10;
    }
    this.render();
  }
  up(e) {
    if (this.shape) {
      const shape = this.shape;
      this.shape = null;
      if (distance(shape.start, shape.end) > 1) this.actions.shape(shape);
      this.render();
    }
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      if (d.type !== "pan") this.actions.changed(d.before);
      this.render();
    }
  }
  cancelDrag() {
    if (this.drag?.before) this.state.project = JSON.parse(this.drag.before);
    this.drag = null;
    this.shape = null;
    this.render();
  }
  insertNode(p) {
    const o = this.state.project.objects.find(
      (o) => o.id === this.state.selection,
    );
    if (!o || o.type === "manual") return;
    let best = 8 / this.scale,
      found = null;
    for (const r of o.rings)
      for (let i = 1; i < r.length; i++) {
        const a = r[i - 1],
          b = r[i],
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
    if (found) this.actions.mutate(() => found.r.splice(found.i, 0, p));
  }
}
