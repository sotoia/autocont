/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
/**
 * Liquid Gradient — efecto WebGL2 (MIT).
 *
 * WebGL2 fragment shader con turbulencia iterativa, blending Oklab y film
 * dither. Se renderiza en su propio <canvas> absolute con loop RAF. Los
 * props se leen vía ref para no recrear estado GL en cada cambio.
 *
 * Captura en vídeo: Chromium / Playwright lo captura sin problema. Firefox
 * no soporta `backdrop-filter` pero sí el shader, así que es seguro para el
 * pipeline OBS / yt-dlp / Playwright que usamos.
 */
import { useEffect, useRef } from "react";

export interface LiquidGradientProps {
  /** 1–8 hex colors, sampled in Oklab. */
  colors?: string[];
  speed?: number;
  scale?: number;
  turbAmp?: number;
  turbFreq?: number;
  /** 2..13 */
  turbIter?: number;
  waveFreq?: number;
  jellify?: 0 | 1;
  distBias?: number;
  /** Grain intensity 0..1 */
  dither?: number;
  /** 0 off · 1 smooth IGN · 2 grain (film) */
  ditherMode?: 0 | 1 | 2;
  exposure?: number;
  contrast?: number;
  saturation?: number;
  seed?: number;
  /** 0 = continuous, >0 = loop period in seconds */
  loop?: number;
  className?: string;
  style?: React.CSSProperties;
}

const VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos*0.5+0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;precision highp int;in vec2 v_uv;out vec4 fragColor;
#define MAX_COLORS 8
uniform vec4 u_colors[MAX_COLORS];uniform int u_colors_length;uniform vec2 u_resolution;uniform float u_time;uniform float u_pixelRatio;uniform float u_seed;uniform float u_speed;uniform float u_scale;uniform float u_turbAmp;uniform float u_turbFreq;uniform float u_turbIter;uniform float u_waveFreq;uniform float u_jellify;uniform float u_distBias;uniform float u_dither;uniform float u_ditherMode;uniform float u_exposure;uniform float u_contrast;uniform float u_saturation;uniform float u_loop;
const float GA=2.3999632;const float TAU=6.28318530;
uvec3 h3(uvec3 v){v=v*1664525u+1013904223u;v.x+=v.y*v.z;v.y+=v.z*v.x;v.z+=v.x*v.y;v^=v>>16u;v.x+=v.y*v.z;v.y+=v.z*v.x;v.z+=v.x*v.y;return v;}
vec3 sR(float s){uvec3 u=uvec3(floatBitsToUint(s),floatBitsToUint(s*1.5+7.31),floatBitsToUint(s*2.7+13.37));u=h3(u);return vec3(u)/float(0xFFFFFFFFu);}
vec3 tL(vec3 c){return pow(c,vec3(2.2));}vec3 tS(vec3 c){return pow(clamp(c,0.0,1.0),vec3(0.4545));}
vec3 lOk(vec3 c){float l=0.4122214708*c.r+0.5363325363*c.g+0.0514459929*c.b;float m=0.2119034982*c.r+0.6806995451*c.g+0.1073969566*c.b;float s=0.0883024619*c.r+0.2817188376*c.g+0.6299787005*c.b;l=pow(max(l,0.0),1.0/3.0);m=pow(max(m,0.0),1.0/3.0);s=pow(max(s,0.0),1.0/3.0);return vec3(0.2104542553*l+0.7936177850*m-0.0040720468*s,1.9779984951*l-2.4285922050*m+0.4505937099*s,0.0259040371*l+0.7827717662*m-0.8086757660*s);}
vec3 okL(vec3 c){float l=c.x+0.3963377774*c.y+0.2158037573*c.z;float m=c.x-0.1055613458*c.y-0.0638541728*c.z;float s=c.x-0.0894841775*c.y-1.2914855480*c.z;l=l*l*l;m=m*m*m;s=s*s*s;return vec3(+4.0767416621*l-3.3077115913*m+0.2309699292*s,-1.2684380046*l+2.6097574011*m-0.3413193965*s,-0.0041960863*l-0.7034186147*m+1.7076147010*s);}
vec3 okLch(vec3 lab){return vec3(lab.x,length(lab.yz),atan(lab.z,lab.y));}vec3 lchOk(vec3 l){return vec3(l.x,l.y*cos(l.z),l.y*sin(l.z));}
vec3 mLch(vec3 a,vec3 b,float t){vec3 la=okLch(a),lb=okLch(b);if(la.y<0.05)la.z=lb.z;if(lb.y<0.05)lb.z=la.z;float dh=lb.z-la.z;if(dh>3.14159265)dh-=TAU;if(dh<-3.14159265)dh+=TAU;return lchOk(vec3(mix(la.x,lb.x,t),mix(la.y,lb.y,t),la.z+dh*t));}
vec3 gC(int i){if(u_colors_length<1)return vec3(0.0);int k=clamp(i,0,u_colors_length-1);return u_colors[k].rgb;}
vec3 pN(float t,int n){if(n<1)return vec3(0.0);if(n<2)return tL(gC(0));float seg=1.0/float(n-1);t=clamp(t,0.0,1.0);int idx=min(int(floor(t/seg)),n-2);float lt=clamp((t-float(idx)*seg)/seg,0.0,1.0);vec3 a=lOk(tL(gC(idx)));vec3 b=lOk(tL(gC(idx+1)));return okL(mLch(a,b,lt));}
float IGN(vec2 uv){return fract(52.9829189*fract(dot(uv,vec2(0.06711056,0.00583715))));}
float qN(vec2 I){return fract(sin(dot(I,vec2(12.9898,78.233)))*43758.5453);}
float gD(vec2 I,float m){if(m<0.5)return 0.5;if(m<1.5)return IGN(I);return qN(I);}
vec3 sGM(vec3 rgb){float mx=max(rgb.r,max(rgb.g,rgb.b)),mn=min(rgb.r,min(rgb.g,rgb.b));if(mn>=0.0&&mx<=1.0)return rgb;vec3 lab=lOk(max(rgb,0.0));float L=clamp(lab.x,0.0,1.0),C=length(lab.yz),h=atan(lab.z,lab.y);float mc=0.4*(1.0-pow(abs(2.0*L-1.0),2.0));if(C>mc*0.7){float k=mc*0.7;C=k+(mc-k)*tanh((C-k)/(mc-k+0.001));}return clamp(okL(vec3(L,C*cos(h),C*sin(h))),0.0,1.0);}
vec3 aCS(vec3 rgb,float c,float s){vec3 lab=lOk(rgb);float C=length(lab.yz),h=atan(lab.z,lab.y);lab.x=clamp((lab.x-0.5)*c+0.5,0.0,1.0);C*=s;lab.y=C*cos(h);lab.z=C*sin(h);return okL(lab);}
void main(){vec2 fc=v_uv*u_resolution;vec2 r=u_resolution;vec2 p=(fc*2.0-r)/r.y;int n=u_colors_length;if(n<1){fragColor=vec4(0.0,0.0,0.0,1.0);return;}float t=u_time*0.3;float lp=step(0.5,u_loop);float ph=TAU*u_time/max(u_loop,0.01);float rd=u_loop*u_speed*0.3/TAU;float tA=sin(ph)*rd;float tB=(1.0-cos(ph))*rd;vec3 so=sR(u_seed);vec3 so2=sR(u_seed+100.0);float sa=u_seed*GA;vec2 sp=(so2.xy-0.5)*TAU;float cs=cos(sa),sn=sin(sa);p=mat2(cs,-sn,sn,cs)*p;float di=gD(floor(fc/u_pixelRatio),u_ditherMode);float tv=0.0,tw=0.0;int ti=int(u_turbIter);float fq=1.0/max(u_turbFreq,0.01);for(float i=0.0;i<4.0;i++){float e=i/4.0;vec2 q=p*u_scale;float sq=e*e;if(u_jellify>0.5){q.yx*=mix(1.0,0.5,1.0-exp(-sq));}float a=sp.x;float d=sp.y;for(int j=2;j<13;j++){if(j>=ti)break;float fj=float(j);float t1=mix(t*u_speed,tA,lp);float t2=mix(t*u_speed,tB,lp);q+=u_turbAmp*sin(q.yx/fq*fj+t1+vec2(a,d)+so.xy*fj)/fj;a+=cos(fj+d*1.2+q.x*2.0-t1+so2.z+t2*0.3*lp);d+=sin(fj*q.y+a+so.z+t1+so2.y+t2*0.3*lp);}float v=0.5+0.5*sin(length(q.yx+vec2(a,d)*0.2)*u_waveFreq+i*i+so.x);float w=smoothstep(0.0,0.5,e)*smoothstep(1.0,0.5,e);tv+=v*w;tw+=w;}float val=tv/tw;val=clamp((val-0.3)/0.4,0.0,1.0);val=pow(val,exp(-u_distBias));val=clamp(val+(di-0.5)*u_dither,0.0,1.0);vec3 col=pN(val,n);col*=u_exposure;col=aCS(col,u_contrast,u_saturation);col=sGM(col);col=tS(col);fragColor=vec4(col,1.0);}`;

function hexToRgba(h: string): [number, number, number, number] {
  const v = parseInt(h.replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, 1];
}

export function LiquidGradient({
  colors = ["#0099ff", "#7c3aed", "#ec4899", "#f97316"],
  speed = 0.8,
  scale = 1.4,
  turbAmp = 0.55,
  turbFreq = 1.0,
  turbIter = 9,
  waveFreq = 2.4,
  jellify = 1,
  distBias = 0,
  dither = 0.05,
  ditherMode = 1,
  exposure = 1.0,
  contrast = 1.05,
  saturation = 1.1,
  seed = 42,
  loop = 0,
  className,
  style,
}: LiquidGradientProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cfgRef = useRef({ colors, speed, scale, turbAmp, turbFreq, turbIter, waveFreq, jellify, distBias, dither, ditherMode, exposure, contrast, saturation, seed, loop });
  cfgRef.current = { colors, speed, scale, turbAmp, turbFreq, turbIter, waveFreq, jellify, distBias, dither, ditherMode, exposure, contrast, saturation, seed, loop };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false });
    if (!gl) {
      console.warn("LiquidGradient: WebGL2 not supported, rendering black.");
      return;
    }

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        throw new Error("LiquidGradient shader compile failed");
      }
      return s;
    };

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const U: Record<string, WebGLUniformLocation | null> = {};
    ["colors", "colors_length", "resolution", "time", "pixelRatio", "seed", "speed", "scale", "turbAmp", "turbFreq", "turbIter", "waveFreq", "jellify", "distBias", "dither", "ditherMode", "exposure", "contrast", "saturation", "loop"]
      .forEach((n) => { U[n] = gl.getUniformLocation(prog, "u_" + n); });

    let lastColors = "";
    function uploadColorsIfChanged() {
      const key = cfgRef.current.colors.join("|");
      if (key === lastColors) return;
      lastColors = key;
      const flat: number[] = [];
      for (const h of cfgRef.current.colors) flat.push(...hexToRgba(h));
      while (flat.length < 8 * 4) flat.push(0, 0, 0, 1);
      gl!.uniform4fv(U.colors!, new Float32Array(flat));
      gl!.uniform1i(U.colors_length!, cfgRef.current.colors.length);
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas!.getBoundingClientRect();
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
        gl!.viewport(0, 0, w, h);
      }
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let raf = 0;
    const t0 = performance.now();
    function frame() {
      resize();
      uploadColorsIfChanged();
      const c = cfgRef.current;
      const t = (performance.now() - t0) / 1000;
      gl!.uniform2f(U.resolution!, canvas!.width, canvas!.height);
      gl!.uniform1f(U.time!, t);
      gl!.uniform1f(U.pixelRatio!, Math.min(window.devicePixelRatio || 1, 2));
      gl!.uniform1f(U.seed!, c.seed);
      gl!.uniform1f(U.speed!, c.speed);
      gl!.uniform1f(U.scale!, c.scale);
      gl!.uniform1f(U.turbAmp!, c.turbAmp);
      gl!.uniform1f(U.turbFreq!, c.turbFreq);
      gl!.uniform1f(U.turbIter!, c.turbIter);
      gl!.uniform1f(U.waveFreq!, c.waveFreq);
      gl!.uniform1f(U.jellify!, c.jellify);
      gl!.uniform1f(U.distBias!, c.distBias);
      gl!.uniform1f(U.dither!, c.dither);
      gl!.uniform1f(U.ditherMode!, c.ditherMode);
      gl!.uniform1f(U.exposure!, c.exposure);
      gl!.uniform1f(U.contrast!, c.contrast);
      gl!.uniform1f(U.saturation!, c.saturation);
      gl!.uniform1f(U.loop!, c.loop);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
        ...style,
      }}
    />
  );
}

export default LiquidGradient;
