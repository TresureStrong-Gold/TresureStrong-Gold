/*
 * cube.js — NxN 큐브 논리 모델 (렌더링과 무관)
 *
 * 좌표계: x = 오른쪽(R), y = 위(U), z = 앞(F)
 * 각 조각 위치는 "두 배 정수 좌표"로 표현합니다. N=3 이면 -2, 0, 2 / N=4 이면 -3,-1,1,3.
 * 스티커 슬롯(slot) = (조각 위치 p, 바깥 방향 법선 n). 상태(state)는 슬롯별 색 번호 배열입니다.
 *
 * 이동(move) 객체: { f: 'U'|'D'|'R'|'L'|'F'|'B', lo: 시작 깊이(1=바깥층), hi: 끝 깊이, t: 1|-1|2 }
 *   t=1  → 그 면을 바라봤을 때 시계 방향 90°
 *   t=-1 → 반시계 90°,  t=2 → 180°
 */
(function (root) {
  'use strict';

  const FACE = {
    U: { axis: 1, sign: 1, cw: -1, n: [0, 1, 0] },
    D: { axis: 1, sign: -1, cw: 1, n: [0, -1, 0] },
    R: { axis: 0, sign: 1, cw: -1, n: [1, 0, 0] },
    L: { axis: 0, sign: -1, cw: 1, n: [-1, 0, 0] },
    F: { axis: 2, sign: 1, cw: -1, n: [0, 0, 1] },
    B: { axis: 2, sign: -1, cw: 1, n: [0, 0, -1] },
  };
  const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];

  // 색 번호: 0 흰, 1 노랑, 2 초록, 3 파랑, 4 빨강, 5 주황, 6 없음(내부용)
  const COLOR_NAMES = ['흰색', '노란색', '초록', '파랑', '빨강', '주황', '-'];
  // 완성 상태: 흰색 아래, 노랑 위, 초록 앞, 주황 오른쪽 (흰-위/초록-앞/빨강-오른쪽 표준 배색을 뒤집어 든 모습)
  const SOLVED_COLOR = { U: 1, D: 0, F: 2, B: 3, R: 5, L: 4 };

  const SIDES = ['F', 'R', 'B', 'L']; // 위에서 봤을 때 순서 (y 회전 기준)

  function rot(v, axis, q) {
    q = ((q % 4) + 4) % 4;
    let x = v[0], y = v[1], z = v[2];
    for (let i = 0; i < q; i++) {
      let a, b;
      if (axis === 0) { a = -z; b = y; y = a; z = b; }
      else if (axis === 1) { a = z; b = -x; x = a; z = b; }
      else { a = -y; b = x; x = a; y = b; }
    }
    return [x, y, z];
  }

  class Cube {
    constructor(N) {
      this.N = N;
      const M = N - 1;
      this.coords = [];
      for (let i = 0; i < N; i++) this.coords.push(2 * i - M);
      this.slots = [];
      this.slotIndex = new Map();
      this.slotsByFace = {};
      for (const f of FACES) {
        const info = FACE[f];
        const others = [0, 1, 2].filter((a) => a !== info.axis);
        this.slotsByFace[f] = [];
        for (const a of this.coords) {
          for (const b of this.coords) {
            const p = [0, 0, 0];
            p[info.axis] = info.sign * M;
            p[others[0]] = a;
            p[others[1]] = b;
            const idx = this.slots.length;
            this.slots.push({ p, n: info.n.slice(), face: f });
            this.slotIndex.set(Cube.key(p, info.n), idx);
            this.slotsByFace[f].push(idx);
          }
        }
      }
      this.permCache = new Map();
      this.state = this.solvedState();
    }

    static key(p, n) { return p[0] + ',' + p[1] + ',' + p[2] + '|' + n[0] + ',' + n[1] + ',' + n[2]; }

    idx(p, n) { return this.slotIndex.get(Cube.key(p, n)); }

    solvedState() {
      const s = new Uint8Array(this.slots.length);
      this.slots.forEach((sl, i) => { s[i] = SOLVED_COLOR[sl.face]; });
      return s;
    }

    /** 이동 → (축, 층 좌표 집합, 양의 축 기준 90° 회전 횟수) */
    geometry(m) {
      const info = FACE[m.f];
      const M = this.N - 1;
      const layers = [];
      for (let d = m.lo; d <= m.hi; d++) layers.push(info.sign * (M - 2 * (d - 1)));
      const q = ((m.t * info.cw) % 4 + 4) % 4;
      return { axis: info.axis, layers, q };
    }

    perm(m) {
      const k = m.f + m.lo + ',' + m.hi + ',' + m.t;
      let p = this.permCache.get(k);
      if (p) return p;
      const g = this.geometry(m);
      p = new Int32Array(this.slots.length);
      this.slots.forEach((sl, i) => {
        if (g.layers.includes(sl.p[g.axis])) {
          p[i] = this.idx(rot(sl.p, g.axis, g.q), rot(sl.n, g.axis, g.q));
        } else p[i] = i;
      });
      this.permCache.set(k, p);
      return p;
    }

    /** 상태에 이동 적용한 새 상태 반환 (원본 불변) */
    applyTo(state, m) {
      const p = this.perm(m);
      const out = new Uint8Array(state.length);
      for (let i = 0; i < state.length; i++) out[p[i]] = state[i];
      return out;
    }

    applyAll(state, moves) {
      let s = state;
      for (const m of moves) s = this.applyTo(s, m);
      return s;
    }

    apply(m) { this.state = this.applyTo(this.state, m); }

    /** 이동이 영향을 주는 슬롯 목록 */
    affectedSlots(m) {
      const g = this.geometry(m);
      const out = [];
      this.slots.forEach((sl, i) => { if (g.layers.includes(sl.p[g.axis])) out.push(i); });
      return out;
    }

    /** 모든 면이 한 가지 색이면 완성 (큐브 전체 방향은 상관 없음) */
    isSolved(state = this.state) {
      for (const f of FACES) {
        const arr = this.slotsByFace[f];
        const c = state[arr[0]];
        for (let i = 1; i < arr.length; i++) if (state[arr[i]] !== c) return false;
      }
      return true;
    }

    static stateKey(state) { return String.fromCharCode.apply(null, state); }

    /** 무작위 섞기 */
    scramble(len, rnd = Math.random) {
      const N = this.N;
      const moves = [];
      let lastAxis = -1;
      const maxWide = Math.floor(N / 2);
      while (moves.length < len) {
        const f = FACES[Math.floor(rnd() * 6)];
        const ax = FACE[f].axis;
        if (ax === lastAxis) continue;
        lastAxis = ax;
        const t = [1, -1, 2][Math.floor(rnd() * 3)];
        let hi = 1;
        if (N >= 4) hi = 1 + Math.floor(rnd() * maxWide);
        moves.push({ f, lo: 1, hi, t });
      }
      return moves;
    }
  }

  // ---------------- 표기법 ----------------
  const TOKEN_RE = /^(\d*)([URFDLBurfdlbxyzMES])(w?)(2'|2|'|)$/;

  function parseMove(tok, N) {
    const m = TOKEN_RE.exec(tok.trim());
    if (!m) throw new Error('알 수 없는 표기: ' + tok);
    const num = m[1] ? parseInt(m[1], 10) : 0;
    let letter = m[2];
    const wide = m[3] === 'w';
    const suf = m[4];
    const t = suf === "'" ? -1 : (suf === '2' || suf === "2'") ? 2 : 1;
    const mid = (N + 1) / 2;
    switch (letter) {
      case 'x': return { f: 'R', lo: 1, hi: N, t };
      case 'y': return { f: 'U', lo: 1, hi: N, t };
      case 'z': return { f: 'F', lo: 1, hi: N, t };
      case 'M': return { f: 'L', lo: mid, hi: mid, t };
      case 'E': return { f: 'D', lo: mid, hi: mid, t };
      case 'S': return { f: 'F', lo: mid, hi: mid, t };
    }
    if (letter === letter.toLowerCase()) { // r, u ... = 바깥 두 층
      return { f: letter.toUpperCase(), lo: 1, hi: 2, t };
    }
    if (wide) return { f: letter, lo: 1, hi: num || 2, t };
    if (num > 1) return { f: letter, lo: num, hi: num, t };
    return { f: letter, lo: 1, hi: 1, t };
  }

  function parseAlg(str, N) {
    return str.split(/\s+/).filter(Boolean).map((t) => parseMove(t, N));
  }

  const ROT_NAME = { R: ['x', 1], L: ['x', -1], U: ['y', 1], D: ['y', -1], F: ['z', 1], B: ['z', -1] };
  const SLICE_NAME = { L: ['M', 1], R: ['M', -1], D: ['E', 1], U: ['E', -1], F: ['S', 1], B: ['S', -1] };

  function suffix(t) { return t === 2 ? '2' : t === -1 ? "'" : ''; }

  function formatMove(m, N) {
    if (m.lo === 1 && m.hi === N) {
      const [n, s] = ROT_NAME[m.f];
      const t = m.t === 2 ? 2 : m.t * s;
      return n + suffix(t);
    }
    if (N % 2 === 1 && N >= 3 && m.lo === m.hi && m.lo === (N + 1) / 2 && N === 3) {
      const [n, s] = SLICE_NAME[m.f];
      const t = m.t === 2 ? 2 : m.t * s;
      return n + suffix(t);
    }
    if (m.lo === 1 && m.hi === 1) return m.f + suffix(m.t);
    if (m.lo === 1) return (m.hi > 2 ? m.hi : '') + m.f + 'w' + suffix(m.t);
    if (m.lo === m.hi) return m.lo + m.f + suffix(m.t);
    return m.lo + '-' + m.hi + m.f + suffix(m.t);
  }

  function invert(m) { return { f: m.f, lo: m.lo, hi: m.hi, t: m.t === 2 ? 2 : -m.t }; }

  /** 상대 표기(front 면을 정면으로 들었을 때) → 절대 면 */
  function relToAbs(m, front) {
    const fi = SIDES.indexOf(front);
    const si = SIDES.indexOf(m.f);
    if (si < 0) return Object.assign({}, m);
    return Object.assign({}, m, { f: SIDES[(si + fi) % 4] });
  }
  function absToRel(m, front) {
    const fi = SIDES.indexOf(front);
    const si = SIDES.indexOf(m.f);
    if (si < 0) return Object.assign({}, m);
    return Object.assign({}, m, { f: SIDES[(si - fi + 4) % 4] });
  }

  function sameMove(a, b) { return a.f === b.f && a.lo === b.lo && a.hi === b.hi && a.t === b.t; }

  const CubeLib = {
    Cube, FACE, FACES, SIDES, COLOR_NAMES, SOLVED_COLOR,
    parseMove, parseAlg, formatMove, invert, relToAbs, absToRel, sameMove, rot,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CubeLib;
  else root.CubeLib = CubeLib;
})(typeof window !== 'undefined' ? window : globalThis);
