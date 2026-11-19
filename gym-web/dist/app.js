(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  const put=(id,value)=>{if(el(id).textContent!==value)el(id).textContent=value;};
  const {GymSession,GymCapture,GymPose}=window;
  const catalog=window.catalog||[];
  const guides=new Map((window.GYM_RESEARCH||[]).map(item=>[item.id,item]));
  const guideFor=name=>guides.get(window.GYM_GUIDE_MAP?.[name]);
  const names=[...new Set([...catalog.map(x=>x.name),'深蹲','伏地挺身','二頭彎舉','啞鈴平板臥推','單手啞鈴划船',...GymSession.timed])];
  for(const name of names)el('move-options').append(new Option(name));
  put('auto-scope','自動辨識：'+GymSession.autoMoves.join('、')+'。其他動作可選填提示或只記時間。');
  const key='gymmonitor.web.logs.1';
  let records=[], storageAvailable=true;
  function readRecords() {
    const result=JSON.parse(localStorage.getItem(key)||'[]');
    if(!Array.isArray(result))throw Error('無法讀取紀錄');
    return result;
  }
  try{records=readRecords();}catch{storageAvailable=false;put('notice','此瀏覽器無法讀取訓練紀錄。');}
  function change(transform) {
    if(!storageAvailable)return false;
    try {
      const next=transform(readRecords());
      localStorage.setItem(key,JSON.stringify(next)); records=next;
      renderLast();
      if(el('history').open)renderHistory();
      return true;
    } catch {put('notice','無法儲存訓練紀錄。請檢查瀏覽器儲存權限。');return false;}
  }
  const duration=ms=>{
    const seconds=Math.max(0,Math.floor(ms/1000));
    return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  };
  let workoutId=null,latestId=null,session=null,editing=null,hint='',shownMuscle=null;
  let selectedMove='',pickerGroup='',weightRowId=null;
  let facing='environment',activeFacing=null,usingVideo=false;
  let paused=false,resuming=false,lastSourceAt=null,clearFrames=0;
  function phase(value){el('viewport').parentElement.dataset.phase=value;}
  function framing(points) {
    const visible=points.map(p=>GymPose.visible(p));
    if(!visible.some(Boolean))return '尚未看到人物，請站進畫面。';
    if(!visible[11]&&!visible[12])return '肩膀看不清楚，請調整取景。';
    if(!visible[23]&&!visible[24])return '髖部看不清楚，請拉遠手機或調低角度。';
    if(hint.includes('下拉')&&!visible[15]&&!visible[16])return '手腕看不清楚，請預留手舉高的空間。';
    return '關節看不清楚，請調整角度或避開器材遮擋。';
  }
  const lensName=value=>value==='user'?'前鏡頭':'後鏡頭';
  const opposite=value=>value==='user'?'environment':'user';
  function showLens(label= lensName(facing)) {
    put('lens-state',label);
    put('switch-lens','切換至'+lensName(opposite(facing)));
  }
  const capture=GymCapture.create(el('video'),el('overlay'),{
    onStatus:message=>put('state',message),
    onPreview(result) {
      el('preview').hidden=true;
      clearFrames=0;
      el('pause').disabled=false;
      if(result.file)return;
      activeFacing=result.facing;facing=result.facing;
      showLens(result.fallback?'切換失敗，已回到原相機':
        result.confirmed?lensName(facing):'相機已開啟 · 方向無法確認');
      el('switch-lens').disabled=false;
    },
    onFrame(points,at){
      if(!session||paused)return {cue:''};
      el('preview').hidden=true;
      if(resuming){session.resume(at);resuming=false;}
      lastSourceAt=at;
      const view=session.update(points,at);
      clearFrames=view.tracking?Math.min(2,clearFrames+1):0;
      renderLive(view,points);
      return view;
    },
    onEnd:stop
  });
  function start(file) {
    if(session)return;
    usingVideo=Boolean(file);activeFacing=null;
    paused=false;resuming=false;lastSourceAt=null;phase('ready');
    el('pause').hidden=false;el('pause').disabled=true;put('pause','暫停');
    el('move-input').hidden=true;
    el('lens-controls').hidden=usingVideo;el('switch-lens').disabled=!usingVideo;
    hint=selectedMove;
    workoutId=crypto.randomUUID();latestId=null;renderLast();
    session=GymSession.create({hint,onSet:recordSet,onRest:recordRest});
    el('start').hidden=true;el('stop').hidden=false;el('options').hidden=true;
    put('state',file?'準備影片分析…':'正開啟相機…');put('move',hint||'自動辨識');
    put('metric','—');put('cue','');put('notice','影像在裝置端分析，紀錄儲存在此瀏覽器。');
    showMuscle(hint);
    void capture.start({file,facing});
  }
  function switchLens() {
    if(usingVideo||el('switch-lens').disabled)return;
    const previous=activeFacing;
    facing=opposite(facing);
    if(!session||paused){showLens();return;}
    el('switch-lens').disabled=true;
    showLens('正在切換至'+lensName(facing));
    session.update([],performance.now());
    put('state','正在切換相機…');
    void capture.start({facing,previous});
  }
  function togglePause() {
    if(!session||el('pause').disabled)return;
    if(paused){
      paused=false;resuming=true;
      clearFrames=0;
      el('viewport').classList.remove('is-paused');
      put('preview-title','準備取景');put('pause','暫停');put('state','正在恢復取景…');
      if(usingVideo){
        el('preview').hidden=true;
        void capture.resumeVideo().catch(()=>stop('影片無法繼續播放。'));
      }else{
        el('pause').disabled=true;el('switch-lens').disabled=true;
        void capture.start({facing});
      }
      return;
    }
    paused=true;
    session.pause(usingVideo?(lastSourceAt??0):performance.now());
    if(usingVideo)capture.pauseVideo();
    else {capture.stop();activeFacing=null;el('switch-lens').disabled=false;}
    el('viewport').classList.add('is-paused');el('preview').hidden=false;
    put('preview-title','訓練暫停');put('pause','繼續');put('state','已暫停');put('cue','');
    phase('paused');
  }
  function stop(message='訓練已結束。') {
    if(!session)return;
    capture.stop();session.finish();session=null;
    el('start').hidden=false;el('stop').hidden=true;el('options').hidden=false;
    el('pause').hidden=true;paused=false;resuming=false;el('viewport').classList.remove('is-paused');
    put('preview-title','準備開始');phase('ready');
    el('preview').hidden=false;el('file').value='';
    usingVideo=false;activeFacing=null;
    el('lens-controls').hidden=false;el('switch-lens').disabled=false;showLens();
    el('move-input').hidden=false;
    put('state',message);put('move',selectedMove||'自動辨識');put('metric','—');put('cue','');
  }
  function recordSet({name,reps,durationMs,trackingInterrupted}) {
    const id=crypto.randomUUID();
    const row={id,workoutId,name,unit:reps===null?'minutes':'reps',amount:reps??durationMs/60000,
      durationMs,restMs:null,trackingInterrupted,weight:null,note:'',date:new Date().toISOString()};
    if(change(rows=>[row,...rows])){latestId=id;renderLast();return id;}
    return null;
  }
  function recordRest(id,restMs) {
    if(id)change(rows=>rows.map(row=>row.id===id?{...row,restMs}:row));
  }
  function setIndex(name,id) {
    const completed=records.filter(r=>r.workoutId===workoutId&&r.name===name);
    return id?completed.slice(completed.findIndex(row=>row.id===id)).length:completed.length+1;
  }
  function renderLive(view,points) {
    const {phase,tracking,name,reps,liveMs,restMs,cue}=view;
    el('viewport').parentElement.dataset.phase=phase;
    put('state',!tracking?'調整取景':phase==='rest'?'休息中':
      phase==='working'?(name?'第 '+setIndex(name)+' 組':'辨識中'):
      clearFrames<2?'取景確認中':'可以開始 · 等待第一下');
    put('move',phase==='rest'?'組間休息':name||hint||(phase==='working'?'辨識中':'自動辨識'));
    put('metric',phase==='rest'?duration(restMs):phase==='working'?(reps?reps+' 下':duration(liveMs)):'—');
    put('cue',tracking?cue:framing(points));
    if(phase!=='rest')showMuscle(name||hint);
  }
  function description(row) {
    return row.unit==='reps'?row.amount+' 下':row.durationMs?duration(row.durationMs):Number(row.amount.toFixed(2))+' 分鐘';
  }
  function renderLast() {
    const row=records.find(r=>r.id===latestId);
    put('last-move',row?.name||'尚無本次紀錄');
    put('last-detail',row?'第 '+setIndex(row.name,row.id)+' 組　·　'+description(row)+(row.trackingInterrupted?'　·　有遮擋，請核對':''):'');
    el('edit-last').hidden=!row;
    el('quick-set').hidden=!row;
    if(!row)return;
    el('quick-reps').hidden=row.unit!=='reps';
    put('quick-count',row.unit==='reps'?row.amount+' 下':'');
    el('rep-minus').disabled=row.amount<=1;
    el('rep-plus').disabled=row.amount>=999;
    const weight=el('quick-weight');
    if(weight.dataset.row!==row.id||document.activeElement!==weight){
      weight.value=row.weight??'';
      weight.dataset.row=row.id;
    }
    const prior=previousWeight(row);
    el('same-weight').hidden=prior===null;
    put('same-weight',prior===null?'':'同上一組 · '+prior+' kg');
  }
  function previousWeight(row) {
    const index=records.findIndex(r=>r.id===row.id);
    const previous=records.slice(index+1).find(r=>r.workoutId===row.workoutId&&r.name===row.name);
    return Number.isFinite(previous?.weight)&&previous.weight>=0?previous.weight:null;
  }
  function reviseLast(transform){
    const id=latestId;
    if(id)change(rows=>rows.map(row=>row.id===id?transform(row):row));
  }
  function adjustRep(delta){
    reviseLast(row=>row.unit==='reps'?{...row,amount:Math.max(1,Math.min(999,row.amount+delta))}:row);
  }
  el('rep-minus').onclick=()=>adjustRep(-1);
  el('rep-plus').onclick=()=>adjustRep(1);
  el('quick-weight').onchange=event=>{
    const field=event.target;
    const id=field.dataset.row;
    if(!id||!field.validity.valid)return;
    const weight=field.value===''?null:field.valueAsNumber;
    if(weight!==null&&(!Number.isFinite(weight)||weight<0))return;
    change(rows=>rows.map(row=>row.id===id?{...row,weight}:row));
  };
  el('same-weight').onclick=()=>{
    const row=records.find(r=>r.id===latestId);
    const weight=row?previousWeight(row):null;
    if(weight!==null)reviseLast(record=>({...record,weight}));
  };
  function edit(id){
    const row=records.find(r=>r.id===id);
    if(id&&!row)return;
    editing=id;
    el('edit-name').value=row?.name||'';
    el('edit-reps').value=row?.unit==='reps'?row.amount:'';
    el('edit-minutes').value='';el('edit-weight').value=row?.weight??'';
    el('edit-note').value=row?.note||'';el('extra-edit').open=false;
    put('edit-error','');put('edit-duration',row?.durationMs?'活動時長 '+duration(row.durationMs):'');
    editFields();el('editor').showModal();
  }
  function editFields(){
    el('rep-field').hidden=GymSession.timed.has(el('edit-name').value.trim());
    el('edit-reps').disabled=el('rep-field').hidden;
    el('manual-duration').hidden=Boolean(editing);
    el('edit-minutes').disabled=Boolean(editing);
  }
  el('edit-name').oninput=editFields;
  el('edit-form').onsubmit=event=>{
    event.preventDefault();
    const row=records.find(r=>r.id===editing);
    if(editing&&!row)return;
    const name=el('edit-name').value.trim();
    if(!name){put('edit-error','請輸入動作名稱。');return;}
    const reps=!GymSession.timed.has(name)&&el('edit-reps').value?Number(el('edit-reps').value):null;
    const manualTime=el('edit-minutes').value?Number(el('edit-minutes').value):null;
    const minutes=row?.durationMs?row.durationMs/60000:row?.unit==='minutes'?row.amount:manualTime;
    if(reps===null&&!minutes){put('edit-error',row?'這筆原始紀錄沒有時長，請保留次數。':'請輸入次數或時長。');return;}
    const details={name,unit:reps===null?'minutes':'reps',amount:reps??minutes,
      weight:el('edit-weight').value===''?null:Number(el('edit-weight').value),note:el('edit-note').value.trim()};
    if(!change(rows=>row?rows.map(r=>r.id===editing?{...r,...details}:r):
      [{id:crypto.randomUUID(),date:new Date().toISOString(),...details},...rows])){
      put('edit-error','儲存失敗。');return;
    }
    el('editor').close();
  };
  function renderHistory(){
    const list=el('records');list.replaceChildren();
    if(!records.length){list.textContent='尚無訓練紀錄。';return;}
    for(const row of records) {
      const entry=document.createElement('div'),body=document.createElement('div');
      const name=document.createElement('strong'),details=document.createElement('small'),button=document.createElement('button');
      entry.className='record';name.textContent=row.name+'　'+description(row)+(row.weight==null?'':'　'+row.weight+' kg');
      details.textContent=new Date(row.date).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+
        (row.restMs==null?'':'　休息 '+duration(row.restMs))+(row.trackingInterrupted?'　追蹤中斷':'')+(row.note?'　'+row.note:'');
      button.className='plain';button.textContent='修正';button.onclick=()=>{el('history').close();edit(row.id);};
      const actions=document.createElement('div'),weightButton=document.createElement('button');
      actions.className='record-actions';weightButton.className='plain';weightButton.textContent='改重量';
      weightButton.onclick=()=>editWeight(row.id);
      actions.append(weightButton,button);
      body.append(name,details);entry.append(body,actions);list.append(entry);
    }
  }
  function editWeight(id){
    const row=records.find(r=>r.id===id);
    if(!row)return;
    weightRowId=id;
    put('weight-context',row.name+' · '+description(row)+' · '+new Date(row.date).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei'}));
    const field=el('weight-value');field.value=row.weight??'';
    put('weight-error','');el('weight-editor').showModal();field.focus();
  }
  el('weight-form').onsubmit=event=>{
    event.preventDefault();
    const field=el('weight-value');
    const weight=field.value===''?null:field.valueAsNumber;
    if(!field.validity.valid||weight!==null&&(!Number.isFinite(weight)||weight<0)){
      put('weight-error','請輸入有效重量，或清空重量。');return;
    }
    const id=weightRowId;
    if(id&&change(rows=>rows.map(row=>row.id===id?{...row,weight}:row)))el('weight-editor').close();
    else put('weight-error','重量未儲存，請再試一次。');
  };
  const addedGroups={'深蹲':'腿前','伏地挺身':'胸','二頭彎舉':'手臂','啞鈴平板臥推':'胸','單手啞鈴划船':'背'};
  const pickerItems=names.map(name=>({name,group:catalog.find(item=>item.name===name)?.group||
    (GymSession.timed.has(name)?'計時活動':addedGroups[name]||'其他')}));
  const pickerGroups=[...new Set(pickerItems.map(item=>item.group))];
  function chooseMove(name){
    selectedMove=name;put('choose-move',name||'自動辨識');
    put('move',name||'自動辨識');showMuscle(name);
    el('move-picker').close();
  }
  function renderPicker(){
    const query=el('picker-search').value.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list=el('picker-list');list.replaceChildren();
    const browsing=!query.length&&!pickerGroup;
    el('picker-back').hidden=!pickerGroup&&!query.length;
    put('picker-scope',query.length?'搜尋結果':pickerGroup||'依類別瀏覽');
    function add(label,onClick){
      const button=document.createElement('button');
      button.type='button';button.className='plain';button.textContent=label;button.onclick=onClick;
      list.append(button);
    }
    if(browsing){
      for(const group of pickerGroups)add(group,()=>{pickerGroup=group;renderPicker();});
      return;
    }
    const filtered=pickerItems.filter(item=>{
      const searchable=(item.name+' '+(window.GYM_SEARCH_ALIASES?.[item.name]||'')).normalize('NFKC').toLowerCase();
      return query.length?query.every(word=>searchable.includes(word)):item.group===pickerGroup;
    });
    for(const item of filtered)add(item.name,()=>chooseMove(item.name));
    if(!filtered.length)put('picker-list','找不到符合的動作。');
  }
  function renderLibrary(){
    const query=el('search').value.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const items=catalog.filter(x=>query.every(word=>(x.name+' '+(window.GYM_SEARCH_ALIASES?.[x.name]||'')).toLowerCase().includes(word)));
    const list=el('library-list');list.replaceChildren();el('guide').hidden=true;
    if(!items.length){list.textContent='找不到符合的動作。';return;}
    for(const item of items){
      const button=document.createElement('button');button.className='plain';
      button.textContent=item.name;
      button.onclick=()=>{
        const guide=guideFor(item.name), observation=window.GYM_OBSERVATIONS?.[item.name];
        put('guide-name',item.name);put('guide-cue',guide?.cue||'目前無法確認操作資料。');
        put('guide-camera',observation?observation[0]+'拍攝。'+observation[2]:'');
        el('guide-source').hidden=!guide?.url;
        if(guide?.url)el('guide-source').href=guide.url;
        el('guide').hidden=false;
      };
      list.append(button);
    }
  }
  const muscleProfiles={
    '坐姿划船':['闊背肌、上背','肘屈肌、三角肌後束','坐穩，雙手伸向握把。'],
    '高位下拉':['闊背肌','肘屈肌、肩胛周圍肌群','坐穩，讓雙手從上方起始。'],
    '側平舉':['三角肌中束','','站穩，雙臂自然垂於身側。'],
    '引體向上':['闊背肌','肘屈肌、肩胛周圍肌群','握好握把，從手臂伸展的位置起始。'],
    '腿推':['股四頭肌','臀大肌','坐穩，雙腳放在踏板上。'],
    '臀推':['臀大肌','腿後側肌群','腳掌踩穩，從髖部下放的位置起始。'],
    '胸推':['胸大肌','三角肌前束、肱三頭肌','側面保留手腕、肘與肩入鏡。']
  };
  function showMuscle(name){
    if(shownMuscle===name)return;
    shownMuscle=name;
    const profile=muscleProfiles[GymPose.supported(name)],guide=guideFor(name),demo=window.GymDemo.find(name);
    el('muscles').hidden=!profile&&!guide&&!demo;
    if(el('muscles').hidden)return;
    const [main,assist,setup]=profile||[guide?.muscles,'',guide?.cue];
    el('demo-photos').hidden=!demo;
    if(demo){
      el('demo-start').src='demo/'+demo.id+'-0.jpg';
      el('demo-end').src='demo/'+demo.id+'-1.jpg';
      put('demo-credit',demo.label+' · Free Exercise DB');
    }
    put('setup',setup||'');put('primary-muscle',main?'主要 · '+main:'');
    put('secondary-muscle',assist?'協同 · '+assist:'');
  }
  el('start').onclick=()=>start();
  el('pause').onclick=togglePause;
  el('switch-lens').onclick=switchLens;showLens();
  el('stop').onclick=()=>stop();
  el('pick').onclick=()=>el('file').click();
  el('file').onchange=event=>{const file=event.target.files?.[0];if(file)start(file);};
  el('choose-move').onclick=()=>{
    pickerGroup='';el('picker-search').value='';renderPicker();el('move-picker').showModal();
  };
  el('picker-search').oninput=renderPicker;
  el('picker-back').onclick=()=>{pickerGroup='';el('picker-search').value='';renderPicker();};
  el('pick-auto').onclick=()=>chooseMove('');
  el('edit-last').onclick=()=>edit(latestId);
  el('open-history').onclick=()=>{renderHistory();el('history').showModal();};
  el('manual').onclick=()=>{el('history').close();edit(null);};
  el('open-library').onclick=()=>{renderLibrary();el('library').showModal();};
  el('search').oninput=renderLibrary;
  document.querySelectorAll('[data-close]').forEach(button=>{button.onclick=()=>el(button.dataset.close).close();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('切到背景，已結束這次訓練。');});
  el('export').onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(records,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='GymMonitor-web.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  el('import').onchange=async event=>{
    try{
      const rows=JSON.parse(await event.target.files[0].text());
      if(!Array.isArray(rows)||!rows.every(row=>row&&typeof row.id==='string'&&typeof row.name==='string'
        &&Number.isFinite(Date.parse(row.date))&&['minutes','reps'].includes(row.unit)
        &&Number.isFinite(row.amount)&&row.amount>0&&(row.unit==='minutes'||Number.isInteger(row.amount))))throw Error();
      let added=0;
      if(!change(existing=>{
        const ids=new Set(existing.map(row=>row.id));
        const unique=rows.filter(row=>{if(ids.has(row.id))return false;ids.add(row.id);return true;});
        added=unique.length;
        return [...unique,...existing].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
      }))throw Error();
      put('importmsg','已加入 '+added+' 筆紀錄。');
    }catch{put('importmsg','匯入失敗。請使用 GymMonitor 的 JSON 備份。');}
    event.target.value='';
  };
})();
