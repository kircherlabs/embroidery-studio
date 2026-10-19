// Reveal ordinary disclosure sections before interacting with advanced controls.
// Sewing action selection itself remains an explicit click in browser tests.
export async function reveal(locator) {
  await locator.evaluate((el) => {
    for (let p = el.parentElement; p; p = p.parentElement)
      if (p.tagName === "DETAILS") p.open = true;
  });
}
