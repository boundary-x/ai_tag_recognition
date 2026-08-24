# 🏷️ Boundary X - AI AprilTag Recognition (WASM)

**Boundary X - AI AprilTag Recognition** is a web application that detects
**AprilTag (tag36h11)** fiducial markers in real time, running entirely in
the browser via a **WebAssembly (WASM)** port of the official AprilTag C
library. It is a frontend-only static site — no backend, no build step —
designed to be deployed directly on **GitHub Pages**.

Designed for educational and prototyping environments, this app lets users
choose to track all detected tags or a specific set of tag IDs, and
transmits the coordinate data of the **primary target** (the largest tag
in view) to external hardware (BBC micro:bit) via **Bluetooth (BLE)**.

![Project Status](https://img.shields.io/badge/Status-Active-success)
![Platform](https://img.shields.io/badge/Platform-Web-blue)
![Tech](https://img.shields.io/badge/Stack-p5.js%20%7C%20AprilTag%20WASM-orange)

## ✨ Key Features

### 1. ⚡ AprilTag WASM Detection
- **tag36h11 family:** Uses the official AprilTag C library (University of
  Michigan APRIL Robotics Lab), compiled to WebAssembly, running inside a
  dedicated Web Worker.
- **ID-based tracking:** Users can track every detected tag, or restrict
  tracking to a specific set of tag IDs (0–586).
- **Largest-tag targeting:** AprilTag detections don't carry a confidence
  score like a neural-network detector does, so the tag with the **largest
  bounding box on screen** (i.e. the closest one) is chosen as the primary
  target (Blue Box) to prevent data conflict.

### 2. 📱 Built for Mobile & Tablet (no frame drops)
- **Worker-based detection:** All WASM inference runs off the main thread.
  Camera capture and canvas rendering never wait on tag detection.
- **Decoupled detection resolution:** Detection runs on a small, separate
  offscreen canvas — independent from the on-screen 400×300 display canvas —
  so raising visual quality never slows down detection and vice versa.
- **Self-throttling detection loop:** The next detection is only scheduled
  after the previous one finishes (no `requestAnimationFrame`-driven queue
  buildup on slow devices).
- **Zero-copy frame transfer:** Camera frames are handed to the worker as
  Transferable `ArrayBuffer`s instead of being structure-cloned.
- **Adaptive quality:** If a device is consistently slow, the detector
  automatically raises `quad_decimate` to trade maximum detection distance
  for frame rate — no manual tuning required per device.
- **Pose estimation disabled:** This protocol only needs 2D center/box data,
  so 3D pose solving (the most expensive part of the detector) is turned off.

### 3. 📡 Bluetooth Low Energy (BLE) Control
- **Wireless Communication:** Connects directly to **BBC Micro:bit** (or
  compatible BLE devices) using the **Nordic UART Service**.
- **Data Throttling:** optimized data transmission (100ms interval) to
  ensure stable hardware control without buffer overflow.

### 4. 📱 Responsive & Sticky UI
- **Sticky Canvas:** The camera view remains **fixed (sticky)** at the top
  or side of the screen even when scrolling through controls on mobile.
- **Cross-Platform:** Fully responsive layout (PC, Tablet, Mobile) with the
  `Pretendard` font system.
- **Auto-Mirroring:** Smart camera handling that automatically flips the
  feed when using the front camera.

### 5. 🎨 Visual Feedback
- **Blue Box:** The Primary Target (the tag whose data is being sent).
- **Green Box:** Other detected/tracked tags (visual only).
- **Real-time Status:** Displays the exact string data being sent to the
  hardware.

---

## 📡 Communication Protocol

*(Unchanged from the previous object-detection version — no micro:bit /
MakeCode extension changes required.)*

When the system detects the tracked tag(s), it identifies the one with the
**largest bounding box** and sends a formatted string via Bluetooth.

**Data Format:**
```text
x{X_Center}y{Y_Center}w{Width}h{Height}d{Count}\n
```

**Details:**
- **x:** Center X coordinate of the target (0 ~ 400). Adjusted for mirroring.
- **y:** Center Y coordinate of the target (0 ~ 300).
- **w:** Width of the tag's bounding box.
- **h:** Height of the tag's bounding box.
- **d:** Total number of tracked tags currently detected (after ID/size filtering).
- **\n:** End of Line character

**Examples:**
> **Target at (200, 150), size 100x100, 1 tag detected:**
> `x200y150w100h100d1`

> **No tag detected, wrong ID, too small, or Stop button pressed:**
> `stop`

---

## 🚀 Performance Design (Mobile/Tablet Frame-Drop Prevention)

The AprilTag WASM detector is **CPU-bound and single-threaded** (unlike the
previous MediaPipe version, which used the GPU via WebGL). Left naive, this
can cause visible frame drops on low/mid-range classroom tablets. This app
addresses that with several layered techniques — see the top of `sketch.js`
and `libs/apriltag_worker.js` for the implementation:

| Technique | File | Why |
|---|---|---|
| Detection in a Web Worker | `libs/apriltag_worker.js` | Keeps the WASM inference off the main thread entirely |
| Small, separate detection canvas (320×240) | `sketch.js` | Decouples detection cost from on-screen rendering quality |
| Reduced `getUserMedia` resolution request | `sketch.js` | Less work for the camera pipeline itself on weak devices |
| Self-throttling detect loop (no RAF queueing) | `sketch.js` | Prevents backlog buildup on slow devices |
| Transferable `ArrayBuffer` (zero-copy) | `sketch.js` / `apriltag_worker.js` | Avoids structured-clone copy cost per frame |
| `return_pose: 0`, `refine_edges: 0` | `apriltag_worker.js` | Skips computation the protocol doesn't need |
| Adaptive `quad_decimate` | `apriltag_worker.js` | Automatically trades range for speed on slow devices |

If you still see frame drops on a specific device after deployment, the
first things to try are lowering `DETECT_WIDTH`/`DETECT_HEIGHT` in
`sketch.js`, or lowering the `SLOW_MS` threshold in
`_autoTuneForSpeed()` inside `apriltag_worker.js` so it reacts sooner.

---

## 🏷️ Generating AprilTags

This app expects tags from the **tag36h11** family. Pre-generated tag
images (ready to print) are available from the apriltag-gen project:
https://github.com/arenaxr/apriltag-gen/tree/master/output

---

## 🌐 Deployment (GitHub Pages)

This is a static frontend project — plain HTML/CSS/JS, no build step, no
server-side code. To deploy:

1. Push this folder's contents to a GitHub repository.
2. In the repo settings, enable **GitHub Pages** for the branch/folder you pushed to.
3. Camera access and Web Bluetooth both require a secure context — GitHub
   Pages serves over HTTPS by default, so no extra configuration is needed.
4. Web Bluetooth is currently only supported on Chromium-based browsers
   (Chrome, Edge, Samsung Internet, etc.) — not Safari/iOS. This is a
   browser platform limitation, unchanged from the previous version.

**Tech Stack:**
- **Frontend:** HTML5, CSS3
- **Creative Coding:** p5.js (Canvas, Video handling)
- **AI Engine:** AprilTag WASM (tag36h11), run in a Web Worker via Comlink
- **Hardware I/O:** Web Bluetooth API (BLE)

---

## 📄 License & Attribution

- Copyright © 2024 Boundary X Co. All rights reserved (app code).
- This project bundles pre-built artifacts from third-party open-source
  projects under `libs/` — see `libs/THIRD_PARTY_LICENSES.md` for full
  attribution (AprilTag / apriltag-js-standalone / Comlink).
- Web: boundaryx.io
- Contact: https://boundaryx.io/contact
