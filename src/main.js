const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)");

function setupNav() {
  const nav = document.querySelector("[data-nav]");
  const progress = document.querySelector("[data-progress]");
  const update = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    nav?.classList.toggle("scrolled", scrollTop > 12);
    if (progress) progress.style.width = `${max > 0 ? (scrollTop / max) * 100 : 0}%`;
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
}

function setupReveal() {
  const targets = document.querySelectorAll("[data-reveal], .data-gap");
  if (!("IntersectionObserver" in window)) {
    targets.forEach((target) => target.classList.add("in-view"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("in-view");
      });
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.16 }
  );
  targets.forEach((target) => observer.observe(target));
}

function setupHeroVideo() {
  const video = document.querySelector("[data-hero-video]");
  if (!video) return;
  if (prefersReduced.matches) {
    video.pause();
    video.removeAttribute("autoplay");
  }
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (prefersReduced.matches) return;
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    },
    { threshold: 0.12 }
  );
  observer.observe(video);
}

function setupPhysicsToggle() {
  const wrap = document.querySelector("[data-transport]");
  const buttons = document.querySelectorAll("[data-physics-mode]");
  if (!wrap || buttons.length === 0) return;
  const label = wrap.querySelector(".mode-label");
  const copy = {
    "one-g": "1g: settled organoid, thinner boundary layer, convection present",
    "micro-g": "microgravity: floating organoid, thicker depleted layer, diffusion dominated"
  };
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const mode = button.dataset.physicsMode;
      wrap.classList.toggle("micro-g", mode === "micro-g");
      wrap.classList.toggle("one-g", mode !== "micro-g");
      if (label) label.textContent = copy[mode] || copy["one-g"];
    });
  });
}

function setupPipeline() {
  const stage = document.querySelector("[data-pipeline]");
  if (!stage) return;
  const items = Array.from(stage.querySelectorAll("[data-step]"));
  const update = () => {
    const rect = stage.getBoundingClientRect();
    const progress = Math.min(Math.max((window.innerHeight * 0.65 - rect.top) / rect.height, 0), 0.999);
    const active = Math.floor(progress * items.length);
    items.forEach((item, index) => item.classList.toggle("active", index === active));
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function setupFunnel() {
  const target = document.querySelector("[data-funnel-dots]");
  if (!target) return;
  const rand = seeded(480);
  const count = 240;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const dot = document.createElement("span");
    dot.className = "scenario-dot";
    const band = i / count;
    const left = 7 + rand() * 86;
    const top = 8 + Math.pow(band, 1.4) * 68 + rand() * 16;
    const fade = band > 0.74 ? 0.18 + rand() * 0.28 : 0.38 + rand() * 0.4;
    dot.style.left = `${left}%`;
    dot.style.top = `${top}%`;
    dot.style.opacity = fade.toFixed(2);
    dot.style.background = rand() > 0.72 ? "var(--teal)" : rand() > 0.5 ? "var(--amber)" : "var(--cobalt)";
    fragment.appendChild(dot);
  }
  target.appendChild(fragment);
}

async function loadNeuralExample() {
  const delta = document.querySelector("[data-neural-delta]");
  const mult = document.querySelector("[data-neural-multiplier]");
  if (!delta || !mult) return;
  try {
    const response = await fetch("/src/data/orbio-results.json", { cache: "no-cache" });
    if (!response.ok) return;
    const data = await response.json();
    const example = data.real_data_example || {};
    if (Number.isFinite(example.delta_score)) {
      delta.textContent = `Delta score ${example.delta_score.toFixed(2)}`;
    }
    if (Number.isFinite(example.mapped_multiplier)) {
      mult.textContent = example.mapped_multiplier.toFixed(3);
    }
  } catch {
    // The static page still contains conservative fallback values.
  }
}

function init() {
  setupNav();
  setupReveal();
  setupHeroVideo();
  setupPhysicsToggle();
  setupPipeline();
  setupFunnel();
  loadNeuralExample();
}

init();
