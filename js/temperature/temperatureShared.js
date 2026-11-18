// Temperature tab (RQ1): constants, helpers and the year/season filter shared by all temperature charts.
// Load this file before the chart files (temperatureTypicalYear.js, temperatureSunshine.js, temperatureElNino.js).

const TEMP_CITIES = ["Hanoi", "Da Nang", "Ho Chi Minh City"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Season filter: calendar quarters, so no season crosses a year boundary.
const TEMP_QUARTERS = [
    { label: "All months", months: d3.range(12) },
    { label: "Q1 · Jan–Mar", months: [0, 1, 2] },
    { label: "Q2 · Apr–Jun", months: [3, 4, 5] },
    { label: "Q3 · Jul–Sep", months: [6, 7, 8] },
    { label: "Q4 · Oct–Dec", months: [9, 10, 11] }
];

// --- Helpers ---

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

// Length of the transitions when a filter changes; none if the user prefers reduced motion.
const TEMP_DURATION = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450;

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

// Builds the year slider and season buttons once; every chart calls this before drawing.
function initTemperatureFilters() {
    if (temperatureFiltersReady) return;
    temperatureFiltersReady = true;

    const years = Array.from(new Set(rawParsedWeather.map(d => d.date.getFullYear()))).sort(d3.ascending);
    // "All years" (the 10-year average) is a separate button, because it is not a point on the time scale.
    document.getElementById("temperatureAllYears")
        .addEventListener("click", () => setTemperatureFilters({ year: null }));

    // Year slider: selects one year. The charts update while dragging, so the years can be compared quickly.
    // While "All years" is active the slider is grey and keeps its last position.
    const slider = document.getElementById("temperatureYear");
    slider.min = years[0];
    slider.max = years[years.length - 1];
    slider.value = years[0];
    const selectSliderYear = () => {
        if (+slider.value !== temperatureFilters.year) setTemperatureFilters({ year: +slider.value });
    };
    slider.addEventListener("input", selectSliderYear);
    slider.addEventListener("pointerdown", selectSliderYear);  // clicking the grey thumb also selects its year

    // Labels under the slider; clicking one selects that year.
    d3.select("#temperatureYearTicks").selectAll("button")
        .data(years).join("button")
        .attr("type", "button")
        .text(d => `'${String(d).slice(2)}`)
        .on("click", (event, d) => setTemperatureFilters({ year: d }));

    d3.select("#temperatureSeasonFilter")
        .selectAll("button")
        .data(TEMP_QUARTERS).join("button")
        .attr("class", "temperature-season")
        .text(d => d.label)
        .on("click", (event, quarter) => setTemperatureFilters({ quarter }));

    syncTemperatureFilters();
}

function syncTemperatureFilters() {
    const allYears = temperatureFilters.year === null;
    const slider = document.getElementById("temperatureYear");
    if (!allYears) slider.value = temperatureFilters.year;
    // The part left of the thumb is coloured (see .temperature-year-slider in dashboard.css).
    slider.style.setProperty("--fill", `${(slider.value - slider.min) / (slider.max - slider.min) * 100}%`);
    d3.select("#temperatureYearSlider").classed("inactive", allYears);
    d3.select("#temperatureAllYears").classed("active", allYears).attr("aria-pressed", allYears);
    d3.select("#temperatureYearValue").text(temperatureFilters.year).style("display", allYears ? "none" : null);
    d3.selectAll("#temperatureYearTicks button").classed("active", d => d === temperatureFilters.year);
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
