/**
 * Independent PES/PEC decoder.
 * Adapted from the user-supplied PES repair package; test-only, not a writer.
 *
 * Written from the PEC format description and cross-checked against the Brother
 * SE700 observations, NOT derived from the exporter's own code, so tests that use
 * it are genuine round-trip checks rather than the writer validating itself.
 *
 * Units: every coordinate in a PES/PEC file is an integer in 0.1 mm.
 * Orientation: +x right, +y down (screen convention).
 */

const s12 = (v) => ((v & 0xfff) >= 0x800 ? (v & 0xfff) - 0x1000 : v & 0xfff);

export function decodePes(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== "#PES") throw new Error(`not a PES file (magic ${magic})`);
  const version = String.fromCharCode(...bytes.subarray(4, 8));
  const pecOffset = dv.getUint32(8, true);
  const pec = decodePec(bytes, pecOffset);
  let pes = null;
  if (version >= "0060") pes = decodePesSection(bytes);
  return { magic, version, pecOffset, pec, pes };
}

export function decodePec(bytes, p) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (a, n) => String.fromCharCode(...bytes.subarray(a, a + n));
  if (ascii(p, 3) !== "LA:")
    throw new Error('PEC header "LA:" not found at PEC offset');
  const label = ascii(p + 3, 16).trimEnd();
  const thumbStrideBytes = bytes[p + 34];
  const thumbHeight = bytes[p + 35];
  const nColors = bytes[p + 48] + 1;
  const colorIndices = Array.from(bytes.subarray(p + 49, p + 49 + nColors));

  const sb = p + 512;
  const stitchBlockLength =
    bytes[sb + 2] | (bytes[sb + 3] << 8) | (bytes[sb + 4] << 16);
  const h = sb + 5;
  if (bytes[h] !== 0x31 || bytes[h + 1] !== 0xff || bytes[h + 2] !== 0xf0) {
    throw new Error("PEC stitch block signature 31 FF F0 not found");
  }
  const declaredWidth = dv.getUint16(h + 3, true);
  const declaredHeight = dv.getUint16(h + 5, true);
  const originFieldOffset = h + 11;
  const originFieldX = s12(dv.getUint16(originFieldOffset, false));
  const originFieldY = s12(dv.getUint16(originFieldOffset + 2, false));

  const events = [];
  let i = h + 15;
  let x = 0;
  let y = 0;
  const readVal = (at) => {
    const b = bytes[at];
    if (b & 0x80)
      return {
        v: s12(((b & 0x0f) << 8) | bytes[at + 1]),
        len: 2,
        flags: b & 0x30,
      };
    return { v: b >= 0x40 ? b - 0x80 : b, len: 1, flags: 0 };
  };
  for (;;) {
    if (i >= bytes.length)
      throw new Error("PEC stream ran off the end of the file without 0xFF");
    const b = bytes[i];
    if (b === 0xff) {
      events.push({ type: "end", x, y, raw: "ff" });
      i += 1;
      break;
    }
    if (b === 0xfe && bytes[i + 1] === 0xb0) {
      events.push({
        type: "colorChange",
        x,
        y,
        raw: hex(bytes, i, 3),
        marker: bytes[i + 2],
      });
      i += 3;
      continue;
    }
    const st = i;
    const a = readVal(i);
    i += a.len;
    const c = readVal(i);
    i += c.len;
    x += a.v;
    y += c.v;
    const flags = a.flags | c.flags;
    const type = flags & 0x20 ? "trim" : flags & 0x10 ? "jump" : "stitch";
    events.push({ type, x, y, raw: hex(bytes, st, i - st) });
  }
  const streamEnd = i;

  const thumbSize = thumbStrideBytes * thumbHeight;
  const thumbnails = [];
  let t = streamEnd;
  for (let k = 0; k < nColors + 1 && t + thumbSize <= bytes.length; k++) {
    thumbnails.push(bytes.slice(t, t + thumbSize));
    t += thumbSize;
  }

  return {
    label,
    colorIndices,
    thumbStrideBytes,
    thumbHeight,
    stitchBlockOffset: sb,
    stitchBlockLength,
    declaredWidth,
    declaredHeight,
    originFieldX,
    originFieldY,
    originFieldOffset,
    events,
    streamEnd,
    thumbnails,
    trailingBytes: bytes.length - t,
  };
}

function decodePesSection(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const find = (needle) => {
    const n = [...needle].map((c) => c.charCodeAt(0));
    outer: for (let i = 0; i < bytes.length - n.length; i++) {
      for (let j = 0; j < n.length; j++)
        if (bytes[i + j] !== n[j]) continue outer;
      return i;
    }
    return -1;
  };
  const e = find("CEmbOne");
  const s = find("CSewSeg");
  if (e < 0 || s < 0) return null;
  const b = e + 7;
  const extents1 = [0, 1, 2, 3].map((k) => dv.getInt16(b + k * 2, true));
  const extents2 = [0, 1, 2, 3].map((k) => dv.getInt16(b + 8 + k * 2, true));
  const matrix = [0, 1, 2, 3, 4, 5].map((k) =>
    dv.getFloat32(b + 16 + k * 4, true),
  );
  const width = dv.getInt16(b + 40 + 6, true);
  const height = dv.getInt16(b + 40 + 8, true);
  const blockCountField = dv.getUint16(s - 8, true);
  let q = s + 7;
  const blocks = [];
  for (let k = 0; k < blockCountField; k++) {
    const type = dv.getInt16(q, true);
    const colorIndex = dv.getInt16(q + 2, true);
    const n = dv.getUint16(q + 4, true);
    q += 6;
    const points = [];
    for (let i = 0; i < n; i++) {
      points.push([dv.getInt16(q, true), dv.getInt16(q + 2, true)]);
      q += 4;
    }
    blocks.push({ type, colorIndex, points });
    if (k < blockCountField - 1) {
      if (dv.getInt16(q, true) !== -32765)
        throw new Error(`missing 0x8003 separator after PES block ${k}`);
      q += 2;
    }
  }
  const nCol = dv.getUint16(q, true);
  q += 2;
  const colorLog = [];
  for (let i = 0; i < nCol; i++) {
    colorLog.push([dv.getUint16(q, true), dv.getUint16(q + 2, true)]);
    q += 4;
  }
  return {
    extents1,
    extents2,
    matrix,
    width,
    height,
    blockCountField,
    blocks,
    colorLog,
  };
}

function hex(b, at, n) {
  return [...b.subarray(at, at + n)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}

// ───────────────────────────── derived views ──────────────────────────────

/** Bounding box of every position the needle/head visits (stitch, jump, trim), 0.1 mm. */
export function streamExtents(pec) {
  const pts = pec.events.filter(
    (e) => e.type === "stitch" || e.type === "jump" || e.type === "trim",
  );
  if (!pts.length) throw new Error("no positional events");
  return {
    left: Math.min(...pts.map((p) => p.x)),
    top: Math.min(...pts.map((p) => p.y)),
    right: Math.max(...pts.map((p) => p.x)),
    bottom: Math.max(...pts.map((p) => p.y)),
  };
}

/** Bounding box of actual stitches only (what the design "looks like"). */
export function stitchExtents(pec) {
  const pts = pec.events.filter((e) => e.type === "stitch");
  return {
    left: Math.min(...pts.map((p) => p.x)),
    top: Math.min(...pts.map((p) => p.y)),
    right: Math.max(...pts.map((p) => p.x)),
    bottom: Math.max(...pts.map((p) => p.y)),
  };
}

/**
 * The hardware-compatible rectangle uses (-minX, -minY) in the origin prefix.
 * The pinned PyEmbroidery reader instead consumes these words as a first jump;
 * separating them here catches the defect that its own round trip misses.
 */
export function declaredRect(pec) {
  const left = 0 - pec.originFieldX; // `0 -` avoids -0
  const top = 0 - pec.originFieldY;
  return {
    left,
    top,
    right: left + pec.declaredWidth,
    bottom: top + pec.declaredHeight,
  };
}

/**
 * MODEL of what the Brother SE700 shows as the design size: the overlap between the
 * declared rectangle and the real stitch extents.
 *
 * This is an empirical model, fitted to hardware: it reproduces the SE700's reading of
 * 37.6 x 20.2 mm for the broken HayDave.pes (declared 75.2 x 40.4) exactly, and predicts
 * the full 75.2 x 40.4 once the origin fields are corrected. It is not documented Brother
 * behaviour, which is why the physical re-test is still required.
 */
export function modelMachineSizeMm(pec) {
  const d = declaredRect(pec);
  const s = streamExtents(pec);
  const ov = (a0, a1, b0, b1) =>
    Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  return {
    widthMm: ov(d.left, d.right, s.left, s.right) / 10,
    heightMm: ov(d.top, d.bottom, s.top, s.bottom) / 10,
  };
}
