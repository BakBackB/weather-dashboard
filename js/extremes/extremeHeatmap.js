function drawExtremeHeatmap() {
    const fullCells = getExtremeHeatmapCells(rawParsedWeather);
    const tooltip = extremeCreateTooltip();
    const selectedCities = extremeInitCityFilters("extremeHeatmapCities", render);
    if (!fullCells.length) {
        d3.select("#extreme-heatmap").append("p").attr("class", "extreme-note").text("No apparent temperature observations are available.");
        return;
    }
    const fullYears = d3.extent(rawParsedWeather, d => Number(d.year));
    let selectedYears = fullYears.slice();
    let cellKey = "full|0";   // the years and season that `lookup` was built for
    let lookup = new Map(fullCells.map(d => [`${d.city}-${d.tempBin}-${d.humidityBin}`, d]));
    const temperatureBins = d3.range(d3.min(fullCells, d => d.tempBin), d3.max(fullCells, d => d.tempBin) + 2, 2);
    const humidityBins = d3.range(d3.min(fullCells, d => d.humidityBin), 100, 5);
    const colourStep = 3;
    // Daily extrema bound the means for every possible year-range selection.
    const apparentRange = d3.extent(rawParsedWeather, d => d.apparentTempMax);
    const colourMin = Math.floor(apparentRange[0] / colourStep) * colourStep;
    const colourMax = Math.max(colourMin + colourStep, Math.ceil(apparentRange[1] / colourStep) * colourStep);
    const colourBoundaries = d3.range(colourMin, colourMax + colourStep / 2, colourStep);
    const palette = d3.piecewise(d3.interpolateRgb, [
        "#3b0764", "#2563eb", "#22d3ee", "#b7e4a8", "#facc15", "#f97316", "#8b0000"
    ]);
    const color = d3.scaleQuantize().domain([colourMin, colourMax])
        .range(d3.quantize(palette, colourBoundaries.length - 1));
    extremeDrawColorLegend("#extreme-heatmap-legend", color,
        "Mean maximum apparent temperature (°C) · 3°C intervals", colourBoundaries);

    // Context lines show annual mean apparent Tmax; the brush filters all three maps.
    const annualMeans = d3.rollups(
        rawParsedWeather.filter(d => Number.isFinite(d.apparentTempMax)),
        rows => d3.mean(rows, d => d.apparentTempMax), d => d.city, d => Number(d.year)
    ).flatMap(([city, years]) => years.map(([year, value]) => ({ city, year, value })));
    const margin = { left: 60, right: 40 };
    const overviewWidth = 850 - margin.left - margin.right;
    const overviewX = d3.scaleLinear().domain([fullYears[0] - 0.5, fullYears[1] + 0.5]).range([0, overviewWidth]);
    const overviewY = d3.scaleLinear().domain(d3.extent(annualMeans, d => d.value)).nice().range([55, 5]);
    const cityColor = extremeCityColorScale();
    const overview = d3.select("#extremeHeatmapBrush").append("svg")
        .attr("width", 850).attr("height", 110).attr("viewBox", "0 0 850 110")
        .attr("role", "img").attr("aria-label", "Annual mean maximum apparent temperature: select a year range for all heatmaps")
        .append("g").attr("transform", `translate(${margin.left},20)`);
    overview.append("rect").attr("width", overviewWidth).attr("height", 60).attr("fill", "#f8fafc");
    overview.append("text").attr("x", 0).attr("y", -8)
        .attr("fill", "#475569").attr("font-size", 11)
        .text("Mean apparent Tmax (°C) · Drag to select years:");
    EXTREME_CITIES.forEach(city => {
        overview.append("path").datum(annualMeans.filter(d => d.city === city).sort((a, b) => a.year - b.year))
            .attr("class", "extreme-overview-city").attr("data-city", city)
            .attr("fill", "none").attr("stroke", cityColor(city)).attr("stroke-width", 1.5)
            .attr("d", d3.line().x(d => overviewX(d.year)).y(d => overviewY(d.value)));
    });
    overview.append("g").attr("class", "axis").attr("transform", "translate(0,60)")
        .call(d3.axisBottom(overviewX).tickValues(d3.range(fullYears[0], fullYears[1] + 1)).tickFormat(d3.format("d")));
    const brush = d3.brushX().handleSize(8).extent([[0, 0], [overviewWidth, 60]])
        .on("brush end", event => {
            if (!event.sourceEvent) return;
            selectedYears = getExtremeInclusiveYearRange(event.selection && event.selection.map(overviewX.invert), fullYears);
            render();
            if (event.type === "end") {
                brushGroup.call(brush.move, event.selection
                    ? [overviewX(selectedYears[0] - 0.5), overviewX(selectedYears[1] + 0.5)] : null);
                // The chosen years become the global time window, so every other chart follows.
                DashSync.setYears(selectedYears[0], selectedYears[1], "heatmap");
            }
        });
    const brushGroup = overview.append("g").attr("class", "extreme-brush").call(brush);
    document.getElementById("extremeHeatmapResetRange").addEventListener("click", () => {
        selectedYears = fullYears.slice();
        brushGroup.call(brush.move, null);
        render();
        DashSync.setRange(DashSync.full(), "heatmap");
    });

    // Follow the global time window and season set by any other chart.
    DashSync.on(detail => {
        if (detail.source === "init") return;
        if (detail.keys.includes("range") && detail.source !== "heatmap") {
            const [first, last] = DashSync.years();
            selectedYears = [Math.max(first, fullYears[0]), Math.min(last, fullYears[1])];
            const whole = selectedYears[0] === fullYears[0] && selectedYears[1] === fullYears[1];
            brushGroup.call(brush.move, whole ? null
                : [overviewX(selectedYears[0] - 0.5), overviewX(selectedYears[1] + 0.5)]);
        }
        render();
    });

    function render() {
        tooltip.hide();
        document.getElementById("extremeHeatmapYearRange").textContent = (selectedYears[0] === selectedYears[1]
            ? `Showing ${selectedYears[0]}` : `Showing ${selectedYears[0]}–${selectedYears[1]}`) +
            (DashSync.quarter() ? ` · ${DashSync.season().label}` : "");
        overview.selectAll(".extreme-overview-city")
            .style("display", function() { return selectedCities.has(this.dataset.city) ? null : "none"; });
        const host = d3.select("#extreme-heatmap");
        host.selectAll("*").remove();
        const key = `${selectedYears}|${DashSync.quarter()}`;
        if (key !== cellKey) {
            const fullPeriod = selectedYears[0] === fullYears[0] && selectedYears[1] === fullYears[1] && !DashSync.quarter();
            const cells = fullPeriod ? fullCells : getExtremeHeatmapCells(rawParsedWeather.filter(d =>
                Number(d.year) >= selectedYears[0] && Number(d.year) <= selectedYears[1] && DashSync.inSeason(d)
            ));
            lookup = new Map(cells.map(d => [`${d.city}-${d.tempBin}-${d.humidityBin}`, d]));
            cellKey = key;
        }
        const cities = EXTREME_CITIES.filter(city => selectedCities.has(city));
        if (!cities.length) {
            host.append("p").attr("class", "extreme-note").text("Select a city to display its heatmap.");
            return;
        }
        cities.forEach(city => {
            const card = host.append("div").attr("class", "extreme-heatmap-card");
            card.append("h4").text(city);
            const chart = card.append("div").attr("class", "extreme-chart");
            const { plot, width, height } = extremeCreateSvg(chart.node(), 350,
                `${city}: apparent temperature by maximum air temperature and mean humidity, ${selectedYears[0]}–${selectedYears[1]}`,
                { top: 15, right: 15, bottom: 60, left: 55 }, 380);
            const x = d3.scaleBand().domain(temperatureBins).range([0, width]);
            const y = d3.scaleBand().domain(humidityBins).range([height, 0]);
            plot.append("g").attr("class", "axis").attr("transform", `translate(0,${height})`)
                .call(d3.axisBottom(x).tickValues(temperatureBins.filter((d, i) => i % 3 === 0)).tickSizeOuter(0));
            plot.append("g").attr("class", "axis")
                .call(d3.axisLeft(y).tickValues(humidityBins.filter((d, i) => i % 2 === 0)).tickSizeOuter(0));
            plot.append("text").attr("class", "extreme-axis-label").attr("x", width / 2)
                .attr("y", height + 43).attr("text-anchor", "middle").text("Daily maximum temperature (°C)");
            plot.append("text").attr("class", "extreme-axis-label").attr("transform", "rotate(-90)")
                .attr("x", -height / 2).attr("y", -40).attr("text-anchor", "middle").text("Daily mean humidity (%)");
            const grid = temperatureBins.flatMap(tempBin => humidityBins.map(humidityBin =>
                lookup.get(`${city}-${tempBin}-${humidityBin}`) || { city, tempBin, humidityBin, count: 0 }
            ));
            const description = d => {
                const humidityEnd = d.humidityBin + 5;
                return `<strong>${d.city}</strong><br>Air Tmax: ${d.tempBin}–${d.tempBin + 2}°C<br>` +
                    `Mean humidity: ${d.humidityBin}–${humidityEnd}%<br>` +
                    (d.count ? `Days: ${d.count}<br>Mean apparent Tmax: ${d.apparentMean.toFixed(1)}°C` : "No observations");
            };
            const marks = plot.selectAll("rect").data(grid).join("rect")
                .attr("x", d => x(d.tempBin)).attr("y", d => y(d.humidityBin))
                .attr("width", x.bandwidth()).attr("height", y.bandwidth())
                .attr("fill", d => d.count ? color(d.apparentMean) : "#f1f5f9")
                .attr("class", "extreme-heatmap-cell")
                .on("pointerenter", (event, d) => tooltip.show(event, description(d)))
                .on("pointermove", (event, d) => tooltip.show(event, description(d)))
                .on("pointerleave", tooltip.hide);
            // Keep a screen-reader description without a second, native hover tooltip.
            marks.attr("role", "img").attr("aria-label", d => d.count
                ? `${city}, ${d.tempBin}–${d.tempBin + 2}°C, ${d.humidityBin}–${d.humidityBin + 5}% RH: ${d.apparentMean.toFixed(1)}°C apparent, ${d.count} days`
                : "No observations");
        });
    }
    render();
}
