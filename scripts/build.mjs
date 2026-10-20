import { mkdir, copyFile, cp, rm, readdir, readFile } from "node:fs/promises";
import { checkThreadAsset } from "./thread-asset-policy.mjs";
async function reviewAssets(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = dir + "/" + item.name;
    if (item.isDirectory()) await reviewAssets(path);
    else
      checkThreadAsset(
        path,
        /\.(json|csv)$/i.test(item.name) ? await readFile(path, "utf8") : "",
      );
  }
}
for (const dir of ["src", "vendor", "assets"]) await reviewAssets(dir);
// Only these runtime assets are deployed; tests and source tooling stay in the repo.
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
for (const file of [
  "index.html",
  "styles.css",
  "workspace.css",
  "creative.css",
])
  await copyFile(file, `dist/${file}`);
for (const dir of ["src", "vendor", "assets"])
  await cp(dir, `dist/${dir}`, { recursive: true });
await copyFile("LICENSE", "dist/LICENSE");
await copyFile("THIRD_PARTY_NOTICES.md", "dist/THIRD_PARTY_NOTICES.md");
await copyFile(".nojekyll", "dist/.nojekyll");
console.log("Static application built in dist/");
