/*
 * sketch.js
 * Boundary X AprilTag Detection (Powered by AprilTag WASM, tag36h11)
 * Features: Auto-Mirroring, Safety Stop, Worker-based detection
 */

// --- Bluetooth UUIDs (Microbit UART) ---
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

// --- Variables ---
let bluetoothDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let isConnected = false;
let bluetoothStatus = "연결 대기 중";
let isSendingData = false;

let lastSentTime = 0;
const SEND_INTERVAL = 100; // 데이터 전송 간격 (ms) — micro:bit BLE 전송 주기

// Video & Camera
let video;
let facingMode = "user";
let isFlipped = true;
let isVideoReady = false;
let wasDetectingBeforeSwitch = false;

// --- AprilTag (Worker) ---
let apriltagWorker = null;      // Comlink proxy to the detector living in the worker
let isDetectorReady = false;
let isTagDetectionActive = false;
let isDetectLoopRunning = false;
let latestDetections = [];      // raw detections from the worker, in DETECT_* coordinates

// 인식용 저해상도 캔버스 (화면 표시용 캔버스와 분리 — 이게 모바일 프레임 드롭 방지의 핵심)
const DETECT_WIDTH = 320;
const DETECT_HEIGHT = 240;
let detectCanvas, detectCtx;

// 인식 결과 필터링 (AprilTag는 confidence 값이 없으므로, "화면에서 가장 크게 잡힌 태그"를
// 대장(Target)으로 삼고, 최소 크기 필터로 너무 작아 신뢰하기 어려운 오검출을 걸러냅니다.)
let trackAllTags = true;
let selectedTagIds = [];
let minTagSize = 30; // px, 화면 표시 좌표 기준

// UI Elements
let switchCameraButton, connectBluetoothButton, disconnectBluetoothButton;
let startDetectionButton, stopDetectionButton;
let allTagsButton, specificTagsButton;
let tagIdInput, addTagIdButton, selectedTagsListDiv;
let minSizeSlider, minSizeLabel;
let dataDisplay;

// --- AprilTag Worker Initialization ---
async function initAprilTag() {
  const worker = new Worker('libs/apriltag_worker.js');
  const ApriltagRemote = Comlink.wrap(worker);

  apriltagWorker = await new ApriltagRemote(Comlink.proxy(() => {
    isDetectorReady = true;
    console.log("AprilTag WASM detector ready.");
    if (startDetectionButton) startDetectionButton.html("AprilTag 인식 시작");
  }));
}

// --- p5.js Main Functions ---

function setup() {
  let canvas = createCanvas(400, 300);
  canvas.parent('p5-container');
  canvas.style('border-radius', '16px');

  setupDetectCanvas();
  setupCamera();
  createUI();
  initAprilTag();
}

function setupDetectCanvas() {
  detectCanvas = document.createElement('canvas');
  detectCanvas.width = DETECT_WIDTH;
  detectCanvas.height = DETECT_HEIGHT;
  // willReadFrequently: getImageData를 반복 호출할 것임을 브라우저에 미리 알려
  // 내부적으로 더 빠른 경로(소프트웨어 백버퍼)를 쓰도록 유도합니다.
  detectCtx = detectCanvas.getContext('2d', { willReadFrequently: true });
}

function draw() {
  background(0);

  if (!isVideoReady || !video || video.width === 0) {
    fill(255); textAlign(CENTER, CENTER); textSize(16);
    text("카메라 로딩 중...", width / 2, height / 2);
    return;
  }

  // 화면 그리기 (반전 여부에 따라 처리)
  push();
  if (isFlipped) { translate(width, 0); scale(-1, 1); }
  image(video, 0, 0, width, height);
  pop();

  const scaleX = width / DETECT_WIDTH;
  const scaleY = height / DETECT_HEIGHT;

  // 1. 인식 좌표 → 화면 좌표 변환 + ID/크기 필터링
  let visibleTags = [];
  if (isTagDetectionActive && latestDetections.length > 0) {
    latestDetections.forEach((det) => {
      const idMatches = trackAllTags || selectedTagIds.includes(det.id);
      if (!idMatches) return;

      const disp = toDisplayCoords(det, scaleX, scaleY);
      if (Math.max(disp.boxW, disp.boxH) < minTagSize) return; // 너무 작은(신뢰도 낮은) 검출 제외

      visibleTags.push(disp);
    });
  }

  // 2. 대장(Target) 찾기 — 화면에서 가장 크게(가깝게) 잡힌 태그
  let primaryTag = null;
  visibleTags.forEach((tag) => {
    if (!primaryTag || (tag.boxW * tag.boxH) > (primaryTag.boxW * primaryTag.boxH)) {
      primaryTag = tag;
    }
  });

  // 3. 박스 그리기 (파란색 or 초록색)
  visibleTags.forEach((tag) => {
    const isPrimary = (tag === primaryTag);
    drawTagBox(tag, isPrimary);
  });

  // 4. 데이터 전송 (대장 좌표 기준 or Stop 신호)
  if (isTagDetectionActive) {
    const currentTime = millis();
    if (currentTime - lastSentTime > SEND_INTERVAL) {
      if (primaryTag) {
        sendBluetoothData(primaryTag.center.x, primaryTag.center.y, primaryTag.boxW, primaryTag.boxH, visibleTags.length);
        const dataStr = `x${Math.round(primaryTag.center.x)} y${Math.round(primaryTag.center.y)} w${Math.round(primaryTag.boxW)} h${Math.round(primaryTag.boxH)} d${visibleTags.length}`;
        dataDisplay.html(`전송됨: ${dataStr}`);
        dataDisplay.style("color", "#0f0");
      } else {
        sendBluetoothData(0, 0, 0, 0, 0);
        dataDisplay.html(`전송됨: 없음 (Stop)`);
        dataDisplay.style("color", "#888");
      }
      lastSentTime = currentTime;
    }
  }
}

/** 인식 좌표(DETECT_WIDTH x DETECT_HEIGHT) → 화면 좌표(width x height) 변환 + 미러링 보정 */
function toDisplayCoords(det, scaleX, scaleY) {
  const corners = det.corners.map((c) => {
    let x = c.x * scaleX;
    let y = c.y * scaleY;
    if (isFlipped) x = width - x;
    return { x, y };
  });

  let cx = det.center.x * scaleX;
  let cy = det.center.y * scaleY;
  if (isFlipped) cx = width - cx;

  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  return {
    id: det.id,
    corners,
    center: { x: cx, y: cy },
    boxW: maxX - minX,
    boxH: maxY - minY
  };
}

function drawTagBox(tag, isPrimary) {
  const c = tag.corners;
  if (isPrimary) {
    stroke(0, 100, 255); strokeWeight(4); noFill();
  } else {
    stroke(0, 255, 0); strokeWeight(2); noFill();
  }
  beginShape();
  c.forEach(p => vertex(p.x, p.y));
  endShape(CLOSE);

  const labelY = tag.center.y - (tag.boxH / 2);
  const labelText = `ID:${tag.id}`;
  noStroke();
  fill(isPrimary ? color(0, 100, 255) : color(0, 255, 0));
  textSize(isPrimary ? 16 : 14);
  textStyle(isPrimary ? BOLD : NORMAL);
  const boxX = tag.center.x - (tag.boxW / 2);
  rect(boxX, labelY > 20 ? labelY - 22 : labelY, textWidth(labelText) + 16, 22);
  fill(255);
  text(labelText, boxX + 8, labelY > 20 ? labelY - 6 : labelY + 16);
}

// --- 인식 루프 (Worker, 화면 렌더링과 완전히 분리) ---
async function detectLoop() {
  if (!isTagDetectionActive || !isVideoReady || !video || !apriltagWorker) {
    isDetectLoopRunning = false;
    return;
  }
  isDetectLoopRunning = true;

  try {
    detectCtx.drawImage(video.elt, 0, 0, DETECT_WIDTH, DETECT_HEIGHT);
    const imageData = detectCtx.getImageData(0, 0, DETECT_WIDTH, DETECT_HEIGHT);
    const buf = imageData.data.buffer;
    // Transfer(복사 없이 소유권 이전)로 넘겨서 메인 스레드 부담을 최소화합니다.
    const dets = await apriltagWorker.detectFromRGBA(Comlink.transfer(buf, [buf]), DETECT_WIDTH, DETECT_HEIGHT);
    latestDetections = Array.isArray(dets) ? dets : [];
  } catch (err) {
    console.error("AprilTag detect error:", err);
  }

  // 다음 인식은 "이전 인식이 끝난 뒤"에만 예약됩니다 (자기-조절 스로틀).
  // 느린 기기에서는 자연스럽게 주기가 늘어날 뿐, 큐가 쌓이지 않습니다.
  if (isTagDetectionActive) {
    setTimeout(detectLoop, 0);
  } else {
    isDetectLoopRunning = false;
  }
}

// --- Helper Functions ---

function setupCamera() {
  isVideoReady = false;
  // 모바일 카메라 파이프라인 부담을 줄이기 위해 처음부터 적당한 해상도만 요청합니다.
  // (기본값으로 두면 일부 기기에서 1280x720 이상을 요청해 캡처 자체가 무거워집니다.)
  let constraints = {
    video: {
      facingMode: facingMode,
      width: { ideal: 480 },
      height: { ideal: 360 }
    },
    audio: false
  };

  video = createCapture(constraints);
  video.hide();

  let videoLoadCheck = setInterval(() => {
    if (video.elt.readyState >= 2 && video.elt.videoWidth > 0) {
      isVideoReady = true;
      clearInterval(videoLoadCheck);
      console.log(`Camera Loaded: ${facingMode}`);
      if (wasDetectingBeforeSwitch) {
        startTagDetection();
        wasDetectingBeforeSwitch = false;
      }
    }
  }, 100);
}

function stopVideo() {
  if (video) {
    if (video.elt.srcObject) {
      const tracks = video.elt.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }
    video.remove();
    video = null;
  }
}

function createUI() {
  dataDisplay = select('#dataDisplay');
  dataDisplay.html("전송 대기 중...");

  // Buttons
  switchCameraButton = createButton("전후방 전환");
  switchCameraButton.parent('camera-control-buttons');
  switchCameraButton.addClass('start-button');
  switchCameraButton.mousePressed(switchCamera);

  connectBluetoothButton = createButton("기기 연결");
  connectBluetoothButton.parent('bluetooth-control-buttons');
  connectBluetoothButton.addClass('start-button');
  connectBluetoothButton.mousePressed(connectBluetooth);

  disconnectBluetoothButton = createButton("연결 해제");
  disconnectBluetoothButton.parent('bluetooth-control-buttons');
  disconnectBluetoothButton.addClass('stop-button');
  disconnectBluetoothButton.mousePressed(disconnectBluetooth);

  // Tag ID 모드 토글 (전체 인식 / 특정 ID만 인식)
  allTagsButton = createButton("전체 태그 인식");
  allTagsButton.parent('tag-mode-buttons');
  allTagsButton.addClass('toggle-button');
  allTagsButton.mousePressed(() => setTagMode(true));

  specificTagsButton = createButton("특정 ID만 인식");
  specificTagsButton.parent('tag-mode-buttons');
  specificTagsButton.addClass('toggle-button');
  specificTagsButton.mousePressed(() => setTagMode(false));

  // Tag ID 입력 (특정 ID 모드일 때만 사용)
  tagIdInput = createInput('', 'number');
  tagIdInput.attribute('placeholder', 'ID (0~586)');
  tagIdInput.attribute('min', '0');
  tagIdInput.attribute('max', '586');
  tagIdInput.parent('tag-id-input-container');

  addTagIdButton = createButton("추가");
  addTagIdButton.parent('tag-id-input-container');
  addTagIdButton.addClass('start-button');
  addTagIdButton.mousePressed(() => {
    const val = parseInt(tagIdInput.value(), 10);
    if (!isNaN(val) && val >= 0 && val <= 586 && !selectedTagIds.includes(val)) {
      selectedTagIds.push(val);
      renderSelectedTagIds();
    }
    tagIdInput.value('');
  });

  selectedTagsListDiv = select('#selected-tags-list');

  setTagMode(true); // 기본값: 전체 태그 인식

  // 최소 인식 크기 슬라이더 (AprilTag는 confidence 값이 없어, 크기로 신뢰도 낮은 오검출을 거릅니다)
  minSizeSlider = createSlider(0, 150, minTagSize);
  minSizeSlider.parent('min-size-container');
  updateSliderFill(minSizeSlider);

  minSizeSlider.input(() => {
    minTagSize = minSizeSlider.value();
    if (minSizeLabel) minSizeLabel.html(`최소 인식 크기: ${minTagSize}px`);
    updateSliderFill(minSizeSlider);
  });

  minSizeLabel = createDiv(`최소 인식 크기: ${minTagSize}px`);
  minSizeLabel.parent('min-size-container');
  minSizeLabel.style('font-size', '1.2rem');
  minSizeLabel.style('font-weight', '700');
  minSizeLabel.style('color', '#000000');
  minSizeLabel.style('margin-top', '10px');

  // Start/Stop Buttons
  startDetectionButton = createButton("감지기 로딩 중...");
  startDetectionButton.parent('object-control-buttons');
  startDetectionButton.addClass('start-button');
  startDetectionButton.mousePressed(() => {
    if (!isDetectorReady) { alert("AprilTag 감지기 로딩 중입니다."); return; }
    if (!isConnected) { alert("블루투스가 연결되지 않았습니다!"); return; }
    if (!trackAllTags && selectedTagIds.length === 0) { alert("인식할 태그 ID를 추가해주세요."); return; }
    startTagDetection();
  });

  stopDetectionButton = createButton("인식 중지");
  stopDetectionButton.parent('object-control-buttons');
  stopDetectionButton.addClass('stop-button');
  stopDetectionButton.mousePressed(() => {
    stopTagDetection();
    sendBluetoothData("stop");
  });

  updateBluetoothStatusUI();
}

function setTagMode(all) {
  trackAllTags = all;
  allTagsButton.removeClass('active');
  specificTagsButton.removeClass('active');
  if (all) {
    allTagsButton.addClass('active');
    select('#tag-id-input-container').style('display', 'none');
    select('#selected-tags-list').style('display', 'none');
  } else {
    specificTagsButton.addClass('active');
    select('#tag-id-input-container').style('display', 'flex');
    select('#selected-tags-list').style('display', 'flex');
  }
}

function updateSliderFill(slider) {
  const val = (slider.value() - slider.elt.min) / (slider.elt.max - slider.elt.min) * 100;
  slider.elt.style.background = `linear-gradient(to right, #000000 ${val}%, #D1D5DB ${val}%)`;
}

function removeSelectedTagId(id) {
  selectedTagIds = selectedTagIds.filter(item => item !== id);
  renderSelectedTagIds();
}

function renderSelectedTagIds() {
  selectedTagsListDiv.html('');
  selectedTagIds.forEach(id => {
    const tag = createDiv();
    tag.addClass('tag-item');
    tag.html(`ID ${id} <span class="tag-remove">&times;</span>`);
    tag.parent(selectedTagsListDiv);
    tag.mouseClicked(() => removeSelectedTagId(id));
  });
}

function switchCamera() {
  wasDetectingBeforeSwitch = isTagDetectionActive;
  isTagDetectionActive = false;
  stopVideo();
  isVideoReady = false;

  facingMode = facingMode === "user" ? "environment" : "user";
  isFlipped = (facingMode === "user");

  setTimeout(setupCamera, 500);
}

function startTagDetection() {
  if (!isVideoReady) { console.warn("카메라 준비 안됨"); return; }
  isTagDetectionActive = true;
  if (!isDetectLoopRunning) detectLoop();
}

function stopTagDetection() {
  isTagDetectionActive = false;
  latestDetections = [];
}

// --- Bluetooth Logic ---

async function connectBluetooth() {
  try {
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "BBC micro:bit" }],
      optionalServices: [UART_SERVICE_UUID]
    });
    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService(UART_SERVICE_UUID);
    rxCharacteristic = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
    txCharacteristic = await service.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
    txCharacteristic.startNotifications();
    isConnected = true;
    bluetoothStatus = "연결됨: " + bluetoothDevice.name;
    updateBluetoothStatusUI(true);
  } catch (error) {
    console.error(error);
    bluetoothStatus = "연결 실패";
    updateBluetoothStatusUI(false, true);
  }
}

function disconnectBluetooth() {
  if (bluetoothDevice && bluetoothDevice.gatt.connected) {
    bluetoothDevice.gatt.disconnect();
  }
  isConnected = false;
  bluetoothStatus = "연결 해제됨";
  rxCharacteristic = null;
  txCharacteristic = null;
  bluetoothDevice = null;
  updateBluetoothStatusUI(false);
}

function updateBluetoothStatusUI(connected = false, error = false) {
  const statusElement = select('#bluetoothStatus');
  if (statusElement) {
    statusElement.html(`상태: ${bluetoothStatus}`);
    statusElement.removeClass('status-connected');
    statusElement.removeClass('status-error');
    if (connected) statusElement.addClass('status-connected');
    else if (error) statusElement.addClass('status-error');
  }
}

async function sendBluetoothData(x, y, width_, height_, detectedCount) {
  if (!rxCharacteristic || !isConnected) return;
  if (isSendingData) return;

  try {
    isSendingData = true;

    if (x === "stop" || detectedCount === 0) {
      const encoder = new TextEncoder();
      await rxCharacteristic.writeValue(encoder.encode("stop\n"));
      return;
    }

    if (detectedCount > 0) {
      const data = `x${Math.round(x)}y${Math.round(y)}w${Math.round(width_)}h${Math.round(height_)}d${detectedCount}\n`;
      const encoder = new TextEncoder();
      await rxCharacteristic.writeValue(encoder.encode(data));
    }

  } catch (error) { console.error(error); }
  finally { isSendingData = false; }
}

// Global Scope Export (for HTML)
window.setup = setup;
window.draw = draw;
