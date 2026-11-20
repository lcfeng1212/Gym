(() => {
  const sdk='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const models={
    lite:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    full:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
  };
  const edges=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
  // 姿態模型只載入一次，切換鏡頭、暫停後繼續都沿用，避免每次重新下載
  const detectors=new Map();
  function detector(kind) {
    if(!detectors.has(kind)) {
      const loading=(async()=>{
        const {FilesetResolver,PoseLandmarker}=await import(sdk+'/vision_bundle.mjs');
        const files=await FilesetResolver.forVisionTasks(sdk+'/wasm');
        return PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:models[kind]||models.lite,delegate:'CPU'},
          runningMode:'VIDEO',numPoses:1});
      })();
      loading.catch(()=>detectors.delete(kind));
      detectors.set(kind,loading);
    }
    return detectors.get(kind);
  }
  let lastStamp=0;
  function create(video,canvas,{onFrame,onEnd,onStatus,onPreview=()=>{}}) {
    let revision=0,stream=null,url=null,frame=0;
    const draw=canvas.getContext('2d');
    function stop() {
      revision++; cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track=>track.stop());
      stream=null;
      video.onended=null;video.onerror=null;video.pause();video.srcObject=null;video.removeAttribute('src');video.load();
      if(url)URL.revokeObjectURL(url);
      url=null;draw.clearRect(0,0,canvas.width,canvas.height);
    }
    async function openCamera(facing,strict) {
      if(!navigator.mediaDevices?.getUserMedia) throw Object.assign(Error(),{name:'CameraUnavailable'});
      const request=mode=>navigator.mediaDevices.getUserMedia({audio:false,video:{
        facingMode:mode,width:{ideal:960},height:{ideal:720}
      }});
      try{
        const device=await request({exact:facing});
        const actual=device.getVideoTracks()[0]?.getSettings?.().facingMode;
        const supportsFacing=navigator.mediaDevices.getSupportedConstraints?.().facingMode;
        const confirmed=actual?actual===facing:supportsFacing!==false;
        if(strict&&!confirmed){
          device.getTracks().forEach(track=>track.stop());
          throw Object.assign(Error(),{name:'LensUnavailable'});
        }
        return {device,confirmed:confirmed||actual==='user'||actual==='environment',actual};
      }
      catch(error){
        if(!['OverconstrainedError','NotFoundError','TypeError'].includes(error.name))throw error;
        const device=await request({ideal:facing});
        const actual=device.getVideoTracks()[0]?.getSettings?.().facingMode;
        if(strict&&actual!==facing) {
          device.getTracks().forEach(track=>track.stop());
          throw Object.assign(Error(),{name:'LensUnavailable'});
        }
        return {device,confirmed:actual==='user'||actual==='environment',actual};
      }
    }
    async function start({file,facing='environment',previous=null,model='lite'}={}) {
      stop();
      const id=++revision;
      try {
        if(file) {url=URL.createObjectURL(file);video.src=url;}
        else {
          let opened,fallback=false;
          try{opened=await openCamera(facing,Boolean(previous));}
          catch(error){
            if(id!==revision)return;
            if(!previous||!['LensUnavailable','NotFoundError','OverconstrainedError','NotReadableError','AbortError'].includes(error.name))throw error;
            facing=previous;fallback=true;
            opened=await openCamera(facing,false);
          }
          const {device,confirmed,actual}=opened;
          if(id!==revision){device.getTracks().forEach(track=>track.stop());return;}
          stream=device;video.srcObject=device;
          device.getVideoTracks().forEach(track=>track.onended=()=>{if(id===revision)onEnd('相機已中斷。');});
          await video.play();
          if(id!==revision)return;
          onPreview({facing:actual||facing,confirmed,fallback});
        }
        onStatus(detectors.has(model)?'準備姿態辨識…':'第一次使用要下載姿態模型，請稍候…');
        let engine;
        try { engine=await detector(model); }
        catch {
          if(id!==revision)return;
          if(file){onEnd('姿態模型無法載入，請確認網路後再試。');return;}
          onStatus('相機已開啟，但姿態模型載入失敗。請確認網路，暫停後再繼續可重試。');
          return;
        }
        if(id!==revision)return;
        video.onended=()=>onEnd('影片已分析完畢。');
        video.onerror=()=>onEnd('無法讀取影像，請重新開始。');
        if(file){await video.play();if(id===revision)onPreview({file:true});}
        if(id!==revision)return;
        let lastFrame=-1,lastAt=-Infinity;
        function loop(now) {
          if(id!==revision)return;
          if(video.readyState>=2&&lastFrame!==video.currentTime&&now-lastAt>=80) {
            lastFrame=video.currentTime;lastAt=now;
            try {
              const width=video.videoWidth,height=video.videoHeight;
              if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
              lastStamp=Math.max(lastStamp+1,Math.round(now));
              const result=engine.detectForVideo(video,lastStamp);
              const points=(result.landmarks[0]||[]).map(p=>({x:p.x*width,y:p.y*height,visibility:p.visibility}));
              const view=onFrame(points,file?video.currentTime*1000:now)||{};
              draw.clearRect(0,0,width,height);
              window.GymOverlay?.paint(draw,points,view,width,height);
              draw.beginPath();
              for(const [a,b] of edges)if(window.GymPose.visible(points[a])&&window.GymPose.visible(points[b])){
                draw.moveTo(points[a].x,points[a].y);draw.lineTo(points[b].x,points[b].y);
              }
              draw.strokeStyle=view.cue?'#ffd166':'rgba(255,255,255,.92)';draw.lineWidth=Math.max(3,width/220);draw.stroke();
              for(const i of [11,12,13,14,15,16,23,24,25,26,27,28])if(window.GymPose.visible(points[i])){
                draw.beginPath();draw.arc(points[i].x,points[i].y,Math.max(3,width/200),0,Math.PI*2);draw.fillStyle='#fff';draw.fill();
              }
            } catch {onEnd('姿態分析中斷，已保存完成的紀錄。');return;}
          }
          frame=requestAnimationFrame(loop);
        }
        frame=requestAnimationFrame(loop);
      }catch(error){
        if(id!==revision)return;
        const errors={NotAllowedError:'相機權限未開放。請到 iPhone 設定 → Safari → 相機，或網址列「大小」選單允許相機。',
          CameraUnavailable:'此瀏覽環境無法使用相機，請用 Safari 直接開啟網站。',
          NotFoundError:'找不到相機，可在訓練選項選擇影片。',
          NotReadableError:'相機目前無法啟動，請關掉其他正在用相機的 App 再試。',
          LensUnavailable:'此裝置或瀏覽器無法確認指定的前後鏡頭。'};
        onEnd(errors[error.name]||(file?'影片無法播放。':'相機啟動失敗，請重新開始。'));
      }
    }
    return {start,stop,pauseVideo:()=>video.pause(),resumeVideo:()=>video.play()};
  }
  // 下載離線資料：先把姿態程式與模型載入一次（離線快取會存起來）
  const preload=kind=>detector(kind);
  window.GymCapture={create,preload,models:Object.keys(models),modelUrl:kind=>models[kind]||models.lite,sdk};
})();
