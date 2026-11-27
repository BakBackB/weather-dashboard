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
                <div class="corr-actions">
                    <span id="corrSelectionText" class="corr-selection-text"></span>
                    <button id="corrPush" class="corr-btn" type="button" disabled>Push selection to dashboard</button>
                    <button id="corrClear" class="corr-btn" type="button" disabled>Clear selection</button>
                </div>
            </article>

            <article class="card corr-linked-card">
                <header class="card-head">
                    <h3>Linked views</h3>
                    <p>Coloured bars: selected days · grey bars: all days in the current dashboard filter.</p>
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
                    <p>Summary of the selected days (all filtered days when nothing is selected). Click a row to list its days.</p>
                </header>
                <div class="corr-drill-bar">
                    <nav id="corrPath" class="corr-path" aria-label="Drill-down path"></nav>
                    <div class="corr-segment" role="group" aria-label="Group months by">
                        <button type="button" data-group="calendar" class="active">Calendar month</button>
                        <button type="button" data-group="yearmonth">Year and month</button>
                    </div>
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
    let drill = { group: "calendar", key: null };

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
    plot.append("g").attr("class", "axis").attr("transform", `translate(0,${plotH})`).call(d3.axisBottom(x).ticks(9));
    plot.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(7));
    plot.append("text").attr("class", "corr-axis-label").attr("x", plotW / 2).attr("y", plotH + 40)
        .attr("text-anchor", "middle").text("Daily mean relative humidity (%)");
    plot.append("text").attr("class", "corr-axis-label").attr("transform", "rotate(-90)")
        .attr("x", -plotH / 2).attr("y", -42).attr("text-anchor", "middle").text("Daily mean temperature (°C)");

    const brush = d3.brush().extent([[0, 0], [plotW, plotH]])
        .on("brush end", event => {
            // Moves made by the code (brush.move(null) after a data change) are not user selections.
            if (!event.sourceEvent) return;
            if (!event.selection) selection = null;
            else {
                const [[x0, y0], [x1, y1]] = event.selection;
                selection = data.filter(d => d.px >= x0 && d.px <= x1 && d.py >= y0 && d.py <= y1);
            }
            scheduleUpdate();
        });
    const brushGroup = plot.append("g").attr("class", "corr-brush").call(brush);

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
        data = DashSync.rows(true)
            .filter(d => [d.humidity, d.tempMean, d.precipitation, d.sunshineHours].every(Number.isFinite))
            .map(d => Object.assign(Object.create(d), { px: x(d.humidity), py: y(d.tempMean), level: rainLevel(d.precipitation) }));
        // Prototype-based copies keep the original row fields without copying 12k objects' data.
        selection = null;
        brushGroup.call(brush.move, null);
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

    // ---------- linked views ----------
    // Generic histogram: grey bars = all filtered days, coloured bars = selected days.
    function drawHistogram(container, title, bins, valueOf, color, axisLabel, tickLabel, selectedRows) {
        const width = 440, height = 150, m = { top: 22, right: 8, bottom: 42, left: 38 };
        const w = width - m.left - m.right, h = height - m.top - m.bottom;
        const host = d3.select(container);
        host.selectAll("*").remove();
        const g = host.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
            .attr("aria-label", title).append("g").attr("transform", `translate(${m.left},${m.top})`);
        const count = rows => bins.map(b => rows.filter(d => b.test(valueOf(d))).length);
        const all = count(data);
        const chosen = selection ? count(selectedRows) : all;
        const xb = d3.scaleBand().domain(d3.range(bins.length)).range([0, w]).padding(0.12);
        const yMax = d3.max(all) || 1;
        const yb = d3.scaleLinear().domain([0, yMax]).nice().range([h, 0]);
        g.append("text").attr("class", "corr-hist-title").attr("x", -m.left + 4).attr("y", -9).text(title);
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
            .append("title").text((d, i) => `${tickLabel(bins[i])}: ${fmt0(d)} of ${fmt0(all[i])} days`);
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
            "Daily mean temperature (°C)", b => b.lo, selection);
        const sunBins = numericBins(0, 14, 1).map((b, i, l) => (i === l.length - 1 ? { ...b, test: v => v >= b.lo } : b));
        drawHistogram("#corrHistSun", "Sunshine (hours per day)", sunBins, d => d.sunshineHours, "#ca8a04",
            "Sunshine duration (h)", b => b.lo, selection);
        const rainBins = RAIN_LEVELS.map((level, i) => ({ label: level.label, test: v => rainLevel(v) === i }));
        drawHistogram("#corrHistRain", "Rainfall (days per level)", rainBins, d => d.precipitation,
            i => RAIN_LEVELS[i].color, "Daily rainfall level", b => b.label.replace(" (dry)", "").replace(" mm", ""), selection);
        drawCityBars(rows);
        drawStats(rows);
    }

    function drawCityBars(rows) {
        const width = 440, height = 112, m = { top: 22, right: 54, bottom: 8, left: 64 };
        const w = width - m.left - m.right, h = height - m.top - m.bottom;
        const host = d3.select("#corrCityBars");
        host.selectAll("*").remove();
        const g = host.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
            .attr("aria-label", "Selected days per city").append("g").attr("transform", `translate(${m.left},${m.top})`);
        const cities = DASH_CITIES.filter(c => DashSync.hasCity(c));
        const totals = new Map(cities.map(c => [c, data.filter(d => d.city === c).length]));
        const chosen = new Map(cities.map(c => [c, rows.filter(d => d.city === c).length]));
        const yb = d3.scaleBand().domain(cities).range([0, h]).padding(0.25);
        const xb = d3.scaleLinear().domain([0, d3.max([...totals.values()]) || 1]).range([0, w]);
        g.append("text").attr("class", "corr-hist-title").attr("x", -m.left + 4).attr("y", -9).text("Days per city");
        g.selectAll(".corr-bar-all").data(cities).join("rect").attr("class", "corr-bar-all")
            .attr("y", c => yb(c)).attr("height", yb.bandwidth()).attr("width", c => xb(totals.get(c))).attr("fill", "#e2e8f0");
        g.selectAll(".corr-bar-sel").data(cities).join("rect").attr("class", "corr-bar-sel")
            .attr("y", c => yb(c)).attr("height", yb.bandwidth()).attr("width", c => xb(chosen.get(c))).attr("fill", c => CITY_COLORS[c]);
        g.selectAll(".corr-city-name").data(cities).join("text").attr("class", "corr-city-name")
            .attr("x", -6).attr("y", c => yb(c) + yb.bandwidth() / 2).attr("dy", "0.35em").attr("text-anchor", "end")
            .text(c => CITY_SHORT[c]);
        g.selectAll(".corr-city-count").data(cities).join("text").attr("class", "corr-city-count")
            .attr("x", c => xb(totals.get(c)) + 5).attr("y", c => yb(c) + yb.bandwidth() / 2).attr("dy", "0.35em")
            .text(c => fmt0(chosen.get(c)));
    }

    function drawStats(rows) {
        const stats = [
            ["Days", fmt0(rows.length), ""],
            ["Mean temperature", rows.length ? fmt1(d3.mean(rows, d => d.tempMean)) : "–", "°C"],
            ["Mean humidity", rows.length ? fmt0(d3.mean(rows, d => d.humidity)) : "–", "%"],
            ["Total rainfall", fmt0(d3.sum(rows, d => d.precipitation)), "mm"]
        ];
        d3.select("#corrStats").selectAll("div").data(stats).join("div").attr("class", "corr-stat")
            .html(d => `<dt>${d[0]}</dt><dd>${d[1]}<small>${d[2]}</small></dd>`);
        const text = selection
            ? `${fmt0(selection.length)} of ${fmt0(data.length)} days selected`
            : "No selection: drag a rectangle on the scatter plot";
        d3.select("#corrSelectionText").text(text);
        d3.select("#corrPush").property("disabled", !selection || !selection.length);
        d3.select("#corrClear").property("disabled", !selection);
    }

    // ---------- drill-down ----------
    function groupKey(d) {
        return drill.group === "calendar" ? d.date.getMonth() : `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, "0")}`;
    }

    function keyLabel(key) {
        if (drill.group === "calendar") return MONTHS[key];
        const [year, month] = String(key).split("-");
        return `${MONTHS[+month - 1]} ${year}`;
    }

    function drawDrill() {
        const rows = selection || data;
        const host = d3.select("#corrDrill");
        const path = d3.select("#corrPath");
        host.selectAll("*").remove();
        path.selectAll("*").remove();
        d3.selectAll(".corr-segment button").classed("active", function() { return this.dataset.group === drill.group; });

        const scope = selection ? "Selected days" : "All filtered days";
        if (drill.key === null) {
            path.append("span").attr("class", "corr-path-current").text(`${scope} · by month`);
            drawMonthTable(host, rows);
        } else {
            path.append("button").attr("type", "button").attr("class", "corr-path-step").text("← " + scope + " · by month")
                .on("click", () => { drill.key = null; drawDrill(); });
            path.append("span").attr("class", "corr-path-sep").text("›");
            path.append("span").attr("class", "corr-path-current").text(keyLabel(drill.key));
            drawDayTable(host, rows.filter(d => groupKey(d) === drill.key));
        }
    }

    function drawMonthTable(host, rows) {
        const groups = d3.groups(rows, groupKey).sort((a, b) => d3.ascending(a[0], b[0]));
        if (!groups.length) { host.append("p").attr("class", "corr-empty").text("No days in the current selection."); return; }
        const maxRain = d3.max(groups, ([, v]) => d3.sum(v, d => d.precipitation)) || 1;
        const table = host.append("table").attr("class", "corr-table");
        table.append("thead").append("tr").selectAll("th")
            .data(["Month", "Days", "Mean temp (°C)", "Mean humidity (%)", "Total rain (mm)", ""]).join("th").text(d => d);
        const tr = table.append("tbody").selectAll("tr").data(groups).join("tr")
            .attr("class", "corr-row-click").attr("tabindex", 0)
            .attr("aria-label", ([key]) => `${keyLabel(key)}: show daily records`)
            .on("click", (event, [key]) => { drill.key = key; drawDrill(); })
            .on("keydown", (event, [key]) => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); drill.key = key; drawDrill(); }
            });
        tr.append("td").text(([key]) => keyLabel(key));
        tr.append("td").text(([, v]) => fmt0(v.length));
        tr.append("td").text(([, v]) => fmt1(d3.mean(v, d => d.tempMean)));
        tr.append("td").text(([, v]) => fmt0(d3.mean(v, d => d.humidity)));
        tr.append("td").text(([, v]) => fmt0(d3.sum(v, d => d.precipitation)));
        tr.append("td").attr("class", "corr-bar-cell").append("div").attr("class", "corr-inline-bar")
            .style("width", ([, v]) => `${Math.max(1, d3.sum(v, d => d.precipitation) / maxRain * 100)}%`);
    }

    function drawDayTable(host, rows) {
        const CAP = 40;
        const sorted = [...rows].sort((a, b) => a.date - b.date || d3.ascending(a.city, b.city));
        host.append("p").attr("class", "corr-note").text(sorted.length > CAP
            ? `Showing the first ${CAP} of ${fmt0(sorted.length)} days (sorted by date).`
            : `${fmt0(sorted.length)} days.`);
        const wrap = host.append("div").attr("class", "corr-day-wrap");
        const table = wrap.append("table").attr("class", "corr-table corr-day-table");
        table.append("thead").append("tr").selectAll("th")
            .data(["Date", "City", "Temp (°C)", "Humidity (%)", "Rain (mm)", "Sunshine (h)"]).join("th").text(d => d);
        const tr = table.append("tbody").selectAll("tr").data(sorted.slice(0, CAP)).join("tr");
        tr.append("td").text(d => fmtDate(d.date));
        tr.append("td").html(d => `<span class="corr-dot" style="background:${CITY_COLORS[d.city]}"></span>${CITY_SHORT[d.city]}`);
        tr.append("td").text(d => fmt1(d.tempMean));
        tr.append("td").text(d => fmt0(d.humidity));
        tr.append("td").text(d => fmt1(d.precipitation));
        tr.append("td").text(d => fmt1(d.sunshineHours));
    }

    d3.selectAll(".corr-segment button").on("click", function() {
        drill = { group: this.dataset.group, key: null };
        drawDrill();
    });

    // ---------- buttons ----------
    d3.select("#corrClear").on("click", () => {
        selection = null;
        brushGroup.call(brush.move, null);
        update();
    });
    d3.select("#corrPush").on("click", () => {
        if (!selection || !selection.length) return;
        const dates = d3.extent(selection, d => d.date);
        DashSync.setRange(dates, "correlation");
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
        updateLinked();
        // A selection that no longer exists (or a drilled month that has no days) goes back to the month list.
        if (drill.key !== null && !(selection || data).some(d => groupKey(d) === drill.key)) drill.key = null;
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
