/*
 * backdrop.js — طبقة الخلفية ثلاثية الأبعاد
 * ==================================================================
 * لماذا WebGL مكتوب باليد لا Three.js أو Spline:
 *
 * هذا الموقع يُفتح من القرص مباشرة (file://) على جهاز المستخدم، ولا يُصدر أيّ
 * طلب شبكة خارجي — لا CDN ولا خطوط بعيدة ولا مكتبات. مكتبة مثل Three.js تعني
 * إمّا طلباً خارجياً وإمّا ~600KB مضافة إلى المستودع لخلفية زخرفية واحدة، ومشهد
 * Spline يعني ملف أصول بالميغابايتات. المكتوب هنا ~6KB ويرسم على بطاقة الرسوم
 * فعلياً: حقل ارتفاع مضطرب يُشتقّ منه اتجاه السطح ثم يُضاء — أي عمق حقيقي محسوب
 * لا تدرّج مسطّح.
 *
 * الضوابط التي تجعل الزينة غير مكلفة:
 *   · الرسم بنصف الدقة (المخرَج مموَّه خلف زجاج الرأس، فالتفاصيل لا تُرى أصلاً)
 *   · 30 إطاراً/ث لا 60 — الحركة بطيئة أصلاً فلا فرق مرئي، والكلفة تنتصف
 *   · يتوقّف كلياً متى غابت النافذة (visibilitychange) فلا يستهلك بطارية خلفية
 *   · مع prefers-reduced-motion: إطار واحد ساكن ثم لا حلقة إطلاقاً
 *   · بلا WebGL أو عند فقد السياق: يُزال العنصر ويبقى تدرّج CSS تحته
 *
 * الطبقة position: fixed وaria-hidden وpointer-events: none — خارج التخطيط
 * وخارج شجرة الوصول وخارج التقاط الفأرة، فلا تزيح شيئاً (CLS) ولا تعترض نقرة.
 */
(function (W) {
  'use strict';
  if (typeof document === 'undefined') return;

  const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

  /* حقل ارتفاع بأربع طبقات ضجيج، يُشتقّ منه المُنحدر بفروق منتهية فيصير للسطح
     اتجاه، ثم يُضاء بمصدر ثابت. هذا ما يعطي الإحساس بالحجم بدل لطخة لونية. */
  const FRAG = `precision mediump float;
uniform vec2  uRes;
uniform float uT;
uniform vec3  uA;      /* لون الغور */
uniform vec3  uB;      /* لون القمة */
uniform float uAmp;    /* شدّة الأثر — تُخفَّض في المظهر الفاتح حفاظاً على التباين */

float hash(vec2 v){ return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 v){
  vec2 i = floor(v), f = fract(v);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}

float fbm(vec2 v){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(v); v *= 2.02; a *= 0.5; }
  return s;
}

/* الالتواء المجالي: نزيح الإحداثيات بضجيج آخر قبل أخذ الارتفاع، فتنكسر
   الاستقامة وتظهر أشرطة منسابة بدل بقع متكررة. */
float height(vec2 uv){
  vec2 q = vec2(fbm(uv + uT * 0.03), fbm(uv + vec2(5.2, 1.3) - uT * 0.02));
  return fbm(uv + 1.6 * q);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 sv = uv * vec2(uRes.x / uRes.y, 1.0) * 2.4;

  float h = height(sv);
  float e = 1.6 / uRes.y * 2.4;          /* خطوة الفرق المنتهي بوحدات المشهد */
  vec3 n = normalize(vec3(height(sv + vec2(e, 0.0)) - h,
                          height(sv + vec2(0.0, e)) - h, e * 1.6));

  vec3  L    = normalize(vec3(-0.45, 0.7, 0.55));
  float lam  = max(dot(n, L), 0.0);
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 22.0);

  vec3 col = mix(uA, uB, clamp(h * 0.85 + lam * 0.5, 0.0, 1.0));
  col += spec * 0.16;

  /* تخميد: الأثر أقوى في أعلى الشاشة حيث رأس الصفحة الزجاجي يموّهه، ويتلاشى
     نزولاً تحت المحتوى القارئ فلا ينافس النصّ على الانتباه ولا يقضم تباينه.
     انتبه أن gl_FragCoord.y صفرها في الأسفل لا الأعلى — عكسها يضع أقوى الأثر
     خلف الفقرات بالضبط، وهو ما هبط بتباين فقرة الميزات إلى 4.75:1. */
  float fade = smoothstep(0.0, 0.86, uv.y) * smoothstep(0.0, 0.35, 1.0 - abs(uv.x - 0.5));
  gl_FragColor = vec4(col, clamp(uAmp * fade, 0.0, 1.0));
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }

  /* الألوان تُقرأ من متغيّرات theme.css لا تُكتب هنا: تبديل المظهر يغيّر
     الخلفية معه بلا نسخة ثانية من لوحة الألوان. */
  function readColor(name, fallback) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    let m = raw.match(/^#([0-9a-f]{6})$/i);
    if (m) { const v = parseInt(m[1], 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; }
    m = raw.match(/^#([0-9a-f]{3})$/i);
    if (m) return [0, 1, 2].map(i => parseInt(m[1][i] + m[1][i], 16) / 255);
    m = raw.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
    return fallback;
  }

  function start() {
    const reduced = W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const cv = document.createElement('canvas');
    cv.className = 'bg-3d';
    cv.setAttribute('aria-hidden', 'true');

    const gl = cv.getContext('webgl', { alpha: true, antialias: false, depth: false,
      premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) return;                       /* بلا WebGL: تدرّج CSS وحده، ولا عنصر زائد */

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uT   = gl.getUniformLocation(prog, 'uT');
    const uA   = gl.getUniformLocation(prog, 'uA');
    const uB   = gl.getUniformLocation(prog, 'uB');
    const uAmp = gl.getUniformLocation(prog, 'uAmp');

    document.body.appendChild(cv);

    /* نصف الدقة بحدّ أعلى 960px عرضاً: المخرَج يمرّ خلف زجاج مموَّه، فرفع
       الدقة ينفق على تفاصيل لا تصل العين. */
    function resize() {
      const s = Math.min(0.5, 960 / Math.max(W.innerWidth, 1));
      const w = Math.max(2, Math.round(W.innerWidth * s));
      const h = Math.max(2, Math.round(W.innerHeight * s));
      if (cv.width === w && cv.height === h) return;
      cv.width = w; cv.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    }

    function theme() {
      const dark = document.documentElement.dataset.theme === 'dark';
      gl.uniform3fv(uA, readColor(dark ? '--green-950' : '--surface-2', dark ? [.01, .02, .09] : [.95, .96, .98]));
      gl.uniform3fv(uB, readColor(dark ? '--green-600' : '--green-700', dark ? [.05, .56, .68] : [.05, .44, .55]));
      // الفاتح يحتمل أثراً أخفّ: الخلفية الفاتحة تحمل النصّ الداكن، وأيّ تشبّع
      // زائد يقضم تباينه. عند 0.2 قِيست فقرة الميزات عند 4.59:1 — فوق حدّ AA
      // لكن بهامش لا يكفي لخلفية متحرّكة تتغيّر قيمتها مع الزمن. 0.12 يبقيها
      // فوق 5:1 في كل لحظة. الداكن يحتمل أكثر لأن الأثر يضيء لا يُعتِم.
      gl.uniform1f(uAmp, dark ? 0.5 : 0.12);
    }

    resize(); theme();

    let raf = 0, last = 0, t0 = 0;
    function frame(now) {
      raf = W.requestAnimationFrame(frame);
      if (now - last < 33) return;         /* ~30 إطاراً/ث */
      last = now;
      if (!t0) t0 = now;
      gl.uniform1f(uT, (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function draw1() { gl.uniform1f(uT, 0); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    function play() { if (!raf && !reduced) raf = W.requestAnimationFrame(frame); }
    function stop() { if (raf) { W.cancelAnimationFrame(raf); raf = 0; } }

    draw1();
    if (reduced) { cv.dataset.static = '1'; } else { play(); }

    document.addEventListener('visibilitychange', () => document.hidden ? stop() : play());
    W.addEventListener('resize', () => { resize(); if (reduced) draw1(); }, { passive: true });
    // تبديل المظهر يكتب data-theme على <html>؛ نتبعه بدل ربطه بزرّ بعينه
    new MutationObserver(() => { theme(); if (reduced) draw1(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    // فقد السياق يحدث فعلاً (تبديل بطاقة رسوم، سبات): نتنحّى بهدوء لا نتجمّد
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); cv.remove(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  W.FBXBackdrop = { start };
})(typeof window !== 'undefined' ? window : globalThis);
