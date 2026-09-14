import {ROI, validId, crop4by3, evaluate, writePacket} from './tag-logic.js';
const $ = id => document.getElementById(id);
const canvas=$('preview'), ctx=canvas.getContext('2d'), video=$('camera');
const capture=document.createElement('canvas');
capture.width=320; capture.height=240;
const cc=capture.getContext('2d',{willReadFrequently:true});
let mode='classification', target=0, minimum=30, mirror=true, facing='user';
let active=false, ready=false, cameraReady=false, cameraGeneration=0, epoch=0;
let worker, detector, raw=[], capturedAt=0, lastSend=0, cameraMessage='카메라 로딩 중...';
let device, characteristic, pending=null, writing=false, linkGeneration=0, neutralPending=null;
const emptyPacket=()=>mode==='classification'?'none\n':'stop\n';
function button(parent,id,text,action,cls='start-button') {
  const b=document.createElement('button'); b.id=id;b.textContent=text;b.className=cls;
  b.addEventListener('click',action);$(parent).append(b);return b;
}
function resetResults(){epoch++;raw=[];capturedAt=0;pending=null;}
function neutral(){pending=null;if(characteristic){neutralPending={packet:emptyPacket(),epoch};flush();}}
function stop(){active=false;resetResults();neutral();$('recognition-status').textContent='인식 중지됨';}
function updateMode(){
  $('target-settings').hidden=mode!=='tracking';
  for(const id of ['classification','tracking']) {
    $(id).classList.toggle('active',id===mode);$(id).setAttribute('aria-pressed',id===mode);
  }
  $('mode-help').textContent=mode==='classification'
    ? '노란 프레임 안에 태그의 중심을 맞추세요. 여러 태그는 중앙에 가장 가까운 하나를 선택합니다.'
    : '화면 전체에서 선택한 ID만 인식합니다. 현재 감지기는 품질 점수를 제공하지 않아 같은 ID 중 가장 큰 태그를 선택합니다.';
  $('protocol-help').textContent=mode==='classification'
    ? '태그 ID 전송: ID12 · 미검출: none · 각 데이터 뒤에 줄바꿈이 붙습니다.'
    : 'I: ID · X, Y: 중심 좌표 · W, H: 크기(각 3자리) · D: 검출 개수(2자리). 예: I012X200Y150W080H060D02 · 좌표 기준 400×300 · 미검출: stop';
}
for(const id of ['classification','tracking']) $(id).onclick=()=>{
  if(mode===id)return;
  stop();mode=id;resetResults();updateMode();neutral();
  $('dataDisplay').textContent=characteristic?'전송 대기 중':'기기 미연결';
};
$('tag-id').addEventListener('input',()=>{
  stop();
  const valid=validId($('tag-id').value);
  target=valid?Number($('tag-id').value):null;
  $('id-error').textContent=valid?'':'0~586 사이 정수 ID를 입력하세요.';
});
$('min-size').oninput=()=>{minimum=Number($('min-size').value);$('min-value').textContent=minimum;resetResults();neutral();};
button('camera-control-buttons','switch-camera','전후방 전환',()=>{facing=facing==='user'?'environment':'user';mirror=facing==='user';startCamera();});
button('camera-control-buttons','mirror','좌우 반전',()=>{mirror=!mirror;resetResults();neutral();});
button('bluetooth-control-buttons','connect','기기 연결',connect);
button('bluetooth-control-buttons','disconnect','연결 해제',async()=>{
  stop();
  // Finish any queued neutral packet before intentional disconnection.
  const until=Date.now()+1000;
  while((writing||pending||neutralPending)&&Date.now()<until)await new Promise(r=>setTimeout(r,20));
  device?.gatt.disconnect();disconnected();
},'stop-button');
const startButton=button('object-control-buttons','start','감지기 로딩 중...',()=>{
  if(!ready||!cameraReady){$('recognition-status').textContent='카메라와 감지기가 준비될 때까지 기다려주세요.';return;}
  if(mode==='tracking'&&target===null){$('tag-id').focus();return;}
  resetResults();active=true;
});
button('object-control-buttons','stop','인식 중지',stop,'stop-button');
async function startCamera(){
  stop();cameraReady=false;cameraMessage='카메라 로딩 중...';
  const generation=++cameraGeneration;
  video.srcObject?.getTracks().forEach(t=>t.stop());video.srcObject=null;
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing,width:{ideal:480},height:{ideal:360}},audio:false});
    if(generation!==cameraGeneration){stream.getTracks().forEach(t=>t.stop());return;}
    video.srcObject=stream;await video.play();
    cameraReady=true;
    stream.getVideoTracks()[0].addEventListener('ended',()=>{if(generation===cameraGeneration){stop();cameraReady=false;cameraMessage='카메라 연결이 종료되었습니다.';}});
    $('recognition-status').textContent='카메라 준비 완료 · 인식 시작을 눌러주세요.';
  }catch(e){
    const messages={NotAllowedError:'카메라 권한을 허용해주세요.',NotReadableError:'다른 앱에서 카메라를 사용 중인지 확인해주세요.',NotFoundError:'카메라를 찾을 수 없습니다.'};
    cameraMessage=messages[e.name]||'카메라 오류: '+e.message;
    $('recognition-status').textContent=cameraMessage;
  }
}
async function init(){
  const timeout=setTimeout(()=>{if(!ready) $('recognition-status').textContent='감지기 로딩이 지연됩니다. 네트워크를 확인하고 새로고침해주세요.';},20000);
  try{
    worker=new Worker('libs/apriltag_worker.js');
    worker.onerror=()=>{ready=false;stop();$('recognition-status').textContent='감지기 로딩 또는 실행 오류입니다. 새로고침해주세요.';};
    const Remote=Comlink.wrap(worker);
    detector=await new Remote(Comlink.proxy(()=>{ready=true;clearTimeout(timeout);startButton.textContent='인식 시작';}));
  }catch(e){clearTimeout(timeout);$('recognition-status').textContent='감지기 오류: '+e.message;}
  detectionLoop();
}
async function detectionLoop(){
  if(active&&ready&&cameraReady&&video.readyState>=2&&detector){
    const generation=epoch, timestamp=performance.now();
    try{
      cc.drawImage(video,...crop4by3(video.videoWidth,video.videoHeight),0,0,320,240);
      const buffer=cc.getImageData(0,0,320,240).data.buffer;
      const result=await detector.detectFromRGBA(Comlink.transfer(buffer,[buffer]),320,240);
      if(generation===epoch&&active){raw=Array.isArray(result)?result:[];capturedAt=timestamp;}
    }catch(e){if(generation===epoch){raw=[];capturedAt=0;neutral();$('recognition-status').textContent='태그 인식 오류: '+e.message;}}
  }
  setTimeout(detectionLoop,30);
}
function draw(){
  ctx.fillStyle='#000';ctx.fillRect(0,0,400,300);
  if(cameraReady&&video.readyState>=2){
    ctx.save();if(mirror){ctx.translate(400,0);ctx.scale(-1,1);}
    ctx.drawImage(video,...crop4by3(video.videoWidth,video.videoHeight),0,0,400,300);ctx.restore();
  }else{ctx.fillStyle='#fff';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText(cameraMessage,200,150);}
  const result=evaluate(active&&performance.now()-capturedAt<750?raw:[],mode,target,minimum,mirror);
  for(const tag of result.tags){
    const primary=tag===result.primary;
    ctx.strokeStyle=primary?'#0064ff':'#00dc85';ctx.lineWidth=primary?4:2;
    ctx.beginPath();tag.corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();
    const label='ID'+tag.id+(primary?' · 전송 대상':'');
    ctx.font='bold 14px sans-serif';ctx.textAlign='left';ctx.textBaseline='top';
    const w=ctx.measureText(label).width+12;
    const x=Math.max(0,Math.min(400-w,tag.center.x-tag.w/2));
    const y=Math.max(0,Math.min(278,tag.center.y-tag.h/2-22));
    ctx.fillStyle=ctx.strokeStyle;ctx.fillRect(x,y,w,22);ctx.fillStyle='#fff';ctx.fillText(label,x+6,y+3);
  }
  if(mode==='classification'){
    ctx.strokeStyle='#ffd644';ctx.lineWidth=3;ctx.strokeRect(ROI.x,1.5,ROI.size,ROI.size-3);
    const cx=ROI.x+ROI.size/2, cy=ROI.y+ROI.size/2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx-8,cy);ctx.lineTo(cx+8,cy);
    ctx.moveTo(cx,cy-8);ctx.lineTo(cx,cy+8);
    ctx.strokeStyle='rgba(0,0,0,0.8)';ctx.lineWidth=5;ctx.stroke();
    ctx.strokeStyle='#ffd644';ctx.lineWidth=2;ctx.stroke();
    ctx.restore();
  }
  if(active){
    $('recognition-status').textContent=result.primary?'인식 결과: ID'+result.primary.id+' · '+result.tags.length+'개':'인식 결과: '+(mode==='classification'?'범위 안에 태그 없음':'선택한 태그 없음');
    if(performance.now()-lastSend>=100){
      lastSend=performance.now();
      if(characteristic)enqueue(result.packet);
      else $('dataDisplay').textContent='기기 미연결 · 전송 예정: '+result.packet.trim();
    }
  }
  requestAnimationFrame(draw);
}
function disconnected(){
  linkGeneration++;characteristic=null;pending=null;neutralPending=null;device=null;
  $('bluetoothStatus').textContent='상태: 연결 해제됨';$('bluetoothStatus').className='';
  $('dataDisplay').textContent='기기 미연결 · 전송 중단';
}
async function connect(){
  if(device?.gatt.connected)return;
  try{
    if(!navigator.bluetooth)throw Error('이 브라우저는 블루투스를 지원하지 않습니다.');
    $('bluetoothStatus').textContent='상태: 연결 중...';
    device=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'BBC micro:bit'}],optionalServices:['6e400001-b5a3-f393-e0a9-e50e24dcca9e']});
    device.addEventListener('gattserverdisconnected',disconnected,{once:true});
    const server=await device.gatt.connect();
    const service=await server.getPrimaryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
    characteristic=await service.getCharacteristic('6e400003-b5a3-f393-e0a9-e50e24dcca9e');
    linkGeneration++;$('bluetoothStatus').textContent='상태: 연결됨 · '+device.name;$('bluetoothStatus').className='status-connected';neutral();
  }catch(e){
    device?.gatt.disconnect();disconnected();
    $('bluetoothStatus').textContent='연결 실패: '+e.message;$('bluetoothStatus').className='status-error';
  }
}
function enqueue(packet){pending={packet,epoch};flush();}
async function flush(){
  if(writing||!characteristic)return;
  writing=true;
  try{
    while((neutralPending||pending)&&characteristic){
      const job=neutralPending||pending, ch=characteristic, generation=linkGeneration;
      if(neutralPending)neutralPending=null;else pending=null;
      await writePacket(ch, job.packet);
      if(generation===linkGeneration&&job.epoch===epoch)$('dataDisplay').textContent='전송됨: '+job.packet.trim();
    }
  }catch(e){pending=null;neutralPending=null;$('dataDisplay').textContent='전송 실패: '+e.message;}
  finally{writing=false;}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.addEventListener('pagehide',()=>{stop();video.srcObject?.getTracks().forEach(t=>t.stop());});
new ResizeObserver(()=>document.documentElement.style.setProperty('--camera-top',document.querySelector('header').getBoundingClientRect().height+8+'px')).observe(document.querySelector('header'));
updateMode();startCamera();init();draw();
