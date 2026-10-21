// Geometry/material instances may be shared by several particles or mesh faces.
export function disposeLlmObject(root){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material])if(material){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}
    if(object.isInstancedMesh)object.dispose();
  });
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
}
