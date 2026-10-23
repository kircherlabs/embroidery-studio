import { generate } from "./engine.js";
import { generateMultiHoop } from "./multi-hoop-split.js";
self.onmessage = ({ data }) => {
  try {
    if (data.project.multiHoop?.enabled) {
      const multiHoop = generateMultiHoop(data.project);
      self.postMessage({ id: data.id, ...multiHoop.assembled, multiHoop });
    } else self.postMessage({ id: data.id, ...generate(data.project) });
  } catch (e) {
    self.postMessage({ id: data.id, error: e.message });
  }
};
