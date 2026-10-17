import { generate } from "./engine.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, ...generate(data.project) });
  } catch (e) {
    self.postMessage({ id: data.id, error: e.message });
  }
};
