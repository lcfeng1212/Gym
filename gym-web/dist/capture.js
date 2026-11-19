(() => {
  const sdk='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const model='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  const edges=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
  function create(video,canvas,{onFrame,onEnd,onStatus,onPreview=()=>{}}) {
    let revision=0,stream=null,engine=null,url=null,frame=0;
    const draw=canvas.getContext('2d');
    function stop() {
      revision++; cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track=>track.stop());
      stream=null;engine?.close();engine=null;
      video.onended=null;video.onerror=null;video.pause();video.srcObject=null;video.removeAttribute('src');video.load();
      if(url)URL.revokeObjectURL(url);
      url=null;draw.clearRect(0,0,canvas.width,canvas.height);
    }
    async function openCamera(facing,strict) {
      if(!navigator.mediaDevices?.getUserMedia) throw Object.assign(Error(),{name:'CameraUnavailable'});
      const request=mode=>navigator.mediaDevices.getUserMedia({audio:false,video:{
        facingMode:mode,width:{ideal:640},height:{ideal:480}
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
    async function start({file,facing='environment',previous=null}={}) {
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
        onStatus('載入姿態模型…');
        let detector;
        try {
          const {FilesetResolver,PoseLandmarker}=await import(sdk+'/vision_bundle.mjs');
          if(id!==revision)return;
          const config=await FilesetResolver.forVisionTasks(sdk+'/wasm');
          if(id!==revision)return;
          detector=await PoseLandmarker.createFromOptions(config,{baseOptions:{modelAssetPath:model,delegate:'CPU'},runningMode:'VIDEO',numPoses:1});
        }catch{
          if(id!==revision)return;
          if(file){onEnd('姿態模型無法載入，請確認網路後再試。');return;}
          onStatus('相機已開啟，姿態模型載入失敗。可切換鏡頭或稍後重試。');
          return;
        }
        if(id!==revision){detector.close();return;}
        engine=detector;
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
              const result=engine.detectForVideo(video,now);
              const points=(result.landmarks[0]||[]).map(p=>({x:p.x*width,y:p.y*height,visibility:p.visibility}));
              const view=onFrame(points,file?video.currentTime*1000:now);
              draw.clearRect(0,0,width,height);
              window.GymDemo?.paint(draw,points,view,width,height);
              draw.beginPath();
              for(const [a,b] of edges)if(window.GymPose.visible(points[a])&&window.GymPose.visible(points[b])){
                draw.moveTo(points[a].x,points[a].y);draw.lineTo(points[b].x,points[b].y);
              }
              draw.strokeStyle=view.cue?'#ffd08b':'#abffcf';draw.lineWidth=3;draw.stroke();
            } catch {onEnd('姿態分析中斷，已保存完成的紀錄。');return;}
          }
          frame=requestAnimationFrame(loop);
        }
        frame=requestAnimationFrame(loop);
      }catch(error){
        if(id!==revision)return;
        const errors={NotAllowedError:'相機權限未開放。請在 Safari 的網站設定允許相機。',
          CameraUnavailable:'此瀏覽環境無法使用相機，請用 Safari 直接開啟網站。',
          NotFoundError:'找不到相機，可在訓練選項選擇影片。',
          NotReadableError:'相機目前無法啟動，請關掉其他正在用相機的 App 再試。',
          LensUnavailable:'此裝置或瀏覽器無法確認指定的前後鏡頭。'};
        onEnd(errors[error.name]||(file?'影片無法播放。':'相機啟動失敗，請重新開始。'));
      }
    }
    return {start,stop,pauseVideo:()=>video.pause(),resumeVideo:()=>video.play()};
  }
  window.GymCapture={create};
})();
