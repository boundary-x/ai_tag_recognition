/*
 * app.js
 * Mobile Optimized AprilTag Detection (Vanilla JS)
 * Features: Zero-dependency rendering, requestVideoFrameCallback, precise alignment
 */

// --- Bluetooth UUIDs ---
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

// --- State Variables ---
let bluetoothDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let isConnected = false;
let isSendingData = false; 

let lastSentTime = 0; 
const SEND_INTERVAL = 100;

let selectedObjects = []; 
let isObjectDetectionActive = false; 
let facingMode = "environment"; // 모바일 환경을 고려해 후면 카메라를 기본으로 설정
let isFlipped = false;    

// DOM Elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const dataDisplay = document.getElementById('dataDisplay');
const bluetoothStatusEl = document.getElementById('bluetoothStatus');
const selectedObjectsListDiv = document.getElementById('selected-objects-list');

// AprilTag Variables
let detector;
let grayBuffer;
let isModelLoaded = false;
let videoWidth = 0;
let videoHeight = 0;

// --- Initialization ---
async function init() {
  createUI();
  
  try {
    const AprilTag = await window.AprilTag;
    detector = new AprilTag.Detector('tag36h11'); // tag36h11 패밀리 지정
    isModelLoaded = true;
    document.getElementById('btnStart').innerText = "태그 인식 시작";
    console.log("AprilTag Model Loaded!");
  } catch (err) {
    console.error("Failed to load AprilTag:", err);
  }

  await setupCamera();
}

// --- Camera & Canvas Setup ---
async function setupCamera() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
  }

  const constraints = {
    video: { facingMode: facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    
    // 비디오 메타데이터가 로드되면 캔버스 내부 해상도를 비디오 원본 해상도와 일치시킴 (좌표 정렬 최적화)
    video.onloadedmetadata = () => {
      videoWidth = video.videoWidth;
      videoHeight = video.videoHeight;
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      
      // 거울 모드 CSS 처리
      isFlipped = (facingMode === "user");
      video.style.transform = isFlipped ? "scaleX(-1)" : "scaleX(1)";
      canvas.style.transform = isFlipped ? "scaleX(-1)" : "scaleX(1)";
      
      grayBuffer = new Uint8Array(videoWidth * videoHeight);
    };
  } catch (err) {
    console.error("Camera error:", err);
  }
}

function switchCamera() {
  facingMode = facingMode === "user" ? "environment" : "user";
  setupCamera();
}

// --- Detection Loop (Mobile Optimized) ---
function detectLoop() {
  if (!isObjectDetectionActive || !isModelLoaded || videoWidth === 0) return;

  // 비디오 프레임을 캔버스에 그리기 (픽셀 데이터 추출용)
  ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
  const imgData = ctx.getImageData(0, 0, videoWidth, videoHeight);
  const data = imgData.data;

  // Grayscale 변환 (RGB -> Luminance 단일 채널)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    grayBuffer[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }

  // AprilTag 디코딩
  const detections = detector.detect(grayBuffer, videoWidth, videoHeight);
  
  // 캔버스 초기화 후 바운딩 박스 렌더링
  ctx.clearRect(0, 0, videoWidth, videoHeight);

  let highestMarginTag = null;
  let detectedCount = 0; 

  // 선택된 태그 중 가장 마진(선명도)이 높은 대장 태그 찾기
  detections.forEach(tag => {
    if (selectedObjects.includes(tag.id.toString())) {
      detectedCount++;
      if (!highestMarginTag || tag.decision_margin > highestMarginTag.decision_margin) {
        highestMarginTag = tag;
      }
    }
  });

  // 태그 박스 그리기
  detections.forEach(tag => {
    if (!selectedObjects.includes(tag.id.toString())) return;

    const [p0, p1, p2, p3] = tag.corners;
    
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();

    if (tag === highestMarginTag) {
      // 대장 태그 - 파란색 표시
      ctx.strokeStyle = '#0064FF';
      ctx.lineWidth = 4;
      ctx.stroke();
      
      ctx.fillStyle = '#0064FF';
      ctx.fillRect(tag.center.x - 30, tag.center.y - 15, 60, 25);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`ID: ${tag.id}`, tag.center.x, tag.center.y - 2);
    } else {
      // 일반 태그 - 초록색 표시
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.fillStyle = '#00FF00';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`ID: ${tag.id}`, tag.center.x, tag.center.y);
    }
  });

  // 블루투스 데이터 전송 로직
  let currentTime = performance.now();
  if (currentTime - lastSentTime > SEND_INTERVAL) {
    if (highestMarginTag) {
      const corners = highestMarginTag.corners;
      let minX = Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
      let maxX = Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
      let minY = Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
      let maxY = Math.max(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
      
      let finalW = maxX - minX;
      let finalH = maxY - minY;
      let centerX = highestMarginTag.center.x;
      let centerY = highestMarginTag.center.y;

      // 전면 카메라(거울 모드)일 경우 마이크로비트로 전송하는 X 좌표 반전 보정
      let sendX = isFlipped ? (videoWidth - centerX) : centerX;

      sendBluetoothData(sendX, centerY, finalW, finalH, detectedCount);
      dataDisplay.innerHTML = `전송됨: x${Math.round(sendX)} y${Math.round(centerY)} w${Math.round(finalW)} h${Math.round(finalH)} d${detectedCount}`;
      dataDisplay.style.color = "#0f0";
    } else {
      sendBluetoothData(0, 0, 0, 0, 0);
      dataDisplay.innerHTML = `전송됨: 없음 (Stop)`;
      dataDisplay.style.color = "#888";
    }
    lastSentTime = currentTime;
  }

  // 모바일 발열/부하 제어 핵심: 새 프레임이 준비된 순간에만 루프 재호출
  if (isObjectDetectionActive) {
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(detectLoop);
    } else {
      requestAnimationFrame(detectLoop);
    }
  }
}

// --- UI Controls ---
function createUI() {
  // 1. 카메라 제어
  const btnCam = document.createElement('button');
  btnCam.innerText = "전후방 전환";
  btnCam.className = "start-button";
  btnCam.onclick = switchCamera;
  document.getElementById('camera-control-buttons').appendChild(btnCam);

  // 2. 블루투스 제어
  const btnConn = document.createElement('button');
  btnConn.innerText = "기기 연결";
  btnConn.className = "start-button";
  btnConn.onclick = connectBluetooth;
  
  const btnDisconn = document.createElement('button');
  btnDisconn.innerText = "연결 해제";
  btnDisconn.className = "stop-button";
  btnDisconn.onclick = disconnectBluetooth;
  
  const btnsBT = document.getElementById('bluetooth-control-buttons');
  btnsBT.appendChild(btnConn);
  btnsBT.appendChild(btnDisconn);

  // 3. AprilTag ID 선택 셀렉터 생성
  const selectObj = document.createElement('select');
  selectObj.innerHTML = `<option value="">추적할 Tag ID 선택</option>`;
  for(let i=0; i<=30; i++) {
    selectObj.innerHTML += `<option value="${i}">Tag ID: ${i}</option>`;
  }
  selectObj.onchange = (e) => {
    const val = e.target.value;
    if (val && !selectedObjects.includes(val)) {
      selectedObjects.push(val);
      renderSelectedObjects();
    }
    e.target.value = "";
  };
  document.getElementById('object-select-container').appendChild(selectObj);

  // 4. 인식 시작/중지
  const btnStart = document.createElement('button');
  btnStart.id = "btnStart";
  btnStart.innerText = "모델 로딩 중...";
  btnStart.className = "start-button";
  btnStart.onclick = () => {
    if (!isModelLoaded) return alert("로딩 중입니다.");
    if (!isConnected) return alert("블루투스 연결이 필요합니다.");
    if (selectedObjects.length === 0) return alert("태그 ID를 선택해주세요.");
    isObjectDetectionActive = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height); // 시작 시 잔상 제거
    
    // 루프 시작
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(detectLoop);
    } else {
      detectLoop();
    }
  };

  const btnStop = document.createElement('button');
  btnStop.innerText = "인식 중지";
  btnStop.className = "stop-button";
  btnStop.onclick = () => {
    isObjectDetectionActive = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    sendBluetoothData("stop", 0, 0, 0, 0);
  };

  const btnsCtrl = document.getElementById('object-control-buttons');
  btnsCtrl.appendChild(btnStart);
  btnsCtrl.appendChild(btnStop);
}

function renderSelectedObjects() {
  selectedObjectsListDiv.innerHTML = '';
  selectedObjects.forEach(obj => {
    const tag = document.createElement('div');
    tag.className = 'tag-item';
    tag.innerHTML = `ID ${obj} <span class="tag-remove" style="margin-left:8px; cursor:pointer; color:#FE818D;">&times;</span>`;
    tag.querySelector('.tag-remove').onclick = () => {
      selectedObjects = selectedObjects.filter(item => item !== obj);
      renderSelectedObjects();
    };
    selectedObjectsListDiv.appendChild(tag);
  });
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
    await txCharacteristic.startNotifications();
    isConnected = true;
    
    bluetoothStatusEl.innerText = `상태: 연결됨 (${bluetoothDevice.name})`;
    bluetoothStatusEl.className = "status-connected";
  } catch (error) {
    console.error(error);
    bluetoothStatusEl.innerText = "상태: 연결 실패";
    bluetoothStatusEl.className = "status-error";
  }
}

function disconnectBluetooth() {
  if (bluetoothDevice && bluetoothDevice.gatt.connected) {
    bluetoothDevice.gatt.disconnect();
  }
  isConnected = false;
  rxCharacteristic = null;
  txCharacteristic = null;
  bluetoothDevice = null;
  bluetoothStatusEl.innerText = "상태: 연결 해제됨";
  bluetoothStatusEl.className = "";
}

async function sendBluetoothData(x, y, width, height, detectedCount) {
  if (!rxCharacteristic || !isConnected || isSendingData) return;
  try {
    isSendingData = true; 
    let str = "";
    if (x === "stop" || detectedCount === 0) {
      str = "stop\n";
    } else {
      str = `x${Math.round(x)}y${Math.round(y)}w${Math.round(width)}h${Math.round(height)}d${detectedCount}\n`;
    }
    const encoder = new TextEncoder();
    await rxCharacteristic.writeValue(encoder.encode(str));
  } catch (error) { 
    console.error(error); 
  } finally { 
    isSendingData = false; 
  }
}

// 초기화 시작
window.addEventListener('DOMContentLoaded', init);
