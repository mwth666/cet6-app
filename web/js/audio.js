// 发音：用浏览器自带的语音合成（Web Speech API）
// 离线可用、免费、不用配置域名，也不依赖任何在线服务
(function () {
  const CFG = window.CFG;
  const synth = window.speechSynthesis || null;

  let voices = [];
  let enVoice = null;
  let state = 'init'; // init | ok | off
  let lastError = '';

  function pickVoice() {
    if (!synth) {
      state = 'off';
      return;
    }
    voices = synth.getVoices() || [];
    if (!voices.length) return; // 还没加载好，等 voiceschanged
    const prefer = [
      /^en[-_]US$/i, /^en[-_]GB$/i,
      /Google US English/i, /Microsoft (Aria|Jenny|Zira|David|Mark)/i,
      /^en/i,
    ];
    for (const re of prefer) {
      const hit = voices.find((v) => re.test(v.lang) || re.test(v.name));
      if (hit) {
        enVoice = hit;
        state = 'ok';
        return;
      }
    }
    // 一个英文音色都没有：只能静音，语音相关练习自动切遮蔽模式
    state = 'off';
  }

  if (synth) {
    pickVoice();
    synth.addEventListener('voiceschanged', pickVoice);
  } else {
    state = 'off';
  }

  function available() {
    return CFG.audio.provider !== 'off' && state === 'ok';
  }

  function speak(text, opts) {
    if (!text) return;
    if (CFG.audio.provider === 'off' || !synth || state === 'off') return;
    const o = opts || {};
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = enVoice ? enVoice.lang : 'en-US';
      if (enVoice) u.voice = enVoice;
      u.rate = o.rate || CFG.audio.rate;
      u.pitch = CFG.audio.pitch;
      u.onerror = (e) => {
        lastError = (e && e.error) || 'unknown';
        if (lastError === 'not-allowed') state = 'off';
      };
      synth.speak(u);
    } catch (err) {
      lastError = String(err.message || err);
      state = 'off';
    }
  }

  function speakWord(w) {
    speak(w, { rate: Math.max(0.7, CFG.audio.rate * 0.85) });
  }

  function speakSentence(s) {
    speak(s, { rate: CFG.audio.rate });
  }

  function speakSlow(s) {
    speak(s, { rate: 0.62 });
  }

  let seqToken = 0;

  function stop() {
    seqToken++;
    if (synth) synth.cancel();
  }

  // 连续朗读一组句子（读长文用）。
  // hooks: { each(i) 每句开始前, done() 全部读完 }
  // 返回一个函数，调用即停止。
  function speakQueue(list, hooks) {
    const h = hooks || {};
    const arr = (list || []).filter(Boolean);
    if (!arr.length || CFG.audio.provider === 'off' || !synth || state === 'off') {
      if (h.done) h.done();
      return function () {};
    }
    const my = ++seqToken;
    let i = 0;
    let stopped = false;

    function step() {
      if (stopped || my !== seqToken) return;
      if (i >= arr.length) {
        if (h.done) h.done();
        return;
      }
      const idx = i++;
      if (h.each) h.each(idx);
      const u = new SpeechSynthesisUtterance(String(arr[idx]));
      u.lang = enVoice ? enVoice.lang : 'en-US';
      if (enVoice) u.voice = enVoice;
      u.rate = CFG.audio.rate;
      u.pitch = CFG.audio.pitch;
      // 有的浏览器 onend 偶发不触发，兜底用句子长度估个超时
      let advanced = false;
      const guard = setTimeout(() => {
        if (advanced) return;
        advanced = true;
        step();
      }, 1200 + String(arr[idx]).length * 90);
      u.onend = () => {
        if (advanced) return;
        advanced = true;
        clearTimeout(guard);
        if (stopped || my !== seqToken) return;
        step();
      };
      u.onerror = () => {
        if (advanced) return;
        advanced = true;
        clearTimeout(guard);
        if (stopped || my !== seqToken) return;
        step();
      };
      try {
        synth.speak(u);
      } catch (err) {
        clearTimeout(guard);
        lastError = String(err.message || err);
      }
    }

    step();

    return function cancel() {
      stopped = true;
      if (my === seqToken) seqToken++;
      if (synth) synth.cancel();
    };
  }

  function status() {
    return { state, ready: available(), voice: enVoice ? enVoice.name : '', error: lastError };
  }

  window.Audio2 = {
    speak,
    speakWord,
    speakSentence,
    speakSlow,
    speakQueue,
    stop,
    available,
    status,
  };
})();
