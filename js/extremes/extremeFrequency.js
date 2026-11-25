function drawExtremeFrequency() {
    const annual = getAnnualExtremeData();
    const monthly = getMonthlyExtremeData();
    const months = EXTREME_MONTHS;
    const cities = EXTREME_CITIES;
    const color = extremeCityColorScale();
    const tooltip = extremeCreateTooltip();
    const panels = [
        { container: "#extreme-frequency-hot", path: "#extreme-frequency-hot-path", field: "hotDays", label: "Hot days (>35°C)", selected: null },
        { container: "#extreme-frequency-rain", path: "#extreme-frequency-rain-path", field: "heavyRainDays", label: "Heavy rainfall days (>50 mm)", selected: null }
    ];
    ["#extremeFrequencyLegend", "#extremeRainFrequencyLegend"].forEach(container => {
        extremeDrawLegend(container, cities, color, "extreme-frequency");
    });

    function drawPanel(panel) {
        tooltip.hide();
        const { container, path, field, label, selected } = panel;
        const rows = selected
            ? monthly.filter(d => d.city === selected.city && d.year === selected.year)
            : annual;
        const navigation = d3.select(path);
        navigation.selectAll("*").remove();
        navigation.attr("hidden", selected ? null : true);
        if (selected) {
            navigation.append("button")
                .attr("type", "button").attr("class", "extreme-path-step")
                .attr("aria-controls", container.slice(1))
                .attr("aria-label", "Back to all cities and years").text("← All years")
                .on("click", event => {
                    panel.selected = null;
                    drawPanel(panel);
                    if (event.detail === 0) {
                        // Restore keyboard focus to the annual bar that opened this view.
                        d3.select(container).selectAll(".extreme-frequency-item")
                            .filter(d => d.city === selected.city && d.year === selected.year).node()?.focus();
                    }
                });
            navigation.append("span").attr("class", "extreme-path-sep").attr("aria-hidden", "true").text("›");
            navigation.append("span").attr("class", "extreme-path-current").attr("aria-current", "location")
                .text(`${selected.city} · ${selected.year} · ${selected[field]} days`);
        }

        const { svg, plot, width, height } = extremeCreateSvg(container, 330,
            selected ? `${label}: monthly counts for ${selected.city}, ${selected.year}` : `${label}: annual counts by city`);
        svg.attr("role", "group");
        if (!rows.length) {
            plot.append("text").attr("class", "extreme-axis-label").attr("y", 25)
                .text("No observations are available.");
            return;
        }
        const keys = selected ? d3.range(12) : Array.from(new Set(rows.map(d => d.year))).sort((a, b) => a - b);
        const x = d3.scaleBand().domain(keys).range([0, width]).padding(0.18);
        const cityX = d3.scaleBand().domain(cities).range([0, x.bandwidth()]).padding(0.12);
        // Each level keeps its own fixed scale across cities and years.
        const y = d3.scaleLinear().domain([0, d3.max(selected ? monthly : annual, d => d[field]) || 1])
            .nice().range([height, 0]);
        extremeAddAxes(plot, x, y, width, height, selected ? "Month" : "Year", "Number of days",
            d3.axisBottom(x).tickFormat(selected ? month => months[month] : d3.format("d")),
            d3.axisLeft(y).tickValues(y.ticks(Math.min(5, y.domain()[1]))).tickFormat(d3.format("d")));

        const barX = d => selected ? x(d.month) : x(d.year) + cityX(d.city);
        const barWidth = selected ? x.bandwidth() : cityX.bandwidth();
        const describe = d => `${d.city}, ${selected ? `${months[d.month]} ` : ""}${d.year}: ${d[field]} ${label}`;
        const marks = plot.append("g").selectAll("g").data(rows).join("g")
            .attr("class", "extreme-frequency-item").attr("tabindex", 0)
            .attr("role", selected ? "img" : "button")
            .attr("aria-label", d => describe(d) + (selected ? "" : ". Show monthly counts"));
        marks.append("rect")
            .attr("class", d => d[field] === 0 ? "extreme-frequency-bar extreme-zero-bar" : "extreme-frequency-bar")
            .attr("x", barX).attr("y", d => d[field] === 0 ? height - 2 : y(d[field]))
            .attr("width", barWidth).attr("height", d => d[field] === 0 ? 2 : height - y(d[field]))
            .attr("fill", d => d[field] === 0 ? "none" : color(d.city)).attr("stroke", d => color(d.city));
        // Give zero and very short bars enough space to hover, click or tap.
        marks.append("rect").attr("class", "extreme-frequency-hit")
            .attr("x", barX).attr("y", d => Math.min(y(d[field]), height - 16))
            .attr("width", barWidth).attr("height", d => Math.max(16, height - y(d[field])))
            .attr("fill", "transparent");
        marks.filter(d => selected || d[field] === 0).append("text")
            .attr("class", "extreme-frequency-value")
            .attr("x", d => barX(d) + barWidth / 2)
            .attr("y", d => y(d[field]) - 8).attr("text-anchor", "middle")
            .attr("fill", d => color(d.city)).text(d => d[field]);
        const show = (event, d) => tooltip.show(event,
            `<strong>${d.city}, ${selected ? `${months[d.month]} ` : ""}${d.year}</strong><br>${label}: ${d[field]} days`);
        marks.on("pointerenter", show).on("pointermove", show).on("pointerleave", tooltip.hide)
            .on("focus", show).on("blur", tooltip.hide);
        if (!selected) {
            const openMonths = (event, d) => {
                panel.selected = d;
                drawPanel(panel);
                if (event.type === "keydown") {
                    d3.select(path).selectAll("button").node()?.focus();
                }
            };
            marks.on("click", openMonths).on("keydown", (event, d) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openMonths(event, d);
                }
            });
        }
    }
    panels.forEach(drawPanel);
}
