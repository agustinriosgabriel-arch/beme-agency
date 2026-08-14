/* ══════════════════════════════════════════════════════════════
   BEME · Compresión de archivos en el navegador (sin build step)

   Uso:
     const r = await MediaCompress.prepare(file, { onProgress(pct, label){} });
     // r.file      → File a subir (comprimido u original)
     // r.changed   → true si se comprimió
     // r.original  → File original
     // r.note      → texto corto para el usuario (o null)

   · Imágenes: canvas (resize + re-encode JPEG). Instantáneo.
   · Video:    WebCodecs (mp4box demuxea, mp4-muxer remuxea). Acelerado
               por hardware. Las libs se bajan del CDN sólo cuando hace
               falta comprimir un video.

   REGLA DE ORO: ante cualquier duda o error devuelve el archivo ORIGINAL.
   Nunca sube un archivo que no haya podido verificar que se reproduce.
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var CFG = {
    // Imágenes
    imgMinBytes: 900 * 1024,          // por debajo de esto no se toca
    imgMaxDim: 2560,                  // lado largo máximo
    imgQuality: 0.82,
    // Video
    vidMinBytes: 20 * 1024 * 1024,    // por debajo de esto no se toca
    vidMaxBytes: 1024 * 1024 * 1024,  // por encima no se intenta (memoria del browser); si falla, la REGLA DE ORO devuelve el original
    vidMaxDim: 1920,                  // lado largo máximo (1080p vertical u horizontal)
    vidBpp: 0.085,                    // bits por pixel por frame → ~5 Mbps en 1080p30
    vidGopSec: 2,                     // keyframe cada 2s
    minGainPct: 12,                   // si no ahorra al menos esto, se queda el original
  };

  var MP4BOX_URL = 'https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js';
  var MUXER_URL  = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/build/mp4-muxer.min.js';

  // ── Utils ────────────────────────────────────────────────────
  function fmtSize(b) {
    if (!b && b !== 0) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  }
  function swapExt(name, ext) {
    return String(name || 'archivo').replace(/\.[^.\/\\]+$/, '') + '.' + ext;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function noop() {}

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  var libsPromise = null;
  function videoLibs() {
    if (!libsPromise) {
      libsPromise = (async function () {
        if (!global.MP4Box) await loadScript(MP4BOX_URL);
        if (!global.Mp4Muxer) await loadScript(MUXER_URL);
        if (!global.MP4Box || !global.Mp4Muxer) throw new Error('libs de video no disponibles');
        return { MP4Box: global.MP4Box, Mp4Muxer: global.Mp4Muxer };
      })().catch(function (e) { libsPromise = null; throw e; });
    }
    return libsPromise;
  }

  function videoSupported() {
    return typeof global.VideoEncoder === 'function' &&
           typeof global.VideoDecoder === 'function' &&
           typeof global.VideoFrame === 'function' &&
           typeof global.EncodedVideoChunk === 'function';
  }

  // ── Imágenes ─────────────────────────────────────────────────
  async function compressImage(file) {
    if (typeof createImageBitmap !== 'function') return null;

    var bmp;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      try { bmp = await createImageBitmap(file); } catch (e2) { return null; } // HEIC y similares
    }

    var scale = Math.min(1, CFG.imgMaxDim / Math.max(bmp.width, bmp.height));
    // Nada que ganar: ya es chica y de peso razonable
    if (scale === 1 && file.size < CFG.imgMinBytes) { if (bmp.close) bmp.close(); return null; }

    var w = Math.max(1, Math.round(bmp.width * scale));
    var h = Math.max(1, Math.round(bmp.height * scale));

    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) { if (bmp.close) bmp.close(); return null; }
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);           // los PNG con alpha van sobre blanco, no negro
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();

    var blob = await new Promise(function (res) {
      canvas.toBlob(function (b) { res(b); }, 'image/jpeg', CFG.imgQuality);
    });
    canvas.width = canvas.height = 0;   // liberar
    if (!blob || !blob.size) return null;
    if (blob.size >= file.size * (1 - CFG.minGainPct / 100)) return null;

    return new File([blob], swapExt(file.name, 'jpg'), {
      type: 'image/jpeg',
      lastModified: file.lastModified || undefined,
    });
  }

  // ── Video: demux con mp4box ──────────────────────────────────
  function boxDescription(mp4, MP4Box, trackId) {
    // El build UMD de mp4box expone DataStream como global aparte, no en MP4Box
    var DS = MP4Box.DataStream || global.DataStream;
    if (!DS) return null;
    var trak = mp4.getTrackById(trackId);
    var entries = trak && trak.mdia && trak.mdia.minf && trak.mdia.minf.stbl &&
                  trak.mdia.minf.stbl.stsd && trak.mdia.minf.stbl.stsd.entries;
    if (!entries) return null;
    for (var i = 0; i < entries.length; i++) {
      var box = entries[i].avcC || entries[i].hvcC || entries[i].vpcC || entries[i].av1C;
      if (box) {
        var stream = new DS(undefined, 0, DS.BIG_ENDIAN);
        box.write(stream);
        return new Uint8Array(stream.buffer, 8); // saltear el header del box
      }
    }
    return null;
  }

  // DecoderSpecificInfo del AAC (dentro del esds). Sin esto no remuxeamos audio.
  function aacDescription(mp4, trackId) {
    var trak = mp4.getTrackById(trackId);
    var entries = trak && trak.mdia && trak.mdia.minf && trak.mdia.minf.stbl &&
                  trak.mdia.minf.stbl.stsd && trak.mdia.minf.stbl.stsd.entries;
    if (!entries) return null;
    for (var i = 0; i < entries.length; i++) {
      var esds = entries[i].esds;
      if (!esds || !esds.esd || !esds.esd.descs) continue;
      var d0 = esds.esd.descs[0];
      if (!d0 || !d0.descs) continue;
      var d1 = d0.descs[0];
      if (d1 && d1.data && d1.data.length) return new Uint8Array(d1.data);
    }
    return null;
  }

  async function demux(MP4Box, file) {
    var buf = await file.arrayBuffer();
    buf.fileStart = 0;

    var mp4 = MP4Box.createFile();
    var vTrack = null, aTrack = null, err = null;
    var vSamples = [], aSamples = [];

    mp4.onError = function (e) { err = new Error('mp4box: ' + e); };
    mp4.onReady = function (info) {
      vTrack = (info.videoTracks || [])[0] || null;
      aTrack = (info.audioTracks || [])[0] || null;
      if (!vTrack) { err = new Error('el archivo no tiene pista de video'); return; }
      mp4.setExtractionOptions(vTrack.id, 'v', { nbSamples: 1e9 });
      if (aTrack) mp4.setExtractionOptions(aTrack.id, 'a', { nbSamples: 1e9 });
      mp4.start();
    };
    mp4.onSamples = function (id, user, samples) {
      var bucket = user === 'v' ? vSamples : aSamples;
      for (var i = 0; i < samples.length; i++) {
        var s = samples[i];
        bucket.push({
          data: s.data, cts: s.cts, dts: s.dts,
          dur: s.duration, ts: s.timescale, sync: !!s.is_sync,
        });
      }
    };

    mp4.appendBuffer(buf);
    mp4.flush();

    if (err) throw err;
    if (!vTrack) throw new Error('no se pudo leer el video (¿no es MP4/MOV?)');
    if (!vSamples.length) throw new Error('no se pudieron extraer los frames');

    return {
      mp4: mp4,
      video: { track: vTrack, samples: vSamples, description: boxDescription(mp4, MP4Box, vTrack.id) },
      audio: aTrack ? { track: aTrack, samples: aSamples, description: aacDescription(mp4, aTrack.id) } : null,
    };
  }

  // ── Video: elegir config de encoder soportada ────────────────
  async function pickEncoderConfig(w, h, bitrate, fps) {
    var candidates = ['avc1.640028', 'avc1.4d0028', 'avc1.42001f'];
    for (var i = 0; i < candidates.length; i++) {
      var cfg = {
        codec: candidates[i],
        width: w, height: h,
        bitrate: bitrate,
        framerate: fps,
        avc: { format: 'avc' },
        hardwareAcceleration: 'no-preference',
        latencyMode: 'quality',
      };
      try {
        var sup = await global.VideoEncoder.isConfigSupported(cfg);
        if (sup && sup.supported) return sup.config || cfg;
      } catch (e) { /* probar el siguiente */ }
    }
    return null;
  }

  // ── Video: verificar que el resultado realmente se reproduce ─
  function playable(blob, expectedDurSec) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var v = document.createElement('video');
      var done = false;
      function finish(ok, why) {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        v.removeAttribute('src');
        ok ? resolve(true) : reject(new Error(why));
      }
      var timer = setTimeout(function () { finish(false, 'timeout verificando el video'); }, 20000);
      v.preload = 'metadata';
      v.muted = true;
      v.onloadedmetadata = function () {
        clearTimeout(timer);
        if (!v.videoWidth || !v.videoHeight) return finish(false, 'el video resultante no tiene imagen');
        if (!isFinite(v.duration) || v.duration <= 0) return finish(false, 'duración inválida');
        if (expectedDurSec && Math.abs(v.duration - expectedDurSec) / expectedDurSec > 0.08) {
          return finish(false, 'la duración no coincide con el original');
        }
        finish(true);
      };
      v.onerror = function () { clearTimeout(timer); finish(false, 'el video resultante no se puede decodificar'); };
      v.src = url;
    });
  }

  // ── Video: transcodificar ────────────────────────────────────
  async function compressVideo(file, onProgress) {
    if (!videoSupported()) return { skip: 'Tu navegador no soporta comprimir video (se sube el original).' };
    if (file.size > CFG.vidMaxBytes) {
      return { skip: 'El video pesa ' + fmtSize(file.size) + ' — demasiado para comprimir en el navegador, se sube tal cual.' };
    }

    var libs = await videoLibs();
    var MP4Box = libs.MP4Box, Mp4Muxer = libs.Mp4Muxer;

    onProgress(0.02, 'Leyendo el video...');
    var parsed = await demux(MP4Box, file);

    var vt = parsed.video.track;
    var srcW = vt.track_width || vt.video.width;
    var srcH = vt.track_height || vt.video.height;
    if (!srcW || !srcH) throw new Error('no se pudieron leer las dimensiones');

    var durSec = vt.duration / vt.timescale;
    if (!isFinite(durSec) || durSec <= 0) throw new Error('duración inválida');

    var fps = Math.min(60, Math.max(12, Math.round(parsed.video.samples.length / durSec)));
    var scale = Math.min(1, CFG.vidMaxDim / Math.max(srcW, srcH));
    var w = Math.max(2, Math.round(srcW * scale / 2) * 2);   // H.264 quiere dimensiones pares
    var h = Math.max(2, Math.round(srcH * scale / 2) * 2);
    var bitrate = Math.round(w * h * fps * CFG.vidBpp);

    // Si el original ya está por debajo del bitrate objetivo, no hay nada que ganar
    var srcBitrate = (file.size * 8) / durSec;
    if (srcBitrate < bitrate * 1.15 && scale === 1) {
      return { skip: null }; // ya está optimizado, sin aviso
    }

    var encCfg = await pickEncoderConfig(w, h, bitrate, fps);
    if (!encCfg) return { skip: 'Tu navegador no puede comprimir este video (se sube el original).' };

    var muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: 'avc', width: w, height: h },
      audio: (parsed.audio && parsed.audio.description) ? {
        codec: 'aac',
        sampleRate: parsed.audio.track.audio.sample_rate,
        numberOfChannels: parsed.audio.track.audio.channel_count,
      } : undefined,
      firstTimestampBehavior: 'offset',
      fastStart: 'in-memory',
    });

    // El audio se copia tal cual (sin recomprimir). Si no pudimos leer su
    // configuración, abortamos: mejor subir el original que un video mudo.
    var hasAudio = !!(parsed.audio && parsed.audio.description);
    if (parsed.audio && !parsed.audio.description) {
      return { skip: 'No se pudo procesar el audio de este video, se sube el original.' };
    }

    var encodeError = null;
    var encoder = new global.VideoEncoder({
      output: function (chunk, meta) { try { muxer.addVideoChunk(chunk, meta); } catch (e) { encodeError = e; } },
      error: function (e) { encodeError = e; },
    });
    encoder.configure(encCfg);

    var needResize = (w !== srcW || h !== srcH);
    var canvas = null, ctx = null;
    if (needResize) {
      canvas = (typeof OffscreenCanvas === 'function') ? new OffscreenCanvas(w, h) : document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return { skip: 'No se pudo preparar el redimensionado (se sube el original).' };
    }

    var total = parsed.video.samples.length;
    var gop = Math.max(1, Math.round(fps * CFG.vidGopSec));
    var frameNo = 0;

    var decoder = new global.VideoDecoder({
      output: function (frame) {
        try {
          var out = frame;
          if (needResize) {
            ctx.drawImage(frame, 0, 0, w, h);
            out = new global.VideoFrame(canvas, { timestamp: frame.timestamp, duration: frame.duration || undefined });
            frame.close();
          }
          encoder.encode(out, { keyFrame: (frameNo % gop) === 0 });
          out.close();
        } catch (e) {
          encodeError = e;
          try { frame.close(); } catch (e2) {}
        }
        frameNo++;
        if ((frameNo % 8) === 0) onProgress(0.05 + 0.85 * (frameNo / total), 'Comprimiendo video...');
      },
      error: function (e) { encodeError = e; },
    });
    decoder.configure({
      codec: vt.codec,
      codedWidth: srcW,
      codedHeight: srcH,
      description: parsed.video.description || undefined,
    });

    try {
      for (var i = 0; i < parsed.video.samples.length; i++) {
        if (encodeError) throw encodeError;
        var s = parsed.video.samples[i];
        decoder.decode(new global.EncodedVideoChunk({
          type: s.sync ? 'key' : 'delta',
          timestamp: Math.round(s.cts / s.ts * 1e6),
          duration: Math.round(s.dur / s.ts * 1e6),
          data: s.data,
        }));
        // Backpressure: no dejar que las colas exploten en memoria
        while (decoder.decodeQueueSize > 24 || encoder.encodeQueueSize > 24) {
          await sleep(4);
          if (encodeError) throw encodeError;
        }
      }
      await decoder.flush();
      await encoder.flush();
      if (encodeError) throw encodeError;

      if (hasAudio) {
        onProgress(0.93, 'Copiando audio...');
        var desc = { decoderConfig: { description: parsed.audio.description } };
        for (var j = 0; j < parsed.audio.samples.length; j++) {
          var a = parsed.audio.samples[j];
          muxer.addAudioChunkRaw(
            a.data,
            a.sync ? 'key' : 'delta',
            Math.round(a.cts / a.ts * 1e6),
            Math.round(a.dur / a.ts * 1e6),
            j === 0 ? desc : undefined
          );
        }
      }

      onProgress(0.96, 'Cerrando archivo...');
      muxer.finalize();
    } finally {
      try { if (decoder.state !== 'closed') decoder.close(); } catch (e) {}
      try { if (encoder.state !== 'closed') encoder.close(); } catch (e) {}
      try { parsed.mp4.flush(); } catch (e) {}
      parsed.video.samples.length = 0;
      if (parsed.audio) parsed.audio.samples.length = 0;
      if (canvas) { canvas.width = canvas.height = 0; }
    }

    var out = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    if (!out.size) throw new Error('el archivo resultante quedó vacío');
    if (out.size >= file.size * (1 - CFG.minGainPct / 100)) return { skip: null }; // no valió la pena

    onProgress(0.98, 'Verificando...');
    await playable(out, durSec); // tira si no se reproduce → sube el original

    return {
      file: new File([out], swapExt(file.name, 'mp4'), {
        type: 'video/mp4',
        lastModified: file.lastModified || undefined,
      }),
    };
  }

  // ── API pública ──────────────────────────────────────────────
  /**
   * Devuelve SIEMPRE algo subible. Nunca tira.
   * @returns {Promise<{file:File, original:File, changed:boolean, note:string|null}>}
   */
  async function prepare(file, opts) {
    opts = opts || {};
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : noop;
    var plain = { file: file, original: file, changed: false, note: null };
    if (!file) return plain;

    var type = file.type || '';
    try {
      if (type.indexOf('image/') === 0) {
        if (file.size < CFG.imgMinBytes) return plain;
        onProgress(0.3, 'Optimizando imagen...');
        var img = await compressImage(file);
        onProgress(1, '');
        if (!img) return plain;
        return { file: img, original: file, changed: true, note: null };
      }

      if (type.indexOf('video/') === 0) {
        if (file.size < CFG.vidMinBytes) return plain;
        var res = await compressVideo(file, onProgress);
        onProgress(1, '');
        if (res && res.file) return { file: res.file, original: file, changed: true, note: null };
        return { file: file, original: file, changed: false, note: (res && res.skip) || null };
      }
    } catch (e) {
      // Cualquier problema → el original, intacto
      onProgress(1, '');
      console.warn('[MediaCompress]', e && e.message ? e.message : e);
      return { file: file, original: file, changed: false, note: 'No se pudo comprimir, se sube el original.' };
    }

    return plain;
  }

  /** Texto listo para toast: "48.2 MB → 9.1 MB (−81%)" */
  function savingsLabel(r) {
    if (!r || !r.changed) return '';
    var pct = Math.round((1 - r.file.size / r.original.size) * 100);
    return fmtSize(r.original.size) + ' → ' + fmtSize(r.file.size) + ' (−' + pct + '%)';
  }

  global.MediaCompress = {
    prepare: prepare,
    savingsLabel: savingsLabel,
    fmtSize: fmtSize,
    videoSupported: videoSupported,
    config: CFG,
  };
})(window);
