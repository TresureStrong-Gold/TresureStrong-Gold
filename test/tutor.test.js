// 스터디 엔진 검증: 무작위로 섞은 큐브를 엔진이 제시하는 공식만 따라 해서 완성되는지 확인합니다.
// 실행: node test/tutor.test.js [섞기 횟수]
const Lib = require('../js/cube.js');
const Tutor = require('../js/tutor.js');

function seeded(seed) {
  return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function solveWithTutor(N, cube, state, rnd) {
  let s = state, assign2 = null, steps = 0, moves = 0;
  const fronts = Lib.SIDES;
  const stageSeen = [];
  for (let iter = 0; iter < 200; iter++) {
    const pref = fronts[Math.floor(rnd() * 4)]; // 사용자가 아무 쪽에서 보고 있어도 동작해야 함
    const a = Tutor.analyze(N, s, { preferFront: pref, assign2 });
    assign2 = a.assign2;
    if (a.solved) {
      if (!cube.isSolved(s)) throw new Error('엔진은 완성이라 했지만 실제로는 미완성');
      return { steps, moves, stageSeen };
    }
    if (a.error || !a.segments.length) throw new Error(`단계 ${a.stage && a.stage.key}에서 다음 공식을 찾지 못함 (${a.error})`);
    if (!stageSeen.includes(a.stage.key)) stageSeen.push(a.stage.key);
    for (const seg of a.segments) {
      for (const tok of seg.moves) {
        const m = Lib.relToAbs(Lib.parseMove(tok, N), a.front);
        s = cube.applyTo(s, m);
        moves++;
      }
    }
    steps++;
  }
  throw new Error('200번 안에 끝나지 않음');
}

const runs = parseInt(process.argv[2] || '500', 10);
let fail = 0;
for (const N of [3, 2]) {
  const cube = new Lib.Cube(N);
  const rnd = seeded(12345 + N);
  let totalMoves = 0, maxMoves = 0;
  for (let i = 0; i < runs; i++) {
    let s = cube.applyAll(cube.solvedState(), cube.scramble(N === 3 ? 25 : 12, rnd));
    if (N === 3 && i % 5 === 0) s = cube.applyTo(s, Lib.parseMove(['x', "z'", 'x2', 'M', "S'"][i % 5 === 0 ? (i / 5) % 5 : 0], 3)); // 센터가 움직인 경우도 시험
    try {
      const r = solveWithTutor(N, cube, s, rnd);
      totalMoves += r.moves; maxMoves = Math.max(maxMoves, r.moves);
    } catch (e) {
      fail++;
      if (fail < 5) console.log(`N=${N} #${i} 실패:`, e.message);
    }
  }
  console.log(`N=${N}: ${runs}회 중 실패 ${fail}, 평균 ${(totalMoves / runs).toFixed(1)}수, 최대 ${maxMoves}수`);
}

// 이미 완성된 상태
for (const N of [2, 3]) {
  const c = new Lib.Cube(N);
  const a = Tutor.analyze(N, c.solvedState(), {});
  if (!a.solved) { fail++; console.log('완성 상태 인식 실패', N); }
}
// 지원하지 않는 크기
if (Tutor.analyze(4, new Lib.Cube(4).solvedState()).supported !== false) { fail++; console.log('4x4 지원 플래그 오류'); }

if (fail) { console.log('FAIL'); process.exit(1); }
console.log('ALL PASS');
