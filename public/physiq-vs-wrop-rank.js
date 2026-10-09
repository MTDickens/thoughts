(function () {
  // Shared model ids used for linking
  const SHARED = {
    "cosmos3-super": {
      name: "Cosmos3 Super",
      color: "#6ee7ff",
      phys: { label: "50.8 v2v · 42.7 i2v", primary: 50.8, modality: "both" },
      wrop: { rank: 11, elo: 1409.2, rate: "37.3%" }
    },
    "magi-1": {
      name: "MAGI-1 24B",
      color: "#a78bfa",
      phys: { label: "48.4 v2v · 30.2 i2v", primary: 48.4, modality: "both" },
      wrop: { rank: 14, elo: 1248.0, rate: "19.2%" }
    },
    "seedance-25": {
      name: "Seedance 2.5",
      color: "#34d399",
      phys: { label: "42.43 i2v", primary: 42.43, modality: "i2v" },
      wrop: { rank: 4, elo: 1649.6, rate: "69.6%" }
    },
    "minimax-h3": {
      name: "MiniMax H3",
      color: "#f472b6",
      phys: { label: "39.8 i2v", primary: 39.8, modality: "i2v" },
      wrop: { rank: 2, elo: 1723.6, rate: "77.9%", note: "tie #1 with Wan 3.0 Prime" }
    },
    "gemini-omni": {
      name: "Gemini Omni Flash 1.1",
      color: "#ffb86b",
      phys: { label: "35.34 i2v", primary: 35.34, modality: "i2v" },
      wrop: { rank: 7, elo: 1492.5, rate: "49.0%" }
    },
    "grok-imagine": {
      name: "Grok Imagine",
      color: "#fbbf24",
      phys: { label: "34.8 i2v", primary: 34.8, modality: "i2v" },
      wrop: { rank: 9, elo: 1457.0, rate: "44.2%", note: "WROP: video extend" }
    }
  };

  // Left panel: Physics-IQ curated order (top v2v leaders + i2v closed models)
  const physList = [
    { id: null, name: "Odyssey-3 Pro + BoN×8", score: "66.10", mod: "v2v", only: true },
    { id: null, name: "FLUX 3 [large] + BoN", score: "64.35 / 54.70", mod: "both", only: true },
    { id: null, name: "Odyssey-3 Pro", score: "63.37 / 49.99", mod: "both", only: true },
    { id: null, name: "FLUX 3 [large]", score: "61.11 / 51.11", mod: "both", only: true },
    { id: null, name: "MAGI-1 + GeoPhys BoN", score: "58.2 / 33.7", mod: "both", only: true },
    { id: "cosmos3-super", name: "Cosmos3 Super", score: "50.8 / 42.7", mod: "both" },
    { id: "magi-1", name: "MAGI-1 24B", score: "48.4 / 30.2", mod: "both" },
    { id: null, name: "Cosmos3-Nano", score: "43.0 / 37.3", mod: "both", only: true },
    { id: "seedance-25", name: "Seedance 2.5", score: "42.43", mod: "i2v" },
    { id: "minimax-h3", name: "MiniMax H3", score: "39.8", mod: "i2v" },
    { id: null, name: "MiniMax H3 Max", score: "36.2", mod: "i2v", only: true },
    { id: "gemini-omni", name: "Gemini Omni Flash 1.1", score: "35.34", mod: "i2v" },
    { id: "grok-imagine", name: "Grok Imagine Video", score: "34.8", mod: "i2v" },
    { id: null, name: "Hunyuan Video 1.5", score: "33.4", mod: "i2v", only: true },
    { id: null, name: "Wan 2.2 14B", score: "32.2", mod: "i2v", only: true },
    { id: null, name: "Veo 3.1 Lite", score: "31.83", mod: "i2v", only: true },
    { id: null, name: "Sora 2", score: "26.5", mod: "i2v", only: true }
  ];

  // Right panel: full WROP 14
  const wropList = [
    { id: null, name: "Wan 3.0 Prime", score: "1723.6 · 77.9%", only: true },
    { id: "minimax-h3", name: "MiniMax H3", score: "1723.6 · 77.9%" },
    { id: null, name: "PWM-WROP", score: "1679.5 · 73.1%", only: true },
    { id: "seedance-25", name: "Seedance 2.5", score: "1649.6 · 69.6%" },
    { id: null, name: "Runway Aleph 2", score: "1518.3 · 52.9%", only: true },
    { id: null, name: "Wan-VACE 14B", score: "1506.7 · 51.0%", only: true },
    { id: "gemini-omni", name: "Gemini Omni Flash 1.1", score: "1492.5 · 49.0%" },
    { id: null, name: "Kling O3 Pro", score: "1471.3 · 46.2%", only: true },
    { id: "grok-imagine", name: "Grok Imagine (extend)", score: "1457.0 · 44.2%" },
    { id: null, name: "LTX-2.3 Extend", score: "1453.4 · 43.1%", only: true },
    { id: "cosmos3-super", name: "Cosmos3 Super", score: "1409.2 · 37.3%" },
    { id: null, name: "LTX-2.3 Dev", score: "1398.9 · 36.5%", only: true },
    { id: null, name: "HY-OmniWeaving", score: "1268.5 · 21.0%", only: true },
    { id: "magi-1", name: "MAGI-1 24B", score: "1248.0 · 19.2%" }
  ];

  const colA = document.getElementById("colA");
  const colB = document.getElementById("colB");
  const svg = document.getElementById("connectors");
  const tip = document.getElementById("tip");
  const viz = document.getElementById("viz");

  function modBadge(m) {
    if (!m) return "";
    const cls = m === "v2v" ? "v2v" : m === "i2v" ? "i2v" : "both";
    const label = m === "both" ? "v2v/i2v" : m;
    return `<span class="mod ${cls}">${label}</span>`;
  }

  function renderCol(col, list, side) {
    list.forEach((item, i) => {
      const rank = i + 1;
      const shared = !!item.id;
      const row = document.createElement("div");
      row.className = "row " + (shared ? "shared" : "only");
      if (item.id) row.dataset.id = item.id;
      row.dataset.side = side;
      row.innerHTML =
        `<span class="rank">${String(rank).padStart(2, "0")}</span>` +
        `<span class="name">${item.name}${shared ? "" : ""}${modBadge(item.mod)}</span>` +
        `<span class="score">${item.score}</span>`;
      col.appendChild(row);
    });
  }

  renderCol(colA, physList, "A");
  renderCol(colB, wropList, "B");

  function rowCenter(el, side) {
    const vr = viz.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2 - vr.top;
    const x = side === "A" ? (r.right - vr.left) : (r.left - vr.left);
    return { x, y };
  }

  function bezier(a, b) {
    const dx = Math.max(40, (b.x - a.x) * 0.42);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }

  const pathById = {};

  function drawLines() {
    const vr = viz.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${vr.width} ${vr.height}`);
    svg.setAttribute("width", vr.width);
    svg.setAttribute("height", vr.height);
    svg.innerHTML = "";

    Object.keys(SHARED).forEach((id) => {
      const left = colA.querySelector(`.row[data-id="${id}"]`);
      const right = colB.querySelector(`.row[data-id="${id}"]`);
      if (!left || !right) return;
      const a = rowCenter(left, "A");
      const b = rowCenter(right, "B");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", bezier(a, b));
      path.setAttribute("stroke", SHARED[id].color);
      path.setAttribute("opacity", "0.75");
      path.dataset.id = id;
      svg.appendChild(path);
      pathById[id] = path;
    });
  }

  function setActive(id) {
    const rows = viz.querySelectorAll(".row");
    const paths = svg.querySelectorAll("path");
    if (!id) {
      rows.forEach((r) => r.classList.remove("active", "faded"));
      paths.forEach((p) => p.classList.remove("active", "faded"));
      tip.classList.remove("show");
      return;
    }
    rows.forEach((r) => {
      if (r.dataset.id === id) {
        r.classList.add("active");
        r.classList.remove("faded");
      } else {
        r.classList.remove("active");
        r.classList.add("faded");
      }
    });
    paths.forEach((p) => {
      if (p.dataset.id === id) {
        p.classList.add("active");
        p.classList.remove("faded");
      } else {
        p.classList.add("faded");
        p.classList.remove("active");
      }
    });

    const s = SHARED[id];
    const physRank = physList.findIndex((x) => x.id === id) + 1;
    const flipNote =
      id === "minimax-h3" || id === "seedance-25"
        ? `<div class="flip">⚠ Rank flip vs peer: Physics-IQ i2v Seedance &gt; H3, but WROP H3 ≫ Seedance.</div>`
        : id === "cosmos3-super" || id === "magi-1"
        ? `<div class="flip">↓ Stronger on Physics-IQ than on WROP (construct mismatch).</div>`
        : "";
    tip.innerHTML =
      `<div class="t-name">${s.name}</div>` +
      `<div class="t-row">Physics-IQ panel rank <b>#${physRank}</b> · <b>${s.phys.label}</b></div>` +
      `<div class="t-row">WROP Elo rank <b>#${s.wrop.rank}</b> · <b>${s.wrop.elo}</b> (${s.wrop.rate})` +
      (s.wrop.note ? ` · ${s.wrop.note}` : "") +
      `</div>` +
      flipNote;
    tip.classList.add("show");
  }

  function moveTip(e) {
    if (!tip.classList.contains("show")) return;
    const pad = 14;
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    if (x + tw > window.innerWidth - 8) x = e.clientX - tw - pad;
    if (y + th > window.innerHeight - 8) y = e.clientY - th - pad;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }

  viz.querySelectorAll(".row.shared").forEach((row) => {
    row.addEventListener("mouseenter", (e) => {
      setActive(row.dataset.id);
      moveTip(e);
    });
    row.addEventListener("mousemove", moveTip);
    row.addEventListener("mouseleave", () => setActive(null));
    row.addEventListener("focus", () => setActive(row.dataset.id));
    row.addEventListener("blur", () => setActive(null));
    row.tabIndex = 0;
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawLines, 80);
  });

  // Fonts / layout settle then draw
  requestAnimationFrame(() => {
    drawLines();
    setTimeout(drawLines, 50);
    setTimeout(drawLines, 200);
  });
})();
