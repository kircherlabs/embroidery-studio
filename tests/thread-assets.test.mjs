import test from "node:test";
import assert from "node:assert/strict";
import { checkThreadAsset } from "../scripts/thread-asset-policy.mjs";
test("public build policy excludes research archives, charts and unreviewed physical thread datasets", () => {
  for (const name of [
    "assets/ThreadResearch.zip",
    "src/THREAD_COLORS.csv",
    "assets/imported.gpl",
    "vendor/PEC_PALETTE.csv",
  ])
    assert.throws(() => checkThreadAsset(name), /Unreviewed/);
  assert.throws(
    () =>
      checkThreadAsset(
        "assets/catalog.json",
        JSON.stringify({
          records: [
            {
              brandName: "Synthetic",
              lineName: "Fixture",
              number: "001",
              hex: "#ffffff",
            },
          ],
        }),
      ),
    /redistribution/,
  );
  assert.throws(
    () =>
      checkThreadAsset(
        "assets/chart.csv",
        "Brand,Product Line,Number,HEX\nSynthetic,Fixture,001,#ffffff",
      ),
    /local-import/,
  );
  assert.doesNotThrow(() => checkThreadAsset("vendor/pyembroidery.zip"));
  assert.doesNotThrow(() => checkThreadAsset("src/thread-records.js"));
  assert.doesNotThrow(() =>
    checkThreadAsset(
      "assets/machine-config.json",
      JSON.stringify({ machineId: "se700" }),
    ),
  );
});
