export function nextSlide(index, step, count) {
  if (count <= 1) return 0;
  return ((index + step) % count + count) % count;
}
export function autoplayAllowed({ count, paused, reducedMotion, visible, hovered, focused, overlayOpen }) {
  return count > 1 && !paused && !reducedMotion && visible && !hovered && !focused && !overlayOpen;
}
export function swipeDirection(startX, startY, endX, endY) {
  const dx = endX - startX, dy = endY - startY;
  if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return 0;
  return dx < 0 ? 1 : -1;
}
