import test from "node:test";
import assert from "node:assert/strict";
import { artworkFixture } from "./helpers/artwork-fixtures.mjs";
import { extractArtwork } from "../src/artwork-library.js";
import {
  artworkThumbnail,
  artworkDimensions,
} from "../src/artwork-thumbnail.js";
test("thumbnail uses actual contour colors, holes and non-cropping aspect fit without generating embroidery", () => {
  const p = artworkFixture(),
    a = extractArtwork(p, ["outer"]),
    before = structuredClone(a),
    svg = artworkThumbnail(a);
  assert.ok(svg.includes('preserveAspectRatio="xMidYMid meet"'));
  assert.ok(svg.includes('fill-rule="evenodd"'));
  assert.ok(svg.includes("#ff0055"));
  assert.ok(svg.includes("#35483e"));
  assert.ok(!svg.includes("<script"));
  assert.match(artworkDimensions(a), /70\.0 × 65\.0 mm · 9 objects/);
  assert.deepEqual(a, before);
  const hole = artworkThumbnail(extractArtwork(p, [p.objects[0].id]));
  assert.equal(
    (hole.match(/Z/g) || []).length,
    4,
    "two contour passes retain the counter",
  );
});
