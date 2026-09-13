export const ROI = { x: 50, y: 0, size: 300 };
export function validId(value) {
  return String(value).trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 586;
}
export function crop4by3(w, h) {
  const sw = Math.min(w, h * 4 / 3), sh = sw * 3 / 4;
  return [(w - sw) / 2, (h - sh) / 2, sw, sh];
}
export function evaluate(detections, mode, id, minimum, mirrored) {
  const tags = detections.map(d => {
    const point = p => ({x: mirrored ? 400 - p.x * 1.25 : p.x * 1.25, y: p.y * 1.25});
    const corners = d.corners.map(point), center = point(d.center);
    return {id: d.id, corners, center,
      w: Math.max(...corners.map(p => p.x)) - Math.min(...corners.map(p => p.x)),
      h: Math.max(...corners.map(p => p.y)) - Math.min(...corners.map(p => p.y))};
  }).filter(t => Math.max(t.w, t.h) >= minimum && (mode === 'classification'
    ? t.center.x >= ROI.x && t.center.x <= ROI.x + ROI.size && t.center.y >= ROI.y && t.center.y <= ROI.y + ROI.size
    : t.id === id));
  tags.sort(mode === 'classification'
    ? (a,b) => ((a.center.x-200)**2+(a.center.y-150)**2)-((b.center.x-200)**2+(b.center.y-150)**2) || a.id-b.id
    : (a,b) => b.w*b.h-a.w*a.h || a.center.x-b.center.x);
  const primary = tags[0];
  const packet = !primary ? (mode === 'classification' ? 'none' : 'stop') : mode === 'classification'
    ? `ID${primary.id}` : `x${Math.round(primary.center.x)}y${Math.round(primary.center.y)}w${Math.round(primary.w)}h${Math.round(primary.h)}d${tags.length}`;
  return {tags, primary, packet: packet + '\n'};
}
