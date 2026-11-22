import { MeshStandardMaterial } from 'three'

// Original, world-scale procedural finishes. The grid stays continuous across split floor slabs.
export const Finish = {
  metal: 0,
  tile: 1,
  concrete: 2,
  ballast: 3,
  tactile: 4,
  ceramic: 5,
  glazing: 6,
  roof: 7,
  light: 8,
} as const
export function architecturalMaterial() {
  const material = new MeshStandardMaterial({
    roughness: 0.67,
    metalness: 0.14,
  })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute float finish; varying float vFinish; varying vec3 vBuilding; varying vec3 vFace; varying float vHeight;\n' +
      shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vFinish=finish;
      vBuilding=(instanceMatrix*vec4(position,1.)).xyz;
      vFace=normalize(mat3(instanceMatrix)*normal);
      vHeight=position.y+.5;`,
    )
    shader.fragmentShader =
      `varying float vFinish;
varying vec3 vBuilding;
varying vec3 vFace;
varying float vHeight;
float hashSurface(vec2 p){p=fract(p*vec2(.1031,.11369));p+=dot(p,p.yx+19.19);return fract((p.x+p.y)*p.x);}
float tileJoint(vec2 uv, float width){
 vec2 g=abs(fract(uv+.5)-.5);
 vec2 aa=max(fwidth(uv),vec2(.0001));
 vec2 edge=1.-smoothstep(vec2(width),vec2(width)+aa,g);
 return max(edge.x,edge.y)*(1.-smoothstep(.18,.8,max(aa.x,aa.y)));
}
` + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec3 axis=abs(normalize(vFace));
      vec2 uv=axis.y>.55?vBuilding.xz:(axis.x>axis.z?vBuilding.zy:vBuilding.xy);
      float grain=hashSurface(floor(uv*29.));
      float grainFade=1.-smoothstep(.015,.11,max(fwidth(uv.x),fwidth(uv.y)));
      if(vFinish>.5 && vFinish<2.5){
        vec2 cell=uv*(vFinish<1.5?vec2(1.45,1.45):vec2(.72,.92));
        float seam=tileJoint(cell,.012);
        diffuseColor.rgb*=.94+.075*hashSurface(floor(cell))-.22*seam+(grain-.5)*.10*grainFade;
      }else if(vFinish<3.5 && vFinish>2.5){
        diffuseColor.rgb*=.82+.36*hashSurface(floor(uv*8.))* (1.-smoothstep(.04,.36,max(fwidth(uv.x),fwidth(uv.y))));
      }else if(vFinish>3.5 && vFinish<4.5){
        vec2 cell=fract(uv*10.)-.5;
        float bump=1.-smoothstep(.18,.33,length(cell));
        diffuseColor.rgb*=.89+.24*bump*grainFade;
      }else if(vFinish>4.5 && vFinish<5.5){
        vec2 cell=uv*vec2(2.35,3.8);
        diffuseColor.rgb*=.97+.045*hashSurface(floor(cell))-.31*tileJoint(cell,.019);
      }else if(vFinish>5.5 && vFinish<6.5){
        float reflection=.5+.5*sin(dot(uv,vec2(.54,1.7)));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.55,.66,.69),reflection*.28);
      }else if(vFinish>6.5){
        diffuseColor.rgb*=.94+.11*cos(uv.x*21.)*grainFade;
      }
      diffuseColor.rgb*= mix(.80,1.,smoothstep(0.,.40,vHeight))*.99;`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      if(vFinish>7.5)totalEmissiveRadiance+=vec3(1.0,.87,.65);
      if(vFinish>5.5 && vFinish<6.5)totalEmissiveRadiance+=vec3(.055,.077,.085);`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor=vFinish<.5?.42:(vFinish>5.5&&vFinish<6.5?.19:(vFinish<1.5?.53:.86));`,
    )
  }
  return material
}
