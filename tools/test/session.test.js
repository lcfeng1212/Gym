// 計次、分組與動作庫的合成資料測試：node --test tools/test/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const docs = path.join(__dirname, '..', '..', 'docs');
function load() {
  const sandbox = { window: {}, performance: { now: () => 0 } };
  vm.createContext(sandbox);
  for (const file of ['library.js', 'lib.js', 'camera.js', 'session.js'])
    vm.runInContext(fs.readFileSync(path.join(docs, file), 'utf8'), sandbox, { filename: file });
  return sandbox.window;
}
const W = load();
const FRAME = 80;

// 側拍人物：只放左側關節（右側同座標但看不清楚），其他關節不可見
function pose(joints, { rightVisible = 0.2, leftVisible = 0.95 } = {}) {
  const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const map = { s: [11, 12], h: [23, 24], k: [25, 26], a: [27, 28], e: [13, 14], w: [15, 16] };
  for (const [key, [left, right]] of Object.entries(map)) {
    const p = joints[key];
    if (!p) continue;
    points[left] = { x: p[0], y: p[1], visibility: leftVisible };
    points[right] = { x: p[0], y: p[1], visibility: rightVisible };
  }
  return points;
}
// 由角度產生端點：從 origin 沿 base 方向轉 deg 度、長度 len
function polar(origin, deg, len) {
  const r = deg * Math.PI / 180;
  return [origin[0] + Math.cos(r) * len, origin[1] + Math.sin(r) * len];
}

function run(sessionOptions, frames) {
  const sets = [], rests = [], reps = [];
  const session = W.GymSession.create({
    ...sessionOptions,
    onSet: set => { sets.push(set); return 'set' + sets.length; },
    onRest: (id, ms) => rests.push([id, ms]),
    onRep: (move, count) => reps.push(count)
  });
  let at = 0;
  for (const points of frames) { session.update(points, at); at += FRAME; }
  // 一定先「結束訓練」再檢查：還沒結束的組也要被檢查到（v8.2 走動誤記曾因此漏測）
  session.finish();
  return { sets, rests, reps, session, at };
}
const hold = (points, n) => Array.from({ length: n }, () => points);
const still = n => hold(rowExtended(), n);

// 坐姿划船：手臂前伸（起始）／拉到腰側（動作端）
const rowExtended = () => pose({ s: [300, 300], h: [300, 500], k: [420, 500], a: [500, 560], e: [380, 320], w: [460, 330] });
const rowBent = () => pose({ s: [300, 300], h: [300, 500], k: [420, 500], a: [500, 560], e: [240, 360], w: [320, 350] });
function rowReps(n) {
  const frames = hold(rowExtended(), 4);
  for (let i = 0; i < n; i++) frames.push(...hold(rowBent(), 4), ...hold(rowExtended(), 4));
  return frames;
}

test('坐姿划船：5 下完整動作記成一組 5 下', () => {
  const { sets, reps } = run({ hint: '滑輪坐姿划船' }, [...rowReps(5), ...still(90)]);
  assert.strictEqual(sets.length, 1);
  assert.strictEqual(sets[0].name, '滑輪坐姿划船');
  assert.strictEqual(sets[0].reps, 5);
  assert.deepStrictEqual(reps, [1, 2, 3, 4, 5]);
});

test('坐姿划船：半程（沒拉到腰側）不計次、不開組', () => {
  const half = pose({ s: [300, 300], h: [300, 500], k: [420, 500], a: [500, 560], e: [330, 340], w: [400, 345] });
  const frames = hold(rowExtended(), 4);
  for (let i = 0; i < 5; i++) frames.push(...hold(half, 4), ...hold(rowExtended(), 4));
  const { sets } = run({ hint: '滑輪坐姿划船' }, [...frames, ...still(90)]);
  assert.strictEqual(sets.length, 0);
});

test('自動辨識：沒選動作也能把划船記成一組', () => {
  const { sets } = run({}, [...rowReps(4), ...still(90)]);
  assert.strictEqual(sets.length, 1);
  assert.strictEqual(sets[0].name, '滑輪坐姿划船');
  assert.strictEqual(sets[0].reps, 4);
});

test('兩組之間停 8 秒（超過預設 6 秒）：分成兩組並記錄休息時間', () => {
  const { sets, rests } = run({ hint: '滑輪坐姿划船' }, [...rowReps(3), ...still(100), ...rowReps(2), ...still(90)]);
  assert.deepStrictEqual(sets.map(s => s.reps), [3, 2]);
  assert.strictEqual(rests.length, 1);
  assert.ok(rests[0][1] > 4000, '休息時間應大於 4 秒，實際 ' + rests[0][1]);
});

test('關節偶爾閃一下看不清楚（約 0.3 秒）：不會把次數歸零', () => {
  const blink = pose({ s: [300, 300], h: [300, 500], k: [420, 500], a: [500, 560], e: [380, 320], w: [460, 330] }, { leftVisible: 0.3, rightVisible: 0.3 });
  const frames = hold(rowExtended(), 4);
  for (let i = 0; i < 5; i++) {
    frames.push(...hold(rowBent(), 4));
    if (i === 2) frames.push(blink, blink, blink);
    frames.push(...hold(rowExtended(), 4));
  }
  const { sets } = run({ hint: '滑輪坐姿划船' }, [...frames, ...still(90)]);
  assert.strictEqual(sets[0]?.reps, 5);
});

test('左右側偵測來回跳動：沿用原本那一側，次數不歸零', () => {
  // 每隔幾格，左側變不清楚、右側變清楚（同座標），舊版會整個重置
  const flip = p => p.map((pt, i) => [11, 13, 15, 23, 25, 27].includes(i) ? { ...pt, visibility: .4 } : [12, 14, 16, 24, 26, 28].includes(i) ? { ...pt, visibility: .95 } : pt);
  const frames = rowReps(5).map((p, i) => i % 7 === 3 ? flip(p) : p);
  const { sets } = run({ hint: '滑輪坐姿划船' }, [...frames, ...still(90)]);
  assert.strictEqual(sets[0]?.reps, 5);
});

// 臀推：從底部（髖彎）開始，推到頂端（髖伸直）再回到底部算一下
function thrust(hipAngle) {
  const h = [300, 420], s = [150, 380];
  const base = Math.atan2(s[1] - h[1], s[0] - h[0]) * 180 / Math.PI;
  const k = polar(h, base - hipAngle, 170);
  return pose({ s, h, k, a: [k[0] + 10, k[1] + 160], e: [160, 330], w: [200, 300] });
}
test('臀推：從底部開始做 6 下，記成 6 下（舊版只算 5 下）', () => {
  const frames = hold(thrust(105), 4);
  for (let i = 0; i < 6; i++) frames.push(...hold(thrust(172), 4), ...hold(thrust(105), 4));
  const angle = W.GymPose.angle(...[11, 23, 25].map(i => thrust(172)[i]));
  assert.ok(angle > 160, '合成頂端角度 ' + angle);
  const { sets } = run({ hint: '機械臀推' }, [...frames, ...hold(thrust(105), 90)]);
  assert.strictEqual(sets[0]?.reps, 6);
});

// 深蹲：站直（膝約 175 度）→ 蹲低（膝約 80 度）
function squat(knee) {
  const a = [300, 700], k = [330, 560];
  const shin = Math.atan2(k[1] - a[1], k[0] - a[0]) * 180 / Math.PI + 180;
  const h = polar(k, shin - knee, 160);
  return pose({ s: [h[0] + (knee < 120 ? 60 : 5), h[1] - 190], h, k, a, e: [h[0] + 20, h[1] - 100], w: [h[0] + 40, h[1] - 20] });
}
test('深蹲：8 下完整深蹲記成 8 下', () => {
  const frames = hold(squat(175), 4);
  for (let i = 0; i < 8; i++) frames.push(...hold(squat(80), 4), ...hold(squat(175), 4));
  const { sets } = run({ hint: '槓鈴深蹲' }, [...frames, ...hold(squat(175), 90)]);
  assert.strictEqual(sets[0]?.reps, 8);
});

test('自動模式：走動、調整器材 6 秒但沒完成任何一下，不會產生紀錄', () => {
  const frames = [];
  for (let i = 0; i < 75; i++) {
    const dx = (i % 10) * 15;
    frames.push(pose({ s: [300 + dx, 300], h: [300 + dx, 500], k: [320 + dx, 640], a: [320 + dx, 780], e: [310 + dx, 400], w: [320 + dx, 480] }));
  }
  const { sets } = run({}, [...frames, ...hold(frames.at(-1), 90)]);
  assert.strictEqual(sets.length, 0);
});

test('只記時間的動作（滑輪臉拉）：持續活動即記一組時間、不計次', () => {
  const frames = [];
  for (let i = 0; i < 100; i++) frames.push(i % 8 < 4 ? rowExtended() : rowBent());
  const { sets } = run({ hint: '滑輪臉拉' }, [...frames, ...still(90)]);
  assert.strictEqual(sets.length, 1);
  assert.strictEqual(sets[0].name, '滑輪臉拉');
  assert.strictEqual(sets[0].reps, null);
});

test('暫停期間不算活動時間', () => {
  const sets = [];
  const session = W.GymSession.create({ hint: '滑輪坐姿划船', onSet: s => { sets.push(s); return 'a'; } });
  let at = 0;
  const feed = list => { for (const p of list) { session.update(p, at); at += FRAME; } };
  feed(rowReps(2));
  session.pause(at); at += 30000; session.resume(at);
  feed(rowReps(2)); feed(still(90)); session.finish();
  assert.strictEqual(sets.length, 1);
  assert.strictEqual(sets[0].reps, 4);
  assert.ok(sets[0].durationMs < 10000, '活動時長不應含 30 秒暫停：' + sets[0].durationMs);
});

test('動作庫：名稱不重複、部位有效、自動辨識動作都可計次', () => {
  const lib = W.GymLibrary;
  const names = new Set();
  for (const item of lib.items) {
    assert.ok(item.name && !names.has(item.name), '重複或空白：' + item.name);
    names.add(item.name);
    for (const part of item.parts) assert.ok(lib.parts.includes(part));
  }
  assert.deepStrictEqual([...lib.parts], ['肩頸部', '胸部', '腹部', '上背部', '下背部', '手臂', '臀部', '腿部']);
  for (const name of W.GymSession.autoMoves) assert.ok(lib.get(name)?.track, name);
  assert.ok(lib.items.length > 900);
});

test('動作庫：截圖動作都找得到（含合併到同一動作的別名）', () => {
  const S = require('../library-sources.js');
  for (const names of Object.values(S.screenshot)) for (const name of names) assert.ok(W.GymLibrary.get(name), name);
  assert.strictEqual(W.GymLibrary.get('標準伏地挺身').name, '伏地挺身');
  assert.strictEqual(W.GymLibrary.get('側平舉').name, '啞鈴側平舉');
});

test('搜尋：中英文、台灣與對岸用語都找得到', () => {
  const first = q => W.GymLibrary.search(q)[0]?.name;
  assert.strictEqual(first('面拉'), '滑輪臉拉');
  assert.strictEqual(first('face pull'), '滑輪臉拉');
  assert.strictEqual(first('側平舉'), '啞鈴側平舉');
  assert.ok(W.GymLibrary.search('捲腹').some(i => i.name === '90°卷腹'));
  assert.ok(W.GymLibrary.search('俯臥撐').some(i => i.name === '伏地挺身'));
});

test('計次規則：只對明列動作計次，不會把推胸拋球、頸前臥推當成胸推', () => {
  const lib = W.GymLibrary;
  assert.strictEqual(lib.get('單次推胸拋球').track, null);
  assert.strictEqual(lib.get('頸前臥推').track, null);
  assert.strictEqual(lib.get('槓鈴平板臥推').track, '胸推');
  assert.strictEqual(W.GymPose.supported('腿推機'), '腿推');
  assert.strictEqual(W.GymPose.supported('某個自訂動作'), null);
});

// ── v8.1：穩定性、組判定、左右分開計次 ──────────────────
let seed = 1;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const jitter = (points, sigma) => points.map(p => p.visibility ? { ...p, x: p.x + gauss() * sigma, y: p.y + gauss() * sigma } : p);

// 正面拍：左右兩側都清楚
function front({ left = 'down', right = 'down' } = {}) {
  const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const set = (i, x, y) => { points[i] = { x, y, visibility: 0.95 }; };
  set(11, 250, 300); set(12, 350, 300); set(23, 260, 500); set(24, 340, 500);
  set(25, 260, 640); set(26, 340, 640); set(27, 260, 780); set(28, 340, 780);
  set(13, 245, 400); set(14, 355, 400);
  if (left === 'down') set(15, 245, 490); else set(15, 252, 330);
  if (right === 'down') set(16, 355, 490); else set(16, 348, 330);
  return points;
}

test('交替彎舉（正面拍）：左右各 5 下，記成 10 下', () => {
  const frames = hold(front(), 4);
  for (let i = 0; i < 5; i++) frames.push(...hold(front({ left: 'up' }), 4), ...hold(front(), 4), ...hold(front({ right: 'up' }), 4), ...hold(front(), 4));
  const { sets } = run({ hint: '啞鈴二頭彎舉' }, [...frames, ...hold(front(), 90)]);
  assert.strictEqual(sets[0]?.reps, 10);
});

test('雙手同時彎舉（正面拍）：8 下記 8 下，不會左右重複算', () => {
  const frames = hold(front(), 4);
  for (let i = 0; i < 8; i++) frames.push(...hold(front({ left: 'up', right: 'up' }), 4), ...hold(front(), 4));
  const { sets } = run({ hint: '啞鈴二頭彎舉' }, [...frames, ...hold(front(), 90)]);
  assert.strictEqual(sets[0]?.reps, 8);
});

test('畫面抖動（5% 軀幹長）但人不動 30 秒：不產生紀錄', () => {
  seed = 9;
  const frames = Array.from({ length: 375 }, () => jitter(rowExtended(), 10));
  assert.strictEqual(run({ hint: '滑輪坐姿划船' }, frames).sets.length, 0);
  seed = 9;
  assert.strictEqual(run({}, frames).sets.length, 0);
});

test('畫面抖動（5%）時做 10 下：記 10 下且組會結束', () => {
  seed = 3;
  const frames = [...rowReps(10), ...still(150)].map(p => jitter(p, 10));
  const { sets } = run({ hint: '滑輪坐姿划船' }, frames);
  assert.strictEqual(sets.length, 1);
  assert.ok(sets[0].reps >= 9, '次數 ' + sets[0].reps);
});

test('自動模式：組間走動擺手 20 秒，不產生紀錄', () => {
  const frames = [];
  for (let i = 0; i < 250; i++) {
    const dx = (i % 12) * 12, sw = Math.sin(i / 3) * 60;
    frames.push(pose({ s: [300 + dx, 300], h: [300 + dx, 500], k: [320 + dx, 640], a: [320 + dx, 780], e: [300 + dx + sw * .5, 400], w: [300 + dx + sw, 480] }));
  }
  assert.strictEqual(run({}, frames).sets.length, 0);
});

test('關節可見度常掉（每個關節每格 20%）：10 下仍記 9 下以上', () => {
  seed = 11;
  const drop = p => p.map(pt => pt.visibility > .6 && rnd() < .2 ? { ...pt, visibility: .4 } : pt);
  const { sets } = run({ hint: '滑輪坐姿划船' }, [...rowReps(10).map(drop), ...still(90)]);
  assert.ok(sets[0]?.reps >= 9, '次數 ' + sets[0]?.reps);
});

test('快速動作：端點只停 1 個畫面（約 0.08 秒）也能數到', () => {
  const frames = hold(front(), 4);
  for (let i = 0; i < 10; i++) frames.push(front({ left: 'up', right: 'up' }), front());
  const { sets } = run({ hint: '啞鈴二頭彎舉' }, [...frames, ...hold(front(), 90)]);
  assert.strictEqual(sets[0]?.reps, 10);
});

test('組內停 4.5 秒：預設 6 秒內不切組，仍是一組 10 下', () => {
  const { sets } = run({ hint: '滑輪坐姿划船' }, [...rowReps(5), ...still(56), ...rowReps(5).slice(4), ...still(90)]);
  assert.deepStrictEqual(sets.map(s => s.reps), [10]);
});

test('組結束秒數可調：設 4 秒時，停 5 秒會切成兩組', () => {
  const { sets } = run({ hint: '滑輪坐姿划船', setEndMs: 4000 }, [...rowReps(5), ...still(63), ...rowReps(5).slice(4), ...still(90)]);
  assert.deepStrictEqual(sets.map(s => s.reps), [5, 5]);
});

test('休息中暫停：休息時間照實際時間算（含暫停）', () => {
  const rests = [];
  const session = W.GymSession.create({ hint: '滑輪坐姿划船', onSet: () => 'x', onRest: (id, ms) => rests.push(ms) });
  let at = 0;
  const feed = list => { for (const p of list) { session.update(p, at); at += FRAME; } };
  feed([...rowReps(3), ...still(90)]);
  session.pause(at); at += 60000; session.resume(at);
  feed([...rowReps(3), ...still(10)]); session.finish();
  assert.strictEqual(rests.length, 1);
  assert.ok(rests[0] > 60000, '休息 ' + rests[0]);
});

// ── v8.3：「認不出的動作試記時間」開關 ─────────────────
// 臉拉類動作（不是自動辨識三種）：手在肩高前後拉
const faceFar = () => pose({ s: [300, 300], h: [300, 500], k: [420, 500], a: [500, 560], e: [380, 290], w: [470, 280] });
const faceNear = () => pose({ s: [300, 300], h: [300, 500], k: [420, 500], a: [500, 560], e: [250, 270], w: [330, 250] });
const facePulls = n => { const f = []; for (let i = 0; i < n; i++) f.push(...hold(faceNear(), 5), ...hold(faceFar(), 5)); return f; };
const session3 = [...facePulls(38), ...hold(faceFar(), 750), ...facePulls(38), ...hold(faceFar(), 100)];

test('開關預設關閉：沒選動作做臉拉 30 秒×2，不產生紀錄', () => {
  assert.strictEqual(run({}, session3).sets.length, 0);
});

test('開關開啟、畫面乾淨：臉拉 30 秒 → 休息 60 秒 → 臉拉 30 秒，記兩組時間與休息', () => {
  const { sets, rests } = run({ unknownTime: true }, session3);
  assert.strictEqual(sets.length, 2);
  for (const set of sets) {
    assert.strictEqual(set.name, '動作無法確認');
    assert.strictEqual(set.reps, null);
    assert.ok(Math.abs(set.durationMs - 30000) < 3000, '時長 ' + set.durationMs);
  }
  assert.ok(Math.abs(rests[0][1] - 60000) < 3000, '休息 ' + rests[0][1]);
});

test('開關開啟：單純走位置（身體平移、手不動）不開組', () => {
  const frames = [];
  for (let i = 0; i < 250; i++) { const dx = (i % 12) * 12; frames.push(pose({ s: [300 + dx, 300], h: [300 + dx, 500], k: [320 + dx, 640], a: [320 + dx, 780], e: [305 + dx, 400], w: [310 + dx, 480] })); }
  assert.strictEqual(run({ unknownTime: true }, frames).sets.length, 0);
});

test('開關預設關閉：畫面抖動、組間走動擺手，結束訓練後也不產生紀錄', () => {
  seed = 5;
  const still30 = Array.from({ length: 375 }, () => jitter(rowExtended(), 10));
  assert.strictEqual(run({}, still30).sets.length, 0);
  const walk = [];
  for (let i = 0; i < 250; i++) { const dx = (i % 12) * 12, sw = Math.sin(i / 3) * 60; walk.push(pose({ s: [300 + dx, 300], h: [300 + dx, 500], k: [320 + dx, 640], a: [320 + dx, 780], e: [300 + dx + sw * .5, 400], w: [300 + dx + sw, 480] })); }
  assert.strictEqual(run({}, walk).sets.length, 0);
});

test('指定動作時不受開關影響：划船 5 下仍記 5 下', () => {
  assert.strictEqual(run({ hint: '滑輪坐姿划船', unknownTime: true }, [...rowReps(5), ...still(90)]).sets[0]?.reps, 5);
});
