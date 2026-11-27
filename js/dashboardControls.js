// Global filter bar of dashboard.html: year chips, season chips, city chips and a timeline you can brush.
// Everything here reads and writes the shared state in js/dashboardSync.js, so the bar always shows the
// same time window, season and cities as the charts, whichever chart changed them.

const CONTROLS_SOURCE = "controls";
const CONTROLS_CITY_COLORS = { "Hanoi": "#0284C7", "Da Nang": "#D97706", "Ho Chi Minh City": "#D93856" };

// ---------- cities: the chips and the checkboxes of every panel stay in step ----------
let citySyncBusy = false;

// Push the shared city set into every city checkbox (they redraw their own charts on "change").
function applyCitiesToPanels() {
    citySyncBusy = true;
    document.querySelectorAll(".city-filters input[type='checkbox']").forEach(box => {
        const wanted = DashSync.hasCity(box.value);
        if (box.checked !== wanted) {
            box.checked = wanted;
            box.dispatchEvent(new Event("change", { bubbles: true }));
        }
    });
    citySyncBusy = false;
}

// A checkbox changed inside one panel: make it the shared state (and so the other panels' state).
document.addEventListener("change", event => {
    const box = event.target;
    if (citySyncBusy || !DashSync.ready || !box.matches || !box.matches(".city-filters input[type='checkbox']")) return;
    DashSync.toggleCity(box.value, box.checked, "panel-city");
});

DashSync.on(detail => {
    if (detail.keys.includes("cities") && detail.source !== "init") applyCitiesToPanels();
}, ["cities"]);

// ---------- the bar ----------
function buildGlobalControls() {
    const root = document.getElementById("controls");
    if (!root) return;

    const [firstYear, lastYear] = DashSync.fullYears();
    const years = d3.range(firstYear, lastYear + 1);

    // Year chips: "All" and one chip per year. Shift-click extends the window to that year.
    const yearHost = d3.select("#gcYears");
    yearHost.selectAll("button").data([null, ...years]).join("button")
        .attr("type", "button").attr("class", "chip")
        .text(year => year === null ? "All" : `'${String(year).slice(2)}`)
        .attr("title", year => year === null ? "Whole period" : `Show ${year} everywhere (Shift-click to extend)`)
        .on("click", (event, year) => {
            if (year === null) return DashSync.setRange(DashSync.full(), CONTROLS_SOURCE);
            if (event.shiftKey && !DashSync.isFull()) {
                const [a, b] = DashSync.years();
                return DashSync.setYears(Math.min(a, year), Math.max(b, year), CONTROLS_SOURCE);
            }
            DashSync.setYear(year, CONTROLS_SOURCE);
        });

    d3.select("#gcSeasons").selectAll("button").data(DASH_SEASONS).join("button")
        .attr("type", "button").attr("class", "chip")
        .text(season => season.label)
        .on("click", (event, season) => DashSync.setQuarter(DASH_SEASONS.indexOf(season), CONTROLS_SOURCE));

    d3.select("#gcCities").selectAll("button").data(DASH_CITIES).join("button")
        .attr("type", "button").attr("class", "chip chip-city")
        .style("--chip-color", city => CONTROLS_CITY_COLORS[city])
        .text(city => city)
        .on("click", (event, city) => DashSync.toggleCity(city, undefined, CONTROLS_SOURCE));

    document.getElementById("gcReset").addEventListener("click", () => DashSync.reset(CONTROLS_SOURCE));
    const pill = document.getElementById("dashFilterPill");
    if (pill) pill.addEventListener("click", () => DashSync.reset(CONTROLS_SOURCE));

    const timeline = buildTimeline();
    refreshControls();
    DashSync.on(detail => {
        if (detail.source === "init") return;
        refreshControls();
        timeline.update(detail);
    });
}

// Show the shared state on the chips, in the summary line and in the header pill.
function refreshControls() {
    const [first, last] = DashSync.years();
    const wholeYears = DashSync.range()[0].getMonth() === 0 && DashSync.range()[0].getDate() === 1 &&
        DashSync.range()[1].getMonth() === 11 && DashSync.range()[1].getDate() === 31;

    d3.selectAll("#gcYears button").classed("active", year =>
        year === null ? DashSync.isFull() : (wholeYears && year >= first && year <= last && !DashSync.isFull()));
    d3.selectAll("#gcSeasons button").classed("active", season => DASH_SEASONS.indexOf(season) === DashSync.quarter());
    d3.selectAll("#gcCities button").classed("active", city => DashSync.hasCity(city));

    const cityCount = DashSync.cities().size;
    const parts = [DashSync.rangeLabel()];
    if (DashSync.quarter()) parts.push(DashSync.season().label);
    parts.push(cityCount === DASH_CITIES.length ? "all cities" : `${cityCount} of ${DASH_CITIES.length} cities`);
    const text = parts.join(" · ");

    const summary = document.getElementById("gcSummary");
    if (summary) summary.textContent = `Showing: ${text}`;
    const pill = document.getElementById("dashFilterPill");
    if (pill) {
        pill.hidden = !DashSync.isFiltered();
        pill.textContent = `${text}  ✕`;
    }
}

// ---------- timeline (overview): drag to choose the time window of the whole dashboard ----------
function buildTimeline() {
    const host = d3.select("#gcTimeline");
    host.selectAll("*").remove();

    const outerWidth = 1400;
    const margin = { top: 8, right: 24, bottom: 22, left: 96 };
    const stripHeight = 52;
    const stripGap = 14;
    const innerHeight = stripHeight * 2 + stripGap;
    const outerHeight = margin.top + innerHeight + margin.bottom;
    const width = outerWidth - margin.left - margin.right;

    // Monthly means over all days: the context the brush is made on.
    const full = DashSync.full();
    const monthly = d3.rollups(rawParsedWeather, rows => ({
        temp: d3.mean(rows, d => d.tempMean),
        rain: d3.sum(rows, d => d.precipitation)
    }), d => d.city, d => d3.timeMonth(d.date).getTime())
        .map(([city, months]) => ({
            city,
            values: months.map(([time, value]) => ({ date: new Date(+time), ...value })).sort((a, b) => a.date - b.date)
        }));

    const x = d3.scaleTime().domain([full[0], d3.timeDay.offset(full[1], 1)]).range([0, width]);
    const yTemp = d3.scaleLinear().domain(d3.extent(monthly.flatMap(c => c.values), d => d.temp)).nice().range([stripHeight, 0]);
    const yRain = d3.scaleLinear().domain([0, d3.max(monthly.flatMap(c => c.values), d => d.rain)]).nice()
        .range([stripHeight * 2 + stripGap, stripHeight + stripGap]);

    const svg = host.append("svg")
        .attr("width", outerWidth).attr("height", outerHeight)
        .attr("viewBox", `0 0 ${outerWidth} ${outerHeight}`)
        .attr("role", "img")
        .attr("aria-label", "Timeline of monthly mean temperature and monthly rainfall; drag to choose the time window of every chart");
    const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Season bands: the months of the selected season, shaded on both strips.
    const bands = plot.append("g").attr("class", "gc-season-bands");

    [[0, "Temp (°C)"], [stripHeight + stripGap, "Rain (mm)"]].forEach(([top, label]) => {
        plot.append("rect").attr("y", top).attr("width", width).attr("height", stripHeight).attr("fill", "#f8fafc");
        plot.append("text").attr("x", -8).attr("y", top + stripHeight / 2).attr("dy", "0.35em")
            .attr("text-anchor", "end").attr("font-size", 10).attr("fill", "#64748b").text(label);
    });

    const tempLine = d3.line().x(d => x(d.date)).y(d => yTemp(d.temp));
    const rainLine = d3.line().x(d => x(d.date)).y(d => yRain(d.rain));
    const lines = plot.append("g");
    monthly.forEach(city => {
        const color = CONTROLS_CITY_COLORS[city.city];
        lines.append("path").datum(city.values).attr("class", "gc-line").attr("data-city", city.city)
            .attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.4).attr("d", tempLine);
        lines.append("path").datum(city.values).attr("class", "gc-line").attr("data-city", city.city)
            .attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.2).attr("opacity", 0.85).attr("d", rainLine);
    });

    plot.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")));

    const brush = d3.brushX()
        .extent([[0, 0], [width, innerHeight]])
        .on("brush end", event => {
            if (!event.sourceEvent) return;               // moved by code: nothing to send
            if (!event.selection) {
                if (event.type === "end") DashSync.setRange(DashSync.full(), CONTROLS_SOURCE);
                return;
            }
            const [from, to] = event.selection.map(x.invert).map(d3.timeMonth.round);
            if (event.type === "brush") {
                d3.select("#gcSummary").text(`Selecting: ${d3.timeFormat("%b %Y")(from)} – ${d3.timeFormat("%b %Y")(d3.timeMonth.offset(to, -1))}`);
                return;
            }
            const end = +to > +from ? to : d3.timeMonth.offset(from, 1);
            DashSync.setRange([from, d3.timeDay.offset(end, -1)], CONTROLS_SOURCE);
            // Snap the brush to whole months.
            brushGroup.call(brush.move, [x(from), x(end)]);
        });
    const brushGroup = plot.append("g").attr("class", "extreme-brush").call(brush);

    function drawBands() {
        const months = DashSync.season().months;
        const monthStarts = x.ticks(d3.timeMonth.every(1)).concat([]).filter(d => months.includes(d.getMonth()));
        bands.selectAll("rect").data(DashSync.quarter() ? monthStarts : []).join("rect")
            .attr("x", d => x(d)).attr("width", d => x(d3.timeMonth.offset(d, 1)) - x(d))
            .attr("y", 0).attr("height", innerHeight)
            .attr("fill", "#0284C7").attr("opacity", 0.1);
    }

    function showRange() {
        const [a, b] = DashSync.range();
        brushGroup.call(brush.move, DashSync.isFull() ? null : [x(a), x(d3.timeDay.offset(b, 1))]);
    }

    function update(detail) {
        if (detail.keys.includes("cities")) {
            lines.selectAll(".gc-line").attr("display", function() { return DashSync.hasCity(this.dataset.city) ? null : "none"; });
        }
        if (detail.keys.includes("quarter")) drawBands();
        if (detail.keys.includes("range") && detail.source !== CONTROLS_SOURCE) showRange();
    }

    drawBands();
    showRange();
    return { update };
}

document.addEventListener("weatherDataLoaded", buildGlobalControls);
