/*
 * tutor.js — 스터디 모드 엔진 (2×2, 3×3 초보자 층별 공식법)
 *
 * 방식: 각 단계마다 "공식 후보"(윗면 맞추기 U + 잡는 방향 + 공식)를 실제로 시뮬레이션해 보고,
 *       이미 맞춘 조각을 깨지 않으면서 진행도가 가장 많이 오르는 것을 고릅니다.
 *       따라서 화면에 제시되는 공식은 현재 상태에서 실제로 효과가 있음이 계산으로 확인된 것입니다.
 *
 * 3×3 단계 (흰색 아래, 노란색 위):
 *   0 방향 잡기 → 1 흰색 십자 → 2 흰색 코너 → 3 2층 엣지 → 4 노란 십자
 *   → 5 노란 엣지 위치 → 6 노란 코너 위치 → 7 노란 코너 방향(완성)
 * 2×2: 1 흰색 면 → 2 노란 코너 위치 → 3 노란 코너 방향(완성)
 */
(function (root) {
  'use strict';
  const Lib = root.CubeLib || require('./cube.js');
  const { Cube, SIDES, COLOR_NAMES, SOLVED_COLOR, parseAlg, relToAbs } = Lib;

  const C3 = new Cube(3);
  const NV = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
  const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];

  function vsum(faces) {
    const p = [0, 0, 0];
    for (const f of faces) for (let i = 0; i < 3; i++) p[i] += NV[f][i];
    return p;
  }
  function slot3(p, f) { return C3.idx(p.map((v) => v * 2), NV[f]); }
  const CENTER = {};
  for (const f of FACES) CENTER[f] = slot3(NV[f], f);

  function mkPiece(name) {
    const faces = name.split('');
    const p = vsum(faces);
    return { name, faces, slots: faces.map((f) => slot3(p, f)) };
  }
  const P = {};
  ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL',
    'UFR', 'URB', 'UBL', 'ULF', 'DFR', 'DRB', 'DBL', 'DLF'].forEach((n) => { P[n] = mkPiece(n); });
  const EDGES = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'].map((n) => P[n]);
  const CORNERS = ['UFR', 'URB', 'UBL', 'ULF', 'DFR', 'DRB', 'DBL', 'DLF'].map((n) => P[n]);
  const D_EDGES = ['DF', 'DR', 'DB', 'DL'].map((n) => P[n]);
  const D_CORNERS = ['DFR', 'DRB', 'DBL', 'DLF'].map((n) => P[n]);
  const MID_EDGES = ['FR', 'FL', 'BR', 'BL'].map((n) => P[n]);
  const U_EDGES = ['UF', 'UR', 'UB', 'UL'].map((n) => P[n]);
  const U_CORNERS = ['UFR', 'URB', 'UBL', 'ULF'].map((n) => P[n]);

  function findCornerByFaces(fs) {
    const k = fs.slice().sort().join('');
    return CORNERS.find((c) => c.faces.slice().sort().join('') === k);
  }

  // ---------- 상태 질의 ----------
  function centers(S) { const cc = {}; for (const f of FACES) cc[f] = S[CENTER[f]]; return cc; }
  function solvedPiece(S, cc, pc) { for (let i = 0; i < pc.faces.length; i++) if (S[pc.slots[i]] !== cc[pc.faces[i]]) return false; return true; }
  function colorKey(arr) { return arr.slice().sort().join(','); }
  function homeKey(cc, pc) { return colorKey(pc.faces.map((f) => cc[f])); }
  function pieceKeyAt(S, pc) { return colorKey(pc.slots.map((s) => S[s])); }
  /** 목표 조각(pc의 자리에 와야 할 조각)이 현재 어디 있는지 */
  function locate(S, cc, pc) {
    const k = homeKey(cc, pc);
    const list = pc.faces.length === 2 ? EDGES : CORNERS;
    return list.find((q) => pieceKeyAt(S, q) === k);
  }
  function inPlace(S, cc, pc) { return pieceKeyAt(S, pc) === homeKey(cc, pc); }
  function conds(pieces) { const out = []; for (const pc of pieces) pc.slots.forEach((s, i) => out.push([s, pc.faces[i]])); return out; }
  function keepOK(S, cc, cs) { for (const [s, f] of cs) if (S[s] !== cc[f]) return false; return true; }
  function count(arr, fn) { let n = 0; for (const x of arr) if (fn(x)) n++; return n; }

  function colorName(c) { return COLOR_NAMES[c]; }
  function pieceLabel(cc, pc) {
    return pc.faces.map((f) => colorName(cc[f])).join('-') + (pc.faces.length === 2 ? ' 엣지' : ' 코너');
  }

  const algCache = new Map();
  function absMoves(alg, front) {
    const k = alg + '@' + front;
    let r = algCache.get(k);
    if (!r) { r = parseAlg(alg, 3).map((m) => relToAbs(m, front)); algCache.set(k, r); }
    return r;
  }
  function run(S, alg, front) { return alg ? C3.applyAll(S, absMoves(alg, front)) : S; }
  function repeat(alg, k) { return Array(k).fill(alg).join(' '); }
  function tokens(alg) { return alg.split(/\s+/).filter(Boolean); }

  const AUF = ['', 'U', "U'", 'U2'];

  // ---------- 단계 정의 ----------
  const SEXY = "R U R' U'";
  const STAGES = {
    orient: {
      name: '큐브 방향 잡기',
      goal: '흰색 센터가 아래(D), 노란색 센터가 위(U)로 오게 큐브 전체를 돌립니다.',
    },
    cross: {
      name: '흰색 십자',
      goal: '아랫면에 흰색 십자를 만들되, 각 엣지의 옆 색이 옆면 센터 색과 같아야 합니다.',
      targets: D_EDGES,
      done: (S, cc) => D_EDGES.every((p) => solvedPiece(S, cc, p)),
      keep: (S, cc) => conds(D_EDGES.filter((p) => solvedPiece(S, cc, p))),
      score(S, cc) {
        let solved = 0, sec = 0;
        for (const t of D_EDGES) {
          if (solvedPiece(S, cc, t)) { solved++; continue; }
          const at = locate(S, cc, t);
          const ui = at.faces.indexOf('U');
          if (ui >= 0) sec += S[at.slots[ui]] === cc.D ? 3 : 2;
          else if (at.faces.indexOf('D') < 0) sec += 1;
        }
        return solved * 100 + sec;
      },
      adj: true,
      cands: [
        { alg: 'F2', title: '흰색이 위를 보는 엣지 내리기', desc: '엣지를 같은 색 센터 바로 위(앞-위)에 두고 앞면을 180° 돌려 내립니다.' },
        { alg: "U' R' F R", title: '흰색이 옆을 보는 엣지 넣기', desc: '흰색 스티커가 앞을 보는 엣지를 같은 색 센터 위에 두고, 오른쪽 면을 잠깐 비켜 놓았다가 앞면으로 넣습니다. 마지막 R은 비켜 둔 오른쪽 면을 되돌립니다.' },
        { alg: 'F', title: '가운데층 엣지 바로 넣기', desc: '가운데층에 있는 엣지를 앞면 한 번 돌리기로 아래 자리에 끼웁니다.' },
        { alg: "F'", title: '가운데층 엣지 바로 넣기', desc: '가운데층에 있는 엣지를 앞면 반대 방향 한 번으로 아래 자리에 끼웁니다.' },
        { alg: "R U R'", title: '가운데층 엣지 꺼내기', desc: '맞춘 십자를 지키면서 오른쪽-앞 엣지를 윗면으로 올립니다. 위로 올라온 엣지는 다음 단계에서 넣습니다.' },
        { alg: "L' U' L", title: '가운데층 엣지 꺼내기', desc: '맞춘 십자를 지키면서 왼쪽-앞 엣지를 윗면으로 올립니다.' },
      ],
    },
    corners: {
      name: '흰색 코너 (1층 완성)',
      goal: '흰색 코너 4개를 아래 모서리에 넣어 1층을 완성합니다.',
      targets: D_CORNERS,
      done: (S, cc) => D_CORNERS.every((p) => solvedPiece(S, cc, p)),
      keep: (S, cc) => conds(D_EDGES.concat(D_CORNERS.filter((p) => solvedPiece(S, cc, p)))),
      keep2x2: (S, cc) => conds(D_CORNERS.filter((p) => solvedPiece(S, cc, p))),
      score(S, cc) {
        let solved = 0, sec = 0;
        for (const t of D_CORNERS) {
          if (solvedPiece(S, cc, t)) { solved++; continue; }
          const at = locate(S, cc, t);
          if (at.faces.indexOf('U') >= 0) sec += 1;
        }
        return solved * 100 + sec;
      },
      adj: true,
      cands: [1, 2, 3, 4, 5].map((k) => ({
        alg: repeat(SEXY, k), rep: k, unit: SEXY,
        title: k === 1 ? '코너 꺼내기 / 넣기 (R U R\' U\' 1번)' : `R U R' U' ${k}번 반복`,
        desc: '흰색 코너를 넣을 자리(앞-오른쪽-아래) 바로 위에 두고, 코너가 흰색이 아래를 보며 들어갈 때까지 R U R\' U\'를 반복합니다 (최대 5번). 아래 자리에 잘못 들어간 코너도 1번 돌려 윗면으로 꺼낼 수 있습니다.',
      })),
    },
    middle: {
      name: '2층 엣지',
      goal: '노란색이 없는 엣지 4개를 가운데층 자리에 넣습니다.',
      targets: MID_EDGES,
      done: (S, cc) => MID_EDGES.every((p) => solvedPiece(S, cc, p)),
      keep: (S, cc) => conds(D_EDGES.concat(D_CORNERS, MID_EDGES.filter((p) => solvedPiece(S, cc, p)))),
      score(S, cc) {
        let solved = 0, sec = 0;
        for (const t of MID_EDGES) {
          if (solvedPiece(S, cc, t)) { solved++; continue; }
          const at = locate(S, cc, t);
          if (at.faces.indexOf('U') >= 0) sec += 1;
        }
        return solved * 100 + sec;
      },
      adj: true,
      cands: [
        { alg: "U R U' R' U' F' U F", title: '오른쪽으로 넣기', desc: '엣지의 앞쪽 색을 앞면 센터와 맞춰 세로줄(T자)을 만든 뒤, 윗면 색이 오른쪽 센터와 같으면 오른쪽 자리로 넣습니다. 가운데층에 잘못 끼인 엣지를 꺼낼 때도 같은 공식을 씁니다.' },
        { alg: "U' L' U L U F U' F'", title: '왼쪽으로 넣기', desc: '엣지의 앞쪽 색을 앞면 센터와 맞춰 세로줄(T자)을 만든 뒤, 윗면 색이 왼쪽 센터와 같으면 왼쪽 자리로 넣습니다.' },
      ],
    },
    ycross: {
      name: '노란색 십자',
      goal: '윗면에 노란색 십자를 만듭니다 (엣지 위치는 아직 상관없음).',
      done: (S, cc) => U_EDGES.every((p) => S[p.slots[0]] === cc.U),
      keep: (S, cc) => conds(D_EDGES.concat(D_CORNERS, MID_EDGES)),
      score(S, cc) {
        const up = U_EDGES.map((p) => S[p.slots[0]] === cc.U);
        const n = count(up, (x) => x);
        if (n === 4) return 3;
        if (n === 0) return 0;
        return (up[0] && up[2]) || (up[1] && up[3]) ? 2 : 1; // 일자 2, ㄱ자 1
      },
      shape(S, cc) { return ['점', 'ㄱ자', '일자', '십자'][this.score(S, cc)]; },
      adj: false,
      cands: [
        { alg: "F R U R' U' F'", title: '노란 십자 공식', desc: '점 모양이면 아무 방향에서, ㄱ자면 ㄱ이 왼쪽-뒤에 오게, 일자면 가로로 놓고 공식을 합니다.' },
        { alg: "F U R U' R' F'", title: 'ㄱ자 → 십자 바로 가기', desc: 'ㄱ자가 왼쪽-뒤에 오게 들고 이 공식을 하면 바로 십자가 됩니다.' },
      ],
    },
    yedges: {
      name: '노란 엣지 위치',
      goal: '노란 엣지의 옆 색을 옆면 센터와 모두 맞춥니다.',
      done: (S, cc) => U_EDGES.every((p) => solvedPiece(S, cc, p)),
      keep: (S, cc) => conds(D_EDGES.concat(D_CORNERS, MID_EDGES)).concat(U_EDGES.map((p) => [p.slots[0], 'U'])),
      score(S, cc) {
        if (U_EDGES.every((p) => solvedPiece(S, cc, p))) return 100;
        let best = 0, bestState = null;
        for (const a of AUF) {
          const s = run(S, a, 'F');
          const m = count(U_EDGES, (p) => solvedPiece(s, cc, p));
          if (m > best) { best = m; bestState = s; }
        }
        if (best === 4) return 10;
        if (best === 2) {
          const ok = U_EDGES.map((p) => solvedPiece(bestState, cc, p));
          return (ok[0] && ok[2]) || (ok[1] && ok[3]) ? 2 : 3; // 이웃 2개 3, 마주보는 2개 2
        }
        return 1;
      },
      adj: true,
      cands: [
        { alg: "R U R' U R U2 R'", title: '엣지 교환 공식 (수네)', desc: '윗면을 돌려 맞는 엣지 두 개가 이웃하면 그 둘을 뒤와 오른쪽에 두고 공식을 합니다. 마주 보는 두 개만 맞으면 한 번 하고 다시 봅니다.' },
        { alg: '', title: '윗면 맞추기', desc: '윗면만 돌리면 엣지 옆 색이 모두 맞습니다.' },
      ],
    },
    ycornerpos: {
      name: '노란 코너 위치',
      goal: '노란 코너를 제자리(색 조합이 맞는 모서리)로 옮깁니다. 방향은 아직 상관없습니다.',
      done: (S, cc) => U_CORNERS.every((p) => inPlace(S, cc, p)),
      keep: (S, cc) => conds(D_EDGES.concat(D_CORNERS, MID_EDGES, U_EDGES)),
      score: (S, cc) => count(U_CORNERS, (p) => inPlace(S, cc, p)),
      adj: true,
      cands: [1, 2].map((k) => ({
        alg: repeat("U R U' L' U R' U' L", k), rep: k, unit: "U R U' L' U R' U' L",
        title: k === 1 ? '코너 3개 돌리기' : '코너 3개 돌리기 ×2',
        desc: '제자리에 있는 코너(방향은 무관)를 앞-오른쪽-위에 두고 공식을 하면 나머지 세 코너가 돌아갑니다. 제자리 코너가 없으면 아무 방향에서 한 번 하면 생깁니다.',
      })),
    },
    ycornerpos2: { // 2×2 전용 (엣지·센터가 없으므로 윗면 회전 여유 허용)
      name: '노란 코너 위치',
      goal: '윗면을 돌렸을 때 노란 코너 4개가 모두 색 조합이 맞는 자리에 오게 합니다.',
      done(S, cc) { return AUF.some((a) => { const s = run(S, a, 'F'); return U_CORNERS.every((p) => inPlace(s, cc, p)); }); },
      keep: (S, cc) => conds(D_CORNERS),
      score(S, cc) {
        // 대각선 교환은 3-사이클 한 번으로 풀 수 없으므로, 이웃 교환(한 번에 풀림)보다 낮게 평가
        let b = 0, bs = null;
        for (const a of AUF) {
          const s = run(S, a, 'F');
          const m = count(U_CORNERS, (p) => inPlace(s, cc, p));
          if (m > b) { b = m; bs = s; }
        }
        if (b === 4) return 10;
        if (b === 2) {
          const ok = U_CORNERS.map((p) => inPlace(bs, cc, p));
          return (ok[0] && ok[2]) || (ok[1] && ok[3]) ? 2 : 3;
        }
        return b;
      },
      adj: true,
      cands: [1, 2].map((k) => ({
        alg: repeat("U R U' L' U R' U' L", k), rep: k, unit: "U R U' L' U R' U' L",
        title: k === 1 ? '코너 3개 돌리기' : '코너 3개 돌리기 ×2',
        desc: '제자리에 있는 코너를 앞-오른쪽-위에 두고 공식을 하면 나머지 세 코너가 돌아갑니다.',
      })),
    },
    ycornerori: {
      name: '노란 코너 방향 (완성)',
      goal: '앞-오른쪽-위 코너의 노란색이 위를 볼 때까지 R\' D\' R D 를 반복하고, 윗면(U)만 돌려 다음 코너를 가져옵니다.',
    },
  };

  const ORDER3 = ['orient', 'cross', 'corners', 'middle', 'ycross', 'yedges', 'ycornerpos', 'ycornerori'];
  const ORDER2 = ['corners', 'ycornerpos2', 'ycornerori'];

  // ---------- 2×2 → 3×3 임베딩 ----------
  const SIDE_COLORS = [SOLVED_COLOR.F, SOLVED_COLOR.R, SOLVED_COLOR.B, SOLVED_COLOR.L];
  function assignment(k) {
    const cc = { U: SOLVED_COLOR.U, D: SOLVED_COLOR.D };
    SIDES.forEach((f, i) => { cc[f] = SIDE_COLORS[(i + k) % 4]; });
    return cc;
  }
  const C2 = new Cube(2);
  function embed2(S2, cc) {
    const S = new Uint8Array(C3.slots.length).fill(6);
    C3.slots.forEach((sl, i) => {
      const isCorner = sl.p.every((v) => Math.abs(v) === 2);
      if (isCorner) S[i] = S2[C2.idx(sl.p.map((v) => v / 2), sl.n)];
    });
    for (const f of FACES) S[CENTER[f]] = cc[f];
    return S;
  }
  function chooseAssignment(S2, prevK) {
    let best = -1, bestK = prevK == null ? 0 : prevK;
    const order = [0, 1, 2, 3];
    if (prevK != null) { order.splice(order.indexOf(prevK), 1); order.unshift(prevK); }
    for (const k of order) {
      const cc = assignment(k);
      const S = embed2(S2, cc);
      const sc = count(D_CORNERS, (p) => solvedPiece(S, cc, p)) * 10 + count(D_CORNERS, (p) => {
        const at = locate(S, cc, p); return at.faces.includes('D');
      });
      if (sc > best) { best = sc; bestK = k; }
    }
    return bestK;
  }

  // ---------- 탐색 ----------
  function frontOrder(pref) {
    const i = Math.max(0, SIDES.indexOf(pref));
    return [0, 1, 2, 3].map((k) => SIDES[(i + k) % 4]);
  }

  function greedyStep(S, cc, st, prefFront, is2) {
    const cur = st.score(S, cc);
    const keepFn = is2 && st.keep2x2 ? st.keep2x2 : st.keep;
    const ks = keepFn(S, cc);
    let best = null;
    for (const front of frontOrder(prefFront)) {
      for (const adj of st.adj ? AUF : ['']) {
        const S1 = run(S, adj, front);
        for (const c of st.cands) {
          if (!c.alg && !adj) continue;
          const S2 = run(S1, c.alg, front);
          if (!keepOK(S2, cc, ks)) continue;
          const sc = st.score(S2, cc);
          if (sc <= cur) continue;
          const len = tokens(adj).length + tokens(c.alg).length;
          if (!best || sc > best.sc || (sc === best.sc && len < best.len)) {
            best = { sc, len, front, adj, cand: c, after: S2 };
          }
        }
      }
    }
    return best;
  }

  function describeFocus(stKey, S, after, cc, st) {
    if (!st.targets) return '';
    const newly = st.targets.filter((t) => !solvedPiece(S, cc, t) && solvedPiece(after, cc, t));
    if (newly.length) {
      const t = newly[0];
      const at = locate(S, cc, t);
      let where;
      if (at.faces.includes('U')) where = '윗면';
      else if (at.faces.includes('D')) where = '아래층(잘못된 자리/방향)';
      else where = '가운데층';
      return `목표 조각: ${pieceLabel(cc, t)} — 지금 ${where}에 있습니다.`;
    }
    const moved = st.targets.find((t) => !solvedPiece(S, cc, t) && !locate(S, cc, t).faces.includes('U') && locate(after, cc, t).faces.includes('U'));
    if (moved) return `${pieceLabel(cc, moved)}가 바로 넣을 수 없는 곳에 있어 먼저 윗면으로 꺼냅니다.`;
    return '';
  }

  function sideName(cc, f) { return `${colorName(cc[f])} 면`; }

  function planOrient(S, cc, front) {
    // 노란 코너 방향: R' D' R D 반복 + U 로 다음 코너
    const fi = SIDES.indexOf(front);
    const ufr = findCornerByFaces(['U', SIDES[fi], SIDES[(fi + 1) % 4]]);
    const ufrU = ufr.slots[ufr.faces.indexOf('U')];
    const oriented = (s) => U_CORNERS.every((p) => s[p.slots[p.faces.indexOf('U')]] === cc.U);
    const segs = [];
    let s = S;
    const UNIT = "R' D' R D";
    for (let guard = 0; guard < 8 && !oriented(s); guard++) {
      if (s[ufrU] !== cc.U) {
        const s2 = run(s, repeat(UNIT, 2), front);
        const k = s2[ufrU] === cc.U ? 2 : 4;
        const alg = repeat(UNIT, k);
        segs.push({
          title: `R' D' R D ${k}번 반복`, unit: UNIT, rep: k,
          desc: `앞-오른쪽-위 코너의 노란색이 위를 볼 때까지 반복합니다 (이 코너는 ${k}번). 아래 두 층이 흐트러져 보여도 정상입니다. 큐브를 돌려 잡지 말고 계속하세요.`,
          moves: tokens(alg),
        });
        s = run(s, alg, front);
        if (oriented(s)) break;
      }
      let j = 1;
      for (; j < 4; j++) { const t = run(s, AUF[[0, 1, 3, 2][j]], front); if (t[ufrU] !== cc.U) break; }
      const a = AUF[[0, 1, 3, 2][j]];
      segs.push({ title: '윗면만 돌려 다음 코너 가져오기', desc: '큐브 전체가 아니라 윗면(U)만 돌려, 아직 노란색이 위를 보지 않는 코너를 앞-오른쪽-위로 가져옵니다.', moves: tokens(a) });
      s = run(s, a, front);
    }
    const isSolved = (t) => CORNERS.every((p) => solvedPiece(t, cc, p)) && EDGES.every((p) => p.slots.some((x) => t[x] === 6) || solvedPiece(t, cc, p));
    for (const a of AUF) {
      if (isSolved(run(s, a, front))) {
        if (a) segs.push({ title: '마무리: 윗면 맞추기', desc: '윗면만 돌리면 완성입니다.', moves: tokens(a) });
        return segs;
      }
    }
    return null;
  }

  function stageDone(key, S, cc) {
    if (key === 'orient') return cc.D === SOLVED_COLOR.D;
    if (key === 'ycornerori') {
      return CORNERS.every((p) => solvedPiece(S, cc, p)) && EDGES.every((p) => p.slots.some((x) => S[x] === 6) || solvedPiece(S, cc, p));
    }
    return STAGES[key].done(S, cc);
  }

  /**
   * 현재 상태 분석.
   * @param N 2 또는 3
   * @param state 해당 N 큐브의 상태 배열
   * @param opts { preferFront: 'F'|'R'|'B'|'L', assign2: 이전 2×2 배색 번호 }
   * 반환: { supported, solved, stages:[{key,name,done,current}], stage, segments:[{title,desc,moves}], front, fragile, assign2 }
   */
  function analyze(N, state, opts = {}) {
    if (N !== 2 && N !== 3) return { supported: false };
    const pref = opts.preferFront || 'F';
    let S, cc, order, assign2 = null;
    if (N === 3) {
      S = state; cc = centers(S); order = ORDER3;
    } else {
      assign2 = chooseAssignment(state, opts.assign2);
      cc = assignment(assign2);
      S = embed2(state, cc); order = ORDER2;
    }
    let curIdx = order.length;
    for (let i = 0; i < order.length; i++) { if (!stageDone(order[i], S, cc)) { curIdx = i; break; } }
    const stages = order.map((k, i) => ({ key: k, name: STAGES[k].name, done: i < curIdx, current: i === curIdx }));
    const base = { supported: true, stages, assign2, centers: cc };
    if (curIdx >= order.length) return Object.assign(base, { solved: true, segments: [] });

    const key = order[curIdx];
    const st = STAGES[key];
    const stageInfo = { key, index: curIdx, name: st.name, goal: st.goal };

    if (key === 'orient') {
      // 흰색 센터를 아래로: 회전 후보 중 가장 짧은 것
      const opts2 = ['x', "x'", 'x2', 'z', "z'"];
      for (const r of opts2) {
        const s = run(S, r, pref);
        if (s[CENTER.D] === SOLVED_COLOR.D) {
          return Object.assign(base, {
            stage: stageInfo, front: pref, fragile: false,
            segments: [{ title: '큐브 전체 돌리기', desc: `흰색 센터가 지금 ${faceKo(whereColor(S, SOLVED_COLOR.D))}에 있습니다. 큐브 전체를 돌려 흰색 센터를 아래로 보냅니다.`, moves: tokens(r) }],
          });
        }
      }
    }

    if (key === 'ycornerori') {
      const segs = planOrient(S, cc, pref);
      return Object.assign(base, { stage: stageInfo, front: pref, fragile: true, segments: segs || [] , error: segs ? null : 'plan-failed' });
    }

    const step = greedyStep(S, cc, st, pref, N === 2);
    if (!step) return Object.assign(base, { stage: stageInfo, front: pref, segments: [], error: 'no-step' });

    const segs = [];
    if (step.adj) {
      segs.push({ title: '윗면 돌려 위치 맞추기', desc: '공식을 쓰기 전에 윗면(U)만 돌려 조각을 알맞은 자리 위로 옮깁니다.', moves: tokens(step.adj) });
    }
    if (step.cand.alg) {
      let desc = step.cand.desc;
      const focus = describeFocus(key, run(S, step.adj, step.front), step.after, cc, st);
      if (key === 'ycross') desc = `지금 윗면 모양: ${st.shape(S, cc)}. ` + desc;
      segs.push({ title: step.cand.title, desc, focus, moves: tokens(step.cand.alg), unit: step.cand.unit, rep: step.cand.rep });
    }
    return Object.assign(base, {
      stage: stageInfo, front: step.front, fragile: false, segments: segs,
      holdText: `${sideName(cc, step.front)}을 정면으로, ${colorName(cc.U)} 센터를 위로 잡습니다.`,
    });
  }

  function whereColor(S, color) { return FACES.find((f) => S[CENTER[f]] === color); }
  function faceKo(f) { return { U: '윗면', D: '아랫면', F: '앞면', B: '뒷면', R: '오른쪽 면', L: '왼쪽 면' }[f]; }

  const Tutor = { analyze, STAGES, ORDER3, ORDER2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = Tutor;
  else root.Tutor = Tutor;
})(typeof window !== 'undefined' ? window : globalThis);
