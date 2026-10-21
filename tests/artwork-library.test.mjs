import test from "node:test";
import assert from "node:assert/strict";
import {
  extractArtwork,
  validateArtwork,
  insertArtwork,
  artworkBounds,
  portableJSON,
} from "../src/artwork-library.js";
import { artworkFixture, square } from "./helpers/artwork-fixtures.mjs";
import { object, validateProject } from "../src/model.js";
import { syncLinkedArtwork } from "../src/linked-artwork.js";
import { generate } from "../src/engine.js";
import { addReference } from "../src/references.js";
const empty = () => ({
  version: 1,
  name: "Destination",
  machine: "se700",
  objects: [],
  groups: [],
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("reference assets remain portable and independent, without contributing stitches", () => {
  const p = empty(),
    asset = {
      name: "Guide.png",
      width: 1,
      height: 1,
      data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6M0sAAAAASUVORK5CYII=",
    },
    o = addReference(p, asset),
    a = extractArtwork(p, [o.id]),
    d = empty();
  insertArtwork(d, a);
  const reference = d.objects[0];
  assert.equal(d.referenceAssets[reference.reference.assetId].data, asset.data);
  assert.equal(reference.locked, true);
  assert.equal(generate(d).events.filter((e) => e.cmd === "stitch").length, 0);
  assert.deepEqual(a.referenceAssets, p.referenceAssets);
  validateProject(d);
  const existing = addReference(d, { ...asset, name: "Existing guide.png" }),
    existingKey = existing.reference.assetId;
  d.referenceAssets[existingKey].name = "Existing guide.png";
  insertArtwork(d, a);
  assert.equal(
    d.referenceAssets[existingKey].name,
    "Existing guide.png",
    "deduplication must not overwrite destination asset metadata",
  );
});
test("editable source and relationships survive independent insertion with exact dimensions", () => {
  const p = artworkFixture(),
    before = structuredClone(p),
    a = extractArtwork(p, ["outer"]),
    d = empty(),
    result = insertArtwork(d, a);
  validateProject(d);
  assert.deepEqual(p, before);
  assert.deepEqual(a, extractArtwork(p, ["outer"]));
  assert.equal(d.objects.length, 9);
  assert.equal(d.groups.length, 2);
  const b = artworkBounds(a),
    c = artworkBounds(d);
  near(c.width, b.width);
  near(c.height, b.height);
  near(c.minX + c.maxX, 0);
  near(c.minY + c.maxY, 0);
  for (let i = 0; i < 9; i++) {
    const o = a.objects[i],
      n = d.objects[i];
    assert.notEqual(n.id, o.id);
    assert.deepEqual(
      n.operations?.map(({ id, ...s }) => s),
      o.operations?.map(({ id, ...s }) => s),
    );
    assert.equal(n.rings?.length, o.rings?.length);
    if (n.textSource) assert.equal(n.textSource.content, "O");
    if (n.shape) assert.equal(n.shape.kind, o.shape.kind);
    if (n.effects) assert.deepEqual(n.effects.source, o.effects.source);
  }
  const linked = d.objects[6],
    rings = structuredClone(linked.rings);
  syncLinkedArtwork(d);
  assert.deepEqual(linked.rings, rings);
  assert.equal(linked.linkedGeometry.sourceId, result.map.get(p.objects[1].id));
  assert.deepEqual(
    d.objects[7].constructionArtworkIds,
    p.objects[7].constructionArtworkIds.map((id) => result.map.get(id)),
  );
  const first = structuredClone(d);
  insertArtwork(d, a, { x: 10, y: 10 });
  assert.equal(new Set([...d.groups, ...d.objects].map((o) => o.id)).size, 22);
  d.objects[9].rings[0][0].x += 1;
  assert.deepEqual(d.objects.slice(0, 9), first.objects);
  assert.deepEqual(p, before);
  assert.ok(generate(first).events.some((e) => e.cmd === "stitch"));
});
test("single and multiple roots detach parent scope; missing dependencies are explained", () => {
  const p = artworkFixture(),
    a = extractArtwork(p, [p.objects[0].id]);
  assert.equal(a.objects[0].parentId, null);
  assert.equal(a.objects[0].rings.length, 2);
  for (const o of [p.objects[6], p.objects[7]])
    assert.throws(
      () => extractArtwork(p, [o.id]),
      /Also select related artwork/,
    );
  assert.equal(
    extractArtwork(p, [p.objects[1].id, p.objects[6].id]).roots.length,
    2,
  );
  p.groups[0].locked = true;
  p.groups[0].visible = false;
  const inherited = extractArtwork(p, [p.objects[0].id]);
  assert.equal(inherited.objects[0].locked, true);
  assert.equal(inherited.objects[0].visible, false);
});
test("manual order and SVG references are remapped while destination equipment stays intact", () => {
  const a = object("A", [square(4)]),
    b = object("B", [square(3)]);
  b.svgFillId = a.id;
  const p = {
      ...empty(),
      objects: [a, b],
      sequencing: { mode: "manual", origin: "sequence", order: [b.id, a.id] },
    },
    d = {
      ...empty(),
      machine: "generic200",
      objects: [object("Old", [square(2)])],
    },
    old = structuredClone(d.objects[0]);
  const r = insertArtwork(d, extractArtwork(p, [a.id, b.id]));
  assert.equal(d.machine, "generic200");
  assert.deepEqual(d.objects[0], old);
  assert.equal(d.objects[2].svgFillId, d.objects[1].id);
  assert.deepEqual(d.sequencing.order, [
    old.id,
    r.map.get(b.id),
    r.map.get(a.id),
  ]);
  assert.throws(() => extractArtwork(p, [b.id]), /Also select/);
});
test("invalid payloads are rejected atomically and resource/security limits are enforced", () => {
  const p = artworkFixture(),
    a = extractArtwork(p, ["outer"]),
    d = empty();
  for (const change of [
    (x) => x.roots.push("bad"),
    (x) => (x.objects[0].rings[0][0].x = 1e9),
    (x) => (x.objects[6].linkedGeometry.sourceId = "missing"),
    (x) => (x.groups[0].parentId = x.groups[1].id),
  ]) {
    const bad = structuredClone(a);
    change(bad);
    assert.throws(() => validateArtwork(bad));
    assert.throws(() => insertArtwork(d, bad));
    assert.deepEqual(d, empty());
  }
  assert.throws(() => portableJSON({ s: "x".repeat(1100) }, 1000), /limit/);
  assert.throws(() => portableJSON(JSON.parse('{"__proto__":{}}')), /Unsafe/);
  assert.throws(() => extractArtwork(p, []), /source objects/);
});
