import { detectColors, borderMask } from "./image-colors.js";
import { traceModel } from "./image-tracing.js";
let image = null,
  model = null,
  key = null;
self.onmessage = ({ data }) => {
  const { id, settings } = data;
  try {
    if (data.image) {
      image = data.image;
      model = null;
    }
    const next = `${settings.colors}:${settings.alpha}`;
    if (!model || key !== next) {
      model = detectColors(image, settings.colors, settings.alpha);
      key = next;
    }
    const result = traceModel(model, settings);
    self.postMessage({
      id,
      ...result,
      proposedMask:
        data.proposal && settings.background >= 0
          ? borderMask(model, settings.background).mask
          : null,
      palette: model.palette,
      background: model.background,
      width: model.width,
      height: model.height,
      opaque: model.opaque,
    });
  } catch (e) {
    self.postMessage({ id, error: e.message });
  }
};
