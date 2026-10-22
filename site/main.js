// Backdrop: a low-resolution WebGL shader of a soft beam of light on a dark field
// (layered ribbons, streaks along the beam, a hot spot), mapped through a colour
// gradient, with a static grain layer on top. Every look-defining number lives in
// BEAM_DEFAULTS; open the page with ?tune to adjust them live and copy the values.
// Performance budget: ~0.4x render scale, 30fps cap, 3 noise octaves, paused
// while the tab is hidden, single still frame under prefers-reduced-motion.

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

const BLEND_MODES = ["srgb", "linear", "oklab", "oklch"];
const BEAM_DEFAULTS = {
  // Gradient map: shadow -> light.
  blend: "srgb",
  stops: [
    { p: 0, c: "#0f0503" },
    { p: 0.2, c: "#200c08" },
    { p: 0.4, c: "#54170c" },
    { p: 0.58, c: "#d43b08" },
    { p: 0.74, c: "#f5751a" },
    { p: 0.9, c: "#f7a33d" },
  ],
  bias: -0.33,
  sharpness: 0,
  // Shape.
  angle: -20,
  offset: -0.065,
  softness: 0.63,
  curve: -0.08,
  bandWidth: 0,
  spread: 0.7,
  streaks: 2.3,
  streakDepth: 0.31,
  warp: 0.245,
  fadeAlong: 0.5,
  // Motion.
  speed: 1.33,
  paused: false,
  // Extra.
  hot: 0.18,
  hotX: -0.29,
  hotY: -0.08,
  hotSize: 0.3,
  seed: 41,
  // Grade.
  brightness: 0.96,
  contrast: 1.03,
  saturation: 1,
  // Effects.
  grain: 0.4,
  grainSize: 1,
  vignette: 0.1,
  // Dark shade over the text column so copy stays readable on the light sheet.
  shade: 0.66,
};
const params = structuredClone(BEAM_DEFAULTS);

const VERTEX = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 res;
uniform float t;
uniform vec4 gA; // angle, offset, softness, curve
uniform vec4 gB; // band width, layer spread, streaks, streak depth
uniform vec4 gC; // warp, fade along, seed, brightness
uniform vec4 gD; // hot spot amount, x, y, size
uniform vec4 gE; // contrast, saturation, vignette, bias
uniform vec4 gF; // sharpness, blend mode
uniform vec3 sc[6];
uniform float sp[6];

float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);
}
float fbm(vec2 p){
  float v=0.,a=.5;
  for(int i=0;i<3;i++){v+=a*n(p);p=p*2.02+7.3;a*=.5;}
  return v;
}

vec3 toLin(vec3 c){return pow(max(c,0.),vec3(2.2));}
vec3 toSrgb(vec3 c){return pow(max(c,0.),vec3(1./2.2));}
vec3 toOk(vec3 c){
  float l=dot(c,vec3(.4122214708,.5363325363,.0514459929));
  float m=dot(c,vec3(.2119034982,.6806995451,.1073969566));
  float s=dot(c,vec3(.0883024619,.2817188376,.6299787005));
  vec3 q=pow(max(vec3(l,m,s),0.),vec3(1./3.));
  return vec3(dot(q,vec3(.2104542553,.7936177850,-.0040720468)),
              dot(q,vec3(1.9779984951,-2.4285922050,.4505937099)),
              dot(q,vec3(.0259040371,.7827717662,-.8086757660)));
}
vec3 fromOk(vec3 o){
  vec3 q=vec3(o.x+.3963377774*o.y+.2158037573*o.z,
              o.x-.1055613458*o.y-.0638541728*o.z,
              o.x-.0894841775*o.y-1.2914855480*o.z);
  q=q*q*q;
  return vec3(dot(q,vec3(4.0767416621,-3.3077115913,.2309699292)),
              dot(q,vec3(-1.2684380046,2.6097574011,-.3413193965)),
              dot(q,vec3(-.0041960863,-.7034186147,1.7076147010)));
}
vec3 blendColors(vec3 a,vec3 b,float t){
  if(gF.y<.5) return mix(a,b,t);
  if(gF.y<1.5) return toSrgb(mix(toLin(a),toLin(b),t));
  vec3 oa=toOk(toLin(a)),ob=toOk(toLin(b));
  if(gF.y<2.5) return toSrgb(fromOk(mix(oa,ob,t)));
  float ca=length(oa.yz),cb=length(ob.yz);
  float ha=atan(oa.z,oa.y),hb=atan(ob.z,ob.y);
  if(ca<.003) ha=hb;
  if(cb<.003) hb=ha;
  float dh=mod(hb-ha+3.14159265,6.2831853)-3.14159265;
  float hh=ha+dh*t;
  float cc=mix(ca,cb,t);
  return toSrgb(fromOk(vec3(mix(oa.x,ob.x,t),cc*cos(hh),cc*sin(hh))));
}
vec3 gradientMap(float x){
  vec3 ca=sc[0],cb=sc[1];
  float t=0.;
  for(int i=0;i<5;i++){
    if(x>=sp[i]){
      ca=sc[i];
      cb=sc[i+1];
      t=clamp((x-sp[i])/max(sp[i+1]-sp[i],.0001),0.,1.);
    }
  }
  float w=mix(1.,.04,gF.x);
  t=smoothstep(.5-.5*w,.5+.5*w,t);
  return blendColors(ca,cb,t);
}

void main(){
  vec2 uv=gl_FragCoord.xy/res;
  float asp=res.x/res.y;
  float s=t*.04;
  float seed=gC.z;

  vec2 q0=(uv-.5)*vec2(asp,1.);
  // Flow warp: bends the whole beam organically.
  vec2 wq=vec2(fbm(q0*1.4+vec2(s*.5,seed*.37)),fbm(q0*1.4+vec2(5.2+seed*.21,-s*.4)))-.5;
  vec2 q=q0+wq*gC.x*1.4;

  vec2 dm=vec2(cos(gA.x),sin(gA.x));
  vec2 nm=vec2(-dm.y,dm.x);
  float alongMain=dot(q,dm);
  float fade=mix(1.,smoothstep(-.9,.9,alongMain),min(gC.y*1.5,1.));

  // Three layered bands that part from each other as "layer spread" grows.
  float mx=0.,sum=0.;
  for(int k=0;k<3;k++){
    float kk=float(k)-1.;
    float ang=gA.x+kk*gB.y*.07;
    vec2 d=vec2(cos(ang),sin(ang));
    vec2 nr=vec2(-d.y,d.x);
    float along=dot(q,d);
    float across=dot(q,nr)-(gA.y+kk*gB.y*.13)-gA.w*along*along*1.6
      +(n(vec2(along*1.3+seed*.73+float(k)*5.3,s*.25+float(k)))-.5)*.16;
    float sig=mix(.025,.3,gA.z)*(1.-.25*abs(kk)*gB.y);
    float up=max(across-gB.x*.2,0.)/sig;
    float dn=max(-across-gB.x*.2,0.)/(sig*1.9);
    float band=exp(-(up*up+dn*dn));
    float e=.55+.9*n(vec2(along*1.1+seed*.51+float(k)*3.7,s*.2+float(k)*1.9));
    float st=fbm(vec2(along*1.1-s*1.2+seed,across*gB.z*7.));
    float st2=fbm(vec2(along*2.4-s*2.2+seed,across*gB.z*15.));
    float tex=mix(1.,.45+1.*st+.45*st2,gB.w);
    float v=band*e*tex*(1.-.25*abs(kk));
    mx=max(mx,v);
    sum+=v;
  }
  float I=(mx+.2*(sum-mx))*fade;
  I+=.1*exp(-pow((dot(q,nm)-gA.y)/.45,2.))*fade;

  vec2 dh=q0-vec2(gD.y,gD.z);
  float sigH=mix(.1,.5,gD.w);
  I+=gD.x*exp(-(dh.x*dh.x*.35+dh.y*dh.y*1.4)/(sigH*sigH));

  float x=clamp(I*gC.w,0.,1.);
  x=pow(x,exp2(-gE.w*1.5));
  vec3 col=gradientMap(x);

  col=(col-.18)*gE.x+.18;
  float luma=dot(col,vec3(.299,.587,.114));
  col=mix(vec3(luma),col,gE.y);
  col*=1.-gE.z*smoothstep(.4,1.1,length(q0));
  gl_FragColor=vec4(clamp(col,0.,1.),1.);
}`;

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function startBackdrop() {
  const canvas = document.querySelector("#backdrop-canvas");
  if (!canvas) return;
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });
  if (!gl) return;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vertex = compile(gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vertex || !fragment) return;

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const loc = Object.fromEntries(
    ["res", "t", "gA", "gB", "gC", "gD", "gE", "gF", "sc", "sp"].map((name) => [
      name,
      gl.getUniformLocation(program, name),
    ]),
  );

  const grainLayer = document.querySelector(".backdrop-grain");
  const RENDER_SCALE = 0.4;
  const FRAME_MS = 1000 / 30;
  let frame = 0;
  let lastDraw = -Infinity;
  let previous = 0;
  let clock = 18; // start the still frame at a pleasing phase rather than t=0
  let dirty = true;

  const upload = () => {
    gl.uniform4f(loc.gA, (params.angle * Math.PI) / 180, params.offset, params.softness, params.curve);
    gl.uniform4f(loc.gB, params.bandWidth, params.spread, params.streaks, params.streakDepth);
    gl.uniform4f(loc.gC, params.warp, params.fadeAlong, params.seed, params.brightness);
    gl.uniform4f(loc.gD, params.hot, params.hotX, params.hotY, params.hotSize);
    gl.uniform4f(loc.gE, params.contrast, params.saturation, params.vignette, params.bias);
    gl.uniform4f(loc.gF, params.sharpness, Math.max(0, BLEND_MODES.indexOf(params.blend)), 0, 0);
    gl.uniform3fv(loc.sc, new Float32Array(params.stops.flatMap((stop) => hexToRgb(stop.c))));
    gl.uniform1fv(loc.sp, new Float32Array(params.stops.map((stop) => stop.p)));
    document.documentElement.style.setProperty("--shade-a", String(params.shade));
    if (grainLayer) {
      grainLayer.style.opacity = String(params.grain);
      grainLayer.style.backgroundSize = `${220 * params.grainSize}px`;
    }
  };
  const resize = () => {
    const width = Math.max(2, Math.round(canvas.clientWidth * RENDER_SCALE));
    const height = Math.max(2, Math.round(canvas.clientHeight * RENDER_SCALE));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  };
  const draw = () => {
    resize();
    if (dirty) {
      upload();
      dirty = false;
    }
    gl.uniform2f(loc.res, canvas.width, canvas.height);
    gl.uniform1f(loc.t, clock);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const animated = () => !reducedMotion && !params.paused;
  const loop = (now) => {
    frame = window.requestAnimationFrame(loop);
    const dt = previous ? (now - previous) / 1000 : 0;
    previous = now;
    if (animated()) clock += dt * params.speed;
    if (now - lastDraw < FRAME_MS || (!animated() && !dirty)) return;
    lastDraw = now;
    draw();
  };
  const stop = () => {
    window.cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
  };
  const play = () => {
    if (!frame && !document.hidden && (animated() || dirty)) {
      frame = window.requestAnimationFrame(loop);
    }
  };

  // Used by the ?tune panel: params were edited in place.
  window.ryteBackdrop = {
    params,
    defaults: BEAM_DEFAULTS,
    blendModes: BLEND_MODES,
    update() {
      dirty = true;
      if (!frame) draw();
      play();
    },
  };

  draw();
  canvas.classList.add("is-ready");
  window.addEventListener("resize", () => {
    if (!frame) draw();
  });
  if (reducedMotion) return;
  document.addEventListener("visibilitychange", () =>
    document.hidden ? stop() : play(),
  );
  play();
}

// Top bar: appears once the hero download button has scrolled out of view.
function watchDownloadButton() {
  const button = document.querySelector("#download");
  const topbar = document.querySelector("#topbar");
  if (!button || !topbar) return;
  const observer = new IntersectionObserver(([entry]) => {
    const scrolledPast =
      !entry.isIntersecting && entry.boundingClientRect.top < 0;
    topbar.classList.toggle("is-visible", scrolledPast);
    topbar.toggleAttribute("inert", !scrolledPast);
  });
  observer.observe(button);
}

startBackdrop();
watchDownloadButton();

if (new URLSearchParams(window.location.search).has("tune")) {
  const tool = document.createElement("script");
  tool.src = "tune.js?v=14";
  document.head.appendChild(tool);
}
