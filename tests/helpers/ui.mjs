// Reveal ordinary disclosure sections before interacting with advanced controls.
// Sewing action selection itself remains an explicit click in browser tests.
export async function reveal(locator) {
  await locator.evaluate((el) => {
    for (let p = el.parentElement; p; p = p.parentElement)
      if (p.tagName === "DETAILS") p.open = true;
  });
}

// Choose the real operation through its category and contextual control.
export async function chooseMethod(page, type, { add = false } = {}) {
  const running = ["run", "bean", "triple"].includes(type),
    satin = ["satin", "border", "column"].includes(type),
    advanced = !running && !satin && type !== "fill";
  const primary = page.locator(add ? "#add-operation" : "#stitch-type");
  if (advanced) {
    const control = page.locator(
      add ? "#add-construction" : "#construction-method",
    );
    await reveal(control);
    await control.selectOption(type);
    return;
  }
  if (add) await reveal(primary);
  await primary.selectOption(running ? "run" : satin ? "satin" : "fill");
  if (satin)
    await page
      .locator(add ? "#add-satin-construction" : "#satin-construction")
      .selectOption(type);
  if (running && type !== "run")
    await page
      .locator(add ? "#add-reinforcement" : "#reinforcement")
      .selectOption(type);
}
