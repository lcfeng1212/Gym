(() => {
  "use strict";
  const sides = [[11,23,25,27,13,15],[12,24,26,28,14,16]];
  const names = ["深蹲","伏地挺身","二頭彎舉"];
  function supported(name) {
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
  const visible = p => p && (p.visibility ?? 1) >= .6;
  function angle(a,b,c) {
    if (![a,b,c].every(visible)) return NaN;
    const x=a.x-b.x,y=a.y-b.y,u=c.x-b.x,v=c.y-b.y;
    const scale=Math.hypot(x,y)*Math.hypot(u,v);
    return scale ? Math.acos(Math.max(-1,Math.min(1,(x*u+y*v)/scale)))*180/Math.PI : NaN;
  }
  function sample(points, selection) {
    for (const side of sides) {
      const [s,h,k,a,e,w]=side.map(i=>points[i]);
      if (![s,h].every(visible)) continue;
      const horizontal=Math.abs(s.x-h.x)>Math.abs(s.y-h.y)*1.35;
      const knee=angle(h,k,a), elbow=angle(s,e,w);
      const move=selection || (horizontal ? names[1] : knee<130 ? names[0] : elbow<95 ? names[2] : names[0]);
      if (move===names[1] && !horizontal) continue;
      const tracking={
        腿推:[knee,110,145],
        臀推:[angle(s,h,k),135,155],
        引體向上:[elbow,100,145],
        側平舉:[angle(h,s,e),65,22]
      }[move];
      if(tracking) {
        const [degrees,finish,start]=tracking;
        if (!Number.isFinite(degrees)) continue;
        if (move==="引體向上" && (!visible(w) || w.y>=s.y)) continue;
        const raised = move==="側平舉";
        return {move,side:side[0],cue:"",bent:raised?degrees>finish:degrees<finish,extended:raised?degrees<start:degrees>start};
      }
      const joint=move===names[0] || move==="腿伸展" || move==="腿彎舉" ? knee : elbow;
      if (!Number.isFinite(joint)) continue;
      let cue="";
      if (move===names[1] && visible(a) && Math.abs(s.x-a.x)>1) {
        const line=a.y+(s.y-a.y)*(h.x-a.x)/(s.x-a.x);
        const delta=(h.y-line)/Math.max(1,Math.hypot(s.x-a.x,s.y-a.y));
        if (delta<-.09) cue="影像中臀部偏高，請核對肩、髖、踝的連線";
        if (delta>.09) cue="影像中臀部偏低，請核對肩、髖、踝的連線";
      }
      if (move===names[2] && elbow<100 && Math.abs(e.x-s.x)>.48*Math.hypot(s.x-h.x,s.y-h.y)) cue="上臂擺動較大，留意手肘位置";
      if (move===names[0] && knee<120 && Math.abs(s.x-h.x)>1.5*Math.abs(s.y-h.y)) cue="側面影像顯示軀幹前傾，請核對拍攝角度與動作";
      if(move==="腿伸展") return {move,side:side[0],cue,bent:joint>145,extended:joint<110};
      return {move,side:side[0],cue,bent:joint<(move===names[2]?85:105),extended:joint>150};
    }
    return null;
  }
  window.GymPose={sample,supported,visible,angle};
})();
