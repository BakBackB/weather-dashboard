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

    // --- Chart 1: a typical year, with a drill-down in the same chart ---
    // Levels: all months → one month in every year → the days of one month in one year.
    const fingerprintId = "#temperature-fingerprint-chart";
    const fingerprintHeight = 410;
    const path = d3.select("#temperatureFingerprintPath");
    let view = { level: "months" };  // { level: "month", d } or { level: "days", d, r }

    // Hover guide: a dashed vertical line at the nearest position and the values of the checked cities there,
    // written above the plot. positions: [{ x, label, values: [{ city, value }] }]. Returns a function to
    // replace the positions when the chart is updated.
    function addHoverGuide(svg, width, height, positions = []) {
        const short = { "Hanoi": "Hanoi", "Da Nang": "Da Nang", "Ho Chi Minh City": "HCMC" };
        svg.insert("rect", ":first-child")  // catches the mouse in the gaps between the marks
            .attr("width", width).attr("height", height)
            .attr("fill", "transparent");
        const guide = svg.append("line")
            .attr("y1", 0).attr("y2", height)
            .attr("stroke", "#64748b")
            .attr("stroke-dasharray", "4,4")
            .attr("display", "none")
            .style("pointer-events", "none");
        const readout = svg.append("text")
            .attr("x", width).attr("y", -12)
            .attr("text-anchor", "end")
            .attr("font-size", "11px").attr("fill", "#475569");

        svg.on("mousemove", event => {
            const [px] = d3.pointer(event, svg.node());
            const p = positions[d3.leastIndex(positions, q => Math.abs(q.x - px))];
            const checked = Array.from(document.querySelectorAll("#cityFilters input:checked")).map(cb => cb.value);
            guide.attr("x1", p.x).attr("x2", p.x).attr("display", null);
            readout.text(`${p.label} — ` + p.values
                .filter(v => checked.includes(v.city))
                .map(v => `${short[v.city]}: ${format(v.value)}°C`).join(" · "));
        }).on("mouseleave", () => {
            guide.attr("display", "none");
            readout.text("");
        });
        return newPositions => {
            positions = newPositions;
        };
    }

    function renderFingerprint() {
        tooltip.hide();
        if (view.level === "months") drawFingerprint();
        else if (view.level === "month") drawMonth(view.d);
        else drawDays(view.r, view.d.month);

        drawPath();
        applyTemperatureCityFilter();
    }

    // Navigation path above the chart, e.g. "All years › April › 2019" or "2022 › February";
    // every step except the current one can be clicked to go back to it.
    function drawPath() {
        const steps = [{ label: filters.year === null ? "All years" : String(filters.year), target: { level: "months" } }];
        if (view.level !== "months") {
            const monthName = d3.timeFormat("%B")(new Date(2000, view.d.month, 1));
            steps.push({ label: monthName, target: view.fromYear ? null : { level: "month", d: view.d } });
        }
        if (view.level === "days" && !view.fromYear) steps.push({ label: String(view.r.year), target: null });

        path.selectAll("*").remove();
        steps.forEach((step, i) => {
            if (i > 0) path.append("span").attr("class", "temperature-path-sep").text("›");
            const last = i === steps.length - 1;
            path.append(last ? "span" : "button")
                .attr("class", last ? "temperature-path-current" : "temperature-path-step")
                .text(step.label)
                .on("click", last ? null : () => {
                    view = step.target;
                    renderFingerprint();
                });
        });
    }

    // Level 1: one line per city with the monthly mean temperature.
    // A new year or season updates the existing chart with a transition, so the lines can be followed
    // (object constancy); coming back from the drill-down draws it new.
    function drawFingerprint() {
        const margin = { top: 30, right: 20, bottom: 40, left: 60 };
        const width = 850 - margin.left - margin.right;
        const height = fingerprintHeight - margin.top - margin.bottom;
        let svg = d3.select(fingerprintId).select(".temp-fp-overview");
        const animate = !svg.empty();
        if (!animate) svg = buildFingerprint(margin, width, height);
        const move = selection => animate ? selection.transition().duration(TEMP_DURATION) : selection;

        // The 10-year average, or one year's months when a year is selected.
        const rows = filters.year === null ? rawParsedWeather : rawParsedWeather.filter(d => d.date.getFullYear() === filters.year);
        const values = filters.year === null ? climate : monthlyValues(rows);
        const months = filters.quarter.months;

        // All 12 months are drawn; the season sets the visible part, so a new season zooms instead of jumping.
        const x = d3.scaleLinear().domain([months[0] - 0.5, months[months.length - 1] + 0.5]).range([0, width]);
        const y = fingerprintY;

        svg.select(".temp-fp-title")
            .text(filters.year === null ? "10-year average (2015–2025)" : `Year ${filters.year}`);
        move(svg.select(".temp-fp-x-axis"))
            .call(d3.axisBottom(x).tickValues(months).tickFormat(m => MONTH_LABELS[m]));

        const cities = svg.select(".temp-fp-lines").selectAll(".temp-city")
            .data(Array.from(d3.group(values, d => d.city)), d => d[0])
            .join(enter => {
                const g = enter.append("g")
                    .attr("class", "temp-city")
                    .attr("data-city", d => d[0]);
                g.append("path")
                    .attr("fill", "none")
                    .attr("stroke", d => color(d[0]))
                    .attr("stroke-width", 2)
                    .style("pointer-events", "none");
                return g;
            });
        const line = d3.line().x(m => x(m.month)).y(m => y(m.mean));
        move(cities.select("path").datum(d => d[1].slice().sort((a, b) => a.month - b.month)))
            .attr("d", line);

        // The dots are hoverable and open the drill-down.
        const dots = cities.selectAll("circle")
            .data(d => d[1], d => d.month)
            .join(enter => enter.append("circle")
                .attr("r", 4)
                .attr("fill", d => color(d.city))
                .attr("cx", d => x(d.month))
                .attr("cy", d => y(d.mean))
                .style("cursor", "pointer"))
            .on("mouseover", function(event, d) {
                d3.select(this).attr("r", 6);
                tooltip.show(event, `<strong>${d.city}</strong> · ${MONTH_LABELS[d.month]}<br/>` +
                    `Mean: ${format(d.mean)}°C<br/>Avg. min–max: ${format(d.min)}–${format(d.max)}°C<br/>` +
                    `Daily range: ${format(d.range)}°C<br/>` +
                    `Humidity: ${Math.round(d.humidity)}% · Sunshine: ${format(d.sunshine)} h/day<br/>` +
                    `<em>${filters.year === null ? "Click to see this month in every year" : "Click to see its days"}</em>`);
            })
            .on("mouseout", function() {
                d3.select(this).attr("r", 4);
                tooltip.hide();
            })
            .on("click", (event, d) => {
                // With a year selected, a month opens its days directly; otherwise that month in every year.
                view = filters.year === null
                    ? { level: "month", d }
                    : { level: "days", d, r: { city: d.city, year: filters.year, mean: d.mean }, fromYear: true };
                renderFingerprint();
            });
        move(dots).attr("cx", d => x(d.month)).attr("cy", d => y(d.mean));

        setFingerprintGuide(months.map(m => ({
            x: x(m),
            label: MONTH_LABELS[m],
            values: values.filter(d => d.month === m).map(d => ({ city: d.city, value: d.mean }))
        })));
    }

    // The parts of the overview that do not change with the filters.
    let fingerprintY, setFingerprintGuide;
    function buildFingerprint(margin, width, height) {
        const { svg } = createSvg(fingerprintId, fingerprintHeight, margin);
        svg.classed("temp-fp-overview", true);

        // The y-axis covers the months of every single year, so it stays still when filtering.
        const y = d3.scaleLinear()
            .domain([Math.floor(d3.min(everyMonth, d => d.mean)) - 1, Math.ceil(d3.max(everyMonth, d => d.mean)) + 1])
            .range([height, 0]);
        fingerprintY = y;

        svg.append("text")
            .attr("class", "temp-fp-title")
            .attr("x", 0).attr("y", -12)
            .attr("font-size", "12px").attr("font-weight", 600).attr("fill", "#475569");
        addGrid(svg, y, width);
        svg.append("g").attr("class", "axis temp-fp-x-axis")
            .attr("transform", `translate(0,${height})`);
        svg.append("g").attr("class", "axis").call(d3.axisLeft(y));
        addAxisLabel(svg, "Temperature (°C)", -height / 2, -45, true);

        // Months outside the selected season lie outside the plot and are clipped.
        svg.append("clipPath").attr("id", "temperature-fp-clip")
            .append("rect").attr("x", -6).attr("y", -6).attr("width", width + 12).attr("height", height + 12);
        svg.append("g").attr("class", "temp-fp-lines").attr("clip-path", "url(#temperature-fp-clip)");

        setFingerprintGuide = addHoverGuide(svg, width, height);
        return svg;
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
                // Hovering another city brings its bars forward.
                bars.attr("opacity", b => b.city === d.city ? 1 : b.city === r.city ? 0.7 : 0.25);
                const diff = r.mean - tenYearMean(r.city, d.month);
                tooltip.show(event, `<strong>${r.city}</strong> · ${monthName} ${r.year}<br/>` +
                    `Mean: ${format(r.mean)}°C (${diff > 0 ? "+" : ""}${format(diff)}°C vs. 10-year average)<br/>` +
                    `Avg. min–max: ${format(r.min)}–${format(r.max)}°C<br/>` +
                    `Humidity: ${Math.round(r.humidity)}% · Sunshine: ${format(r.sunshine)} h/day<br/>` +
                    `<em>${r.city === d.city ? "Click to see its days" : `Click to highlight ${r.city}`}</em>`);
            })
            .on("mouseout", () => {
                bars.attr("opacity", b => b.city === d.city ? 1 : 0.25);
                tooltip.hide();
            })
            .on("click", (event, r) => {
                // Another city's bar selects that city; the highlighted city's bar opens the days.
                view = r.city === d.city
                    ? { level: "days", d, r }
                    : { level: "month", d: climate.find(c => c.city === r.city && c.month === d.month) };
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
            .attr("opacity", ([city]) => city === r.city ? 1 : 0.3)
            .style("cursor", ([city]) => city === r.city ? null : "pointer")
            // Hovering another city brings its line forward, clicking it highlights that city.
            .on("mouseenter", (event, [city]) => {
                lines.attr("opacity", ([c]) => c === r.city ? 1 : c === city ? 0.7 : 0.3);
            })
            .on("mouseleave", () => {
                lines.attr("opacity", ([c]) => c === r.city ? 1 : 0.3);
            })
            .on("click", (event, [city, rows]) => {
                if (city === r.city) return;
                view = {
                    level: "days",
                    d: climate.find(c => c.city === city && c.month === month),
                    r: { city, year: r.year, mean: d3.mean(rows, row => row.tempMean) },
                    fromYear: view.fromYear
                };
                renderFingerprint();
            });
        lines.append("path")
            .attr("class", "line")
            .attr("d", ([, rows]) => d3.line().x(row => xDay(row.date)).y(row => yDay(row.tempMean))(rows))
            .attr("stroke", ([city]) => color(city))
            .style("pointer-events", "stroke");
        lines.selectAll("circle")
            .data(([, rows]) => rows).join("circle")
            .attr("cx", row => xDay(row.date))
            .attr("cy", row => yDay(row.tempMean))
            .attr("r", 3)
            .attr("fill", row => color(row.city))
            .on("mouseover", (event, row) => {
                tooltip.show(event, `<strong>${row.city}</strong> · ${d3.timeFormat("%A, %d %B %Y")(row.date)}<br/>` +
                    `Mean: ${format(row.tempMean)}°C · Min–max: ${format(row.tempMin)}–${format(row.tempMax)}°C<br/>` +
                    `Humidity: ${Math.round(row.humidity)}% · Sunshine: ${format(row.sunshineHours)} h` +
                    (row.city === r.city ? "" : `<br/><em>Click to highlight ${row.city}</em>`));
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

        addHoverGuide(svg, w, h, d3.groups(days, row => +row.date).map(([, rows]) => ({
            x: xDay(rows[0].date),
            label: d3.timeFormat("%d %b")(rows[0].date),
            values: rows.map(row => ({ city: row.city, value: row.tempMean }))
        })));
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

    // --- Chart 2: 2015–2025 (anomalies, El Niño / La Niña) with a brush to zoom ---
    function drawTimeline(oni) {
        const margin = { top: 54, right: 20, bottom: 30, left: 110 };
        const { svg, width, height } = createSvg("#temperature-timeline-chart", 432, margin);

        const mainHeight = 220;
        const contextTop = mainHeight + 50;
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
        plot.on("mousemove", event => {
            const date = d3.timeMonth.round(x.invert(d3.pointer(event, svg.node())[0]));
            const at = series.map(s => ({ city: s.city, d: s.values.find(v => +v.date === +date) })).filter(v => v.d);
            if (!at.length) return;
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
            .on("brush end", ({ selection }) => {
                x.domain(selection ? selection.map(xContext.invert) : xContext.domain());
                render();
            });
        const brushGroup = context.append("g").call(brush);

        // The shared year filter zooms the timeline to that year (the season filter does not apply to a timeline).
        // The brush glides to the new range, so the chart zooms smoothly.
        function zoomToYear(animate) {
            const year = temperatureFilters.year;
            // "All years" glides to the full range first and then removes the brush.
            const range = year === null ? xContext.range() : [new Date(year, 0, 1), new Date(year + 1, 0, 1)].map(xContext);
            const clear = () => {
                if (year === null) brushGroup.call(brush.move, null);
            };
            if (animate) brushGroup.transition().duration(TEMP_DURATION).call(brush.move, range).on("end", clear);
            else {
                brushGroup.call(brush.move, range);
                clear();
            }
        }
        document.addEventListener("temperatureFiltersChanged", () => zoomToYear(true));

        render();
        zoomToYear(false);
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
