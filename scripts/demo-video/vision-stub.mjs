// Demo stand-in for MediaPipe: replays the hand tracked from Sean's own clips.
const CONN = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
export const FilesetResolver = { forVisionTasks: async () => ({}) };
export class GestureRecognizer {
  static HAND_CONNECTIONS = CONN.map(([start, end]) => ({ start, end }));
  static async createFromOptions() { return new GestureRecognizer(); }
  recognizeForVideo() {
    const ms = window.__demo.now();
    const f = ms < 0 ? null : window.__demo.frame(ms);
    return f ? { landmarks: [f.lm], gestures: [[{ categoryName: f.g, score: f.score }]] } : { landmarks: [], gestures: [] };
  }
}
export class DrawingUtils { constructor() {} drawConnectors() {} drawLandmarks() {} }
