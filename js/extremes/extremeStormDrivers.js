function drawExtremeStormDrivers() {
    const fullRange = d3.extent(rawParsedWeather, row => row.date);
    if (!fullRange[0]) return;
    const events = getExtremeStormEvents(rawParsedWeather, fullRange);
    const color = extremeCityColorScale();
    const tooltip = extremeCreateTooltip();
    const formatDay = d3.timeFormat("%d %b %Y");
    const number = value => Number.isFinite(value) ? value.toFixed(1) : "Unavailable";
    const margin = { top: 20, right: 25, bottom: 50, left: 65 };
    const width = 850 - margin.left - margin.right;
    const compass = EXTREME_WIND_DIRECTIONS;
    const months = EXTREME_MONTHS;
    const directionColor = d3.scaleOrdinal().domain([...compass, "Unavailable"])
        .range(["#2563eb", "#0891b2", "#15803d", "#a16207", "#ea580c", "#dc2626", "#7c3aed", "#db2777", "#94a3b8"]);
    const markSelector = ".extreme-wind-day, .extreme-sunshine-day";
    const wind = {
        kind: "wind", field: "windSpeedMax", height: 240, label: "Daily maximum wind (km/h)",
        container: "#extreme-storm-wind", rangeId: "extremeWindRange", citiesId: "extremeWindCities",
        emptyMessage: "Select a city to display wind speed.", range: fullRange.slice()
    };
    const sunshine = {
        kind: "sunshine", field: "sunshineHours", height: 220, label: "Sunshine (hours)",
        container: "#extreme-storm-sunshine", rangeId: "extremeStormRange", citiesId: "extremeSunshineCities",
        emptyMessage: "Select a city to display sunshine duration.", range: fullRange.slice()
    };
    let selectedDirectionRange = fullRange.slice();
    let selectedDirection = null;
    let charts = [];
    const navigators = [];            // the three date brushes; they follow the global time window
    let directionRestore = null;      // time window before a wind-direction drill-down

    const directionKeys = events.some(row => !getExtremeWindDirection(row.windDirection))
        ? [...compass, "Unavailable"] : compass;
    extremeDrawLegend("#extremeStormDirectionLegend", directionKeys, directionColor);

    const overviewX = d3.scaleTime()
        .domain([d3.timeHour.offset(fullRange[0], -12), d3.timeHour.offset(fullRange[1], 12)])
        .range([0, width]);
    const sunshineOverview = createDateNavigator("#extremeStormBrush", "extremeStormResetRange", range => {
        sunshine.range = range;
        renderDaily(sunshine);
    }, "sunshineHours", "Sunshine duration: select a date range");
    const windOverview = createDateNavigator("#extremeWindBrush", "extremeWindResetRange", range => {
        wind.range = range;
        renderDaily(wind);
    }, "windSpeedMax", "Maximum wind speed: select a date range");
    createDateNavigator("#extremeDirectionBrush", "extremeDirectionResetRange", range => {
        selectedDirectionRange = range;
        renderDirection();
    }, null, "Wind direction: select a date range for annual bars and the three city wind roses");
    for (const [panel, overview] of [[wind, windOverview], [sunshine, sunshineOverview]]) {
        panel.cities = extremeInitCityFilters(panel.citiesId, () => {
            overview.selectAll(`.extreme-${panel.kind}-overview-line`)
                .attr("display", series => panel.cities.has(series.city) ? null : "none");
            renderDaily(panel);
        });
    }

    function clampDate(date) {
        return new Date(Math.max(+fullRange[0], Math.min(+fullRange[1], +date)));
    }

    function citySeries(rows) {
        return EXTREME_CITIES.map(city => ({ city, values: rows.filter(row => row.city === city) }));
    }

    function measurementLine(field, x, y) {
        return d3.line().defined(row => Number.isFinite(row[field])).x(x).y(row => y(row[field]));
    }

    function createDateNavigator(container, resetId, onRange, field, label) {
        const overview = d3.select(container).append("svg")
            .attr("width", 850).attr("height", 110).attr("viewBox", "0 0 850 110")
            .attr("role", "img").attr("aria-label", label)
            .append("g").attr("transform", `translate(${margin.left},20)`);
        overview.append("rect").attr("width", width).attr("height", 60).attr("fill", "#f8fafc");
        overview.append("text").attr("x", 0).attr("y", -8)
            .attr("fill", "#475569").attr("font-size", 11).text("Drag to zoom:");
        if (field) {
            const y = d3.scaleLinear().domain([0, d3.max(events, row => row[field]) || 1]).nice().range([58, 2]);
            const line = measurementLine(field, row => overviewX(row.date), y);
            overview.append("g").selectAll("path").data(citySeries(events)).join("path")
                .attr("class", field === "windSpeedMax" ? "extreme-wind-overview-line" : "extreme-sunshine-overview-line")
                .attr("d", series => line(series.values))
                .attr("fill", "none").attr("stroke", series => color(series.city)).attr("stroke-width", 1.2);
        } else {
            const lane = d3.scaleBand().domain(EXTREME_CITIES).range([5, 55]).padding(0.25);
            overview.append("g").selectAll("line").data(events).join("line")
                .attr("x1", row => overviewX(row.date)).attr("x2", row => overviewX(row.date))
                .attr("y1", row => lane(row.city)).attr("y2", row => lane(row.city) + lane.bandwidth())
                .attr("stroke", row => color(row.city)).attr("stroke-width", 1.5);
        }
        overview.append("g").attr("class", "axis").attr("transform", "translate(0,60)")
            .call(d3.axisBottom(overviewX).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")));
        const brush = d3.brushX().handleSize(8).extent([[0, 0], [width, 60]])
            .on("brush end", event => {
                if (!event.sourceEvent) return;
                let range = fullRange.slice();
                if (event.selection) {
                    const dates = event.selection.map(overviewX.invert);
                    const start = clampDate(d3.timeDay.ceil(dates[0]));
                    const end = clampDate(d3.timeDay.floor(dates[1]));
                    const nearest = clampDate(d3.timeDay.round(new Date((+dates[0] + +dates[1]) / 2)));
                    range = start <= end ? [start, end] : [nearest, nearest];
                }
                onRange(range);
                if (event.type === "end") {
                    syncBrush(range);
                    DashSync.setRange(range, resetId);   // the other charts follow
                }
            });
        const brushGroup = overview.append("g").attr("class", "extreme-brush").call(brush);
        document.getElementById(resetId).addEventListener("click", () => {
            brushGroup.call(brush.move, null);
            onRange(fullRange.slice());
            DashSync.setRange(DashSync.full(), resetId);
        });
        function syncBrush(range) {
            const full = +range[0] === +fullRange[0] && +range[1] === +fullRange[1];
            const left = overviewX(d3.timeHour.offset(range[0], -12));
            const right = overviewX(d3.timeHour.offset(range[1], 12));
            const leftEdge = Math.max(0, Math.min(left, width - 2));
            brushGroup.call(brush.move, full ? null : [leftEdge, Math.min(width, Math.max(right, leftEdge + 2))]);
        }
        navigators.push({ id: resetId, onRange, syncBrush });
        return overview;
    }

    function describe(row) {
        const wind = getExtremeWindDirection(row.windDirection);
        return `<strong>${row.city} · ${formatDay(row.date)}</strong><br>Rainfall: ${number(row.precipitation)} mm` +
            `<br>Maximum wind: ${number(row.windSpeedMax)} km/h` +
            `<br>Wind from: ${wind ? `${wind.name} (${wind.degrees.toFixed(0)}°)` : "Unavailable"}` +
            `<br>Sunshine: ${number(row.sunshineHours)} h`;
    }

    function hideTooltip() {
        tooltip.hide();
        charts.forEach(chart => {
            chart.guide.style("display", "none");
            chart.plot.selectAll(markSelector).attr("data-active", null);
        });
    }

    function bindMarks(marks) {
        const show = (event, row) => {
            tooltip.show(event, describe(row));
            charts.forEach(chart => {
                const [start, end] = chart.x.domain();
                const visible = row.date >= start && row.date <= end;
                chart.guide.attr("x1", chart.x(row.date)).attr("x2", chart.x(row.date))
                    .style("display", visible ? null : "none");
                chart.plot.selectAll(markSelector)
                    .attr("data-active", other => visible && other.city === row.city && other.dayStr === row.dayStr ? "true" : null);
            });
        };
        marks.attr("tabindex", 0).attr("role", "img")
            .attr("aria-label", row => describe(row).replace(/<[^>]*>/g, " "))
            .on("pointerenter", show).on("pointermove", show).on("pointerleave", hideTooltip)
            .on("focus", show).on("blur", hideTooltip);
    }

    function dailyLayout(range) {
        const days = d3.timeDay.count(range[0], range[1]) + 1;
        const x = d3.scaleTime()
            .domain([d3.timeHour.offset(range[0], -12), d3.timeHour.offset(range[1], 12)])
            .range([0, width]);
        const dayWidth = width / days;
        // Matching city slots keep same-date events aligned in the two daily views.
        const groupWidth = Math.max(2, Math.min(48, dayWidth * 0.8));
        const cityX = d3.scaleBand().domain(EXTREME_CITIES).range([-groupWidth / 2, groupWidth / 2]).padding(0.15);
        const centre = row => x(row.date) + cityX(row.city) + cityX.bandwidth() / 2;
        return { days, x, centre };
    }

    function renderDaily(panel) {
        hideTooltip();
        charts = charts.filter(chart => chart.container !== panel.container);
        const rows = getExtremeStormEvents(events, panel.range).filter(row => panel.cities.has(row.city));
        const { days, x, centre } = dailyLayout(panel.range);
        document.getElementById(panel.rangeId).textContent =
            `Showing ${formatDay(panel.range[0])} – ${formatDay(panel.range[1])} · ${rows.length} heavy rainfall days across selected cities`;
        drawDaily(panel, rows, x, centre, days);
    }

    function renderDirection() {
        document.getElementById("extremeDirectionRange").textContent =
            `Showing ${formatDay(selectedDirectionRange[0])} – ${formatDay(selectedDirectionRange[1])}`;
        drawDirection();
        drawRangeWindRoses();
    }

    function createChart(panel, rows, x, days) {
        const { container, height: outerHeight, field, label } = panel;
        const chart = extremeCreateSvg(container, outerHeight, `Heavy rainfall days across three cities: ${label}`, margin);
        chart.svg.attr("role", "group");
        const maximum = d3.max(rows, row => row[field]) || 1;
        const y = d3.scaleLinear().domain([0, maximum]).nice().range([chart.height, 0]);
        const dateFormat = d3.timeFormat(days > 730 ? "%Y" : days > 62 ? "%b %Y" : "%d %b");
        const axis = d3.axisBottom(x).ticks(days <= 10 ? d3.timeDay.every(1) : 8).tickFormat(dateFormat);
        const yAxis = d3.axisLeft(y).ticks(5);
        extremeAddAxes(chart.plot, x, y, chart.width, chart.height, "Date", label, axis, yAxis);
        if (!rows.length) chart.plot.append("text").attr("class", "extreme-axis-label")
            .attr("x", chart.width / 2).attr("y", chart.height / 2).attr("text-anchor", "middle")
            .text(panel.cities.size ? "No days with rainfall above 50 mm in this range." : panel.emptyMessage);
        const guide = chart.plot.append("line").attr("class", "extreme-storm-guide")
            .attr("y1", 0).attr("y2", chart.height).style("display", "none");
        const result = { ...chart, container, x, y, guide };
        charts.push(result);
        return result;
    }

    function drawDaily(panel, rows, x, centre, days) {
        const { field, kind, cities } = panel;
        const { plot, y, height } = createChart(panel, rows, x, days);
        const line = measurementLine(field, centre, y);
        plot.append("g").selectAll("path").data(citySeries(rows).filter(series => cities.has(series.city))).join("path")
            .attr("class", `extreme-${kind}-line`).attr("d", series => line(series.values))
            .attr("fill", "none").attr("stroke", series => color(series.city)).attr("stroke-width", 1.8)
            .attr("aria-hidden", "true");
        const marks = plot.append("g").selectAll("g").data(rows).join("g").attr("class", `extreme-${kind}-day`);
        const valid = marks.filter(row => Number.isFinite(row[field]));
        valid.append("circle").attr("class", `extreme-${kind}-dot`)
            .attr("cx", centre).attr("cy", row => y(row[field])).attr("r", 4)
            .attr("fill", row => color(row.city));
        marks.filter(row => !Number.isFinite(row[field])).append("text")
            .attr("class", "extreme-missing-value").attr("x", centre).attr("y", height - 7)
            .attr("text-anchor", "middle").attr("fill", row => color(row.city)).text("×");
        marks.append("circle").attr("cx", centre)
            .attr("cy", row => Number.isFinite(row[field]) ? y(row[field]) : height - 10)
            .attr("r", 8).attr("fill", "transparent");
        bindMarks(marks);
    }

    function directionPeriod(row) {
        const first = new Date(row.year, row.month ?? 0, 1);
        const last = new Date(row.year, row.month === undefined ? 12 : row.month + 1, 0);
        const start = new Date(Math.max(+selectedDirectionRange[0], +first));
        const end = new Date(Math.min(+selectedDirectionRange[1], +last));
        if (start > end) return `${months[row.month]} ${row.year} · Outside selected range`;
        return `${formatDay(start)} – ${formatDay(end)}`;
    }

    function directionDescription(row) {
        return `<strong>${row.city} · ${row.month === undefined ? "" : months[row.month] + " "}${row.year}</strong><br>${directionPeriod(row)}` +
            `<br>Heavy rainfall: ${row.total} days<br>` +
            compass.map((name, i) => `${name}: ${row.counts[i]}`).join(" · ") +
            (row.missing ? `<br>Direction unavailable: ${row.missing} days` : "");
    }

    function drawDirection() {
        tooltip.hide();
        const annualRows = getExtremeAnnualWindCounts(events, selectedDirectionRange);
        const selected = selectedDirection && annualRows.find(row =>
            row.city === selectedDirection.city && row.year === selectedDirection.year);
        if (!selected) selectedDirection = null;
        const navigation = d3.select("#extremeStormDirectionPath");
        navigation.selectAll("*").remove();
        navigation.attr("hidden", selected ? null : true);
        if (selected) {
            navigation.append("button").attr("type", "button").attr("class", "extreme-path-step")
                .attr("aria-controls", "extreme-storm-direction").text("← All years")
                .on("click", event => {
                    selectedDirection = null;
                    if (directionRestore) DashSync.setRange(directionRestore, "extremeDirectionResetRange");
                    directionRestore = null;
                    drawDirection();
                    drawRangeWindRoses();
                    if (event.detail === 0) d3.select("#extreme-storm-direction")
                        .selectAll(".extreme-direction-bar")
                        .filter(row => row.city === selected.city && row.year === selected.year).node()?.focus();
                });
            navigation.append("span").attr("class", "extreme-path-sep").attr("aria-hidden", "true").text("›");
            navigation.append("span").attr("class", "extreme-path-current").attr("aria-current", "location")
                .text(`${selected.city} · ${selected.year} · ${selected.total} days · ${directionPeriod(selected)}`);
        }

        const rows = selected
            ? getExtremeMonthlyWindCounts(events, selectedDirectionRange, selected.city, selected.year)
            : annualRows;
        const { svg, plot, width, height } = extremeCreateSvg("#extreme-storm-direction", 400,
            selected ? `Monthly heavy rainfall days by wind origin for ${selected.city}, ${selected.year}`
                : "Annual heavy rainfall days by city and wind origin; select a bar for monthly counts",
            { top: 22, right: 25, bottom: selected ? 55 : 90, left: 65 });
        svg.attr("role", "group");
        const keys = selected ? d3.range(12) : Array.from(new Set(rows.map(row => row.year)));
        const x = d3.scaleBand().domain(keys).range([0, width]).padding(0.2);
        const cityX = d3.scaleBand().domain(EXTREME_CITIES).range([0, x.bandwidth()]).padding(0.12);
        const barWidth = Math.min(48, selected ? x.bandwidth() : cityX.bandwidth());
        const barX = row => selected ? x(row.month) + (x.bandwidth() - barWidth) / 2
            : x(row.year) + cityX(row.city) + (cityX.bandwidth() - barWidth) / 2;
        const maximum = d3.max(rows, row => row.total) || 1;
        const y = d3.scaleLinear().domain([0, maximum]).nice().range([height, 0]);
        const ticks = y.ticks(5).filter(Number.isInteger);
        plot.append("g").attr("class", "extreme-grid").selectAll("line").data(ticks).join("line")
            .attr("x1", 0).attr("x2", width).attr("y1", value => y(value)).attr("y2", value => y(value));
        plot.append("g").attr("class", "axis").call(d3.axisLeft(y).tickValues(ticks).tickFormat(d3.format("d")));
        plot.append("g").attr("class", "axis").attr("transform", `translate(0,${height + (selected ? 0 : 48)})`)
            .call(d3.axisBottom(x).tickFormat(selected ? month => months[month] : d3.format("d")).tickSizeOuter(0));
        plot.append("text").attr("class", "extreme-axis-label").attr("transform", "rotate(-90)")
            .attr("x", -height / 2).attr("y", -48).attr("text-anchor", "middle").text("Number of days");
        plot.append("text").attr("class", "extreme-axis-label").attr("x", width / 2)
            .attr("y", height + (selected ? 43 : 82)).attr("text-anchor", "middle").text(selected ? "Month" : "Year");
        const marks = plot.append("g").selectAll("g").data(rows).join("g")
            .attr("class", selected ? "extreme-direction-month" : "extreme-direction-bar")
            .attr("tabindex", 0).attr("role", selected ? "img" : "button")
            .attr("aria-label", row => directionDescription(row).replace(/<[^>]*>/g, " ") + (selected ? "" : ". Show monthly counts"));
        marks.append("rect").attr("class", "extreme-direction-hit")
            .attr("x", barX).attr("y", row => Math.min(y(row.total), height - 16))
            .attr("width", barWidth).attr("height", row => Math.max(16, height - y(row.total)))
            .attr("fill", "transparent");
        marks.each(function(row) {
            let start = 0;
            const segments = [...compass, "Unavailable"].map((name, i) => {
                const count = i < 8 ? row.counts[i] : row.missing;
                const segment = { name, count, start, end: start + count };
                start += count;
                return segment;
            });
            d3.select(this).selectAll(".extreme-direction-segment")
                .data(segments.filter(segment => segment.name !== "Unavailable" || segment.count > 0)).join("rect")
                .attr("class", "extreme-direction-segment").attr("x", barX(row))
                .attr("y", segment => y(segment.end)).attr("width", barWidth)
                .attr("height", segment => y(segment.start) - y(segment.end))
                .attr("fill", segment => directionColor(segment.name))
                .on("pointermove", (event, segment) => {
                    event.stopPropagation();
                    tooltip.show(event, `<strong>${row.city} · ${row.year}</strong><br>${directionPeriod(row)}` +
                        `<br>Wind from ${segment.name}: ${segment.count} days<br>Total: ${row.total} heavy rainfall days`);
                });
        });
        marks.filter(row => row.total === 0).append("rect").attr("class", "extreme-direction-zero")
            .attr("x", barX).attr("y", height - 2).attr("width", barWidth).attr("height", 2)
            .attr("fill", "none").attr("stroke", "#94a3b8");
        marks.append("text").attr("class", "extreme-direction-total")
            .attr("x", row => barX(row) + barWidth / 2).attr("y", row => y(row.total) - 6)
            .attr("text-anchor", "middle").text(row => row.total);
        if (!selected) marks.append("text").attr("class", "extreme-direction-city")
            .attr("transform", row => `translate(${barX(row) + barWidth / 2},${height + 10}) rotate(-65)`)
            .attr("text-anchor", "end").attr("fill", row => color(row.city))
            .text(row => row.city === "Ho Chi Minh City" ? "HCMC" : row.city);
        const show = (event, row) => tooltip.show(event, directionDescription(row));
        const open = (event, row) => {
            selectedDirection = { city: row.city, year: row.year };
            // Drilling into a year makes that year the global time window (the back button restores it).
            directionRestore = DashSync.range();
            DashSync.setYear(row.year, "extremeDirectionResetRange");
            drawDirection();
            drawRangeWindRoses();
            if (event.type === "keydown") navigation.selectAll("button").node()?.focus();
        };
        marks.on("pointerenter", show).on("pointerleave", tooltip.hide).on("focus", show).on("blur", tooltip.hide);
        if (!selected) marks.on("click", open).on("keydown", (event, row) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    open(event, row);
                }
            });
        if (!rows.some(row => row.total)) plot.append("text").attr("class", "extreme-axis-label")
            .attr("x", width / 2).attr("y", height / 2).attr("text-anchor", "middle")
            .text("No days with rainfall above 50 mm in this range.");
    }

    function drawRangeWindRoses() {
        const rows = selectedDirection
            ? getExtremeAnnualWindCounts(events, selectedDirectionRange).filter(row =>
                row.city === selectedDirection.city && row.year === selectedDirection.year)
            : getExtremeWindCounts(events, selectedDirectionRange);
        const cards = d3.select("#extremeDirectionRoses")
            .attr("data-view", selectedDirection ? "detail" : "overview")
            .selectAll("section").data(rows).join("section")
            .attr("class", "extreme-rose-card")
            .attr("aria-label", row => `Wind rose for ${row.city}${row.year ? `, ${row.year}` : ""}`);
        cards.selectAll("*").remove();
        cards.append("h5").style("color", row => color(row.city))
            .text(row => `${row.city}${row.year ? ` · ${row.year}` : ""}`);
        cards.each(function(row) {
            const host = d3.select(this).append("div").attr("class", "extreme-chart").node();
            drawWindRose(host, row, !!selectedDirection);
        });
        cards.append("p").attr("class", "extreme-rose-total")
            .text(row => `${row.total} heavy rainfall days${row.missing ? ` · ${row.missing} without direction` : ""}`);
    }

    function drawWindRose(container, row, detail) {
        const maximum = d3.max(row.counts) || 1;
        const period = row.year ? directionPeriod(row)
            : `${formatDay(selectedDirectionRange[0])} – ${formatDay(selectedDirectionRange[1])}`;
        const { svg, plot, width, height } = extremeCreateSvg(container, detail ? 210 : 160,
            `Wind rose: ${row.city}, ${period}. Radius shows number of heavy rainfall days.`,
            { top: 16, right: 15, bottom: 16, left: 15 }, 240);
        svg.attr("role", "group");
        const radius = detail ? 72 : 48;
        const radial = d3.scaleLinear().domain([0, maximum]).nice().range([0, radius]);
        const centre = plot.append("g").attr("transform", `translate(${width / 2},${height / 2})`);
        const directions = compass.map((name, i) => ({ name, count: row.counts[i], angle: i * Math.PI / 4 }));
        const ticks = radial.ticks(Math.min(4, radial.domain()[1])).filter(value => value > 0 && Number.isInteger(value));
        centre.append("g").selectAll("circle").data(ticks).join("circle")
            .attr("class", "extreme-rose-ring").attr("r", radial).attr("fill", "none");
        centre.append("g").selectAll("line").data(directions).join("line")
            .attr("class", "extreme-rose-spoke").attr("x1", 0).attr("y1", 0)
            .attr("x2", direction => radius * Math.sin(direction.angle))
            .attr("y2", direction => -radius * Math.cos(direction.angle));
        const arc = d3.arc().innerRadius(0).outerRadius(direction => radial(direction.count))
            .startAngle(direction => direction.angle - Math.PI / 8 + 0.025)
            .endAngle(direction => direction.angle + Math.PI / 8 - 0.025);
        const petals = centre.append("g").selectAll("path").data(directions).join("path")
            .attr("class", "extreme-rose-petal").attr("d", arc)
            .attr("fill", direction => directionColor(direction.name));
        // Transparent full-radius sectors also make zero counts reachable by pointer and keyboard.
        const hitArc = d3.arc().innerRadius(0).outerRadius(radius)
            .startAngle(direction => direction.angle - Math.PI / 8)
            .endAngle(direction => direction.angle + Math.PI / 8);
        const hits = centre.append("g").selectAll("path").data(directions).join("path")
            .attr("class", "extreme-rose-hit").attr("d", hitArc).attr("fill", "transparent")
            .attr("tabindex", 0).attr("role", "img")
            .attr("aria-label", direction => `${row.city}, ${period}. Wind from ${direction.name}: ${direction.count} days`);
        const show = (event, direction) => {
            petals.attr("data-active", other => other.name === direction.name ? "true" : null);
            tooltip.show(event, `<strong>${row.city}${row.year ? ` · ${row.year}` : ""}</strong><br>${period}` +
                `<br>Wind from ${direction.name}: ${direction.count} days`);
        };
        const hide = () => { tooltip.hide(); petals.attr("data-active", null); };
        hits.on("pointerenter", show).on("pointermove", show).on("pointerleave", hide).on("focus", show).on("blur", hide);
        centre.append("g").selectAll("text").data(directions).join("text")
            .attr("class", "extreme-rose-compass").attr("x", direction => (radius + 16) * Math.sin(direction.angle))
            .attr("y", direction => -(radius + 16) * Math.cos(direction.angle))
            .attr("dy", "0.35em").attr("text-anchor", "middle").text(direction => direction.name);
        centre.append("g").selectAll("text").data(ticks).join("text")
            .attr("class", "extreme-rose-tick").attr("x", 4).attr("y", value => -radial(value) + 11).text(value => value);
        if (row.total > 0 && row.missing === row.total) centre.append("text")
            .attr("class", "extreme-axis-label").attr("text-anchor", "middle").attr("y", 6)
            .text("Unavailable");
        if (row.total === 0) centre.append("text").attr("class", "extreme-axis-label")
            .attr("text-anchor", "middle").attr("y", 5).text("0 days");
    }

    // Follow the global time window and season set by any other chart.
    DashSync.on(detail => {
        if (detail.source === "init") return;
        if (detail.keys.includes("range")) {
            const range = DashSync.range().map(clampDate);
            navigators.filter(nav => nav.id !== detail.source).forEach(nav => {
                nav.onRange(range.slice());
                nav.syncBrush(range);
            });
        }
        if (detail.keys.includes("quarter")) {
            renderDaily(wind);
            renderDaily(sunshine);
            renderDirection();
        }
    });

    renderDaily(wind);
    renderDaily(sunshine);
    renderDirection();
}
