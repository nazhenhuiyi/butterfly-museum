export function wrapSpecies(current, direction, count) {
  return ((current + direction) % count + count) % count;
}

export function wheelDirection(horizontal, vertical) {
  const delta = Math.abs(vertical) > Math.abs(horizontal) ? vertical : horizontal;
  return Math.abs(delta) > 4 ? Math.sign(delta) : 0;
}

export function swipeDirection(start, end) {
  const vertical = end.vertical - start.vertical;
  const horizontal = end.horizontal - start.horizontal;
  return Math.abs(vertical) > 45 && Math.abs(vertical) > Math.abs(horizontal) ? (vertical < 0 ? 1 : -1) : 0;
}
