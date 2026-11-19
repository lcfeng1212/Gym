#!/usr/bin/env node
// 重建動作庫：node tools/build-library.js [path/to/free-exercise-db/exercises.json]
// 產物：docs/library.js（清單、分類、索引）、docs/fedb-steps.json（英文原文步驟，點開才載入）
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pinyin } = require('pinyin-pro');
const S = require('./library-sources.js');

const root = path.join(__dirname, '..');
const docs = path.join(root, 'docs');
const fedbPath = process.argv[2] || path.join(__dirname, '.cache', 'exercises.json');
if (!fs.existsSync(fedbPath)) {
  console.error('找不到 Free Exercise DB：' + fedbPath + '\n下載：https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json');
  process.exit(1);
}
const fedb = JSON.parse(fs.readFileSync(fedbPath, 'utf8'));
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, 'fedb-zh-names.json'), 'utf8'));

function loadWindow(files) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
  return sandbox.window;
}
// mine-catalog.js：由使用者 Google「健身」日曆整理出的動作名稱與舊分類（已移除日期）
const old = loadWindow([path.join(__dirname, 'mine-catalog.js'), path.join(docs, 'research.js'), path.join(docs, 'observations.js'), path.join(docs, 'camera.js')]);
const mine = old.catalog;
const guideMap = old.GYM_GUIDE_MAP || {};
const oldAliases = old.GYM_SEARCH_ALIASES || {};

const errors = [];
const byId = new Map(fedb.map(e => [e.id, e]));
const fedbByZh = new Map();
for (const e of fedb) {
  const name = zh[e.name];
  if (!name) errors.push('缺少中文名：' + e.name);
  fedbByZh.set(name, e.id);
}
const trackOf = new Map();
for (const [rule, ids] of Object.entries(S.fedbTrack)) for (const id of ids) {
  if (!byId.has(id)) errors.push('計次規則找不到 id：' + id);
  trackOf.set(id, rule);
}
for (const [name, id] of Object.entries(S.mineToFedb)) if (!byId.has(id)) errors.push('日曆對應找不到 id：' + name + ' → ' + id);

const items = [];
const byName = new Map();
const fedbItem = new Map();
function partsFromMuscles(e) {
  const parts = new Set();
  for (const m of e.primaryMuscles) for (const p of S.muscleParts[m] || []) parts.add(p);
  if (e.mechanic === 'compound' && ['strength', 'powerlifting'].includes(e.category) && e.secondaryMuscles.includes('glutes')) parts.add('臀部');
  return parts;
}
function add(item) {
  item.aliases = new Set(item.aliases || []);
  item.parts = new Set(item.parts || []);
  item.src = new Set(item.src || []);
  items.push(item);
  byName.set(item.name, item);
  return item;
}
function attachFedb(item, id) {
  const e = byId.get(id);
  if (!e || fedbItem.has(id)) return;
  item.fedb = id;
  item.src.add('f');
  fedbItem.set(id, item);
  if (zh[e.name] !== item.name) item.aliases.add(zh[e.name]);
  item.aliases.add(e.name);
  for (const p of partsFromMuscles(e)) item.parts.add(p);
}

// 1. 日曆動作（顯示名稱優先）
mine.forEach((row, rank) => {
  const item = add({ name: row.name, src: ['u'], mine: rank + 1 });
  const id = S.mineToFedb[row.name] || fedbByZh.get(row.name);
  if (id) attachFedb(item, id);
  const manual = S.mineParts[row.name];
  if (manual) { item.parts = new Set(manual); if (item.fedb) for (const p of partsFromMuscles(byId.get(item.fedb))) if (manual.length) item.parts.add(p); }
  else if (!item.parts.size) for (const p of S.minePartsByGroup[row.group] || []) item.parts.add(p);
  const guide = guideMap[row.name];
  if (guide) item.guide = guide;
  for (const word of String(oldAliases[row.name] || '').split(/\s+/).filter(Boolean)) item.aliases.add(word);
});

// 2. 截圖動作
for (const [part, names] of Object.entries(S.screenshot)) for (const name of names) {
  const same = S.screenshotSame[name];
  let item = byName.get(name);
  if (!item && same) {
    item = byName.get(same) || fedbItem.get(same);
    if (!item && byId.has(same)) { item = add({ name, src: [] }); attachFedb(item, same); }
    if (!item && fedbByZh.has(same)) { item = add({ name: same, src: [] }); attachFedb(item, fedbByZh.get(same)); }
    if (item && item.name !== name) item.aliases.add(name);
  }
  if (!item) {
    const id = fedbByZh.get(name);
    item = add({ name, src: [] });
    if (id) attachFedb(item, id);
  }
  item.src.add('z');
  item.parts.add(part);
}

// 3. Free Exercise DB 其餘動作
for (const e of fedb) {
  if (fedbItem.has(e.id)) continue;
  const name = zh[e.name];
  if (byName.has(name)) { attachFedb(byName.get(name), e.id); continue; }
  const item = add({ name, src: [] });
  attachFedb(item, e.id);
}

// 搜尋別名
for (const [name, words] of Object.entries(S.extraAliases)) {
  const item = byName.get(name);
  if (!item) { errors.push('別名找不到動作：' + name); continue; }
  for (const w of words) item.aliases.add(w);
}

// 計次規則：資料庫 id 優先，其次沿用舊版名稱規則
for (const item of items) {
  // 資料庫動作只用明列清單；沒有資料庫對應的日曆／截圖動作才沿用舊版名稱規則
  const byRule = item.fedb ? trackOf.get(item.fedb) : null;
  const byName = !item.fedb || item.src.has('u') ? old.GymPose.supportedByName(item.name) : null;
  item.track = byRule || byName || null;
}

// 排序與字母索引（拼音首字母；數字開頭歸 #）
function sortKey(name) {
  return pinyin(name, { toneType: 'none', type: 'array', nonZh: 'consecutive' }).join(' ').toLowerCase();
}
function initial(name) {
  const first = name.trim()[0];
  if (/[0-9]/.test(first)) return '#';
  if (/[a-z]/i.test(first)) return first.toUpperCase();
  const letter = pinyin(first, { pattern: 'first', toneType: 'none' }).toUpperCase();
  return /^[A-Z]$/.test(letter) ? letter : '#';
}
for (const item of items) { item.key = sortKey(item.name); item.letter = initial(item.name); }
items.sort((a, b) => (a.letter === '#' ? -1 : 0) - (b.letter === '#' ? -1 : 0) || a.key.localeCompare(b.key) || a.name.localeCompare(b.name, 'zh-Hant'));

// 檢查
const names = new Set();
for (const item of items) {
  if (names.has(item.name)) errors.push('動作名稱重複：' + item.name);
  names.add(item.name);
  for (const p of item.parts) if (!S.parts.includes(p)) errors.push('未知部位：' + item.name + ' ' + p);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

// 輸出
const muscleCodes = Object.keys(S.muscleNames);
const equipCodes = Object.keys(S.equipmentNames);
const levelCodes = Object.keys(S.levelNames);
const typeCodes = Object.keys(S.typeNames);
const out = items.map(item => {
  const e = item.fedb && byId.get(item.fedb);
  const row = { n: item.name, l: item.letter, p: S.parts.map((p, i) => item.parts.has(p) ? i : -1).filter(i => i >= 0) };
  const aliases = [...item.aliases].filter(a => a && a !== item.name);
  if (aliases.length) row.a = aliases;
  if (item.src.has('u')) row.u = item.mine;
  if (item.src.has('z')) row.z = 1;
  if (item.track) row.t = item.track;
  if (item.guide) row.g = item.guide;
  if (e) {
    row.f = e.id;
    row.m = e.primaryMuscles.map(m => muscleCodes.indexOf(m));
    if (e.secondaryMuscles.length) row.s = e.secondaryMuscles.map(m => muscleCodes.indexOf(m));
    if (e.equipment) row.e = equipCodes.indexOf(e.equipment);
    row.v = levelCodes.indexOf(e.level);
    row.c = typeCodes.indexOf(e.category);
    row.i = e.images.length;
  }
  return row;
});
const library = {
  version: 8,
  parts: S.parts,
  muscles: muscleCodes.map(m => S.muscleNames[m]),
  muscleKeys: muscleCodes,
  equipment: equipCodes.map(e => S.equipmentNames[e]),
  levels: levelCodes.map(l => S.levelNames[l]),
  types: typeCodes.map(t => S.typeNames[t]),
  imageBase: 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/',
  items: out
};
fs.writeFileSync(path.join(docs, 'library.js'),
  '// 由 tools/build-library.js 產生，請勿手改。資料來源：Free Exercise DB（公有領域）、使用者日曆動作、使用者提供之截圖動作名稱。\n' +
  'window.GYM_LIBRARY=' + JSON.stringify(library) + ';\n');
const steps = {};
for (const e of fedb) steps[e.id] = e.instructions;
fs.writeFileSync(path.join(docs, 'fedb-steps.json'), JSON.stringify(steps));

const count = k => out.filter(r => r[k]).length;
console.log('動作總數', out.length, '｜日曆', count('u'), '｜截圖', count('z'), '｜有照片', count('f'), '｜可計次', count('t'));
console.log(S.parts.map((p, i) => p + ' ' + out.filter(r => r.p.includes(i)).length).join('、'));
console.log('未分部位', out.filter(r => !r.p.length).map(r => r.n).join('、'));
