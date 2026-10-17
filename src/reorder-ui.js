// Delegated pointer dragging keeps touch scrolling available outside the grip.
// Keyboard users use Alt+arrows on the same grip; all commits use app history.
export function installReordering(
  container,
  { item, handle, horizontal = false, start, commit, announce },
) {
  let drag = null,
    frame,
    swallowClick = false;
  const clearMarks = () =>
    container
      .querySelectorAll(".drop-before,.drop-after")
      .forEach((el) => el.classList.remove("drop-before", "drop-after"));
  function mark(x, y) {
    clearMarks();
    const el = document.elementFromPoint(x, y)?.closest(item);
    drag.target = null;
    if (
      !el ||
      !container.contains(el) ||
      drag.ids.includes(el.dataset.reorderId)
    )
      return;
    const r = el.getBoundingClientRect(),
      after = horizontal ? x > r.x + r.width / 2 : y > r.y + r.height / 2;
    drag.target = el.dataset.reorderId;
    drag.after = after;
    el.classList.add(after ? "drop-after" : "drop-before");
  }
  function scroll() {
    if (!drag?.active) return;
    const r = container.getBoundingClientRect(),
      pos = horizontal ? drag.x : drag.y,
      low = horizontal ? r.left : r.top,
      high = horizontal ? r.right : r.bottom,
      delta = pos < low + 32 ? -10 : pos > high - 32 ? 10 : 0;
    if (delta) {
      container.scrollBy(horizontal ? { left: delta } : { top: delta });
      mark(drag.x, drag.y);
    }
    frame = requestAnimationFrame(scroll);
  }
  function cancel() {
    const previous = drag;
    drag = null;
    if (previous?.active) {
      swallowClick = true;
      setTimeout(() => {
        swallowClick = false;
      }, 0);
    }
    previous?.el.classList.remove("dragging");
    if (previous?.grip.hasPointerCapture(previous.pointer))
      previous.grip.releasePointerCapture(previous.pointer);
    cancelAnimationFrame(frame);
    clearMarks();
    document.body.classList.remove("reordering");
  }
  container.addEventListener("pointerdown", (e) => {
    const grip = e.target.closest(handle),
      el = grip?.closest(item);
    if (!el || e.button !== 0) return;
    const ids = start(el.dataset.reorderId);
    if (!ids?.length) return;
    drag = {
      el,
      grip,
      ids,
      pointer: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
    };
    grip.setPointerCapture(e.pointerId);
  });
  container.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (
      !drag.active &&
      Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5
    ) {
      drag.active = true;
      drag.el.classList.add("dragging");
      document.body.classList.add("reordering");
      frame = requestAnimationFrame(scroll);
    }
    if (drag.active) mark(e.clientX, e.clientY);
  });
  container.addEventListener("pointerup", (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const { ids, target, after, active } = drag;
    cancel();
    if (active && target) {
      // Let compatibility touchend reach its original target before replacing
      // the tree's DOM. Mouse commits can happen immediately.
      if (e.pointerType === "touch")
        requestAnimationFrame(() => commit(ids, target, after));
      else commit(ids, target, after);
    }
  });
  container.addEventListener("pointercancel", cancel);
  container.addEventListener("lostpointercapture", () => {
    if (drag) cancel();
  });
  container.addEventListener(
    "click",
    (e) => {
      if (swallowClick) {
        swallowClick = false;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  container.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drag) {
      e.preventDefault();
      cancel();
      return;
    }
    const grip = e.target.closest(handle),
      el = grip?.closest(item),
      dir = (
        horizontal ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"]
      ).indexOf(e.key);
    if (!el || !e.altKey || dir < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const ids = start(el.dataset.reorderId),
      list = [...container.querySelectorAll(item)],
      index = list.indexOf(el),
      target = list.slice(dir ? index + 1 : 0, dir ? undefined : index);
    if (!dir) target.reverse();
    const next = target.find((n) => !ids.includes(n.dataset.reorderId));
    if (next && commit(ids, next.dataset.reorderId, Boolean(dir))) {
      [...container.querySelectorAll(item)]
        .find((n) => n.dataset.reorderId === el.dataset.reorderId)
        ?.querySelector(handle)
        ?.focus();
      announce?.("Sewing order updated.");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drag) cancel();
  });
}
