function drawExtremeTrends() {
    let data = getAnnualExtremeData();   // follows the global season (see the DashSync listener at the end)
    if (data.length === 0) return;

    const fullYears = d3.extent(data, d => d.year);
    const formatChange = d3.format("+d");

    const margin = { top: 40, right: 40, bottom: 50, left: 60 };
    const width = 850 - margin.left - margin.right;
    const height = 420 - margin.top - margin.bottom;
    const cities = EXTREME_CITIES;
    const color = extremeCityColorScale();

    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip extreme-tooltip")
        .style("opacity", 0);

    function drawChart(container, field, eventLabel, filters) {
        let selectedYears = fullYears.slice();
        const thresholdInput = document.getElementById(`${field}ChangeThreshold`);
        // Compute changes before zooming so the first visible year keeps its true comparison.
        let chartData = getAnnualExtremeChanges(data, field);
        const sourceName = `trend-${field}`;
        const visibleCities = new Set(cities);
        const svg = d3.select(container).append("svg")
            .attr("width", 850)
            .attr("height", 420)
            .attr("viewBox", "0 0 850 420")
            .attr("role", "img")
            .attr("aria-label", eventLabel + " per year across three cities")
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const x = d3.scaleLinear()
            .domain(d3.extent(data, d => d.year))
            .range([0, width]);
        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => d[field]) || 1])
            .nice()
            .range([height, 0]);
        const grid = svg.append("g").attr("class", "extreme-grid");

        const xAxis = svg.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${height})`);
        const yAxis = svg.append("g").attr("class", "axis");

        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -height / 2).attr("y", -45)
            .attr("text-anchor", "middle")
            .attr("fill", "#64748b").attr("font-size", "12px")
            .text("Number of Days");
        svg.append("text")
            .attr("x", width / 2).attr("y", height + 40)
            .attr("text-anchor", "middle")
            .attr("fill", "#64748b").attr("font-size", "12px")
            .text("Year");

        const line = d3.line()
            .x(d => x(d.year))
            .y(d => y(d[field]));

        cities.forEach(city => {
            const cityData = chartData.filter(d => d.city === city);
            const group = svg.append("g")
                .attr("class", "extreme-city")
                .attr("data-city", city);

            group.append("path")
                .datum(cityData)
                .attr("class", "line")
                .attr("stroke", color(city))
                .attr("d", line);

            group.selectAll("circle")
                .data(cityData).join("circle")
                .attr("class", "dot")
                .attr("r", 4)
                .attr("cx", d => x(d.year))
                .attr("cy", d => y(d[field]))
                .attr("fill", color(city))
                .on("mouseover", (event, d) => {
                    const comparison = d.change === null
                        ? "Previous year unavailable"
                        : `Change vs ${d.year - 1}: ${formatChange(d.change)} days (${d.previousValue} → ${d[field]})`;
                    tooltip.style("opacity", 0.9)
                        .html(`<strong>${d.city}</strong><br/>Year: ${d.year}<br/>${eventLabel}: ${d[field]} days<br/>${comparison}`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mouseout", () => tooltip.style("opacity", 0));
        });

        const highlights = svg.append("g");

        function updateChart() {
            // One selected year: pad the axis so the year sits in the middle.
            x.domain(selectedYears[0] === selectedYears[1] ? [selectedYears[0] - 0.5, selectedYears[1] + 0.5] : selectedYears);
            xAxis.call(d3.axisBottom(x)
                .tickValues(d3.range(selectedYears[0], selectedYears[1] + 1))
                .tickFormat(d3.format("d")));

            const inRange = d => d.year >= selectedYears[0] && d.year <= selectedYears[1];
            const visibleRows = chartData.filter(d => inRange(d) && visibleCities.has(d.city));
            y.domain([0, d3.max(visibleRows, d => d[field]) || 1]).nice();
            const ticks = y.ticks(Math.min(6, y.domain()[1])).filter(Number.isInteger);
            yAxis.call(d3.axisLeft(y).tickValues(ticks).tickFormat(d3.format("d")));
            grid.selectAll("line").data(ticks).join("line")
                .attr("x1", 0).attr("x2", width)
                .attr("y1", d => y(d)).attr("y2", d => y(d));
            svg.selectAll(".extreme-city")
                .style("display", function() { return visibleCities.has(this.dataset.city) ? null : "none"; });
            svg.selectAll(".extreme-city .line")
                .attr("d", rows => line(rows.filter(inRange)));
            svg.selectAll(".extreme-city .dot")
                .attr("cx", d => x(d.year))
                .attr("cy", d => y(d[field]))
                .style("display", d => inRange(d) ? null : "none");

            const highlightedYears = getExtremeChangesAboveThreshold(
                chartData, selectedYears, visibleCities, thresholdInput.valueAsNumber
            );
            highlights.selectAll("circle")
                .data(highlightedYears, d => `${d.city}-${d.year}`)
                .join("circle")
                .attr("class", "extreme-change-marker")
                .attr("cx", d => x(d.year))
                .attr("cy", d => y(d[field]))
                .attr("r", 8)
                .attr("stroke", d => color(d.city));
            highlights.selectAll("text")
                .data(highlightedYears, d => `${d.city}-${d.year}`)
                .join("text")
                .attr("class", "extreme-change-label")
                .attr("x", d => x(d.year))
                .attr("y", d => y(d[field]))
                .attr("dx", d => x(d.year) > width - 65 ? -12 : 12)
                .attr("dy", d => y(d[field]) < 20 ? 22 : -14)
                .attr("text-anchor", d => x(d.year) > width - 65 ? "end" : "start")
                .attr("fill", d => color(d.city))
                .text(d => `${formatChange(d.change)} days`);

            document.getElementById(`${field}YearRange`).textContent =
                `Showing ${selectedYears[0]}–${selectedYears[1]}`;
            tooltip.style("opacity", 0);
        }

        thresholdInput.addEventListener("input", updateChart);

        document.querySelectorAll(filters + " input").forEach(checkbox => {
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) visibleCities.add(checkbox.value);
                else visibleCities.delete(checkbox.value);
                updateChart();
            });
        });

        const overview = d3.select(`#${field}Brush`).append("svg")
            .attr("width", 850).attr("height", 110)
            .attr("viewBox", "0 0 850 110")
            .append("g").attr("transform", `translate(${margin.left},20)`);
        const overviewX = d3.scaleLinear().domain(fullYears).range([0, width]);
        const overviewY = d3.scaleLinear()
            .domain([0, d3.max(data, d => d[field]) || 1]).range([55, 5]);
        overview.append("rect").attr("width", width).attr("height", 60).attr("fill", "#f8fafc");
        overview.append("text").attr("x", 0).attr("y", -8)
            .attr("fill", "#475569").attr("font-size", 11)
            .text("Drag to zoom:");
        cities.forEach(city => {
            overview.append("path").datum(data.filter(d => d.city === city))
                .attr("class", "extreme-overview-city").attr("data-city", city)
                .attr("fill", "none").attr("stroke", color(city)).attr("stroke-width", 1.5)
                .attr("d", d3.line().x(d => overviewX(d.year)).y(d => overviewY(d[field])));
        });
        overview.append("g").attr("class", "axis").attr("transform", "translate(0,60)")
            .call(d3.axisBottom(overviewX).tickValues(d3.range(fullYears[0], fullYears[1] + 1)).tickFormat(d3.format("d")));

        const brush = d3.brushX().handleSize(8).extent([[0, 0], [width, 60]])
            .on("brush end", event => {
                // Programmatic moves only synchronize the handles.
                if (!event.sourceEvent) return;
                selectedYears = getExtremeYearRange(event.selection && event.selection.map(overviewX.invert), fullYears);
                updateChart();
                if (event.type === "end") {
                    brushGroup.call(brush.move, event.selection ? selectedYears.map(overviewX) : null);
                    // The chosen years become the global time window, so every other chart follows.
                    DashSync.setYears(selectedYears[0], selectedYears[1], sourceName);
                }
            });
        const brushGroup = overview.append("g").attr("class", "extreme-brush").call(brush);

        document.getElementById(`${field}ResetZoom`).addEventListener("click", () => {
            selectedYears = fullYears.slice();
            brushGroup.call(brush.move, null);
            updateChart();
            DashSync.setRange(DashSync.full(), sourceName);
        });

        // Follow the global time window set by any other chart.
        function applyGlobalRange() {
            const [first, last] = DashSync.years();
            selectedYears = [Math.max(first, fullYears[0]), Math.min(last, fullYears[1])];
            const whole = selectedYears[0] === fullYears[0] && selectedYears[1] === fullYears[1];
            const pad = selectedYears[0] === selectedYears[1] ? (overviewX(fullYears[0] + 1) - overviewX(fullYears[0])) / 2 : 0;
            brushGroup.call(brush.move, whole ? null : selectedYears.map(overviewX).map((v, i) => v + (i ? pad : -pad)));
            updateChart();
        }

        // A new season: recount the days from the season's months only.
        function applySeason() {
            chartData = getAnnualExtremeChanges(data, field);
            overviewY.domain([0, d3.max(data, d => d[field]) || 1]);
            overview.selectAll(".extreme-overview-city").each(function() {
                d3.select(this).datum(data.filter(d => d.city === this.dataset.city))
                    .attr("d", d3.line().x(d => overviewX(d.year)).y(d => overviewY(d[field])));
            });
            updateChart();
        }
        updateChart();
        return { sourceName, applyGlobalRange, applySeason };
    }

    const charts = [
        drawChart("#hot-days-chart", "hotDays", "Hot days", "#extremeCityFilters"),
        drawChart("#heavy-rain-days-chart", "heavyRainDays", "Heavy rainfall days", "#heavyRainCityFilters")
    ];
    DashSync.on(detail => {
        if (detail.source === "init") return;
        if (detail.keys.includes("quarter") || detail.keys.includes("condition")) {
            data = getAnnualExtremeData(DashSync.rowsInSeason());
            charts.forEach(chart => chart.applySeason());
        }
        if (detail.keys.includes("range")) {
            charts.filter(chart => chart.sourceName !== detail.source).forEach(chart => chart.applyGlobalRange());
        }
    });
}
