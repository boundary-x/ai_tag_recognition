# 🏷️ Boundary X - AI Tag Recognition

**Boundary X - AI Tag Recognition** detects AprilTag markers in the browser and transmits their IDs or position and size to a **BBC Micro:bit** through **Web Bluetooth (BLE)**.

Powered by **AprilTag WebAssembly**, camera images are processed locally in a Web Worker. No training is required.

![Project Status](https://img.shields.io/badge/Status-Active-success)
![Platform](https://img.shields.io/badge/Platform-Web-blue)
![Tech](https://img.shields.io/badge/Stack-AprilTag%20%7C%20WebAssembly%20%7C%20BLE-00E676)

**[Open the Web App](https://boundary-x.github.io/ai_tag_recognition/)**

---

## ✨ Key Features

### 1. 🏷️ Tag Classification

- **Central Region:** Yellow 300 × 300 frame and crosshair in a 400 × 300 coordinate space.
- **Target Selection:** Selects the tag closest to the crosshair among tags whose centers are inside the frame.
- **ID Output:** Sends ID12 for tag 12, or none when no eligible tag is detected.

### 2. 🔍 Tag Recognition

- **Selected-ID Detection:** Tracks one ID across the entire camera frame.
- **Position & Size:** Sends center coordinates, bounding-box dimensions and matching count.
- **Transmission Target:** Selects the largest matching bounding box, highlighted with a thick blue outline. Other matches have thin green outlines.
- **Minimum Size:** Allows small detections to be excluded.

Only **tag36h11** markers with IDs **0–586** are supported. The current WASM wrapper does not expose confidence or decision-margin scores; recognition uses largest-box selection, not confidence ranking.

### 3. 🔗 Wireless Connectivity (BLE)

- Direct micro:bit Nordic UART connection.
- Serialized writes and prioritized no-detection messages when stopping.
- Transmission status updated after browser write completion.
- Previous recognition results cleared when changing modes or IDs.

### 4. 📱 Responsive UI & Support

- Automatic camera start, front/rear switching and horizontal mirroring.
- Matching 4:3 center crops for preview and detection, including portrait camera streams.
- Sticky preview for desktop, tablet and phone layouts.
- Nine-step highlighted walkthrough, troubleshooting cards and update notes.
- Bluetooth name-check example included; project examples and lesson materials are marked as pending.

---

## 🚀 How to Use

1. Open the app and allow camera access.
2. Prepare a printed tag36h11 marker, keeping the entire marker and surrounding margin visible.
3. Choose **Tag Classification** or **Tag Recognition**.
4. For classification, align the intended tag with the crosshair. For recognition, enter a single ID from 0 to 586.
5. Press **Start Recognition** and check the blue target outline.
6. Connect a micro:bit running a compatible Bluetooth UART receiver.
7. Remove the tag to check the no-detection message and receiver behavior.

Recognition works without a micro:bit. Changing the mode or ID, or switching cameras, stops recognition: press Start again. The guide explains controls without changing them; active recognition continues during the walkthrough.

---

## 📡 Communication Protocol

Each ASCII message ends with an actual newline, represented below as \n.

| Mode | Detection example | No detection / stopped |
| --- | --- | --- |
| Classification | ID12\n | none\n |
| Recognition | I012X200Y150W080H060D02\n | stop\n |

| Field | Description |
| --- | --- |
| ID / I | Classification marker ID / three-digit recognition ID, 0–586 |
| X, Y | Target center in displayed orientation, using 400 × 300 coordinates |
| W, H | Axis-aligned bounding-box dimensions in the same coordinate space |
| D | Number of eligible detections matching the selected ID |

The detector returns at most eight detections **before** ID and size filtering. Recognition-mode packets include the selected ID in the I field. I, X, Y, W and H each contain exactly three digits; D contains two digits. Values are rounded, zero-padded and clamped to 000–999 (D: 00–99).

Messages are scheduled approximately every 100 ms; actual throughput depends on Bluetooth. “Sent” means the browser write completed, not that the device acknowledged or acted on it. Mode changes clear pending results and request the new mode's no-detection message; an in-flight write cannot be recalled.

**Fixed positions (zero-based):** I value at 1–3, X at 5–7, Y at 9–11, W at 13–15, H at 17–19, D at 21–22. A detection packet is 23 ASCII characters plus one newline (24 bytes).

Writes are split into chunks of at most 20 bytes, serialized without interleaving messages. The receiver must accumulate chunks until the newline before parsing. Classification messages and the none/stop signals retain their existing format. Existing receivers expecting lowercase variable-width fields must be updated.

**Nordic UART UUIDs:**

- Service: 6e400001-b5a3-f393-e0a9-e50e24dcca9e
- Write characteristic: 6e400003-b5a3-f393-e0a9-e50e24dcca9e

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript, Canvas API
- **Detection:** AprilTag tag36h11 and bundled WebAssembly
- **Processing:** Web Worker, Comlink and transferable image buffers
- **Connectivity:** Web Bluetooth API

Detection uses 320 × 240 frames processed sequentially. Sustained slow processing increases detector decimation, which may reduce small-tag detection. Results older than 750 ms are treated as unavailable.

Automated checks cover mode behavior, ROI filtering, coordinate conversion, packet formatting, simulated Bluetooth writes and responsive layouts. Galaxy A54 performance and physical Bluetooth delivery still require real-device testing.

---

## 🌐 Requirements

- Camera access requires **HTTPS or localhost** and camera permission.
- Bluetooth requires a **Web Bluetooth-compatible browser** and compatible micro:bit receiver code.
- On iPhone, use a Bluetooth-capable browser such as Bluefy for BLE and verify on the actual device.
- **Node.js is not required to use the hosted web app.**
- For local development, serve this directory with a static HTTP server, for example python -m http.server 8000. Opening index.html directly as a file is not supported.

---

## 📝 License

- Copyright © 2024 Boundary X Co. All rights reserved.
- Boundary X application code and design retain their existing ownership.
- Third-party components retain their respective licenses. See [Third-Party Licenses](libs/THIRD_PARTY_LICENSES.md).
- Web: [boundaryx.io](https://boundaryx.io)
- Contact: [Contact Boundary X](https://boundaryx.io/contact)
