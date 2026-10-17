import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
await mkdir("test-results", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(process.env.STUDIO_URL || "http://127.0.0.1:5173");
  const xml = await readFile(
    new URL("./fixtures/generated-artwork.svg", import.meta.url),
    "utf8",
  );
  const result = await page.evaluate(async (xml) => {
    const { importSVG } = await import("./src/importers.js"),
      { parseSVGPath } = await import("./src/svg-path.js");
    const { bounds, validateProject } = await import("./src/model.js"),
      { generate } = await import("./src/engine.js");
    const ns = "http://www.w3.org/2000/svg",
      before = document.body.children.length;
    let calls = 0;
    const native = SVGGeometryElement.prototype.getPointAtLength;
    SVGGeometryElement.prototype.getPointAtLength = function (distance) {
      if (!this.isConnected) throw Error("Sampling detached geometry");
      if (!(this.getTotalLength() > 0) || !Number.isFinite(distance))
        throw Error("Sampling empty/non-finite geometry");
      calls++;
      return native.call(this, distance);
    };
    const wrap = (s) => `<svg xmlns="${ns}">${s}</svg>`;
    const check = (ok, message) => {
      if (!ok) throw Error(message);
    };
    let objects;
    try {
      check(
        importSVG('<svg><rect width="20" height="10"/></svg>').length === 1,
        "unqualified SVG XML stopped importing",
      );
      // This is the original failure: valid adjacent signs became MNaN,... .
      const compact = importSVG(wrap('<path d="m10-10 10 0 0 20z"/>'));
      check(compact.length === 1, "compact path did not import");
      const cb = bounds(compact[0].rings.flat());
      check(
        Math.abs(cb.width - 37.5) < 1e-6 && Math.abs(cb.height - 75) < 1e-6,
        "compact triangle dimensions changed",
      );
      const corners = compact[0].rings[0];
      check(
        corners.some(
          (p) => Math.abs(p.x - 18.75) < 1e-6 && Math.abs(p.y + 37.5) < 1e-6,
        ),
        "sharp corner was lost",
      );
      const mixed = importSVG(
        wrap(
          '<g fill="none" stroke="#ff0000"><path d="M0 0L10 0L10 10Z M20 0L30 0"/></g>',
        ),
      );
      check(
        mixed.length === 2 &&
          mixed.some((o) => o.closed) &&
          mixed.some((o) => !o.closed),
        "stroke closure was applied globally",
      );
      const partial = importSVG(
        wrap(
          '<path d="M20 20"/><path d="MNaN 1L2 3"/><rect width="0" height="10"/><circle r="0"/><path d="M0 0L0 0"/><g opacity="0"><rect width="999" height="999"/></g><g display="none"><rect width="888" height="888"/></g><g transform="scale(0)"><rect width="10" height="10"/></g><text>Unsupported</text><rect width="20" height="10" fill="#123456"/>',
        ),
      );
      check(
        partial.length === 1 && partial[0].color === "#123456",
        "bad elements destroyed surviving artwork",
      );
      check(
        partial.importWarnings?.includes("skipped"),
        "skips have no diagnostic",
      );
      const pb = bounds(partial[0].rings.flat());
      check(
        Math.abs(pb.width - 75) < 1e-6 && Math.abs(pb.height - 37.5) < 1e-6,
        "degenerate/hidden elements changed artwork bounds",
      );
      const ghost = importSVG(
        wrap(
          '<path d="M0 0H20V10H0Z M1000000 1000000"/><g transform="translate(1000000 1000000) scale(0)"><rect width="10" height="10"/></g>',
        ),
      );
      const gb = bounds(ghost[0].rings.flat());
      check(
        ghost.length === 1 &&
          Math.abs(gb.width - 75) < 1e-6 &&
          Math.abs(gb.height - 37.5) < 1e-6,
        "empty contours/collapsed transforms affected fitting",
      );
      const painted = importSVG(
        wrap('<path fill="#123456" stroke="#654321" d="M10 20H30V30H10Z"/>'),
      );
      const fb = bounds(painted[0].rings.flat()),
        ob = bounds(painted[1].rings.flat());
      check(
        JSON.stringify(fb) === JSON.stringify(ob) && fb.width === 75,
        "fill/stroke points were fitted twice",
      );
      painted[0].rings[0][0].x += 1;
      check(
        painted[0].rings[0][0].x !== painted[1].rings[0][0].x,
        "fill and outline share editable point references",
      );
      const transformed = importSVG(
        '<svg xmlns="' +
          ns +
          '" width="100" height="100" viewBox="0 0 100 100" transform="rotate(90)"><g transform="translate(15 20) scale(2 1)"><path d="M0 0H10V10H0Z"/></g></svg>',
      );
      const tb = bounds(transformed[0].rings.flat());
      check(
        Math.abs(tb.width - 37.5) < 1e-5 && Math.abs(tb.height - 75) < 1e-5,
        "root/nested transform lost: " + JSON.stringify(tb),
      );
      const skewed = importSVG(
        wrap(
          '<g transform="matrix(-1 .2 .5 1 12 34)"><path d="M0 0H10V20H0Z"/></g>',
        ),
      );
      const sb = bounds(skewed[0].rings.flat());
      check(
        Math.abs(sb.width / sb.height - 20 / 22) < 1e-6,
        "skew/reflection changed",
      );
      const guarded = SVGGeometryElement.prototype.getPointAtLength;
      SVGGeometryElement.prototype.getPointAtLength = function (distance) {
        if (this.localName === "path")
          throw new DOMException(
            "Synthetic unsupported geometry",
            "InvalidStateError",
          );
        return guarded.call(this, distance);
      };
      try {
        const surviving = importSVG(
          wrap(
            '<path d="M0 0C0 10 10 10 10 0Z"/><rect width="20" height="10"/>',
          ),
        );
        check(
          surviving.length === 1 &&
            surviving.importWarnings.includes("unreadable"),
          "geometry exception discarded other elements",
        );
      } finally {
        SVGGeometryElement.prototype.getPointAtLength = guarded;
      }
      SVGGeometryElement.prototype.getPointAtLength = function () {
        throw Error("unexpected programming failure");
      };
      try {
        importSVG(wrap('<path d="M0 0C0 10 10 10 10 0Z"/>'));
        throw Error("unexpected exception swallowed");
      } catch (e) {
        check(
          e.message === "unexpected programming failure",
          "unexpected errors must not be swallowed",
        );
      } finally {
        SVGGeometryElement.prototype.getPointAtLength = guarded;
      }
      try {
        importSVG(wrap('<path d="M1 2"/>'));
        throw Error("empty document accepted");
      } catch (e) {
        check(
          e.message.includes("No supported drawable"),
          "empty document error is not actionable",
        );
      }
      objects = importSVG(xml);
    } finally {
      SVGGeometryElement.prototype.getPointAtLength = native;
    }
    check(
      document.body.children.length === before,
      "temporary geometry leaked into DOM",
    );
    check(objects.length === 191, "unexpected fixture object count");
    check(
      objects.filter((o) => o.type === "fill").length === 95,
      "fixture fill count changed",
    );
    check(
      objects.filter((o) => o.type === "run").length === 96,
      "a fixture stroke was lost",
    );
    validateProject({
      version: 1,
      name: "SVG regression",
      machine: "se700",
      groups: objects.groups,
      objects,
    });
    const plan = generate({
      version: 1,
      name: "SVG regression",
      machine: "se700",
      groups: objects.groups,
      objects,
    });
    check(
      plan.stats.stitches > 0 && plan.stats.fits,
      "fixture does not digitize inside hoop",
    );
    // Independent oracle: native source paths vs normalized full path geometry.
    // These paths are original XML, not geometry produced by the importer.
    const original = new DOMParser().parseFromString(
      xml,
      "image/svg+xml",
    ).documentElement;
    const mount = document.createElement("div");
    mount.style.cssText = "position:fixed;left:-10000px;top:0;opacity:0;";
    const source = document.importNode(original, true),
      normal = document.createElementNS(ns, "path");
    mount.append(source);
    source.append(normal);
    document.body.append(mount);
    let maxNativeError = 0,
      maxLengthError = 0;
    const sourcePaths = [...source.querySelectorAll("path")].filter(
      (p) => p !== normal,
    );
    const nativeBox = source.getBBox();
    try {
      for (const path of sourcePaths) {
        const contours = parseSVGPath(path.getAttribute("d"));
        normal.setAttribute(
          "d",
          contours
            .map(
              (c) =>
                `M${c.start.x} ${c.start.y} ` +
                c.segments.map((s) => s.type + s.args.join(" ")).join(" ") +
                (c.closed ? " Z" : ""),
            )
            .join(" "),
        );
        const length = path.getTotalLength(),
          nLength = normal.getTotalLength();
        maxLengthError = Math.max(maxLengthError, Math.abs(length - nLength));
        if (length > 0)
          for (let i = 0; i <= 100; i++) {
            const a = path.getPointAtLength((length * i) / 100),
              b = normal.getPointAtLength((nLength * i) / 100);
            maxNativeError = Math.max(
              maxNativeError,
              Math.hypot(a.x - b.x, a.y - b.y),
            );
          }
      }
    } finally {
      mount.remove();
    }
    // Pixel oracle uses the browser's untouched source SVG renderer and compares
    // only fills; stroke width is intentionally not represented by running paths.
    const size = 768,
      pad = 12,
      span = Math.max(nativeBox.width, nativeBox.height),
      center = {
        x: nativeBox.x + nativeBox.width / 2,
        y: nativeBox.y + nativeBox.height / 2,
      };
    original.setAttribute("width", size);
    original.setAttribute("height", size);
    original.setAttribute(
      "viewBox",
      `${center.x - span / 2} ${center.y - span / 2} ${span} ${span}`,
    );
    for (const el of [original, ...original.querySelectorAll("*")])
      el.setAttribute("stroke", "none");
    const img = new Image(),
      url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(original)], {
          type: "image/svg+xml",
        }),
      );
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const reference = document.createElement("canvas"),
      actual = document.createElement("canvas");
    reference.width = actual.width = size;
    reference.height = actual.height = size;
    const r = reference.getContext("2d"),
      a = actual.getContext("2d");
    r.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);
    URL.revokeObjectURL(url);
    a.translate(size / 2, size / 2);
    a.scale((size - pad * 2) / 75, (size - pad * 2) / 75);
    for (const o of objects.filter((o) => o.type === "fill")) {
      a.beginPath();
      for (const ring of o.rings) {
        a.moveTo(ring[0].x, ring[0].y);
        for (const p of ring.slice(1)) a.lineTo(p.x, p.y);
        a.closePath();
      }
      a.fillStyle = o.color;
      a.fill(o.fillRule || "evenodd");
    }
    const rp = r.getImageData(0, 0, size, size).data,
      ap = a.getImageData(0, 0, size, size).data;
    let intersection = 0,
      union = 0,
      colorMismatch = 0,
      interior = 0;
    for (let i = 0; i < rp.length; i += 4) {
      const x = rp[i + 3] > 127,
        y = ap[i + 3] > 127;
      if (x || y) union++;
      if (x && y) intersection++;
      if (rp[i + 3] === 255 && ap[i + 3] === 255) {
        interior++;
        if (
          Math.max(...[0, 1, 2].map((c) => Math.abs(rp[i + c] - ap[i + c]))) >
          32
        )
          colorMismatch++;
      }
    }
    return {
      objects: objects.length,
      fills: objects.filter((o) => o.type === "fill").length,
      strokes: objects.filter((o) => o.type === "run").length,
      warnings: objects.importWarnings,
      calls,
      points: objects.reduce((n, o) => n + o.rings.flat().length, 0),
      stitches: plan.stats.stitches,
      maxNativeError,
      maxLengthError,
      iou: intersection / union,
      interiorColorMismatch: colorMismatch / interior,
      reference: reference.toDataURL(),
      actual: actual.toDataURL(),
    };
  }, xml);
  for (const key of ["reference", "actual"]) {
    await writeFile(
      `test-results/svg-${key}.png`,
      Buffer.from(result[key].split(",")[1], "base64"),
    );
    delete result[key];
  }
  console.log(JSON.stringify(result, null, 2));
  assert(
    result.maxNativeError < 0.15,
    "normalized paths differ from native SVG geometry",
  );
  assert(
    result.iou > 0.995,
    "imported silhouette differs from source SVG rendering",
  );
  assert(
    result.interiorColorMismatch < 0.002,
    "imported colors differ from source SVG rendering",
  );
  // Exercise the real file input, application state and stitch worker too.
  await page
    .locator("#file-input")
    .setInputFiles(
      fileURLToPath(
        new URL("./fixtures/generated-artwork.svg", import.meta.url),
      ),
    );
  await page.waitForFunction(
    () =>
      window.studio.getProject().objects.length === 203 &&
      window.studio.getPlan()?.stats?.stitches > 0,
  );
  assert(!(await page.locator("#status").innerText()).includes("failed"));
  const imported = await page.evaluate(() => ({
    project: window.studio.getProject(),
    selection: window.studio.getSelection(),
  }));
  assert.equal(imported.selection.objects.length, 191);
  assert.equal(
    imported.project.groups.find((g) => g.id === imported.selection.ids[0])
      .kind,
    "svg",
  );
  const gesture = await page.evaluate(async () => {
    const { selectedLeaves, selectionBounds } = await import(
      "./src/hierarchy.js"
    );
    const p = window.studio.getProject(),
      ids = window.studio.getSelection().ids;
    const b = selectionBounds(
        selectedLeaves({ project: p, selectionIds: ids }),
      ),
      r = document.getElementById("stage").getBoundingClientRect(),
      scale = Math.min((r.width - 105) / 112, (r.height - 100) / 112);
    return {
      b,
      scale,
      cx: r.x + r.width / 2 + 18,
      cy: r.y + r.height / 2 + 19,
    };
  });
  await page.mouse.move(
    gesture.cx + gesture.b.maxX * gesture.scale,
    gesture.cy + gesture.b.maxY * gesture.scale,
  );
  await page.mouse.down();
  await page.mouse.move(
    gesture.cx + (gesture.b.minX + gesture.b.width * 0.8) * gesture.scale,
    gesture.cy + (gesture.b.minY + gesture.b.height * 0.8) * gesture.scale,
    { steps: 5 },
  );
  await page.mouse.up();
  await page.waitForFunction(() => window.studio.getPlan());
  const resized = await page.evaluate(() => window.studio.getProject());
  assert.deepEqual(
    resized.objects.slice(0, 12),
    imported.project.objects.slice(0, 12),
  );
  resized.objects.slice(12).forEach((o, i) => {
    const originalPoints = imported.project.objects[i + 12].rings.flat();
    o.rings.flat().forEach((q, j) => {
      const old = originalPoints[j];
      assert(
        Math.abs(q.x - (gesture.b.minX + (old.x - gesture.b.minX) * 0.8)) <
          0.25,
      );
      assert(
        Math.abs(q.y - (gesture.b.minY + (old.y - gesture.b.minY) * 0.8)) <
          0.25,
      );
    });
  });
  await page.locator("#undo").click();
  await page.waitForFunction(() => window.studio.getPlan());
  assert(
    JSON.stringify(await page.evaluate(() => window.studio.getProject())) ===
      JSON.stringify(imported.project),
    "Undo changed imported geometry or persisted properties",
  );
  console.log(
    "SVG browser regression passed, including the exact 96-path attachment and real file-input workflow.",
  );
} finally {
  await browser.close();
}
