(() => {
  'use strict';
  // 在骨架上用紅色（主要肌群）、藍色（協同肌群）標示目標區域。只是依關節位置畫的示意，不是偵測肌肉出力。
  const RED = 'rgba(255, 64, 64, .55)', BLUE = 'rgba(64, 140, 255, .5)';
  const mid = (a, b) => a && b ? {x:(a.x+b.x)/2, y:(a.y+b.y)/2, visibility:Math.min(a.visibility??1, b.visibility??1)} : null;
  const lerp = (a, b, t) => a && b ? {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, visibility:Math.min(a.visibility??1, b.visibility??1)} : null;
  // 每個肌群：[[起點, 終點, 起始比例, 結束比例, 粗細(相對軀幹長)]]
  function segments(key, p) {
    const torsoL = [p[11], p[23]], torsoR = [p[12], p[24]];
    const chestL = lerp(p[11], p[23], .2), chestR = lerp(p[12], p[24], .2);
    const midL = lerp(p[11], p[23], .35), midR = lerp(p[12], p[24], .35);
    const lowL = lerp(p[11], p[23], .78), lowR = lerp(p[12], p[24], .78);
    const neck = mid(p[7], p[8]), shoulders = mid(p[11], p[12]), hips = mid(p[23], p[24]);
    switch (key) {
      case 'shoulders': return [[p[11], p[13], 0, .32, .22], [p[12], p[14], 0, .32, .22]];
      case 'traps': return [[p[11], neck, 0, .55, .14], [p[12], neck, 0, .55, .14]];
      case 'neck': return [[shoulders, neck, .1, .9, .12]];
      case 'chest': return [[chestL, chestR, 0, 1, .22]];
      case 'middle back': return [[midL, midR, 0, 1, .2]];
      case 'lats': return [[...torsoL, .18, .7, .16], [...torsoR, .18, .7, .16]];
      case 'lower back': return [[lowL, lowR, 0, 1, .16], [shoulders && hips ? lerp(shoulders, hips, .65) : null, hips, 0, 1, .14]];
      case 'abdominals': return [[shoulders, hips, .3, .95, .2]];
      case 'biceps': case 'triceps': return [[p[11], p[13], .25, .92, .13], [p[12], p[14], .25, .92, .13]];
      case 'forearms': return [[p[13], p[15], .1, .85, .1], [p[14], p[16], .1, .85, .1]];
      case 'glutes': return [[p[23], p[25], 0, .28, .26], [p[24], p[26], 0, .28, .26]];
      case 'quadriceps': case 'hamstrings': case 'adductors': case 'abductors':
        return [[p[23], p[25], .18, .88, .2], [p[24], p[26], .18, .88, .2]];
      case 'calves': return [[p[25], p[27], .12, .78, .14], [p[26], p[28], .12, .78, .14]];
      default: return [];
    }
  }
  let target = null;
  function paint(ctx, points, view, width, height) {
    if (!view || !view.tracking || !points?.length) return;
    const name = view.phase === 'rest' ? '' : (view.name || view.hint || '');
    const item = name ? window.GymLibrary?.get(name) : null;
    if (!item) { target = null; return; }
    target = item;
    const {primary, secondary} = window.GymLibrary.muscles(item);
    const vis = point => window.GymPose.visible(point) && point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
    const shoulder = mid(points[11], points[12]), hip = mid(points[23], points[24]);
    const torso = shoulder && hip ? Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y) : 0;
    if (torso < 20) return;
    ctx.save(); ctx.lineCap = 'round';
    for (const [keys, color] of [[secondary, BLUE], [primary, RED]]) for (const key of keys) {
      for (const [a, b, from, to, size] of segments(key, points)) {
        if (!a || !b || !vis(a) || !vis(b)) continue;
        ctx.strokeStyle = color; ctx.lineWidth = Math.max(8, torso * size);
        ctx.beginPath();
        ctx.moveTo(a.x + (b.x - a.x) * from, a.y + (b.y - a.y) * from);
        ctx.lineTo(a.x + (b.x - a.x) * to, a.y + (b.y - a.y) * to);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  window.GymOverlay = {paint, target:() => target};
})();
