# Third-Party Licenses (libs/)

This folder bundles pre-built, redistributable artifacts from the
following open-source projects so the app can run as a static
frontend (GitHub Pages) with no build step.

## apriltag_wasm.js / apriltag_wasm.wasm

- Project: apriltag-js-standalone
- Source: https://github.com/arenaxr/apriltag-js-standalone
- Copyright (c) 2020, The CONIX Research Center
- License: BSD 3-Clause
- These are the project's own pre-built WASM artifacts (`html/apriltag_wasm.js`,
  `html/apriltag_wasm.wasm`), copied unmodified.

Underlying detector algorithm:

- Project: AprilRobotics/apriltag
- Copyright: APRIL Robotics Laboratory, University of Michigan
- License: BSD 2-Clause

## comlink.min.js

- Project: Comlink
- Source: https://github.com/GoogleChromeLabs/comlink
- Copyright: Google LLC
- License: Apache License 2.0
- Bundled here (self-hosted) instead of loaded from a CDN, so the app
  has no runtime dependency on an external CDN being reachable.

## apriltag_worker.js

Written for this project, adapted from apriltag-js-standalone's
`html/apriltag.js` (same BSD-3-Clause project above), with
modifications for Web Worker performance (RGBA→grayscale conversion
moved into the worker, pose estimation disabled, adaptive
quad_decimate). See file header for details.
