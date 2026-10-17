// Lazy, isolated local Python/WASM runtime. Artwork is never sent to a server.
let runtime;
async function ready() {
  if (!runtime)
    runtime = (async () => {
      self.postMessage({ status: "Loading local machine-file engine…" });
      importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js");
      const py = await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/",
      });
      const [archive, bridge] = await Promise.all([
        fetch("../vendor/pyembroidery.zip"),
        fetch("./codec.py"),
      ]);
      if (!archive.ok || !bridge.ok)
        throw Error("Machine-file engine assets could not be loaded.");
      py.unpackArchive(await archive.arrayBuffer(), "zip");
      await py.runPythonAsync(await bridge.text());
      return py;
    })().catch((e) => {
      runtime = null;
      throw e;
    });
  return runtime;
}
self.onmessage = async ({ data }) => {
  try {
    const py = await ready(),
      ext = data.format || data.name.split(".").at(-1).toLowerCase();
    if (!["pes", "pec", "dst", "exp", "jef", "vp3", "xxx"].includes(ext))
      throw Error("Unsupported embroidery format.");
    const path = "/tmp/design." + ext;
    let events, bytes;
    try {
      if (data.action === "export") {
        py.globals.set(
          "studio_payload",
          JSON.stringify({ events: data.events, name: data.name }),
        );
        py.globals.set("studio_path", path);
        const result = await py.runPythonAsync(
          "json.dumps(encode_file(studio_payload, studio_path))",
        );
        events = JSON.parse(result);
        bytes = py.FS.readFile(path);
      } else {
        py.FS.writeFile(path, new Uint8Array(data.bytes));
        py.globals.set("studio_path", path);
        events = JSON.parse(
          await py.runPythonAsync("json.dumps(decode_file(studio_path))"),
        );
      }
    } finally {
      try {
        py.FS.unlink(path);
      } catch {}
      for (const key of ["studio_payload", "studio_path"])
        try {
          py.globals.delete(key);
        } catch {}
    }
    self.postMessage(
      { id: data.id, events, bytes },
      bytes ? [bytes.buffer] : [],
    );
  } catch (e) {
    self.postMessage({ id: data.id, error: e.message || String(e) });
  }
};
