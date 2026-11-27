// Extra linked views for dashboard.html (juxtaposed / side-by-side views that share one data set).
//
// drawRainfallCalendarCompare: the daily rainfall calendar of every switched-on city, stacked and drawn
// with ONE colour scale, so the three cities can be compared directly. Hovering a day in one calendar
// marks the same date in the others (linked highlighting). Called by drawCalendarHeatmap() in main.js
// while no single city has been chosen with an annual bar.

function drawRainfallCalendarCompare(container) {
    const years = DashSync.years();
    const year = DashSync.singleYear() ?? years[1];
    const cities = rainfallCities.filter(city => rainfallSelectedCities.has(city));
    const season = DashSync.season();

    if (cities.length === 0) {
        container.append("p").text("Select at least one city to compare the rainfall calendars.");
        return;
    }

    const rows = rawParsedWeather.filter(d => d.date.getFullYear() === year && cities.includes(d.city));
    const byCity = d3.group(rows, d => d.city);
    const maxRainfall = d3.max(rows, d => d.precipitation) || 1;   // one scale for all cities
    const byDay = d3.group(rows, d => d.dayStr);

    const cellSize = 14;
    const gap = 3;
    const step = cellSize + gap;
    const margin = { top: 34, right: 20, bottom: 6, left: 46 };
    const rowHeight = 7 * step;
    const cityBlock = rowHeight + margin.top + margin.bottom;
    const legendHeight = 46;
    const width = margin.left + 54 * step + margin.right;
    const height = cities.length * cityBlock + legendHeight;
    const yearStart = new Date(year, 0, 1);
    const weekIndex = date => d3.timeWeek.count(d3.timeYear(date), date);

    const note = DashSync.singleYear() === null
        ? `Showing ${year}, the last year of the selected time window (${DashSync.rangeLabel()}). `
        : "";
    container.append("p").attr("class", "calendar-compare-note")
        .text(`${note}All cities share one colour scale (0–${d3.format(",.0f")(maxRainfall)} mm per day), so the same colour always means the same rainfall. ` +
            "Hover a day to see that date in every city; click a day for details." +
            (DashSync.quarter() ? ` Months outside ${season.label} are faded.` : "") +
            (DashSync.condition() ? ` Days outside the scatter-plot filter (${DashSync.conditionLabel()}) are faded.` : ""));

    const svg = container.append("svg")
        .attr("class", "calendar-compare")
        .attr("width", width).attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", `Daily rainfall calendars of ${cities.join(", ")} in ${year}`);

    const hoverMarks = [];   // every cell of every city, for linked highlighting

    cities.forEach((city, index) => {
        const cityRows = (byCity.get(city) || []).slice().sort((a, b) => a.date - b.date);
        const cityColor = rainfallCityColors[city];
        const color = d3.scaleSequential()
            .domain([0, maxRainfall])
            .interpolator(d3.interpolateRgb("#f8fafc", cityColor));
        const group = svg.append("g").attr("transform", `translate(${margin.left},${index * cityBlock + margin.top})`);

        group.append("text")
            .attr("x", -margin.left + 4).attr("y", -16)
            .attr("font-size", "13px").attr("font-weight", 700).attr("fill", cityColor)
            .text(`${city} · ${year}`);

        group.selectAll(".month-name").data(d3.range(12)).join("text")
            .attr("x", month => weekIndex(new Date(year, month, 1)) * step)
            .attr("y", -4)
            .attr("font-size", "10px").attr("fill", "#64748b")
            .text(month => d3.timeFormat("%b")(new Date(year, month, 1)));

        group.selectAll(".day-name").data(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).join("text")
            .attr("x", -8).attr("y", (_, i) => i * step + cellSize - 2)
            .attr("text-anchor", "end").attr("font-size", "10px").attr("fill", "#64748b")
            .text(name => name);

        const cells = group.selectAll(".rainfall-day").data(cityRows, d => d.dayStr).join("rect")
            .attr("class", "rainfall-day")
            .attr("x", d => weekIndex(d.date) * step)
            .attr("y", d => d.date.getDay() * step)
            .attr("width", cellSize).attr("height", cellSize).attr("rx", 2)
            .attr("fill", d => color(d.precipitation))
            .attr("stroke", d => d.precipitation === 0 ? "#cbd5e1" : "none")
            .attr("opacity", d => season.months.includes(d.date.getMonth()) && DashSync.inCondition(d) ? 1 : 0.2)
            .style("cursor", "pointer")
            .on("click", (event, d) => showRainfallDetail(d))
            .on("pointerenter", (event, d) => {
                // Linked highlighting: outline this date in every calendar, list all cities in the tooltip.
                hoverMarks.forEach(mark => mark.classed("compare-hover", other => other.dayStr === d.dayStr));
                const list = (byDay.get(d.dayStr) || []).map(day =>
                    `<span style="color:${rainfallCityColors[day.city]}">● ${day.city}</span>: ` +
                    `<strong>${day.precipitation === 0 ? "0" : d3.format(",.1f")(day.precipitation)} mm</strong>`);
                const tooltip = getRainfallTooltip();
                tooltip.interrupt()
                    .html(`<strong>${d3.timeFormat("%A, %d %B %Y")(d.date)}</strong><br>${list.join("<br>")}`)
                    .attr("aria-hidden", "false");
                positionRainfallTooltip(event);
                tooltip.transition().duration(rainfallAnimationDuration(120)).style("opacity", 0.96);
            })
            .on("pointermove", event => positionRainfallTooltip(event))
            .on("pointerleave", () => {
                hoverMarks.forEach(mark => mark.classed("compare-hover", false));
                hideRainfallTooltip();
            });
        hoverMarks.push(cells);

        // Monthly totals under each calendar would hide the pattern; a thin line marks month boundaries instead.
        group.selectAll(".month-tick").data(d3.range(1, 12)).join("line")
            .attr("x1", month => weekIndex(new Date(year, month, 1)) * step - gap / 2)
            .attr("x2", month => weekIndex(new Date(year, month, 1)) * step - gap / 2)
            .attr("y1", -14).attr("y2", rowHeight)
            .attr("stroke", "#e2e8f0");
    });

    // One legend for the shared scale.
    const legend = svg.append("g").attr("transform", `translate(${margin.left},${cities.length * cityBlock + 12})`);
    const gradientId = "calendar-compare-gradient";
    const gradient = svg.append("defs").append("linearGradient").attr("id", gradientId);
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#f8fafc");
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#334155");
    legend.append("rect").attr("width", 260).attr("height", 10).attr("rx", 2).attr("fill", `url(#${gradientId})`);
    legend.append("text").attr("y", 26).attr("font-size", "10px").attr("fill", "#64748b").text("0 mm");
    legend.append("text").attr("x", 260).attr("y", 26).attr("text-anchor", "end")
        .attr("font-size", "10px").attr("fill", "#64748b").text(`${d3.format(",.0f")(maxRainfall)} mm (darker = wetter; hue = city)`);
}
