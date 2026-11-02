// Temperature charts (RQ1): shared helpers and the detail charts (monthly anomalies, daily range and its drivers).
// The detail charts share the city filter and highlight the hovered month together.

const TEMP_CITIES = ["Hanoi", "Da Nang", "Ho Chi Minh City"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DRIVERS = {
    humidity: { field: "humidity", label: "Mean Relative Humidity (%)" },
    sunshine: { field: "sunshineHours", label: "Sunshine Duration (h/day)" }
};

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

// Creates an 850px wide SVG and returns the inner group and its size.
function createSvg(container, height, margin) {
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

// Shows only the cities checked in the city filter, in every temperature chart.
function applyTemperatureCityFilter() {
    const checked = Array.from(document.querySelectorAll("#cityFilters input:checked")).map(cb => cb.value);
    d3.selectAll("#temperature .temp-city")
        .style("display", function() { return checked.includes(this.dataset.city) ? null : "none"; });
}

// Box plot numbers for one group of values (whiskers at 1.5 × IQR).
function boxStats(values) {
    const sorted = values.slice().sort(d3.ascending);
    const q1 = d3.quantileSorted(sorted, 0.25);
    const median = d3.quantileSorted(sorted, 0.5);
    const q3 = d3.quantileSorted(sorted, 0.75);
    const lowLimit = q1 - 1.5 * (q3 - q1);
    const highLimit = q3 + 1.5 * (q3 - q1);
    const inside = sorted.filter(v => v >= lowLimit && v <= highLimit);

    return {
        q1, median, q3,
        low: inside[0],
        high: inside[inside.length - 1],
        outliers: sorted.filter(v => v < lowLimit || v > highLimit)
    };
}

// Pearson correlation and least-squares line for the scatter plots.
function linearFit(rows, xField, yField) {
    const meanX = d3.mean(rows, d => d[xField]);
    const meanY = d3.mean(rows, d => d[yField]);
    const sxy = d3.sum(rows, d => (d[xField] - meanX) * (d[yField] - meanY));
    const sxx = d3.sum(rows, d => (d[xField] - meanX) ** 2);
    const syy = d3.sum(rows, d => (d[yField] - meanY) ** 2);
    const slope = sxy / sxx;

    return { r: sxy / Math.sqrt(sxx * syy), slope, intercept: meanY - slope * meanX };
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

// --- Detail charts ---

function drawTemperatureDetailCharts() {
    const rows = rawParsedWeather.map(d => ({
        city: d.city,
        month: d.date.getMonth(),
        range: d.tempMax - d.tempMin,
        humidity: d.humidity,
        sunshineHours: d.sunshineHours
    }));

    const color = cityColorScale();
    const tooltip = createTooltip();

    // --- Year x month heatmap of anomalies (month mean minus its 10-year average) ---
    function drawAnomalyHeatmap() {
        const margin = { top: 30, right: 20, bottom: 70, left: 60 };
        const { svg, width, height } = createSvg("#temperature-anomaly-chart", 380, margin);

        const cells = monthlyAnomalies();

        // Symmetric scale so that 0 (a normal month) is always white.
        const limit = d3.max(cells, d => Math.abs(d.anomaly));
        const colorScale = d3.scaleDiverging(t => d3.interpolateRdBu(1 - t)).domain([-limit, 0, limit]);

        const panel = d3.scaleBand().domain(TEMP_CITIES).range([0, width]).paddingInner(0.06);
        const x = d3.scaleBand().domain(d3.range(12)).range([0, panel.bandwidth()]);
        const years = Array.from(new Set(cells.map(d => d.year))).sort(d3.ascending);
        const y = d3.scaleBand().domain(years).range([0, height]);

        svg.append("g").attr("class", "axis")
            .call(d3.axisLeft(y).tickSize(0))
            .call(g => g.select(".domain").remove());

        const panels = svg.selectAll(".temp-city")
            .data(d3.groups(cells, d => d.city)).join("g")
            .attr("class", "temp-city")
            .attr("data-city", d => d[0])
            .attr("transform", d => `translate(${panel(d[0])},0)`);

        panels.append("text")
            .attr("x", panel.bandwidth() / 2).attr("y", -12)
            .attr("text-anchor", "middle")
            .attr("fill", d => color(d[0]))
            .attr("font-size", "13px").attr("font-weight", 600)
            .text(d => d[0]);

        panels.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).tickSize(0).tickFormat(m => MONTH_LABELS[m][0]))
            .call(g => g.select(".domain").remove());

        panels.selectAll(".temp-cell")
            .data(d => d[1]).join("rect")
            .attr("class", "temp-cell")
            .attr("x", d => x(d.month))
            .attr("y", d => y(d.year))
            .attr("width", x.bandwidth())
            .attr("height", y.bandwidth())
            .attr("fill", d => colorScale(d.anomaly))
            .attr("stroke", "#fff")
            .on("mouseover", (event, d) => {
                highlightMonth(d.month);
                const sign = d.anomaly >= 0 ? "+" : "";
                tooltip.show(event, `<strong>${d.city}</strong> · ${MONTH_LABELS[d.month]} ${d.year}<br/>` +
                    `Mean: ${d.mean.toFixed(1)}°C<br/>` +
                    `${sign}${d.anomaly.toFixed(1)}°C vs. 10-year ${MONTH_LABELS[d.month]} average<br/>` +
                    `<em>Click to see the daily temperatures</em>`);
            })
            .on("mouseout", () => {
                highlightMonth(null);
                tooltip.hide();
            })
            .on("click", (event, d) => {
                // Opens this month in the overview chart (handled in drawTemperatureChart).
                document.dispatchEvent(new CustomEvent("temperatureMonthSelected", {
                    detail: { year: d.year, month: d.month + 1 }
                }));
                document.getElementById("temperatureDetails").scrollIntoView({ behavior: "smooth" });
            });

        // Colour legend below the panels.
        const legendWidth = 240;
        const legendX = d3.scaleLinear().domain([-limit, limit]).range([0, legendWidth]);
        const legend = svg.append("g")
            .attr("transform", `translate(${(width - legendWidth) / 2},${height + 32})`);

        const gradient = svg.append("defs").append("linearGradient").attr("id", "temperature-anomaly-gradient");
        gradient.selectAll("stop")
            .data(d3.range(0, 1.01, 0.1)).join("stop")
            .attr("offset", t => `${t * 100}%`)
            .attr("stop-color", t => colorScale(-limit + t * 2 * limit));

        legend.append("rect")
            .attr("width", legendWidth).attr("height", 10)
            .attr("fill", "url(#temperature-anomaly-gradient)");
        legend.append("g").attr("class", "axis")
            .attr("transform", "translate(0,10)")
            .call(d3.axisBottom(legendX).ticks(7).tickFormat(d => (d > 0 ? "+" : "") + d + "°C"));
        legend.append("text")
            .attr("x", -8).attr("y", 9)
            .attr("text-anchor", "end")
            .attr("fill", "#64748b").attr("font-size", "12px")
            .text("Colder");
        legend.append("text")
            .attr("x", legendWidth + 8).attr("y", 9)
            .attr("fill", "#64748b").attr("font-size", "12px")
            .text("Warmer");

        return month => svg.selectAll(".temp-cell")
            .attr("opacity", d => month === null || d.month === month ? 1 : 0.3);
    }

    // --- Monthly box plots of the daily range, one panel per city ---
    function drawRangeChart() {
        const margin = { top: 30, right: 20, bottom: 40, left: 60 };
        const { svg, width, height } = createSvg("#temperature-range-chart", 360, margin);

        const panel = d3.scaleBand().domain(TEMP_CITIES).range([0, width]).paddingInner(0.08);
        const x = d3.scaleBand().domain(d3.range(12)).range([0, panel.bandwidth()]).padding(0.25);
        const y = d3.scaleLinear().domain([0, d3.max(rows, d => d.range)]).nice().range([height, 0]);

        addGrid(svg, y, width);
        svg.append("g").attr("class", "axis").call(d3.axisLeft(y));
        addAxisLabel(svg, "Daily Range Tmax − Tmin (°C)", -height / 2, -45, true);

        const boxes = d3.rollups(rows, v => boxStats(v.map(d => d.range)), d => d.city, d => d.month);

        const panels = svg.selectAll(".temp-city")
            .data(boxes).join("g")
            .attr("class", "temp-city")
            .attr("data-city", d => d[0])
            .attr("transform", d => `translate(${panel(d[0])},0)`);

        panels.append("text")
            .attr("x", panel.bandwidth() / 2).attr("y", -12)
            .attr("text-anchor", "middle")
            .attr("fill", d => color(d[0]))
            .attr("font-size", "13px").attr("font-weight", 600)
            .text(d => d[0]);

        panels.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).tickFormat(m => MONTH_LABELS[m][0]));

        const box = panels.selectAll(".temp-box")
            .data(d => d[1].map(([month, s]) => ({ city: d[0], month, ...s })))
            .join("g")
            .attr("class", "temp-box")
            .attr("transform", d => `translate(${x(d.month)},0)`)
            .attr("stroke", d => color(d.city))
            .on("mouseover", (event, d) => {
                highlightMonth(d.month);
                tooltip.show(event, `<strong>${d.city}</strong> · ${MONTH_LABELS[d.month]}<br/>` +
                    `Median range: ${d.median.toFixed(1)}°C<br/>` +
                    `Middle 50%: ${d.q1.toFixed(1)}–${d.q3.toFixed(1)}°C<br/>Outliers: ${d.outliers.length}`);
            })
            .on("mouseout", () => {
                highlightMonth(null);
                tooltip.hide();
            });

        const center = x.bandwidth() / 2;
        box.append("line")
            .attr("x1", center).attr("x2", center)
            .attr("y1", d => y(d.low)).attr("y2", d => y(d.high));
        box.append("rect")
            .attr("width", x.bandwidth())
            .attr("y", d => y(d.q3))
            .attr("height", d => y(d.q1) - y(d.q3))
            .attr("fill", d => color(d.city))
            .attr("fill-opacity", 0.3);
        box.append("line")
            .attr("x2", x.bandwidth())
            .attr("y1", d => y(d.median)).attr("y2", d => y(d.median))
            .attr("stroke-width", 2);
        box.selectAll("circle")
            .data(d => d.outliers).join("circle")
            .attr("cx", center).attr("cy", v => y(v))
            .attr("r", 1.5)
            .attr("fill", "none");

        return month => svg.selectAll(".temp-box")
            .attr("opacity", d => month === null || d.month === month ? 1 : 0.25);
    }

    // --- Daily range vs. humidity or sunshine, one panel per city ---
    let highlightDrivers = () => {};

    function drawDriversChart(driverKey) {
        const container = d3.select("#temperature-drivers-chart");
        container.selectAll("*").remove();

        const driver = DRIVERS[driverKey];
        const margin = { top: 30, right: 20, bottom: 50, left: 60 };
        const { svg, width, height } = createSvg("#temperature-drivers-chart", 360, margin);

        const panel = d3.scaleBand().domain(TEMP_CITIES).range([0, width]).paddingInner(0.1);
        const x = d3.scaleLinear().domain(d3.extent(rows, d => d[driver.field])).nice().range([0, panel.bandwidth()]);
        const y = d3.scaleLinear().domain([0, d3.max(rows, d => d.range)]).nice().range([height, 0]);

        addGrid(svg, y, width);
        svg.append("g").attr("class", "axis").call(d3.axisLeft(y));
        addAxisLabel(svg, "Daily Range Tmax − Tmin (°C)", -height / 2, -45, true);
        addAxisLabel(svg, driver.label, width / 2, height + 40);

        const panels = svg.selectAll(".temp-city")
            .data(d3.groups(rows, d => d.city)).join("g")
            .attr("class", "temp-city")
            .attr("data-city", d => d[0])
            .attr("transform", d => `translate(${panel(d[0])},0)`);

        panels.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(5));

        panels.selectAll(".temp-point")
            .data(d => d[1]).join("circle")
            .attr("class", "temp-point")
            .attr("cx", d => x(d[driver.field]))
            .attr("cy", d => y(d.range))
            .attr("r", 1.8)
            .attr("fill", d => color(d.city))
            .attr("opacity", 0.25);

        // Trend line and correlation coefficient per city.
        panels.each(function([city, cityRows]) {
            const fit = linearFit(cityRows, driver.field, "range");
            const [x0, x1] = d3.extent(cityRows, d => d[driver.field]);
            const group = d3.select(this);

            group.append("line")
                .attr("x1", x(x0)).attr("x2", x(x1))
                .attr("y1", y(fit.intercept + fit.slope * x0))
                .attr("y2", y(fit.intercept + fit.slope * x1))
                .attr("stroke", "#1e293b").attr("stroke-width", 1.5);

            group.append("text")
                .attr("x", panel.bandwidth() / 2).attr("y", -12)
                .attr("text-anchor", "middle")
                .attr("fill", color(city))
                .attr("font-size", "13px").attr("font-weight", 600)
                .text(`${city} (r = ${fit.r.toFixed(2)})`);
        });

        highlightDrivers = month => svg.selectAll(".temp-point")
            .attr("opacity", d => month === null ? 0.25 : d.month === month ? 0.8 : 0.03);

        applyTemperatureCityFilter();
    }

    const highlightAnomaly = drawAnomalyHeatmap();
    const highlightRange = drawRangeChart();

    function highlightMonth(month) {
        highlightAnomaly(month);
        highlightRange(month);
        highlightDrivers(month);
    }

    document.querySelectorAll("#cityFilters input").forEach(checkbox => {
        checkbox.addEventListener("change", applyTemperatureCityFilter);
    });

    const driverSelect = document.getElementById("driverSelect");
    driverSelect.addEventListener("change", () => drawDriversChart(driverSelect.value));
    drawDriversChart(driverSelect.value);
}
