(() => {
  "use strict";
  // MediaPipe Pose 關節編號：左肩 11、左髖 23、左膝 25、左踝 27、左肘 13、左腕 15；右側為 12、24、26、28、14、16
  const sides = [[11,23,25,27,13,15],[12,24,26,28,14,16]];
  const names = ["深蹲","伏地挺身","二頭彎舉"];
  const rules = new Set(["深蹲","伏地挺身","二頭彎舉","腿伸展","腿彎舉","胸推","坐姿划船","高位下拉","腿推","臀推","引體向上","側平舉"]);

  // 舊版依名稱判斷（沒有動作庫對應的自訂名稱、舊紀錄仍可計次）
  function supportedByName(name) {
    name = String(name || "");
    if (/^(自重|徒手|槓鈴|史密斯)?深蹲$|^深蹲（負重未記明）$|^槓鈴背蹲$/.test(name)) return names[0];
    if (name===names[1]) return names[1];
    if (/二頭彎舉|^站姿啞鈴彎舉$/.test(name)) return names[2];
    if (/腿伸展|腿屈伸|膝伸展/.test(name) && !/拉伸|暖身|伸展操/.test(name)) return "腿伸展";
    if (/腿後彎舉|腿彎舉|勾腿|腿後勾|腿後屈/.test(name) && !/交替/.test(name)) return "腿彎舉";
    if (/胸推|臥推|上胸推|推胸/.test(name)) return "胸推";
    if (/滑輪坐姿划船/.test(name)) return "坐姿划船";
    if (/滑輪高位下拉/.test(name)) return "高位下拉";
    if (/腿推機$/.test(name) && !/單腿|分動/.test(name)) return "腿推";
    if (/^機械臀推$|^機械臀橋$|^自重臀橋$/.test(name)) return "臀推";
    if (/引體向上/.test(name)) return "引體向上";
    if (name==="啞鈴側平舉") return "側平舉";
    return null;
  }
  // 動作庫有標記計次規則時以動作庫為準
  function supported(name) {
    if (rules.has(name)) return name;
    const item = window.GymLibrary?.get(name);
    if (item) return item.track || null;
    return supportedByName(name);
  }

  const visible = p => p && (p.visibility ?? 1) >= .6;
  function angle(a,b,c) {
    if (![a,b,c].every(visible)) return NaN;
    const x=a.x-b.x,y=a.y-b.y,u=c.x-b.x,v=c.y-b.y;
    const scale=Math.hypot(x,y)*Math.hypot(u,v);
    return scale ? Math.acos(Math.max(-1,Math.min(1,(x*u+y*v)/scale)))*180/Math.PI : NaN;
  }
  // 軀幹與垂直線夾角（度，正負代表前後方向，只用來比較同一組內的變化）
  function lean(s,h) {
    if (![s,h].every(visible)) return NaN;
    return Math.atan2(s.x-h.x, h.y-s.y)*180/Math.PI;
  }
  function sideOrder(points, preferSide) {
    const score = side => side.reduce((sum,i)=>sum+(points[i]?.visibility ?? (points[i]?1:0)),0);
    const order = score(sides[1])>score(sides[0]) ? [sides[1],sides[0]] : [sides[0],sides[1]];
    if (preferSide===12) return [sides[1],sides[0]];
    if (preferSide===11) return [sides[0],sides[1]];
    return order;
  }

  // 各計次規則：[角度, 動作端門檻, 起始端門檻, 角度變大代表做動作]
  function trackingRule(move, p) {
    const {s,h,k,a,e,w,knee,elbow} = p;
    switch (move) {
      case "腿推": return [knee,110,145,false];
      case "臀推": return [angle(s,h,k),150,135,true];
      case "引體向上": return [elbow,100,145,false];
      case "側平舉": return [angle(h,s,e),65,35,true];
      default: return null;
    }
  }

  function sample(points, selection, preferSide) {
    for (const side of sideOrder(points, preferSide)) {
      const [s,h,k,a,e,w]=side.map(i=>points[i]);
      if (![s,h].every(visible)) continue;
      const horizontal=Math.abs(s.x-h.x)>Math.abs(s.y-h.y)*1.35;
      const knee=angle(h,k,a), elbow=angle(s,e,w);
      const move=selection || (horizontal ? names[1] : knee<130 ? names[0] : elbow<95 ? names[2] : names[0]);
      if (move===names[1] && !horizontal) continue;
      const torso=lean(s,h);
      const rule=trackingRule(move,{s,h,k,a,e,w,knee,elbow});
      if(rule) {
        const [degrees,work,start,increasing]=rule;
        if (!Number.isFinite(degrees)) continue;
        if (move==="引體向上" && (!visible(w) || w.y>=s.y)) continue;
        let cue="";
        if (move==="側平舉" && degrees>105) cue="手臂抬過肩膀，平舉到與肩同高即可";
        if (move==="腿推" && degrees<65) cue="下放很深，留意下背和臀部是否離開椅墊";
        return {move,side:side[0],cue,torso,angle:degrees,
          bent:increasing?degrees>work:degrees<work,
          extended:increasing?degrees<start:degrees>start};
      }
      const joint=move===names[0] || move==="腿伸展" || move==="腿彎舉" ? knee : elbow;
      if (!Number.isFinite(joint)) continue;
      let cue="";
      if (move===names[1] && visible(a) && Math.abs(s.x-a.x)>1) {
        const line=a.y+(s.y-a.y)*(h.x-a.x)/(s.x-a.x);
        const delta=(h.y-line)/Math.max(1,Math.hypot(s.x-a.x,s.y-a.y));
        if (delta<-.09) cue="臀部偏高，讓肩、髖、腳踝保持一直線";
        if (delta>.09) cue="臀部下沉，收緊核心讓身體保持一直線";
      }
      if (move===names[2] && elbow<100 && visible(e) && Math.abs(e.x-s.x)>.48*Math.hypot(s.x-h.x,s.y-h.y)) cue="手肘往前跑了，上臂貼近身體";
      if (move===names[0] && knee<120 && Math.abs(s.x-h.x)>1.5*Math.abs(s.y-h.y)) cue="軀幹前傾較多，胸口抬起、核心收緊";
      if(move==="腿伸展") return {move,side:side[0],cue,torso,angle:joint,bent:joint>145,extended:joint<110};
      return {move,side:side[0],cue,torso,angle:joint,bent:joint<(move===names[2]?85:move===names[0]?115:105),extended:joint>150};
    }
    return null;
  }
  window.GymPose={sample,supported,supportedByName,visible,angle,lean};
})();
