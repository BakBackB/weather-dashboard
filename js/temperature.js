// Temperature charts (RQ1): shared helpers and the temperature–sunshine chart.
// The Key Insights charts are in temperatureInsights.js.

const TEMP_CITIES = ["Hanoi", "Da Nang", "Ho Chi Minh City"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Season filter: calendar quarters, so no season crosses a year boundary.
const TEMP_QUARTERS = [
    { label: "All Year", months: d3.range(12) },
    { label: "Q1 · Jan–Mar", months: [0, 1, 2] },
    { label: "Q2 · Apr–Jun", months: [3, 4, 5] },
    { label: "Q3 · Jul–Sep", months: [6, 7, 8] },
    { label: "Q4 · Oct–Dec", months: [9, 10, 11] }
];

// --- Shared helpers (also used by temperatureInsights.js) ---

function cityColorScale() {
    const rootStyles = getComputedStyle(document.documentElement);
    return d3.scaleOrdinal()
        .domain(TEMP_CITIES)
        .range([
            rootStyles.getPropertyValue("--color-hanoi").trim(),
            rootStyles.getPropertyValue("--color-danang").trim(),
            rootStyles.getPropertyValue("--color-hcm").trim()
        ]);
}

function createTooltip() {
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);

    return {
        show(event, html) {
            tooltip.style("opacity", 0.9)
                .html(html)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        },
        hide() {
            tooltip.style("opacity", 0);
        }
    };
}

// Creates (or recreates) an 850px wide SVG and returns the inner group and its size.
// Length of the transitions when a filter changes; none if the user prefers reduced motion.
const TEMP_DURATION = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450;

function createSvg(container, height, margin) {
    d3.select(container).selectAll("*").remove();
    const svg = d3.select(container).append("svg")
        .attr("width", 850)
        .attr("height", height)
        .attr("viewBox", `0 0 850 ${height}`)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    return { svg, width: 850 - margin.left - margin.right, height: height - margin.top - margin.bottom };
}

function addGrid(svg, y, width) {
    svg.append("g").selectAll("line")
        .data(y.ticks(6)).join("line")
        .attr("x1", 0).attr("x2", width)
        .attr("y1", d => y(d)).attr("y2", d => y(d))
        .attr("stroke", "#e2e8f0")
        .attr("stroke-dasharray", "4,4");
}

function addAxisLabel(svg, text, x, y, rotate = false) {
    svg.append("text")
        .attr("transform", rotate ? "rotate(-90)" : null)
        .attr("x", x).attr("y", y)
        .attr("text-anchor", "middle")
        .attr("fill", "#64748b").attr("font-size", "12px")
        .text(text);
}

// --- Year and season filter shared by all temperature charts (the city checkboxes work separately) ---
const temperatureFilters = { year: null, quarter: TEMP_QUARTERS[0] };
let temperatureFiltersReady = false;

// Builds the year select and season buttons once; every chart calls this before drawing.
function initTemperatureFilters() {
    if (temperatureFiltersReady) return;
    temperatureFiltersReady = true;

    const years = Array.from(new Set(rawParsedWeather.map(d => d.date.getFullYear()))).sort(d3.ascending);
    const yearSelect = document.getElementById("temperatureYear");
    d3.select(yearSelect).selectAll("option")
        .data([null, ...years]).join("option")
        .attr("value", d => d ?? "")
        .text(d => d ?? "All years");
    yearSelect.addEventListener("change", () => {
        setTemperatureFilters({ year: yearSelect.value === "" ? null : +yearSelect.value });
    });

    d3.select("#temperatureSeasonFilter")
        .selectAll("button")
        .data(TEMP_QUARTERS).join("button")
        .attr("class", "temperature-season")
        .text(d => d.label)
        .on("click", (event, quarter) => setTemperatureFilters({ quarter }));

    syncTemperatureFilters();
}

function syncTemperatureFilters() {
    document.getElementById("temperatureYear").value = temperatureFilters.year ?? "";
    d3.selectAll("#temperatureSeasonFilter button")
        .classed("active", d => d === temperatureFilters.quarter)
        .attr("aria-pressed", d => d === temperatureFilters.quarter);
}

// Changes the filters and tells every chart to redraw.
function setTemperatureFilters(changes) {
    Object.assign(temperatureFilters, changes);
    syncTemperatureFilters();
    document.dispatchEvent(new Event("temperatureFiltersChanged"));
}

// Shows only the cities checked in the city filter, in every temperature chart.
function applyTemperatureCityFilter() {
    const checked = Array.from(document.querySelectorAll("#cityFilters input:checked")).map(cb => cb.value);
    d3.selectAll("#temperature .temp-city")
        .style("display", function() { return checked.includes(this.dataset.city) ? null : "none"; });
}

// Pearson correlation of two accessors over a list of rows.
function correlation(rows, xValue, yValue) {
    const mx = d3.mean(rows, xValue);
    const my = d3.mean(rows, yValue);
    const sxy = d3.sum(rows, d => (xValue(d) - mx) * (yValue(d) - my));
    const sxx = d3.sum(rows, d => (xValue(d) - mx) ** 2);
    const syy = d3.sum(rows, d => (yValue(d) - my) ** 2);
    return sxy / Math.sqrt(sxx * syy);
}

// Mean temperature per city and month, and its anomaly from the 10-year average of that month.
function monthlyAnomalies() {
    const cells = d3.rollups(
        rawParsedWeather,
        v => d3.mean(v, d => d.tempMean),
        d => d.city,
        d => d.date.getFullYear(),
        d => d.date.getMonth()
    ).flatMap(([city, years]) => years.flatMap(([year, months]) =>
        months.map(([month, mean]) => ({ city, year, month, mean, date: new Date(year, month, 1) }))));

    const average = d3.rollup(cells, v => d3.mean(v, d => d.mean), d => d.city, d => d.month);
    cells.forEach(d => d.anomaly = d.mean - average.get(d.city).get(d.month));

    return cells.sort((a, b) => a.date - b.date);
}

// --- Temperature and sunshine: dual-axis chart, one panel per city ---
// Bars: sunshine (left axis). Line: mean temperature (right axis).

function drawTemperatureComparison() {
    const tooltip = createTooltip();
    const color = cityColorScale();
    const format = v => v.toFixed(1);
    const monthName = m => d3.timeFormat("%B")(new Date(2000, m, 1));

    const years = Array.from(new Set(rawParsedWeather.map(d => d.date.getFullYear()))).sort(d3.ascending);
    // Year and season come from the shared filter (temperatureFilters); the view is this chart's own.
    const state = { view: "month", selected: null };
    const filters = temperatureFilters;

    const viewSelect = document.getElementById("comparisonView");
    const detail = d3.select("#temperature-comparison-detail");
    initTemperatureFilters();

    // Mean temperature and sunshine per city and month (or year), for the selected season and year.
    function getPoints() {
        const inSeason = d => filters.quarter.months.includes(d.date.getMonth());
        const inYear = d => state.view === "year" || filters.year === null || d.date.getFullYear() === filters.year;
        const keyOf = state.view === "year" ? d => d.date.getFullYear() : d => d.date.getMonth();
        return d3.rollups(rawParsedWeather.filter(d => inSeason(d) && inYear(d)),
            v => ({ temp: d3.mean(v, d => d.tempMean), sunshine: d3.mean(v, d => d.sunshineHours) }),
            d => d.city, keyOf)
            .flatMap(([city, points]) => points.map(([key, values]) => ({ city, key, ...values })))
            .sort((a, b) => a.key - b.key);
    }

    function keyLabel(key) {
        if (state.view === "year") {
            return filters.quarter.months.length < 12 ? `${key} (${filters.quarter.label})` : `${key}`;
        }
        return `${monthName(key)} ${filters.year === null ? "(10-year average)" : filters.year}`;
    }

    // Pearson correlation between temperature and sunshine.
    const pearson = values => correlation(values, d => d.temp, d => d.sunshine);

    function showDetail(points) {
        detail.selectAll("*").remove();
        if (state.selected === null) return;

        detail.append("p").append("strong").text(keyLabel(state.selected));
        const table = detail.append("table").attr("class", "temperature-detail-table");
        table.append("tr").selectAll("th")
            .data(["City", "Mean temperature", "Sunshine"]).join("th")
            .text(d => d);
        table.selectAll(".temp-detail-row")
            .data(points.filter(d => d.key === state.selected)).join("tr")
            .attr("class", "temp-detail-row")
            .selectAll("td")
            .data(d => [d.city, `${format(d.temp)}°C`, `${format(d.sunshine)} h/day`])
            .join("td")
            .text(d => d);
    }

    // A new year or season updates the existing chart with a transition (bars grow, line moves);
    // a new view or new cities draw it new.
    function render() {
        viewSelect.value = state.view;

        const points = getPoints();
        showDetail(points);

        const cities = TEMP_CITIES.filter(city => document.querySelector(`#cityFilters input[value="${city}"]`).checked);
        const keys = state.view === "year" ? years : filters.quarter.months;

        const margin = { top: 30, right: 60, bottom: 36, left: 60 };
        const width = 850 - margin.left - margin.right;
        const height = 400 - margin.top - margin.bottom;
        const structure = `${state.view}|${cities.join(",")}`;
        let svg = d3.select("#temperature-comparison-chart").select(".temp-cmp-plot");
        const animate = !svg.empty() && svg.attr("data-structure") === structure;
        const sameKeys = animate && svg.attr("data-keys") === keys.join(",");
        if (!animate) svg = buildChart(cities, margin, width, height).attr("data-structure", structure);
        svg.attr("data-keys", keys.join(","));
        const move = selection => animate ? selection.transition().duration(TEMP_DURATION) : selection;

        const panel = d3.scaleBand().domain(cities).range([0, width]).paddingInner(0.08);
        const x = d3.scaleBand().domain(keys).range([0, panel.bandwidth()]).padding(0.25);
        // Dual axis: sunshine bars on the left axis, temperature line on the right axis.
        // Bars encode length, so the left axis starts at 0. Temperature is interval data, so its axis fits the data.
        // Both scales are shared by all panels and are not tuned to make the line and the bars overlap.
        const yBars = d3.scaleLinear().domain([0, d3.max(points, d => d.sunshine)]).nice().range([height, 0]);
        const yTemp = d3.scaleLinear().domain(d3.extent(points, d => d.temp)).nice().range([height, 0]);
        const columnX = key => x(key) - (x.step() - x.bandwidth()) / 2;  // column centred on a bar
        const tickFormat = state.view === "year" ? (d => `'${String(d).slice(2)}`)
            : keys.length < 12 ? (m => MONTH_LABELS[m]) : (m => MONTH_LABELS[m][0]);

        const grid = svg.select(".temp-cmp-grid").selectAll("line")
            .data(yBars.ticks(6), d => d)
            .join(enter => enter.append("line")
                .attr("x1", 0).attr("x2", width)
                .attr("y1", d => yBars(d)).attr("y2", d => yBars(d))
                .attr("stroke", "#e2e8f0")
                .attr("stroke-dasharray", "4,4"));
        move(grid).attr("y1", d => yBars(d)).attr("y2", d => yBars(d));
        move(svg.select(".temp-cmp-left-axis")).call(d3.axisLeft(yBars).ticks(6));
        move(svg.select(".temp-cmp-right-axis")).call(d3.axisRight(yTemp).ticks(6));

        const panels = svg.selectAll(".temp-city")
            .data(cities.map(city => ({ city, values: points.filter(d => d.city === city) })), d => d.city);

        // Panel title with the correlation between temperature and sunshine.
        panels.select(".temp-cmp-title")
            .text(d => d.values.length > 2 ? `${d.city} (r = ${pearson(d.values).toFixed(2)})` : d.city);
        move(panels.select(".temp-cmp-x-axis")).call(d3.axisBottom(x).tickFormat(tickFormat));

        // Column behind the hovered / selected month, in every panel.
        const hoverColumn = panels.select(".temp-cmp-hover-column").attr("width", x.step());
        panels.select(".temp-cmp-selected-column")
            .attr("width", x.step())
            .attr("x", state.selected === null || !keys.includes(state.selected) ? 0 : columnX(state.selected))
            .style("display", state.selected === null || !keys.includes(state.selected) ? "none" : null);

        // Bars are matched by month (or year): new ones grow from the axis, removed ones shrink.
        const bars = panels.select(".temp-cmp-bars").selectAll("rect")
            .data(d => d.values, d => d.key)
            .join(
                enter => enter.append("rect")
                    .attr("x", d => x(d.key)).attr("width", x.bandwidth())
                    .attr("y", height).attr("height", 0)
                    .attr("fill", d => color(d.city))
                    .attr("fill-opacity", 0.45),
                update => update,
                exit => animate
                    ? exit.transition().duration(TEMP_DURATION).attr("y", height).attr("height", 0).remove()
                    : exit.remove());
        move(bars)
            .attr("x", d => x(d.key))
            .attr("width", x.bandwidth())
            .attr("y", d => yBars(d.sunshine))
            .attr("height", d => height - yBars(d.sunshine));

        // The line moves when the months stay the same; with other months it fades in.
        const line = d3.line().x(d => x(d.key) + x.bandwidth() / 2).y(d => yTemp(d.temp)).curve(d3.curveMonotoneX);
        const path = panels.select(".temp-cmp-line");
        if (sameKeys) move(path).attr("d", d => line(d.values));
        else {
            path.attr("d", d => line(d.values)).attr("opacity", animate ? 0 : 1);
            move(path).attr("opacity", 1);
        }
        const dots = panels.select(".temp-cmp-dots").selectAll("circle")
            .data(d => d.values, d => d.key)
            .join(enter => enter.append("circle")
                .attr("cx", d => x(d.key) + x.bandwidth() / 2)
                .attr("cy", d => yTemp(d.temp))
                .attr("r", animate ? 0 : 3.5)
                .attr("fill", d => color(d.city)));
        move(dots)
            .attr("cx", d => x(d.key) + x.bandwidth() / 2)
            .attr("cy", d => yTemp(d.temp))
            .attr("r", 3.5);

        // Invisible column per month (or year) for hovering and clicking.
        panels.select(".temp-cmp-hover").selectAll("rect")
            .data(d => d.values, d => d.key)
            .join("rect")
            .attr("x", d => columnX(d.key))
            .attr("width", x.step())
            .attr("height", height)
            .attr("fill", "transparent")
            .style("cursor", "pointer")
            .on("mouseover", (event, d) => {
                hoverColumn.style("display", null).attr("x", columnX(d.key));
                tooltip.show(event, `<strong>${keyLabel(d.key)}</strong><br/>` +
                    points.filter(p => p.key === d.key && cities.includes(p.city))
                        .map(p => `${p.city}: ${format(p.temp)}°C · ${format(p.sunshine)} h sunshine`).join("<br/>") +
                    `<br/><em>${state.view === "year" ? "Click to see its months" : "Click for the exact values"}</em>`);
            })
            .on("mouseout", () => {
                hoverColumn.style("display", "none");
                tooltip.hide();
            })
            .on("click", (event, d) => {
                tooltip.hide();
                if (state.view === "year") {
                    // Clicking a year sets the shared year filter, so every chart shows that year.
                    state.view = "month";
                    state.selected = null;
                    setTemperatureFilters({ year: d.key });
                } else {
                    state.selected = d.key;
                    render();
                }
            });
    }

    // The parts of the chart that only change with the view or the checked cities.
    function buildChart(cities, margin, width, height) {
        const { svg } = createSvg("#temperature-comparison-chart", 400, margin);
        svg.classed("temp-cmp-plot", true);
        const panel = d3.scaleBand().domain(cities).range([0, width]).paddingInner(0.08);

        svg.append("g").attr("class", "temp-cmp-grid");
        svg.append("g").attr("class", "axis temp-cmp-left-axis");
        svg.append("g").attr("class", "axis temp-cmp-right-axis")
            .attr("transform", `translate(${width},0)`);
        addAxisLabel(svg, "Sunshine (h/day) · bars", -height / 2, -45, true);
        svg.append("text")
            .attr("transform", "rotate(90)")
            .attr("x", height / 2).attr("y", -width - 45)
            .attr("text-anchor", "middle")
            .attr("fill", "#64748b").attr("font-size", "12px")
            .text("Mean Temperature (°C) · line");

        const panels = svg.selectAll(".temp-city")
            .data(cities.map(city => ({ city })), d => d.city).join("g")
            .attr("class", "temp-city")
            .attr("data-city", d => d.city)
            .attr("transform", d => `translate(${panel(d.city)},0)`);
        panels.append("text")
            .attr("class", "temp-cmp-title")
            .attr("x", panel.bandwidth() / 2).attr("y", -14)
            .attr("text-anchor", "middle")
            .attr("fill", d => color(d.city))
            .attr("font-size", "13px").attr("font-weight", 600);
        panels.append("g").attr("class", "axis temp-cmp-x-axis")
            .attr("transform", `translate(0,${height})`);
        panels.append("rect").attr("class", "temp-cmp-hover-column")
            .attr("height", height)
            .attr("fill", "#f1f5f9")
            .style("display", "none");
        panels.append("rect").attr("class", "temp-cmp-selected-column")
            .attr("height", height)
            .attr("fill", "#e2e8f0");
        panels.append("g").attr("class", "temp-cmp-bars");
        panels.append("path").attr("class", "line temp-cmp-line")
            .attr("stroke", d => color(d.city));
        panels.append("g").attr("class", "temp-cmp-dots");
        panels.append("g").attr("class", "temp-cmp-hover");
        return svg;
    }

    viewSelect.addEventListener("change", () => {
        state.view = viewSelect.value;
        state.selected = null;
        render();
    });
    document.addEventListener("temperatureFiltersChanged", () => {
        state.selected = null;
        render();
    });

    document.querySelectorAll("#cityFilters input").forEach(checkbox => {
        checkbox.addEventListener("change", () => {
            applyTemperatureCityFilter();
            render();
        });
    });

    render();
}
