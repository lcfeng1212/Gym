(() => {
  'use strict';
  const el=id=>document.getElementById(id);
  const put=(id,value)=>{const node=el(id);if(node.textContent!==value)node.textContent=value;};
  const make=(tag,props={},...children)=>{const node=Object.assign(document.createElement(tag),props);node.append(...children);return node;};
  const {GymSession,GymCapture,GymPose,GymLibrary}=window;
  const guides=new Map((window.GYM_RESEARCH||[]).map(item=>[item.id,item]));
  const guideFor=item=>item?.guide?guides.get(item.guide):guides.get(window.GYM_GUIDE_MAP?.[item?.name]);
  const tz={timeZone:'Asia/Taipei'};

  // ── 設定 ─────────────────────────────────────────
  const settingsKey='gymmonitor.settings.1';
  const settings={count:true,cue:true,mirror:true,model:'lite',facing:'environment',setEnd:6};
  try{Object.assign(settings,JSON.parse(localStorage.getItem(settingsKey)||'{}'));}catch{}
  const saveSettings=()=>{try{localStorage.setItem(settingsKey,JSON.stringify(settings));}catch{}};
  el('voice-count').checked=settings.count;el('voice-cue').checked=settings.cue;el('mirror').checked=settings.mirror;
  el('model').value=GymCapture.models.includes(settings.model)?settings.model:'lite';
  el('voice-count').onchange=e=>{settings.count=e.target.checked;saveSettings();};
  el('voice-cue').onchange=e=>{settings.cue=e.target.checked;saveSettings();};
  el('mirror').onchange=e=>{settings.mirror=e.target.checked;saveSettings();applyMirror();};
  el('model').onchange=e=>{settings.model=e.target.value;saveSettings();};
  el('set-end').value=String(settings.setEnd);if(!el('set-end').value){settings.setEnd=6;el('set-end').value='6';}
  el('set-end').onchange=e=>{settings.setEnd=Number(e.target.value)||6;saveSettings();};

  // ── 紀錄 ─────────────────────────────────────────
  const key='gymmonitor.web.logs.1';
  let records=[];
  const pending=new Map();
  const pendingKey=key+'.pending';
  try {
    const queue=JSON.parse(localStorage.getItem(pendingKey)||'[]');
    if(Array.isArray(queue))for(const row of queue)if(row?.id)pending.set(row.id,row);
  } catch {}
  function refreshPending() {
    const count=pending.size;
    el('retry-save').hidden=!count;
    if(count)put('notice',count+' 組待儲存。可重試或從紀錄匯出備份。');
  }
  function journalPending() {
    try {
      if(pending.size)localStorage.setItem(pendingKey,JSON.stringify([...pending.values()]));
      else localStorage.removeItem(pendingKey);
    } catch {}
  }
  function flushPending() {
    if(!pending.size)return true;
    const saved=change(rows=>{
      const ids=new Set(rows.map(row=>row.id));
      return [...pending.values()].reverse().filter(row=>!ids.has(row.id)).concat(rows);
    });
    if(saved){
      pending.clear();
      journalPending();
      put('notice','待儲存組別已儲存。');
    }
    refreshPending();
    return saved;
  }
  function readRecords() {
    const result=JSON.parse(localStorage.getItem(key)||'[]');
    if(!Array.isArray(result))throw Error('無法讀取紀錄');
    return result;
  }
  try{records=readRecords();}catch{put('notice','此瀏覽器無法讀取訓練紀錄。');}
  function change(transform) {
    try {
      const next=transform(readRecords());
      localStorage.setItem(key,JSON.stringify(next)); records=next;
      renderLast();
      if(el('history').open)renderHistory();
      return true;
    } catch {put('notice','無法儲存訓練紀錄。請檢查瀏覽器儲存權限，或關閉私密瀏覽。');return false;}
  }
  const duration=ms=>{
    const seconds=Math.max(0,Math.floor(ms/1000));
    return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  };
  for(const item of GymLibrary.items)el('move-options').append(new Option(item.name));
  for(const name of GymSession.timed)el('move-options').append(new Option(name));
  put('auto-scope','不選動作時，可自動辨識：'+GymSession.autoMoves.join('、')+'。持續活動但無法辨識時會試記時間；動作庫標「可計次」的會自動數次數，其餘只記時間。正面拍時，彎舉、側平舉、腿彎舉、腿伸展的交替動作會左右分開計次。');

  // ── 語音 ─────────────────────────────────────────
  const speech=window.speechSynthesis;
  let voice=null,lastCue='',lastCueAt=0,restSpoken=0;
  function pickVoice(){
    const voices=speech?.getVoices?.()||[];
    voice=voices.find(v=>/zh[-_]TW/i.test(v.lang))||voices.find(v=>/zh[-_](HK|Hant)/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang))||null;
  }
  if(speech){pickVoice();speech.onvoiceschanged=pickVoice;}
  // 報數只會取代還沒念完的上一個報數；動作提醒、組完成提示不會被打斷
  let speakingKind='';
  function say(text,{kind='info'}={}){
    if(!speech||!text)return;
    try{
      if(kind==='count'&&speakingKind==='count'&&speech.speaking)speech.cancel();
      const u=new SpeechSynthesisUtterance(text);
      u.lang=voice?.lang||'zh-TW';if(voice)u.voice=voice;u.rate=1.1;
      u.onstart=()=>{speakingKind=kind;};u.onend=()=>{if(!speech.pending)speakingKind='';};
      speakingKind=kind;
      speech.speak(u);
    }catch{}
  }
  function unlockSpeech(){if(speech&&(settings.count||settings.cue)){try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;speech.speak(u);}catch{}}}

  // ── 螢幕常亮 ─────────────────────────────────────
  let wakeLock=null;
  async function keepAwake(){
    try{if(navigator.wakeLock&&!wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener?.('release',()=>{wakeLock=null;});}}catch{wakeLock=null;}
  }
  function releaseAwake(){try{wakeLock?.release();}catch{}wakeLock=null;}

  // ── 訓練狀態 ─────────────────────────────────────
  let workoutId=null,latestId=null,session=null,editing=null,hint='',shownMuscle=null;
  let selectedMove='',weightRowId=null;
  let facing=settings.facing==='user'?'user':'environment',activeFacing=null,usingVideo=false;
  let paused=false,resuming=false,lastSourceAt=null,clearFrames=0,lastView=null;
  function phase(value){el('viewport').parentElement.dataset.phase=value;}
  function applyMirror(){el('viewport').classList.toggle('mirror',settings.mirror&&!usingVideo&&activeFacing==='user');}
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
  function showLens(label=lensName(facing)) {
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
      activeFacing=result.facing;facing=result.facing;settings.facing=facing;saveSettings();
      applyMirror();
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
      return {...view,hint};
    },
    onEnd:stop
  });
  function start(file) {
    if(session)return;
    usingVideo=Boolean(file);activeFacing=null;applyMirror();
    paused=false;resuming=false;lastSourceAt=null;lastView=null;restSpoken=0;lastCue='';phase('ready');
    el('pause').hidden=false;el('pause').disabled=true;put('pause','暫停');
    el('move-input').hidden=true;
    el('lens-controls').hidden=usingVideo;el('switch-lens').disabled=!usingVideo;
    hint=selectedMove;
    workoutId=crypto.randomUUID();latestId=null;renderLast();
    session=GymSession.create({hint,setEndMs:settings.setEnd*1000,onSet:recordSet,onRest:recordRest,onRep});
    el('start').hidden=true;el('stop').hidden=false;el('options').hidden=true;el('legend').hidden=false;
    put('state',file?'準備影片分析…':'正開啟相機…');put('move',hint||'自動辨識');
    put('metric','—');put('cue','');put('notice','影像在裝置端分析，紀錄儲存在此瀏覽器。');
    showMuscle(hint);
    unlockSpeech();
    if(!file)void keepAwake();
    void capture.start({file,facing,model:settings.model});
  }
  function switchLens() {
    if(usingVideo||el('switch-lens').disabled)return;
    const previous=activeFacing;
    facing=opposite(facing);settings.facing=facing;saveSettings();
    if(!session||paused){showLens();return;}
    el('switch-lens').disabled=true;
    showLens('正在切換至'+lensName(facing));
    session.update([],performance.now());
    put('state','正在切換相機…');
    void capture.start({facing,previous,model:settings.model});
  }
  function togglePause(reason) {
    if(!session||(el('pause').disabled&&!reason))return;
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
        void keepAwake();
        void capture.start({facing,model:settings.model});
      }
      return;
    }
    paused=true;
    session.pause(usingVideo?(lastSourceAt??0):performance.now());
    if(usingVideo)capture.pauseVideo();
    else {capture.stop();activeFacing=null;applyMirror();el('switch-lens').disabled=false;}
    el('viewport').classList.add('is-paused');el('preview').hidden=false;el('pause').disabled=false;
    put('preview-title',reason||'訓練暫停');put('pause','繼續');put('state','已暫停');put('cue','');
    phase('paused');
  }
  function stop(message='訓練已結束。') {
    if(!session)return;
    capture.stop();session.finish();session=null;releaseAwake();
    flushPending();
    el('start').hidden=false;el('stop').hidden=true;el('options').hidden=false;el('legend').hidden=true;
    el('pause').hidden=true;paused=false;resuming=false;el('viewport').classList.remove('is-paused');
    put('preview-title','準備開始');phase('ready');
    el('preview').hidden=false;el('file').value='';
    usingVideo=false;activeFacing=null;applyMirror();
    el('lens-controls').hidden=false;el('switch-lens').disabled=false;showLens();
    el('move-input').hidden=false;
    refreshPending();
    put('state',message);put('move',selectedMove||'自動辨識');put('metric','—');put('cue','');
  }
  function onRep(move,count){
    if(settings.count)say(String(count),{kind:'count'});
  }
  function recordSet({name,reps,durationMs,trackingInterrupted,startAt,endAt,cue}) {
    const id=crypto.randomUUID();
    const now=new Date().toISOString();
    const epoch=typeof performance.timeOrigin==='number'?performance.timeOrigin:Date.now()-performance.now();
    const times=usingVideo?{source:'video',videoStartMs:startAt,videoEndMs:endAt}:
      {startTime:new Date(epoch+startAt).toISOString(),endTime:new Date(epoch+endAt).toISOString()};
    const row={id,workoutId,name,unit:reps===null?'minutes':'reps',amount:reps??durationMs/60000,
      durationMs,restMs:null,trackingInterrupted,weight:null,note:'',date:times.startTime||now,recordedAt:now,
      ...times,...(cue?{analysis:cue,analysisMove:name}:{})};
    pending.set(id,row);
    latestId=id;
    restSpoken=0;
    if(!flushPending())journalPending();
    renderLast();
    if(settings.count)say('這組完成'+(reps?'，'+reps+'下':'')+'，開始休息');
    return id;
  }
  function recordRest(id,restMs) {
    if(!id)return;
    if(pending.has(id)){
      pending.set(id,{...pending.get(id),restMs});
      if(!flushPending())journalPending();
      return;
    }
    change(rows=>rows.map(row=>row.id===id?{...row,restMs}:row));
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
    const text=tracking?cue:framing(points);
    put('cue',text);
    el('cue').classList.toggle('warn',Boolean(tracking&&cue));
    if(tracking&&cue&&settings.cue&&(cue!==lastCue||performance.now()-lastCueAt>6000)&&performance.now()-lastCueAt>2500){
      lastCue=cue;lastCueAt=performance.now();say(cue,{kind:'cue'});
    }
    if(phase==='rest'&&settings.count){
      const minute=Math.floor(restMs/60000);
      if(minute>restSpoken&&minute<=5){restSpoken=minute;say('休息'+minute+'分鐘');}
    }
    if(phase!=='rest')showMuscle(name||hint);
    lastView=view;
  }
  function description(row) {
    const time=row.durationMs?duration(row.durationMs):Number(row.amount.toFixed(2))+' 分鐘';
    if(row.unit==='reps')return row.amount+' 下';
    return GymPose.supported(row.name)?time+'（未數到次數，請核對）':time;
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

  // ── 修正／新增紀錄 ───────────────────────────────
  function edit(id){
    const row=records.find(r=>r.id===id);
    if(id&&!row)return;
    editing=id;
    deleteArmed=null;
    el('edit-name').value=row?.name||'';
    el('edit-reps').value=row?.unit==='reps'?row.amount:'';
    el('edit-minutes').value='';el('edit-weight').value=row?.weight??'';
    el('edit-note').value=row?.note||'';el('extra-edit').open=false;
    el('edit-delete').hidden=!row;
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
  el('edit-pick').onclick=()=>openPicker('rename');
  el('edit-delete').onclick=()=>{
    const id=editing;
    if(!id||!confirmDelete())return;
    if(change(rows=>rows.filter(row=>row.id!==id))){if(latestId===id)latestId=null;renderLast();el('editor').close();}
  };
  let deleteArmed=null;
  function confirmDelete(){
    if(deleteArmed?.id===editing&&Date.now()-deleteArmed.at<4000){deleteArmed=null;return true;}
    deleteArmed={id:editing,at:Date.now()};
    put('edit-error','再按一次「刪除這組」確認刪除。');
    return false;
  }
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
      [{id:crypto.randomUUID(),workoutId:session?workoutId:crypto.randomUUID(),source:'manual',date:new Date().toISOString(),...details},...rows])){
      put('edit-error','儲存失敗。');return;
    }
    el('editor').close();
  };

  // ── 紀錄清單（依日期分組，可複製給 Claude 寫日曆）────────
  const dayOf=iso=>new Date(iso).toLocaleDateString('sv-SE',tz);
  const timeOf=iso=>new Date(iso).toLocaleTimeString('zh-TW',{...tz,hour:'2-digit',minute:'2-digit',hour12:false});
  function summary(day,dayRows=records.filter(r=>dayOf(r.date)===day)){
    const rows=[...dayRows].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
    const counts=new Map();
    const lines=rows.map(r=>{
      const group=JSON.stringify([r.workoutId||r.id,r.name]);
      const n=(counts.get(group)||0)+1;counts.set(group,n);
      const span=Number.isFinite(Date.parse(r.startTime))&&Number.isFinite(Date.parse(r.endTime))?
        timeOf(r.startTime)+'–'+timeOf(r.endTime):'起訖未填';
      return span+'　'+r.name+'　第'+n+'組　'+description(r)+(r.analysis&&(!r.analysisMove||r.analysisMove===r.name)?'　觀察：'+r.analysis:'')+(r.weight==null?'':'　'+r.weight+' kg')+
        (r.restMs==null?'':'　休息 '+duration(r.restMs))+(r.trackingInterrupted?'　（有遮擋）':'')+(r.note?'　備註：'+r.note:'');
    });
    return 'GymMonitor 訓練紀錄｜'+day+'\n已記錄的起訖時間以台北時間顯示\n'+lines.join('\n');
  }
  async function copyText(text,button){
    try{await navigator.clipboard.writeText(text);button.textContent='已複製';}
    catch{
      const area=make('textarea',{value:text,readOnly:true,className:'copy-area'});
      button.after(area);area.select();button.textContent='請長按選取複製';
    }
    setTimeout(()=>{button.textContent='複製這天';},2500);
  }
  function renderHistory(){
    const list=el('records');list.replaceChildren();
    if(!records.length){list.textContent='尚無訓練紀錄。';return;}
    let day='';
    for(const row of records) {
      const rowDay=dayOf(row.date);
      if(rowDay!==day){
        day=rowDay;
        const copy=make('button',{className:'plain small',type:'button',textContent:'複製這天'});
        copy.onclick=()=>copyText(summary(rowDay),copy);
        list.append(make('div',{className:'day'},make('h3',{textContent:rowDay}),copy));
      }
      const name=make('strong',{textContent:row.name+'　'+description(row)+(row.weight==null?'':'　'+row.weight+' kg')});
      const details=make('small',{textContent:timeOf(row.date)+(row.restMs==null?'':'　休息 '+duration(row.restMs))+(row.trackingInterrupted?'　追蹤中斷':'')+(row.note?'　'+row.note:'')});
      const fix=make('button',{className:'plain',type:'button',textContent:'修正'});
      fix.onclick=()=>{el('history').close();edit(row.id);};
      const weightButton=make('button',{className:'plain',type:'button',textContent:'改重量'});
      weightButton.onclick=()=>editWeight(row.id);
      list.append(make('div',{className:'record'},make('div',{},name,details),make('div',{className:'record-actions'},weightButton,fix)));
    }
  }
  function editWeight(id){
    const row=records.find(r=>r.id===id);
    if(!row)return;
    weightRowId=id;
    put('weight-context',row.name+' · '+description(row)+' · '+new Date(row.date).toLocaleTimeString('zh-TW',tz));
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

  // ── 選擇運動（照截圖架構：全部／最近項目 → 部位 → 字母索引）────
  let pickerMode='pick',pickerView='home',pickerTab='all',pickerPart='';
  function openPicker(mode){
    pickerMode=mode;pickerView='home';pickerTab='all';pickerPart='';
    el('picker-search').value='';
    renderPicker();
    if(!el('picker').open)el('picker').showModal();
    el('picker-list').parentElement.scrollTop=0;
  }
  function recentItems(){
    const seen=new Set(),list=[];
    for(const row of records){
      if(seen.has(row.name))continue;seen.add(row.name);
      const item=GymLibrary.get(row.name);
      list.push(item||{name:row.name,parts:[],aliases:[],track:GymPose.supported(row.name),custom:true});
      if(list.length>=40)break;
    }
    return list;
  }
  function badge(item){
    const tags=[];
    if(item.track)tags.push(make('span',{className:'tag count',textContent:'可計次'}));
    if(GymSession.autoMoves.includes(item.name))tags.push(make('span',{className:'tag auto',textContent:'自動辨識'}));
    if(item.mine)tags.push(make('span',{className:'tag mine',textContent:'常做'}));
    return tags;
  }
  function row(item){
    const main=make('button',{type:'button',className:'row-main'},make('span',{className:'row-icon',ariaHidden:'true'}),
      make('span',{className:'row-name',textContent:item.name}),...badge(item));
    main.dataset.name=item.name;
    const wrap=make('div',{className:'row'},main);
    if(!item.custom){
      const info=make('button',{type:'button',className:'row-info',textContent:'ⓘ'});
      info.setAttribute('aria-label',item.name+' 說明');info.dataset.info=item.name;wrap.append(info);
    }
    return wrap;
  }
  function partRow(part,count){
    const button=make('button',{type:'button',className:'row-main part'},make('span',{className:'part-icon',textContent:part[0]}),
      make('span',{className:'row-name',textContent:part}),make('span',{className:'count-note',textContent:count+' 項'}));
    button.dataset.part=part;
    return make('div',{className:'row'},button);
  }
  function lettered(list,target,index){
    let letter='';
    const letters=[];
    for(const item of list){
      const l=item.letter||'#';
      if(l!==letter){letter=l;letters.push(l);target.append(make('h3',{className:'letter',id:'az-'+l,textContent:l}));}
      target.append(row(item));
    }
    index.replaceChildren(...letters.map(l=>{const b=make('button',{type:'button',textContent:l});b.dataset.letter=l;return b;}));
  }
  function renderPicker(){
    const list=el('picker-list'),index=el('picker-index');
    list.replaceChildren();index.replaceChildren();
    const query=el('picker-search').value.trim();
    const searching=pickerView==='search'||(pickerView==='part'&&query);
    put('picker-title',pickerView==='part'?pickerPart:pickerMode==='rename'?'選擇動作名稱':'選擇運動');
    el('picker-tabs').hidden=pickerView!=='home';
    el('picker-searchbar').hidden=pickerView==='home';
    el('picker-search-toggle').hidden=pickerView!=='home';
    el('picker-search').placeholder=pickerView==='part'?'搜尋'+pickerPart+'動作':'搜尋運動名稱（中文、英文都可）';
    for(const tab of el('picker-tabs').children)tab.setAttribute('aria-selected',String(tab.dataset.tab===pickerTab));
    if(pickerView==='home'&&pickerTab==='recent'){
      const recent=recentItems();
      if(recent.length){list.append(make('p',{className:'hint',textContent:'依最近紀錄排序'}));for(const item of recent)list.append(row(item));}
      else{
        list.append(make('p',{className:'hint',textContent:'這個瀏覽器還沒有紀錄。先列出你日曆中常做的動作：'}));
        for(const item of GymLibrary.mine().slice(0,40))list.append(row(item));
      }
      return;
    }
    if(pickerView==='home'){
      if(pickerMode==='pick'){
        const auto=make('button',{type:'button',className:'row-main auto-row'},make('span',{className:'part-icon',textContent:'自'}),
          make('span',{className:'row-name',textContent:'自動辨識'}),make('small',{textContent:GymSession.autoMoves.join('、')}));
        auto.dataset.auto='1';
        list.append(make('div',{className:'row'},auto));
      }
      for(const part of GymLibrary.parts)list.append(partRow(part,GymLibrary.inPart(part).length));
      list.append(make('div',{className:'divider'}));
      lettered(GymLibrary.items,list,index);
      return;
    }
    const pool=pickerView==='part'?GymLibrary.inPart(pickerPart):GymLibrary.items;
    if(searching){
      const hits=GymLibrary.search(query,pool);
      if(!hits.length){
        list.append(make('p',{className:'hint',textContent:'找不到「'+query+'」。'}));
        if(pickerMode!=='browse'){
          const custom=make('button',{type:'button',className:'row-main'},make('span',{className:'row-name',textContent:'直接使用「'+query+'」'}),make('small',{textContent:'不在動作庫，只記時間'}));
          custom.dataset.name=query;list.append(make('div',{className:'row'},custom));
        }
        return;
      }
      for(const item of hits.slice(0,300))list.append(row(item));
      if(hits.length>300)list.append(make('p',{className:'hint',textContent:'只顯示前 300 筆，請輸入更多字縮小範圍。'}));
      return;
    }
    lettered(pool,list,index);
  }
  function choose(name){
    if(pickerMode==='rename'){el('edit-name').value=name;editFields();el('picker').close();return;}
    if(pickerMode==='browse'){showDetail(name);return;}
    selectedMove=name;
    const item=GymLibrary.get(name);
    put('choose-move-name',name||'自動辨識');
    put('choose-move-note',!name?'划船、下拉、側平舉可計次；未知動作試記時間':item?.track?'可自動計次（'+item.track+'規則）':'這個動作只記時間與組數');
    put('move',name||'自動辨識');showMuscle(name);
    el('picker').close();el('detail').open&&el('detail').close();
  }
  el('picker-list').onclick=event=>{
    const target=event.target.closest('button');
    if(!target)return;
    if(target.dataset.info){showDetail(target.dataset.info);return;}
    if(target.dataset.part){pickerView='part';pickerPart=target.dataset.part;el('picker-search').value='';renderPicker();el('picker-list').parentElement.scrollTop=0;return;}
    if(target.dataset.auto){choose('');return;}
    if(target.dataset.name!=null)choose(target.dataset.name);
  };
  el('picker-tabs').onclick=event=>{
    const tab=event.target.closest('[data-tab]');
    if(!tab)return;
    pickerTab=tab.dataset.tab;renderPicker();el('picker-list').parentElement.scrollTop=0;
  };
  el('picker-back').onclick=()=>{
    if(pickerView==='home'){el('picker').close();return;}
    pickerView='home';el('picker-search').value='';renderPicker();
  };
  el('picker-search-toggle').onclick=()=>{pickerView='search';renderPicker();el('picker-search').focus();};
  let searchTimer=0;
  el('picker-search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(renderPicker,120);};
  // 字母索引：點或沿著拖動都會跳到該字母
  function jump(target){
    const letter=target?.dataset?.letter;
    const header=letter&&document.getElementById('az-'+letter);
    if(header)header.scrollIntoView({block:'start'});
  }
  el('picker-index').addEventListener('pointerdown',event=>{event.preventDefault();el('picker-index').setPointerCapture?.(event.pointerId);jump(document.elementFromPoint(event.clientX,event.clientY));});
  el('picker-index').addEventListener('pointermove',event=>{if(event.buttons||event.pointerType==='touch')jump(document.elementFromPoint(event.clientX,event.clientY));});

  // ── 動作說明 ─────────────────────────────────────
  let detailName='';
  function fact(label,value){return value?[make('dt',{textContent:label}),make('dd',{textContent:value})]:[];}
  function showDetail(name){
    const item=GymLibrary.get(name);
    detailName=item?.name||name;
    put('d-name',detailName);
    const english=item?.aliases.filter(a=>/[a-z]/i.test(a)&&/\s|-/.test(a))||[];
    const others=item?.aliases.filter(a=>!english.includes(a)&&!/^[a-z]+$/i.test(a))||[];
    put('d-aliases',[others.length?'也稱：'+others.join('、'):'',english.length?'英文：'+english.join('／'):''].filter(Boolean).join('　'));
    el('d-badges').replaceChildren(...(item?[...item.parts.map(p=>make('span',{className:'tag',textContent:p})),...badge(item),
      item.track?null:make('span',{className:'tag quiet',textContent:'只記時間'})].filter(Boolean):[]));
    const photo=GymLibrary.photoId(item);
    el('d-photos').hidden=!photo;
    if(photo){el('d-img0').src=GymLibrary.image(item,0);el('d-img1').src=GymLibrary.image(item,1);}
    el('d-similar').hidden=!item?.similar;
    if(item?.similar)put('d-similar','照片、肌群與原文步驟取自相近動作「'+(window.GYM_LIBRARY.items.find(r=>r.f===item.similar)?.n||item.similar)+'」，器材或握法可能和你做的不同。');
    el('d-facts').replaceChildren(
      ...fact('主要肌群',item?.primary.length?item.primary.map(GymLibrary.muscleLabel).join('、')+(item.similar?'（相近動作）':''):''),
      ...fact('協同肌群',item?.secondary.length?item.secondary.map(GymLibrary.muscleLabel).join('、'):''),
      ...fact('器材',item?.equipment),...fact('難度',item?.level),...fact('類型',item?.type),
      ...fact('計次方式',item?.track?'依「'+item.track+'」關節角度計次（實驗）':'只記時間與組數'));
    const guide=guideFor(item);
    el('d-guide').hidden=!guide;
    if(guide){put('d-cue',guide.cue||'');const a=el('d-source');a.hidden=!guide.url;if(guide.url){a.href=guide.url;a.textContent='來源：'+(guide.source||guide.url);}}
    const observation=window.GYM_OBSERVATIONS?.[detailName]||window.GYM_OBSERVATIONS?.[name];
    el('d-camera').hidden=!observation;
    if(observation)put('d-camera-text','建議從'+observation[0]+'拍，讓'+observation[1]+'入鏡。可留意：'+observation[2]);
    el('d-steps').hidden=!photo;el('d-steps').open=false;el('d-step-list').replaceChildren();
    const nothing=!photo&&!guide;
    el('d-empty').hidden=!nothing;
    put('d-empty',item?.screenshot?'這是你手錶 App 清單中的動作名稱，免費資料庫沒有對應的照片與說明。':'免費資料庫沒有對應的照片與說明。');
    const canUse=!session||pickerMode==='rename';
    el('d-use').hidden=!canUse;
    put('d-use',pickerMode==='rename'?'用這個名稱':'選用這個動作');
    el('detail').showModal();
  }
  el('d-steps').addEventListener('toggle',async()=>{
    if(!el('d-steps').open||el('d-step-list').children.length)return;
    const item=GymLibrary.get(detailName);
    el('d-step-list').replaceChildren(make('li',{textContent:'載入中…'}));
    try{
      const steps=await GymLibrary.steps(item);
      el('d-step-list').replaceChildren(...(steps||['無資料']).map(text=>make('li',{textContent:text})));
    }catch{el('d-step-list').replaceChildren(make('li',{textContent:'載入失敗，請確認網路。'}));}
  });
  el('d-use').onclick=()=>{
    el('detail').close();
    if(pickerMode==='browse')pickerMode='pick';
    choose(detailName);
  };
  for(const id of ['d-img0','d-img1','demo-start','demo-end'])el(id).onerror=event=>{event.target.closest('figure').hidden=true;};
  for(const id of ['d-img0','d-img1','demo-start','demo-end'])el(id).onload=event=>{event.target.closest('figure').hidden=false;};

  // ── 目標肌群面板 ─────────────────────────────────
  function showMuscle(name){
    if(shownMuscle===name)return;
    shownMuscle=name;
    const item=name?GymLibrary.get(name):null,guide=guideFor(item);
    el('muscles').hidden=!item;
    if(!item)return;
    const {primary,secondary}=GymLibrary.muscles(item);
    put('muscle-title',item.name);
    const photo=GymLibrary.photoId(item);
    el('demo-photos').hidden=!photo;
    if(photo){el('demo-start').src=GymLibrary.image(item,0);el('demo-end').src=GymLibrary.image(item,1);}
    el('similar-note').hidden=!item.similar;
    put('primary-muscle',primary.length?'紅色・主要：'+primary.map(GymLibrary.muscleLabel).join('、')+(item.primary.length?'':'（依部位推估）'):'');
    put('secondary-muscle',secondary.length?'藍色・協同：'+secondary.map(GymLibrary.muscleLabel).join('、'):'');
    put('setup',guide?.cue||'');
  }
  el('muscle-detail').onclick=()=>{if(shownMuscle){pickerMode='pick';showDetail(shownMuscle);}};

  // ── 事件 ─────────────────────────────────────────
  el('start').onclick=()=>start();
  el('pause').onclick=()=>togglePause();
  el('switch-lens').onclick=switchLens;showLens();
  el('stop').onclick=()=>stop();
  el('pick').onclick=()=>el('file').click();
  el('file').onchange=event=>{const file=event.target.files?.[0];if(file)start(file);};
  el('choose-move').onclick=()=>openPicker('pick');
  el('edit-last').onclick=()=>edit(latestId);
  el('open-history').onclick=()=>{renderHistory();el('history').showModal();};
  el('manual').onclick=()=>{el('history').close();edit(null);};
  el('open-library').onclick=()=>openPicker('browse');
  document.querySelectorAll('[data-close]').forEach(button=>{button.onclick=()=>el(button.dataset.close).close();});
  // 切到背景（鎖定、切 App）時先暫停，回來按「繼續」接著練，不會直接結束
  document.addEventListener('visibilitychange',()=>{
    if(!session)return;
    if(document.hidden){if(!paused&&!usingVideo)togglePause('切到背景，已暫停');else if(usingVideo&&!paused)togglePause('切到背景，已暫停');}
    else if(!paused)void keepAwake();
  });
  window.addEventListener('pagehide',()=>{if(session)stop('離開頁面，已結束這次訓練。');});
  el('retry-save').onclick=flushPending;
  flushPending();
  function backupRows(){
    const backup=new Map(records.map(row=>[row.id,row]));
    for(const row of pending.values())if(!backup.has(row.id))backup.set(row.id,row);
    return [...backup.values()];
  }
  function downloadBackup(content,extension,type){
    const url=URL.createObjectURL(new Blob([content],{type}));
    const link=make('a',{href:url,download:'GymMonitor-'+dayOf(new Date())+'.'+extension});
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  el('export').onclick=()=>downloadBackup(JSON.stringify(backupRows(),null,2),'json','application/json');
  el('export-text').onclick=()=>{
    const days=new Map();
    for(const row of backupRows()){
      const day=dayOf(row.date);
      if(!days.has(day))days.set(day,[]);
      days.get(day).push(row);
    }
    const reports=[...days.keys()].sort().map(day=>summary(day,days.get(day)));
    downloadBackup(reports.join('\n\n')||'目前沒有訓練紀錄。','txt','text/plain;charset=utf-8');
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
  // ── 離線快取 ─────────────────────────────────────
  // 加入主畫面後，iPhone 才不會在 7 天沒開時清掉快取與紀錄
  const secure=location.protocol==='https:'||location.hostname==='localhost';
  const offlineReady=('serviceWorker' in navigator)&&('caches' in window)&&secure;
  if(offlineReady)navigator.serviceWorker.register('sw.js').catch(()=>{});
  async function offlineStatus(){
    if(!offlineReady){put('offline-state',secure?'此瀏覽器不支援離線使用':'離線快取只在正式網址（https）啟用');el('offline').disabled=true;return;}
    try{
      const model=await caches.match(GymCapture.modelUrl(settings.model));
      const sdk=await caches.match(GymCapture.sdk+'/vision_bundle.mjs');
      const wasmFiles=await Promise.all(['vision_wasm_internal','vision_wasm_nosimd_internal'].map(async name=>{
        const prefix=GymCapture.sdk+'/wasm/'+name;
        return (await caches.match(prefix+'.js'))&&(await caches.match(prefix+'.wasm'));
      }));
      put('offline-state',model&&sdk&&wasmFiles.some(Boolean)?'已下載（'+(settings.model==='full'?'完整':'輕量')+'模型），沒網路也能用':'尚未下載，約 15–19 MB');
    }catch{put('offline-state','無法確認離線資料狀態');}
  }
  el('offline').onclick=async()=>{
    const button=el('offline');button.disabled=true;put('offline-state','下載中…請保持網路連線');
    try{
      if(offlineReady)await navigator.serviceWorker.ready;
      try{await navigator.storage?.persist?.();}catch{}
      await GymCapture.preload(settings.model);
      await fetch('fedb-steps.json').catch(()=>{});
      // 你日曆常做動作的照片
      const urls=GymLibrary.mine().filter(i=>GymLibrary.photoId(i)).flatMap(i=>[GymLibrary.image(i,0),GymLibrary.image(i,1)]);
      let done=0;
      for(let i=0;i<urls.length;i+=6){
        await Promise.all(urls.slice(i,i+6).map(u=>fetch(u,{mode:'cors'}).then(response=>{if(response.ok)done++;}).catch(()=>{})));
        put('offline-state','下載照片 '+done+'／'+urls.length);
      }
      await offlineStatus();
      el('offline-state').textContent+=' · 照片 '+done+'／'+urls.length;
    }catch{put('offline-state','下載失敗，請確認網路後再試。');}
    button.disabled=false;
  };
  el('model').addEventListener('change',()=>void offlineStatus());
  void offlineStatus();

  window.GymApp={openPicker,showDetail,choose,state:()=>({selectedMove,session:Boolean(session),paused,lastView})};
})();
