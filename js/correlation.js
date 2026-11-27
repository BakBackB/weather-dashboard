// Advanced Interactive Analytics (proposal 4.4): scatter plot + linked views + drill-down.
//
//   1. Scatter: daily mean humidity (x) vs. mean temperature (y), colour = rainfall level,
//      marker shape = city. Drawn on a canvas (~12k points); axes and the 2-D brush are SVG.
//   2. Linked views: temperature / sunshine / rainfall distributions and a per-city count follow the brush
//      (focus = brushed days, context = all filtered days in grey).
//   3. Drill-down: monthly summary of the brushed days -> click a month -> its daily records.
//
// Data: DashSync.rows(true) = time window + season + cities chosen in the dashboard (js/dashboardSync.js).
// Everything is built inside #correlationRoot. Uses rawParsedWeather (dataLoader.js) and D3 v7.

function drawCorrelation() {
    const root = document.getElementById("correlationRoot");
    if (!root || root.dataset.built) return;
    root.dataset.built = "true";

    const CITY_COLORS = { "Hanoi": "#0284C7", "Da Nang": "#D97706", "Ho Chi Minh City": "#D93856" };
    const CITY_SHORT = { "Hanoi": "Hanoi", "Da Nang": "Da Nang", "Ho Chi Minh City": "HCMC" };
    const SHAPES = { "Hanoi": "circle", "Da Nang": "square", "Ho Chi Minh City": "triangle" };
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Rainfall levels shared by the point colour, the legend and the rainfall histogram.
    const RAIN_LEVELS = [
        { label: "0 mm (dry)", max: 0, color: "#cbd5e1" },
        { label: "0–5 mm", max: 5, color: "#7dd3fc" },
        { label: "5–20 mm", max: 20, color: "#2563eb" },
        { label: "20–50 mm", max: 50, color: "#6d28d9" },
        { label: "> 50 mm", max: Infinity, color: "#be123c" }
    ];
    const rainLevel = mm => mm <= 0 ? 0 : mm <= 5 ? 1 : mm <= 20 ? 2 : mm <= 50 ? 3 : 4;

    const fmt0 = d3.format(",.0f");
    const fmt1 = d3.format(",.1f");
    const fmtDate = d3.timeFormat("%d %b %Y");

    // ---------- layout (all DOM is created here) ----------
    root.innerHTML = `
        <div class="corr-grid">
            <article class="card corr-scatter-card">
                <header class="card-head">
                    <h3>Humidity vs. Temperature</h3>
                    <p>One dot per city-day. Colour: rainfall that day · Shape: city. Drag a rectangle to select days;
                       the views on the right and the table below follow the selection.</p>
                </header>
                <p id="corrNote" class="corr-note"></p>
                <div id="corrScatter" class="corr-scatter">
                    <canvas id="corrCanvas"></canvas>
                    <svg id="corrSvg" viewBox="0 0 850 480" role="img"
                         aria-label="Scatter plot of mean humidity against mean temperature"></svg>
                    <div id="corrTooltip" class="tooltip corr-tooltip" style="opacity:0"></div>
                </div>
                <div id="corrLegend" class="corr-legend"></div>
                <div class="corr-box" id="corrBox">
                    <div class="corr-box-head">
                        <strong>Selection box</strong>
                        <div class="corr-segment" role="group" aria-label="Brush mode">
                            <button type="button" data-mode="free" class="active" title="Drag any rectangle you like">Free</button>
                            <button type="button" data-mode="fixed" title="Click or drag to place a box of the Δ size typed below">Fixed size (Δ)</button>
                        </div>
                    </div>
                    <div class="corr-box-grid">
                        <span class="corr-box-name">Humidity (%)</span>
                        <label>from <input id="boxH0" type="number" step="0.5" inputmode="decimal"></label>
                        <label>to <input id="boxH1" type="number" step="0.5" inputmode="decimal"></label>
                        <label>Δx <input id="boxDx" type="number" step="0.5" min="0.5" inputmode="decimal"></label>
                        <span class="corr-box-name">Temperature (°C)</span>
                        <label>from <input id="boxT0" type="number" step="0.1" inputmode="decimal"></label>
                        <label>to <input id="boxT1" type="number" step="0.1" inputmode="decimal"></label>
                        <label>Δy <input id="boxDy" type="number" step="0.1" min="0.1" inputmode="decimal"></label>
                    </div>
                    <p id="corrBoxHint" class="corr-note corr-box-hint"></p>
                    <div class="corr-bands" id="corrBands" role="group" aria-label="Quick temperature bands">
                        <span>Quick band (all humidity):</span>
                        <button type="button" class="corr-btn" data-lo="-100" data-hi="13">Damaging cold &lt;13°C</button>
                        <button type="button" class="corr-btn" data-lo="13" data-hi="15">Severe cold 13–15°C</button>
                        <button type="button" class="corr-btn" data-lo="15" data-hi="20">Bitterly cold 15–20°C</button>
                        <button type="button" class="corr-btn" data-lo="-100" data-hi="20">All cold ≤20°C</button>
                    </div>
                </div>
                <div class="corr-actions">
                    <span id="corrSelectionText" class="corr-selection-text"></span>
                    <button id="corrPush" class="corr-btn corr-btn-primary" type="button" disabled
                            title="Every chart on the dashboard then counts only days inside the selected humidity and temperature box">Filter dashboard to selection</button>
                    <button id="corrZoom" class="corr-btn" type="button" disabled
                            title="Set the dashboard time window to the first and last day of the selection">Zoom time to selection</button>
                    <button id="corrClear" class="corr-btn" type="button" disabled>Clear selection</button>
                </div>
            </article>

            <article class="card corr-linked-card">
                <header class="card-head">
                    <h3>Linked views</h3>
                    <p>Coloured bars: selected days · grey bars: all days in the current dashboard filter.
                       Hover a bar for details · <span class="corr-key corr-key-max">▲ max</span> and
                       <span class="corr-key corr-key-min">▼ min</span> mark the fullest and emptiest bar.</p>
                </header>
                <dl id="corrStats" class="corr-stats"></dl>
                <div id="corrHistTemp" class="corr-hist"></div>
                <div id="corrHistSun" class="corr-hist"></div>
                <div id="corrHistRain" class="corr-hist"></div>
                <div id="corrCityBars" class="corr-hist"></div>
            </article>

            <article class="card card-wide corr-drill-card">
                <header class="card-head">
                    <h3>Drill-down: monthly summary → daily records</h3>
                    <p>Summary of the selected days (all filtered days when nothing is selected). Pick how to group the days and which sum / average / min / max to show;
                       ▲ ▼ mark the highest and lowest group in each column. Click a header to sort, click a row to list its days.</p>
                </header>
                <div class="corr-filters">
                    <label>City <select id="corrFCity"><option value="all">All cities</option>
                        ${DASH_CITIES.map(c => `<option value="${c}">${c}</option>`).join("")}</select></label>
                    <label>Rainfall <select id="corrFRain"><option value="all">Any</option>
                        ${RAIN_LEVELS.map((l, i) => `<option value="${i}">${l.label}</option>`).join("")}</select></label>
                    <label>Search <input id="corrFText" type="search" placeholder="e.g. Jul 2021 or Hanoi"></label>
                    <button id="corrFReset" class="corr-btn" type="button" disabled>Clear filters</button>
                </div>
                <div class="corr-groupbar">
                    <label>Group by <select id="corrG1"></select></label>
                    <label>then by <select id="corrG2"></select></label>
                    <fieldset class="corr-chips" id="corrVars"><legend>Variables</legend></fieldset>
                    <fieldset class="corr-chips" id="corrAggs"><legend>Aggregate</legend></fieldset>
                    <fieldset class="corr-chips" id="corrDerived"><legend>Derived</legend></fieldset>
                </div>
                <div class="corr-drill-bar">
                    <nav id="corrPath" class="corr-path" aria-label="Drill-down path"></nav>
                </div>
                <div id="corrDrill" class="corr-drill"></div>
            </article>
        </div>`;

    // ---------- state ----------
    const W = 850, H = 480;
    const margin = { top: 16, right: 18, bottom: 48, left: 58 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    let data = [];            // filtered rows with finite values, plus pixel positions
    let selection = null;     // null = nothing brushed, else a subset of `data`
    let brushBox = null;      // the brushed rectangle in pixels: [[x0, y0], [x1, y1]]
    let drill = { key: null };

    // Fixed axes over the whole data set so the picture does not jump when a filter changes.
    const finite = rawParsedWeather.filter(d => [d.humidity, d.tempMean].every(Number.isFinite));
    const x = d3.scaleLinear().domain([Math.floor(d3.min(finite, d => d.humidity) / 5) * 5, 100]).range([0, plotW]);
    const y = d3.scaleLinear().domain(d3.extent(finite, d => d.tempMean)).nice().range([plotH, 0]);

    const canvas = document.getElementById("corrCanvas");
    const ratio = 2;
    canvas.width = W * ratio;
    canvas.height = H * ratio;
    const ctx = canvas.getContext("2d");

    const svg = d3.select("#corrSvg");
    const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    plot.append("g").attr("class", "corr-grid-lines").selectAll("line").data(y.ticks(7)).join("line")
        .attr("x1", 0).attr("x2", plotW).attr("y1", d => y(d)).attr("y2", d => y(d));
    // Cold-spell thresholds (daily mean temperature): Damaging cold < 13, Severe cold 13–15, Bitterly cold 15–20.
    const COLD_LINES = [[13, "Damaging cold <13"], [15, "Severe cold <15"], [20, "Bitterly cold ≤20"]];
    const coldRef = plot.append("g").attr("class", "corr-cold-lines").style("pointer-events", "none");
    COLD_LINES.filter(([t]) => t > y.domain()[0] && t < y.domain()[1]).forEach(([t, text]) => {
        coldRef.append("line").attr("x1", 0).attr("x2", plotW).attr("y1", y(t)).attr("y2", y(t));
        coldRef.append("text").attr("x", 4).attr("y", y(t) - 4).attr("text-anchor", "start").text(`${t} °C · ${text}`);
    });
    plot.append("g").attr("class", "axis").attr("transform", `translate(0,${plotH})`).call(d3.axisBottom(x).ticks(9));
    plot.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(7));
    plot.append("text").attr("class", "corr-axis-label").attr("x", plotW / 2).attr("y", plotH + 40)
        .attr("text-anchor", "middle").text("Daily mean relative humidity (%)");
    plot.append("text").attr("class", "corr-axis-label").attr("transform", "rotate(-90)")
        .attr("x", -plotH / 2).attr("y", -42).attr("text-anchor", "middle").text("Daily mean temperature (°C)");

    // ---------- brush: free rectangle, or a box of a fixed size (Δx humidity, Δy temperature) ----------
    let boxMode = "free";                       // "free" | "fixed"
    let fixedSize = { dx: 10, dy: 4 };          // remembered Δ in data units (% RH, °C)
    const hDom = x.domain(), tDom = y.domain();
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const brush = d3.brush().extent([[0, 0], [plotW, plotH]])
        .filter(event => boxMode === "free" && !event.ctrlKey && !event.button)
        .on("brush end", event => {
            // Moves made by the code (brush.move(...) after a data change or typed values) are not user gestures.
            if (!event.sourceEvent) return;
            applyBox(event.selection, false);
        });
    const brushGroup = plot.append("g").attr("class", "corr-brush").call(brush);

    // Fixed-size mode: a transparent layer on top places the box where you click and drags it around.
    const lockLayer = plot.append("rect").attr("class", "corr-lock-layer")
        .attr("width", plotW).attr("height", plotH).style("pointer-events", "none");
    lockLayer.call(d3.drag()
        .on("start", event => {
            const size = fixedSizePx();
            const inside = brushBox && event.x >= brushBox[0][0] && event.x <= brushBox[1][0] &&
                event.y >= brushBox[0][1] && event.y <= brushBox[1][1];
            // Grab the existing box where it was hit, otherwise centre a new box on the pointer.
            event.subject.grab = inside ? [event.x - brushBox[0][0], event.y - brushBox[0][1]] : [size.w / 2, size.h / 2];
            placeFixedBox(event.x, event.y, event.subject.grab);
        })
        .on("drag", event => placeFixedBox(event.x, event.y, event.subject.grab))
        .subject(() => ({})));

    function fixedSizePx() {
        return {
            w: Math.min(plotW, plotW * fixedSize.dx / (hDom[1] - hDom[0])),
            h: Math.min(plotH, plotH * fixedSize.dy / (tDom[1] - tDom[0]))
        };
    }

    function placeFixedBox(px, py, grab) {
        const { w, h } = fixedSizePx();
        const x0 = clamp(px - grab[0], 0, plotW - w), y0 = clamp(py - grab[1], 0, plotH - h);
        applyBox([[x0, y0], [x0 + w, y0 + h]], true);
    }

    // One entry point for every way of changing the box (brush, fixed drag, typed numbers, clear).
    function applyBox(box, moveBrush) {
        brushBox = box;
        if (!box) selection = null;
        else {
            const [[x0, y0], [x1, y1]] = box;
            selection = data.filter(d => d.px >= x0 && d.px <= x1 && d.py >= y0 && d.py <= y1);
        }
        if (moveBrush) brushGroup.call(brush.move, box);
        scheduleUpdate();
    }

    // The box in data units, or null.
    function boxValues() {
        if (!brushBox) return null;
        const [[x0, y0], [x1, y1]] = brushBox;
        return { h0: x.invert(x0), h1: x.invert(x1), t0: y.invert(y1), t1: y.invert(y0) };
    }

    // Typed values -> box. Out-of-range numbers are clamped to the axes, swapped edges are put in order.
    function setBoxValues(v) {
        let h0 = clamp(Math.min(v.h0, v.h1), hDom[0], hDom[1]), h1 = clamp(Math.max(v.h0, v.h1), hDom[0], hDom[1]);
        let t0 = clamp(Math.min(v.t0, v.t1), tDom[0], tDom[1]), t1 = clamp(Math.max(v.t0, v.t1), tDom[0], tDom[1]);
        if (h1 - h0 < 0.5) { h1 = Math.min(hDom[1], h0 + 0.5); h0 = h1 - 0.5; }
        if (t1 - t0 < 0.1) { t1 = Math.min(tDom[1], t0 + 0.1); t0 = t1 - 0.1; }
        applyBox([[x(h0), y(t1)], [x(h1), y(t0)]], true);
    }

    function onBoxInput(id) {
        const val = +document.getElementById(id).value;
        if (!Number.isFinite(val) || document.getElementById(id).value === "") return;
        // No box yet: start from a box of the remembered size in the middle of the axes.
        const cur = boxValues() || {
            h0: (hDom[0] + hDom[1]) / 2 - fixedSize.dx / 2, h1: (hDom[0] + hDom[1]) / 2 + fixedSize.dx / 2,
            t0: (tDom[0] + tDom[1]) / 2 - fixedSize.dy / 2, t1: (tDom[0] + tDom[1]) / 2 + fixedSize.dy / 2
        };
        const next = { ...cur };
        if (id === "boxH0") next.h0 = val;
        else if (id === "boxH1") next.h1 = val;
        else if (id === "boxT0") next.t0 = val;
        else if (id === "boxT1") next.t1 = val;
        else if (id === "boxDx" && val > 0) {       // resize around the centre
            fixedSize.dx = Math.min(val, hDom[1] - hDom[0]);
            const c = (cur.h0 + cur.h1) / 2; next.h0 = c - fixedSize.dx / 2; next.h1 = c + fixedSize.dx / 2;
            if (next.h0 < hDom[0]) { next.h0 = hDom[0]; next.h1 = hDom[0] + fixedSize.dx; }
            if (next.h1 > hDom[1]) { next.h1 = hDom[1]; next.h0 = hDom[1] - fixedSize.dx; }
        } else if (id === "boxDy" && val > 0) {
            fixedSize.dy = Math.min(val, tDom[1] - tDom[0]);
            const c = (cur.t0 + cur.t1) / 2; next.t0 = c - fixedSize.dy / 2; next.t1 = c + fixedSize.dy / 2;
            if (next.t0 < tDom[0]) { next.t0 = tDom[0]; next.t1 = tDom[0] + fixedSize.dy; }
            if (next.t1 > tDom[1]) { next.t1 = tDom[1]; next.t0 = tDom[1] - fixedSize.dy; }
        } else return;
        setBoxValues(next);
        const now = boxValues();
        if (now && (id !== "boxDx" && id !== "boxDy")) fixedSize = { dx: now.h1 - now.h0, dy: now.t1 - now.t0 };
    }

    ["boxH0", "boxH1", "boxT0", "boxT1", "boxDx", "boxDy"].forEach(id =>
        document.getElementById(id).addEventListener("change", () => onBoxInput(id)));

    function setMode(mode) {
        boxMode = mode;
        if (mode === "fixed") { const v = boxValues(); if (v) fixedSize = { dx: v.h1 - v.h0, dy: v.t1 - v.t0 }; }
        d3.selectAll("#corrBox [data-mode]").classed("active", function () { return this.dataset.mode === mode; });
        brushGroup.classed("is-fixed", mode === "fixed");
        lockLayer.style("pointer-events", mode === "fixed" ? "all" : "none");
        syncBoxInputs();
    }
    d3.selectAll("#corrBox [data-mode]").on("click", function () { setMode(this.dataset.mode); });

    // Quick temperature bands: the whole humidity range, one cold level. Upper edges below 20 are exclusive
    // (a day at exactly 15.0 °C belongs to Bitterly cold, not Severe cold), so they stop a hair under the threshold.
    d3.selectAll("#corrBands button").on("click", function () {
        const lo = +this.dataset.lo, hi = +this.dataset.hi;
        setBoxValues({ h0: hDom[0], h1: hDom[1], t0: Math.max(lo, tDom[0]), t1: hi < 20 ? hi - 0.01 : hi });
    });

    // Keep the number fields and the hint in step with the box (skipped for the field being typed in).
    function syncBoxInputs() {
        const v = boxValues();
        const set = (id, value, digits) => {
            const el = document.getElementById(id);
            if (document.activeElement === el) return;
            el.value = Number.isFinite(value) ? value.toFixed(digits) : "";
        };
        set("boxH0", v && v.h0, 1); set("boxH1", v && v.h1, 1);
        set("boxT0", v && v.t0, 1); set("boxT1", v && v.t1, 1);
        set("boxDx", v ? v.h1 - v.h0 : boxMode === "fixed" ? fixedSize.dx : NaN, 1);
        set("boxDy", v ? v.t1 - v.t0 : boxMode === "fixed" ? fixedSize.dy : NaN, 1);
        const how = boxMode === "fixed"
            ? `Fixed size ${fmt1(fixedSize.dx)} % × ${fmt1(fixedSize.dy)} °C: click or drag on the plot to place the box.`
            : "Free: drag any rectangle on the plot.";
        const range = v ? ` Range: humidity ${fmt1(v.h0)}–${fmt1(v.h1)} %, temperature ${fmt1(v.t0)}–${fmt1(v.t1)} °C.` : "";
        d3.select("#corrBoxHint").text(`${how} Or type from / to / Δ and press Enter.${range}`);
    }

    // Legend: rainfall colour and city shape.
    const legend = d3.select("#corrLegend");
    legend.selectAll(".corr-legend-rain").data(RAIN_LEVELS).join("span").attr("class", "corr-legend-item")
        .html(d => `<i style="background:${d.color}"></i>${d.label}`);
    legend.selectAll(".corr-legend-city").data(Object.keys(CITY_COLORS)).join("span").attr("class", "corr-legend-item corr-legend-shape")
        .html(d => `<svg width="14" height="14" viewBox="-7 -7 14 14">${shapeSvg(SHAPES[d])}</svg>${CITY_SHORT[d]}`);

    function shapeSvg(shape) {
        if (shape === "square") return '<rect x="-4.5" y="-4.5" width="9" height="9" fill="#64748b"/>';
        if (shape === "triangle") return '<path d="M0,-5.5L5,4L-5,4Z" fill="#64748b"/>';
        return '<circle r="5" fill="#64748b"/>';
    }

    // ---------- data ----------
    function loadData() {
        // The scatter plot needs the days it selects from, so it ignores the dashboard's day condition.
        data = DashSync.rows(true, false)
            .filter(d => [d.humidity, d.tempMean, d.precipitation, d.sunshineHours].every(Number.isFinite))
            .map(d => Object.assign(Object.create(d), { px: x(d.humidity), py: y(d.tempMean), level: rainLevel(d.precipitation) }));
        // Prototype-based copies keep the original row fields without copying 12k objects' data.
        // When the dashboard is filtered by a box (set earlier with "Filter dashboard"), show that box as the selection.
        const condition = DashSync.condition();
        if (condition) {
            selection = data.filter(d => DashSync.inCondition(d));
            brushBox = [[x(condition.humidity[0]), y(condition.temp[1])], [x(condition.humidity[1]), y(condition.temp[0])]];
            brushGroup.call(brush.move, brushBox);
        } else {
            selection = null;
            brushBox = null;
            brushGroup.call(brush.move, null);
        }
    }

    // ---------- scatter (canvas) ----------
    function drawMarker(shape, px, py) {
        const r = 2.7;
        if (shape === "square") ctx.rect(px - r, py - r, 2 * r, 2 * r);
        else if (shape === "triangle") { ctx.moveTo(px, py - r * 1.25); ctx.lineTo(px + r * 1.1, py + r * 0.9); ctx.lineTo(px - r * 1.1, py + r * 0.9); ctx.closePath(); }
        else { ctx.moveTo(px + r, py); ctx.arc(px, py, r, 0, 2 * Math.PI); }
    }

    function drawPoints(points, colorOf, alpha) {
        // One path per colour and shape keeps the number of canvas state changes small.
        ctx.globalAlpha = alpha;
        d3.group(points, colorOf, d => SHAPES[d.city]).forEach((byShape, color) => {
            byShape.forEach((rows, shape) => {
                ctx.beginPath();
                rows.forEach(d => drawMarker(shape, d.px, d.py));
                ctx.fillStyle = color;
                ctx.fill();
            });
        });
        ctx.globalAlpha = 1;
    }

    function drawScatter() {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.translate(margin.left, margin.top);
        const byLevel = d => RAIN_LEVELS[d.level].color;
        if (!selection) {
            // Wet days are drawn last so the rare heavy rain days are not hidden by dry ones.
            drawPoints([...data].sort((a, b) => a.level - b.level), byLevel, 0.62);
        } else {
            const chosen = new Set(selection);
            drawPoints(data.filter(d => !chosen.has(d)), () => "#cbd5e1", 0.22);
            drawPoints([...selection].sort((a, b) => a.level - b.level), byLevel, 0.9);
        }
        d3.select("#corrNote").text(noteText());
    }

    function noteText() {
        const cities = DashSync.cities().size;
        return `Dashboard filter: ${DashSync.rangeLabel()} · ${DashSync.season().label} · ` +
            `${cities} of ${DASH_CITIES.length} cities · ${fmt0(data.length)} days`;
    }

    // Hover: nearest point within a few pixels (quadtree over the plotted points).
    const tooltip = d3.select("#corrTooltip");
    svg.on("pointermove", event => {
        if (!data.length || event.buttons) return;
        const [mx, my] = d3.pointer(event, plot.node());
        const found = quadtree().find(mx, my, 6);
        if (!found) { tooltip.style("opacity", 0); return; }
        const box = document.getElementById("corrScatter").getBoundingClientRect();
        tooltip.style("opacity", 0.92)
            .style("left", `${event.clientX - box.left + 12}px`).style("top", `${event.clientY - box.top - 30}px`)
            .html(`<strong>${found.city}</strong> · ${fmtDate(found.date)}<br>` +
                `${fmt1(found.tempMean)} °C · ${fmt0(found.humidity)} % RH<br>` +
                `Rain ${fmt1(found.precipitation)} mm · Sun ${fmt1(found.sunshineHours)} h`);
    }).on("pointerleave", () => tooltip.style("opacity", 0));

    let tree = null;
    function quadtree() {
        if (!tree) tree = d3.quadtree().x(d => d.px).y(d => d.py).addAll(data);
        return tree;
    }

    // ---------- tooltip shared by the linked views ----------
    const tipEl = document.createElement("div");
    tipEl.className = "corr-tip";
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);

    function showTip(event, html) {
        tipEl.innerHTML = html;
        tipEl.style.opacity = 1;
        const gap = 14, r = tipEl.getBoundingClientRect();
        let left = event.clientX + gap, top = event.clientY + gap;
        if (left + r.width > window.innerWidth - 8) left = event.clientX - r.width - gap;
        if (top + r.height > window.innerHeight - 8) top = event.clientY - r.height - gap;
        tipEl.style.left = `${Math.max(4, left)}px`;
        tipEl.style.top = `${Math.max(4, top)}px`;
    }
    const hideTip = () => { tipEl.style.opacity = 0; };
    const pct = (part, whole) => whole ? `${fmt1(100 * part / whole)} %` : "–";

    // ---------- linked views ----------
    // Index of the fullest and of the emptiest non-empty bar (-1 when they would not be distinct).
    function extremes(counts) {
        const filled = counts.map((v, i) => [v, i]).filter(([v]) => v > 0);
        if (!filled.length) return { max: -1, min: -1 };
        const hi = d3.greatest(filled, d => d[0]), lo = d3.least(filled, d => d[0]);
        return hi[0] === lo[0] ? { max: -1, min: -1 } : { max: hi[1], min: lo[1] };
    }

    // Generic histogram: grey bars = all filtered days, coloured bars = selected days.
    // The fullest selected bar is outlined and marked ▲, the emptiest non-empty one dashed and marked ▼.
    function drawHistogram(container, title, bins, valueOf, color, axisLabel, tickLabel, selectedRows, binText) {
        const width = 440, height = 160, m = { top: 32, right: 8, bottom: 42, left: 38 };
        const w = width - m.left - m.right, h = height - m.top - m.bottom;
        const host = d3.select(container);
        host.selectAll("*").remove();
        const g = host.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
            .attr("aria-label", title).append("g").attr("transform", `translate(${m.left},${m.top})`);
        const count = rows => bins.map(b => rows.filter(d => b.test(valueOf(d))).length);
        const all = count(data);
        const chosen = selection ? count(selectedRows) : all;
        const totalAll = d3.sum(all), totalChosen = d3.sum(chosen);
        const ext = extremes(chosen);
        const xb = d3.scaleBand().domain(d3.range(bins.length)).range([0, w]).padding(0.12);
        const yMax = d3.max(all) || 1;
        const yb = d3.scaleLinear().domain([0, yMax]).nice().range([h, 0]);
        g.append("text").attr("class", "corr-hist-title").attr("x", -m.left + 4).attr("y", -19).text(title);
        g.append("g").attr("class", "axis").call(d3.axisLeft(yb).ticks(3).tickFormat(d3.format("~s")));
        g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`)
            .call(d3.axisBottom(xb).tickValues(d3.range(bins.length).filter(i => bins.length < 9 || i % 2 === 0))
                .tickFormat(i => tickLabel(bins[i])).tickSizeOuter(0));
        g.append("text").attr("class", "corr-axis-label").attr("x", w / 2).attr("y", h + 36)
            .attr("text-anchor", "middle").text(axisLabel);
        g.selectAll(".corr-bar-all").data(all).join("rect").attr("class", "corr-bar-all")
            .attr("x", (d, i) => xb(i)).attr("width", xb.bandwidth()).attr("y", d => yb(d)).attr("height", d => h - yb(d))
            .attr("fill", "#e2e8f0");
        g.selectAll(".corr-bar-sel").data(chosen).join("rect").attr("class", "corr-bar-sel")
            .attr("x", (d, i) => xb(i)).attr("width", xb.bandwidth()).attr("y", d => yb(d)).attr("height", d => h - yb(d))
            .attr("fill", (d, i) => typeof color === "function" ? color(i) : color)
            .attr("stroke", (d, i) => i === ext.max || i === ext.min ? "#0f172a" : "none")
            .attr("stroke-width", 1.5)
            .attr("stroke-dasharray", (d, i) => i === ext.min ? "3,2" : null);
        g.selectAll(".corr-mark").data([ext.max, ext.min].filter(i => i >= 0)).join("text").attr("class", "corr-mark")
            .attr("x", i => xb(i) + xb.bandwidth() / 2).attr("y", i => yb(chosen[i]) - 4).attr("text-anchor", "middle")
            .text(i => `${i === ext.max ? "▲" : "▼"} ${fmt0(chosen[i])}`);
        // Transparent hit areas: one per bin, full height, so thin bars are easy to hover.
        g.selectAll(".corr-hit").data(d3.range(bins.length)).join("rect").attr("class", "corr-hit")
            .attr("x", i => xb(i) - 2).attr("width", xb.bandwidth() + 4).attr("y", 0).attr("height", h)
            .on("pointerenter", function () { d3.select(this).classed("hover", true); })
            .on("pointermove", (event, i) => {
                const lines = [`<strong>${binText(bins[i], i, bins.length)}</strong>`];
                if (selection) {
                    lines.push(`Selected: <b>${fmt0(chosen[i])}</b> days · ${pct(chosen[i], totalChosen)} of the selection`,
                        `All filtered days: ${fmt0(all[i])} · selection covers ${pct(chosen[i], all[i])} of this bin`);
                } else {
                    lines.push(`Days: <b>${fmt0(all[i])}</b> · ${pct(all[i], totalAll)} of all filtered days`);
                }
                if (i === ext.max) lines.push("▲ fullest bar");
                if (i === ext.min) lines.push("▼ emptiest non-empty bar");
                showTip(event, lines.join("<br>"));
            })
            .on("pointerleave", function () { d3.select(this).classed("hover", false); hideTip(); });
    }

    function numericBins(start, end, step) {
        return d3.range(start, end, step).map((lo, i, list) => {
            const last = i === list.length - 1;
            return { lo, hi: lo + step, test: v => v >= lo && (last ? true : v < lo + step) };
        });
    }

    function updateLinked() {
        const rows = selection || data;
        const tempBins = numericBins(14, 36, 2).map((b, i, l) => (i === 0 ? { ...b, test: v => v < b.hi } : b));
        drawHistogram("#corrHistTemp", "Temperature (°C)", tempBins, d => d.tempMean, "#0f766e",
            "Daily mean temperature (°C)", b => b.lo, selection,
            (b, i, n) => i === 0 ? `Below ${b.hi} °C` : i === n - 1 ? `${b.lo} °C and above` : `${b.lo}–${b.hi} °C`);
        const sunBins = numericBins(0, 14, 1).map((b, i, l) => (i === l.length - 1 ? { ...b, test: v => v >= b.lo } : b));
        drawHistogram("#corrHistSun", "Sunshine (hours per day)", sunBins, d => d.sunshineHours, "#ca8a04",
            "Sunshine duration (h)", b => b.lo, selection,
            (b, i, n) => i === n - 1 ? `${b.lo} h and above` : `${b.lo}–${b.hi} h`);
        const rainBins = RAIN_LEVELS.map((level, i) => ({ label: level.label, test: v => rainLevel(v) === i }));
        drawHistogram("#corrHistRain", "Rainfall (days per level)", rainBins, d => d.precipitation,
            i => RAIN_LEVELS[i].color, "Daily rainfall level", b => b.label.replace(" (dry)", "").replace(" mm", ""), selection,
            b => `Rainfall ${b.label}`);
        drawCityBars(rows);
        drawStats(rows);
    }

    function drawCityBars(rows) {
        const width = 440, height = 112, m = { top: 22, right: 60, bottom: 8, left: 64 };
        const w = width - m.left - m.right, h = height - m.top - m.bottom;
        const host = d3.select("#corrCityBars");
        host.selectAll("*").remove();
        const g = host.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
            .attr("aria-label", "Selected days per city").append("g").attr("transform", `translate(${m.left},${m.top})`);
        const cities = DASH_CITIES.filter(c => DashSync.hasCity(c));
        const totals = new Map(cities.map(c => [c, data.filter(d => d.city === c).length]));
        const chosen = new Map(cities.map(c => [c, rows.filter(d => d.city === c).length]));
        const ext = extremes(cities.map(c => chosen.get(c)));
        const markOf = i => i === ext.max ? "▲ " : i === ext.min ? "▼ " : "";
        const yb = d3.scaleBand().domain(cities).range([0, h]).padding(0.25);
        const xb = d3.scaleLinear().domain([0, d3.max([...totals.values()]) || 1]).range([0, w]);
        g.append("text").attr("class", "corr-hist-title").attr("x", -m.left + 4).attr("y", -9).text("Days per city");
        g.selectAll(".corr-bar-all").data(cities).join("rect").attr("class", "corr-bar-all")
            .attr("y", c => yb(c)).attr("height", yb.bandwidth()).attr("width", c => xb(totals.get(c))).attr("fill", "#e2e8f0");
        g.selectAll(".corr-bar-sel").data(cities).join("rect").attr("class", "corr-bar-sel")
            .attr("y", c => yb(c)).attr("height", yb.bandwidth()).attr("width", c => xb(chosen.get(c))).attr("fill", c => CITY_COLORS[c])
            .attr("stroke", (c, i) => i === ext.max || i === ext.min ? "#0f172a" : "none").attr("stroke-width", 1.5)
            .attr("stroke-dasharray", (c, i) => i === ext.min ? "3,2" : null);
        g.selectAll(".corr-city-name").data(cities).join("text").attr("class", "corr-city-name")
            .attr("x", -6).attr("y", c => yb(c) + yb.bandwidth() / 2).attr("dy", "0.35em").attr("text-anchor", "end")
            .text(c => CITY_SHORT[c]);
        g.selectAll(".corr-city-count").data(cities).join("text").attr("class", (c, i) => "corr-city-count" + (markOf(i) ? " corr-mark" : ""))
            .attr("x", c => xb(totals.get(c)) + 5).attr("y", c => yb(c) + yb.bandwidth() / 2).attr("dy", "0.35em")
            .text((c, i) => markOf(i) + fmt0(chosen.get(c)));
        g.selectAll(".corr-hit").data(cities).join("rect").attr("class", "corr-hit")
            .attr("x", -m.left).attr("width", width).attr("y", c => yb(c) - 2).attr("height", yb.bandwidth() + 4)
            .on("pointerenter", function () { d3.select(this).classed("hover", true); })
            .on("pointermove", (event, c) => {
                const rc = rows.filter(d => d.city === c);
                const lines = [`<strong>${c}</strong>`,
                `${selection ? "Selected" : "Days"}: <b>${fmt0(chosen.get(c))}</b> of ${fmt0(totals.get(c))} filtered days (${pct(chosen.get(c), totals.get(c))})`,
                `${pct(chosen.get(c), rows.length)} of ${selection ? "the selection" : "all filtered days"}`];
                if (rc.length) lines.push(`Mean ${fmt1(d3.mean(rc, d => d.tempMean))} °C · ${fmt0(d3.mean(rc, d => d.humidity))} % RH · rain ${fmt0(d3.sum(rc, d => d.precipitation))} mm`);
                const i = cities.indexOf(c);
                if (i === ext.max) lines.push("▲ most days");
                if (i === ext.min) lines.push("▼ fewest days (non-empty)");
                showTip(event, lines.join("<br>"));
            })
            .on("pointerleave", function () { d3.select(this).classed("hover", false); hideTip(); });
    }

    function drawStats(rows) {
        // Extreme day of a column, as "City · date · value" for the tooltip.
        const dayText = (d, v, unit) => d ? `${CITY_SHORT[d.city]} · ${fmtDate(d.date)} · <b>${v(d)}</b> ${unit}` : "–";
        const hot = d3.greatest(rows, d => d.tempMean), cold = d3.least(rows, d => d.tempMean);
        const humid = d3.greatest(rows, d => d.humidity), dry = d3.least(rows, d => d.humidity);
        const wet = d3.greatest(rows, d => d.precipitation);
        const has = rows.length > 0;
        const stats = [
            ["Days", fmt0(rows.length), "", selection ? `${pct(rows.length, data.length)} of days` : "all days", null],
            ["Mean temperature", has ? fmt1(d3.mean(rows, d => d.tempMean)) : "–", "°C",
                has ? `▼ ${fmt1(cold.tempMean)} · ▲ ${fmt1(hot.tempMean)}` : "",
                has ? `<strong>Daily mean temperature</strong><br>▲ Warmest day: ${dayText(hot, d => fmt1(d.tempMean), "°C")}<br>▼ Coolest day: ${dayText(cold, d => fmt1(d.tempMean), "°C")}` : null],
            ["Mean humidity", has ? fmt0(d3.mean(rows, d => d.humidity)) : "–", "%",
                has ? `▼ ${fmt0(dry.humidity)} · ▲ ${fmt0(humid.humidity)}` : "",
                has ? `<strong>Daily mean humidity</strong><br>▲ Most humid: ${dayText(humid, d => fmt0(d.humidity), "%")}<br>▼ Driest: ${dayText(dry, d => fmt0(d.humidity), "%")}` : null],
            ["Total rainfall", fmt0(d3.sum(rows, d => d.precipitation)), "mm",
                has ? `▲ wettest day ${fmt0(wet.precipitation)} mm` : "",
                has ? `<strong>Rainfall</strong><br>▲ Wettest day: ${dayText(wet, d => fmt1(d.precipitation), "mm")}<br>Rainy days (> 0 mm): ${fmt0(rows.filter(d => d.precipitation > 0).length)} of ${fmt0(rows.length)}` : null]
        ];
        d3.select("#corrStats").selectAll("div").data(stats).join("div").attr("class", "corr-stat")
            .html(d => `<dt>${d[0]}</dt><dd>${d[1]}<small>${d[2]}</small><span class="corr-stat-sub">${d[3]}</span></dd>`)
            .on("pointermove", (event, d) => d[4] ? showTip(event, d[4]) : hideTip())
            .on("pointerleave", hideTip);
        const v = boxValues();
        const boxText = v ? ` · humidity ${fmt1(v.h0)}–${fmt1(v.h1)} %, temp ${fmt1(v.t0)}–${fmt1(v.t1)} °C` : "";
        const text = selection
            ? `${fmt0(selection.length)} of ${fmt0(data.length)} days selected${boxText}` +
            (DashSync.condition() ? " · dashboard is filtered to this box" : "")
            : "No selection: drag a rectangle on the scatter plot";
        d3.select("#corrSelectionText").text(text);
        const applied = !!DashSync.condition();
        d3.select("#corrPush").property("disabled", !selection || !selection.length)
            .text(applied ? "Update dashboard filter" : "Filter dashboard to selection");
        d3.select("#corrZoom").property("disabled", !selection || !selection.length);
        d3.select("#corrClear").property("disabled", !selection && !applied);
    }

    // ---------- drill-down ----------
    // Filters (city, rainfall level, text) apply to both tables; the column headers sort them.
    let tableFilter = { city: "all", level: "all", text: "" };
    let sortState = { month: { col: "key", dir: 1 }, day: { col: "date", dir: 1 } };
    const DAY_PAGE = 40;
    let dayLimit = DAY_PAGE;

    function passFilter(d) {
        if (tableFilter.city !== "all" && d.city !== tableFilter.city) return false;
        if (tableFilter.level !== "all" && d.level !== +tableFilter.level) return false;
        if (tableFilter.text) {
            const label = `${fmtDate(d.date)} ${MONTHS[d.date.getMonth()]} ${d.date.getFullYear()} ${d.city}`.toLowerCase();
            if (!label.includes(tableFilter.text)) return false;
        }
        return true;
    }

    // --- group by: up to two dimensions ---
    const GROUP_DIMS = {
        none: { label: "(none)" },
        month: { label: "Calendar month", key: d => d.date.getMonth(), text: k => MONTHS[+k], order: k => +k },
        year: { label: "Year", key: d => d.date.getFullYear(), text: k => k, order: k => +k },
        yearmonth: {
            label: "Year and month", order: k => k,
            key: d => `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, "0")}`,
            text: k => { const [yr, mo] = k.split("-"); return `${MONTHS[+mo - 1]} ${yr}`; }
        },
        city: { label: "City", key: d => d.city, text: k => CITY_SHORT[k], order: k => DASH_CITIES.indexOf(k) },
        rain: { label: "Rainfall level", key: d => d.level, text: k => RAIN_LEVELS[+k].label, order: k => +k }
    };
    let groupBy = ["month", "none"];
    const activeDims = () => groupBy.filter(g => g !== "none").map(g => GROUP_DIMS[g]);
    const groupId = d => activeDims().map(dm => String(dm.key(d))).join("|") || "all";
    const groupText = parts => parts.length ? parts.map((p, i) => activeDims()[i].text(p)).join(" · ") : "All days";
    const groupTitle = () => activeDims().map(dm => dm.label).join(" › ") || "all days";

    // --- aggregation: variables x functions, plus derived values ---
    const VARS = {
        temp: { name: "temp", unit: "°C", value: d => d.tempMean, digits: 1, sumOk: false },
        hum: { name: "humidity", unit: "%", value: d => d.humidity, digits: 0, sumOk: false },
        rain: { name: "rain", unit: "mm", value: d => d.precipitation, digits: 1, sumOk: true },
        sun: { name: "sunshine", unit: "h", value: d => d.sunshineHours, digits: 1, sumOk: true }
    };
    const VAR_CHIPS = { temp: "Temperature", hum: "Humidity", rain: "Rainfall", sun: "Sunshine" };
    const AGGS = {
        avg: { chip: "Average", short: "Avg", fn: v => d3.mean(v) },
        sum: { chip: "Sum", short: "Sum", fn: v => d3.sum(v) },
        min: { chip: "Min", short: "Min", fn: v => d3.min(v) },
        max: { chip: "Max", short: "Max", fn: v => d3.max(v) },
        median: { chip: "Median", short: "Median", fn: v => d3.median(v) }
    };
    const DERIVED = {
        rainyDays: { label: "Rainy days (> 0 mm)", digits: 0, fn: rows => rows.filter(d => d.precipitation > 0).length },
        rainyPct: { label: "Rainy days (%)", digits: 0, fn: rows => rows.length ? 100 * rows.filter(d => d.precipitation > 0).length / rows.length : NaN },
        heavyDays: { label: "Heavy-rain days (> 50 mm)", digits: 0, fn: rows => rows.filter(d => d.level === 4).length },
        rainShare: { label: "Share of total rain (%)", digits: 1, fn: (rows, ctx) => ctx.totalRain ? 100 * d3.sum(rows, d => d.precipitation) / ctx.totalRain : NaN },
        daysShare: { label: "Share of days (%)", digits: 1, fn: (rows, ctx) => ctx.totalDays ? 100 * rows.length / ctx.totalDays : NaN }
    };
    const pick = { vars: new Set(["temp", "hum", "rain"]), aggs: new Set(["avg", "sum"]), derived: new Set() };

    // Controls: filled once, read back on every change.
    (function buildGroupControls() {
        const options = (sel, withNone) => d3.select(sel).selectAll("option")
            .data(Object.keys(GROUP_DIMS).filter(k => withNone || k !== "none")).join("option")
            .attr("value", k => k).text(k => GROUP_DIMS[k].label);
        options("#corrG1", false);
        options("#corrG2", true);
        const chips = (sel, group, entries, title) => d3.select(sel).selectAll("label").data(entries).join("label")
            .attr("class", "corr-chip").attr("title", ([key]) => title ? title(key) : null)
            .html(([key, text]) => `<input type="checkbox" data-pick="${group}" value="${key}"${pick[group].has(key) ? " checked" : ""}><span>${text}</span>`);
        chips("#corrVars", "vars", Object.entries(VAR_CHIPS));
        chips("#corrAggs", "aggs", Object.entries(AGGS).map(([k, a]) => [k, a.chip]),
            k => k === "sum" ? "Sum is offered for rainfall and sunshine only: adding temperatures or humidity percentages is not meaningful." : null);
        chips("#corrDerived", "derived", Object.entries(DERIVED).map(([k, a]) => [k, a.label]));
        document.getElementById("corrG1").value = groupBy[0];
        document.getElementById("corrG2").value = groupBy[1];
    })();

    function readGroupControls() {
        groupBy = [document.getElementById("corrG1").value, document.getElementById("corrG2").value];
        if (groupBy[1] === groupBy[0]) groupBy[1] = "none";                        // the same dimension twice is pointless
        document.getElementById("corrG2").value = groupBy[1];
        d3.selectAll("#corrG2 option").property("disabled", function () { return this.value === groupBy[0]; });
        d3.selectAll("#corrG1 option").property("disabled", function () { return this.value === groupBy[1]; });
        drill.key = null;
        dayLimit = DAY_PAGE;
        sortState.month = { col: "key", dir: 1 };
        drawDrill();
    }
    d3.selectAll("#corrG1, #corrG2").on("change", readGroupControls);
    d3.selectAll("input[data-pick]").on("change", function () {
        pick[this.dataset.pick][this.checked ? "add" : "delete"](this.value);
        drawDrill();
    });

    // Header cells that sort: click = sort by this column, click again = reverse.
    function sortableHeader(table, columns, state, redraw) {
        table.append("thead").append("tr").selectAll("th").data(columns).join("th")
            .attr("class", c => c.id ? "corr-sortable" : null)
            .attr("aria-sort", c => c.id === state.col ? (state.dir > 0 ? "ascending" : "descending") : null)
            .attr("title", c => c.id ? "Click to sort" : null)
            .html(c => c.id === state.col ? `${c.label} <span class="corr-sort-mark">${state.dir > 0 ? "▲" : "▼"}</span>` : c.label)
            .on("click", (event, c) => {
                if (!c.id) return;
                if (state.col === c.id) state.dir = -state.dir;
                else { state.col = c.id; state.dir = c.id === "key" || c.id === "date" || c.id === "city" ? 1 : -1; }
                redraw();
            });
    }

    function drawDrill() {
        const rows = (selection || data).filter(passFilter);
        const host = d3.select("#corrDrill");
        const path = d3.select("#corrPath");
        host.selectAll("*").remove();
        path.selectAll("*").remove();
        const filtered = tableFilter.city !== "all" || tableFilter.level !== "all" || tableFilter.text !== "";
        d3.select("#corrFReset").property("disabled", !filtered);

        const scope = selection ? "Selected days" : "All filtered days";
        const trail = `${scope} · by ${groupTitle()}`;
        if (drill.key === null) {
            path.append("span").attr("class", "corr-path-current").text(trail);
            drawMonthTable(host, rows);
        } else {
            path.append("button").attr("type", "button").attr("class", "corr-path-step").text("← " + trail)
                .on("click", () => { drill.key = null; dayLimit = DAY_PAGE; drawDrill(); });
            path.append("span").attr("class", "corr-path-sep").text("›");
            path.append("span").attr("class", "corr-path-current").text(groupText(drill.key === "all" ? [] : drill.key.split("|")));
            drawDayTable(host, rows.filter(d => groupId(d) === drill.key));
        }
    }

    // Columns = Days + (selected variables x selected functions) + selected derived values.
    function buildColumns() {
        const cols = [
            { id: "key", label: groupTitle() === "all days" ? "Group" : groupTitle(), digits: 0 },
            { id: "days", label: "Days", digits: 0, value: rows => rows.length }
        ];
        Object.keys(VARS).filter(v => pick.vars.has(v)).forEach(v => {
            Object.keys(AGGS).filter(a => pick.aggs.has(a)).forEach(a => {
                if (a === "sum" && !VARS[v].sumOk) return;
                const vr = VARS[v];
                cols.push({
                    id: `${v}_${a}`, label: `${AGGS[a].short} ${vr.name} (${vr.unit})`, digits: vr.digits,
                    value: rows => rows.length ? AGGS[a].fn(rows.map(vr.value)) : NaN
                });
            });
        });
        Object.keys(DERIVED).filter(k => pick.derived.has(k)).forEach(k => cols.push({
            id: `d_${k}`, label: DERIVED[k].label, digits: DERIVED[k].digits, derived: true,
            value: (rows, ctx) => DERIVED[k].fn(rows, ctx)
        }));
        return cols;
    }

    function drawMonthTable(host, rows) {
        const columns = buildColumns();
        const ctx = { totalRain: d3.sum(rows, d => d.precipitation), totalDays: rows.length };
        const dims = activeDims();
        const byId = new Map();
        rows.forEach(d => {
            const id = groupId(d);
            if (!byId.has(id)) byId.set(id, { id, parts: id === "all" ? [] : id.split("|"), rows: [] });
            byId.get(id).rows.push(d);
        });
        const groups = [...byId.values()];
        groups.forEach(g => { g.label = groupText(g.parts); g.cells = columns.map(c => c.id === "key" ? g.label : c.value(g.rows, ctx)); });
        const state = sortState.month;
        let sortIndex = columns.findIndex(c => c.id === state.col);
        if (sortIndex < 0) { state.col = "key"; state.dir = 1; sortIndex = 0; }
        const keyOrder = g => g.parts.map((p, i) => dims[i].order(p));
        const compareKeys = (a, b) => {
            const ka = keyOrder(a), kb = keyOrder(b);
            for (let i = 0; i < ka.length; i++) { const c = d3.ascending(ka[i], kb[i]); if (c) return c; }
            return 0;
        };
        groups.sort((a, b) => state.dir * (sortIndex === 0 ? compareKeys(a, b) : d3.ascending(a.cells[sortIndex], b.cells[sortIndex]) || compareKeys(a, b)));
        if (!groups.length) { host.append("p").attr("class", "corr-empty").text("No days match the current selection and filters."); return; }

        // Highest and lowest group per numeric column (only when there are enough groups to compare).
        const extremeOf = columns.map((c, ci) => {
            if (c.id === "key" || groups.length < 3) return null;
            const vals = groups.map(g => g.cells[ci]).filter(Number.isFinite);
            const lo = d3.min(vals), hi = d3.max(vals);
            return lo === hi ? null : { lo, hi };
        });
        const cellText = (c, v) => Number.isFinite(v) ? d3.format(`,.${c.digits}f`)(v) : "–";

        const table = host.append("table").attr("class", "corr-table");
        sortableHeader(table, columns, state, drawDrill);
        const open = id => { drill.key = id; dayLimit = DAY_PAGE; drawDrill(); };
        const tr = table.append("tbody").selectAll("tr").data(groups).join("tr")
            .attr("class", "corr-row-click").attr("tabindex", 0)
            .attr("aria-label", g => `${g.label}: show daily records`)
            .on("click", (event, g) => open(g.id))
            .on("keydown", (event, g) => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(g.id); }
            });
        tr.selectAll("td").data(g => g.cells.map((v, ci) => ({ v, ci }))).join("td")
            .attr("class", ({ v, ci }) => {
                const e = extremeOf[ci];
                return e && v === e.hi ? "corr-cell-max" : e && v === e.lo ? "corr-cell-min" : null;
            })
            .attr("title", ({ v, ci }) => {
                const e = extremeOf[ci];
                return e && v === e.hi ? "Highest group in this column" : e && v === e.lo ? "Lowest group in this column" : null;
            })
            .text(({ v, ci }) => ci === 0 ? v : cellText(columns[ci], v));

        // Overall row: the same aggregations over every day in the table, for reference.
        const total = table.append("tfoot").append("tr").attr("class", "corr-total");
        total.selectAll("td").data(columns).join("td")
            .text(c => c.id === "key" ? `All ${groups.length > 1 ? "groups" : "days"}` : cellText(c, c.value(rows, ctx)));
    }

    function drawDayTable(host, rows) {
        const columns = [
            { id: "date", label: "Date", value: d => +d.date },
            { id: "city", label: "City", value: d => d.city },
            { id: "temp", label: "Temp (°C)", value: d => d.tempMean },
            { id: "hum", label: "Humidity (%)", value: d => d.humidity },
            { id: "rain", label: "Rain (mm)", value: d => d.precipitation },
            { id: "sun", label: "Sunshine (h)", value: d => d.sunshineHours }
        ];
        const state = sortState.day;
        const byColumn = columns.find(c => c.id === state.col);
        const sorted = [...rows].sort((a, b) => state.dir * d3.ascending(byColumn.value(a), byColumn.value(b)) || a.date - b.date);
        if (!sorted.length) { host.append("p").attr("class", "corr-empty").text("No days match the current selection and filters."); return; }
        const shown = sorted.slice(0, dayLimit);
        host.append("p").attr("class", "corr-note").text(
            `Showing ${fmt0(shown.length)} of ${fmt0(sorted.length)} days · sorted by ${byColumn.label} ${state.dir > 0 ? "(low → high)" : "(high → low)"}`);
        const wrap = host.append("div").attr("class", "corr-day-wrap");
        const table = wrap.append("table").attr("class", "corr-table corr-day-table");
        sortableHeader(table, columns, state, drawDrill);
        const tr = table.append("tbody").selectAll("tr").data(shown).join("tr");
        tr.append("td").text(d => fmtDate(d.date));
        tr.append("td").html(d => `<span class="corr-dot" style="background:${CITY_COLORS[d.city]}"></span>${CITY_SHORT[d.city]}`);
        tr.append("td").text(d => fmt1(d.tempMean));
        tr.append("td").text(d => fmt0(d.humidity));
        tr.append("td").text(d => fmt1(d.precipitation));
        tr.append("td").text(d => fmt1(d.sunshineHours));
        if (sorted.length > shown.length) {
            host.append("button").attr("type", "button").attr("class", "corr-btn corr-more")
                .text(`Show ${Math.min(DAY_PAGE, sorted.length - shown.length)} more`)
                .on("click", () => { dayLimit += DAY_PAGE; drawDrill(); });
        }
    }

    // The initial state (drill is declared with the other state variables above).
    readGroupControls();

    // Filter bar above the tables.
    d3.select("#corrFCity").on("change", function () { tableFilter.city = this.value; dayLimit = DAY_PAGE; drawDrill(); });
    d3.select("#corrFRain").on("change", function () { tableFilter.level = this.value; dayLimit = DAY_PAGE; drawDrill(); });
    d3.select("#corrFText").on("input", function () { tableFilter.text = this.value.trim().toLowerCase(); dayLimit = DAY_PAGE; drawDrill(); });
    d3.select("#corrFReset").on("click", () => {
        tableFilter = { city: "all", level: "all", text: "" };
        document.getElementById("corrFCity").value = "all";
        document.getElementById("corrFRain").value = "all";
        document.getElementById("corrFText").value = "";
        dayLimit = DAY_PAGE;
        drawDrill();
    });

    // ---------- buttons ----------
    d3.select("#corrClear").on("click", () => {
        applyBox(null, true);
        DashSync.setCondition(null, "correlation");   // also lifts the dashboard filter
    });
    // The brushed box (humidity x temperature) becomes a filter on the days every chart counts.
    d3.select("#corrPush").on("click", () => {
        if (!selection || !selection.length || !brushBox) return;
        const [[x0, y0], [x1, y1]] = brushBox;
        DashSync.setCondition({ humidity: [x.invert(x0), x.invert(x1)], temp: [y.invert(y1), y.invert(y0)] }, "correlation");
    });
    // Optional: also zoom the time window to the first and last selected day.
    d3.select("#corrZoom").on("click", () => {
        if (!selection || !selection.length) return;
        DashSync.setRange(d3.extent(selection, d => d.date), "correlation");
    });

    // ---------- update cycle ----------
    let pending = false;
    function scheduleUpdate() {
        // Several brush events can arrive per frame; draw once.
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; update(); });
    }

    function update() {
        drawScatter();
        syncBoxInputs();
        updateLinked();
        // A selection that no longer exists (or a drilled month that has no days) goes back to the month list.
        if (drill.key !== null && !(selection || data).some(d => groupId(d) === drill.key)) drill.key = null;
        drawDrill();
    }

    function refresh() {
        if (!DashSync.ready) return;
        tree = null;
        loadData();
        drill.key = null;
        update();
    }

    // The data set follows the dashboard: time window, season and cities.
    DashSync.on(refresh);
    refresh();
}

document.addEventListener("weatherDataLoaded", drawCorrelation);