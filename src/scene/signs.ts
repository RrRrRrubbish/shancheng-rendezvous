import * as THREE from 'three';

/** Texture and geometry share an aspect ratio; glyphs are never squeezed to maxWidth. */
export function createSign(text:string,width:number,height:number,color:string,anisotropy:number):THREE.Group {
  const canvas=document.createElement('canvas');
  canvas.height=Math.min(512,Math.max(192,Math.round(height*320)));
  canvas.width=Math.min(4096,Math.max(512,Math.round(canvas.height*width/height)));
  // If the long side was capped, maintain square texels on the physical face.
  canvas.height=Math.round(canvas.width*height/width);
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle=color;ctx.fillRect(0,0,canvas.width,canvas.height);
  const padding=canvas.height*.18,maxWidth=canvas.width-padding*2;
  let fontSize=canvas.height*.62;
  ctx.font='700 '+fontSize+'px "Microsoft YaHei", "PingFang SC", sans-serif';
  const measured=ctx.measureText(text).width;
  if(measured>maxWidth){fontSize*=maxWidth/measured;ctx.font='700 '+fontSize+'px "Microsoft YaHei", "PingFang SC", sans-serif';}
  ctx.fillStyle='#fffbed';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(text,canvas.width/2,canvas.height*.515);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=Math.min(16,anisotropy);texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;
  const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
  const group=new THREE.Group(),geometry=new THREE.PlaneGeometry(width,height);
  const face=new THREE.Mesh(geometry,material);face.position.z=.028;group.add(face);
  // Independent back face keeps lettering readable when walking behind a sign.
  const back=new THREE.Mesh(geometry,material);back.rotation.y=Math.PI;back.position.z=-.028;group.add(back);
  group.userData={text,width,height,textureWidth:canvas.width,textureHeight:canvas.height,anisotropy:texture.anisotropy};
  return group;
}
