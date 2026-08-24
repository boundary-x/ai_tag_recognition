/*
 * app.js
 * Mobile Optimized ArUco Marker Detection (Pure JS)
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
let facingMode = "environment"; 
let isFlipped = false;    

// DOM Elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const dataDisplay = document.getElementById('dataDisplay');
const bluetoothStatusEl = document.getElementById('bluetoothStatus');
const selectedObjectsListDiv = document.getElementById('selected-objects-list');

// ArUco Variables
let detector;
let videoWidth = 0;
let videoHeight = 0;

// --- Initialization ---
async function init() {
  createUI();
  
  // ArUco Detector 초기화 (로딩 지연 없음)
  if (typeof AR !== "undefined") {
    detector = new AR.Detector();
    console.log("ArUco Detector Load Complete!");
  } else {
    alert("ArUco 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.");
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
    
    video.onloadedmetadata = () => {
      videoWidth = video.videoWidth;
      videoHeight = video.videoHeight;
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      
      isFlipped = (facingMode === "user");
      video.style.transform = isFlipped ? "scaleX(-1)" : "scaleX(1)";
      canvas.style.transform = isFlipped ? "scaleX(-1)" : "scaleX(1)";
    };
  } catch (err) {
    console.error("Camera error:", err);
  }
}

function switchCamera() {
  facingMode = facingMode === "user" ? "environment" : "user";
  setupCamera();
}

// --- Detection Loop ---
function detectLoop() {
  if (!isObjectDetectionActive || !detector || videoWidth === 0) return;

  // 비디오 프레임 추출
  ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
  const imgData = ctx.getImageData(0, 0, videoWidth, videoHeight);
  
  // 캔버스 초기화
  ctx.clearRect(0, 0, videoWidth, videoHeight);

  // ArUco 마커 탐지
  const markers = detector.detect(imgData);

  let largestMarker = null;
  let maxArea = 0;
  let detectedCount = 0; 

  // 인식된 마커 중 타겟 찾기
  markers.forEach(marker => {
    if (selectedObjects.includes(marker.id.toString())) {
      detectedCount++;
      
      const corners = marker.corners;
      const minX = Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
      const maxX = Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
      const minY = Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
      const maxY = Math.max(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
      
      const area = (maxX - minX) * (maxY - minY);
      if (!largestMarker || area > maxArea) {
        largestMarker = marker;
        maxArea = area;
      }
    }
  });

  // 박스 렌더링
  markers.forEach(marker => {
    if (!selectedObjects.includes(marker.id.toString())) return;

    const corners = marker.corners;
    
    // 중심점 계산
    let cx = 0, cy = 0;
    corners.forEach(p => { cx += p.x; cy += p.y; });
    cx /= 4; cy /= 4;

    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();

    if (marker === largestMarker) {
      ctx.strokeStyle = '#0064FF';
      ctx.lineWidth = 4;
      ctx.stroke();
      
      ctx.fillStyle = '#0064FF';
      ctx.fillRect(cx - 30, cy - 15, 60, 25);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`ID: ${marker.id}`, cx, cy - 2);
    } else {
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.fillStyle = '#00FF00';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`ID: ${marker.id}`, cx, cy);
    }
  });

  // 블루투스 데이터 전송
  let currentTime = performance.now();
  if (currentTime - lastSentTime > SEND_INTERVAL) {
    if (largestMarker) {
      const corners = largestMarker.corners;
      let minX = Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
      let maxX = Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
      let minY = Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
      let maxY = Math.max(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
      
      let finalW = maxX - minX;
      let finalH = maxY - minY;
      
      let cx = 0, cy = 0;
      corners.forEach(p => { cx += p.x; cy += p.y; });
      cx /= 4; cy /= 4;

      let sendX = isFlipped ? (videoWidth - cx) : cx;

      sendBluetoothData(sendX, cy, finalW, finalH, detectedCount);
      dataDisplay.innerHTML = `전송됨: x${Math.round(sendX)} y${Math.round(cy)} w${Math.round(finalW)} h${Math.round(finalH)} d${detectedCount}`;
      dataDisplay.style.color = "#0f0";
    } else {
      sendBluetoothData(0, 0, 0, 0, 0);
      dataDisplay.innerHTML = `전송됨: 없음 (Stop)`;
      dataDisplay.style.color = "#888";
    }
    lastSentTime = currentTime;
  }

  // 최적화된 프레임 콜백
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
  const btnCam = document.createElement('button');
  btnCam.innerText = "전후방 전환";
  btnCam.className = "start-button";
  btnCam.onclick = switchCamera;
  document.getElementById('camera-control-buttons').appendChild(btnCam);

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

  const selectObj = document.createElement('select');
  selectObj.innerHTML = `<option value="">추적할 마커 ID 선택</option>`;
  for(let i=0; i<=30; i++) {
    selectObj.innerHTML += `<option value="${i}">ID: ${i}</option>`;
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

  const btnStart = document.createElement('button');
  btnStart.id = "btnStart";
  btnStart.innerText = "마커 인식 시작";
  btnStart.className = "start-button";
  btnStart.onclick = () => {
    if (!detector) return alert("로딩 중입니다.");
    if (!isConnected) return alert("블루투스 연결이 필요합니다.");
    if (selectedObjects.length === 0) return alert("마커 ID를 선택해주세요.");
    isObjectDetectionActive = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    
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

window.addEventListener('DOMContentLoaded', init);
