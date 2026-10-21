import test from "node:test";
import assert from "node:assert/strict";
import { LatestGenerationWorker } from "../src/generation-worker.js";
test("obsolete synchronous generations terminate instead of queueing, and stale callbacks cannot replace current results", () => {
  const made = [],
    received = [];
  const create = () => {
    const w = {
      requests: [],
      terminated: false,
      postMessage(d) {
        this.requests.push(d);
      },
      terminate() {
        this.terminated = true;
      },
    };
    made.push(w);
    return w;
  };
  const worker = new LatestGenerationWorker(create);
  worker.onmessage = (e) => received.push(e.data);
  worker.postMessage({ id: 1 });
  worker.postMessage({ id: 2 });
  assert.equal(made.length, 2);
  assert.equal(made[0].terminated, true);
  made[0].onmessage({ data: { id: 1, events: ["stale"] } });
  assert.equal(received.length, 0);
  made[1].onmessage({ data: { id: 2, events: ["current"] } });
  assert.deepEqual(received, [{ id: 2, events: ["current"] }]);
  worker.postMessage({ id: 3 });
  assert.equal(made.length, 2);
  assert.deepEqual(
    made[1].requests.map((r) => r.id),
    [2, 3],
  );
  worker.terminate();
  assert.equal(made[1].terminated, true);
});
