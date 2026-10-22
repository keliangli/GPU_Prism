import * as THREE from 'three';

export function frameLlmBounds(bounds,aspect,fov,direction=new THREE.Vector3(0,.48,1),margin=1.13){
  const box=bounds.isEmpty()?new THREE.Box3(new THREE.Vector3(-8,-4,-3),new THREE.Vector3(8,4,3)):bounds;
  const center=box.getCenter(new THREE.Vector3());
  const back=direction.clone().normalize();
  if(back.lengthSq()<.5)back.set(0,.48,1).normalize();
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),back).normalize();
  if(right.lengthSq()<.5)right.set(1,0,0);
  const up=new THREE.Vector3().crossVectors(back,right).normalize();
  const tanV=Math.tan(THREE.MathUtils.degToRad(fov/2)),tanH=tanV*Math.max(.15,aspect);
  let distance=8;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=new THREE.Vector3(x,y,z).sub(center);
    distance=Math.max(distance,p.dot(back)+Math.abs(p.dot(right))*margin/tanH,p.dot(back)+Math.abs(p.dot(up))*margin/tanV);
  }
  return {target:center,position:center.clone().addScaledVector(back,distance)};
}

// A small clamp prevents suspended tabs from jumping through the animation.
export function llmFrameDelta(previous,current){return previous===null?0:Math.min(.05,Math.max(0,(current-previous)/1000));}

export function createEnergyConduit(curve,color,clock,{radius=.035,repeats=3,rate=.24,residual=false}={}){
  const material=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uTime:clock,uColor:{value:new THREE.Color(color)},uRate:{value:rate},uRepeat:{value:repeats},uOpacity:{value:residual?.28:.48}},
    vertexShader:`varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float uTime,uRate,uRepeat,uOpacity;uniform vec3 uColor;varying vec2 vUv;
      void main(){float phase=fract(vUv.x*uRepeat-uTime*uRate*uRepeat);
      float pulse=pow(phase,18.); float rim=pow(abs(vUv.y-.5)*2.,.5);
      float energy=.6+2.4*pulse;gl_FragColor=vec4(uColor*energy,uOpacity*(.25+.75*pulse)*(1.-rim*.18));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`
  });
  return new THREE.Mesh(new THREE.TubeGeometry(curve,48,radius,5,false),material);
}

export function createFlowPackets(curve,color,count,radius=.065){
  const material=new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(1.65),toneMapped:false});
  const mesh=new THREE.InstancedMesh(new THREE.OctahedronGeometry(1,0),material,count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;
  const dummy=new THREE.Object3D(),forward=new THREE.Vector3(0,0,1);
  return {mesh,update(time,rate,visualScale=1){
    for(let i=0;i<count;i++){
      const t=(i/count+time*rate)%1;
      curve.getPointAt(t,dummy.position);dummy.quaternion.setFromUnitVectors(forward,curve.getTangentAt(t));
      dummy.scale.set(radius*visualScale,radius*visualScale,radius*3.2*visualScale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
  }};
}

// Interleaved router→expert and expert→sum paths share one draw call.
export function createRoutePackets(curves,color=0xe6caff,radius=.15){
  const mesh=new THREE.InstancedMesh(new THREE.OctahedronGeometry(1,0),new THREE.MeshBasicMaterial({color,toneMapped:false}),curves.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;
  const dummy=new THREE.Object3D(),forward=new THREE.Vector3(0,0,1);
  return {mesh,update(time,rate=1/3.6){
    const phase=((time*rate)%1+1)%1;
    for(let i=0;i<curves.length;i++){
      const incoming=i%2===0,active=incoming?phase<.5:phase>=.5,t=incoming?phase*2:(phase-.5)*2;
      const curve=curves[i],progress=THREE.MathUtils.clamp(t,0,1);
      curve.getPointAt(progress,dummy.position);dummy.quaternion.setFromUnitVectors(forward,curve.getTangentAt(progress));
      dummy.scale.setScalar(active?radius:0);dummy.scale.z*=2.4;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
  }};
}

export function createSelectionCorners(size,color=0x9eeaff){
  const positions=[];
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
    const corner=[x*size.x/2,y*size.y/2,z*size.z/2];
    for(let axis=0;axis<3;axis++){
      const end=[...corner];end[axis]*=.68;positions.push(...corner,...end);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  return new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity:.86,toneMapped:false}));
}
