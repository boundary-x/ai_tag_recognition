/**
 * apriltag_worker.js
 * Boundary X - AprilTag Detection Worker
 *
 * Runs the AprilTag WASM detector (tag36h11 family) entirely inside a
 * Web Worker, off the main thread. This is the key to avoiding frame
 * drops on phones/tablets: camera capture and p5.js rendering on the
 * main thread never wait on tag detection.
 *
 * Grayscale conversion also happens in here (not on the main thread),
 * and the raw camera frame is received as a Transferable ArrayBuffer
 * (zero-copy) instead of being structure-cloned, to minimize overhead
 * on low-power mobile CPUs.
 *
 * Detector core: apriltag-js-standalone (BSD-3-Clause, CONIX Research Center)
 * https://github.com/arenaxr/apriltag-js-standalone
 * Underlying C library: AprilRobotics/apriltag (BSD-2-Clause, Univ. of Michigan)
 */

importScripts('apriltag_wasm.js');
importScripts('comlink.min.js');

class Apriltag {

  /**
   * @param {function} onDetectorReadyCallback called once the WASM module has finished loading
   */
  constructor(onDetectorReadyCallback) {
    this.onDetectorReadyCallback = onDetectorReadyCallback;

    // Detector options tuned for real-time performance on phones/tablets.
    // (See README.md "성능 최적화" section for the reasoning behind each value.)
    this._opt = {
      quad_decimate: 2.0,   // downsample factor used internally by the detector
      quad_sigma: 0.0,      // gaussian blur before segmentation (0 = off = fastest)
      nthreads: 1,          // has no effect in-browser; WASM here is single-threaded
      refine_edges: 0,      // OFF — saves CPU; we only need center/box, not sub-pixel edges
      max_detections: 8,    // cap results; a classroom scene rarely has more tags in view
      return_pose: 0,       // OFF — 3D pose estimation is NOT needed for the x/y/w/h protocol.
                             // This is the single biggest performance win: skipping pose
                             // estimation avoids a solvePnP-style computation per tag.
      return_solutions: 0
    };

    // Adaptive quality: if a device is consistently slow, we automatically
    // raise quad_decimate (trading max detection distance for frame rate).
    // This only ever moves in one direction to avoid visible oscillation.
    this._decimateCeiling = 4.0;
    this._slowFrameStreak = 0;

    const _this = this;
    AprilTagWasm().then(function (Module) {
      _this.onWasmInit(Module);
    });
  }

  onWasmInit(Module) {
    this._Module = Module;
    this._init = Module.cwrap('atagjs_init', 'number', []);
    this._destroy = Module.cwrap('atagjs_destroy', 'number', []);
    this._set_detector_options = Module.cwrap('atagjs_set_detector_options', 'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number']);
    this._set_pose_info = Module.cwrap('atagjs_set_pose_info', 'number', ['number', 'number', 'number', 'number']);
    this._set_img_buffer = Module.cwrap('atagjs_set_img_buffer', 'number', ['number', 'number', 'number']);
    this._atagjs_set_tag_size = Module.cwrap('atagjs_set_tag_size', null, ['number', 'number']);
    this._detect = Module.cwrap('atagjs_detect', 'number', []);

    this._init();
    this._applyOptions();
    this.onDetectorReadyCallback();
  }

  _applyOptions() {
    this._set_detector_options(
      this._opt.quad_decimate,
      this._opt.quad_sigma,
      this._opt.nthreads,
      this._opt.refine_edges,
      this._opt.max_detections,
      this._opt.return_pose,
      this._opt.return_solutions
    );
  }

  /**
   * Low-level detect: expects an already-grayscale (1 byte/pixel) image.
   * @param {Uint8Array} grayscaleImg
   * @param {Number} imgWidth
   * @param {Number} imgHeight
   */
  detect(grayscaleImg, imgWidth, imgHeight) {
    const imgBuffer = this._set_img_buffer(imgWidth, imgHeight, imgWidth);
    if (imgWidth * imgHeight < grayscaleImg.length) return { result: "Image data too large." };
    this._Module.HEAPU8.set(grayscaleImg, imgBuffer);

    const strJsonPtr = this._detect();
    const strJsonLen = this._Module.getValue(strJsonPtr, "i32");
    if (strJsonLen === 0) return [];

    const strJsonStrPtr = this._Module.getValue(strJsonPtr + 4, "i32");
    const strJsonView = new Uint8Array(this._Module.HEAP8.buffer, strJsonStrPtr, strJsonLen);
    let detectionsJson = '';
    for (let i = 0; i < strJsonLen; i++) {
      detectionsJson += String.fromCharCode(strJsonView[i]);
    }
    return JSON.parse(detectionsJson);
  }

  /**
   * **public** — main entry point used by the app.
   * Accepts a raw RGBA camera frame (Transferable ArrayBuffer, zero-copy),
   * converts it to grayscale HERE (off the main thread), then detects.
   * @param {ArrayBuffer} rgbaArrayBuffer raw RGBA pixel buffer
   * @param {Number} imgWidth
   * @param {Number} imgHeight
   * @return {Array} array of detections: {id, corners:[{x,y}x4], center:{x,y}}
   */
  detectFromRGBA(rgbaArrayBuffer, imgWidth, imgHeight) {
    const t0 = performance.now();

    const rgba = new Uint8ClampedArray(rgbaArrayBuffer);
    const total = imgWidth * imgHeight;
    const gray = new Uint8Array(total);
    for (let i = 0, j = 0; j < total; i += 4, j++) {
      gray[j] = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
    }

    const detections = this.detect(gray, imgWidth, imgHeight);
    this._autoTuneForSpeed(performance.now() - t0);
    return detections;
  }

  /**
   * If detection has been consistently slow (low-end device), raise
   * quad_decimate a step to recover frame rate. One-directional only.
   */
  _autoTuneForSpeed(elapsedMs) {
    const SLOW_MS = 150;      // a single detect() taking longer than this counts as "slow"
    const STREAK_TO_ACT = 5;  // require several consecutive slow frames before reacting
    if (elapsedMs > SLOW_MS) {
      this._slowFrameStreak++;
      if (this._slowFrameStreak >= STREAK_TO_ACT && this._opt.quad_decimate < this._decimateCeiling) {
        this._opt.quad_decimate = Math.min(this._opt.quad_decimate + 1.0, this._decimateCeiling);
        this._applyOptions();
        this._slowFrameStreak = 0;
      }
    } else {
      this._slowFrameStreak = 0;
    }
  }

  /**
   * **public** set size of a known tag (meters) — only relevant if pose is ever re-enabled.
   */
  set_tag_size(tagid, size) {
    this._atagjs_set_tag_size(tagid, size);
  }

  /**
   * **public** set maximum detections to return (0 = return all)
   */
  set_max_detections(maxDetections) {
    this._opt.max_detections = maxDetections;
    this._applyOptions();
  }
}

Comlink.expose(Apriltag);
