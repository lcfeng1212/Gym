(() => {
  const UNKNOWN = '動作無法確認';
  const MIXED = '複合健身';
  const CARDIO = '有氧運動';
  const timed = new Set([UNKNOWN,MIXED,CARDIO]);
  const autoMoves = ['滑輪坐姿划船','滑輪高位下拉','啞鈴側平舉'];
  const quietMs = 4500;

  function classify(points, move) {
    const pose = window.GymPose;
    const single = pose.sample(points,pose.supported(move));
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
      if (![lg,rg,le,re].every(Number.isFinite) || width<body*.48 || Math.min(le,re)<135) return null;
      return {...single,side:0,extended:Math.max(lg,rg)<25,bent:Math.min(lg,rg)>64,
        cue:Math.abs(lg-rg)>25&&Math.max(lg,rg)>48?'影像中左右抬起幅度不同，請核對鏡頭是否對正。':''};
    }
    const y=(wrist.y-shoulder.y)/body;
    const elbowY=(elbow.y-shoulder.y)/body;
    const x=Math.abs(wrist.x-shoulder.x)/body;
    const row=move===autoMoves[0];
    const extended=single.extended && (row?y>.12&&y<.85&&x>.37:y<-.56);
    const bent=single.bent && (row?y>.10&&y<.9&&elbowY>.13:y<.22&&elbowY>.04);
    return {...single,extended,bent,cue:''};
  }

  function exerciseTracker(hint) {
    const pose=window.GymPose;
    const candidates=hint?(pose.supported(hint)?[hint]:[]):autoMoves;
    const states=new Map();
    return {
      clear:()=>states.clear(),
      update(points) {
        const completed=[];
        let cue='';
        for(const move of candidates) {
          const state=states.get(move);
          const sample=hint?pose.sample(points,pose.supported(move)):classify(points,move);
          if (!sample || (state && state.side!==sample.side)) { states.delete(move); continue; }
          const phase=state?.phase||'start';
          const atEndpoint=phase==='work'?sample.bent:sample.extended;
          const frames=atEndpoint?(state?.frames||0)+1:0;
          if (sample.cue&&phase!=='start') cue=sample.cue;
          const next={phase,frames,side:sample.side};
          if(frames>=2) {
            next.frames=0;
            next.phase=phase==='start'||phase==='return'?'work':'return';
            if(phase==='return')completed.push(move);
          }
          states.set(move,next);
        }
        if(completed.length>1)states.clear();
        return {move:completed.length===1?completed[0]:null,cue};
      }
    };
  }

  function motionTracker() {
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

  function create({hint='',onSet=()=>{},onRest=()=>{}}={}) {
    const tracker=exerciseTracker(hint), motion=motionTracker();
    let current=null, rest=null, lastTracked=null, lostAt=null, view={phase:'ready', tracking:false};
    let pausedAt=null, pausedTotal=0;
    function pause(at) {
      if(pausedAt!==null)return;
      pausedAt=at;
      tracker.clear();
      motion.update([],at-pausedTotal);
      lastTracked=null;
    }
    function resume(at) {
      if(pausedAt===null)return;
      pausedTotal+=Math.max(0,at-pausedAt);
      pausedAt=null;
      if(current)current.quietFrom=at-pausedTotal;
    }
    function finish() {
      if(!current)return;
      const keys=[...current.moves.keys()];
      const name=timed.has(hint)?hint:keys.length===1?keys[0]:keys.length>1?MIXED:hint||UNKNOWN;
      const reps=timed.has(name)?null:(current.moves.get(name)||null);
      const end=Math.max(current.start+1,current.lastActive);
      const missing=current.gaps.reduce((sum,[start,stop])=>sum+Math.max(0,Math.min(end,stop)-Math.max(current.start,start)),0);
      const restAt=Math.max(end,current.gaps.at(-1)?.[1]??end);
      rest={at:restAt,id:onSet({name,reps,durationMs:Math.max(1,end-current.start-missing),trackingInterrupted:current.gaps.length>0||lostAt!==null})};
      current=null;
    }
    function update(points,at) {
      if(pausedAt!==null)return view;
      at-=pausedTotal;
      const signal=motion.update(points,at);
      if(!signal.tracking) {
        if(lostAt===null)lostAt=lastTracked??at;
        tracker.clear();
        return view={...view,tracking:false,phase:current?'working':rest?'rest':'ready',restMs:rest?Math.max(0,at-rest.at):0};
      }
      const gap=lostAt??(lastTracked!==null&&at-lastTracked>900?lastTracked:null);
      if(gap!==null&&current) {
        current.gaps.push([gap,at]);
        current.quietFrom=at;
        tracker.clear();
      }
      lostAt=null;
      lastTracked=at;
      const {move,cue}=tracker.update(points);
      const timedMode=Boolean(hint&&!window.GymPose.supported(hint));
      const canStart=move||signal.active&&(!rest||timedMode&&at-signal.onset>=3000);
      if(!current && canStart) {
        const start=Math.max(rest?.at||0,signal.onset||at);
        if(rest)onRest(rest.id,start-rest.at);
        rest=null;current={start,lastActive:at,quietFrom:at,gaps:[],moves:new Map()};
      }
      if(current) {
        if(signal.active)current.lastActive=Math.max(current.lastActive,signal.motionAt);
        if(move)current.lastActive=at;
        if(move)current.moves.set(move,(current.moves.get(move)||0)+1);
        if(at-Math.max(current.quietFrom,current.lastActive)>=quietMs){finish();tracker.clear();}
      }
      const keys=current?[...current.moves.keys()]:[];
      const name=keys.length>1?MIXED:keys[0]||hint||'';
      return view={phase:current?'working':rest?'rest':'ready',tracking:true,name,
        reps:current?.moves.get(name)||0,cue:current?cue:'',
        liveMs:current?Math.max(0,at-current.start):0,restMs:rest?Math.max(0,at-rest.at):0};
    }
    return {update,finish,pause,resume,view:()=>view};
  }

  window.GymSession={create,exerciseTracker,autoMoves,timed};
})();
