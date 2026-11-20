(() => {
  const UNKNOWN = '動作無法確認';
  const MIXED = '複合健身';
  const CARDIO = '有氧運動';
  const timed = new Set([UNKNOWN,MIXED,CARDIO]);
  const autoMoves = ['滑輪坐姿划船','滑輪高位下拉','啞鈴側平舉'];
  const quietMs = 6000;       // 預設：停止活動多久算這組結束（訓練選項可改）
  const lockMs = 180000;      // 鎖定人物：上一組結束後 3 分鐘內，新的一組要出現在上一組位置附近
  const lockRange = .6;       // 鎖定範圍：髖部位置差距小於 0.6 個軀幹長
  const missLimit = 6;
  const blinkMs = 600;        // 整個人短暫消失多久內不算追蹤中斷        // 關節短暫看不清楚可容忍的影格數（約 0.5 秒）
  const swingLimit = {'坐姿划船':18,'高位下拉':20,'引體向上':22};
  const swingCue = {
    '坐姿划船':'軀幹前後擺動較大，穩住核心，用手肘帶動',
    '高位下拉':'身體後仰或晃動較大，維持軀幹穩定再下拉',
    '引體向上':'身體擺盪較大，放慢速度、控制下放'
  };

  function classify(points, move, preferSide) {
    const pose = window.GymPose;
    const single = pose.sample(points,pose.supported(move),preferSide);
    if (!single) return null;
    const right = single.side===12;
    const shoulder = points[single.side], hip=points[right?24:23];
    const elbow=points[right?14:13], wrist=points[right?16:15];
    const body=Math.hypot(shoulder.x-hip.x,shoulder.y-hip.y);
    if (body<20) return null;
    if (move===autoMoves[2]) {
      const [lg,rg]=[pose.angle(points[23],points[11],points[13]),pose.angle(points[24],points[12],points[14])];
      const [le,re]=[pose.angle(points[11],points[13],points[15]),pose.angle(points[12],points[14],points[16])];
      const width=pose.visible(points[11])&&pose.visible(points[12])?Math.abs(points[11].x-points[12].x):0;
      if (![lg,rg,le,re].every(Number.isFinite) || width<body*.48 || Math.min(le,re)<120) return null;
      return {...single,side:0,extended:Math.max(lg,rg)<35,bent:Math.min(lg,rg)>64,
        cue:Math.abs(lg-rg)>25&&Math.max(lg,rg)>48?'左右抬起高度不同，兩手同時平舉':single.cue};
    }
    if (![elbow,wrist].every(pose.visible)) return null;
    const y=(wrist.y-shoulder.y)/body;
    const elbowY=(elbow.y-shoulder.y)/body;
    const x=Math.abs(wrist.x-shoulder.x)/body;
    const row=move===autoMoves[0];
    const extended=single.extended && (row?y>.12&&y<.85&&x>.37:y<-.56);
    const bent=single.bent && (row?y>.10&&y<.9&&elbowY>.13:y<.22&&elbowY>.04);
    return {...single,extended,bent};
  }

  // 正面拍時可左右分開計次的動作（交替彎舉、單手側平舉、交替腿後勾等）
  const bilateral = new Set(['二頭彎舉','側平舉','腿彎舉','腿伸展']);
  const mergeMs = 450; // 左右兩側在這時間內先後完成，視為雙手（雙腳）同時做的一下

  function exerciseTracker(hint) {
    const pose=window.GymPose;
    const candidates=hint?(pose.supported(hint)?[hint]:[]):autoMoves;
    const states=new Map(), lastDone=new Map();
    return {
      clear:()=>{states.clear();lastDone.clear();},
      update(points,at=0) {
        const completed=[];
        let cue='';
        for(const [key,state] of states)if(at-state.at>1000)states.delete(key);
        for(const move of candidates) {
          const rule=pose.supported(move);
          const lanes=hint&&bilateral.has(rule)&&pose.frontal(points)?[11,12]:[null];
          for(const lane of lanes) {
            const key=lane?move+'|'+lane:move;
            const state=states.get(key);
            const sample=hint?pose.sample(points,rule,state?.side,lane):classify(points,move,state?.side);
            if (!sample || (state && state.side!==sample.side)) {
              if(state && ++state.miss>missLimit) states.delete(key);
              continue;
            }
            const phase=state?.phase||'start';
            const atEndpoint=phase==='work'?sample.bent:sample.extended;
            const frames=atEndpoint?(state?.frames||0)+(sample.deep?2:1):0;
            let base=state?.base;
            if(Number.isFinite(sample.torso)&&swingLimit[rule]){
              if(phase==='start'&&sample.extended)base=Number.isFinite(base)?base*.8+sample.torso*.2:sample.torso;
              else if(Number.isFinite(base)&&Math.abs(sample.torso-base)>swingLimit[rule])cue=swingCue[rule];
            }
            if (sample.cue&&phase!=='start') cue=sample.cue;
            const next={phase,frames,side:sample.side,miss:0,base,at};
            if(frames>=2) {
              next.frames=0;
              next.phase=phase==='start'||phase==='return'?'work':'return';
              if(phase==='return') {
                // 另一側剛完成、且還沒配對（雙手同時做）就合併成同一下
                const other=lane?lastDone.get(move+'|'+(lane===11?12:11)):null;
                if(other&&!other.paired&&at-other.at<=mergeMs){other.paired=true;lastDone.set(key,{at,paired:true});}
                else {completed.push(move);if(lane)lastDone.set(key,{at,paired:false});}
              }
            }
            states.set(key,next);
          }
        }
        if(new Set(completed).size>1)states.clear();
        return {move:new Set(completed).size===1?completed[0]:null,cue};
      }
    };
  }

  function motionTracker(relative=false) {
    let anchor=null, lastMotion=null, lastSignal=null;
    return {
      update(points,at) {
        const vis=window.GymPose.visible;
        const visible=[11,12,23,24].filter(i=>vis(points[i]));
        const joints=[13,14,15,16,25,26,27,28].filter(i=>vis(points[i]));
        if(!visible.some(i=>i<20)||!visible.some(i=>i>20)||!joints.length) {
          anchor=null;lastSignal=null;lastMotion=null;
          return {tracking:false,active:false};
        }
        const shoulder=points[visible.find(i=>i<20)],hip=points[visible.find(i=>i>20)];
        const scale=Math.hypot(shoulder.x-hip.x,shoulder.y-hip.y);
        if(scale<20){anchor=null;lastMotion=null;lastSignal=null;return {tracking:false,active:false};}
        if(relative)points=points.map(p=>vis(p)?{...p,x:p.x-hip.x,y:p.y-hip.y}:p);
        const ids=[...joints,...visible];
        if(!anchor)anchor=points;
        const delta=Math.max(0,...ids.filter(i=>vis(anchor[i])).map(i=>Math.hypot(points[i].x-anchor[i].x,points[i].y-anchor[i].y)));
        if(delta>scale*.12) {
          anchor=points;
          if(lastSignal===null || at-lastSignal>1100)lastMotion=null;
          else if(lastMotion===null)lastMotion=lastSignal;
          lastSignal=at;
        }
        return {tracking:true,active:lastMotion!==null&&at-lastSignal<=650,onset:lastMotion,motionAt:lastSignal};
      }
    };
  }

  // 關節位置平滑；短暫看不清楚（3 個畫面內）沿用上一個位置
  function smoother() {
    const last=[];
    return points=>{
      if(!points.length){last.length=0;return points;}
      const vis=window.GymPose.visible;
      return points.map((p,i)=>{
        const prev=last[i];
        if(p&&vis(p)){
          const q=prev&&prev.age<=3?{x:prev.x+(p.x-prev.x)*.7,y:prev.y+(p.y-prev.y)*.7,visibility:p.visibility,age:0}:{x:p.x,y:p.y,visibility:p.visibility,age:0};
          last[i]=q;return q;
        }
        if(prev&&prev.age<3){prev.age++;return {x:prev.x,y:prev.y,visibility:.61,age:prev.age};}
        last[i]=null;return p;
      });
    };
  }

  // unknownTime：沒選動作時，持續活動但認不出動作也試記時間（預設關；畫面抖動時可能誤記）
  // 人物位置：兩髖中點（看不到就用一側）與軀幹長
  function bodyAt(points) {
    const vis=window.GymPose.visible;
    const hips=[23,24].filter(i=>vis(points[i])).map(i=>points[i]);
    const shoulders=[11,12].filter(i=>vis(points[i])).map(i=>points[i]);
    if(!hips.length||!shoulders.length)return null;
    const avg=list=>({x:list.reduce((s,p)=>s+p.x,0)/list.length,y:list.reduce((s,p)=>s+p.y,0)/list.length});
    const h=avg(hips),sh=avg(shoulders);
    const torso=Math.hypot(sh.x-h.x,sh.y-h.y);
    return torso>20?{x:h.x,y:h.y,torso}:null;
  }

  function create({hint='',setEndMs=quietMs,unknownTime=false,lockPerson=false,onSet=()=>{},onRest=()=>{},onRep=()=>{}}={}) {
    const tracker=exerciseTracker(hint), motion=motionTracker(), smooth=smoother();
    const timedMode=Boolean(hint&&!window.GymPose.supported(hint));
    const unclassified=hint||!unknownTime?null:motionTracker(true);
    let current=null, rest=null, lastTracked=null, lostAt=null, view={phase:'ready', tracking:false}, anchor=null;
    let pausedAt=null, pausedTotal=0;
    function pause(at) {
      if(pausedAt!==null)return;
      pausedAt=at;
      tracker.clear();smooth([]);
      motion.update([],at-pausedTotal);
      unclassified?.update([],at-pausedTotal);
      lastTracked=null;
    }
    function resume(at) {
      if(pausedAt===null)return;
      const paused=Math.max(0,at-pausedAt);
      pausedTotal+=paused;
      pausedAt=null;
      if(current)current.quietFrom=at-pausedTotal;
      else if(rest)rest.at-=paused; // 休息中暫停：休息時間照實際時間算
    }
    function finish() {
      if(!current)return;
      const keys=[...current.moves.keys()];
      const name=timed.has(hint)?hint:keys.length===1?keys[0]:keys.length>1?MIXED:hint||UNKNOWN;
      const reps=timed.has(name)?null:(current.moves.get(name)||null);
      // 可計次動作以最後一下為結束（不受畫面抖動影響）；只記時間的動作以最後活動為結束
      const end=Math.max(current.start+1,timedMode||current.lastRep==null?current.lastActive:current.lastRep);
      const missing=current.gaps.reduce((sum,[start,stop])=>sum+Math.max(0,Math.min(end,stop)-Math.max(current.start,start)),0);
      const restAt=Math.max(end,current.gaps.at(-1)?.[1]??end);
      const set={name,reps,durationMs:Math.max(1,end-current.start-missing),
        startAt:current.startAt,endAt:Math.max(current.startAt+1,current.endAt),
        trackingInterrupted:current.gaps.length>0||lostAt!==null,cue:current.cue||''};
      if(current.body)anchor={...current.body,at:end};
      rest={at:restAt,id:onSet(set),set};
      current=null;
    }
    function update(raw,at) {
      if(pausedAt!==null)return view;
      at-=pausedTotal;
      const points=smooth(raw);
      const signal=motion.update(points,at);
      const relative=unclassified?.update(points,at);
      if(!signal.tracking) {
        if(lostAt===null)lostAt=lastTracked??at;
        // 短暫看不到（不到 0.6 秒）保留這一下的進度；太久才重置
        if(at-lostAt>blinkMs)tracker.clear();
        // 做完最後一下就走出畫面：一樣在設定秒數後結束這組
        if(current&&at-(current.lastRep??current.lastActive)>=setEndMs)finish();
        return view={...view,tracking:false,phase:current?'working':rest?'rest':'ready',restMs:rest?Math.max(0,at-rest.at):0};
      }
      const lost=lostAt!==null&&at-lostAt>blinkMs?lostAt:null;
      const gap=lost??(lastTracked!==null&&at-lastTracked>900?lastTracked:null);
      if(gap!==null&&current) {
        current.gaps.push([gap,at]);
        current.quietFrom=at;
        tracker.clear();
      }
      lostAt=null;
      lastTracked=at;
      let {move,cue}=tracker.update(points,at);
      // 鎖定人物：休息中出現在別的位置的動作（旁人入鏡）不開新的一組
      const body=bodyAt(points);
      const far=Boolean(lockPerson&&!current&&anchor&&body&&at-anchor.at<lockMs&&
        Math.hypot(body.x-anchor.x,body.y-anchor.y)>anchor.torso*lockRange);
      if(far&&move){move=null;cue='位置和上一組不同，這下未計入（已開啟鎖定人物）';}
      // 可計次的動作（含自動辨識）一定要完成一下才開組，避免走動、調整器材、畫面抖動被記成一組
      const longMotion=signal.active&&signal.onset!==null&&at-signal.onset>=3000;
      const fallback=!hint&&relative?.active&&at-relative.onset>=3000;
      const canStart=!far&&(move||fallback||(timedMode&&signal.active&&(!rest||longMotion)));
      if(!current && canStart) {
        const start=Math.max(rest?.at||0,(fallback&&!move?relative.onset:signal.onset)??at,timedMode?0:at-6000);
        if(rest)onRest(rest.id,start-rest.at);
        rest=null;current={start,startAt:start+pausedTotal,endAt:at+pausedTotal,lastActive:at,quietFrom:at,gaps:[],moves:new Map()};
      }
      if(current) {
        if(cue)current.cue=cue;
        const activity=!hint&&current.lastRep==null&&!move?relative:signal;
        if(activity?.active&&activity.motionAt>=current.lastActive){
          current.lastActive=activity.motionAt;
          if(timedMode||current.lastRep==null)current.endAt=activity.motionAt+pausedTotal;
        }
        if(move){
          current.endAt=at+pausedTotal;
          current.lastActive=at;current.lastRep=at;
          if(body)current.body=body;
          const count=(current.moves.get(move)||0)+1;
          current.moves.set(move,count);
          onRep(move,count);
        }
        // 可計次：最後一下之後設定秒數內沒有新的一下就結束（畫面抖動不影響）；只記時間：停止活動設定秒數後結束
        const done=current.lastRep!=null?at-current.lastRep>=setEndMs:at-Math.max(current.quietFrom,current.lastActive)>=setEndMs;
        if(done)finish(); // 不清除計次狀態：剛好在結束時開始的下一下仍會算進下一組
      }
      const keys=current?[...current.moves.keys()]:[];
      const name=keys.length>1?MIXED:keys[0]||hint||(current?UNKNOWN:'');
      return view={phase:current?'working':rest?'rest':'ready',tracking:true,name,
        reps:current?.moves.get(name)||0,cue:current||!timedMode?cue:'',
        liveMs:current?Math.max(0,at-current.start):0,restMs:rest?Math.max(0,at-rest.at):0,
        lastSet:rest?.set||null};
    }
    return {update,finish,pause,resume,view:()=>view};
  }

  window.GymSession={create,exerciseTracker,autoMoves,timed,quietMs,bilateral};
})();
