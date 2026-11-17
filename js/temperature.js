// Temperature charts (RQ1): shared helpers, the temperature–sunshine chart and the humidity–daily range chart.
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

    function render() {
        viewSelect.value = state.view;

        const points = getPoints();
        showDetail(points);

        const cities = TEMP_CITIES.filter(city => document.querySelector(`#cityFilters input[value="${city}"]`).checked);
        const keys = state.view === "year" ? years : filters.quarter.months;

        const margin = { top: 30, right: 60, bottom: 36, left: 60 };
        const { svg, width, height } = createSvg("#temperature-comparison-chart", 400, margin);

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

        addGrid(svg, yBars, width);
        svg.append("g").attr("class", "axis").call(d3.axisLeft(yBars).ticks(6));
        svg.append("g").attr("class", "axis")
            .attr("transform", `translate(${width},0)`)
            .call(d3.axisRight(yTemp).ticks(6));
        addAxisLabel(svg, "Sunshine (h/day) · bars", -height / 2, -45, true);
        svg.append("text")
            .attr("transform", "rotate(90)")
            .attr("x", height / 2).attr("y", -width - 45)
            .attr("text-anchor", "middle")
            .attr("fill", "#64748b").attr("font-size", "12px")
            .text("Mean Temperature (°C) · line");

        const panels = svg.selectAll(".temp-city")
            .data(cities.map(city => ({ city, values: points.filter(d => d.city === city) }))).join("g")
            .attr("class", "temp-city")
            .attr("data-city", d => d.city)
            .attr("transform", d => `translate(${panel(d.city)},0)`);

        // Panel title with the correlation between temperature and sunshine.
        panels.append("text")
            .attr("x", panel.bandwidth() / 2).attr("y", -14)
            .attr("text-anchor", "middle")
            .attr("fill", d => color(d.city))
            .attr("font-size", "13px").attr("font-weight", 600)
            .text(d => d.values.length > 2 ? `${d.city} (r = ${pearson(d.values).toFixed(2)})` : d.city);

        panels.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).tickFormat(tickFormat));

        // Column behind the hovered / selected month, in every panel.
        const hoverColumn = panels.append("rect")
            .attr("width", x.step()).attr("height", height)
            .attr("fill", "#f1f5f9")
            .style("display", "none");
        panels.append("rect")
            .attr("width", x.step()).attr("height", height)
            .attr("fill", "#e2e8f0")
            .attr("x", state.selected === null ? 0 : columnX(state.selected))
            .style("display", state.selected === null || !keys.includes(state.selected) ? "none" : null);

        panels.selectAll(".temp-comparison-bar")
            .data(d => d.values).join("rect")
            .attr("class", "temp-comparison-bar")
            .attr("x", d => x(d.key))
            .attr("y", d => yBars(d.sunshine))
            .attr("width", x.bandwidth())
            .attr("height", d => height - yBars(d.sunshine))
            .attr("fill", d => color(d.city))
            .attr("fill-opacity", 0.45);

        const line = d3.line().x(d => x(d.key) + x.bandwidth() / 2).y(d => yTemp(d.temp)).curve(d3.curveMonotoneX);
        panels.append("path")
            .attr("class", "line")
            .attr("d", d => line(d.values))
            .attr("stroke", d => color(d.city));
        panels.selectAll(".temp-comparison-dot")
            .data(d => d.values).join("circle")
            .attr("class", "temp-comparison-dot")
            .attr("cx", d => x(d.key) + x.bandwidth() / 2)
            .attr("cy", d => yTemp(d.temp))
            .attr("r", 3.5)
            .attr("fill", d => color(d.city));

        // Invisible column per month (or year) for hovering and clicking.
        panels.selectAll(".temp-comparison-hover")
            .data(d => d.values).join("rect")
            .attr("class", "temp-comparison-hover")
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

// --- Humidity and daily temperature range: one panel per city ---
// Small dots: single days. Large dots: monthly averages (labelled), showing the move from the dry to the wet season.
// Humid air keeps the night warm and the day less hot, so humid days should have a small range.

function drawHumidityRange() {
    const tooltip = createTooltip();
    const color = cityColorScale();
    const format = v => v.toFixed(1);
    const formatDay = d3.timeFormat("%d %b %Y");

    const days = rawParsedWeather.map(d => ({
        city: d.city,
        date: d.date,
        month: d.date.getMonth(),
        humidity: d.humidity,
        range: d.tempMax - d.tempMin,
        temp: d.tempMean,
        min: d.tempMin,
        max: d.tempMax,
        sunshine: d.sunshineHours
    }));

    // Axes cover all days, so panels and filters stay comparable; brushing zooms in.
    const fullX = d3.extent(days, d => d.humidity);
    const fullY = [0, d3.max(days, d => d.range)];
    // Year and season come from the shared filter (temperatureFilters).
    const state = { zoom: null, selected: null };
    const filters = temperatureFilters;
    const detail = d3.select("#temperature-humidity-detail");
    initTemperatureFilters();

    function showDetail() {
        detail.selectAll("*").remove();
        if (state.selected === null) return;

        const rows = days.filter(d => +d.date === +state.selected);
        detail.append("p").append("strong").text(d3.timeFormat("%A, %d %B %Y")(state.selected));
        const table = detail.append("table").attr("class", "temperature-detail-table");
        table.append("tr").selectAll("th")
            .data(["City", "Humidity", "Daily range", "Min", "Max", "Mean", "Sunshine"]).join("th")
            .text(d => d);
        table.selectAll(".temp-detail-row")
            .data(rows).join("tr")
            .attr("class", "temp-detail-row")
            .selectAll("td")
            .data(d => [d.city, `${Math.round(d.humidity)}%`, `${format(d.range)}°C`, `${format(d.min)}°C`,
                `${format(d.max)}°C`, `${format(d.temp)}°C`, `${format(d.sunshine)} h`])
            .join("td")
            .text(d => d);
    }

    function render() {
        showDetail();

        const cities = TEMP_CITIES.filter(city => document.querySelector(`#cityFilters input[value="${city}"]`).checked);
        const shown = days.filter(d =>
            filters.quarter.months.includes(d.month) && (filters.year === null || d.date.getFullYear() === filters.year));

        const margin = { top: 30, right: 20, bottom: 50, left: 60 };
        const { svg, width, height } = createSvg("#temperature-humidity-chart", 400, margin);

        const panel = d3.scaleBand().domain(cities).range([0, width]).paddingInner(0.1);
        const x = d3.scaleLinear().domain(state.zoom ? state.zoom.x : fullX).range([0, panel.bandwidth()]);
        // The daily range is ratio data, so its axis starts at 0 (until the user zooms in).
        const y = d3.scaleLinear().domain(state.zoom ? state.zoom.y : fullY).range([height, 0]);
        if (!state.zoom) {
            x.nice();
            y.nice();
        }

        addGrid(svg, y, width);
        svg.append("g").attr("class", "axis").call(d3.axisLeft(y));
        addAxisLabel(svg, "Daily Range Tmax − Tmin (°C)", -height / 2, -45, true);
        addAxisLabel(svg, "Mean Relative Humidity (%)", width / 2, height + 40);

        svg.append("clipPath").attr("id", "temperature-humidity-clip")
            .append("rect").attr("width", panel.bandwidth()).attr("height", height);

        const panels = svg.selectAll(".temp-city")
            .data(cities.map(city => {
                const cityDays = shown.filter(d => d.city === city);
                const months = d3.rollups(cityDays,
                    v => ({ humidity: d3.mean(v, d => d.humidity), range: d3.mean(v, d => d.range) }),
                    d => d.month)
                    .map(([month, values]) => ({ city, month, ...values }));
                return { city, days: cityDays, months };
            })).join("g")
            .attr("class", "temp-city")
            .attr("data-city", d => d.city)
            .attr("transform", d => `translate(${panel(d.city)},0)`);

        panels.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(5));

        // Title with R² of the trend line: the share of the daily-range differences that humidity explains.
        panels.append("text")
            .attr("x", panel.bandwidth() / 2).attr("y", -14)
            .attr("text-anchor", "middle")
            .attr("fill", d => color(d.city))
            .attr("font-size", "13px").attr("font-weight", 600)
            .text(d => d.days.length > 2
                ? `${d.city} (R² = ${(correlation(d.days, p => p.humidity, p => p.range) ** 2).toFixed(2)})`
                : d.city);

        const plots = panels.append("g").attr("clip-path", "url(#temperature-humidity-clip)");

        // Daily points.
        plots.selectAll(".temp-humidity-day")
            .data(d => d.days).join("circle")
            .attr("class", "temp-humidity-day")
            .attr("cx", d => x(d.humidity))
            .attr("cy", d => y(d.range))
            .attr("r", 1.8)
            .attr("fill", d => color(d.city))
            .attr("opacity", 0.2);

        // Least-squares trend line of the shown days.
        plots.filter(d => d.days.length > 2).append("line")
            .each(function(d) {
                const mx = d3.mean(d.days, p => p.humidity);
                const my = d3.mean(d.days, p => p.range);
                const slope = d3.sum(d.days, p => (p.humidity - mx) * (p.range - my)) / d3.sum(d.days, p => (p.humidity - mx) ** 2);
                const [x0, x1] = d3.extent(d.days, p => p.humidity);
                d3.select(this)
                    .attr("x1", x(x0)).attr("y1", y(my + slope * (x0 - mx)))
                    .attr("x2", x(x1)).attr("y2", y(my + slope * (x1 - mx)));
            })
            .attr("stroke", "#1e293b").attr("stroke-width", 2).attr("stroke-dasharray", "5,3");

        // Selected day.
        plots.selectAll(".temp-humidity-selected")
            .data(d => d.days.filter(p => state.selected && +p.date === +state.selected)).join("circle")
            .attr("class", "temp-humidity-selected")
            .attr("cx", d => x(d.humidity)).attr("cy", d => y(d.range))
            .attr("r", 6)
            .attr("fill", "none").attr("stroke", "#1e293b").attr("stroke-width", 2);

        // Hover marker, moved by the overlay below.
        const hoverMarker = plots.append("circle")
            .attr("r", 5)
            .attr("fill", "none").attr("stroke", "#1e293b").attr("stroke-width", 1.5)
            .style("display", "none");

        // Brush (drag to zoom), hover (nearest day) and click (select a day) share one overlay per panel.
        const brush = d3.brush()
            .extent([[0, 0], [panel.bandwidth(), height]])
            .on("end", function({ selection, sourceEvent }) {
                if (!sourceEvent) return;   // ignore moves made by code
                if (selection) {
                    const [[x0, y0], [x1, y1]] = selection;
                    if (x1 - x0 > 5 && y1 - y0 > 5) {
                        state.zoom = { x: [x.invert(x0), x.invert(x1)], y: [y.invert(y1), y.invert(y0)] };
                        render();
                    }
                    return;
                }
                // A click without dragging selects the nearest day.
                const day = nearestDay(this, sourceEvent);
                if (day) {
                    state.selected = day.date;
                    render();
                }
            });

        function nearestDay(overlay, event) {
            const d = d3.select(overlay).datum();
            const [mx, my] = d3.pointer(event, overlay);
            const index = d.delaunay.find(mx, my);
            const day = d.days[index];
            return day && Math.hypot(x(day.humidity) - mx, y(day.range) - my) < 10 ? day : null;
        }

        panels.each(d => d.delaunay = d3.Delaunay.from(d.days, p => x(p.humidity), p => y(p.range)));

        panels.append("g")
            .call(brush)
            .on("mousemove.tooltip", function(event) {
                const day = nearestDay(this, event);
                const marker = hoverMarker.filter(m => m.city === d3.select(this).datum().city);
                if (!day) {
                    marker.style("display", "none");
                    tooltip.hide();
                    return;
                }
                marker.style("display", null).attr("cx", x(day.humidity)).attr("cy", y(day.range));
                tooltip.show(event, `<strong>${day.city}</strong> · ${formatDay(day.date)}<br/>` +
                    `Humidity: ${Math.round(day.humidity)}% · Daily range: ${format(day.range)}°C<br/>` +
                    `Min–max: ${format(day.min)}–${format(day.max)}°C<br/><em>Click for all cities on this day</em>`);
            })
            .on("mouseleave.tooltip", () => {
                hoverMarker.style("display", "none");
                tooltip.hide();
            })
            .on("dblclick", () => {
                state.zoom = null;
                render();
            });

        // Monthly averages on top: they show the seasonal path from dry to humid months.
        const monthDots = panels.append("g").attr("clip-path", "url(#temperature-humidity-clip)")
            .selectAll("g")
            .data(d => d.months).join("g")
            .attr("transform", d => `translate(${x(d.humidity)},${y(d.range)})`)
            .on("mouseover", (event, d) => {
                tooltip.show(event, `<strong>${d.city}</strong> · ${d3.timeFormat("%B")(new Date(2000, d.month, 1))} average` +
                    `${filters.year === null ? "" : ` ${filters.year}`}<br/>` +
                    `Humidity: ${Math.round(d.humidity)}% · Daily range: ${format(d.range)}°C`);
            })
            .on("mouseout", tooltip.hide);
        monthDots.append("circle")
            .attr("r", 8)
            .attr("fill", d => color(d.city))
            .attr("stroke", "#fff").attr("stroke-width", 1.5);
        monthDots.append("text")
            .attr("text-anchor", "middle").attr("dy", "0.35em")
            .attr("font-size", "9px").attr("font-weight", 700).attr("fill", "#fff")
            .style("pointer-events", "none")
            .text(d => MONTH_LABELS[d.month][0]);
    }

    document.addEventListener("temperatureFiltersChanged", () => {
        state.selected = null;
        render();
    });
    document.querySelectorAll("#cityFilters input").forEach(checkbox => {
        checkbox.addEventListener("change", render);
    });

    render();
}
