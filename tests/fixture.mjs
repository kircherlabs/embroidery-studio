import { generate } from "../src/engine.js";
import { demo } from "../src/model.js";
console.log(
  JSON.stringify({ name: "Studio test", events: generate(demo()).events }),
);
