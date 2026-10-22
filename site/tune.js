// Backdrop tuning panel. Loaded only with ?tune. Edits window.ryteBackdrop.params
// live; "Copy values" puts the current settings on the clipboard as JSON.
(() => {
  const api = window.ryteBackdrop;
  if (!api) return;
  const { params, defaults, blendModes } = api;
  const STORAGE_KEY = "ryte-beam-tune-v2";
  const BLEND_LABELS = { srgb: "sRGB", linear: "Linear", oklab: "OKLab", oklch: "OKLCH" };

  const SECTIONS = [
    ["Shape", [
      ["angle", "Angle", -45, 45, 1, 0],
      ["offset", "Offset", -0.6, 0.4, 0.005, 3],
      ["softness", "Softness", 0, 1, 0.01, 2],
      ["curve", "Curve", -0.5, 0.5, 0.01, 2],
      ["bandWidth", "Band width", 0, 1, 0.01, 3],
      ["spread", "Layer spread", 0, 1, 0.01, 2],
      ["streaks", "Streaks", 0, 12, 0.1, 2],
      ["streakDepth", "Streak depth", 0, 1, 0.01, 2],
      ["warp", "Warp", 0, 0.5, 0.005, 3],
      ["fadeAlong", "Fade along", 0, 1, 0.01, 2],
    ]],
    ["Motion", [["speed", "Speed", 0, 3, 0.01, 3]]],
    ["Extra", [
      ["hot", "Hot spot", 0, 1, 0.01, 2],
      ["hotX", "Hot spot X", -1, 1, 0.01, 3],
      ["hotY", "Hot spot Y", -0.6, 0.6, 0.01, 3],
      ["hotSize", "Hot spot size", 0, 1, 0.01, 2],
      ["seed", "Seed", 0, 99, 1, 0],
    ]],
    ["Grade", [
      ["brightness", "Brightness", 0.2, 2, 0.01, 2],
      ["contrast", "Contrast", 0.5, 2, 0.01, 2],
      ["saturation", "Saturation", 0, 2, 0.01, 2],
    ]],
    ["Effects", [
      ["grain", "Grain", 0, 1, 0.01, 2],
      ["grainSize", "Grain size", 0.5, 4, 0.1, 2],
      ["vignette", "Vignette", 0, 1, 0.01, 2],
      ["shade", "Text shade", 0, 1, 0.01, 2],
    ]],
  ];

  // Restore saved values in place (the controls hold references to these objects).
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved) {
      for (const key of Object.keys(defaults)) {
        if (key === "paused" || !(key in saved)) continue;
        if (key === "stops" && Array.isArray(saved.stops) && saved.stops.length === params.stops.length) {
          saved.stops.forEach((stop, i) => Object.assign(params.stops[i], stop));
        } else if (typeof saved[key] === typeof defaults[key] && key !== "stops") {
          params[key] = saved[key];
        }
      }
    }
  } catch {
    // Storage unavailable: start from defaults.
  }

  const snapshot = () => {
    const { paused, ...values } = params;
    return JSON.stringify(
      values,
      (key, value) => (typeof value === "number" ? Math.round(value * 1000) / 1000 : value),
      2,
    );
  };

  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  const style = el("style");
  style.textContent = `
    .tune{position:fixed;z-index:50;top:.75rem;right:.75rem;width:19.5rem;max-height:calc(100vh - 1.5rem);
      overflow:auto;padding:1rem 1.1rem 1.2rem;border:1px solid rgb(255 255 255 / 10%);border-radius:1rem;
      background:#0d0908;color:#f3ece6;font:13px/1.3 system-ui,sans-serif}
    .tune.is-hidden{display:none}
    .tune h2,.tune h3{margin:0;font-size:11px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:#8d847c}
    .tune h3{margin:1.2rem 0 .25rem}
    .tune .head{display:flex;justify-content:space-between;align-items:center}
    .tune .link{border:0;background:none;color:#8d847c;font:inherit;font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;padding:0}
    .tune .link:hover{color:#f3ece6}
    .tune .field{margin:.55rem 0 .15rem}
    .tune .field-top{display:flex;justify-content:space-between;align-items:baseline}
    .tune .value{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#b9b0a8}
    .tune input[type=range]{-webkit-appearance:none;appearance:none;display:block;width:100%;height:20px;margin:.1rem 0 0;background:transparent}
    .tune input[type=range]::-webkit-slider-runnable-track{height:3px;border-radius:2px;
      background:linear-gradient(90deg,#f3eee9 var(--pct,50%),#4a4442 var(--pct,50%))}
    .tune input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;margin-top:-6.5px;
      border-radius:50%;border:0;background:#fff;box-shadow:0 1px 4px rgb(0 0 0 / 55%)}
    .tune input[type=range]::-moz-range-track{height:3px;border-radius:2px;background:#4a4442}
    .tune input[type=range]::-moz-range-progress{height:3px;border-radius:2px;background:#f3eee9}
    .tune input[type=range]::-moz-range-thumb{width:16px;height:16px;border:0;border-radius:50%;background:#fff}
    .tune input[type=range]:focus-visible{outline:2px solid #ff6a2b;outline-offset:2px;border-radius:4px}
    .tune .seg{display:grid;grid-template-columns:repeat(4,1fr);gap:.4rem;margin:.55rem 0 .9rem}
    .tune .seg button{padding:.55rem 0;border:1px solid rgb(255 255 255 / 10%);border-radius:.6rem;background:#14100f;color:#f3ece6;font:inherit;cursor:pointer}
    .tune .seg button[aria-pressed=true]{background:#fff;color:#0d0908;border-color:#fff}
    .tune .stops{position:relative;height:2.3rem;margin:.5rem 0 .2rem;border-radius:.7rem;border:1px solid rgb(255 255 255 / 12%);touch-action:none}
    .tune .stop{position:absolute;top:50%;width:1.35rem;height:1.35rem;margin:-.675rem 0 0 -.675rem;border-radius:50%;
      border:2px solid #fff;cursor:grab;box-shadow:0 0 0 1px rgb(0 0 0 / 55%)}
    .tune .stop:active{cursor:grabbing}
    .tune .hint{display:flex;justify-content:space-between;color:#8d847c;font-size:12px;margin-top:.55rem}
    .tune .switch-row{display:flex;justify-content:space-between;align-items:center;margin:.7rem 0 .2rem}
    .tune .switch{position:relative;width:2.7rem;height:1.5rem;border-radius:99px;border:0;background:#2a2423;cursor:pointer}
    .tune .switch::after{content:"";position:absolute;top:.2rem;left:.2rem;width:1.1rem;height:1.1rem;border-radius:50%;background:#fff;transition:transform 120ms}
    .tune .switch[aria-checked=true]{background:#ff6a2b}
    .tune .switch[aria-checked=true]::after{transform:translateX(1.2rem)}
    .tune .actions{display:flex;gap:.5rem;margin-top:1.3rem}
    .tune .primary{flex:1;padding:.65rem 0;border:0;border-radius:.6rem;background:#fff;color:#0d0908;font:inherit;font-weight:600;cursor:pointer}
    .tune .status{min-height:1.2em;margin-top:.5rem;color:#9fd3a8;font-size:12px}
    .tune details{margin-top:.6rem;color:#8d847c;font-size:12px}
    .tune textarea{width:100%;height:8rem;margin-top:.4rem;border-radius:.5rem;border:1px solid rgb(255 255 255 / 12%);
      background:#080505;color:#d9cdc2;font:11px/1.35 ui-monospace,monospace;resize:vertical}
    .tune-toggle{position:fixed;z-index:51;top:.75rem;right:21rem;padding:.35rem .6rem;border-radius:.5rem;
      border:1px solid rgb(255 255 255 / 20%);background:#0d0908;color:#f3ece6;font:12px system-ui;cursor:pointer}
    .tune-toggle.is-flush{right:.75rem}
    body.tune-hide-content main,body.tune-hide-content .topbar{visibility:hidden}
  `;
  document.head.appendChild(style);

  const output = el("textarea", { readOnly: true });
  output.setAttribute("aria-label", "Current values as JSON");
  output.name = "tune-values";
  const status = el("div", { className: "status" });
  status.setAttribute("aria-live", "polite");

  const refreshers = [];
  const changed = () => {
    api.update();
    output.value = snapshot();
    try {
      localStorage.setItem(STORAGE_KEY, output.value);
    } catch {
      // Not persisted; copying still works.
    }
  };

  const slider = ([key, label, min, max, step, digits]) => {
    const value = el("span", { className: "value" });
    const input = el("input", { type: "range", min, max, step });
    input.name = key;
    input.setAttribute("aria-label", label);
    const show = () => {
      input.value = params[key];
      input.style.setProperty("--pct", `${((params[key] - min) / (max - min)) * 100}%`);
      value.textContent = Number(params[key]).toFixed(digits);
    };
    input.addEventListener("input", () => {
      params[key] = Number(input.value);
      show();
      changed();
    });
    refreshers.push(show);
    show();
    return el("div", { className: "field" }, el("div", { className: "field-top" }, label, value), input);
  };

  const panel = el("aside", { className: "tune" });
  panel.setAttribute("aria-label", "Backdrop tuning");

  // --- Gradient map ---
  const resetAll = el("button", { type: "button", className: "link", textContent: "Reset" });
  panel.append(el("div", { className: "head" }, el("h2", { textContent: "Gradient map" }), resetAll));
  panel.append(el("h3", { textContent: "Blend" }));

  const seg = el("div", { className: "seg" });
  const blendButtons = blendModes.map((mode) => {
    const button = el("button", { type: "button", textContent: BLEND_LABELS[mode] });
    button.addEventListener("click", () => {
      params.blend = mode;
      refreshers.forEach((fn) => fn());
      changed();
    });
    seg.append(button);
    return [mode, button];
  });
  panel.append(seg);

  panel.append(el("div", { className: "hint" }, "Stops", el("span", { textContent: "Drag to reposition · click to recolour" })));
  const bar = el("div", { className: "stops" });
  const space = { srgb: "", linear: "in srgb-linear ", oklab: "in oklab ", oklch: "in oklch " };
  const stopNodes = params.stops.map((stop, i) => {
    const node = el("div", { className: "stop" });
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", `Colour stop ${i + 1}`);
    const picker = el("input", { type: "color", hidden: true });
    picker.name = `stop-${i}`;
    picker.addEventListener("input", () => {
      stop.c = picker.value;
      refreshers.forEach((fn) => fn());
      changed();
    });
    let startX = 0;
    let moved = false;
    node.addEventListener("pointerdown", (event) => {
      node.setPointerCapture(event.pointerId);
      startX = event.clientX;
      moved = false;
    });
    node.addEventListener("pointermove", (event) => {
      if (!node.hasPointerCapture(event.pointerId)) return;
      if (Math.abs(event.clientX - startX) > 3) moved = true;
      if (!moved) return;
      const rect = bar.getBoundingClientRect();
      const lo = i === 0 ? 0 : params.stops[i - 1].p + 0.01;
      const hi = i === params.stops.length - 1 ? 1 : params.stops[i + 1].p - 0.01;
      stop.p = Math.min(hi, Math.max(lo, (event.clientX - rect.left) / rect.width));
      refreshers.forEach((fn) => fn());
      changed();
    });
    node.addEventListener("pointerup", (event) => {
      node.releasePointerCapture(event.pointerId);
      if (!moved) {
        picker.value = stop.c;
        picker.showPicker?.();
      }
    });
    node.append(picker);
    bar.append(node);
    return node;
  });
  const supportsInterp = CSS.supports("background-image", "linear-gradient(in oklab 90deg, red, blue)");
  refreshers.push(() => {
    const parts = params.stops.map((stop) => `${stop.c} ${(stop.p * 100).toFixed(1)}%`).join(", ");
    const prefix = supportsInterp ? space[params.blend] : "";
    bar.style.backgroundImage = `linear-gradient(${prefix}90deg, ${parts})`;
    stopNodes.forEach((node, i) => {
      node.style.left = `${params.stops[i].p * 100}%`;
      node.style.background = params.stops[i].c;
    });
    blendButtons.forEach(([mode, button]) =>
      button.setAttribute("aria-pressed", String(mode === params.blend)),
    );
  });
  panel.append(bar);
  panel.append(slider(["bias", "Bias", -1, 1, 0.01, 2]), slider(["sharpness", "Sharpness", 0, 1, 0.01, 2]));

  // --- Remaining sections ---
  for (const [title, specs] of SECTIONS) {
    panel.append(el("h3", { textContent: title }));
    specs.forEach((spec) => panel.append(slider(spec)));
    if (title === "Motion") {
      const toggle = el("button", { type: "button", className: "switch" });
      toggle.setAttribute("role", "switch");
      toggle.setAttribute("aria-label", "Pause motion");
      toggle.addEventListener("click", () => {
        params.paused = !params.paused;
        toggle.setAttribute("aria-checked", String(params.paused));
        changed();
      });
      toggle.setAttribute("aria-checked", "false");
      panel.append(el("div", { className: "switch-row" }, "Pause", toggle));
    }
  }

  // --- Actions ---
  const hideContent = el("button", { type: "button", className: "switch" });
  hideContent.setAttribute("role", "switch");
  hideContent.setAttribute("aria-label", "Hide page content");
  hideContent.setAttribute("aria-checked", "false");
  hideContent.addEventListener("click", () => {
    const on = hideContent.getAttribute("aria-checked") !== "true";
    hideContent.setAttribute("aria-checked", String(on));
    document.body.classList.toggle("tune-hide-content", on);
  });
  panel.append(el("div", { className: "switch-row" }, "Hide page content", hideContent));

  const copy = el("button", { type: "button", className: "primary", textContent: "Copy values" });
  copy.addEventListener("click", async () => {
    output.select();
    try {
      await navigator.clipboard.writeText(output.value);
      status.textContent = "Copied. Paste it back into the chat.";
    } catch {
      status.textContent = "Press Cmd+C to copy the selected text.";
    }
  });
  panel.append(el("div", { className: "actions" }, copy), status);
  panel.append(el("details", {}, el("summary", { textContent: "Values (JSON)" }), output));

  resetAll.addEventListener("click", () => {
    for (const key of Object.keys(defaults)) {
      if (key === "paused") continue;
      if (key === "stops") defaults.stops.forEach((stop, i) => Object.assign(params.stops[i], stop));
      else params[key] = defaults[key];
    }
    refreshers.forEach((fn) => fn());
    changed();
    status.textContent = "Reset to the shipped defaults.";
  });

  const toggle = el("button", { type: "button", className: "tune-toggle", textContent: "Hide panel" });
  toggle.addEventListener("click", () => {
    const hidden = panel.classList.toggle("is-hidden");
    toggle.classList.toggle("is-flush", hidden);
    toggle.textContent = hidden ? "Show panel" : "Hide panel";
  });

  document.body.append(panel, toggle);
  refreshers.forEach((fn) => fn());
  changed();
})();
