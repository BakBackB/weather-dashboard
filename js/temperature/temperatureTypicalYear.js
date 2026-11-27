// Temperature tab
// Chart "A Typical Year" with three levels
//   1. Overview: the monthly mean temperature of every city
//   2. One month in every year
//   3. One month in the selected year, day by day
// Optional sunshine strips below the chart, one per city.

function drawTemperatureTypicalYear() {
    const color = cityColorScale();
    const tooltip = createTooltip();
    const formatNumber = value => value.toFixed(1);

    // Averages of every city and calendar month for a list of days
    const monthlyValues = days => summarizeGroups(days, row => row.city, row => row.date.getMonth(), (rows, city, month) => {
        const max = average(rows, row => row.tempMax);
        const min = average(rows, row => row.tempMin);
        return {
            city, month, max, min,
            mean: average(rows, row => row.tempMean),
            humidity: average(rows, row => row.humidity),
            sunshine: average(rows, row => row.sunshineHours),
            range: max - min
        };
    });

    // 10-year averages of every city and month, used as reference in the drill-down
    const tenYearAverages = monthlyValues(rawParsedWeather);
    const tenYearMean = (city, month) => tenYearAverages.find(entry => entry.city === city && entry.month === month).mean;

    // Monthly values of every single year, used to fix the axes so they do not move when filtering
    const monthsOfEveryYear = Array.from(d3.group(rawParsedWeather, row => row.date.getFullYear()).values())
        .flatMap(monthlyValues);

    // Shared year and season filter
    const filters = temperatureFilters;
    initTemperatureFilters();

    // Chart container, its height and the navigation path above it
    const chartId = "#temperature-fingerprint-chart";
    const chartHeight = 410;
    const pathNav = d3.select("#temperatureFingerprintPath");

    // What the chart shows
    //   { level: "months" }               the overview
    //   { level: "month", city, month }   that month in every year
    //   { level: "days", city, month }    that month in the selected year, day by day
    // city is the highlighted city.
    let view = { level: "months" };


    // Hover guide
    // A dashed vertical line at the position closest to the mouse, with the temperature of every checked city
    // written above the chart. The sunshine strips below show the same position.
    // xScale.invert turns the mouse position into a data value and the bisector finds the closest position.
    // addHoverGuide is called when a chart is built and returns setGuide(xScale, positions),
    // which the chart calls every time it is drawn.
    // positions: list of { key, label, values } sorted by key, values: list of { city, temp, sunshine }
    let setGuide;
    function addHoverGuide(svg, width, height) {
        let xScale = null;
        let positions = [];
        const bisectKey = d3.bisector(position => position.key).center;
        const shortName = { "Hanoi": "Hanoi", "Da Nang": "Da Nang", "Ho Chi Minh City": "HCMC" };

        svg.insert("rect", ":first-child")  // catches the mouse in the gaps between the marks
            .attr("width", width).attr("height", height)
            .attr("fill", "transparent");
        const guideLine = svg.append("line")
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
            const [mouseX] = d3.pointer(event, svg.node());
            const position = positions[bisectKey(positions, xScale.invert(Math.max(0, Math.min(width, mouseX))))];
            const checked = checkedCities();
            guideLine.attr("x1", xScale(position.key)).attr("x2", xScale(position.key)).attr("display", null);
            sunshineGuide(xScale(position.key), position.values);
            readout.text(`${position.label} — ` + position.values
                .filter(value => checked.includes(value.city))
                .map(value => `${shortName[value.city]}: ${formatNumber(value.temp)}°C`).join(" · "));
        }).on("mouseleave", () => {
            guideLine.attr("display", "none");
            readout.text("");
            sunshineGuide(null, null);
        });

        return (newXScale, newPositions) => {
            xScale = newXScale;
            positions = newPositions;
        };
    }


    // Sunshine strips below the chart
    // Opened with the "☀ Sunshine" button (closed by default).
    // One strip per checked city with its sunshine hours, on the same x-axis as the chart above.
    // Each strip has its own y-axis starting at 0.
    const sunshineId = "#temperature-fingerprint-sunshine";
    const sunshineButton = d3.select("#temperatureSunshineToggle");
    const stripHeight = 80;
    const stripStep = 100;  // one strip plus the gap with the city name
    // Top of the sunshine axis, for monthly averages and for single days
    const sunshineMax = {
        monthly: d3.max(monthsOfEveryYear, entry => entry.sunshine),
        daily: d3.max(rawParsedWeather, row => row.sunshineHours)
    };

    // The button opens and closes the strips (the animation is done in dashboard.css)
    sunshineButton.on("click", () => {
        const open = !d3.select(sunshineId).classed("open");
        d3.select(sunshineId).classed("open", open);
        sunshineButton.classed("active", open).attr("aria-pressed", open);
    });

    // Draws the sunshine bars of the current level
    // level: name of the level, margin and xScale: those of the chart above,
    // items: list of { city, key, label, sunshine }, maxSunshine: top of the axis,
    // unit: text after the value in the tooltip, animate: move the bars instead of drawing them new
    function drawSunshine(level, margin, xScale, items, maxSunshine, unit, animate) {
        const cities = checkedCities();
        const width = TEMP_CHART_WIDTH - margin.left - margin.right;

        // Same level and same cities: update the strips, otherwise build them new
        const structure = `${level}|${cities.join(",")}`;
        let svg = d3.select(sunshineId).select("svg > g");
        animate = animate && !svg.empty() && svg.attr("data-structure") === structure;
        if (!animate) svg = buildSunshine(cities, margin, width).attr("data-structure", structure);
        const move = selection => animate ? selection.transition().duration(TEMP_DURATION) : selection;

        // Bar width from the distance between two positions
        const keys = Array.from(new Set(items.map(item => item.key))).sort(d3.ascending);
        const barWidth = Math.max(1, (keys.length > 1 ? xScale(keys[1]) - xScale(keys[0]) : width) * 0.6);
        const yScale = d3.scaleLinear().domain([0, maxSunshine]).nice().range([stripHeight, 0]);

        const strips = svg.selectAll(".temp-sun-strip");
        move(strips.select(".temp-sun-axis")).call(d3.axisLeft(yScale).ticks(3));
        const bars = strips.select(".temp-sun-bars").selectAll("rect")
            .data(city => items.filter(item => item.city === city), item => item.key)
            .join(enter => enter.append("rect")
                .attr("x", item => xScale(item.key) - barWidth / 2).attr("width", barWidth)
                .attr("y", stripHeight).attr("height", 0)
                .attr("fill", item => color(item.city))
                .attr("fill-opacity", 0.6))
            .on("mouseover", (event, item) => tooltip.show(event,
                `<strong>${item.city}</strong> · ${item.label}<br/>Sunshine: ${formatNumber(item.sunshine)} ${unit}`))
            .on("mouseout", tooltip.hide);
        move(bars)
            .attr("x", item => xScale(item.key) - barWidth / 2).attr("width", barWidth)
            .attr("y", item => yScale(item.sunshine)).attr("height", item => stripHeight - yScale(item.sunshine));
    }

    // Builds the parts of the strips that only change with the level or the checked cities
    function buildSunshine(cities, margin, width) {
        const height = cities.length * stripStep;
        const { svg } = createSvg(sunshineId, height + 10, { top: 20, right: margin.right, bottom: 0, left: margin.left });
        addAxisLabel(svg, "Sunshine (h)", -(height - 20) / 2, -45, true);
        svg.append("clipPath").attr("id", "temperature-sun-clip")
            .append("rect").attr("x", -8).attr("width", width + 16).attr("height", stripHeight);  // room for the edge bars

        const strips = svg.selectAll(".temp-sun-strip")
            .data(cities).join("g")
            .attr("class", "temp-sun-strip")
            .attr("transform", (city, index) => `translate(0,${index * stripStep})`);
        // City name above the strip
        strips.append("text")
            .attr("y", -6)
            .attr("font-size", "11px").attr("font-weight", 600)
            .attr("fill", city => color(city))
            .text(city => city);
        // Base line, axis and bars
        strips.append("line")
            .attr("x2", width).attr("y1", stripHeight).attr("y2", stripHeight)
            .attr("stroke", "#cbd5e1");
        strips.append("g").attr("class", "axis temp-sun-axis");
        strips.append("g").attr("class", "temp-sun-bars").attr("clip-path", "url(#temperature-sun-clip)");
        // Value at the hover guide, right of the strip
        strips.append("text").attr("class", "temp-sun-value")
            .attr("x", width + 6).attr("y", stripHeight / 2).attr("dy", "0.35em")
            .attr("font-size", "11px").attr("fill", city => color(city));
        // Continuation of the hover guide through all strips
        svg.append("line").attr("class", "temp-sun-guide")
            .attr("y1", -20).attr("y2", height - stripStep + stripHeight)
            .attr("stroke", "#64748b")
            .attr("stroke-dasharray", "4,4")
            .attr("display", "none")
            .style("pointer-events", "none");
        return svg;
    }

    // Shows the hover guide in the strips
    // guideX: position of the line, values: list of { city, sunshine }, null hides the guide
    function sunshineGuide(guideX, values) {
        const svg = d3.select(sunshineId).select("svg > g");
        if (svg.empty()) return;
        svg.select(".temp-sun-guide").attr("x1", guideX).attr("x2", guideX).attr("display", values ? null : "none");
        svg.selectAll(".temp-sun-strip").select(".temp-sun-value").text(city => {
            const value = values?.find(entry => entry.city === city);
            return value ? `${formatNumber(value.sunshine)} h` : "";
        });
    }


    // Drawing and navigation

    // Draws the current level, the navigation path and hides unchecked cities
    // animate: move the day view to the new year or month instead of drawing it new
    function renderFingerprint(animate = false) {
        tooltip.hide();
        if (view.level === "months") drawOverview();
        else if (view.level === "month") drawMonth(view.city, view.month);
        else drawDays(view.city, view.month, animate);

        drawPath();
        applyTemperatureCityFilter();
    }

    // Navigation path above the chart, for example the year 2022 followed by February
    // Every step except the current one can be clicked to go back to it.
    // In the day view it also has buttons for the previous and next month.
    function drawPath() {
        const yearStep = filters.year !== null ? String(filters.year)
            : filters.span ? `${filters.span[0]}–${filters.span[1]}` : "All years";
        const steps = [{ label: yearStep, target: { level: "months" } }];
        if (view.level !== "months") {
            const monthName = d3.timeFormat("%B")(new Date(2000, view.month, 1));
            steps.push({ label: view.level === "month" ? `${monthName} (every year)` : monthName });
        }

        // On the overview the path would only repeat the chart title, so it is hidden but keeps its space
        pathNav.style("visibility", view.level === "months" ? "hidden" : null);
        pathNav.selectAll("*").remove();
        steps.forEach((step, index) => {
            if (index > 0) pathNav.append("span").attr("class", "temperature-path-sep").text("›");
            const isCurrent = index === steps.length - 1;
            pathNav.append(isCurrent ? "span" : "button")
                .attr("class", isCurrent ? "temperature-path-current" : "temperature-path-step")
                .text(step.label)
                .on("click", isCurrent ? null : () => {
                    view = step.target;
                    renderFingerprint();
                });
        });

        // Previous and next month buttons (disabled at the edge)
        if (view.level === "days") {
            [-1, 1].forEach(direction => {
                const target = neighbourMonth(direction);
                const monthName = target && d3.timeFormat("%B")(new Date(2000, target.month, 1));
                pathNav.append("button")
                    .attr("class", direction < 0 ? "temperature-path-arrow temperature-path-arrow-first" : "temperature-path-arrow")
                    .attr("type", "button")
                    .property("disabled", target === null)
                    .text(direction < 0 ? `‹ ${monthName ?? "Previous"}` : `${monthName ?? "Next"} ›`)
                    .on("click", () => showMonthDays(target));
            });

            // Small badge when an arrow is disabled because the season filter ends there
            const limitedBySeason = filters.quarter.months.length < 12 && [-1, 1].some(direction => neighbourMonth(direction) === null);
            if (limitedBySeason) pathNav.append("span").attr("class", "temperature-path-badge").text("Limited by season filter");
        }
    }

    // First and last year of the data
    const dataYears = d3.extent(rawParsedWeather, row => row.date.getFullYear());

    // The month before (direction -1) or after (direction +1) the open day view, or null at the edge
    // With a season only its months are used. With "All months" December continues with January of the next year.
    function neighbourMonth(direction) {
        const months = filters.quarter.months;
        const monthIndex = months.indexOf(view.month) + direction;
        if (monthIndex >= 0 && monthIndex < months.length) return { month: months[monthIndex], year: filters.year };
        if (months.length < 12) return null;
        const year = filters.year + direction;
        if (year < dataYears[0] || year > dataYears[1]) return null;
        return { month: direction > 0 ? 0 : 11, year };
    }

    // Opens the day view of another month for the same city
    // A new year also moves the year slider.
    function showMonthDays({ month, year }) {
        view = { ...view, month };
        if (year !== filters.year) setTemperatureFilters({ year });
        else renderFingerprint(true);
    }


    // Level 1: overview
    // One line per city with the monthly mean temperature, the 10-year average or the selected year.
    // A new year or season updates the chart with a transition, so the lines can be followed.
    function drawOverview() {
        const margin = { top: 30, right: 70, bottom: 40, left: 60 };
        const width = TEMP_CHART_WIDTH - margin.left - margin.right;
        const height = chartHeight - margin.top - margin.bottom;

        // Update the existing overview, or build it when coming from another level
        let svg = d3.select(chartId).select(".temp-fp-overview");
        const animate = !svg.empty();
        if (!animate) svg = buildOverview(margin, width, height);
        const move = selection => animate ? selection.transition().duration(TEMP_DURATION) : selection;

        // The 10-year average, or the months of the selected year or year span (only days inside the day condition)
        const useTenYearAverages = filters.year === null && !filters.span && !temperatureHasCondition();
        const values = useTenYearAverages ? tenYearAverages : monthlyValues(temperatureRows());
        const months = filters.quarter.months;

        // All 12 months are drawn and the season sets the visible part, so a new season zooms instead of jumping
        const xScale = d3.scaleLinear().domain([months[0] - 0.5, months[months.length - 1] + 0.5]).range([0, width]);
        // The y-axis covers the months of every single year, so it stays still when filtering
        const yScale = d3.scaleLinear()
            .domain([Math.floor(d3.min(monthsOfEveryYear, entry => entry.mean)) - 1,
                     Math.ceil(d3.max(monthsOfEveryYear, entry => entry.mean)) + 1])
            .range([height, 0]);

        // Grid and axes
        const gridLines = svg.select(".temp-fp-grid").selectAll("line")
            .data(yScale.ticks(6), tick => tick)
            .join(enter => enter.append("line")
                .attr("x1", 0).attr("x2", width)
                .attr("y1", tick => yScale(tick)).attr("y2", tick => yScale(tick))
                .attr("stroke", "#e2e8f0")
                .attr("stroke-dasharray", "4,4"));
        move(gridLines).attr("y1", tick => yScale(tick)).attr("y2", tick => yScale(tick));
        move(svg.select(".temp-fp-y-axis")).call(d3.axisLeft(yScale));
        svg.select(".temp-fp-title")
            .text(filters.year === null ? temperatureYearLabel() : `Year ${filters.year}`);
        move(svg.select(".temp-fp-x-axis"))
            .call(d3.axisBottom(xScale).tickValues(months).tickFormat(month => MONTH_LABELS[month]));

        // One group per city with its line and dots
        const cityGroups = svg.select(".temp-fp-lines").selectAll(".temp-city")
            .data(Array.from(d3.group(values, entry => entry.city)), ([city]) => city)
            .join(enter => {
                const group = enter.append("g")
                    .attr("class", "temp-city")
                    .attr("data-city", ([city]) => city);
                group.append("path")
                    .attr("class", "temp-fp-mean-line")
                    .attr("fill", "none")
                    .attr("stroke", ([city]) => color(city))
                    .attr("stroke-width", 2)
                    .style("pointer-events", "none");
                return group;
            });
        const lineGenerator = d3.line().x(entry => xScale(entry.month)).y(entry => yScale(entry.mean));
        move(cityGroups.select(".temp-fp-mean-line").datum(([, entries]) => entries.slice().sort((first, second) => first.month - second.month)))
            .attr("d", lineGenerator);

        // The dots show details on hover and open the drill-down on click
        const dots = cityGroups.selectAll("circle")
            .data(([, entries]) => entries, entry => entry.month)
            .join(enter => enter.append("circle")
                .attr("r", 4)
                .attr("fill", entry => color(entry.city))
                .attr("cx", entry => xScale(entry.month))
                .attr("cy", entry => yScale(entry.mean))
                .style("cursor", "pointer"))
            .on("mouseover", function(event, entry) {
                d3.select(this).attr("r", 6);
                tooltip.show(event, `<strong>${entry.city}</strong> · ${MONTH_LABELS[entry.month]}<br/>` +
                    `Mean: ${formatNumber(entry.mean)}°C<br/>Avg. min–max: ${formatNumber(entry.min)}–${formatNumber(entry.max)}°C<br/>` +
                    `Daily range: ${formatNumber(entry.range)}°C<br/>` +
                    `Humidity: ${Math.round(entry.humidity)}% · Sunshine: ${formatNumber(entry.sunshine)} h/day<br/>` +
                    `<em>${filters.year === null ? "Click to see this month in every year" : "Click to see its days"}</em>`);
            })
            .on("mouseout", function() {
                d3.select(this).attr("r", 4);
                tooltip.hide();
            })
            .on("click", (event, entry) => {
                // With a year selected a month opens its days directly, otherwise that month in every year
                view = { level: filters.year === null ? "month" : "days", city: entry.city, month: entry.month };
                renderFingerprint();
            });
        move(dots).attr("cx", entry => xScale(entry.month)).attr("cy", entry => yScale(entry.mean));

        // City names right of the chart, at the height where each line leaves the chart
        // Names that would overlap are pushed apart.
        const lastMonth = months[months.length - 1];
        const meanOf = (city, month) => values.find(entry => entry.city === city && entry.month === month)?.mean;
        const labelPositions = TEMP_CITIES
            .map(city => {
                const nextMean = meanOf(city, lastMonth + 1);  // the line continues half a month towards the next month
                const edgeMean = nextMean === undefined ? meanOf(city, lastMonth) : (meanOf(city, lastMonth) + nextMean) / 2;
                return { city, y: yScale(edgeMean) };
            })
            .sort((first, second) => first.y - second.y);
        labelPositions.forEach((label, index) => {
            if (index > 0) label.y = Math.max(label.y, labelPositions[index - 1].y + 13);
        });
        const cityLabels = svg.select(".temp-fp-labels").selectAll("text")
            .data(labelPositions, label => label.city)
            .join(enter => enter.append("text")
                .attr("class", "temp-city")
                .attr("data-city", label => label.city)
                .attr("x", width + 8)
                .attr("y", label => label.y)
                .attr("dy", "0.35em")
                .attr("font-size", "11px").attr("font-weight", 600)
                .attr("fill", label => color(label.city))
                .text(label => label.city === "Ho Chi Minh City" ? "HCMC" : label.city));
        move(cityLabels).attr("y", label => label.y);

        // Hover guide positions, one per visible month
        setGuide(xScale, months.map(month => ({
            key: month,
            label: MONTH_LABELS[month],
            values: values.filter(entry => entry.month === month)
                .map(entry => ({ city: entry.city, temp: entry.mean, sunshine: entry.sunshine }))
        })));

        // Sunshine strips with the monthly sunshine
        const period = filters.year === null ? `(${temperatureYearLabel()})` : filters.year;
        drawSunshine("months", margin, xScale, values.map(entry => ({
            city: entry.city, key: entry.month, label: `${MONTH_LABELS[entry.month]} ${period}`, sunshine: entry.sunshine
        })), sunshineMax.monthly, "h/day", animate);
    }

    // Builds the parts of the overview that do not change with the filters
    function buildOverview(margin, width, height) {
        const { svg } = createSvg(chartId, chartHeight, margin);
        svg.classed("temp-fp-overview", true);

        svg.append("text")
            .attr("class", "temp-fp-title")
            .attr("x", 0).attr("y", -12)
            .attr("font-size", "12px").attr("font-weight", 600).attr("fill", "#475569");
        svg.append("g").attr("class", "temp-fp-grid");
        svg.append("g").attr("class", "axis temp-fp-x-axis")
            .attr("transform", `translate(0,${height})`);
        svg.append("g").attr("class", "axis temp-fp-y-axis");
        addAxisLabel(svg, "Temperature (°C)", -height / 2, -45, true);

        // Months outside the selected season lie outside the chart and are cut off
        svg.append("clipPath").attr("id", "temperature-fp-clip")
            .append("rect").attr("y", -6).attr("width", width).attr("height", height + 12);
        svg.append("g").attr("class", "temp-fp-lines").attr("clip-path", "url(#temperature-fp-clip)");
        svg.append("g").attr("class", "temp-fp-labels");

        setGuide = addHoverGuide(svg, width, height);
        return svg;
    }


    // Level 2: one month in every year
    // One line per city with the mean of that month in every year.
    // The highlighted city has a band from its average daily minimum to maximum
    // and a dashed line for its 10-year average, so warm and cold years stand out.
    function drawMonth(focusCity, month) {
        const monthName = d3.timeFormat("%B")(new Date(2000, month, 1));

        // Values of this month for every city and year
        const sourceDays = filters.year === null ? temperatureSpanRows() : rawParsedWeather;
        const yearValues = summarizeGroups(sourceDays.filter(row => row.date.getMonth() === month && temperatureInCondition(row)),
            row => row.city, row => row.date.getFullYear(), (rows, city, year) => ({
                city, year,
                mean: average(rows, row => row.tempMean),
                min: average(rows, row => row.tempMin),
                max: average(rows, row => row.tempMax),
                humidity: average(rows, row => row.humidity),
                sunshine: average(rows, row => row.sunshineHours)
            }));
        const valuesByCity = Array.from(d3.group(yearValues, entry => entry.city),
            ([city, entries]) => [city, entries.sort((first, second) => first.year - second.year)]);
        const focusValues = valuesByCity.find(([city]) => city === focusCity)[1];

        const margin = { top: 30, right: 90, bottom: 40, left: 60 };
        const { svg, width, height } = createSvg(chartId, chartHeight, margin);

        const years = Array.from(new Set(yearValues.map(entry => entry.year))).sort(d3.ascending);
        const xScale = d3.scaleLinear().domain([years[0] - 0.5, years[years.length - 1] + 0.5]).range([0, width]);
        // The y-axis fits every city of this month, so it stays the same when another city is highlighted
        const yScale = d3.scaleLinear()
            .domain([d3.min(yearValues, entry => entry.min) - 1, d3.max(yearValues, entry => entry.max) + 1]).nice()
            .range([height, 0]);

        // Title, grid and axes
        svg.append("text")
            .attr("x", 0).attr("y", -12)
            .attr("font-size", "12px").attr("font-weight", 600).attr("fill", "#475569")
            .text(`${monthName} in each year · ${focusCity} (band: average daily min–max)`);
        addGrid(svg, yScale, width);
        svg.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(xScale).tickValues(years).tickFormat(d3.format("d")));
        svg.append("g").attr("class", "axis").call(d3.axisLeft(yScale).ticks(5));
        addAxisLabel(svg, "Temperature (°C)", -height / 2, -45, true);

        // Grey column at the year selected with the year slider
        if (years.includes(filters.year)) {
            const yearWidth = xScale(1) - xScale(0);
            svg.append("rect")
                .attr("x", xScale(filters.year) - yearWidth / 2).attr("width", yearWidth)
                .attr("height", height)
                .attr("fill", "#e2e8f0")
                .style("pointer-events", "none");
        }

        // Band of the highlighted city
        svg.append("path")
            .datum(focusValues)
            .attr("d", d3.area().x(entry => xScale(entry.year)).y0(entry => yScale(entry.min)).y1(entry => yScale(entry.max)))
            .attr("fill", color(focusCity))
            .attr("fill-opacity", 0.15)
            .style("pointer-events", "none");

        // 10-year average of the highlighted city for this month
        const cityAverage = tenYearMean(focusCity, month);
        svg.append("line")
            .attr("x1", 0).attr("x2", width)
            .attr("y1", yScale(cityAverage)).attr("y2", yScale(cityAverage))
            .attr("stroke", color(focusCity))
            .attr("stroke-dasharray", "5,4")
            .style("pointer-events", "none");
        svg.append("text")
            .attr("x", width + 6).attr("y", yScale(cityAverage))
            .attr("dy", "0.35em")
            .attr("font-size", "11px").attr("fill", color(focusCity))
            .text(`avg. ${formatNumber(cityAverage)}°C`);

        // One line per city, the other cities are faded
        const cityLines = svg.selectAll(".temp-fp-year-line")
            .data(valuesByCity).join("g")
            .attr("class", "temp-fp-year-line temp-city")
            .attr("data-city", ([city]) => city)
            .attr("opacity", ([city]) => city === focusCity ? 1 : 0.3)
            .style("cursor", "pointer")
            // Hovering another city brings its line forward
            .on("mouseenter", (event, [hoveredCity]) => {
                cityLines.attr("opacity", ([city]) => city === focusCity ? 1 : city === hoveredCity ? 0.7 : 0.3);
            })
            .on("mouseleave", () => {
                cityLines.attr("opacity", ([city]) => city === focusCity ? 1 : 0.3);
            });
        cityLines.append("path")
            .attr("class", "line")
            .attr("d", ([, entries]) => d3.line().x(entry => xScale(entry.year)).y(entry => yScale(entry.mean))(entries))
            .attr("stroke", ([city]) => color(city))
            .style("pointer-events", "stroke")
            .on("click", (event, [city]) => {
                if (city !== focusCity) highlightCity(city);
            });
        cityLines.selectAll("circle")
            .data(([, entries]) => entries).join("circle")
            .attr("cx", entry => xScale(entry.year))
            .attr("cy", entry => yScale(entry.mean))
            .attr("r", 4)
            .attr("fill", entry => color(entry.city))
            .on("mouseover", (event, entry) => {
                const difference = entry.mean - tenYearMean(entry.city, month);
                tooltip.show(event, `<strong>${entry.city}</strong> · ${monthName} ${entry.year}<br/>` +
                    `Mean: ${formatNumber(entry.mean)}°C (${difference > 0 ? "+" : ""}${formatNumber(difference)}°C vs. 10-year average)<br/>` +
                    `Avg. min–max: ${formatNumber(entry.min)}–${formatNumber(entry.max)}°C<br/>` +
                    `Humidity: ${Math.round(entry.humidity)}% · Sunshine: ${formatNumber(entry.sunshine)} h/day<br/>` +
                    `<em>${entry.city === focusCity ? "Click to see its days" : `Click to highlight ${entry.city}`}</em>`);
            })
            .on("mouseout", tooltip.hide)
            .on("click", (event, entry) => {
                // A point of another city highlights that city.
                // A point of the highlighted city selects its year for all charts and opens its days.
                if (entry.city !== focusCity) highlightCity(entry.city);
                else {
                    view = { level: "days", city: focusCity, month };
                    setTemperatureFilters({ year: entry.year });
                }
            });

        // Makes another city the highlighted one
        function highlightCity(city) {
            view = { ...view, city };
            renderFingerprint();
        }

        // Hover guide positions, one per year
        setGuide = addHoverGuide(svg, width, height);
        setGuide(xScale, years.map(year => ({
            key: year,
            label: `${MONTH_LABELS[month]} ${year}`,
            values: yearValues.filter(entry => entry.year === year)
                .map(entry => ({ city: entry.city, temp: entry.mean, sunshine: entry.sunshine }))
        })));

        // Sunshine strips with the sunshine of this month in every year
        drawSunshine("month", margin, xScale, yearValues.map(entry => ({
            city: entry.city, key: entry.year, label: `${monthName} ${entry.year}`, sunshine: entry.sunshine
        })), sunshineMax.monthly, "h/day", false);
    }


    // Level 3: one month in the selected year, day by day
    // One line per city with the daily mean. The highlighted city has a band from its daily minimum to maximum
    // and a dashed line for its average of the month.
    // A new year or month updates the chart with a transition, so the days can be compared.
    function drawDays(focusCity, month, animate = false) {
        const year = filters.year;
        const checked = checkedCities();
        const monthDays = rawParsedWeather.filter(row => row.date.getFullYear() === year && row.date.getMonth() === month);
        const focusDays = monthDays.filter(row => row.city === focusCity);
        const focusMean = average(focusDays, row => row.tempMean);
        const margin = { top: 30, right: 90, bottom: 40, left: 60 };
        const width = TEMP_CHART_WIDTH - margin.left - margin.right;
        const height = chartHeight - margin.top - margin.bottom;

        // Same highlighted city: update the existing chart, otherwise build it new
        let svg = d3.select(chartId).select(".temp-fp-days");
        animate = animate && !svg.empty() && svg.attr("data-structure") === focusCity;
        if (!animate) svg = buildDays(margin, width, height).attr("data-structure", focusCity);
        const move = selection => animate ? selection.transition().duration(TEMP_DURATION) : selection;

        // The x-axis is the day of the month, so the days of different years line up
        const dayCount = d3.max(monthDays, row => row.date.getDate());
        const dayOfMonth = row => row.date.getDate();
        const xScale = d3.scaleLinear().domain([1, dayCount]).range([0, width]);
        // The y-axis covers this month in every year (band of the highlighted city and lines of the checked cities),
        // so it stays still when the year changes and only the data moves
        const sameMonthAllYears = rawParsedWeather.filter(row => row.date.getMonth() === month);
        const focusAllYears = sameMonthAllYears.filter(row => row.city === focusCity);
        const checkedAllYears = sameMonthAllYears.filter(row => checked.includes(row.city));
        const yScale = d3.scaleLinear()
            .domain([Math.min(d3.min(focusAllYears, row => row.tempMin), d3.min(checkedAllYears, row => row.tempMean) ?? Infinity) - 1,
                     Math.max(d3.max(focusAllYears, row => row.tempMax), d3.max(checkedAllYears, row => row.tempMean) ?? -Infinity) + 1])
            .nice()
            .range([height, 0]);

        // Lines and the band can only change shape smoothly when the month has the same number of days
        const sameLength = animate && +svg.attr("data-days") === dayCount;
        svg.attr("data-days", dayCount);
        const morph = selection => sameLength ? move(selection) : selection;

        // Title, grid and axes
        const monthYear = d3.timeFormat("%B %Y")(new Date(year, month, 1));
        svg.select(".temp-fp-days-title").text(`${monthYear}, day by day · ${focusCity} (band: daily min–max)`);
        const gridLines = svg.select(".temp-fp-days-grid").selectAll("line")
            .data(yScale.ticks(6), tick => tick)
            .join(enter => enter.append("line")
                .attr("x1", 0).attr("x2", width)
                .attr("y1", tick => yScale(tick)).attr("y2", tick => yScale(tick))
                .attr("stroke", "#e2e8f0")
                .attr("stroke-dasharray", "4,4"));
        move(gridLines).attr("y1", tick => yScale(tick)).attr("y2", tick => yScale(tick));
        move(svg.select(".temp-fp-days-x-axis")).call(d3.axisBottom(xScale)
            .tickValues(d3.range(1, dayCount + 1, 5))
            .tickFormat(dayNumber => `${String(dayNumber).padStart(2, "0")} ${MONTH_LABELS[month]}`));
        move(svg.select(".temp-fp-days-y-axis")).call(d3.axisLeft(yScale).ticks(5));

        // Band of the highlighted city
        morph(svg.select(".temp-fp-days-band").datum(focusDays))
            .attr("d", d3.area().x(row => xScale(dayOfMonth(row))).y0(row => yScale(row.tempMin)).y1(row => yScale(row.tempMax)));

        // One line per city, the other cities are faded
        const cityLines = svg.select(".temp-fp-days-lines").selectAll(".temp-fp-day-line")
            .data(Array.from(d3.group(monthDays, row => row.city)), ([city]) => city)
            .join(enter => {
                const group = enter.append("g")
                    .attr("class", "temp-fp-day-line temp-city")
                    .attr("data-city", ([city]) => city)
                    .attr("opacity", ([city]) => city === focusCity ? 1 : 0.3)
                    .style("cursor", ([city]) => city === focusCity ? null : "pointer");
                group.append("path")
                    .attr("class", "line")
                    .attr("stroke", ([city]) => color(city))
                    .style("pointer-events", "stroke");
                return group;
            })
            // Hovering another city brings its line forward, clicking it highlights that city
            .on("mouseenter", (event, [hoveredCity]) => {
                cityLines.attr("opacity", ([city]) => city === focusCity ? 1 : city === hoveredCity ? 0.7 : 0.3);
            })
            .on("mouseleave", () => {
                cityLines.attr("opacity", ([city]) => city === focusCity ? 1 : 0.3);
            })
            .on("click", (event, [city]) => {
                if (city === focusCity) return;
                view = { ...view, city };
                renderFingerprint();
            });
        morph(cityLines.select("path").datum(([, rows]) => rows))
            .attr("d", d3.line().x(row => xScale(dayOfMonth(row))).y(row => yScale(row.tempMean)));
        const dots = cityLines.selectAll("circle")
            .data(([, rows]) => rows, dayOfMonth)
            .join(enter => enter.append("circle")
                .attr("r", 3)
                .attr("fill", row => color(row.city))
                .attr("cx", row => xScale(dayOfMonth(row)))
                .attr("cy", row => yScale(row.tempMean)))
            .on("mouseover", (event, row) => {
                tooltip.show(event, `<strong>${row.city}</strong> · ${d3.timeFormat("%A, %d %B %Y")(row.date)}<br/>` +
                    `Mean: ${formatNumber(row.tempMean)}°C · Min–max: ${formatNumber(row.tempMin)}–${formatNumber(row.tempMax)}°C<br/>` +
                    `Humidity: ${Math.round(row.humidity)}% · Sunshine: ${formatNumber(row.sunshineHours)} h` +
                    (row.city === focusCity ? "" : `<br/><em>Click to highlight ${row.city}</em>`));
            })
            .on("mouseout", tooltip.hide);
        move(dots).attr("cx", row => xScale(dayOfMonth(row))).attr("cy", row => yScale(row.tempMean));

        // Average of the month for the highlighted city, in grey so it is not mistaken for data
        move(svg.select(".temp-fp-days-avg")).attr("y1", yScale(focusMean)).attr("y2", yScale(focusMean));
        svg.select(".temp-fp-days-avg-label").text(`avg. ${formatNumber(focusMean)}°C`);
        move(svg.select(".temp-fp-days-avg-label")).attr("y", yScale(focusMean));

        // Hover guide positions, one per day
        setGuide(xScale, Array.from(d3.group(monthDays, dayOfMonth), ([dayNumber, rows]) => ({
            key: dayNumber,
            label: d3.timeFormat("%d %b")(rows[0].date),
            values: rows.map(row => ({ city: row.city, temp: row.tempMean, sunshine: row.sunshineHours }))
        })).sort((first, second) => first.key - second.key));

        // Sunshine strips with the sunshine of every day
        drawSunshine("days", margin, xScale, monthDays.map(row => ({
            city: row.city, key: dayOfMonth(row), label: d3.timeFormat("%d %B %Y")(row.date), sunshine: row.sunshineHours
        })), sunshineMax.daily, "h", animate);
    }

    // Builds the parts of the day view that do not change with the year or month
    function buildDays(margin, width, height) {
        const { svg } = createSvg(chartId, chartHeight, margin);
        svg.classed("temp-fp-days", true);
        svg.append("text")
            .attr("class", "temp-fp-days-title")
            .attr("x", 0).attr("y", -12)
            .attr("font-size", "12px").attr("font-weight", 600).attr("fill", "#475569");
        svg.append("g").attr("class", "temp-fp-days-grid");
        svg.append("g").attr("class", "axis temp-fp-days-x-axis")
            .attr("transform", `translate(0,${height})`);
        svg.append("g").attr("class", "axis temp-fp-days-y-axis");
        addAxisLabel(svg, "Temperature (°C)", -height / 2, -45, true);
        svg.append("path").attr("class", "temp-fp-days-band")
            .attr("fill", color(view.city))
            .attr("fill-opacity", 0.15);
        svg.append("g").attr("class", "temp-fp-days-lines");
        svg.append("line").attr("class", "temp-fp-days-avg")
            .attr("x1", 0).attr("x2", width)
            .attr("stroke", "#64748b")
            .attr("stroke-dasharray", "5,4")
            .style("pointer-events", "none");
        svg.append("text").attr("class", "temp-fp-days-avg-label")
            .attr("x", width + 6)
            .attr("dy", "0.35em")
            .attr("font-size", "11px").attr("fill", "#64748b");
        setGuide = addHoverGuide(svg, width, height);
        return svg;
    }


    // Reactions to the filters

    // City checkboxes
    // The chart is redrawn, because the day view fits its y-axis and the sunshine strips follow the checked cities.
    // If the highlighted city is unchecked, the first checked city becomes the highlighted one.
    document.querySelectorAll("#cityFilters input").forEach(checkbox => {
        checkbox.addEventListener("change", () => {
            const checked = checkedCities();
            if (view.level !== "months" && checked.length && !checked.includes(view.city)) view = { ...view, city: checked[0] };
            renderFingerprint(true);
        });
    });

    // Year and season filter
    // The year never changes the level. In "month in every year" it marks the year, in the day view it shows
    // the same month in the new year, and "All years" goes from the day view back to "month in every year".
    // A new season always goes back to the overview, because a single month cannot be filtered by season.
    let shownQuarter = filters.quarter;
    document.addEventListener("temperatureFiltersChanged", () => {
        const seasonChanged = filters.quarter !== shownQuarter;
        shownQuarter = filters.quarter;
        if (view.level === "months" || seasonChanged) view = { level: "months" };
        else if (view.level === "days" && filters.year === null) view = { ...view, level: "month" };
        renderFingerprint(true);
    });

    renderFingerprint();
}
