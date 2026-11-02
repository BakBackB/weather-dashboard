// Key insights for RQ1 in two charts: a typical year ("fingerprint") and 2015–2025 over time.
// Uses the shared helpers from temperature.js.

function drawTemperatureInsights() {
    const color = cityColorScale();
    const tooltip = createTooltip();
    const format = v => v.toFixed(1);
    const formatMonth = d3.timeFormat("%b %Y");

    // 10-year averages per city and calendar month.
    const climate = d3.rollups(
        rawParsedWeather,
        v => ({
            mean: d3.mean(v, d => d.tempMean),
            max: d3.mean(v, d => d.tempMax),
            min: d3.mean(v, d => d.tempMin),
            humidity: d3.mean(v, d => d.humidity),
            sunshine: d3.mean(v, d => d.sunshineHours)
        }),
        d => d.city,
        d => d.date.getMonth()
    ).flatMap(([city, months]) => months.map(([month, t]) => ({ city, month, ...t, range: t.max - t.min })));

    const byCity = d3.group(climate, d => d.city);

    // Days on which the daily mean fell by 4 °C or more ("sudden drops").
    const drops = d3.groups(rawParsedWeather, d => d.city).flatMap(([city, days]) => {
        const sorted = days.slice().sort((a, b) => a.date - b.date);
        return sorted.slice(1)
            .map((d, i) => ({ city, date: d.date, from: sorted[i].tempMean, to: d.tempMean }))
            .filter(d => d.to - d.from <= -4);
    });

    // --- Chart 1: a typical year (bar = average min to max, tick = mean) ---
    function drawFingerprint() {
        const margin = { top: 20, right: 20, bottom: 40, left: 60 };
        const { svg, width, height } = createSvg("#temperature-fingerprint-chart", 400, margin);

        const x = d3.scaleBand().domain(d3.range(12)).range([0, width]).padding(0.2);
        const xCity = d3.scaleBand().domain(TEMP_CITIES).range([0, x.bandwidth()]).padding(0.15);
        const y = d3.scaleLinear()
            .domain([Math.floor(d3.min(climate, d => d.min)) - 1, Math.ceil(d3.max(climate, d => d.max)) + 1])
            .range([height, 0]);
        const center = d => x(d.month) + xCity(d.city) + xCity.bandwidth() / 2;

        addGrid(svg, y, width);
        svg.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).tickFormat(m => MONTH_LABELS[m]));
        svg.append("g").attr("class", "axis").call(d3.axisLeft(y));
        addAxisLabel(svg, "Temperature (°C)", -height / 2, -45, true);

        const cities = svg.selectAll(".temp-city")
            .data(Array.from(byCity)).join("g")
            .attr("class", "temp-city")
            .attr("data-city", d => d[0]);

        cities.append("g")
            .selectAll("rect")
            .data(d => d[1]).join("rect")
            .attr("x", d => x(d.month) + xCity(d.city))
            .attr("y", d => y(d.max))
            .attr("width", xCity.bandwidth())
            .attr("height", d => y(d.min) - y(d.max))
            .attr("rx", 2)
            .attr("fill", d => color(d.city))
            .attr("fill-opacity", 0.35)
            .on("mouseover", (event, d) => {
                tooltip.show(event, `<strong>${d.city}</strong> · ${MONTH_LABELS[d.month]}<br/>` +
                    `Mean: ${format(d.mean)}°C<br/>Avg. min–max: ${format(d.min)}–${format(d.max)}°C<br/>` +
                    `Daily range: ${format(d.range)}°C<br/>` +
                    `Humidity: ${Math.round(d.humidity)}% · Sunshine: ${format(d.sunshine)} h/day`);
            })
            .on("mouseout", tooltip.hide);

        const means = cities.append("g")
            .style("pointer-events", "none");

        means.append("path")
            .attr("d", d => d3.line().x(center).y(m => y(m.mean))(d[1]))
            .attr("fill", "none")
            .attr("stroke", d => color(d[0]))
            .attr("stroke-width", 1.2)
            .attr("opacity", 0.6);

        means.selectAll("line")
            .data(d => d[1]).join("line")
            .attr("x1", d => x(d.month) + xCity(d.city) - 1)
            .attr("x2", d => x(d.month) + xCity(d.city) + xCity.bandwidth() + 1)
            .attr("y1", d => y(d.mean)).attr("y2", d => y(d.mean))
            .attr("stroke", d => color(d.city))
            .attr("stroke-width", 2.5);
    }

    // --- Chart 2: 2015–2025 (anomalies, El Niño / La Niña, sudden drops) with a brush to zoom ---
    function drawTimeline(oni) {
        const margin = { top: 36, right: 20, bottom: 30, left: 110 };
        const { svg, width, height } = createSvg("#temperature-timeline-chart", 490, margin);

        const mainHeight = 220;
        const laneTop = mainHeight + 48;
        const laneHeight = 16;
        const contextTop = laneTop + 3 * laneHeight + 30;
        const contextHeight = height - contextTop;

        // 3-month centred mean, matching the 3-month seasons of the El Niño index.
        const series = d3.groups(monthlyAnomalies(), d => d.city).map(([city, months]) => ({
            city,
            values: months.map((d, i) => ({
                date: d.date,
                anomaly: d3.mean(months.slice(Math.max(0, i - 1), i + 2), m => m.anomaly)
            }))
        }));

        const start = series[0].values[0].date;
        const end = d3.timeMonth.offset(series[0].values[series[0].values.length - 1].date, 1);
        const limit = d3.max(series, s => d3.max(s.values, d => Math.abs(d.anomaly)));

        const x = d3.scaleTime().domain([start, end]).range([0, width]);
        const xContext = x.copy();
        const y = d3.scaleLinear().domain([-limit, limit]).nice().range([mainHeight, 0]);
        const yContext = y.copy().range([contextHeight, 0]);
        const lane = d3.scaleBand().domain(TEMP_CITIES).range([laneTop, laneTop + 3 * laneHeight]);

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

        const phaseColor = { "El Niño": "#fecaca", "La Niña": "#bfdbfe" };

        // Everything that moves when zooming is clipped to the plot width.
        svg.append("clipPath").attr("id", "temperature-timeline-clip")
            .append("rect").attr("width", width).attr("height", laneTop + 3 * laneHeight);
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

        // Sudden drops: one tick per day, one lane per city.
        const lanes = svg.append("g");
        lanes.selectAll("text")
            .data(TEMP_CITIES).join("text")
            .attr("class", "temp-city")
            .attr("data-city", d => d)
            .attr("x", -8)
            .attr("y", d => lane(d) + laneHeight / 2)
            .attr("dy", "0.35em")
            .attr("text-anchor", "end")
            .attr("font-size", "11px")
            .attr("fill", d => color(d))
            .text(d => d);
        svg.append("text")
            .attr("x", -8).attr("y", laneTop - 8)
            .attr("text-anchor", "end")
            .attr("font-size", "11px").attr("fill", "#64748b")
            .text("Drops ≥ 4°C:");

        const dropTicks = plot.append("g")
            .selectAll("rect")
            .data(drops).join("rect")
            .attr("class", "temp-city")
            .attr("data-city", d => d.city)
            .attr("y", d => lane(d.city) + 2)
            .attr("width", 2)
            .attr("height", laneHeight - 4)
            .attr("fill", d => color(d.city))
            .on("mouseover", (event, d) => {
                tooltip.show(event, `<strong>${d.city}</strong> · ${d3.timeFormat("%d %b %Y")(d.date)}<br/>` +
                    `Mean fell from ${format(d.from)}°C to ${format(d.to)}°C (${format(d.to - d.from)}°C)`);
            })
            .on("mouseout", tooltip.hide);

        // Legend above the plot.
        const legendItems = [
            { label: "El Niño", fill: phaseColor["El Niño"] },
            { label: "La Niña", fill: phaseColor["La Niña"] },
            ...TEMP_CITIES.map(city => ({ label: city, stroke: color(city) }))
        ];
        const legend = svg.append("g")
            .attr("transform", "translate(0,-28)")
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

        // Redraws everything that depends on the visible time range.
        function render() {
            shading.attr("x", d => x(d.start)).attr("width", d => x(d.end) - x(d.start));
            lines.attr("d", d => line(d.values));
            dropTicks.attr("x", d => x(d.date) - 1);
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
        context.append("g")
            .call(d3.brushX()
                .extent([[0, 0], [width, contextHeight]])
                .on("brush end", ({ selection }) => {
                    x.domain(selection ? selection.map(xContext.invert) : xContext.domain());
                    render();
                }));

        render();
    }

    drawFingerprint();

    // The El Niño index is a separate file (NOAA Oceanic Niño Index).
    d3.csv("data/oni.csv")
        .then(oni => {
            drawTimeline(oni);
            applyTemperatureCityFilter();
        })
        .catch(error => console.error("Error loading El Niño index:", error));
}
