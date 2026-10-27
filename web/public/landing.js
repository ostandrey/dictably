(() => {
  const TALLY_SRC = "https://tally.so/widgets/embed.js";
  let tallyPromise = null;

  function loadTally() {
    if (window.Tally) return Promise.resolve();
    if (tallyPromise) return tallyPromise;
    tallyPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = TALLY_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("tally"));
      document.body.appendChild(s);
    });
    return tallyPromise;
  }

  function utmFields() {
    const params = new URLSearchParams(window.location.search);
    const out = {};
    for (const key of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
    ]) {
      const v = params.get(key);
      if (v) out[key] = v;
    }
    return out;
  }

  function openTally(btn) {
    const formId = btn.getAttribute("data-form-id") || "";
    const locale = btn.getAttribute("data-locale") || "en";
    const email = btn.getAttribute("data-contact") || "";
    if (
      !formId ||
      formId.startsWith("REPLACE_") ||
      formId.startsWith("PLACEHOLDER_")
    ) {
      window.location.href =
        "mailto:" +
        email +
        "?subject=" +
        encodeURIComponent("Dictably early access");
      return;
    }
    loadTally()
      .then(() => {
        window.Tally.openPopup(formId, {
          layout: "modal",
          width: 480,
          hiddenFields: { lang: locale, ...utmFields() },
        });
      })
      .catch(() => {
        window.open("https://tally.so/r/" + formId, "_blank", "noopener");
      });
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

  function seek(demo, seconds) {
    const duration = Number(demo.getAttribute("data-duration") || "840");
    const playhead = demo.querySelector(".demo__playhead");
    const timeEl = demo.querySelector(".demo__time");
    const transcript = demo.querySelector(".demo__transcript");
    if (playhead) {
      playhead.style.left = Math.min(100, Math.max(0, (seconds / duration) * 100)) + "%";
    }
    if (timeEl) timeEl.textContent = formatTime(seconds);
    demo.querySelectorAll(".demo__line.is-active").forEach((el) => {
      el.classList.remove("is-active");
    });
    const line = nearestLine(demo, seconds);
    if (line) {
      line.classList.add("is-active");
      if (transcript) {
        line.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }

  document.addEventListener("click", (e) => {
    const tallyBtn = e.target.closest("[data-cta='tally']");
    if (tallyBtn) {
      e.preventDefault();
      openTally(tallyBtn);
      return;
    }
    const seekBtn = e.target.closest("[data-seek]");
    if (seekBtn) {
      const demo = seekBtn.closest("[data-demo]");
      if (!demo) return;
      seek(demo, Number(seekBtn.getAttribute("data-seek")));
    }
  });
})();
