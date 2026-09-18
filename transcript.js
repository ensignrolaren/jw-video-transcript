// jw-video-transcript — readable source
//
// Minify this (or copy bookmarklet.js) and save it as a bookmark URL.
// Run it on a jw.org video page. If a subtitle track exists, the transcript
// is copied to the clipboard as one sentence per line. If not, a `jwt`
// terminal command is copied instead (see jwt.sh) so you can run the video
// through whisper locally.

javascript:(async () => {
  const href = location.href;
  const u = new URL(href);

  // ---------------------------------------------------------------------
  // 1. Work out the LANK (video ID) and MEPS language symbol
  // ---------------------------------------------------------------------
  let lank = u.searchParams.get('lank');
  let locale = u.searchParams.get('wtlocale');
  let pm = null;   // pub-media params, if we had to read them off the page

  // Share links and library hash URLs carry the LANK directly
  if (!lank) {
    const m = href.match(/((?:pub|docid)-[A-Za-z0-9_-]+_VIDEO)/i);
    if (m) lank = m[1];
  }

  // Fallback 1: embedded players on jw.org and Watchtower ONLINE LIBRARY.
  // WOL uses data-json-src="/wol/vidlink/r1/lp-e?pub=nwtsv&track=090".
  if (!lank) {
    for (const dv of document.querySelectorAll('[data-video], video[data-json-src]')) {
      const src = dv.getAttribute('data-video') || dv.getAttribute('data-json-src') || '';
      const q = new URLSearchParams(src.split('?')[1] || '');
      const pub = q.get('pub'), docid = q.get('docid'), track = q.get('track');
      if (pub)        lank = 'pub-' + pub + (track ? '_' + parseInt(track, 10) : '') + '_VIDEO';
      else if (docid) lank = 'docid-' + docid + '_' + (track ? parseInt(track, 10) : 1) + '_VIDEO';
      if (lank) {
        const language = dv.closest('[data-lang]');
        if (!locale) locale = q.get('langwritten') || q.get('wtlocale')
          || (language && language.getAttribute('data-lang'));
        break;
      }
    }
  }

  // Fallback 2: parse any jw-cdn download link on the page
  //   ljf_E_010_r240P.mp4        -> pub-ljf_10_VIDEO        (locale E)
  //   mwbv_E_201909_05_r240P.mp4 -> pub-mwbv_201909_5_VIDEO (issue kept, track de-padded)
  //   jwb-072_E_r720P.mp4        -> pub-jwb-072_VIDEO       (no track)
  if (!lank) {
    for (const a of document.querySelectorAll('a[href*="jw-cdn.org"]')) {
      const m2 = a.href.match(/\/([A-Za-z0-9-]+)_([A-Z0-9]+)((?:_\d+)*)_r\d+P\.mp4/);
      if (m2) {
        const segs = m2[3].split('_').filter(Boolean);
        let tail = '';
        if (segs.length) {
          const track = parseInt(segs.pop(), 10);  // last numeric segment is the track
          tail = (segs.length ? '_' + segs.join('_') : '') + '_' + track;
        }
        lank = 'pub-' + m2[1] + tail + '_VIDEO';
        if (!locale) locale = m2[2];               // filename already uses the MEPS symbol
        break;
      }
    }
  }

  // Fallback 3: news-article pages carry no LANK, but their play/download
  // links point at the pub-media API with a docid and track:
  //   GETPUBMEDIALINKS?docid=1112024059&track=1&langwritten=E
  //   -> docid-1112024059_1_VIDEO
  if (!lank) {
    const pa = document.querySelector('a[href*="GETPUBMEDIALINKS"]');
    if (pa) {
      const q = new URLSearchParams(pa.href.split('?')[1] || '');
      const docid = q.get('docid'), pub = q.get('pub');
      const track = parseInt(q.get('track') || '1', 10);
      const lw = q.get('langwritten');
      if (!locale && lw) locale = lw;
      if (pub)        lank = 'pub-' + pub + '_' + track + '_VIDEO';
      else if (docid) lank = 'docid-' + docid + '_' + track + '_VIDEO';
      // keep the params around: pub-media can answer directly if mediator can't
      if (lank) pm = { docid: docid, pub: pub, track: track, lang: lw || locale || 'E' };
    }
  }

  // Fallback 4: news pages where the player has already replaced the download
  // links by the time the bookmarklet runs. The docid still survives in markup
  // the player doesn't touch:
  //   <meta property="og:image"> -> .../img/p/1112024059/univ/art/...
  //   language picker link       -> /choose-language?...&docid=1112024059
  // Neither carries a track number, so assume 1.
  if (!lank) {
    let docid = null;

    const og = document.querySelector('meta[property="og:image"]');
    let m3 = og && (og.content || '').match(/\/img\/p\/(\d{6,})\//);
    if (m3) docid = m3[1];

    if (!docid) {
      const cl = document.querySelector('a[href*="choose-language"][href*="docid="]');
      if (cl) docid = new URLSearchParams(cl.href.split('?')[1] || '').get('docid');
    }

    // last resort: any docid anywhere in the page source
    if (!docid) {
      m3 = document.documentElement.innerHTML.match(/[?&]docid=(\d{6,})/);
      if (m3) docid = m3[1];
    }

    if (docid) {
      lank = 'docid-' + docid + '_1_VIDEO';
      pm = { docid: docid, pub: null, track: 1, lang: locale || 'E' };
    }
  }

  if (!lank) { alert('No video ID (LANK) found in the URL or on this page.'); return; }

  if (!locale) {
    const M = { en: 'E', es: 'S', fr: 'F', de: 'X', pt: 'T', it: 'I' };
    locale = M[(document.documentElement.lang || 'en').slice(0, 2)] || 'E';
  }

  try {
    // -------------------------------------------------------------------
    // 2. Ask the mediator API for this video's files
    // -------------------------------------------------------------------
    const r = await fetch('https://b.jw-cdn.org/apis/mediator/v1/media-items/'
                          + locale + '/' + lank + '?clientType=www');
    const d = await r.json();
    let files = (d && d.media && d.media[0] && d.media[0].files) || [];
    let title = (d && d.media && d.media[0] && d.media[0].title) || '';

    // Mediator doesn't always have an entry for docid-style items. When we
    // read the params off a pub-media link, ask that API instead and
    // normalize its shape to match ({ subtitles, progressiveDownloadURL }).
    if (!files.length && pm) {
      const pr = await fetch('https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json'
        + '&fileformat=MP4&alllangs=0&track=' + pm.track
        + '&langwritten=' + pm.lang + '&txtCMSLang=' + pm.lang
        + (pm.docid ? '&docid=' + pm.docid : '&pub=' + pm.pub));
      const pd = await pr.json();
      const arr = (pd && pd.files && pd.files[pm.lang] && pd.files[pm.lang].MP4) || [];
      files = arr.map(x => ({
        subtitles: x.subtitles,
        progressiveDownloadURL: x.file && x.file.url,
        filesize: x.filesize
      }));
      if (!title) title = (pd && pd.pubName) || (arr[0] && arr[0].title) || '';
    }

    // Zero-width characters show up in some titles (e.g. before an em dash).
    title = title.replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();

    let subUrl = null;
    for (const f of files) {
      if (f && f.subtitles && f.subtitles.url) { subUrl = f.subtitles.url; break; }
    }

    // -------------------------------------------------------------------
    // 2b. No subtitle track: copy a `jwt` command for local transcription
    // -------------------------------------------------------------------
    if (!subUrl) {
      let best = null;                             // smallest MP4 — audio is identical at every resolution
      for (const f of files) {
        if (f && f.progressiveDownloadURL) {
          if (!best || (f.filesize || 9e15) < (best.filesize || 9e15)) best = f;
        }
      }
      if (!best) { alert('No subtitles and no downloadable file found.'); return; }
      // Single-quote for the shell; a literal ' becomes '\'' inside the quotes.
      const shq = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
      const cmd = "jwt " + shq(best.progressiveDownloadURL)
                + (title ? ' ' + shq(title) : '');
      const ok2 = await copy(cmd);
      alert(ok2 ? 'No subtitles - copied a `jwt` terminal command to your clipboard instead. Paste it in Terminal to transcribe with whisper.'
                : 'No subtitles, and clipboard copy failed.');
      return;
    }

    // -------------------------------------------------------------------
    // 3. Fetch the VTT and strip it to caption lines
    // -------------------------------------------------------------------
    const out = [];
    let prev = null;
    const vtt = await (await fetch(subUrl)).text();
    for (const raw of vtt.split(/\r?\n/)) {
      const t = raw.trim();
      if (!t || t.startsWith('WEBVTT') || t.indexOf('-->') > -1
          || /^\d+$/.test(t) || /^(NOTE|STYLE|REGION)/.test(t)) continue;
      const clean = t.replace(/<[^>]+>/g, '');     // drop <i>, <c.classname>, etc.
      if (clean && clean !== prev) { out.push(clean); prev = clean; }  // dedupe rollup cues
    }

    // -------------------------------------------------------------------
    // 4. Reflow caption lines into one sentence per line
    // -------------------------------------------------------------------
    let j = '';
    for (const ln of out) {
      // a line ending in a hyphen is a split word, so don't insert a space
      j = j ? (/-$/.test(j) ? j + ln : j + ' ' + ln) : ln;
    }
    j = j.replace(/\s+/g, ' ').trim();

    // Shield abbreviations and initials so their periods don't end a sentence.
    // \u0001 is a placeholder swapped back to "." after splitting.
    j = j.replace(/\b(Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Rev|vs|etc|approx|Fig|No|Vol|Ch|e\.g|i\.e|a\.m|p\.m|U\.S)\.(?=\s)/gi,
                  m => m.replace(/\./g, '\u0001'));
    j = j.replace(/\b([A-Z])\.(?=\s[A-Z])/g, '$1\u0001');   // J. R. R. Brown

    // Split after . ! ? … (plus any trailing quote/bracket) when the next
    // character opens a new sentence.
    const sen = j.split(/(?<=[.!?\u2026]["')\u2019\u201d\]]*)\s+(?=[\u201c"'(\[A-Z0-9])/)
                 .map(p => p.replace(/\u0001/g, '.').trim())
                 .filter(Boolean);

    const txt = (title ? title + '\n\n' : '') + sen.join('\n');
    const ok = await copy(txt);
    alert(ok ? 'Copied ' + sen.length + ' sentences to clipboard.'
             : 'Copy failed - check clipboard permissions.');
  } catch (e) {
    alert('Error: ' + e.message);
  }

  // Clipboard write with an execCommand fallback for restricted contexts.
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }
})();
