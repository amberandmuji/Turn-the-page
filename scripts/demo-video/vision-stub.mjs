// Demo stand-in for MediaPipe: returns the scripted hand instead of tracking a real one.
const CONN = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
export const FilesetResolver = { forVisionTasks: async () => ({}) };
export class GestureRecognizer {
  static HAND_CONNECTIONS = CONN.map(([start, end]) => ({ start, end }));
  static async createFromOptions() { return new GestureRecognizer(); }
  recognizeForVideo() {
    const lm = window.__demo.landmarks(window.__demo.now());
    return lm ? { landmarks: [lm], gestures: [[{ categoryName: 'Open_Palm', score: 0.9 }]] } : { landmarks: [], gestures: [] };
  }
}
export class DrawingUtils {
  constructor(ctx) { this.ctx = ctx; }
  drawConnectors(lm, conns, { color, lineWidth }) {
    const c = this.ctx, w = c.canvas.width, h = c.canvas.height;
    c.strokeStyle = color; c.lineWidth = lineWidth; c.lineCap = 'round';
    for (const { start, end } of conns) { c.beginPath(); c.moveTo(lm[start].x * w, lm[start].y * h); c.lineTo(lm[end].x * w, lm[end].y * h); c.stroke(); }
  }
  drawLandmarks(lm, { color, radius }) {
    const c = this.ctx, w = c.canvas.width, h = c.canvas.height;
    c.fillStyle = color;
    for (const p of lm) { c.beginPath(); c.arc(p.x * w, p.y * h, radius, 0, Math.PI * 2); c.fill(); }
  }
}
