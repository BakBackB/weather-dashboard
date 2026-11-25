// Temperature tab (RQ1): chart "A Typical Year" with its drill-down
// (all months → one month in every year → the days of one month in one year).
// Uses the helpers from temperatureShared.js.

function drawTemperatureTypicalYear() {
    const color = cityColorScale();
    const tooltip = createTooltip();
    const format = v => v.toFixed(1);

    // Averages per city and calendar month for a set of days.
    const monthlyValues = rows => summarizeGroups(rows, d => d.city, d => d.date.getMonth(), (v, city, month) => {
        const max = average(v, d => d.tempMax);
        const min = average(v, d => d.tempMin);
        return {
            city, month, max, min,
            mean: average(v, d => d.tempMean),
            humidity: average(v, d => d.humidity),
            sunshine: average(v, d => d.sunshineHours),
            range: max - min
        };
    });

    // 10-year averages: the reference in the drill-down charts.
    const climate = monthlyValues(rawParsedWeather);
    const tenYearMean = (city, month) => climate.find(c => c.city === city && c.month === month).mean;

    // The y-axis of "A Typical Year" covers the months of every single year, so it stays still when filtering.
    const everyMonth = Array.from(d3.group(rawParsedWeather, d => d.date.getFullYear()).values())
        .flatMap(monthlyValues);
    const filters = temperatureFilters;
    initTemperatureFilters();

    // Levels: all months → one month in every year → the days of one month in one year.
    const fingerprintId = "#temperature-fingerprint-chart";
    const fingerprintHeight = 410;
    const path = d3.select("#temperatureFingerprintPath");
    let view = { level: "months" };  // { level: "month", d } or { level: "days", d, r }

    // Hover guide (as in Lab 06): x.invert turns the pointer position into a data value, a bisector finds the
    // closest position, a dashed vertical line marks it and the values of the checked cities are written above
    // the plot. Returns a function to set the x scale and the positions ([{ key, label, values: [{ city, value }] }],
    // sorted by key) whenever the chart is drawn.
    function addHoverGuide(svg, width, height) {
        let x = null;
        let positions = [];
        const bisect = d3.bisector(p => p.key).center;
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
            if (!positions.length) return;
            const [px] = d3.pointer(event, svg.node());
            const p = positions[bisect(positions, x.invert(Math.max(0, Math.min(width, px))))];
            const checked = Array.from(document.querySelectorAll("#cityFilters input:checked")).map(cb => cb.value);
            guide.attr("x1", x(p.key)).attr("x2", x(p.key)).attr("display", null);
            readout.text(`${p.label} — ` + p.values
                .filter(v => checked.includes(v.city))
                .map(v => `${short[v.city]}: ${format(v.value)}°C`).join(" · "));
        }).on("mouseleave", () => {
            guide.attr("display", "none");
            readout.text("");
        });
        return (newX, newPositions) => {
            x = newX;
            positions = newPositions;
        };
    }

    // animate: the day view moves to a new year with a transition (year slider).
    function renderFingerprint(animate = false) {
        tooltip.hide();
        if (view.level === "months") drawFingerprint();
        else if (view.level === "month") drawMonth(view.d);
        else drawDays(view.r, view.d.month, animate);

        drawPath();
        applyTemperatureCityFilter();
    }

    // Navigation path above the chart, e.g. "All years › April › 2019" or "2022 › February";
    // every step except the current one can be clicked to go back to it.
    function drawPath() {
        const steps = [{ label: filters.year === null ? "All years" : String(filters.year), target: { level: "months" } }];
        if (view.level !== "months") {
            const monthName = d3.timeFormat("%B")(new Date(2000, view.d.month, 1));
            steps.push({ label: view.level === "month" ? `${monthName} (every year)` : monthName });
        }

        // On the overview the path would only repeat the chart title, so it is hidden (but keeps its space).
        path.style("visibility", view.level === "months" ? "hidden" : null);
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

        // In the day view: arrows to the previous and next month (within the selected season).
        if (view.level === "days") {
            [-1, 1].forEach(step => {
                const target = neighbourMonth(step);
                const name = target && d3.timeFormat("%B")(new Date(2000, target.month, 1));
                path.append("button")
                    .attr("class", step < 0 ? "temperature-path-arrow temperature-path-arrow-first" : "temperature-path-arrow")
                    .attr("type", "button")
                    .property("disabled", target === null)
                    .text(step < 0 ? `‹ ${name ?? "Previous"}` : `${name ?? "Next"} ›`)
                    .on("click", () => showMonthDays(target));
            });
        }
    }

    // The month before (step -1) or after (step +1) the open day view, or null at the edge. With a season only its
    // months are used; with "All months" December continues with January of the next year.
    const dataYears = d3.extent(rawParsedWeather, d => d.date.getFullYear());
    function neighbourMonth(step) {
        const months = filters.quarter.months;
        const i = months.indexOf(view.d.month) + step;
        if (i >= 0 && i < months.length) return { month: months[i], year: filters.year };
        if (months.length < 12) return null;
        const year = filters.year + step;
        if (year < dataYears[0] || year > dataYears[1]) return null;
        return { month: step > 0 ? 0 : 11, year };
    }

    // Opens the day view of another month for the same city (animated); a new year also moves the year slider.
    function showMonthDays({ month, year }) {
        const city = view.d.city;
        const days = rawParsedWeather.filter(row =>
            row.city === city && row.date.getFullYear() === year && row.date.getMonth() === month);
        view = {
            level: "days",
            d: climate.find(c => c.city === city && c.month === month),
            r: { city, year, mean: average(days, row => row.tempMean) }
        };
        if (year !== filters.year) setTemperatureFilters({ year });
        else renderFingerprint(true);
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
                    : { level: "days", d, r: { city: d.city, year: filters.year, mean: d.mean } };
                renderFingerprint();
            });
        move(dots).attr("cx", d => x(d.month)).attr("cy", d => y(d.mean));

        setFingerprintGuide(x, months.map(m => ({
            key: m,
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
        const perYear = summarizeGroups(rawParsedWeather.filter(r => r.date.getMonth() === d.month),
            r => r.city, r => r.date.getFullYear(), (v, city, year) => ({
                city, year,
                mean: average(v, r => r.tempMean),
                min: average(v, r => r.tempMin),
                max: average(v, r => r.tempMax),
                humidity: average(v, r => r.humidity),
                sunshine: average(v, r => r.sunshineHours)
            }));

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
                // Another city's bar selects that city. The highlighted city's bar selects its year for all charts
                // (the year slider moves) and opens the days of that year.
                if (r.city !== d.city) {
                    view = { level: "month", d: climate.find(c => c.city === r.city && c.month === d.month) };
                    renderFingerprint();
                } else {
                    view = { level: "days", d, r };
                    setTemperatureFilters({ year: r.year });
                }
            });
        // The year chosen with the year slider is outlined.
        bars.append("rect")
            .attr("y", r => yYear(r.max))
            .attr("width", xCityYear.bandwidth())
            .attr("height", r => yYear(r.min) - yYear(r.max))
            .attr("rx", 2)
            .attr("fill", r => color(r.city))
            .attr("fill-opacity", 0.45)
            .attr("stroke", "#1e293b")
            .attr("stroke-width", r => r.year === filters.year ? 2 : 0);
        bars.append("line")
            .attr("x1", -1).attr("x2", xCityYear.bandwidth() + 1)
            .attr("y1", r => yYear(r.mean)).attr("y2", r => yYear(r.mean))
            .attr("stroke", r => color(r.city))
            .attr("stroke-width", 2.5);

        // The clicked city's 10-year average for this month, to spot warm and cold years.
        const cityAverage = tenYearMean(d.city, d.month);
        svg.append("line")
            .attr("x1", 0).attr("x2", w)
            .attr("y1", yYear(cityAverage)).attr("y2", yYear(cityAverage))
            .attr("stroke", color(d.city))
            .attr("stroke-dasharray", "5,4")
            .style("pointer-events", "none");
        svg.append("text")
            .attr("x", w + 6).attr("y", yYear(cityAverage))
            .attr("dy", "0.35em")
            .attr("font-size", "11px").attr("fill", color(d.city))
            .text(`avg. ${format(cityAverage)}°C`);
    }

    // Level 3: one month in one year, day by day: one line per city (daily mean), the clicked city highlighted
    // with a band from its daily minimum to maximum. When only the year changes (year slider), the chart is
    // updated with a transition, so the days of different years can be compared.
    let setDaysGuide;
    function drawDays(r, month, animate = false) {
        const checked = Array.from(document.querySelectorAll("#cityFilters input:checked")).map(cb => cb.value);
        const days = rawParsedWeather.filter(row => row.date.getFullYear() === r.year && row.date.getMonth() === month);
        const highlighted = days.filter(row => row.city === r.city);
        const margin = { top: 30, right: 90, bottom: 40, left: 60 };
        const w = 850 - margin.left - margin.right;
        const h = fingerprintHeight - margin.top - margin.bottom;

        // Same highlighted city (another year or month): update the existing chart, otherwise draw it new.
        const structure = r.city;
        let svg = d3.select(fingerprintId).select(".temp-fp-days");
        animate = animate && !svg.empty() && svg.attr("data-structure") === structure;
        if (!animate) svg = buildDays(margin, w, h).attr("data-structure", structure);
        const move = selection => animate ? selection.transition().duration(TEMP_DURATION) : selection;

        // x: day of the month, so the days of different years line up.
        const dayCount = d3.max(days, row => row.date.getDate());
        const day = row => row.date.getDate();
        const xDay = d3.scaleLinear().domain([1, dayCount]).range([0, w]);
        // The y-axis covers this month in every year (band of the highlighted city, lines of the checked cities),
        // so it stays still when the year slider moves and only the data changes.
        const monthDays = rawParsedWeather.filter(row => row.date.getMonth() === month);
        const bandDays = monthDays.filter(row => row.city === r.city);
        const shown = monthDays.filter(row => checked.includes(row.city));
        const yDay = d3.scaleLinear()
            .domain([Math.min(d3.min(bandDays, row => row.tempMin), d3.min(shown, row => row.tempMean) ?? Infinity) - 1,
                     Math.max(d3.max(bandDays, row => row.tempMax), d3.max(shown, row => row.tempMean) ?? -Infinity) + 1])
            .nice()
            .range([h, 0]);
        const monthYear = d3.timeFormat("%B %Y")(new Date(r.year, month, 1));
        const sameLength = animate && +svg.attr("data-days") === dayCount;  // paths only morph with equal points
        svg.attr("data-days", dayCount);
        const morph = selection => sameLength ? move(selection) : selection;

        svg.select(".temp-fp-days-title").text(`${monthYear}, day by day · ${r.city}`);

        const grid = svg.select(".temp-fp-days-grid").selectAll("line")
            .data(yDay.ticks(6), d => d)
            .join(enter => enter.append("line")
                .attr("x1", 0).attr("x2", w)
                .attr("y1", d => yDay(d)).attr("y2", d => yDay(d))
                .attr("stroke", "#e2e8f0")
                .attr("stroke-dasharray", "4,4"));
        move(grid).attr("y1", d => yDay(d)).attr("y2", d => yDay(d));
        move(svg.select(".temp-fp-days-x-axis")).call(d3.axisBottom(xDay)
            .tickValues(d3.range(1, dayCount + 1, 5))
            .tickFormat(d => `${String(d).padStart(2, "0")} ${MONTH_LABELS[month]}`));
        move(svg.select(".temp-fp-days-y-axis")).call(d3.axisLeft(yDay).ticks(5));

        morph(svg.select(".temp-fp-days-band").datum(highlighted))
            .attr("d", d3.area().x(row => xDay(day(row))).y0(row => yDay(row.tempMin)).y1(row => yDay(row.tempMax)));

        const lines = svg.select(".temp-fp-days-lines").selectAll(".temp-fp-day-line")
            .data(Array.from(d3.group(days, row => row.city)), ([city]) => city)
            .join(enter => {
                const g = enter.append("g")
                    .attr("class", "temp-fp-day-line temp-city")
                    .attr("data-city", ([city]) => city)
                    .attr("opacity", ([city]) => city === r.city ? 1 : 0.3)
                    .style("cursor", ([city]) => city === r.city ? null : "pointer");
                g.append("path")
                    .attr("class", "line")
                    .attr("stroke", ([city]) => color(city))
                    .style("pointer-events", "stroke");
                return g;
            })
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
                    r: { city, year: r.year, mean: average(rows, row => row.tempMean) }
                };
                renderFingerprint();
            });
        morph(lines.select("path").datum(([, rows]) => rows))
            .attr("d", d3.line().x(row => xDay(day(row))).y(row => yDay(row.tempMean)));
        const dots = lines.selectAll("circle")
            .data(([, rows]) => rows, day)
            .join(enter => enter.append("circle")
                .attr("r", 3)
                .attr("fill", row => color(row.city))
                .attr("cx", row => xDay(day(row)))
                .attr("cy", row => yDay(row.tempMean)))
            .on("mouseover", (event, row) => {
                tooltip.show(event, `<strong>${row.city}</strong> · ${d3.timeFormat("%A, %d %B %Y")(row.date)}<br/>` +
                    `Mean: ${format(row.tempMean)}°C · Min–max: ${format(row.tempMin)}–${format(row.tempMax)}°C<br/>` +
                    `Humidity: ${Math.round(row.humidity)}% · Sunshine: ${format(row.sunshineHours)} h` +
                    (row.city === r.city ? "" : `<br/><em>Click to highlight ${row.city}</em>`));
            })
            .on("mouseout", tooltip.hide);
        move(dots).attr("cx", row => xDay(day(row))).attr("cy", row => yDay(row.tempMean));

        // The month's average in that year for the clicked city, in neutral grey so it is not mistaken for data.
        move(svg.select(".temp-fp-days-avg")).attr("y1", yDay(r.mean)).attr("y2", yDay(r.mean));
        svg.select(".temp-fp-days-avg-label").text(`avg. ${format(r.mean)}°C`);
        move(svg.select(".temp-fp-days-avg-label")).attr("y", yDay(r.mean));

        setDaysGuide(xDay, Array.from(d3.group(days, day), ([d, rows]) => ({
            key: d,
            label: d3.timeFormat("%d %b")(rows[0].date),
            values: rows.map(row => ({ city: row.city, value: row.tempMean }))
        })).sort((a, b) => a.key - b.key));
    }

    // The parts of the day view that do not change with the year.
    function buildDays(margin, w, h) {
        const { svg } = createSvg(fingerprintId, fingerprintHeight, margin);
        svg.classed("temp-fp-days", true);
        svg.append("text")
            .attr("class", "temp-fp-days-title")
            .attr("x", 0).attr("y", -12)
            .attr("font-size", "12px").attr("font-weight", 600).attr("fill", "#475569");
        svg.append("g").attr("class", "temp-fp-days-grid");
        svg.append("g").attr("class", "axis temp-fp-days-x-axis")
            .attr("transform", `translate(0,${h})`);
        svg.append("g").attr("class", "axis temp-fp-days-y-axis");
        addAxisLabel(svg, "Temperature (°C)", -h / 2, -45, true);
        svg.append("path").attr("class", "temp-fp-days-band")
            .attr("fill", color(view.r.city))
            .attr("fill-opacity", 0.15);
        svg.append("g").attr("class", "temp-fp-days-lines");
        svg.append("line").attr("class", "temp-fp-days-avg")
            .attr("x1", 0).attr("x2", w)
            .attr("stroke", "#64748b")
            .attr("stroke-dasharray", "5,4")
            .style("pointer-events", "none");
        svg.append("text").attr("class", "temp-fp-days-avg-label")
            .attr("x", w + 6)
            .attr("dy", "0.35em")
            .attr("font-size", "11px").attr("fill", "#64748b");
        setDaysGuide = addHoverGuide(svg, w, h);
        return svg;
    }

    // The day view fits its y-axis to the checked cities, so it is redrawn when they change.
    document.querySelectorAll("#cityFilters input").forEach(checkbox => {
        checkbox.addEventListener("change", () => {
            if (view.level === "days") renderFingerprint();
        });
    });

    // The year slider is a filter and never changes the level: in "month in every year" it outlines the chosen
    // year, in the day view it shows the same month in the chosen year ("All years" goes back to every year).
    // A new season always goes back to the overview of that season, since a single month cannot be filtered by it.
    let shownQuarter = filters.quarter;
    document.addEventListener("temperatureFiltersChanged", () => {
        const seasonChanged = filters.quarter !== shownQuarter;
        shownQuarter = filters.quarter;
        if (view.level === "months" || seasonChanged) view = { level: "months" };
        else if (view.level === "days" && filters.year === null) view = { level: "month", d: view.d };
        else if (view.level === "days") {
            const city = view.d.city;
            const days = rawParsedWeather.filter(row =>
                row.city === city && row.date.getFullYear() === filters.year && row.date.getMonth() === view.d.month);
            view = {
                level: "days",
                d: view.d,
                r: { city, year: filters.year, mean: average(days, row => row.tempMean) }
            };
        }
        renderFingerprint(true);
    });

    renderFingerprint();
}
