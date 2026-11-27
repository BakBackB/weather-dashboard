// Temperature tab (RQ1): chart "2015–2025: El Niño and La Niña" (monthly anomalies, ENSO periods,
// brush to zoom). Uses the helpers from temperatureShared.js and the NOAA index in data/noaa_oceanic_nino_index.csv.

function drawTemperatureElNino() {
    const color = cityColorScale();
    const tooltip = createTooltip();
    const format = v => v.toFixed(1);
    const formatMonth = d3.timeFormat("%b %Y");

    function drawTimeline(oni) {
        const margin = { top: 54, right: 20, bottom: 30, left: 110 };
        const { svg, width, height } = createSvg("#temperature-timeline-chart", 432, margin);

        const mainHeight = 220;
        const contextTop = mainHeight + 50;
        const contextHeight = height - contextTop;

        // 3-month centred mean, matching the 3-month seasons of the El Niño index.
        const series = Array.from(d3.group(monthlyAnomalies(), d => d.city), ([city, months]) => ({
            city,
            values: months.map((d, i) => ({
                date: d.date,
                anomaly: average(months.slice(Math.max(0, i - 1), i + 2), m => m.anomaly)
            }))
        }));

        const start = series[0].values[0].date;
        const end = d3.timeMonth.offset(series[0].values[series[0].values.length - 1].date, 1);
        const limit = d3.max(series, s => d3.max(s.values, d => Math.abs(d.anomaly)));

        const x = d3.scaleTime().domain([start, end]).range([0, width]);
        const xContext = x.copy();
        const y = d3.scaleLinear().domain([-limit, limit]).nice().range([mainHeight, 0]);
        const yContext = y.copy().range([contextHeight, 0]);

        // Merge consecutive El Niño (ONI >= +0.5) or La Niña (ONI <= -0.5) months into periods.
        const periods = [];
        oni.map(d => ({ date: new Date(+d.year, +d.month - 1, 1), oni: +d.oni }))
            .filter(d => d.date >= start && d.date < end)
            .forEach(d => {
                const phase = d.oni >= 0.5 ? "El Niño" : d.oni <= -0.5 ? "La Niña" : null;
                const last = periods[periods.length - 1];
                if (!phase) return;
                if (last && last.phase === phase && +last.end === +d.date) {
                    last.end = d3.timeMonth.offset(d.date, 1);
                    if (Math.abs(d.oni) > Math.abs(last.peak)) last.peak = d.oni;
                } else {
                    periods.push({ phase, start: d.date, end: d3.timeMonth.offset(d.date, 1), peak: d.oni });
                }
            });

        const phaseColor = { "El Niño": "#dcedc8", "La Niña": "#e2e8f0" };

        // Everything that moves when zooming is clipped to the plot width.
        svg.append("clipPath").attr("id", "temperature-timeline-clip")
            .append("rect").attr("width", width).attr("height", mainHeight);
        const plot = svg.append("g").attr("clip-path", "url(#temperature-timeline-clip)");

        const shading = plot.append("g")
            .selectAll("rect")
            .data(periods).join("rect")
            .attr("height", mainHeight)
            .attr("fill", d => phaseColor[d.phase])
            .on("mouseover", (event, d) => {
                tooltip.show(event, `<strong>${d.phase}</strong><br/>` +
                    `${formatMonth(d.start)} – ${formatMonth(d3.timeMonth.offset(d.end, -1))}<br/>` +
                    `Peak Pacific index (ONI): ${d.peak > 0 ? "+" : ""}${format(d.peak)}°C`);
            })
            .on("mouseout", tooltip.hide);

        // Name of each period at its top; hidden when the period is too narrow for it.
        const phaseLabels = plot.append("g")
            .style("pointer-events", "none")
            .selectAll("text")
            .data(periods).join("text")
            .attr("y", 14)
            .attr("text-anchor", "middle")
            .attr("font-size", "10px").attr("font-weight", 600)
            .attr("fill", "#64748b")
            .text(d => d.phase);

        svg.insert("g", "g").call(g => addGrid(g, y, width));
        svg.append("line")
            .attr("x2", width)
            .attr("y1", y(0)).attr("y2", y(0))
            .attr("stroke", "#94a3b8");
        const xAxis = svg.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${mainHeight})`);
        svg.append("g").attr("class", "axis")
            .call(d3.axisLeft(y).ticks(5).tickFormat(d => (d > 0 ? "+" : "") + d + "°C"));
        addAxisLabel(svg, "Anomaly", -mainHeight / 2, -50, true);

        const line = d3.line().x(d => x(d.date)).y(d => y(d.anomaly)).curve(d3.curveMonotoneX);
        const lines = plot.append("g")
            .style("pointer-events", "none")
            .selectAll("g")
            .data(series).join("g")
            .attr("class", "temp-city")
            .attr("data-city", d => d.city)
            .append("path")
            .attr("class", "line")
            .attr("stroke", d => color(d.city));

        // Legend above the plot.
        const legendItems = [
            { label: "El Niño", fill: phaseColor["El Niño"] },
            { label: "La Niña", fill: phaseColor["La Niña"] },
            ...TEMP_CITIES.map(city => ({ label: city, stroke: color(city) }))
        ];
        const legend = svg.append("g")
            .attr("transform", "translate(0,-46)")
            .selectAll("g")
            .data(legendItems).join("g")
            .attr("transform", (d, i) => `translate(${i * 120},0)`);
        legend.filter(d => d.fill).append("rect")
            .attr("width", 14).attr("height", 14)
            .attr("fill", d => d.fill);
        legend.filter(d => d.stroke).append("line")
            .attr("x2", 14).attr("y1", 7).attr("y2", 7)
            .attr("stroke", d => d.stroke).attr("stroke-width", 2.5);
        legend.append("text")
            .attr("x", 20).attr("y", 11)
            .attr("font-size", "12px").attr("fill", "#475569")
            .text(d => d.label);

        // Hover guide: a dashed vertical line at the nearest month and every checked city's anomaly there.
        const short = { "Hanoi": "Hanoi", "Da Nang": "Da Nang", "Ho Chi Minh City": "HCMC" };
        const signed = v => (v > 0 ? "+" : "") + format(v);
        plot.insert("rect", ":first-child")  // catches the mouse outside the shaded periods
            .attr("width", width).attr("height", mainHeight)
            .attr("fill", "transparent");
        const guide = plot.append("line")
            .attr("y1", 0).attr("y2", mainHeight)
            .attr("stroke", "#64748b")
            .attr("stroke-dasharray", "4,4")
            .attr("display", "none")
            .style("pointer-events", "none");
        const readout = svg.append("text")
            .attr("x", width).attr("y", -12)
            .attr("text-anchor", "end")
            .attr("font-size", "11px").attr("fill", "#475569");
        // As in Lab 06: x.invert turns the pointer position into a date, the bisector finds the closest month.
        const bisectDate = d3.bisector(d => d.date).center;
        plot.on("mousemove", event => {
            const [px] = d3.pointer(event, svg.node());
            const i = bisectDate(series[0].values, x.invert(Math.max(0, Math.min(width, px))));
            const date = series[0].values[i].date;
            const at = series.map(s => ({ city: s.city, d: s.values[i] }));
            const period = periods.find(p => p.start <= date && date < p.end);
            const checked = Array.from(document.querySelectorAll("#cityFilters input:checked")).map(cb => cb.value);
            guide.attr("x1", x(date)).attr("x2", x(date)).attr("display", null);
            readout.text(`${formatMonth(date)}${period ? ` (${period.phase})` : ""} — ` + at
                .filter(v => checked.includes(v.city))
                .map(v => `${short[v.city]}: ${signed(v.d.anomaly)}°C`).join(" · "));
        }).on("mouseleave", () => {
            guide.attr("display", "none");
            readout.text("");
        });

        // Redraws everything that depends on the visible time range.
        function render() {
            shading.attr("x", d => x(d.start)).attr("width", d => x(d.end) - x(d.start));
            phaseLabels.attr("x", d => (x(d.start) + x(d.end)) / 2)
                .style("display", d => x(d.end) - x(d.start) < 50 ? "none" : null);
            lines.attr("d", d => line(d.values));
            xAxis.call(d3.axisBottom(x).ticks(8));
        }

        // Context strip: the full period, brush to zoom the chart above.
        const context = svg.append("g").attr("transform", `translate(0,${contextTop})`);
        const contextLine = d3.line().x(d => xContext(d.date)).y(d => yContext(d.anomaly));
        context.selectAll("path")
            .data(series).join("path")
            .attr("class", "temp-city")
            .attr("data-city", d => d.city)
            .attr("d", d => contextLine(d.values))
            .attr("fill", "none")
            .attr("stroke", d => color(d.city))
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
                x.domain(selection ? selection.map(xContext.invert) : xContext.domain());
                render();
                // A brush made by the user is the global time window (whole months); the other charts follow.
                if (sourceEvent && type === "end") {
                    if (!selection) DashSync.setRange(DashSync.full(), "elnino");
                    else {
                        const [from, to] = selection.map(xContext.invert);
                        DashSync.setRange([d3.timeMonth.round(from), d3.timeDay.offset(d3.timeMonth.round(to), -1)], "elnino");
                    }
                }
            });
        const brushGroup = context.append("g").call(brush);

        // The shared year filter zooms the timeline to that year (the season filter does not apply to a timeline).
        // The brush glides to the new range, so the chart zooms smoothly.
        function zoomToYear(animate) {
            // The global time window (set by any chart); the whole period glides out and then removes the brush.
            const whole = DashSync.isFull();
            const range = whole ? xContext.range()
                : [DashSync.range()[0], d3.timeDay.offset(DashSync.range()[1], 1)].map(xContext);
            const clear = () => {
                if (whole) brushGroup.call(brush.move, null);
            };
            if (animate) brushGroup.transition().duration(TEMP_DURATION).call(brush.move, range).on("end", clear);
            else {
                brushGroup.call(brush.move, range);
                clear();
            }
        }
        DashSync.on(detail => { if (detail.source !== "elnino") zoomToYear(true); }, ["range"]);

        render();
        zoomToYear(false);
    }

    // The El Niño index is a separate file (NOAA Oceanic Niño Index).
    d3.csv("data/noaa_oceanic_nino_index.csv")
        .then(oni => {
            drawTimeline(oni);
            applyTemperatureCityFilter();
        })
        .catch(error => console.error("Error loading El Niño index:", error));
}
