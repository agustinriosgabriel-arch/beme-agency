/* ============================================================================
   BEME · MOTOR DE ARTES PARA REDES
   ----------------------------------------------------------------------------
   Sistema de diseño + plantillas renderizables para Instagram.
   Lo consumen dos páginas:
     · templates-instagram.html → biblioteca editable a mano / export a Canva
     · artes-campana.html       → generación automática desde una campaña real

   Dirección visual: clara y con aire, alineada con lo que @beme.agency ya
   publica (packshots sobre blanco, mockup de teléfono con el reel adentro y
   la firma "BEME AGENCY" chiquita arriba). El magenta del manual entra como
   acento, no como fondo. Quedan disponibles los fondos oscuro y vibrante para
   las piezas que necesitan contraste.
   ========================================================================== */
(function (global) {
'use strict';

/* ---------------------------------------------------------------------------
   1. CSS del sistema de diseño
   Se inyecta con BemeArtes.injectCSS(). Todo va scopeado bajo .a para no
   pisar los estilos de la página que lo hospeda. Las medidas están en píxeles
   reales de Instagram: lo que se ve es exactamente lo que se exporta.
--------------------------------------------------------------------------- */
const CSS = `
@font-face{
  font-family:'Beme Sans';
  src:local('Just Sans'),
      url('assets/brand/fonts/PlusJakartaSans-Variable.woff2') format('woff2');
  font-weight:200 800;font-style:normal;font-display:swap;
}
.a{
  --bg:#ffffff; --ink:#0f0f11; --gray:#6b6b75; --line:#e9e9ed; --panel:#f4f4f5;
  --magenta:#b2005d; --pink:#ed568f; --hot:#d90e86; --purple:#9414e0; --deep:#440b5d;
  --acc:#b2005d;
  --g-brand:linear-gradient(96deg,#ed568f 0%,#d90e86 32%,#9414e0 72%,#ed568f 100%);
  --g-vibrant:linear-gradient(135deg,#9414e0 0%,#d90e86 100%);
  --g-magenta:linear-gradient(135deg,#b2005d 0%,#ed568f 100%);
  --stroke:rgba(15,15,17,.2);

  position:relative;overflow:hidden;transform-origin:0 0;
  background:var(--bg);color:var(--ink);
  font-family:'Beme Sans','Plus Jakarta Sans',-apple-system,'Segoe UI',sans-serif;
  font-weight:400;line-height:1.15;letter-spacing:-.01em;
  -webkit-font-smoothing:antialiased;
}
.a.f45{width:1080px;height:1350px}
.a.sq {width:1080px;height:1080px}
.a.st {width:1080px;height:1920px}

/* --- Fondos -------------------------------------------------------------
   claro    → blanco puro, el que manda en el feed
   luz      → lavado pastel lila/rosa, como los posts de producto que ya usan
   oscuro   → negro con halos, para statements y portadas de reel
   vibrante → degradado pleno, sólo para llamados a la acción             */
.a[data-bg="luz"]{--bg:linear-gradient(155deg,#faf5fd 0%,#fdf0f6 55%,#f7f4fb 100%);--panel:#ffffff}
.a[data-bg="oscuro"]{
  --bg:#0f0f11;--ink:#f4f4f4;--gray:#9b9ba4;--line:#26262b;--panel:#1c1c21;
  --acc:#ed568f;--stroke:rgba(244,244,244,.5);
}
.a[data-bg="vibrante"]{--bg:#9414e0;--ink:#ffffff;--gray:rgba(255,255,255,.86);
  --line:rgba(255,255,255,.24);--panel:rgba(255,255,255,.14);
  --acc:#ffffff;--stroke:rgba(255,255,255,.62)}

.a .aura{position:absolute;border-radius:50%;filter:blur(150px);pointer-events:none}
.a .fill-vibrante{position:absolute;inset:0;background:var(--g-vibrant)}
.a .fill-deep{position:absolute;inset:0;background:linear-gradient(150deg,#440b5d 0%,#b2005d 55%,#d90e86 100%)}

/* --- Tipografía --- */
.a .disp{
  text-transform:uppercase;font-weight:800;line-height:.9;letter-spacing:-.035em;
  color:var(--ink);margin:0;
}
.a .disp .out{-webkit-text-stroke:3px var(--stroke);color:transparent}
.a .disp .grad{
  background:var(--g-vibrant);-webkit-background-clip:text;background-clip:text;
  color:transparent;-webkit-text-fill-color:transparent;
}
.a .disp .acc{color:var(--acc);-webkit-text-fill-color:var(--acc)}
.a .disp .pinkdot{color:var(--acc);-webkit-text-fill-color:var(--acc)}
/* Titular editorial: caja alta apagada, para frases largas */
.a .titular{text-transform:none;font-weight:700;letter-spacing:-.035em;line-height:1.04;color:var(--ink);margin:0}
.a .titular .acc{color:var(--acc)}
.a .titular .lig{font-weight:300;color:var(--gray)}

.a .lbl{display:flex;align-items:center;gap:20px;color:var(--acc);
  font-size:21px;font-weight:700;letter-spacing:.22em;text-transform:uppercase}
.a .lbl .dash{display:block;width:60px;height:2px;background:currentColor;flex:0 0 60px}

/* Firma chiquita arriba, igual que en el feed actual de @beme.agency */
.a .wm{position:absolute;font-size:19px;font-weight:700;letter-spacing:.38em;
  text-transform:uppercase;color:var(--gray);opacity:.72}

.a .copy{font-size:28px;font-weight:400;line-height:1.5;color:var(--gray);letter-spacing:0}
.a .copy b{color:var(--ink);font-weight:700}
.a .eyebrow{font-size:20px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--gray)}

/* --- Componentes --- */
.a .pill{display:inline-flex;align-items:center;padding:12px 26px;border-radius:999px;
  background:var(--magenta);color:#fff;font-size:19px;font-weight:700;
  letter-spacing:.13em;text-transform:uppercase;white-space:nowrap}
.a .pill.ghost{background:transparent;border:2px solid var(--line);color:var(--gray)}
.a[data-bg="vibrante"] .pill{background:#fff;color:var(--magenta)}

.a .btn{display:inline-flex;align-items:center;gap:20px;padding:26px 46px;border-radius:999px;
  width:auto;min-height:0;box-shadow:none;cursor:default;
  background:var(--magenta);color:#fff;font-size:28px;font-weight:700;letter-spacing:-.01em}
.a .btn.light{background:#0f0f11;color:#fff}
.a[data-bg="oscuro"] .btn{background:var(--g-vibrant)}
.a[data-bg="vibrante"] .btn,.a[data-bg="vibrante"] .btn.light{background:#fff;color:#0f0f11}
.a .btn svg{width:30px;height:30px;flex:0 0 30px}

.a .num{font-size:104px;font-weight:800;line-height:.92;letter-spacing:-.045em;
  font-variant-numeric:tabular-nums;color:var(--magenta)}
.a[data-bg="oscuro"] .num{
  background:var(--g-vibrant);-webkit-background-clip:text;background-clip:text;
  color:transparent;-webkit-text-fill-color:transparent}
.a[data-bg="vibrante"] .num{color:#fff}
.a .numl{font-size:19px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;
  color:var(--gray);margin-top:12px}

.a .acard{border-radius:40px;overflow:hidden;position:relative;background:var(--panel)}
.a .hair{position:absolute;background:var(--line)}

.a .vnum{position:absolute;writing-mode:vertical-rl;transform:rotate(180deg);
  font-size:24px;font-weight:700;letter-spacing:.28em;color:var(--acc)}

.a .logo{position:absolute;display:block;object-fit:contain}
.a .dots{position:absolute;display:flex;gap:15px}
.a .dots i{display:block;width:15px;height:15px;border-radius:50%;background:currentColor}

.a .scrim{position:absolute;left:0;right:0;pointer-events:none}
.a .scrim.bot{background:linear-gradient(to top,#0f0f11 4%,rgba(15,15,17,.8) 42%,rgba(15,15,17,0) 100%)}
.a .scrim.top{background:linear-gradient(to bottom,rgba(15,15,17,.8) 0%,rgba(15,15,17,0) 100%)}
.a .scrim.mag{background:linear-gradient(to top,rgba(178,0,93,.94) 2%,rgba(148,20,224,.42) 48%,rgba(15,15,17,0) 100%)}

/* --- Mockup de teléfono: el formato que más usa la cuenta --- */
.a .phone{position:absolute;border-radius:76px;background:#0f0f11;padding:13px;
  box-shadow:0 46px 90px rgba(15,15,17,.24),0 6px 18px rgba(15,15,17,.14)}
.a[data-bg="oscuro"] .phone{background:#2a2a30;box-shadow:0 46px 90px rgba(0,0,0,.6)}
.a .phone-scr{position:relative;width:100%;height:100%;border-radius:64px;overflow:hidden;background:#17171a}
.a .phone-island{position:absolute;top:34px;left:50%;transform:translateX(-50%);
  width:118px;height:34px;border-radius:20px;background:#0f0f11;z-index:2}

/* --- Slots de imagen --- */
.a .slot{position:absolute;background-size:cover;background-position:center;
  background-repeat:no-repeat;background-color:var(--panel);cursor:pointer}
.a .slot.contain{background-size:contain;background-color:transparent}
.a .slot.round{border-radius:50%}
.a .slot .ph{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:14px;text-align:center;padding:24px;line-height:1.35;
  border:3px dashed rgba(178,0,93,.35);color:#b2005d;background:rgba(244,244,245,.94);
  font-size:21px;font-weight:600;letter-spacing:0;text-transform:none;border-radius:inherit}
.a .slot.has .ph{display:none}
.a .slot .ph svg{width:46px;height:46px;opacity:.7}

/* --- Guías de área segura (no se exportan) --- */
.a .safe{position:absolute;border:3px dashed rgba(178,0,93,.55);pointer-events:none;
  display:flex;align-items:flex-start;justify-content:flex-end}
.a .safe span{margin:10px;padding:7px 14px;border-radius:8px;background:rgba(178,0,93,.9);
  color:#fff;font-size:18px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}

/* --- Edición --- */
.a [data-field]{outline:0}
.a [data-field]:hover{box-shadow:0 0 0 2px rgba(148,20,224,.35);border-radius:6px}
.a [data-field]:focus{box-shadow:0 0 0 3px rgba(178,0,93,.85);border-radius:6px}
body.beme-exporting .safe,
body.beme-exporting .slot .ph{display:none!important}
body.beme-exporting .a [data-field]{box-shadow:none!important}
`;

/* ---------------------------------------------------------------------------
   2. Utilidades
--------------------------------------------------------------------------- */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/** 842000 → "842K" · 1234567 → "1.2M" */
function compact(n){
  n = Number(n) || 0;
  if (n >= 1e9) return (n/1e9).toFixed(n % 1e9 === 0 ? 0 : 1).replace('.0','') + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(n % 1e6 === 0 ? 0 : 1).replace('.0','') + 'M';
  if (n >= 1e3) return Math.round(n/1e3) + 'K';
  return String(n);
}

/** Parte un texto en dos mitades por palabras, para titulares a dos tratamientos */
function splitHalf(text){
  const w = String(text||'').trim().split(/\s+/);
  if (w.length < 2) return [text||'', ''];
  const cut = Math.ceil(w.length/2);
  return [w.slice(0,cut).join(' '), w.slice(cut).join(' ')];
}

/** Pie de la fila de avatares: muestra 4 caras y resume el resto */
function creditos(talentos){
  const n = (talentos || []).length;
  if (!n) return 'Roster Beme';
  const extra = n - 4;
  return extra > 0
    ? `+${extra} creadores más<br>del roster Beme`
    : `${n} ${n === 1 ? 'creador' : 'creadores'}<br>del roster Beme`;
}

const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="13 5 20 12 13 19"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:32px;height:32px;flex:0 0 32px;margin-top:7px"><polyline points="20 6 9 17 4 12"/></svg>';
const PHIMG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="M21 15.5L16 10.5 5 21.5"/></svg>';

/** Logos de marca embebidos — los setea la página anfitriona con setLogos() */
let LOGO = { color:'', blanco:'' };
function setLogos(color, blanco){ LOGO.color = color; LOGO.blanco = blanco; }

/** Campo editable */
function f(key, html, cls, style){
  return `<div class="${cls||''}" ${style?`style="${style}"`:''} data-field="${key}" contenteditable="true" spellcheck="false">${html}</div>`;
}
/** Campo editable inline (span) */
function fs(key, html, cls, style){
  return `<span class="${cls||''}" ${style?`style="${style}"`:''} data-field="${key}" contenteditable="true" spellcheck="false">${html}</span>`;
}
/** Slot de imagen */
function slot(key, style, cls, label){
  return `<div class="slot ${cls||''}" data-img="${key}" style="${style||''}">
    <div class="ph">${PHIMG}${label ? label.replace(/\n/g,'<br>') : 'Imagen'}</div></div>`;
}

/** Halos de fondo. En claro son un lavado apenas perceptible; el aire manda. */
function auras(preset){
  const p = {
    suave:    `<div class="aura" style="right:-380px;bottom:-360px;width:900px;height:900px;background:rgba(178,0,93,.1)"></div>`,
    esquinas: `<div class="aura" style="left:-340px;top:-300px;width:840px;height:840px;background:rgba(178,0,93,.34)"></div>
               <div class="aura" style="right:-380px;bottom:-340px;width:880px;height:880px;background:rgba(148,20,224,.26)"></div>`,
    arriba:   `<div class="aura" style="left:50%;top:-540px;transform:translateX(-50%);width:1150px;height:860px;background:rgba(178,0,93,.3)"></div>
               <div class="aura" style="right:-340px;bottom:-300px;width:720px;height:720px;background:rgba(148,20,224,.22)"></div>`,
    abajo:    `<div class="aura" style="left:-320px;bottom:-420px;width:940px;height:940px;background:rgba(217,14,134,.28)"></div>
               <div class="aura" style="right:-360px;top:-300px;width:780px;height:780px;background:rgba(68,11,93,.5)"></div>`
  };
  return p[preset] || p.suave;
}

/** Firma de arriba: "BEME AGENCY" a la izquierda y el isotipo a la derecha.
    Es el gesto que la cuenta ya usa, sólo que ordenado y siempre igual. */
function firma(y, opts){
  const o = opts || {};
  const x = o.x || 80;
  const src = o.claro === false ? LOGO.blanco : LOGO.color;
  return `${f('firma','Beme Agency','wm', `top:${y + 6}px;left:${x}px`)}
          <img class="logo" src="${src}" alt="Beme" style="top:${y - 12}px;right:${x}px;width:${o.logoW || 58}px">`;
}
/** Cabecera con el logo grande a la izquierda (piezas oscuras y de portada) */
function header(y, opts){
  const o = opts || {};
  const w = o.logoW || 112;
  const src = o.claro ? LOGO.color : LOGO.blanco;
  return `<img class="logo" src="${src}" alt="Beme" style="top:${y}px;left:${o.x||80}px;width:${w}px">
          <div class="dots" style="top:${y + Math.round(w*0.3)}px;right:${o.x||80}px;color:${o.dotColor || 'var(--acc)'}"><i></i><i></i><i></i></div>`;
}

/* ---------------------------------------------------------------------------
   3. Datos de ejemplo — también es el contrato de datos que consume el agente
--------------------------------------------------------------------------- */
const DEMO = {
  marca:'Anker',
  marcaLogo:'',
  campana:'Lanzamiento Soundcore',
  periodo:'Junio – Julio 2026',
  hashtag:'#AnkerXBeme',
  talentos:[
    {nombre:'Camila Rossi', handle:'@camirossi', foto:'', categorias:['Beauty','Lifestyle'],
     seguidores:{instagram:842000, tiktok:1200000, youtube:0}},
    {nombre:'Tomás Vidal', handle:'@tomasvidal', foto:'', categorias:['Tech'],
     seguidores:{instagram:410000, tiktok:930000, youtube:120000}},
    {nombre:'Lu Fernández', handle:'@lufernandez', foto:'', categorias:['Lifestyle'],
     seguidores:{instagram:265000, tiktok:540000, youtube:0}}
  ],
  metricas:[
    {n:'4.8M', l:'Alcance'},
    {n:'312K', l:'Interacciones'},
    {n:'7.1%', l:'Engagement'}
  ],
  titulo:'Del brief al reporte sin sorpresas',
  subtitulo:'Tres semanas de activación en Instagram y TikTok.',
  frase:'No buscamos seguidores. Buscamos personas que eligen.',
  bullets:['+10K seguidores en Instagram o TikTok','Contenido propio y constante','Ganas de trabajar con marcas grandes'],
  cta:'Escribinos por DM',
  dato:{n:'61%', txt:'de los consumidores confía más en la recomendación de un creador que en un anuncio.', fuente:'Informe interno Beme · 2026'},
  slides:[
    {n:'01', titulo:'Elegir por seguidores y no por audiencia',
     texto:'Un perfil de 900K con audiencia fuera de tu mercado convierte peor que uno de 40K bien segmentado. Pedí siempre el desglose por país, edad y género.'},
    {n:'02', titulo:'Cerrar sin contrato ni derechos de imagen',
     texto:'Definí antes cuántos días podés pautar el contenido y a qué costo. Después de publicado, negociarlo sale el triple.'}
  ],
  marcasLogos:[]
};

/* ---------------------------------------------------------------------------
   4. Plantillas
   Cada una: { id, nombre, grupo, clase, bg, render(d) → HTML del artboard }
--------------------------------------------------------------------------- */
const TEMPLATES = [

/* ═══════════════════ FEED 4:5 · 1080×1350 ═══════════════════ */
{
  // El formato estrella de la cuenta: el reel del creador dentro del teléfono.
  id:'mockup-reel', nombre:'Reel en mockup', grupo:'Feed 4:5', clase:'f45', bg:'luz',
  render(d){
    return `
      ${firma(74)}
      ${slot('marcaLogo','left:50%;top:150px;transform:translateX(-50%);width:300px;height:74px','contain','Logo de la marca')}
      <div class="phone" style="left:50%;top:284px;transform:translateX(-50%);width:520px;height:1010px">
        <div class="phone-scr">
          ${slot('reel.frame','inset:0','','Frame vertical del reel\n9:16')}
          <div class="phone-island"></div>
        </div>
      </div>
      ${f('mockup.pie', esc(d.talentos[0] && d.talentos[0].handle || ''),'eyebrow','position:absolute;left:80px;bottom:52px')}
      ${f('mockup.tag','Contenido de campaña','eyebrow','position:absolute;right:80px;bottom:52px;text-align:right')}`;
  }
},
{
  // Packshot sobre blanco: el post más limpio que ya publican.
  id:'packshot', nombre:'Producto sobre blanco', grupo:'Feed 4:5', clase:'f45', bg:'claro',
  render(d){
    return `
      ${auras('suave')}
      ${firma(74)}
      ${slot('producto.img','left:110px;top:230px;right:110px;height:700px','contain','Foto del producto\nsin fondo, PNG')}
      ${slot('marcaLogo','left:50%;top:990px;transform:translateX(-50%);width:280px;height:70px','contain','Logo de la marca')}
      <div class="hair" style="left:390px;right:390px;top:1110px;height:1px"></div>
      ${f('packshot.txt', esc(d.campana||''),'eyebrow','position:absolute;left:80px;right:80px;bottom:80px;text-align:center')}`;
  }
},
{
  id:'talento-destacado', nombre:'Talento destacado', grupo:'Feed 4:5', clase:'f45', bg:'claro',
  render(d){
    const t = d.talentos[0] || {};
    const s = t.seguidores || {};
    const partes = String(t.nombre||'').trim().split(/\s+/);
    const mets = [
      s.instagram ? {n:compact(s.instagram), l:'Instagram'} : null,
      s.tiktok    ? {n:compact(s.tiktok),    l:'TikTok'}    : null,
      s.youtube   ? {n:compact(s.youtube),   l:'YouTube'}   : null
    ].filter(Boolean).slice(0,3);
    return `
      ${firma(74)}
      <div class="acard" style="position:absolute;left:80px;right:80px;top:150px;height:720px">
        ${slot('talento0.foto','inset:0','','Foto del talento\n920×720')}
      </div>
      <div style="position:absolute;left:80px;right:80px;top:920px">
        ${f('label','<span class="dash"></span>Roster Beme','lbl')}
        <div class="disp fit" style="font-size:104px;margin-top:26px">
          ${fs('talento0.nombre1', esc(partes[0]||''))} ${fs('talento0.nombre2', `<span class="acc">${esc(partes.slice(1).join(' '))}</span>`)}
        </div>
        ${f('talento0.handle', esc(t.handle||''),'copy','margin-top:16px;font-size:30px;font-weight:500')}
      </div>
      <div style="position:absolute;left:80px;right:80px;bottom:78px;display:flex;align-items:flex-end;justify-content:space-between;gap:30px">
        <div style="display:flex;gap:64px">
          ${mets.map((m,i)=>`<div>
            ${f('met'+i+'.n', esc(m.n),'num','font-size:76px')}
            ${f('met'+i+'.l', esc(m.l),'numl')}
          </div>`).join('')}
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;max-width:360px">
          ${(t.categorias||[]).slice(0,2).map((c,i)=>
            `<span class="pill ghost" data-field="talento0.cat${i}" contenteditable="true">${esc(c)}</span>`).join('')}
        </div>
      </div>`;
  }
},
{
  id:'caso-exito', nombre:'Resultados de campaña', grupo:'Feed 4:5', clase:'f45', bg:'claro',
  render(d){
    const [a,b] = splitHalf(d.campana);
    return `
      ${auras('suave')}
      ${firma(74)}
      <div style="position:absolute;left:80px;right:80px;top:210px">
        ${f('label','<span class="dash"></span>Caso de éxito','lbl')}
        <div class="disp fit" style="font-size:100px;margin-top:28px">
          ${fs('campana1', esc(a))}${b?'<br>':''}${b?fs('campana2',`<span class="acc">${esc(b)}</span>`):''}
        </div>
      </div>
      ${slot('marcaLogo','left:80px;top:590px;width:260px;height:92px;background-position:left center','contain','Logo de la marca')}
      <div class="hair" style="left:80px;right:80px;top:760px;height:1px"></div>
      <div style="position:absolute;left:80px;right:80px;top:820px;display:flex;gap:60px;flex-wrap:wrap">
        ${(d.metricas||[]).slice(0,3).map((m,i)=>`<div>
          ${f('metrica'+i+'.n', esc(m.n),'num','font-size:92px')}
          ${f('metrica'+i+'.l', esc(m.l),'numl')}
        </div>`).join('')}
      </div>
      ${f('subtitulo', esc(d.subtitulo||''),'copy','position:absolute;left:80px;right:170px;top:1030px')}
      <div style="position:absolute;left:80px;bottom:82px;display:flex;align-items:center">
        ${(d.talentos||[]).slice(0,4).map((t,i)=>
          `<div class="slot round" data-img="talento${i}.foto" style="position:relative;width:96px;height:96px;
            border:5px solid #fff;box-shadow:0 2px 10px rgba(15,15,17,.12);margin-left:${i?'-28px':'0'};z-index:${9-i}">
            <div class="ph" style="font-size:0;border-width:2px"></div></div>`).join('')}
        ${f('creditos', creditos(d.talentos),'copy','margin-left:28px;font-size:23px;line-height:1.35')}
      </div>`;
  }
},
{
  id:'frase', nombre:'Frase / statement', grupo:'Feed 4:5', clase:'f45', bg:'claro',
  render(d){
    // el punto final lo pone la pieza en magenta, así que se lo saco al texto
    const [a,b] = splitHalf(String(d.frase||'').trim().replace(/\.$/,''));
    return `
      ${auras('suave')}
      ${firma(74)}
      <div style="position:absolute;left:80px;right:100px;top:400px">
        <div class="titular" style="font-size:98px">
          ${fs('frase1', esc(a))} ${fs('frase2', `<span class="acc">${esc(b)}</span>`)}<span class="acc">.</span>
        </div>
      </div>
      <div class="hair" style="left:80px;bottom:186px;width:110px;height:5px;background:var(--acc);border-radius:3px"></div>
      ${f('firmaPie','Beme Agency · Marketing de influencers','eyebrow','position:absolute;left:80px;bottom:110px')}`;
  }
},
{
  id:'carrusel-portada', nombre:'Portada de carrusel', grupo:'Feed 4:5', clase:'f45', bg:'claro',
  render(d){
    const [a,b] = splitHalf(d.titulo);
    return `
      ${auras('suave')}
      ${firma(74)}
      <div class="acard" style="position:absolute;right:80px;top:170px;width:390px;height:500px;transform:rotate(4deg)">
        ${slot('portada.img','inset:0','','Foto o mockup')}
      </div>
      <div style="position:absolute;left:80px;right:80px;top:740px">
        ${f('label','<span class="dash"></span>Guía para marcas','lbl')}
        <div class="disp fit" style="font-size:112px;margin-top:28px">
          ${fs('titulo1', esc(a))}<br>${fs('titulo2', `<span class="acc">${esc(b)}</span>`)}
        </div>
        ${f('subtitulo', esc(d.subtitulo||''),'copy','margin-top:30px;max-width:800px')}
      </div>
      <div style="position:absolute;left:80px;bottom:84px">
        <span class="btn">${fs('cta_deslizar','Deslizá')}${ARROW}</span>
      </div>`;
  }
},
{
  id:'carrusel-slide', nombre:'Slide de carrusel', grupo:'Feed 4:5', clase:'f45', bg:'claro',
  render(d){
    const s = (d.slides && d.slides[0]) || {};
    return `
      ${firma(74)}
      <div class="acard" style="position:absolute;left:80px;right:80px;top:150px;height:420px">
        ${slot('slide0.img','inset:0','','Imagen del slide')}
      </div>
      <div style="position:absolute;left:80px;right:80px;top:640px">
        <div style="display:flex;align-items:baseline;gap:26px">
          ${f('slide0.n', esc(s.n||'01'),'num','font-size:70px')}
          ${f('slide0.titulo', esc(s.titulo||''),'disp','font-size:64px;flex:1')}
        </div>
        <div class="hair" style="position:relative;margin-top:36px;width:110px;height:5px;background:var(--acc);border-radius:3px"></div>
        ${f('slide0.texto', esc(s.texto||''),'copy','margin-top:36px')}
      </div>
      ${f('slide0.pie','Seguí deslizando','eyebrow','position:absolute;left:80px;bottom:80px')}`;
  }
},
{
  id:'marcas', nombre:'Marcas que confían', grupo:'Feed 4:5', clase:'f45', bg:'claro',
  render(d){
    const logos = (d.marcasLogos && d.marcasLogos.length) ? d.marcasLogos : new Array(9).fill('');
    return `
      ${firma(74)}
      <div style="position:absolute;left:80px;right:80px;top:200px">
        ${f('label','<span class="dash"></span>Clientes','lbl')}
        <div class="disp fit" style="font-size:96px;margin-top:28px">
          ${fs('marcas1','Marcas que')}<br>${fs('marcas2','<span class="acc">confían</span> en Beme')}
        </div>
      </div>
      <div style="position:absolute;left:80px;right:80px;top:610px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px">
        ${logos.slice(0,9).map((src,i)=>
          `<div class="acard" style="height:160px;border-radius:26px;background:var(--panel)">
             <div class="slot contain ${src?'has':''}" data-img="marcasLogos.${i}"
                  style="inset:26px;${src?`background-image:url('${src}')`:''}">
               <div class="ph" style="font-size:16px;border-width:2px;border-radius:14px">Logo</div>
             </div>
           </div>`).join('')}
      </div>
      ${f('pie','+ 40 marcas activas en LATAM, EE.UU. y Europa','eyebrow','position:absolute;left:80px;bottom:80px')}`;
  }
},
{
  id:'convocatoria', nombre:'Convocatoria de creadores', grupo:'Feed 4:5', clase:'f45', bg:'claro',
  render(d){
    return `
      ${auras('suave')}
      ${firma(74)}
      <div style="position:absolute;left:80px;right:80px;top:250px">
        ${f('label','<span class="dash"></span>Casting abierto','lbl')}
        <div class="disp fit" style="font-size:122px;margin-top:30px">
          ${fs('conv1','Buscamos')}<br>${fs('conv2','<span class="acc">creadores</span>')}
        </div>
        ${f('conv_sub','Sumate al roster de Beme y trabajá con marcas internacionales.','copy','margin-top:30px;max-width:820px')}
      </div>
      <div class="hair" style="left:80px;right:80px;top:830px;height:1px"></div>
      <div style="position:absolute;left:80px;right:80px;top:880px;display:flex;flex-direction:column;gap:26px">
        ${(d.bullets||[]).slice(0,3).map((b,i)=>
          `<div style="display:flex;gap:22px;align-items:flex-start;color:var(--acc)">${CHECK}
            ${f('bullet'+i, esc(b),'copy','color:var(--ink)')}</div>`).join('')}
      </div>
      <div style="position:absolute;left:80px;bottom:84px">
        <span class="btn">${fs('cta','Postulate en el link de la bio')}${ARROW}</span>
      </div>`;
  }
},

/* ═══════════════════ CUADRADO 1:1 · 1080×1080 ═══════════════════ */
{
  id:'dato', nombre:'Dato del mercado', grupo:'Cuadrado 1:1', clase:'sq', bg:'claro',
  render(d){
    const x = d.dato || {};
    return `
      ${auras('suave')}
      ${firma(70)}
      <div style="position:absolute;left:80px;right:80px;top:280px">
        ${f('label','<span class="dash"></span>Dato','lbl')}
        ${f('dato.n', esc(x.n||''),'num','font-size:250px;margin-top:14px')}
        ${f('dato.txt', esc(x.txt||''),'titular','font-size:52px;margin-top:32px;font-weight:400')}
      </div>
      <div class="hair" style="left:80px;bottom:146px;width:110px;height:5px;background:var(--acc);border-radius:3px"></div>
      ${f('dato.fuente', esc(x.fuente||''),'eyebrow','position:absolute;left:80px;bottom:80px')}`;
  }
},
{
  id:'nueva-campana', nombre:'Nueva campaña', grupo:'Cuadrado 1:1', clase:'sq', bg:'oscuro',
  render(d){
    const [a,b] = splitHalf(d.marca);
    return `
      ${slot('campana.img','inset:0','','Foto de la campaña\n1080×1080')}
      <div class="scrim mag" style="bottom:0;height:800px"></div>
      ${header(70,{logoW:100})}
      <div style="position:absolute;left:80px;right:80px;bottom:80px">
        ${f('label','<span class="dash" style="background:#fff"></span>Nueva campaña','lbl','color:#fff')}
        <div class="disp fit" style="font-size:110px;margin-top:26px;color:#fff">
          ${fs('marca1', esc(a))}${b?`<br>${fs('marca2',`<span class="out" style="-webkit-text-stroke-color:rgba(255,255,255,.75)">${esc(b)}</span>`)}`:''}
        </div>
        ${f('campana.talentos', (d.talentos||[]).slice(0,3).map(t=>esc(t.handle)).join(' · '),'copy','margin-top:22px;color:rgba(255,255,255,.9);font-size:26px')}
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:26px">
          ${fs('campana.periodo', esc(d.periodo||''),'pill')}
          ${fs('campana.hashtag', esc(d.hashtag||''),'pill ghost','color:#fff;border-color:rgba(255,255,255,.5)')}
        </div>
      </div>`;
  }
},

/* ═══════════════════ STORIES / REELS 9:16 · 1080×1920 ═══════════════════ */
{
  id:'story-talento', nombre:'Story de talento', grupo:'Stories 9:16', clase:'st', bg:'claro',
  render(d){
    const t = d.talentos[0] || {};
    const s = t.seguidores || {};
    const partes = String(t.nombre||'').trim().split(/\s+/);
    const mets = [
      s.instagram ? {n:compact(s.instagram), l:'Instagram'} : null,
      s.tiktok    ? {n:compact(s.tiktok),    l:'TikTok'}    : null
    ].filter(Boolean);
    return `
      ${auras('suave')}
      ${firma(280)}
      <div class="acard" style="position:absolute;left:80px;right:80px;top:380px;height:700px">
        ${slot('talento0.foto','inset:0','','Foto del talento')}
      </div>
      <div style="position:absolute;left:80px;right:80px;top:1140px">
        ${f('label','<span class="dash"></span>Nuevo en el roster','lbl')}
        <div class="disp fit" style="font-size:112px;margin-top:26px">
          ${fs('talento0.nombre1', esc(partes[0]||''))}
          ${fs('talento0.nombre2', `<span class="acc">${esc(partes.slice(1).join(' '))}</span>`)}
        </div>
        <div style="display:flex;gap:64px;margin-top:38px">
          ${mets.map((m,i)=>`<div>${f('smet'+i+'.n', esc(m.n),'num','font-size:78px')}${f('smet'+i+'.l', esc(m.l),'numl')}</div>`).join('')}
        </div>
      </div>
      <div style="position:absolute;left:80px;bottom:280px"><span class="btn">${fs('cta_perfil','Ver perfil completo')}${ARROW}</span></div>
      <div class="safe" style="left:0;right:0;top:0;height:250px;border-width:0 0 3px"><span>UI de Instagram</span></div>
      <div class="safe" style="left:0;right:0;bottom:0;height:250px;border-width:3px 0 0"><span>UI de Instagram</span></div>`;
  }
},
{
  id:'story-anuncio', nombre:'Story de anuncio', grupo:'Stories 9:16', clase:'st', bg:'claro',
  render(d){
    const [a,b] = splitHalf(d.titulo);
    return `
      ${auras('suave')}
      ${firma(290)}
      <div style="position:absolute;left:80px;right:80px;top:640px">
        ${f('label','<span class="dash"></span>Novedad','lbl')}
        <div class="disp fit" style="font-size:126px;margin-top:30px">
          ${fs('stitulo1', esc(a))}<br>${fs('stitulo2', `<span class="acc">${esc(b)}</span>`)}
        </div>
        ${f('ssub', esc(d.subtitulo||''),'copy','margin-top:34px;max-width:880px')}
      </div>
      <div class="acard" style="position:absolute;left:80px;right:80px;top:1180px;height:300px">
        ${slot('story.img','inset:0','','Imagen opcional')}
      </div>
      <div style="position:absolute;left:80px;bottom:296px"><span class="btn">${fs('cta', esc(d.cta||''))}${ARROW}</span></div>
      <div class="safe" style="left:0;right:0;top:0;height:250px;border-width:0 0 3px"><span>UI de Instagram</span></div>
      <div class="safe" style="left:0;right:0;bottom:0;height:250px;border-width:3px 0 0"><span>UI de Instagram</span></div>`;
  }
},
{
  id:'reel-cover', nombre:'Portada de reel', grupo:'Stories 9:16', clase:'st', bg:'oscuro',
  render(d){
    const [a,b] = splitHalf(d.titulo);
    return `
      ${slot('reel.img','inset:0','','Frame del reel\n1080×1920')}
      <div class="scrim bot" style="bottom:0;height:1440px"></div>
      <div style="position:absolute;left:80px;right:80px;top:780px">
        <span class="pill" data-field="reel.tag" contenteditable="true">Beme tips</span>
        <div class="disp fit" style="font-size:132px;margin-top:36px;color:#fff">
          ${fs('rtitulo1', esc(a))}<br>${fs('rtitulo2', `<span class="grad">${esc(b)}</span>`)}
        </div>
        ${f('reel.sub','En 40 segundos','copy','margin-top:30px;font-size:32px;color:rgba(255,255,255,.85)')}
      </div>
      <img class="logo" src="${LOGO.blanco}" alt="Beme" style="bottom:420px;left:80px;width:110px">
      <div class="safe" style="left:0;right:0;top:285px;height:1350px"><span>Recorte visible en el feed · 1080×1350</span></div>
      <div class="safe" style="left:0;right:0;bottom:0;height:390px;border-width:3px 0 0"><span>Tapado por el título y la UI</span></div>`;
  }
}
];

/* ---------------------------------------------------------------------------
   5. API pública
--------------------------------------------------------------------------- */
function injectCSS(){
  if (document.getElementById('beme-artes-css')) return;
  const st = document.createElement('style');
  st.id = 'beme-artes-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

/** Devuelve un <div class="a ..."> completo, listo para insertar en el DOM */
function build(tplId, data){
  const tpl = TEMPLATES.find(t => t.id === tplId);
  if (!tpl) throw new Error('Plantilla desconocida: ' + tplId);
  const d = Object.assign({}, DEMO, data || {});
  const el = document.createElement('div');
  el.className = 'a ' + tpl.clase;
  el.dataset.bg = tpl.bg || 'claro';
  el.dataset.tpl = tpl.id;
  el.dataset.nombre = tpl.nombre;
  el.innerHTML = tpl.render(d);
  // pintar las imágenes que ya vengan en los datos
  el.querySelectorAll('[data-img]').forEach(s => {
    const v = getPath(d, s.dataset.img);
    if (v) { s.style.backgroundImage = `url('${v}')`; s.classList.add('has'); }
  });
  return el;
}

/** Achica los titulares marcados con .fit hasta que cada renglón entre completo.
    Hay que llamarlo con el artboard YA insertado en el DOM: necesita medir.
    Los titulares llevan sus saltos de línea puestos a mano, así que lo que se
    corrige es una palabra larga que se partiría al medio. */
function ajustar(root){
  root.querySelectorAll('.disp.fit').forEach(el => {
    const ancho = el.clientWidth;
    if (!ancho) return;
    const previo = el.style.whiteSpace;
    el.style.whiteSpace = 'nowrap';
    const necesita = el.scrollWidth;      // ancho del renglón más largo
    el.style.whiteSpace = previo;
    if (necesita > ancho){
      const base = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = Math.floor(base * (ancho / necesita)) + 'px';
    }
  });
}

/** Lee "talentos.0.foto" o "talento0.foto" dentro del objeto de datos */
function getPath(obj, path){
  if (!path) return '';
  const m = path.match(/^talento(\d+)\.(.+)$/);
  if (m) { const t = (obj.talentos||[])[+m[1]]; return t ? t[m[2]] : ''; }
  const m2 = path.match(/^marcasLogos\.(\d+)$/);
  if (m2) return (obj.marcasLogos||[])[+m2[1]] || '';
  return path.split('.').reduce((a,k)=> (a==null ? '' : a[k]), obj) || '';
}

/* --- Exportación ------------------------------------------------------- */

/** Renderiza un artboard a PNG de 1080 px reales.
    Usa html-to-image (SVG foreignObject) porque respeta text-stroke,
    background-clip:text y degradados, que html2canvas no soporta. */
async function toPng(el){
  const prevTransform = el.style.transform;
  document.body.classList.add('beme-exporting');
  el.style.transform = 'none';
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    if (!global.htmlToImage) throw new Error('Falta la librería html-to-image');
    return await global.htmlToImage.toBlob(el, {
      width: el.offsetWidth,
      height: el.offsetHeight,
      pixelRatio: 1,
      cacheBust: false,
      style: { transform:'none', margin:'0' }
    });
  } finally {
    el.style.transform = prevTransform;
    document.body.classList.remove('beme-exporting');
  }
}

function download(blob, nombre){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Exporta varios artboards a un ZIP. onProgress(i, total, nombre) */
async function toZip(els, nombreZip, onProgress){
  if (!global.JSZip) throw new Error('Falta la librería JSZip');
  const zip = new global.JSZip();
  for (let i = 0; i < els.length; i++){
    const el = els[i];
    const nom = (el.dataset.tpl || 'arte') + '.png';
    if (onProgress) onProgress(i + 1, els.length, nom);
    const blob = await toPng(el);
    zip.file(`${String(i+1).padStart(2,'0')}-beme-${nom}`, blob);
  }
  const out = await zip.generateAsync({type:'blob'});
  download(out, nombreZip || 'beme-artes.zip');
}

global.BemeArtes = {
  CSS, TEMPLATES, DEMO,
  injectCSS, build, setLogos, ajustar,
  toPng, toZip, download,
  compact, splitHalf, getPath
};

})(window);
