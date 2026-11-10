// Webcam + MediaPipe gesture recogniser. Everything runs in the browser:
// the model and its runtime are served from this site, and no frame leaves
// the device.
import { FilesetResolver, GestureRecognizer, DrawingUtils } from '../vendor/mediapipe/vision_bundle.mjs';

const WASM_DIR = new URL('../vendor/mediapipe/wasm', import.meta.url).href;
const MODEL = new URL('../models/gesture_recognizer.task', import.meta.url).href;

export class HandCamera {
  // onFrame({ t, landmarks, gesture, score }) is called for every processed frame.
  // options.schedule replaces requestAnimationFrame, for pages that are never
  // shown on screen (like the Kindle extension's hidden camera page), where
  // animation frames don't fire.
  constructor(video, overlay, onFrame, options = {}) {
    this.video = video;
    this.schedule = options.schedule || ((fn) => requestAnimationFrame(fn));
    this.overlay = overlay;
    this.onFrame = onFrame;
    this.recognizer = null;
    this.stream = null;
    this.running = false;
    this.lastVideoTime = -1;
    this.lastHandAt = 0;
  }

  async loadModel() {
    if (this.recognizer) return;
    const fileset = await FilesetResolver.forVisionTasks(WASM_DIR);
    const make = (delegate) => GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
    });
    try {
      this.recognizer = await make('GPU');
    } catch {
      this.recognizer = await make('CPU');
    }
  }

  async start() {
    await this.loadModel();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.overlay.width = this.video.videoWidth;
    this.overlay.height = this.video.videoHeight;
    this.running = true;
    this.lastVideoTime = -1;
    this.loop();
  }

  // Turns the camera fully off: the browser's camera light goes out.
  stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    const ctx = this.overlay.getContext('2d');
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  loop() {
    if (!this.running) return;
    const now = performance.now();
    // With no hand in view, check about 10 times a second to keep the laptop cool.
    const idle = now - this.lastHandAt > 1500;
    const due = !idle || now - (this.lastProcessed || 0) >= 100;
    if (due && this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      this.lastProcessed = now;
      const result = this.recognizer.recognizeForVideo(this.video, now);
      const landmarks = result.landmarks?.[0] || null;
      const top = result.gestures?.[0]?.[0];
      if (landmarks) this.lastHandAt = now;
      this.draw(landmarks);
      this.onFrame({
        t: now,
        landmarks,
        gesture: top?.categoryName || 'None',
        score: top?.score || 0,
      });
    }
    this.schedule(() => this.loop());
  }

  draw(landmarks) {
    const ctx = this.overlay.getContext('2d');
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    if (!landmarks) return;
    const utils = new DrawingUtils(ctx);
    utils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, { color: '#7dd3fc', lineWidth: 3 });
    utils.drawLandmarks(landmarks, { color: '#0ea5e9', radius: 3 });
  }
}
