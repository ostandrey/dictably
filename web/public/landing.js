(() => {
  const CYCLE_MS = 12000;
  const MAX_CYCLES = 2;
  const EASE = "cubic-bezier(.2,.8,.2,1)";

  function prefersReducedMotion() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function nearestLine(root, seconds) {
    const lines = [...root.querySelectorAll("[data-line-seconds]")];
    let best = lines[0];
    let bestDist = Infinity;
    for (const line of lines) {
      const sec = Number(line.getAttribute("data-line-seconds"));
      const d = Math.abs(sec - seconds);
      if (d < bestDist) {
        bestDist = d;
        best = line;
      }
    }
    return best;
  }

  function clearWordLit(demo) {
    demo.querySelectorAll(".demo__word.is-lit").forEach((el) => {
      el.classList.remove("is-lit");
    });
  }

  /** S2: wrap each word + following space so highlight is continuous. */
  function ensureWordSpans(line) {
    const textEl = line.querySelector("[data-line-text]");
    if (!textEl || textEl.querySelector(".demo__word")) return;
    const raw = textEl.textContent || "";
    textEl.textContent = "";
    const parts = raw.match(/\S+\s*/g) || [raw];
    parts.forEach((part) => {
      if (!part) return;
      const span = document.createElement("span");
      span.className = "demo__word";
      span.textContent = part;
      textEl.appendChild(span);
    });
  }

  function lightWords(line, progress) {
    ensureWordSpans(line);
    const words = [...line.querySelectorAll(".demo__word")];
    if (!words.length) return;
    const n = Math.max(
      0,
      Math.min(words.length, Math.floor(progress * words.length)),
    );
    words.forEach((w, i) => {
      w.classList.toggle("is-lit", i < n);
    });
  }

  function activeLineSelector() {
    return ".dy-turn.is-playing, .demo__line.is-active";
  }

  function clearActiveLines(demo) {
    demo.querySelectorAll(".dy-turn.is-playing").forEach((el) => {
      el.classList.remove("is-playing");
      const tc = el.querySelector(".dy-timecode");
      if (tc) tc.classList.remove("is-active");
    });
    demo.querySelectorAll(".demo__line.is-active").forEach((el) => {
      el.classList.remove("is-active");
    });
    demo.querySelectorAll(".dy-item.is-active").forEach((el) => {
      el.classList.remove("is-active");
      const tc = el.querySelector(".dy-timecode");
      if (tc) tc.classList.remove("is-active");
    });
  }

  function markActiveLine(line) {
    if (!line) return;
    if (line.classList.contains("dy-turn")) {
      line.classList.add("is-playing");
      const tc = line.querySelector(".dy-timecode");
      if (tc) tc.classList.add("is-active");
    } else {
      line.classList.add("is-active");
    }
  }

  /** S3: playhead via transform translateX(px), no layout anim / reflow. */
  function setPlayhead(demo, seconds) {
    const wave = demo.querySelector("[data-demo-wave]");
    const playhead = demo.querySelector("[data-demo-playhead]");
    const played = demo.querySelector("[data-demo-played]");
    const duration = Number(demo.getAttribute("data-duration") || "840");
    if (!wave || !playhead) return;
    const ratio = Math.min(1, Math.max(0, seconds / duration));
    const track = wave.querySelector(".dy-wave__track") || wave;
    const w = track.clientWidth || wave.clientWidth || 0;
    const x = ratio * w;
    playhead.style.transform = "translateX(" + x + "px)";
    if (played) played.style.width = ratio * 100 + "%";
  }

  function setTime(demo, seconds, announce) {
    const timeEl = demo.querySelector("[data-demo-time]");
    if (!timeEl) return;
    timeEl.setAttribute("aria-live", announce ? "polite" : "off");
    const formatted = formatTime(seconds);
    const bold = timeEl.querySelector("b");
    const total = timeEl.getAttribute("data-total");
    if (bold) {
      bold.textContent = formatted;
    } else if (total) {
      timeEl.innerHTML = "<b>" + formatted + "</b> / " + total;
    } else {
      timeEl.textContent = formatted;
    }
  }

  function seek(demo, seconds, opts) {
    const options = opts || {};
    setPlayhead(demo, seconds);
    setTime(demo, seconds, Boolean(options.announce));
    clearActiveLines(demo);
    const line = nearestLine(demo, seconds);
    if (line) {
      markActiveLine(line);
      const item = demo.querySelector(
        '.dy-item[data-seek="' + Math.floor(seconds) + '"], .dy-item[data-link-seconds="' + Math.floor(seconds) + '"]',
      );
      if (item) {
        item.classList.add("is-active");
        const tc = item.querySelector(".dy-timecode");
        if (tc) tc.classList.add("is-active");
      }
      if (!options.silentScroll) {
        const transcript = demo.querySelector(
          "[data-demo-transcript], .demo__transcript",
        );
        if (transcript) {
          line.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
      if (options.wordProgress != null) {
        lightWords(line, options.wordProgress);
      } else if (!options.keepWords) {
        clearWordLit(demo);
      }
    }
    return line;
  }

  function clearLink(demo) {
    const svg = demo.querySelector("[data-demo-link]");
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function isInStage(stageBox, elBox) {
    if (elBox.width <= 0 || elBox.height <= 0) return false;
    const pad = 1;
    return (
      elBox.bottom > stageBox.top + pad &&
      elBox.top < stageBox.bottom - pad &&
      elBox.right > stageBox.left + pad &&
      elBox.left < stageBox.right - pad
    );
  }

  function drawLink(demo, item, line) {
    const svg = demo.querySelector("[data-demo-link]");
    const stage = demo.querySelector(".demo__stage");
    if (!svg || !stage || !item || !line) return;
    const stamp = item.querySelector(".demo__stamp") || item;
    const stageBox = stage.getBoundingClientRect();
    const a = stamp.getBoundingClientRect();
    const b = line.getBoundingClientRect();
    // B5: both ends must be visible inside the stage
    if (!isInStage(stageBox, a) || !isInStage(stageBox, b)) return;
    const x1 = a.left + a.width / 2 - stageBox.left;
    const y1 = a.top + a.height / 2 - stageBox.top;
    const x2 = b.left + 8 - stageBox.left;
    const y2 = b.top + b.height / 2 - stageBox.top;
    if (x1 < 0 || y1 < 0 || x2 < 0 || y2 < 0) return;
    if (x1 > stageBox.width || y1 > stageBox.height) return;
    if (x2 > stageBox.width || y2 > stageBox.height) return;
    const w = stageBox.width;
    const h = stageBox.height;
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const midX = (x1 + x2) / 2;
    path.setAttribute(
      "d",
      "M " +
        x1 +
        " " +
        y1 +
        " C " +
        midX +
        " " +
        y1 +
        ", " +
        midX +
        " " +
        y2 +
        ", " +
        x2 +
        " " +
        y2,
    );
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "var(--accent)");
    path.setAttribute("stroke-width", "1.25");
    path.setAttribute("stroke-opacity", "0.7");
    path.setAttribute("class", "demo__link-path");
    svg.appendChild(path);
    const len = path.getTotalLength();
    path.style.strokeDasharray = String(len);
    path.style.strokeDashoffset = String(len);
    path.style.transition =
      "stroke-dashoffset 420ms " + EASE + ", opacity 280ms " + EASE;
    requestAnimationFrame(() => {
      path.style.strokeDashoffset = "0";
    });
    window.setTimeout(() => {
      path.style.opacity = "0";
      window.setTimeout(() => clearLink(demo), 320);
    }, 900);
  }

  function revealItem(demo, itemId, connect) {
    const item = demo.querySelector('[data-item-id="' + itemId + '"]');
    if (!item) return;
    item.classList.remove("is-pending");
    item.classList.add("is-born");
    if (connect) {
      const seconds = Number(item.getAttribute("data-link-seconds"));
      const line = nearestLine(demo, seconds);
      if (line) drawLink(demo, item, line);
    }
  }

  function resetHeroItems(demo) {
    demo.querySelectorAll(".demo__item[data-item-id]").forEach((el) => {
      el.classList.add("is-pending");
      el.classList.remove("is-born");
    });
    clearWordLit(demo);
    clearLink(demo);
  }

  function finalizeHero(demo) {
    demo.querySelectorAll(".demo__item").forEach((el) => {
      el.classList.remove("is-pending");
      el.classList.add("is-born");
    });
    clearWordLit(demo);
    clearLink(demo);
    seek(demo, 721, { silentScroll: true });
    setTime(demo, 721, false);
    demo.setAttribute("data-autoplay-done", "true");
    demo.removeAttribute("data-autoplaying");
  }

  /** B1 timeline — only t2/t3/t7 and m2/m1. */
  function cycleAt(t) {
    // 0–1.2s playhead 03:12→03:15
    if (t < 1200) {
      const p = t / 1200;
      return {
        seconds: 192 + (195 - 192) * p,
        lineProgress: 0,
        focusSeconds: 192,
        reveal: null,
      };
    }
    // 1.2–5s words on t3
    if (t < 5000) {
      const p = (t - 1200) / 3800;
      return {
        seconds: 195,
        lineProgress: p,
        focusSeconds: 195,
        reveal: null,
      };
    }
    // 5–6.5s birth m2 + link to t3
    if (t < 6500) {
      return {
        seconds: 195,
        lineProgress: 1,
        focusSeconds: 195,
        reveal: t < 5200 ? "m2" : null,
        connect: true,
      };
    }
    // 6.5–7.5s playhead → 12:01, highlight t7
    if (t < 7500) {
      const p = (t - 6500) / 1000;
      return {
        seconds: 195 + (721 - 195) * p,
        lineProgress: 0,
        focusSeconds: 721,
        reveal: null,
      };
    }
    // 7.5–10s words on t7
    if (t < 10000) {
      const p = (t - 7500) / 2500;
      return {
        seconds: 721,
        lineProgress: p,
        focusSeconds: 721,
        reveal: null,
      };
    }
    // 10–11s birth m1 + link to t7
    if (t < 11000) {
      return {
        seconds: 721,
        lineProgress: 1,
        focusSeconds: 721,
        reveal: t < 10200 ? "m1" : null,
        connect: true,
      };
    }
    // 11–12s pause
    return {
      seconds: 721,
      lineProgress: 1,
      focusSeconds: 721,
      reveal: null,
    };
  }

  function createHeroAutoplay(demo) {
    if (
      !demo ||
      demo.getAttribute("data-hero-autoplay") !== "true" ||
      prefersReducedMotion()
    ) {
      return null;
    }

    let stopped = false;
    let cycle = 0;
    let start = 0;
    let pausedAt = 0;
    let raf = 0;
    let revealed = new Set();
    let visible = false;
    let pageHidden = document.hidden;
    let primed = false;

    function stopForever() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      raf = 0;
      finalizeHero(demo);
    }

    function tick(now) {
      if (stopped || !visible || pageHidden) return;
      const elapsed = now - start;
      const cycleIndex = Math.floor(elapsed / CYCLE_MS);
      if (cycleIndex >= MAX_CYCLES) {
        stopForever();
        return;
      }
      if (cycleIndex > cycle) {
        cycle = cycleIndex;
        revealed = new Set();
        resetHeroItems(demo);
      }
      const t = elapsed % CYCLE_MS;
      const state = cycleAt(t);
      const focus =
        state.focusSeconds != null ? state.focusSeconds : state.seconds;
      seek(demo, state.seconds, {
        silentScroll: true,
        keepWords: true,
      });
      const line = nearestLine(demo, focus);
      if (line) {
        clearActiveLines(demo);
        markActiveLine(line);
        lightWords(line, state.lineProgress);
      }
      if (state.reveal && !revealed.has(state.reveal)) {
        revealed.add(state.reveal);
        revealItem(demo, state.reveal, state.connect);
      }
      raf = requestAnimationFrame(tick);
    }

    function startLoop() {
      if (stopped || raf) return;
      if (!primed) {
        primed = true;
        // B3: pending only once JS starts autoplay
        resetHeroItems(demo);
        demo.setAttribute("data-autoplaying", "true");
        setTime(demo, 192, false);
      }
      if (!start) start = performance.now();
      else if (pausedAt) {
        start += performance.now() - pausedAt;
        pausedAt = 0;
      }
      raf = requestAnimationFrame(tick);
    }

    function pauseLoop() {
      if (raf) {
        pausedAt = performance.now();
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    function syncPlayhead() {
      const timeEl = demo.querySelector("[data-demo-time]");
      const bold = timeEl && timeEl.querySelector("b");
      const text = ((bold && bold.textContent) || (timeEl && timeEl.textContent) || "00:00")
        .trim()
        .split(/\s/)[0];
      const parts = text.split(":").map(Number);
      const seconds =
        (parts[0] || 0) * 60 + (parts[1] || 0) ||
        Number(
          (
            demo.querySelector(activeLineSelector()) ||
            demo.querySelector("[data-line-seconds]")
          )?.getAttribute("data-line-seconds"),
        ) ||
        192;
      setPlayhead(demo, seconds);
    }

    window.addEventListener("resize", syncPlayhead);

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some(
          (e) => e.isIntersecting && e.intersectionRatio > 0.35,
        );
        if (visible && !pageHidden && !stopped) startLoop();
        else pauseLoop();
      },
      { threshold: [0, 0.35, 0.6] },
    );
    io.observe(demo);

    document.addEventListener("visibilitychange", () => {
      pageHidden = document.hidden;
      if (pageHidden) pauseLoop();
      else if (visible && !stopped) startLoop();
    });

    demo.addEventListener(
      "pointerdown",
      () => {
        stopForever();
      },
      { once: true },
    );

    syncPlayhead();
    return { stopForever };
  }

  function setupHoverLink(demo) {
    demo.querySelectorAll("[data-link-seconds]").forEach((item) => {
      item.addEventListener("mouseenter", () => {
        const seconds = Number(item.getAttribute("data-link-seconds"));
        demo
          .querySelectorAll(".demo__line.is-linked, .dy-turn.is-linked")
          .forEach((el) => {
            el.classList.remove("is-linked");
          });
        const line = nearestLine(demo, seconds);
        if (line) line.classList.add("is-linked");
      });
      item.addEventListener("mouseleave", () => {
        demo
          .querySelectorAll(".demo__line.is-linked, .dy-turn.is-linked")
          .forEach((el) => {
            el.classList.remove("is-linked");
          });
      });
    });
  }

  function setupStickyCta() {
    const bar = document.querySelector("[data-sticky-cta]");
    const hero = document.querySelector("[data-hero-demo]");
    const finalEl = document.querySelector("[data-final-cta]");
    const footer = document.querySelector("[data-site-footer]");
    if (!bar || !hero) return;

    const mq = window.matchMedia("(max-width: 768px)");
    let heroGone = false;
    let coverVisible = false;

    function sync() {
      const show = mq.matches && heroGone && !coverVisible;
      bar.classList.toggle("is-visible", show);
      bar.setAttribute("aria-hidden", show ? "false" : "true");
      if (show) bar.removeAttribute("inert");
      else bar.setAttribute("inert", "");
      document.body.classList.toggle("has-sticky-cta", show);
    }

    const heroIo = new IntersectionObserver(
      ([e]) => {
        heroGone = !e.isIntersecting;
        sync();
      },
      { threshold: 0 },
    );
    heroIo.observe(hero);

    const coverIo = new IntersectionObserver(
      (entries) => {
        coverVisible = entries.some((e) => e.isIntersecting);
        sync();
      },
      { threshold: 0.15 },
    );
    if (finalEl) coverIo.observe(finalEl);
    if (footer) coverIo.observe(footer);

    mq.addEventListener("change", sync);
    sync();
  }

  function setupReveal() {
    if (prefersReducedMotion()) {
      document.querySelectorAll("[data-reveal]").forEach((el) => {
        el.classList.add("is-inview");
      });
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-inview");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.2 },
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
  }

  function syncAllPlayheads() {
    document.querySelectorAll("[data-demo]").forEach((demo) => {
      const active = demo.querySelector(activeLineSelector());
      const seconds = active
        ? Number(active.getAttribute("data-line-seconds"))
        : Number(demo.getAttribute("data-duration")) * 0.08;
      setPlayhead(demo, seconds || 195);
    });
  }

  document.addEventListener("click", (e) => {
    const seekBtn = e.target.closest("[data-seek]");
    if (seekBtn) {
      const demo = seekBtn.closest("[data-demo]");
      if (!demo) return;
      const seconds = Number(seekBtn.getAttribute("data-seek"));
      // S4: seek in place; don't scroll the page for hero
      const isHero = demo.getAttribute("data-demo-hero") === "true";
      seek(demo, seconds, {
        announce: true,
        silentScroll: isHero,
      });
    }
  });

  function boot() {
    document.querySelectorAll("[data-demo]").forEach((demo) => {
      setupHoverLink(demo);
    });
    setupStickyCta();
    setupReveal();
    syncAllPlayheads();
    window.addEventListener("resize", syncAllPlayheads);
    const hero = document.querySelector('[data-demo-hero="true"]');
    const start = () => createHeroAutoplay(hero);
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(start, { timeout: 1800 });
    } else {
      window.setTimeout(start, 200);
    }
  }

  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot);
})();
