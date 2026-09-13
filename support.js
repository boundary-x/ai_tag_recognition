/* AprilTag support: explanatory tour, no control mutations. */
(()=>{'use strict';const $=id=>document.getElementById(id);const support=$('support-card');support.innerHTML="<summary><span><strong>사용 가이드 및 지원</strong><small>사용법 · 예제 코드 · 문제 해결</small></span><span class=\"support-chevron\" aria-hidden=\"true\">⌄</span></summary>\n<div class=\"support-content\">\n<p class=\"support-intro\">태그의 ID 또는 위치·크기 데이터를 프로젝트에 활용해보세요.</p>\n<div class=\"support-actions\"><button type=\"button\" data-tour=\"all\" class=\"support-primary\">사용법 둘러보기 <span aria-hidden=\"true\">→</span></button></div>\n<details class=\"support-section\" id=\"help-examples\"><summary>마이크로비트 예제 코드</summary><div class=\"support-answer\">\n<div class=\"example-code\"><a href=\"https://makecode.microbit.org/S49771-77509-50114-72682\" target=\"_blank\" rel=\"noopener noreferrer\"><strong>블루투스 이름 확인 코드 ↗</strong></a><p>연결할 마이크로비트의 장치 이름을 확인합니다. 마이크로비트의 LED 매트릭스에 출력되는 이름(알파벳 소문자 5자리)을 확인하세요.</p></div>\n<p class=\"support-caption\">태그 인식 프로젝트 예제 코드를 준비 중입니다.</p>\n<p>수신 코드는 태그 분류의 ID12·none 또는 태그 인식의 x·y·w·h·d·stop을 처리하도록 준비하세요. 데이터마다 줄바꿈이 붙습니다.</p></div></details>\n<details class=\"support-section\" id=\"help-troubleshooting\"><summary>문제 해결 <span class=\"support-meta\">증상별 안내</span></summary><div class=\"support-answer support-faq\">\n<details><summary>카메라가 켜지지 않아요</summary><p>브라우저의 카메라 권한을 허용하세요. 카메라를 사용하는 다른 앱이나 탭을 닫고 새로고침하세요. HTTPS 또는 localhost로 접속해야 합니다.</p></details>\n<details><summary>감지기 로딩이 끝나지 않아요</summary><p>인터넷 연결을 확인하고 새로고침하세요. 감지기 준비와 카메라 로딩이 끝난 뒤 인식 시작을 누르세요.</p></details>\n<details><summary>태그가 인식되지 않아요</summary><p>tag36h11 계열의 AprilTag(ID 0~586)를 사용하세요. QR 코드는 지원하지 않습니다. 태그 전체와 주변 여백이 보이도록 하고 빛 반사와 흔들림을 줄이세요. 작은 태그는 카메라에 더 가까이 가져오거나 최소 인식 크기를 낮춰보세요.</p></details>\n<details><summary>분류에서 다른 태그의 ID가 전송돼요</summary><p>노란 네모 안에 중심점이 들어온 태그 중 중앙 십자점에 가장 가까운 하나를 선택합니다. 원하는 태그를 십자점에 맞추세요. 굵은 파란색 박스가 전송 대상이며, 범위 안에 태그가 없으면 none을 전송합니다.</p></details>\n<details><summary>태그 인식에서 좌표가 하나만 나와요</summary><p>선택한 ID 중 가장 큰 박스의 중심 좌표와 크기를 전송합니다. d는 선택한 ID의 검출 개수이며 감지기가 반환하는 최대 8개 결과 안에서 계산됩니다. 현재 감지기는 인식률 점수를 제공하지 않습니다.</p></details>\n<details><summary>모드나 ID를 바꾼 뒤 인식이 멈췄어요</summary><p>이전 결과가 전송되지 않도록 모드·ID 변경 시 인식을 중지합니다. 설정을 마친 뒤 인식 시작을 다시 누르세요. 태그 인식에서는 ID를 0~586 사이 정수로 입력하세요.</p></details>\n<details id=\"help-connection\"><summary>블루투스가 연결되지 않거나 기기가 반응하지 않아요</summary><p>Web Bluetooth 지원 브라우저와 마이크로비트 전원을 확인하고 다른 앱의 연결을 해제하세요. 이름 확인 코드만으로는 프로젝트 제어가 되지 않습니다. 현재 모드에 맞는 UART 수신 코드가 필요합니다. 전송됨 표시는 브라우저의 전송 성공이며 실제 기기 동작도 확인해야 합니다.</p></details>\n</div></details>\n<details class=\"support-section\" id=\"help-materials\"><summary>수업 자료</summary><div class=\"support-answer\"><p>수업 자료를 준비 중입니다.</p></div></details>\n<details class=\"support-section\" id=\"help-updates\"><summary>업데이트 노트 <span class=\"support-meta\">최근 변경</span></summary><div class=\"support-answer\"><p class=\"support-release\">태그 분류 · 태그 인식 모드 추가</p><ul><li>중앙 노란 프레임과 십자점을 이용한 ID 분류</li><li>선택한 ID의 전체 화면 인식과 좌표·크기·개수 전송</li><li>전송 대상 박스 구분 및 전송 상태 안내</li><li>모바일 카메라 비율과 플로팅 화면 대응</li><li>사용법 둘러보기와 증상별 문제 해결 추가</li></ul></div></details>\n</div>";
const recognition=[[".canvas-container","태그와 카메라를 준비하세요","tag36h11 계열의 AprilTag(ID 0~586)를 준비하세요. 카메라 권한을 허용하고 태그 전체를 비춰주세요."],["#camera-control-buttons","촬영 화면을 설정하세요","전후방 전환과 좌우 반전을 사용할 수 있습니다. 카메라 전환 후에는 인식 시작을 다시 누르세요."],["#tag-mode-buttons","태그 분류 또는 태그 인식을 선택하세요","태그 분류는 중앙 노란 프레임에서 ID12처럼 ID를 전송합니다. 태그 인식은 선택한 ID를 화면 전체에서 찾아 좌표와 크기를 전송합니다."],["#mode-help","모드에 맞게 대상을 정하세요","분류에서는 중앙 십자점에 가장 가까운 태그가 대상입니다. 인식 모드에서는 아래 ID 입력란에 하나를 지정합니다. 같은 ID가 여러 개면 가장 큰 태그를 선택합니다."],["#min-size","최소 인식 크기를 조절하세요","작은 태그를 제외하는 기준입니다. 태그가 보이지 않으면 가까이 가져오거나 값을 낮춰보세요. 인식 정확도 점수는 아닙니다."]];const device=[["#bluetooth-control-buttons","마이크로비트를 연결하세요","기기에 현재 모드에 맞는 수신 코드를 넣고 기기 연결을 누르세요. 기기 연결 없이도 화면에서 인식을 확인할 수 있습니다."],["#object-control-buttons","인식을 시작하세요","준비가 끝나면 인식 시작을 누르세요. 모드나 ID를 바꾸면 중지되므로 다시 시작해주세요. 안내를 닫은 뒤 직접 조작할 수 있습니다."]];const data=[["#recognition-status","인식 결과와 전송 대상을 확인하세요","굵은 파란색 박스가 전송 대상이고 초록색은 나머지 태그입니다. 태그를 화면 밖으로 빼서 미검출 상태도 확인하세요."],["#dataDisplay","전송 데이터를 확인하세요","분류: ID12 또는 none. 인식: x·y·w·h·d 또는 stop. 좌표는 400×300 기준입니다. 기기 미연결 상태에서는 전송 예정 데이터만 표시됩니다."]];const allSteps=[...recognition,...device,...data];const chapters=[{label:'준비·설정',start:0},{label:'연결·시작',start:recognition.length},{label:'결과 확인',start:recognition.length+device.length}];
  const dialog = document.createElement('dialog');
  dialog.id = 'guide-dialog';
  dialog.setAttribute('aria-labelledby', 'guide-title');
  dialog.setAttribute('aria-describedby', 'guide-description');
  dialog.innerHTML = `<div id="guide-spotlight" aria-hidden="true"></div><section id="guide-panel"><div class="guide-topline"><span id="guide-progress"></span><button id="guide-close" type="button" aria-label="화면 안내 종료">닫기 ×</button></div><nav class="guide-chapters" aria-label="안내 구간">${chapters.map((chapter, i) => `<button type="button" data-chapter="${i}" aria-pressed="false">${chapter.label}</button>`).join('')}</nav><div aria-live="polite" aria-atomic="true"><h2 id="guide-title"></h2><p id="guide-description"></p></div><p class="guide-caption">안내 중에도 실행 중인 인식과 전송은 계속됩니다.</p><button id="guide-skip-device" type="button" hidden>기기 연결 건너뛰기 →</button><div class="guide-navigation"><button id="guide-prev" type="button">이전</button><button id="guide-next" type="button">다음</button></div></section>`;
  document.body.appendChild(dialog);
  let steps = [], index = 0, target = null, opener = null, originalScroll = 0, pendingFrame = 0;

  let examplesWereOpen = false;

  function openHelp(section) {
    support.open = true;
    if (section) {
      $('help-troubleshooting').open = true;
      $(section).open = true;
    }
    const heading = (section ? $(section) : support).querySelector('summary');
    heading.scrollIntoView({block: 'center', behavior: 'instant'});
    heading.focus({preventScroll: true});
  }
  document.querySelectorAll('[data-help]').forEach(button => button.addEventListener('click', () => openHelp(button.dataset.help || null)));

  function renderStep() {
    const [selector, title, description] = steps[index];
    if (selector === '#project-example-link') $('help-examples').open = true;
    target = document.querySelector(selector);
    const chapterIndex = index < chapters[1].start ? 0 : index < chapters[2].start ? 1 : 2;
    dialog.querySelectorAll('[data-chapter]').forEach((button, i) => button.setAttribute('aria-pressed', String(i === chapterIndex)));
    $('guide-skip-device').hidden = chapterIndex !== 1;
    $('guide-progress').textContent = `${chapters[chapterIndex].label}${chapterIndex === 1 ? ' · 선택' : ''} · ${index + 1} / ${steps.length}`;
    $('guide-title').textContent = title;
    $('guide-description').textContent = description;
    $('guide-prev').disabled = index === 0;
    $('guide-next').textContent = index === steps.length - 1 ? '안내 마치기' : '다음';
    if (target) target.scrollIntoView({block: 'center', behavior: 'instant'});
    positionGuide(true);
  }

  function positionGuide(reveal = false) {
    if (!dialog.open) return;
    const panel = $('guide-panel'), spot = $('guide-spotlight');
    const width = window.innerWidth, height = window.innerHeight, gap = 16;
    panel.style.width = Math.min(360, width - 24) + 'px';
    const ph = panel.getBoundingClientRect().height, pw = panel.getBoundingClientRect().width;
    const headerBottom = document.querySelector('header').getBoundingClientRect().bottom;
    let r = target ? target.getBoundingClientRect() : null;
    // Narrow screens reserve the lower area for the explanation. A temporary bottom
    // spacer allows the last control to scroll above it without altering saved data.
    const narrow = width < 700;
    if (reveal && r && narrow) {
      const top = Math.max(12, headerBottom + 16);
      window.scrollBy({top: r.top - top, behavior: 'instant'});
      r = target.getBoundingClientRect();
    }
    let x = width - pw - 12, y = height - ph - 12;
    if (r && !narrow) {
      const candidates = [
        [r.left - pw - gap, Math.max(12, Math.min(r.top, height - ph - 12))],
        [r.right + gap, Math.max(12, Math.min(r.top, height - ph - 12))],
        [Math.max(12, Math.min(r.left, width - pw - 12)), r.bottom + gap],
        [Math.max(12, Math.min(r.left, width - pw - 12)), r.top - ph - gap]
      ];
      const fit = candidates.find(([cx, cy]) => cx >= 12 && cy >= 12 && cx + pw <= width - 12 && cy + ph <= height - 12);
      if (fit) [x,y] = fit;
    }
    panel.style.left = x + 'px'; panel.style.top = Math.max(12, y) + 'px';
    if (r) {
      const top = Math.max(4, r.top - 5), left = Math.max(4, r.left - 5);
      const bottom = Math.min(height - 4, narrow ? y - 12 : height - 4, r.bottom + 5);
      spot.hidden = bottom <= top || r.right <= 0 || r.left >= width;
      Object.assign(spot.style, {left: left + 'px', top: top + 'px', width: Math.max(0, Math.min(width - 4, r.right + 5) - left) + 'px', height: Math.max(0, bottom - top) + 'px'});
    } else spot.hidden = true;
  }
  function startTour(kind, button) {
    if (kind !== 'all') return;
    opener = button; originalScroll = window.scrollY;
    steps = allSteps; index = 0;
    examplesWereOpen = $('help-examples').open;
    document.body.classList.add('guide-active');
    dialog.showModal();
    renderStep();
    $('guide-next').focus({preventScroll:true});
  }
  support.querySelectorAll('[data-tour]').forEach(button => button.addEventListener('click', () => startTour(button.dataset.tour, button)));
  $('guide-prev').addEventListener('click', () => { if (index > 0) { index--; renderStep(); } });
  $('guide-next').addEventListener('click', () => { if (index === steps.length - 1) dialog.close(); else { index++; renderStep(); } });
  dialog.querySelectorAll('[data-chapter]').forEach(button => button.addEventListener('click', () => { index = chapters[Number(button.dataset.chapter)].start; renderStep(); }));
  $('guide-skip-device').addEventListener('click', () => { index = chapters[2].start; renderStep(); $('guide-next').focus({preventScroll:true}); });
  $('guide-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.classList.remove('guide-active');
    $('help-examples').open = examplesWereOpen;
    window.scrollTo({top:originalScroll, behavior:'instant'});
    if (opener) opener.focus({preventScroll:true});
  });
  const reposition = () => {
    if (!dialog.open || pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; positionGuide(); });
  };
  window.addEventListener('resize', () => { if (dialog.open) renderStep(); });
  window.addEventListener('scroll', reposition, {passive:true});
  if (location.hash === '#support-card') requestAnimationFrame(() => openHelp());
})();

