/* app.js — 3D 렌더링(three.js), 입력(마우스·터치·키보드), 혼자 풀기/스터디 모드 */
(function () {
  'use strict';
  const { Cube, FACE, SIDES, COLOR_NAMES, parseMove, formatMove, invert, relToAbs, absToRel, sameMove } = window.CubeLib;
  const Tutor = window.Tutor;
  const $ = (id) => document.getElementById(id);

  const PALETTE = [0xf2f2ec, 0xffd500, 0x009b48, 0x0a4fc4, 0xc8102e, 0xff6a00, 0x30363d];
  const CSS_COLOR = ['#f2f2ec', '#ffd500', '#009b48', '#0a4fc4', '#c8102e', '#ff6a00', '#30363d'];
  const PUZZLES = [
    { N: 2, name: '2×2', sub: '포켓 큐브' },
    { N: 3, name: '3×3', sub: '기본 큐브' },
    { N: 4, name: '4×4', sub: '리벤지' },
    { N: 5, name: '5×5', sub: '프로페서' },
    { N: 6, name: '6×6', sub: 'V-큐브 6' },
    { N: 7, name: '7×7', sub: 'V-큐브 7' },
  ];
  const SCRAMBLE_LEN = { 2: 11, 3: 22, 4: 40, 5: 60, 6: 80, 7: 100 };
  const VIEW_OFFSET = 0.6; // 정면 + 오른쪽 면이 함께 보이도록 살짝 비튼 각도
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = {
    N: 3,
    cube: null,
    mode: 'free',
    history: [],
    queue: [],
    anim: null,
    moveCount: 0,
    timer: { armed: false, running: false, start: 0, elapsed: 0 },
    scrambled: false,
    pendingDepth: 0,
    held: [],
    study: { a: null, steps: [], map: new Map(), pointer: 0, dev: [], assign2: null },
  };

  // ---------------- three.js 장면 ----------------
  const stageEl = $('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  stageEl.insertBefore(renderer.domElement, stageEl.firstChild);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3440, 0.85));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.55);
  keyLight.position.set(2, 3, 4);
  camera.add(keyLight);
  const cubeGroup = new THREE.Group();
  scene.add(cubeGroup);

  const view = { theta: VIEW_OFFSET, phi: 0.52, tTheta: VIEW_OFFSET, tPhi: 0.52, dist: 12 };

  let cubies = new Map();
  let stickers = [];
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0d1013, roughness: 0.55, metalness: 0.05 });

  function roundedRect(size, r) {
    const s = size / 2;
    const sh = new THREE.Shape();
    sh.moveTo(-s + r, -s);
    sh.lineTo(s - r, -s); sh.quadraticCurveTo(s, -s, s, -s + r);
    sh.lineTo(s, s - r); sh.quadraticCurveTo(s, s, s - r, s);
    sh.lineTo(-s + r, s); sh.quadraticCurveTo(-s, s, -s, s - r);
    sh.lineTo(-s, -s + r); sh.quadraticCurveTo(-s, -s, -s + r, -s);
    return new THREE.ShapeGeometry(sh, 4);
  }

  function buildMeshes() {
    while (cubeGroup.children.length) {
      const c = cubeGroup.children.pop();
      c.traverse((o) => { if (o.material && o.material !== bodyMat) o.material.dispose(); });
    }
    cubies = new Map();
    stickers = [];
    const cube = S.cube;
    const boxGeo = new THREE.BoxGeometry(0.97, 0.97, 0.97);
    const stGeo = roundedRect(0.84, 0.12);
    cube.slots.forEach((sl, i) => {
      const k = sl.p.join(',');
      let c = cubies.get(k);
      if (!c) {
        const g = new THREE.Group();
        g.position.set(sl.p[0] / 2, sl.p[1] / 2, sl.p[2] / 2);
        g.add(new THREE.Mesh(boxGeo, bodyMat));
        cubeGroup.add(g);
        c = { group: g, p: sl.p };
        cubies.set(k, c);
      }
      const mat = new THREE.MeshStandardMaterial({ color: PALETTE[cube.state[i]], roughness: 0.38, metalness: 0.0, emissive: 0x000000 });
      const m = new THREE.Mesh(stGeo, mat);
      const n = sl.n;
      m.position.set(n[0] * 0.487, n[1] * 0.487, n[2] * 0.487);
      if (n[0] === 1) m.rotation.y = Math.PI / 2;
      else if (n[0] === -1) m.rotation.y = -Math.PI / 2;
      else if (n[1] === 1) m.rotation.x = -Math.PI / 2;
      else if (n[1] === -1) m.rotation.x = Math.PI / 2;
      else if (n[2] === -1) m.rotation.y = Math.PI;
      m.userData.slot = i;
      c.group.add(m);
      stickers[i] = m;
    });
    view.dist = S.N * 2.15 + 4.2;
    recolor();
  }

  function recolor() {
    const st = S.cube.state;
    for (let i = 0; i < stickers.length; i++) stickers[i].material.color.setHex(PALETTE[st[i]]);
  }

  function resize() {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  function updateCamera() {
    const k = 0.2;
    view.theta += (view.tTheta - view.theta) * k;
    view.phi += (view.tPhi - view.phi) * k;
    const { theta, phi } = view;
    const d = view.dist * (camera.aspect < 1 ? 1 + (1 - camera.aspect) * 0.9 : 1);
    camera.position.set(d * Math.sin(theta) * Math.cos(phi), d * Math.sin(phi), d * Math.cos(theta) * Math.cos(phi));
    camera.lookAt(0, 0, 0);
  }

  /** 지금 화면 정면에 보이는 면 (U는 항상 위) */
  function viewFront(theta = view.tTheta) {
    const idx = ((Math.round(theta / (Math.PI / 2)) % 4) + 4) % 4;
    return SIDES[idx];
  }
  function alignTo(front) {
    const idx = SIDES.indexOf(front);
    const base = idx * Math.PI / 2 + VIEW_OFFSET;
    const k = Math.round((view.tTheta - base) / (2 * Math.PI));
    view.tTheta = base + k * 2 * Math.PI;
    if (view.tPhi < 0.2) view.tPhi = 0.52;
    updateHud();
  }

  // ---------------- 이동 실행 ----------------
  function enqueue(move, source) {
    S.queue.push({ move, source });
  }
  function busyScrambling() { return S.queue.some((q) => q.source === 'scramble') || (S.anim && S.anim.item.source === 'scramble'); }

  function startNext(now) {
    const item = S.queue.shift();
    if (!item) return;
    const g = S.cube.geometry(item.move);
    let dur = item.move.t === 2 ? 240 : 170;
    if (item.source === 'scramble') dur = Math.max(22, Math.min(70, 1400 / SCRAMBLE_LEN[S.N]));
    else if (S.queue.length > 2) dur = 95;
    if (reduceMotion) dur = 0;
    const pivot = new THREE.Object3D();
    cubeGroup.add(pivot);
    const moved = [];
    cubies.forEach((c) => { if (g.layers.includes(c.p[g.axis])) { pivot.attach(c.group); moved.push(c); } });
    const target = (g.q === 3 ? -1 : g.q) * Math.PI / 2;
    S.anim = { item, pivot, moved, axis: ['x', 'y', 'z'][g.axis], target, start: now, dur };
  }

  function finishAnim() {
    const a = S.anim;
    a.moved.forEach((c) => {
      cubeGroup.attach(c.group);
      c.group.position.set(c.p[0] / 2, c.p[1] / 2, c.p[2] / 2);
      c.group.rotation.set(0, 0, 0);
    });
    cubeGroup.remove(a.pivot);
    S.anim = null;
    S.cube.apply(a.item.move);
    recolor();
    onApplied(a.item);
  }

  function tickAnim(now) {
    if (!S.anim && S.queue.length) startNext(now);
    const a = S.anim;
    if (!a) return;
    const t = a.dur ? Math.min(1, (now - a.start) / a.dur) : 1;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    a.pivot.rotation[a.axis] = a.target * e;
    if (t >= 1) finishAnim();
  }

  function onApplied(item) {
    const src = item.source;
    if (src === 'scramble') {
      if (!S.queue.length) onScrambleDone();
      return;
    }
    S.moveCount++;
    if (src !== 'undo') S.history.push(item.move);
    if (S.timer.armed && !S.timer.running) { S.timer.running = true; S.timer.start = performance.now(); }
    $('moveCount').textContent = S.moveCount;
    if (S.mode === 'study') studyTrack(item.move);
    updateHud();
    if (S.scrambled && S.cube.isSolved()) onSolved();
    else if (S.mode === 'study') renderStudy();
    updateHighlight();
  }

  function userMove(move) {
    if (busyScrambling()) return;
    hideBanner();
    enqueue(move, 'user');
  }

  // ---------------- 섞기 / 완성 ----------------
  function scramble() {
    if (busyScrambling()) return;
    S.queue = [];
    if (S.anim) finishAnim();
    S.cube.state = S.cube.solvedState();
    recolor();
    resetStats();
    hideBanner();
    S.cube.scramble(SCRAMBLE_LEN[S.N]).forEach((m) => enqueue(m, 'scramble'));
    S.study.a = null; S.study.steps = [];
    renderStudy();
  }
  function onScrambleDone() {
    S.scrambled = true;
    S.timer.armed = true;
    toast(S.mode === 'study' ? '섞었습니다. 단계별 안내를 따라 해 보세요.' : '섞었습니다. 첫 동작부터 시간이 잽니다.');
    if (S.mode === 'study') studyCompute();
    updateHighlight();
  }
  function resetStats() {
    S.history = [];
    S.moveCount = 0;
    S.timer = { armed: false, running: false, start: 0, elapsed: 0 };
    S.scrambled = false;
    $('moveCount').textContent = '0';
    $('timer').textContent = fmtTime(0);
  }
  function resetCube() {
    S.queue = [];
    if (S.anim) finishAnim();
    S.cube.state = S.cube.solvedState();
    recolor();
    resetStats();
    hideBanner();
    if (S.mode === 'study') studyCompute();
    updateHighlight();
  }
  function undo() {
    if (busyScrambling() || S.anim || S.queue.length) return;
    const m = S.history.pop();
    if (!m) { toast('되돌릴 동작이 없습니다.'); return; }
    enqueue(invert(m), 'undo');
  }

  function onSolved() {
    const t = S.timer.running ? performance.now() - S.timer.start : S.timer.elapsed;
    S.timer.running = false; S.timer.armed = false; S.timer.elapsed = t;
    S.scrambled = false;
    $('timer').textContent = fmtTime(t);
    let bestNote = '';
    if (S.mode === 'free') {
      const prev = loadBest(S.N);
      if (!prev || t < prev) { saveBest(S.N, t); bestNote = ' · 새 최고 기록'; }
      showBest();
    }
    showBanner('완성!', `${fmtTime(t)} · ${S.moveCount}수${bestNote}`);
    if (S.mode === 'study') studyCompute();
  }

  function fmtTime(ms) {
    const cs = Math.floor(ms / 10);
    const m = Math.floor(cs / 6000), s = Math.floor(cs / 100) % 60, c = cs % 100;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(c).padStart(2, '0');
  }
  function loadBest(N) { try { const v = localStorage.getItem('cubelab-best-' + N); return v ? Number(v) : null; } catch (e) { return null; } }
  function saveBest(N, t) { try { localStorage.setItem('cubelab-best-' + N, String(Math.round(t))); } catch (e) { /* 저장 불가 */ } }
  function showBest() { const b = loadBest(S.N); $('best').textContent = b ? fmtTime(b) : '—'; }

  function showBanner(title, text) {
    $('bannerTitle').textContent = title;
    $('bannerText').textContent = text;
    $('banner').hidden = false;
  }
  function hideBanner() { $('banner').hidden = true; }
  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ---------------- 이동 설명 / 키 안내 ----------------
  function moveSentence(m) {
    // m: 보는 방향 기준 상대 이동
    const N = S.N;
    const half = m.t === 2;
    if (m.lo === 1 && m.hi === N) {
      const txt = {
        R: ['큐브 전체를 앞쪽이 위로 가게 굴리기', '큐브 전체를 앞쪽이 아래로 가게 굴리기'],
        L: ['큐브 전체를 앞쪽이 아래로 가게 굴리기', '큐브 전체를 앞쪽이 위로 가게 굴리기'],
        U: ['큐브 전체를 왼쪽으로 돌리기', '큐브 전체를 오른쪽으로 돌리기'],
        D: ['큐브 전체를 오른쪽으로 돌리기', '큐브 전체를 왼쪽으로 돌리기'],
        F: ['큐브 전체를 시계 방향으로 기울이기', '큐브 전체를 반시계 방향으로 기울이기'],
        B: ['큐브 전체를 반시계 방향으로 기울이기', '큐브 전체를 시계 방향으로 기울이기'],
      }[m.f];
      return half ? txt[0] + ' (두 번)' : txt[m.t === 1 ? 0 : 1];
    }
    const base = {
      U: ['윗층을 왼쪽으로', '윗층을 오른쪽으로'],
      D: ['아래층을 오른쪽으로', '아래층을 왼쪽으로'],
      R: ['오른쪽 줄을 위로', '오른쪽 줄을 아래로'],
      L: ['왼쪽 줄을 아래로', '왼쪽 줄을 위로'],
      F: ['앞면을 시계 방향으로', '앞면을 반시계 방향으로'],
      B: ['뒷면을 (앞에서 볼 때) 반시계 방향으로', '뒷면을 (앞에서 볼 때) 시계 방향으로'],
    }[m.f];
    let pre = '';
    if (m.lo === m.hi && m.lo > 1) pre = `바깥에서 ${m.lo}번째 층만 `;
    else if (m.lo === 1 && m.hi > 1) pre = `바깥 ${m.hi}개 층을 함께 `;
    return pre + (half ? base[0] + ' 두 번 (180°)' : base[m.t === 1 ? 0 : 1]);
  }

  function keyHint(m) {
    const N = S.N;
    if (m.lo === 1 && m.hi === N) {
      const map = { R: ['Shift + ↑', 'Shift + ↓'], L: ['Shift + ↓', 'Shift + ↑'], U: ['Shift + ←', 'Shift + →'], D: ['Shift + →', 'Shift + ←'], F: ['Shift + E', 'Shift + Q'], B: ['Shift + Q', 'Shift + E'] }[m.f];
      return m.t === 2 ? map[0] + ' 두 번' : map[m.t === 1 ? 0 : 1];
    }
    const map = { U: ['W + ←', 'W + →'], D: ['S + →', 'S + ←'], R: ['D + ↑', 'D + ↓'], L: ['A + ↓', 'A + ↑'], F: ['E', 'Q'], B: ['Z', 'C'] }[m.f];
    let base = m.t === 2 ? map[0] + ' 두 번' : map[m.t === 1 ? 0 : 1];
    if (m.lo === m.hi && m.lo > 1) base = `숫자 ${m.lo} 누른 뒤 ` + base;
    else if (m.lo === 1 && m.hi > 1) base = (m.hi > 2 ? `숫자 ${m.hi} 누른 뒤 ` : '') + 'Shift + ' + base;
    return base;
  }
  function kbdHtml(hint) {
    return hint.split(' ').map((p) => (['+', '두', '번', '누른', '뒤', '숫자'].includes(p) ? p : `<kbd>${p}</kbd>`)).join(' ');
  }

  // ---------------- 스터디 ----------------
  function studyCompute(reason) {
    const st = S.study;
    if (S.mode !== 'study') return;
    const a = Tutor.analyze(S.N, S.cube.state, { preferFront: viewFront(), assign2: st.assign2 });
    st.a = a;
    st.assign2 = a.assign2;
    st.steps = [];
    st.map = new Map();
    st.pointer = 0;
    st.dev = [];
    if (a.supported && !a.solved && a.segments.length) {
      a.segments.forEach((seg, si) => seg.moves.forEach((tok, mi) => {
        st.steps.push({ si, mi, tok, abs: relToAbs(parseMove(tok, S.N), a.front) });
      }));
      let s = S.cube.state;
      st.map.set(Cube.stateKey(s), { p: 0 });
      st.steps.forEach((step, i) => {
        if (step.abs.t === 2) {
          for (const t of [1, -1]) {
            const q = Object.assign({}, step.abs, { t });
            st.map.set(Cube.stateKey(S.cube.applyTo(s, q)), { p: i + 0.5, rest: q });
          }
        }
        s = S.cube.applyTo(s, step.abs);
        if (!st.map.has(Cube.stateKey(s))) st.map.set(Cube.stateKey(s), { p: i + 1 });
      });
      if (viewFront() !== a.front) alignTo(a.front);
    }
    if (reason) toast(reason);
    renderStudy();
    updateHighlight();
  }

  function studyTrack(move) {
    const st = S.study;
    if (!st.a || !st.a.supported) return;
    if (st.a.solved || !st.steps.length) { studyCompute(); return; }
    const hit = st.map.get(Cube.stateKey(S.cube.state));
    if (hit) {
      st.pointer = hit.p;
      st.dev = [];
      if (st.pointer >= st.steps.length) {
        const prev = st.a.stage && st.a.stage.key;
        studyCompute();
        const now = st.a && st.a.stage && st.a.stage.key;
        if (st.a && st.a.solved) return;
        if (prev !== now) toast(`좋아요! 다음 단계: ${st.a.stage.name}`);
      }
      return;
    }
    if (st.a.fragile && st.dev.length < 6) {
      const top = st.dev[st.dev.length - 1];
      if (top && sameMove(move, invert(top))) st.dev.pop();
      else st.dev.push(move);
      return;
    }
    studyCompute('계획과 다른 동작이라 현재 상태를 다시 분석했습니다.');
  }

  /** 다음에 할 절대 이동 */
  function studyNextMove() {
    const st = S.study;
    if (!st.a || !st.a.supported || st.a.solved) return null;
    if (st.dev.length) return invert(st.dev[st.dev.length - 1]);
    const i = Math.floor(st.pointer);
    if (i >= st.steps.length) return null;
    const hit = st.map.get(Cube.stateKey(S.cube.state));
    if (hit && hit.rest) return hit.rest;
    return st.steps[i].abs;
  }

  function studyAutoOne() {
    if (S.mode !== 'study' || S.anim || S.queue.length) return;
    const m = studyNextMove();
    if (m) { hideBanner(); enqueue(m, 'auto'); }
  }
  function studyAutoSegment() {
    if (S.mode !== 'study' || S.anim || S.queue.length) return;
    const st = S.study;
    if (st.dev.length) { for (let i = st.dev.length - 1; i >= 0; i--) enqueue(invert(st.dev[i]), 'auto'); return; }
    const m = studyNextMove();
    if (!m) return;
    hideBanner();
    let i = Math.floor(st.pointer);
    const si = st.steps[i].si;
    enqueue(m, 'auto');
    for (i = i + 1; i < st.steps.length && st.steps[i].si === si; i++) enqueue(st.steps[i].abs, 'auto');
  }

  function swatch(c) { return `<span class="swatch" style="background:${CSS_COLOR[c]}"></span>`; }

  function renderStudy() {
    const box = $('study');
    box.hidden = S.mode !== 'study';
    if (S.mode !== 'study') return;
    const body = $('studyBody');
    const st = S.study;
    const a = st.a;
    if (busyScrambling()) { body.innerHTML = '<p class="goal">섞는 중…</p>'; return; }
    if (!a) { body.innerHTML = '<p class="goal">분석 중…</p>'; return; }
    if (!a.supported) {
      body.innerHTML = `<h2 class="block-title">스터디</h2>
        <p class="goal">${S.N}×${S.N} 스터디 안내는 아직 없습니다. 지금은 <b>2×2</b>와 <b>3×3</b>의 초보자 층별 공식법을 단계별로 안내합니다.</p>
        <p class="goal">큰 큐브는 센터를 모으고 엣지를 짝지어 3×3처럼 만든 뒤(리덕션) 3×3 방법으로 맞춥니다. 이 화면에서는 혼자 돌려 보며 연습할 수 있습니다.</p>
        <div class="study-actions"><button class="btn btn-small" type="button" data-n="3">3×3로 바꾸기</button><button class="btn btn-small" type="button" data-n="2">2×2로 바꾸기</button></div>`;
      body.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => setPuzzle(Number(b.dataset.n))));
      return;
    }
    const stagesHtml = `<ol class="stages">${a.stages.map((s, i) => `<li class="${s.done ? 'done' : ''} ${s.current ? 'current' : ''}"><span class="dot">${s.done ? '✓' : i + 1}</span><span>${s.name}</span></li>`).join('')}</ol>`;
    if (a.solved) {
      body.innerHTML = `<h2 class="block-title">스터디 · 진행 단계</h2>${stagesHtml}
        <p class="goal">${S.cube.isSolved() ? '큐브가 완성된 상태입니다. <b>섞기</b>를 누르면 처음 단계부터 안내합니다.' : ''}</p>`;
      return;
    }
    if (!a.segments.length) {
      body.innerHTML = `<h2 class="block-title">스터디</h2>${stagesHtml}<p class="goal">이 상태에서 다음 공식을 찾지 못했습니다. <b>초기화</b> 후 다시 섞어 주세요.</p>`;
      return;
    }
    const vf = viewFront();
    const cc = a.centers;
    const holdOk = vf === a.front;
    const frontColor = cc[a.front];
    const hold = `<div class="hold ${holdOk ? '' : 'mismatch'}">
        <span>${swatch(frontColor)} <b>${COLOR_NAMES[frontColor]}</b> 면을 정면, ${swatch(cc.U)} ${COLOR_NAMES[cc.U]} 위 ${holdOk ? '· 맞게 보고 있어요' : '· <b>시점이 다릅니다</b>'}</span>
        ${holdOk ? '' : '<button class="btn btn-small" type="button" id="btnAlign">시점 맞추기</button>'}
      </div>`;

    const cur = Math.floor(st.pointer);
    const isHalf = st.pointer % 1 !== 0;
    const curSeg = cur < st.steps.length ? st.steps[cur].si : a.segments.length;
    const segsHtml = a.segments.map((seg, si) => {
      const cls = si < curSeg ? 'past' : si === curSeg ? 'active' : '';
      let idx = st.steps.findIndex((x) => x.si === si);
      const unitLen = seg.unit ? seg.unit.split(' ').length : 0;
      const chips = seg.moves.map((tok, mi) => {
        const gi = idx + mi;
        const c = gi < cur ? 'done' : gi === cur ? (isHalf ? 'half' : 'now') : '';
        const sep = unitLen && mi > 0 && mi % unitLen === 0 ? '<span class="mv-sep"></span>' : '';
        return `${sep}<span class="mv ${c}">${tok}</span>`;
      }).join('');
      return `<div class="seg-card ${cls}">
          <h3>${seg.title}</h3>
          <div class="moves">${chips}</div>
          ${si === curSeg ? `<p>${seg.desc}</p>${seg.focus ? `<p class="focus">${seg.focus}</p>` : ''}` : ''}
        </div>`;
    }).join('');

    let nextHtml = '';
    const nm = studyNextMove();
    if (nm) {
      const rel = absToRel(nm, vf);
      const undoing = st.dev.length > 0;
      nextHtml = `<div class="next ${undoing ? 'undo' : ''}">
          <span class="big">${formatMove(rel, S.N)}</span>
          <span class="what">${undoing ? '계획과 다르게 돌렸어요. 되돌리기: ' : ''}${moveSentence(rel)}${isHalf && !undoing ? ' (한 번 더)' : ''}</span>
          <span class="how">${kbdHtml(keyHint(rel))}</span>
        </div>`;
    }

    body.innerHTML = `<h2 class="block-title">스터디 · ${a.stage.index + 1}단계 / ${a.stages.length}</h2>
      ${stagesHtml}
      <div><h3 style="margin:4px 0 2px;font-size:16px">${a.stage.name}</h3><p class="goal">${a.stage.goal}</p>${S.N === 2 ? '<p class="note">2×2는 센터가 없어서, 아래 흰색 코너를 기준으로 각 면의 목표 색을 정합니다.</p>' : ''}</div>
      ${hold}
      ${nextHtml}
      ${segsHtml}
      <div class="study-actions">
        <button class="btn btn-small" type="button" id="btnNext">한 수 자동 <kbd>Space</kbd></button>
        <button class="btn btn-small" type="button" id="btnSeg">이 공식 자동 <kbd>Enter</kbd></button>
        <button class="btn btn-small" type="button" id="btnReanalyze">다시 분석</button>
      </div>
      <p class="note">공식 칩은 위에 적힌 면을 정면으로 들었을 때 기준입니다. 노란 칸 아래의 키 안내는 지금 보는 방향 기준이라 그대로 누르면 됩니다.</p>`;
    const ba = $('btnAlign'); if (ba) ba.addEventListener('click', () => { alignTo(a.front); renderStudy(); });
    $('btnNext').addEventListener('click', studyAutoOne);
    $('btnSeg').addEventListener('click', studyAutoSegment);
    $('btnReanalyze').addEventListener('click', () => studyCompute('현재 상태를 다시 분석했습니다.'));
  }

  // 다음 동작이 돌릴 층을 깜빡여 표시
  let highlightSlots = new Set();
  function updateHighlight() {
    highlightSlots = new Set();
    if (S.mode === 'study' && !busyScrambling()) {
      const m = studyNextMove();
      if (m && !(m.lo === 1 && m.hi === S.N)) S.cube.affectedSlots(m).forEach((i) => highlightSlots.add(i));
    }
    stickers.forEach((s, i) => { if (!highlightSlots.has(i)) s.material.emissive.setHex(0x000000); });
  }
  function pulseHighlight(now) {
    if (!highlightSlots.size || S.anim) return;
    const v = 0.1 + 0.16 * (0.5 + 0.5 * Math.sin(now / 170));
    const col = new THREE.Color(v, v * 0.85, v * 0.35);
    highlightSlots.forEach((i) => stickers[i].material.emissive.copy(col));
  }

  // ---------------- HUD ----------------
  function updateHud() {
    const f = viewFront();
    let html = `정면 <b>${f}</b>`;
    if (S.N % 2 === 1) {
      const sl = S.cube.slotsByFace[f][Math.floor(S.cube.slotsByFace[f].length / 2)];
      const c = S.cube.state[sl];
      html = `${swatch(c)} 정면: ${COLOR_NAMES[c]} (F)`;
    } else if (S.mode === 'study' && S.study.a && S.study.a.centers) {
      const c = S.study.a.centers[f];
      html = `${swatch(c)} 정면: ${COLOR_NAMES[c]} 기준 (F)`;
    }
    $('hudFront').innerHTML = html;
    const d = $('hudDepth');
    if (S.pendingDepth > 1) { d.hidden = false; d.textContent = `다음 이동: 바깥에서 ${S.pendingDepth}번째 층`; }
    else d.hidden = true;
  }
  let lastFront = null;

  // ---------------- 키보드 ----------------
  function relMove(f, t, opts = {}) {
    const N = S.N;
    let lo = 1, hi = 1;
    if (opts.all) { lo = 1; hi = N; }
    else if (opts.wide) { lo = 1; hi = Math.max(2, Math.min(S.pendingDepth || 2, Math.ceil(N / 2))); if (N === 2) hi = 1; }
    else if (S.pendingDepth > 1) { lo = hi = S.pendingDepth; }
    S.pendingDepth = 0;
    updateHud();
    return relToAbs({ f, lo, hi, t }, viewFront());
  }

  const ARROWS = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' };
  function onKeyDown(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      return;
    }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['w', 'a', 's', 'd'].includes(k)) {
      e.preventDefault();
      S.held = S.held.filter((x) => x !== k); S.held.push(k);
      return;
    }
    if (ARROWS[k]) {
      e.preventDefault();
      if (e.repeat) return;
      const dir = ARROWS[k];
      const mod = S.held[S.held.length - 1];
      if (mod) {
        const table = {
          w: { L: ['U', 1], R: ['U', -1] },
          s: { L: ['D', -1], R: ['D', 1] },
          a: { U: ['L', -1], D: ['L', 1] },
          d: { U: ['R', 1], D: ['R', -1] },
        }[mod][dir];
        if (table) userMove(relMove(table[0], table[1], { wide: e.shiftKey }));
        return;
      }
      if (e.shiftKey) {
        const rt = { U: ['R', 1], D: ['R', -1], L: ['U', 1], R: ['U', -1] }[dir];
        userMove(relMove(rt[0], rt[1], { all: true }));
        return;
      }
      if (dir === 'L') view.tTheta += Math.PI / 2;
      else if (dir === 'R') view.tTheta -= Math.PI / 2;
      else if (dir === 'U') view.tPhi = 0.52;
      else view.tPhi = -0.52;
      return;
    }
    if (e.repeat) return;
    const fb = { e: ['F', 1], q: ['F', -1], z: ['B', 1], c: ['B', -1] }[k];
    if (fb) {
      e.preventDefault();
      if (e.shiftKey && (k === 'e' || k === 'q')) userMove(relMove('F', fb[1], { all: true }));
      else if (!e.shiftKey) userMove(relMove(fb[0], fb[1]));
      return;
    }
    if (/^[1-9]$/.test(k)) {
      const d = Number(k);
      const max = Math.ceil(S.N / 2);
      if (d <= max) { S.pendingDepth = d === 1 ? 0 : d; updateHud(); }
      else toast(`${S.N}×${S.N}에서는 ${max}번째 층까지 고를 수 있습니다.`);
      return;
    }
    if (k === ' ') { e.preventDefault(); studyAutoOne(); return; }
    if (k === 'Enter') { e.preventDefault(); studyAutoSegment(); return; }
    if (k === 'Backspace') { e.preventDefault(); undo(); return; }
    if (k === 'Escape') { S.pendingDepth = 0; updateHud(); }
  }
  function onKeyUp(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    S.held = S.held.filter((x) => x !== k);
    if (e.key === 'Shift') return;
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { S.held = []; });

  // ---------------- 마우스 / 터치 ----------------
  const ray = new THREE.Raycaster();
  let drag = null;
  function ndc(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  }
  renderer.domElement.addEventListener('pointerdown', (ev) => {
    stageEl.focus({ preventScroll: true });
    renderer.domElement.setPointerCapture(ev.pointerId);
    ray.setFromCamera(ndc(ev), camera);
    const hits = ray.intersectObjects(stickers, false);
    if (hits.length && !busyScrambling()) {
      drag = { type: 'turn', slot: hits[0].object.userData.slot, point: hits[0].point.clone(), x: ev.clientX, y: ev.clientY, done: false };
    } else {
      drag = { type: 'orbit', x: ev.clientX, y: ev.clientY, theta: view.tTheta, phi: view.tPhi };
      stageEl.classList.add('dragging');
    }
  });
  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (drag.type === 'orbit') {
      view.tTheta = drag.theta - dx * 0.008;
      view.tPhi = Math.max(-1.25, Math.min(1.25, drag.phi + dy * 0.008));
      view.theta = view.tTheta; view.phi = view.tPhi;
      return;
    }
    if (drag.done || Math.hypot(dx, dy) < 12) return;
    drag.done = true;
    const m = moveFromDrag(drag.slot, drag.point, dx, dy);
    if (m) userMove(m);
  });
  function endDrag() { drag = null; stageEl.classList.remove('dragging'); }
  renderer.domElement.addEventListener('pointerup', endDrag);
  renderer.domElement.addEventListener('pointercancel', endDrag);

  function moveFromDrag(slot, point, dx, dy) {
    const sl = S.cube.slots[slot];
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    const len = Math.hypot(dx, dy);
    const dv = [dx / len, dy / len];
    let best = null;
    for (let a = 0; a < 3; a++) {
      if (sl.n[a] !== 0) continue;
      const axis = new THREE.Vector3(a === 0 ? 1 : 0, a === 1 ? 1 : 0, a === 2 ? 1 : 0);
      const tan = new THREE.Vector3().crossVectors(axis, point).normalize();
      const p0 = point.clone().project(camera);
      const p1 = point.clone().add(tan.multiplyScalar(0.4)).project(camera);
      let sx = (p1.x - p0.x) * w / 2, sy = -(p1.y - p0.y) * h / 2;
      const sl2 = Math.hypot(sx, sy) || 1; sx /= sl2; sy /= sl2;
      const dot = sx * dv[0] + sy * dv[1];
      if (!best || Math.abs(dot) > Math.abs(best.dot)) best = { a, dot };
    }
    if (!best || Math.abs(best.dot) < 0.35) return null;
    const q = best.dot > 0 ? 1 : -1;
    const c = sl.p[best.a];
    const pos = ['R', 'U', 'F'][best.a], neg = ['L', 'D', 'B'][best.a];
    const f = c > 0 ? pos : neg;
    const depth = (S.N - 1 - Math.abs(c)) / 2 + 1;
    return { f, lo: depth, hi: depth, t: q * FACE[f].cw };
  }

  // ---------------- 화면 버튼 ----------------
  function buildPad() {
    const pad = $('pad');
    const items = [['U', 1], ['U', -1], ['D', 1], ['D', -1], ['R', 1], ['R', -1], ['L', 1], ['L', -1], ['F', 1], ['F', -1], ['B', 1], ['B', -1], ['x', 0], ['y', 0], ["y'", 0], ['↶', 0]];
    pad.innerHTML = '';
    items.forEach(([f, t]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t === 0 ? f : f + (t === -1 ? "'" : '');
      b.title = t === 0 ? (f === '↶' ? '되돌리기' : '큐브 전체 회전') : '보는 방향 기준 ' + b.textContent;
      b.addEventListener('click', () => {
        if (f === '↶') return undo();
        if (f === 'x') return userMove(relMove('R', 1, { all: true }));
        if (f === 'y') return userMove(relMove('U', 1, { all: true }));
        if (f === "y'") return userMove(relMove('U', -1, { all: true }));
        userMove(relMove(f, t));
      });
      pad.appendChild(b);
    });
  }

  function buildPuzzles() {
    const box = $('puzzles');
    box.innerHTML = '';
    PUZZLES.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn';
      b.setAttribute('role', 'radio');
      b.dataset.n = p.N;
      b.innerHTML = `${p.name}<small>${p.sub}${p.N <= 3 ? ' · 스터디' : ''}</small>`;
      b.addEventListener('click', () => setPuzzle(p.N));
      box.appendChild(b);
    });
  }
  function syncButtons() {
    document.querySelectorAll('#puzzles .seg-btn').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.n) === S.N)));
    $('modeFree').setAttribute('aria-checked', String(S.mode === 'free'));
    $('modeStudy').setAttribute('aria-checked', String(S.mode === 'study'));
  }

  function setPuzzle(N) {
    S.queue = [];
    if (S.anim) { cubeGroup.remove(S.anim.pivot); S.anim = null; }
    S.N = N;
    S.cube = new Cube(N);
    S.study.assign2 = null;
    buildMeshes();
    resetStats();
    hideBanner();
    showBest();
    syncButtons();
    if (S.mode === 'study') studyCompute(); else renderStudy();
    updateHud();
    updateHighlight();
  }
  function setMode(mode) {
    S.mode = mode;
    syncButtons();
    if (mode === 'study') studyCompute();
    else { S.study.a = null; renderStudy(); }
    updateHighlight();
    updateHud();
  }

  $('modeFree').addEventListener('click', () => setMode('free'));
  $('modeStudy').addEventListener('click', () => setMode('study'));
  $('btnScramble').addEventListener('click', scramble);
  $('btnReset').addEventListener('click', resetCube);
  $('btnUndo').addEventListener('click', undo);
  $('bannerBtn').addEventListener('click', scramble);
  // 버튼을 누른 뒤 Space/Enter가 버튼을 다시 누르지 않도록 포커스를 큐브 화면으로 돌림
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b && e.detail > 0) stageEl.focus({ preventScroll: true }); });

  // ---------------- 루프 ----------------
  function frame(now) {
    tickAnim(now);
    updateCamera();
    pulseHighlight(now);
    const f = viewFront();
    if (f !== lastFront) {
      lastFront = f;
      updateHud();
      if (S.mode === 'study') { renderStudy(); }
    }
    if (S.timer.running) $('timer').textContent = fmtTime(now - S.timer.start);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  buildPuzzles();
  buildPad();
  setPuzzle(3);
  resize();
  requestAnimationFrame(frame);

  // 첫 화면: 3×3 스터디 모드를 섞인 상태로 보여 줌 (사용자가 바로 따라 할 수 있게)
  setMode('study');
  scramble();

  window.__cubeApp = { S, viewFront, studyNextMove };
})();
