import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PYTORCH_RELATIONS } from './pytorch-data.js';

export function layoutPytorchBands(bands,spacing=1){
  return bands.map((band,index)=>{
    const columns=Math.min(5,band.nodes.length),rows=Math.ceil(band.nodes.length/columns);
    return {...band,y:(bands.length-1-index)*3.5*spacing,rows,nodes:band.nodes.map((node,i)=>({...node,x:(i%columns-(columns-1)/2)*5.1,z:(Math.floor(i/columns)-(rows-1)/2)*2.5}))};
  });
}

export class PytorchScene {
  constructor(container,{onSelect=()=>{},onEnter=()=>{},onHover=()=>{}}={}){
    this.container=container;this.onSelect=onSelect;this.onEnter=onEnter;this.onHover=onHover;
    this.spacing=1;this.labelsVisible=true;this.showRelations=false;this.labels=[];this.shelves=[];this.targets=new Map();this.resources=[];this.disposed=false;
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    try{this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});}catch{return;}
    this.available=true;this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));this.renderer.setClearColor(0x0e172a,0);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.domElement.setAttribute('role','img');this.renderer.domElement.setAttribute('aria-label','PyTorch 模块层级三维全景，可拖动旋转，点击模块查看，双击展开');
    container.append(this.renderer.domElement);
    this.labelLayer=document.createElement('div');this.labelLayer.className='pt-scene-labels';container.append(this.labelLayer);
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-20,20,15,-15,.1,200);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=!this.reducedMotion;this.controls.dampingFactor=.08;this.controls.minZoom=.5;this.controls.maxZoom=3;
    this.controls.minPolarAngle=.16;this.controls.maxPolarAngle=Math.PI*.64;this.controls.enablePan=true;
    this.scene.add(new THREE.HemisphereLight(0xcadfff,0x10162a,2.2));
    const key=new THREE.DirectionalLight(0xffffff,3.5);key.position.set(-10,25,20);this.scene.add(key);
    const rim=new THREE.DirectionalLight(0x9eafff,2);rim.position.set(20,10,-15);this.scene.add(rim);
    this.model=new THREE.Group();this.scene.add(this.model);
    this.selection=new THREE.Box3Helper(new THREE.Box3(),0xfa927e);this.selection.visible=false;this.scene.add(this.selection);
    this.pointer=new THREE.Vector2();this.raycaster=new THREE.Raycaster();this.projected=new THREE.Vector3();
    const canvas=this.renderer.domElement;
    this.down=e=>{this.pointerStart=[e.clientX,e.clientY];};
    this.up=e=>{if(!this.pointerStart||Math.hypot(e.clientX-this.pointerStart[0],e.clientY-this.pointerStart[1])>6)return;const id=this.pick(e);if(id)this.onSelect(id);};
    this.double=e=>{const id=this.pick(e);if(id)this.onEnter(id);};
    this.move=e=>{const id=this.pick(e);if(id===this.hovered)return;this.hovered=id;canvas.style.cursor=id?'pointer':'grab';this.onHover(id);};
    this.leave=()=>{this.hovered=null;this.onHover(null);};
    canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointerup',this.up);canvas.addEventListener('dblclick',this.double);canvas.addEventListener('pointermove',this.move);canvas.addEventListener('pointerleave',this.leave);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);
    this.reset();this.resize();this.animate();
  }
  material(color,opacity=1){const m=new THREE.MeshStandardMaterial({color,metalness:.36,roughness:.48,transparent:opacity<1,opacity});this.resources.push(m);return m;}
  box(parent,w,h,d,x,y,z,material,id){const geometry=new RoundedBoxGeometry(w,h,d,1,Math.min(.09,h/3));this.resources.push(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);if(id)mesh.userData.id=id;parent.add(mesh);return mesh;}
  line(parent,points,color,opacity=.5,dashed=false){const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const material=dashed?new THREE.LineDashedMaterial({color,transparent:true,opacity,dashSize:.24,gapSize:.14}):new THREE.LineBasicMaterial({color,transparent:true,opacity});this.resources.push(geometry,material);const line=new THREE.Line(geometry,material);if(dashed)line.computeLineDistances();parent.add(line);return line;}
  label(anchor,node,kind='node'){
    const el=document.createElement('button');el.type='button';el.className=`pt-scene-label pt-label-${kind}`;el.style.setProperty('--node-color',node.color);el.dataset.node=node.id;
    if(kind==='band'){el.classList.add('pt-band-label');el.textContent=node.title;el.setAttribute('aria-label',`展开功能层 ${node.title}`);el.onclick=()=>this.onEnter(node.id);}
    else{const dot=document.createElement('i'),name=document.createElement('span'),hint=document.createElement('small');name.textContent=node.name;hint.textContent=node.children.length?`${node.children.length} 个下级模块 ↗`:'功能模块';el.append(dot,name,hint);el.setAttribute('aria-label',`选择模块 ${node.name}`);el.onclick=()=>this.onSelect(node.id);el.ondblclick=()=>this.onEnter(node.id);}
    this.labelLayer.append(el);this.labels.push({anchor,el,id:node.id,kind});
  }
  clear(){for(const resource of this.resources)resource.dispose();this.resources=[];this.model.clear();this.labelLayer.replaceChildren();this.labels=[];this.shelves=[];this.targets.clear();this.selection.visible=false;}
  setBands(bands){
    if(!this.available)return;this.clear();this.bands=bands;this.layout=layoutPytorchBands(bands,this.spacing);
    const edge=this.material(0x52627e,.68),silicon=this.material(0x162139),trace=0x8aa3cc;
    for(const band of this.layout){
      const shelf=new THREE.Group();shelf.position.y=band.y;this.model.add(shelf);this.shelves.push(shelf);
      const depth=band.rows>1?6:3.7;
      const tint=new THREE.Color(band.color).lerp(new THREE.Color(0x17263f),.77);
      this.box(shelf,27,.13,depth,0,-.3,0,this.material(tint,.88));this.box(shelf,27.1,.035,depth+.1,0,-.22,0,edge);
      this.box(shelf,.12,.16,depth,-13.4,-.18,0,this.material(band.color));
      const bandAnchor=new THREE.Object3D();bandAnchor.position.set(-13,.7,-depth/2-.15);shelf.add(bandAnchor);this.label(bandAnchor,band,'band');
      for(const node of band.nodes){
        const group=new THREE.Group();group.position.set(node.x,0,node.z);shelf.add(group);group.userData.id=node.id;
        const color=this.material(node.color);color.emissive=new THREE.Color(node.color);color.emissiveIntensity=.06;
        this.box(group,4.15,.2,1.65,0,.02,0,silicon,node.id);this.box(group,4.02,.1,1.54,0,.18,0,color,node.id);
        this.box(group,3.77,.035,1.27,0,.25,0,this.material(0x29364e),node.id);
        for(let i=0;i<6;i++)this.box(group,.35,.025,.13,-1.42+i*.56,.281,.42,color,node.id);
        this.box(group,.045,.025,.72,-1.71,.281,-.04,color,node.id);
        const anchor=new THREE.Object3D();anchor.position.set(0,.55,-.15);group.add(anchor);this.label(anchor,node);
        this.targets.set(node.id,{group,material:color,node});
        this.line(shelf,[[-13.1,-.19,-depth/2+.28],[node.x,-.19,-depth/2+.28],[node.x,-.19,node.z]],trace,.32);
      }
    }
    const ground=new THREE.GridHelper(38,38,0x375171,0x22364f);ground.position.y=-.8;ground.material.transparent=true;ground.material.opacity=.3;this.resources.push(ground.geometry,ground.material);this.model.add(ground);
    this.relationGroup=new THREE.Group();this.model.add(this.relationGroup);
    this.buildRelations();this.reset();this.resize();this.setSelected(this.selected);
    cancelAnimationFrame(this.resetFrame);this.resetFrame=requestAnimationFrame(()=>{if(!this.disposed)this.reset(this.view);});
  }
  buildRelations(){
    if(!this.relationGroup)return;
    for(const relation of PYTORCH_RELATIONS){const from=this.targets.get(relation.from),to=this.targets.get(relation.to);if(!from||!to)continue;const a=from.group.parent.position.clone().add(from.group.position),b=to.group.parent.position.clone().add(to.group.position);a.y+=.5;b.y+=.5;
      const curve=new THREE.CubicBezierCurve3(a,new THREE.Vector3(a.x-1,a.y+1,a.z+4),new THREE.Vector3(b.x+1,b.y+1,b.z+4),b);
      this.line(this.relationGroup,curve.getPoints(35).map(p=>p.toArray()),0xd2a5f7,.52,true);
    }this.relationGroup.visible=this.showRelations;
  }
  setSelected(id){this.selected=id;if(!this.available)return;for(const [key,target]of this.targets){target.material.emissiveIntensity=key===id ? .45 : .06;}for(const label of this.labels)label.el.classList.toggle('selected',label.id===id);const target=this.targets.get(id);this.selection.visible=!!target;if(target){this.model.updateMatrixWorld(true);this.selection.box.setFromObject(target.group).expandByScalar(.1);this.selection.material.color.set(target.node.color);}}
  setLabels(value){this.labelsVisible=value;if(this.labelLayer)this.labelLayer.hidden=!value;}
  setRelations(value){this.showRelations=value;if(this.relationGroup)this.relationGroup.visible=value;}
  setSpacing(value){this.spacing=value;if(!this.bands)return;this.setBands(this.bands);}
  pick(event){const rect=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);for(const hit of this.raycaster.intersectObject(this.model,true)){let object=hit.object;while(object){if(object.userData.id)return object.userData.id;object=object.parent;}}return null;}
  reset(view='iso'){
    if(!this.available)return;this.view=view;const height=Math.max(0,(this.bands?.length-1||0)*3.5*this.spacing);this.controls.target.set(0,height/2,0);
    this.camera.position.set(view==='front'?0:10,height/2+(view==='front'?6:15),34);this.camera.zoom=1;this.camera.lookAt(this.controls.target);this.controls.update();this.camera.updateMatrixWorld(true);this.resize();
  }
  zoom(delta){if(!this.available)return;this.camera.zoom=THREE.MathUtils.clamp(this.camera.zoom*delta,.5,3);this.camera.updateProjectionMatrix();}
  resize(){if(!this.available)return;const {width,height}=this.container.getBoundingClientRect();if(!width||!height)return;this.width=width;this.height=height;this.renderer.setSize(width,height,false);this.labelLayer.style.setProperty('--pt-label-width',width<700?'86px':'104px');const aspect=width/height,total=(this.bands?.length-1||0)*3.5*this.spacing;const half=Math.max(9,total*.5+5,17/aspect);this.camera.left=-half*aspect;this.camera.right=half*aspect;this.camera.top=half;this.camera.bottom=-half;this.camera.updateProjectionMatrix();}
  animate(){
    if(this.disposed||!this.available)return;this.frame=requestAnimationFrame(()=>this.animate());if(!this.container.clientWidth||this.container.hidden)return;this.controls.update();this.camera.updateMatrixWorld(true);this.model.updateMatrixWorld(true);
    for(const label of this.labels){label.anchor.getWorldPosition(this.projected);this.projected.project(this.camera);const x=label.kind==='band'?12:(this.projected.x*.5+.5)*this.width,y=(-this.projected.y*.5+.5)*this.height;label.el.style.transform=`translate(${x}px,${y}px) translate(${label.kind==='band'?'0':'-50%'},-50%)`;label.el.style.visibility=this.projected.z>1||x<0||x>this.width||y<0||y>this.height?'hidden':'visible';}
    if(this.selection.visible){const target=this.targets.get(this.selected);if(target)this.selection.box.setFromObject(target.group).expandByScalar(.1);}
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);cancelAnimationFrame(this.resetFrame);if(!this.available)return;this.observer.disconnect();this.controls.dispose();const canvas=this.renderer.domElement;canvas.removeEventListener('pointerdown',this.down);canvas.removeEventListener('pointerup',this.up);canvas.removeEventListener('dblclick',this.double);canvas.removeEventListener('pointermove',this.move);canvas.removeEventListener('pointerleave',this.leave);this.clear();this.selection.geometry.dispose();this.selection.material.dispose();this.renderer.dispose();canvas.remove();this.labelLayer.remove();}
}
