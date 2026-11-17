// Key insights for RQ1 in two charts: a typical year ("fingerprint") and 2015–2025 over time.
// Uses the shared helpers from temperature.js.

function drawTemperatureInsights() {
    const color = cityColorScale();
    const tooltip = createTooltip();
    const format = v => v.toFixed(1);
    const formatMonth = d3.timeFormat("%b %Y");

    // Averages per city and calendar month for a set of days.
    const monthlyValues = rows => d3.rollups(
        rows,
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

    // 10-year averages: the reference in the drill-down charts.
    const climate = monthlyValues(rawParsedWeather);
    const tenYearMean = (city, month) => climate.find(c => c.city === city && c.month === month).mean;

    // The y-axis of "A Typical Year" covers the months of every single year, so it stays still when filtering.
    const everyMonth = d3.groups(rawParsedWeather, d => d.date.getFullYear())
        .flatMap(([, rows]) => monthlyValues(rows));
    const filters = temperatureFilters;
    initTemperatureFilters();

    // Days on which the daily mean fell by 4 °C or more ("sudden drops").
    const drops = d3.groups(rawParsedWeather, d => d.city).flatMap(([city, days]) => {
        const sorted = days.slice().sort((a, b) => a.date - b.date);
        return sorted.slice(1)
            .map((d, i) => ({ city, date: d.date, from: sorted[i].tempMean, to: d.tempMean }))
            .filter(d => d.to - d.from <= -4);
    });

    // --- Chart 1: a typical year, with a drill-down in the same chart ---
    // Levels: all months → one month in every year → the days of one month in one year.
    const fingerprintId = "#temperature-fingerprint-chart";
    const fingerprintHeight = 410;
    const backButton = d3.select("#temperatureFingerprintBack");
    let view = { level: "months" };  // { level: "month", d } or { level: "days", d, r }

    function renderFingerprint() {
        tooltip.hide();
        if (view.level === "months") drawFingerprint();
        else if (view.level === "month") drawMonth(view.d);
        else drawDays(view.r, view.d.month);

        const monthName = view.d ? d3.timeFormat("%B")(new Date(2000, view.d.month, 1)) : "";
        backButton.property("hidden", view.level === "months")
            .text(view.level === "days" ? `← Back to ${monthName} in each year` : "← Back to all months");
        applyTemperatureCityFilter();
    }

    backButton.on("click", () => {
        view = view.level === "days" ? { level: "month", d: view.d } : { level: "months" };
        renderFingerprint();
    });

    // Level 1: bar = average min to max, tick = mean, per month and city.
    function drawFingerprint() {
        const margin = { top: 30, right: 20, bottom: 40, left: 60 };
        const { svg, width, height } = createSvg(fingerprintId, fingerprintHeight, margin);

        // The 10-year average, or one year's months when a year is selected; only the months of the selected season.
        const rows = filters.year === null ? rawParsedWeather : rawParsedWeather.filter(d => d.date.getFullYear() === filters.year);
        const shown = (filters.year === null ? climate : monthlyValues(rows))
            .filter(d => filters.quarter.months.includes(d.month));
        const byCity = d3.group(shown, d => d.city);

        const x = d3.scaleBand().domain(filters.quarter.months).range([0, width]).padding(0.2);
        const xCity = d3.scaleBand().domain(TEMP_CITIES).range([0, x.bandwidth()]).padding(0.15);
        const y = d3.scaleLinear()
            .domain([Math.floor(d3.min(everyMonth, d => d.min)) - 1, Math.ceil(d3.max(everyMonth, d => d.max)) + 1])
            .range([height, 0]);

        svg.append("text")
            .attr("x", 0).attr("y", -12)
            .attr("font-size", "12px").attr("font-weight", 600).attr("fill", "#475569")
            .text(filters.year === null ? "10-year average (2015–2025)" : `Year ${filters.year}`);
        const barX = d => x(d.month) + xCity(d.city);
        const center = d => barX(d) + xCity.bandwidth() / 2;

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

        // Highlight the hovered bar and fade the others.
        function highlight(d) {
            svg.selectAll(".temp-fp-bar")
                .attr("fill-opacity", b => d === null ? 0.35 : b === d ? 0.8 : 0.15)
                .attr("stroke-width", b => b === d ? 1.5 : 0);
        }

        cities.append("g")
            .selectAll("rect")
            .data(d => d[1]).join("rect")
            .attr("class", "temp-fp-bar")
            .attr("x", barX)
            .attr("y", d => y(d.max))
            .attr("width", xCity.bandwidth())
            .attr("height", d => y(d.min) - y(d.max))
            .attr("rx", 2)
            .attr("fill", d => color(d.city))
            .attr("fill-opacity", 0.35)
            .attr("stroke", d => color(d.city))
            .attr("stroke-width", 0)
            .style("cursor", "pointer")
            .on("mouseover", (event, d) => {
                highlight(d);
                tooltip.show(event, `<strong>${d.city}</strong> · ${MONTH_LABELS[d.month]}<br/>` +
                    `Mean: ${format(d.mean)}°C<br/>Avg. min–max: ${format(d.min)}–${format(d.max)}°C<br/>` +
                    `Daily range: ${format(d.range)}°C<br/>` +
                    `Humidity: ${Math.round(d.humidity)}% · Sunshine: ${format(d.sunshine)} h/day<br/>` +
                    `<em>Click to see this month in every year</em>`);
            })
            .on("mouseout", () => {
                highlight(null);
                tooltip.hide();
            })
            .on("click", (event, d) => {
                view = { level: "month", d };
                renderFingerprint();
            });

        // Mean line and ticks on top of the bars; they ignore the mouse so the bars stay hoverable.
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
            .attr("x1", d => barX(d) - 1)
            .attr("x2", d => barX(d) + xCity.bandwidth() + 1)
            .attr("y1", d => y(d.mean)).attr("y2", d => y(d.mean))
            .attr("stroke", d => color(d.city))
            .attr("stroke-width", 2.5);
    }

    // Level 2: the clicked month in every year, the clicked city highlighted.
    function drawMonth(d) {
        const monthName = d3.timeFormat("%B")(new Date(2000, d.month, 1));
        const perYear = d3.rollups(
            rawParsedWeather.filter(r => r.date.getMonth() === d.month),
            v => ({
                mean: d3.mean(v, r => r.tempMean),
                min: d3.mean(v, r => r.tempMin),
                max: d3.mean(v, r => r.tempMax),
                humidity: d3.mean(v, r => r.humidity),
                sunshine: d3.mean(v, r => r.sunshineHours)
            }),
            r => r.city, r => r.date.getFullYear()
        ).flatMap(([city, years]) => years.map(([year, v]) => ({ city, year, ...v })));

        const margin = { top: 30, right: 90, bottom: 40, left: 60 };
        const { svg, width: w, height: h } = createSvg(fingerprintId, fingerprintHeight, margin);

        const years = Array.from(new Set(perYear.map(r => r.year))).sort(d3.ascending);
        const xYear = d3.scaleBand().domain(years).range([0, w]).padding(0.2);
        const xCityYear = d3.scaleBand().domain(TEMP_CITIES).range([0, xYear.bandwidth()]).padding(0.15);
        const yYear = d3.scaleLinear()
            .domain([d3.min(perYear, r => r.min) - 1, d3.max(perYear, r => r.max) + 1]).nice()
            .range([h, 0]);

        svg.append("text")
            .attr("x", 0).attr("y", -12)
            .attr("font-size", "12px").attr("font-weight", 600).attr("fill", "#475569")
            .text(`${monthName} in each year · ${d.city} highlighted`);

        addGrid(svg, yYear, w);
        svg.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${h})`)
            .call(d3.axisBottom(xYear));
        svg.append("g").attr("class", "axis").call(d3.axisLeft(yYear).ticks(5));
        addAxisLabel(svg, "Temperature (°C)", -h / 2, -45, true);

        const bars = svg.selectAll(".temp-fp-year")
            .data(perYear).join("g")
            .attr("class", "temp-fp-year temp-city")
            .attr("data-city", r => r.city)
            .attr("transform", r => `translate(${xYear(r.year) + xCityYear(r.city)},0)`)
            .attr("opacity", r => r.city === d.city ? 1 : 0.25)
            .style("cursor", "pointer")
            .on("mouseover", (event, r) => {
                const diff = r.mean - tenYearMean(r.city, d.month);
                tooltip.show(event, `<strong>${r.city}</strong> · ${monthName} ${r.year}<br/>` +
                    `Mean: ${format(r.mean)}°C (${diff > 0 ? "+" : ""}${format(diff)}°C vs. 10-year average)<br/>` +
                    `Avg. min–max: ${format(r.min)}–${format(r.max)}°C<br/>` +
                    `Humidity: ${Math.round(r.humidity)}% · Sunshine: ${format(r.sunshine)} h/day<br/>` +
                    `<em>Click to see its days</em>`);
            })
            .on("mouseout", tooltip.hide)
            .on("click", (event, r) => {
                view = { level: "days", d, r };
                renderFingerprint();
            });
        bars.append("rect")
            .attr("y", r => yYear(r.max))
            .attr("width", xCityYear.bandwidth())
            .attr("height", r => yYear(r.min) - yYear(r.max))
            .attr("rx", 2)
            .attr("fill", r => color(r.city))
            .attr("fill-opacity", 0.45);
        bars.append("line")
            .attr("x1", -1).attr("x2", xCityYear.bandwidth() + 1)
            .attr("y1", r => yYear(r.mean)).attr("y2", r => yYear(r.mean))
            .attr("stroke", r => color(r.city))
            .attr("stroke-width", 2.5);

        // The clicked city's 10-year average for this month, to spot warm and cold years.
        const average = tenYearMean(d.city, d.month);
        svg.append("line")
            .attr("x1", 0).attr("x2", w)
            .attr("y1", yYear(average)).attr("y2", yYear(average))
            .attr("stroke", color(d.city))
            .attr("stroke-dasharray", "5,4")
            .style("pointer-events", "none");
        svg.append("text")
            .attr("x", w + 6).attr("y", yYear(average))
            .attr("dy", "0.35em")
            .attr("font-size", "11px").attr("fill", color(d.city))
            .text(`avg. ${format(average)}°C`);
    }

    // Level 3: one month in one year, day by day: one line per city (daily mean), the clicked city highlighted
    // with a band from its daily minimum to maximum.
    function drawDays(r, month) {
        const checked = Array.from(document.querySelectorAll("#cityFilters input:checked")).map(cb => cb.value);
        const days = rawParsedWeather.filter(row => row.date.getFullYear() === r.year && row.date.getMonth() === month);
        const highlighted = days.filter(row => row.city === r.city);
        const margin = { top: 30, right: 90, bottom: 40, left: 60 };
        const { svg, width: w, height: h } = createSvg(fingerprintId, fingerprintHeight, margin);

        // The y-axis fits the band of the highlighted city and the lines of the checked cities.
        const shown = days.filter(row => checked.includes(row.city));
        const xDay = d3.scaleTime().domain(d3.extent(days, row => row.date)).range([0, w]);
        const yDay = d3.scaleLinear()
            .domain([Math.min(d3.min(highlighted, row => row.tempMin), d3.min(shown, row => row.tempMean) ?? Infinity) - 1,
                     Math.max(d3.max(highlighted, row => row.tempMax), d3.max(shown, row => row.tempMean) ?? -Infinity) + 1])
            .nice()
            .range([h, 0]);
        const monthYear = d3.timeFormat("%B %Y")(new Date(r.year, month, 1));

        svg.append("text")
            .attr("x", 0).attr("y", -12)
            .attr("font-size", "12px").attr("font-weight", 600).attr("fill", "#475569")
            .text(`${monthYear}, day by day · ${r.city}`);

        addGrid(svg, yDay, w);
        svg.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${h})`)
            .call(d3.axisBottom(xDay).ticks(d3.timeDay.every(5)).tickFormat(d3.timeFormat("%d %b")));
        svg.append("g").attr("class", "axis").call(d3.axisLeft(yDay).ticks(5));
        addAxisLabel(svg, "Temperature (°C)", -h / 2, -45, true);

        svg.append("path")
            .datum(highlighted)
            .attr("d", d3.area().x(row => xDay(row.date)).y0(row => yDay(row.tempMin)).y1(row => yDay(row.tempMax)))
            .attr("fill", color(r.city))
            .attr("fill-opacity", 0.15);

        const lines = svg.selectAll(".temp-fp-day-line")
            .data(d3.groups(days, row => row.city)).join("g")
            .attr("class", "temp-fp-day-line temp-city")
            .attr("data-city", ([city]) => city)
            .attr("opacity", ([city]) => city === r.city ? 1 : 0.3);
        lines.append("path")
            .attr("class", "line")
            .attr("d", ([, rows]) => d3.line().x(row => xDay(row.date)).y(row => yDay(row.tempMean))(rows))
            .attr("stroke", ([city]) => color(city))
            .style("pointer-events", "none");
        lines.selectAll("circle")
            .data(([, rows]) => rows).join("circle")
            .attr("cx", row => xDay(row.date))
            .attr("cy", row => yDay(row.tempMean))
            .attr("r", 3)
            .attr("fill", row => color(row.city))
            .on("mouseover", (event, row) => {
                tooltip.show(event, `<strong>${row.city}</strong> · ${d3.timeFormat("%A, %d %B %Y")(row.date)}<br/>` +
                    `Mean: ${format(row.tempMean)}°C · Min–max: ${format(row.tempMin)}–${format(row.tempMax)}°C<br/>` +
                    `Humidity: ${Math.round(row.humidity)}% · Sunshine: ${format(row.sunshineHours)} h`);
            })
            .on("mouseout", tooltip.hide);

        // The month's average in that year for the clicked city, in neutral grey so it is not mistaken for data.
        svg.append("line")
            .attr("x1", 0).attr("x2", w)
            .attr("y1", yDay(r.mean)).attr("y2", yDay(r.mean))
            .attr("stroke", "#64748b")
            .attr("stroke-dasharray", "5,4")
            .style("pointer-events", "none");
        svg.append("text")
            .attr("x", w + 6).attr("y", yDay(r.mean))
            .attr("dy", "0.35em")
            .attr("font-size", "11px").attr("fill", "#64748b")
            .text(`avg. ${format(r.mean)}°C`);
    }

    // The day view fits its y-axis to the checked cities, so it is redrawn when they change.
    document.querySelectorAll("#cityFilters input").forEach(checkbox => {
        checkbox.addEventListener("change", () => {
            if (view.level === "days") renderFingerprint();
        });
    });

    // A new year or season goes back to all months.
    document.addEventListener("temperatureFiltersChanged", () => {
        view = { level: "months" };
        renderFingerprint();
    });

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
        const brush = d3.brushX()
            .extent([[0, 0], [width, contextHeight]])
            .on("brush end", ({ selection }) => {
                x.domain(selection ? selection.map(xContext.invert) : xContext.domain());
                render();
            });
        const brushGroup = context.append("g").call(brush);

        // The shared year filter zooms the timeline to that year (the season filter does not apply to a timeline).
        function zoomToYear() {
            const year = temperatureFilters.year;
            brushGroup.call(brush.move, year === null ? null : [new Date(year, 0, 1), new Date(year + 1, 0, 1)].map(xContext));
        }
        document.addEventListener("temperatureFiltersChanged", zoomToYear);

        render();
        zoomToYear();
    }

    renderFingerprint();

    // The El Niño index is a separate file (NOAA Oceanic Niño Index).
    d3.csv("data/oni.csv")
        .then(oni => {
            drawTimeline(oni);
            applyTemperatureCityFilter();
        })
        .catch(error => console.error("Error loading El Niño index:", error));
}
