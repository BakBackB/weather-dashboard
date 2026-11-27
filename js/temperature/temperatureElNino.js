// Chart "2015–2025: El Niño and La Niña"
// Monthly temperature anomalies of the cities, El Niño and La Niña periods as shading, and a strip below to zoom.

function drawTemperatureElNino() {
    const color = cityColorScale();
    const tooltip = createTooltip();
    const formatNumber = value => value.toFixed(1);
    const formatMonth = d3.timeFormat("%b %Y");
    const formatSigned = value => (value > 0 ? "+" : "") + formatNumber(value);

    // Draws the whole chart once the El Niño index is loaded
    // oniMonths is the index as a list of { date, oni }, one entry per month.
    function drawTimeline(oniMonths) {
        const margin = { top: 54, right: 20, bottom: 30, left: 110 };
        const { svg, width, height } = createSvg("#temperature-timeline-chart", 432, margin);

        // Height of the main chart, and position and height of the zoom strip below it
        const mainHeight = 220;
        const contextTop = mainHeight + 50;
        const contextHeight = height - contextTop;

        // One series per city with the anomaly of every month
        // The anomaly is averaged over three months (previous, current, next), like the three month seasons of the index.
        const series = Array.from(d3.group(monthlyAnomalies(), entry => entry.city), ([city, months]) => ({
            city,
            values: months.map((entry, index) => ({
                date: entry.date,
                anomaly: average(months.slice(Math.max(0, index - 1), index + 2), month => month.anomaly)
            }))
        }));

        // Time range of the data and the largest anomaly (the y-axis is symmetric around 0)
        const firstMonth = series[0].values[0].date;
        const endDate = d3.timeMonth.offset(series[0].values[series[0].values.length - 1].date, 1);
        const largestAnomaly = d3.max(series, citySeries => d3.max(citySeries.values, value => Math.abs(value.anomaly)));

        // Scales of the main chart (xScale changes when zooming) and of the zoom strip (always the full range)
        const xScale = d3.scaleTime().domain([firstMonth, endDate]).range([0, width]);
        const xContext = xScale.copy();
        const yScale = d3.scaleLinear().domain([-largestAnomaly, largestAnomaly]).nice().range([mainHeight, 0]);
        const yContext = yScale.copy().range([contextHeight, 0]);

        // El Niño and La Niña periods
        // A month is El Niño when the index is at least +0.5 and La Niña when it is at most -0.5.
        // Following months of the same kind are merged into one period.
        const periods = [];
        oniMonths
            .filter(month => month.date >= firstMonth && month.date < endDate)
            .forEach(month => {
                const phase = month.oni >= 0.5 ? "El Niño" : month.oni <= -0.5 ? "La Niña" : null;
                const lastPeriod = periods[periods.length - 1];
                if (!phase) return;
                if (lastPeriod && lastPeriod.phase === phase && +lastPeriod.end === +month.date) {
                    lastPeriod.end = d3.timeMonth.offset(month.date, 1);
                    if (Math.abs(month.oni) > Math.abs(lastPeriod.peak)) lastPeriod.peak = month.oni;
                } else {
                    periods.push({ phase, start: month.date, end: d3.timeMonth.offset(month.date, 1), peak: month.oni });
                }
            });

        // Shading colour of the two phases
        const phaseColor = { "El Niño": "#dcedc8", "La Niña": "#e2e8f0" };

        // Everything that moves when zooming is drawn in plot and clipped to the plot area
        svg.append("clipPath").attr("id", "temperature-timeline-clip")
            .append("rect").attr("width", width).attr("height", mainHeight);
        const plot = svg.append("g").attr("clip-path", "url(#temperature-timeline-clip)");

        // Shading of the periods, with a tooltip
        const shading = plot.append("g")
            .selectAll("rect")
            .data(periods).join("rect")
            .attr("height", mainHeight)
            .attr("fill", period => phaseColor[period.phase])
            .on("mouseover", (event, period) => {
                tooltip.show(event, `<strong>${period.phase}</strong><br/>` +
                    `${formatMonth(period.start)} – ${formatMonth(d3.timeMonth.offset(period.end, -1))}<br/>` +
                    `Peak Pacific index (ONI): ${formatSigned(period.peak)}°C`);
            })
            .on("mouseout", tooltip.hide);

        // Name of each period at its top, hidden when the period is too narrow
        const phaseLabels = plot.append("g")
            .style("pointer-events", "none")
            .selectAll("text")
            .data(periods).join("text")
            .attr("y", 14)
            .attr("text-anchor", "middle")
            .attr("font-size", "10px").attr("font-weight", 600)
            .attr("fill", "#64748b")
            .text(period => period.phase);

        // Grid, zero line and axes
        svg.insert("g", "g").call(gridGroup => addGrid(gridGroup, yScale, width));
        svg.append("line")
            .attr("x2", width)
            .attr("y1", yScale(0)).attr("y2", yScale(0))
            .attr("stroke", "#94a3b8");
        const xAxis = svg.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${mainHeight})`);
        svg.append("g").attr("class", "axis")
            .call(d3.axisLeft(yScale).ticks(5).tickFormat(tick => (tick > 0 ? "+" : "") + tick + "°C"));
        addAxisLabel(svg, "Anomaly", -mainHeight / 2, -50, true);

        // One anomaly line per city
        const lineGenerator = d3.line()
            .x(value => xScale(value.date))
            .y(value => yScale(value.anomaly))
            .curve(d3.curveMonotoneX);
        const lines = plot.append("g")
            .style("pointer-events", "none")
            .selectAll("g")
            .data(series).join("g")
            .attr("class", "temp-city")
            .attr("data-city", citySeries => citySeries.city)
            .append("path")
            .attr("class", "line")
            .attr("stroke", citySeries => color(citySeries.city));

        // Legend above the chart
        const legendItems = [
            { label: "El Niño", fill: phaseColor["El Niño"] },
            { label: "La Niña", fill: phaseColor["La Niña"] },
            ...TEMP_CITIES.map(city => ({ label: city, stroke: color(city) }))
        ];
        const legend = svg.append("g")
            .attr("transform", "translate(0,-46)")
            .selectAll("g")
            .data(legendItems).join("g")
            .attr("transform", (item, index) => `translate(${index * 120},0)`);
        legend.filter(item => item.fill).append("rect")
            .attr("width", 14).attr("height", 14)
            .attr("fill", item => item.fill);
        legend.filter(item => item.stroke).append("line")
            .attr("x2", 14).attr("y1", 7).attr("y2", 7)
            .attr("stroke", item => item.stroke).attr("stroke-width", 2.5);
        legend.append("text")
            .attr("x", 20).attr("y", 11)
            .attr("font-size", "12px").attr("fill", "#475569")
            .text(item => item.label);

        // Hover guide
        // A dashed vertical line at the month closest to the mouse and the anomaly of every checked city above the chart.
        // xScale.invert turns the mouse position into a date and the bisector finds the closest month.
        const shortName = { "Hanoi": "Hanoi", "Da Nang": "Da Nang", "Ho Chi Minh City": "HCMC" };
        plot.insert("rect", ":first-child")  // catches the mouse outside the shaded periods
            .attr("width", width).attr("height", mainHeight)
            .attr("fill", "transparent");
        const guideLine = plot.append("line")
            .attr("y1", 0).attr("y2", mainHeight)
            .attr("stroke", "#64748b")
            .attr("stroke-dasharray", "4,4")
            .attr("display", "none")
            .style("pointer-events", "none");
        const readout = svg.append("text")
            .attr("x", width).attr("y", -12)
            .attr("text-anchor", "end")
            .attr("font-size", "11px").attr("fill", "#475569");
        const bisectDate = d3.bisector(value => value.date).center;
        plot.on("mousemove", event => {
            const [mouseX] = d3.pointer(event, svg.node());
            const monthIndex = bisectDate(series[0].values, xScale.invert(Math.max(0, Math.min(width, mouseX))));
            const date = series[0].values[monthIndex].date;
            const period = periods.find(candidate => candidate.start <= date && date < candidate.end);
            const checked = checkedCities();
            guideLine.attr("x1", xScale(date)).attr("x2", xScale(date)).attr("display", null);
            readout.text(`${formatMonth(date)}${period ? ` (${period.phase})` : ""} — ` + series
                .filter(citySeries => checked.includes(citySeries.city))
                .map(citySeries => `${shortName[citySeries.city]}: ${formatSigned(citySeries.values[monthIndex].anomaly)}°C`)
                .join(" · "));
        }).on("mouseleave", () => {
            guideLine.attr("display", "none");
            readout.text("");
        });

        // Redraws everything that depends on the visible time range
        function render() {
            shading.attr("x", period => xScale(period.start)).attr("width", period => xScale(period.end) - xScale(period.start));
            phaseLabels.attr("x", period => (xScale(period.start) + xScale(period.end)) / 2)
                .style("display", period => xScale(period.end) - xScale(period.start) < 50 ? "none" : null);
            lines.attr("d", citySeries => lineGenerator(citySeries.values));
            // A short range (for example one season) gets one label per month, because the data is monthly
            const visibleDays = (xScale.domain()[1] - xScale.domain()[0]) / (24 * 60 * 60 * 1000);
            xAxis.call(visibleDays < 200
                ? d3.axisBottom(xScale).ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat("%B %Y"))
                : d3.axisBottom(xScale).ticks(8));
        }

        // Zoom strip below the chart
        // It always shows the full period, dragging in it (brush) sets the range of the chart above.
        const context = svg.append("g").attr("transform", `translate(0,${contextTop})`);
        const contextLine = d3.line()
            .x(value => xContext(value.date))
            .y(value => yContext(value.anomaly));
        context.selectAll("path")
            .data(series).join("path")
            .attr("class", "temp-city")
            .attr("data-city", citySeries => citySeries.city)
            .attr("d", citySeries => contextLine(citySeries.values))
            .attr("fill", "none")
            .attr("stroke", citySeries => color(citySeries.city))
            .attr("stroke-width", 1)
            .attr("opacity", 0.7);
        context.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${contextHeight})`)
            .call(d3.axisBottom(xContext).ticks(d3.timeYear).tickFormat(d3.timeFormat("%Y")));
        context.append("text")
            .attr("x", -8).attr("y", contextHeight / 2)
            .attr("dy", "0.35em")
            .attr("text-anchor", "end")
            .attr("font-size", "11px").attr("fill", "#64748b")
            .text("Drag to zoom:");
        const brush = d3.brushX()
            .extent([[0, 0], [width, contextHeight]])
            .on("brush end", ({ selection, sourceEvent, type }) => {
                xScale.domain(selection ? selection.map(xContext.invert) : xContext.domain());
                render();

                // On the dashboard a range dragged by the user becomes the shared time window (whole months)
                if (sourceEvent && type === "end" && dashboardSyncActive()) {
                    if (!selection) DashSync.setRange(DashSync.full(), "elnino");
                    else {
                        const [fromDate, toDate] = selection.map(xContext.invert);
                        DashSync.setRange([d3.timeMonth.round(fromDate), d3.timeDay.offset(d3.timeMonth.round(toDate), -1)], "elnino");
                    }
                }
            });
        const brushGroup = context.append("g").call(brush);

        // Zooms the chart to the current time window
        // On the dashboard this is the shared time window (set by any chart), on index.html the selected year.
        // When the window is one whole year, the selected season narrows it to the three months of that season.
        // With "All years" the season is not used, because the chart shows a continuous timeline.
        // With animate the brush glides to the new range. The whole period glides out and then removes the brush.
        function zoomToYear(animate) {
            const year = temperatureFilters.year;
            const seasonMonths = temperatureFilters.quarter.months;

            // Start and end of the window, both null for the whole period
            let zoomStart = null;
            let zoomEnd = null;
            if (dashboardSyncActive()) {
                if (!DashSync.isFull()) {
                    zoomStart = DashSync.range()[0];
                    zoomEnd = d3.timeDay.offset(DashSync.range()[1], 1);
                }
            } else if (year !== null) {
                zoomStart = new Date(year, 0, 1);
                zoomEnd = new Date(year + 1, 0, 1);
            }

            // Season inside a whole year
            const isWholeYear = year !== null && zoomStart !== null &&
                +zoomStart === +new Date(year, 0, 1) && +zoomEnd === +new Date(year + 1, 0, 1);
            if (isWholeYear && seasonMonths.length < 12) {
                zoomStart = new Date(year, seasonMonths[0], 1);
                zoomEnd = new Date(year, seasonMonths[seasonMonths.length - 1] + 1, 1);
            }

            const wholePeriod = zoomStart === null;
            const range = wholePeriod ? xContext.range() : [zoomStart, zoomEnd].map(xContext);
            const clearBrush = () => {
                if (wholePeriod) brushGroup.call(brush.move, null);
            };
            if (animate) brushGroup.transition().duration(TEMP_DURATION).call(brush.move, range).on("end", clearBrush);
            else {
                brushGroup.call(brush.move, range);
                clearBrush();
            }
        }
        document.addEventListener("temperatureFiltersChanged", () => zoomToYear(true));

        render();
        zoomToYear(false);
    }

    // Load the El Niño index and draw the chart once it is loaded
    // Every row becomes { date, oni } with real numbers. The date is the first day of the month
    // (the file counts months from 1, JavaScript from 0). Rows with a missing or broken value are left out.
    d3.csv("data/noaa_oceanic_nino_index.csv", row => ({
        date: new Date(+row.year, +row.month - 1, 1),
        oni: +row.oni
    }))
        .then(oniMonths => oniMonths.filter(month => !isNaN(month.date) && !isNaN(month.oni)))
        .then(oniMonths => {
            drawTimeline(oniMonths);
            applyTemperatureCityFilter();
        })
        .catch(error => console.error("Error loading El Niño index:", error));
}
