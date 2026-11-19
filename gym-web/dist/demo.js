(() => {
  const demos=[
    [/^(深蹲|自重深蹲|徒手深蹲)$/, 'Bodyweight_Squat','徒手深蹲'],
    [/^滑輪坐姿划船$/, 'Seated_Cable_Rows','滑輪坐姿划船'],
    [/^(滑輪)?高位下拉$/, 'Wide-Grip_Lat_Pulldown','寬握高位下拉'],
    [/^啞鈴側平舉$/, 'Side_Lateral_Raise','啞鈴側平舉'],
    [/^(啞鈴臥推|啞鈴平板臥推)$/, 'Dumbbell_Bench_Press','啞鈴平板臥推'],
    [/^單(手|臂)啞鈴划船$/, 'One-Arm_Dumbbell_Row','單手啞鈴划船']
  ];
  function find(name){
    const demo=demos.find(([pattern])=>pattern.test(name));
    return demo?{id:demo[1],label:demo[2]}:null;
  }
  const joints=[[11,13,23],[12,14,24]];
  function paint(ctx,points,view,width,height){
    if(view.phase!=='working'||!view.tracking)return;
    const visible=point=>window.GymPose.visible(point)&&point.x>=0&&point.x<=width&&point.y>=0&&point.y<=height;
    const sideRaise=view.name==='啞鈴側平舉';
    const back=/^滑輪坐姿划船$|^(滑輪)?高位下拉$/.test(view.name);
    if(!sideRaise&&!back)return;
    ctx.save();ctx.lineCap='round';
    for(const [s,e,h] of joints){
      const shoulder=points[s],elbow=points[e],hip=points[h];
      if(![shoulder,elbow,hip].every(visible))continue;
      const length=Math.hypot(shoulder.x-hip.x,shoulder.y-hip.y);
      if(length<20)continue;
      const a=sideRaise?0:.27,b=sideRaise?.29:.7;
      const end=sideRaise?elbow:hip;
      ctx.strokeStyle='rgba(47, 225, 146, .47)';
      ctx.lineWidth=Math.max(8,length*(sideRaise?.24:.2));
      ctx.beginPath();
      ctx.moveTo(shoulder.x+(end.x-shoulder.x)*a,shoulder.y+(end.y-shoulder.y)*a);
      ctx.lineTo(shoulder.x+(end.x-shoulder.x)*b,shoulder.y+(end.y-shoulder.y)*b);
      ctx.stroke();
    }
    ctx.restore();
  }
  window.GymDemo={find,paint};
})();
