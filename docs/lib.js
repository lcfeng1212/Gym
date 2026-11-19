(() => {
  'use strict';
  const L = window.GYM_LIBRARY || {parts:[],items:[],muscles:[],muscleKeys:[],equipment:[],levels:[],types:[]};
  const fold = text => String(text||'').normalize('NFKC').toLowerCase()
    .replace(/[臺]/g,'台').replace(/[捲]/g,'卷').replace(/俯臥撐/g,'伏地挺身').replace(/[\s·・\-–—_/／()（）]+/g,'');
  // 沒有資料庫肌群時，用部位推估要上色的區域（只作示意）
  const partMuscle = {'肩頸部':['shoulders'],'胸部':['chest'],'腹部':['abdominals'],'上背部':['lats','middle back'],
    '下背部':['lower back'],'手臂':['biceps','triceps'],'臀部':['glutes'],'腿部':['quadriceps','hamstrings']};
  const items = L.items.map((row,index) => ({
    index, name:row.n, letter:row.l, parts:row.p.map(i=>L.parts[i]), partIndex:row.p,
    aliases:row.a||[], mine:row.u||0, screenshot:Boolean(row.z), track:row.t||null, guide:row.g||null,
    fedb:row.f||null, primary:(row.m||[]).map(i=>L.muscleKeys[i]), secondary:(row.s||[]).map(i=>L.muscleKeys[i]),
    equipment:row.e!=null?L.equipment[row.e]:null, level:row.v!=null?L.levels[row.v]:null,
    type:row.c!=null?L.types[row.c]:null, images:row.i||0,
    search:fold([row.n,...(row.a||[])].join(' '))
  }));
  const byName = new Map();
  for (const item of items) byName.set(item.name, item);
  for (const item of items) for (const alias of item.aliases) if (!byName.has(alias)) byName.set(alias, item);
  const muscleLabel = key => L.muscles[L.muscleKeys.indexOf(key)] || key;
  let steps = null;
  window.GymLibrary = {
    parts:L.parts, items, fold,
    get:name => byName.get(name) || null,
    search(query, list = items) {
      const words = String(query||'').normalize('NFKC').trim().split(/\s+/).map(fold).filter(Boolean);
      if (!words.length) return list;
      const hits = list.filter(item => words.every(word => item.search.includes(word)));
      const first = fold(query);
      const score = item => (fold(item.name)===first || item.aliases.some(a => fold(a)===first) ? 4 : 0)
        + (fold(item.name).startsWith(first) ? 2 : 0) + (item.mine ? 1 : 0);
      return hits.map(item => [score(item), item]).sort((a,b) => b[0]-a[0] || a[1].index-b[1].index).map(pair => pair[1]);
    },
    inPart:part => items.filter(item => item.parts.includes(part)),
    mine:() => items.filter(item => item.mine).sort((a,b) => a.mine-b.mine),
    image:(item, n) => item.fedb ? L.imageBase + encodeURIComponent(item.fedb) + '/' + n + '.jpg' : '',
    muscles(item) {
      if (!item) return {primary:[],secondary:[]};
      if (item.primary.length) return {primary:item.primary, secondary:item.secondary};
      return {primary:[...new Set(item.parts.flatMap(p => partMuscle[p] || []))], secondary:[]};
    },
    muscleLabel,
    async steps(item) {
      if (!item?.fedb) return null;
      if (!steps) steps = fetch('fedb-steps.json').then(r => { if (!r.ok) throw Error(); return r.json(); }).catch(e => { steps = null; throw e; });
      return (await steps)[item.fedb] || null;
    }
  };
})();
