document.addEventListener("DOMContentLoaded", async () => {
    await loadWeatherData();
    document.dispatchEvent(new Event("weatherDataLoaded"));
});

// Start each chart independently after loading data.
document.addEventListener("weatherDataLoaded", drawTemperatureTypicalYear);
document.addEventListener("weatherDataLoaded", drawTemperatureSunshine);
document.addEventListener("weatherDataLoaded", drawTemperatureElNino);
document.addEventListener("weatherDataLoaded", drawExtremeCharts);
document.addEventListener("weatherDataLoaded", drawExtremeFrequency);
document.addEventListener("weatherDataLoaded", drawExtremeHeatmap);
document.addEventListener("weatherDataLoaded", drawExtremeStormDrivers);
document.addEventListener("weatherDataLoaded", drawRainfallChart);

// Rainfall State values
const rainfallState = {
    level: "year",
    city: null,
    year: null,
    month: null
};
let selectedRainfallDate = null;

// Rainfall colors for each city  
const rainfallCityColors = { 
    "Hanoi": "#0284C7",
    "Da Nang": "#D97706",
    "Ho Chi Minh City": "#D93856"
};
const rainfallCities = Object.keys(rainfallCityColors);
const rainfallSelectedCities = new Set(rainfallCities);
let rainfallTooltip = null;
let rainfallCityFiltersInitialized = false;
const rainfallReducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
const rainfallAnimationDuration = duration => rainfallReducedMotion ? 0 : duration;
const rainfallAnimationDelay = delay => rainfallReducedMotion ? 0 : delay;

function setupRainfallCityFilters() {
    const filters = document.getElementById("rainfallCityFilters");
    if (!filters || rainfallCityFiltersInitialized) return;

    filters.querySelectorAll("input[type='checkbox']").forEach(checkbox => {
        checkbox.addEventListener("change", () => {
            rainfallSelectedCities.clear();
            filters.querySelectorAll("input[type='checkbox']:checked")
                .forEach(input => rainfallSelectedCities.add(input.value));
            drawRainfallChart();
        });
    });

    rainfallCityFiltersInitialized = true;
}

function getRainfallTooltip() {
    if (!rainfallTooltip) {
        rainfallTooltip = d3.select("body").append("div")
            .attr("id", "rainfall-tooltip")
            .attr("class", "tooltip rainfall-tooltip")
            .attr("role", "tooltip")
            .attr("aria-hidden", "true")
            .style("opacity", 0);
    }
    return rainfallTooltip;
}

function positionRainfallTooltip(event) {
    const tooltip = getRainfallTooltip();
    const bounds = event.currentTarget.getBoundingClientRect();
    const pageX = event.type === "focus"
        ? bounds.left + window.scrollX + bounds.width / 2
        : event.pageX;
    const pageY = event.type === "focus"
        ? bounds.top + window.scrollY
        : event.pageY;
    const node = tooltip.node();
    const edge = 8;
    let left = pageX + 14;
    let top = pageY - node.offsetHeight - 12;

    if (left + node.offsetWidth > window.scrollX + window.innerWidth - edge) {
        left = pageX - node.offsetWidth - 14;
    }
    if (top < window.scrollY + edge) {
        top = pageY + 16;
    }

    tooltip.style("left", `${Math.max(window.scrollX + edge, left)}px`)
        .style("top", `${Math.max(window.scrollY + edge, top)}px`);
}

function showRainfallTooltip(event, datum) {
    const period = rainfallState.level === "year"
        ? d3.timeFormat("%Y")(datum.date)
        : rainfallState.level === "month"
            ? d3.timeFormat("%B %Y")(datum.date)
            : d3.timeFormat("%A, %d %B %Y")(datum.date);
    const amount = datum.rainfall === 0 ? "0" : d3.format(",.1f")(datum.rainfall);
    const tooltip = getRainfallTooltip();

    tooltip.interrupt()
        .html(`<strong>${datum.city}</strong><br><span class="tooltip-period">${period}</span><br>Rainfall: <strong>${amount} mm</strong>`)
        .attr("aria-hidden", "false");
    positionRainfallTooltip(event);
    tooltip.transition().duration(rainfallAnimationDuration(140)).style("opacity", 0.96);
}

function hideRainfallTooltip() {
    if (!rainfallTooltip) return;
    rainfallTooltip.interrupt()
        .attr("aria-hidden", "true")
        .transition().duration(rainfallAnimationDuration(160))
        .style("opacity", 0);
}

function bindRainfallBarInteractions(selection, canDrillDown, labelFor) {
    selection
        .attr("tabindex", 0)
        .attr("role", canDrillDown ? "button" : "img")
        .attr("aria-describedby", "rainfall-tooltip")
        .attr("aria-label", labelFor)
        .on("pointerenter", showRainfallTooltip)
        .on("pointermove", event => positionRainfallTooltip(event))
        .on("pointerleave", hideRainfallTooltip)
        .on("focus", showRainfallTooltip)
        .on("blur", hideRainfallTooltip);
}

function drawTemperatureChart() {
    // Temperature Chart

    const margin = { top: 40, right: 40, bottom: 50, left: 60 },
          width = 850 - margin.left - margin.right,
          height = 420 - margin.top - margin.bottom;

    const svgTemp = d3.select("#temperature-chart")
                  .append("svg")
                  .attr("width", width + margin.left + margin.right)
                  .attr("height", height + margin.top + margin.bottom)
                  .append("g")
                  .attr("transform", `translate(${margin.left},${margin.top})`);

    const tooltipTemp = d3.select("body").append("div")
                      .attr("class", "tooltip")
                      .style("opacity", 0);


    const rootStyles = getComputedStyle(document.documentElement);
    const color = d3.scaleOrdinal()
                    .domain(["Ho Chi Minh City", "Hanoi", "Da Nang"])
                    .range([
                        rootStyles.getPropertyValue('--color-hcm').trim() || "#D93856",
                        rootStyles.getPropertyValue('--color-hanoi').trim() || "#0284C7",
                        rootStyles.getPropertyValue('--color-danang').trim() || "#D97706"
                    ]);

    svgTemp.append("g").attr("class", "y-grid");
    const xAxisGroupTemp = svgTemp.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${height})`);
    const yAxisGroupTemp = svgTemp.append("g").attr("class", "axis y-axis");

    svgTemp.append("text")
       .attr("transform", "rotate(-90)")
       .attr("y", -45)
       .attr("x", -height / 2)
       .attr("text-anchor", "middle")
       .attr("fill", "#64748b")
       .attr("font-size", "12px")
       .text("Mean Temperature (°C)");

    // --- State Management ---
    let currentLevel = "year"; // "year" -> "month" -> "day"
    let selectedYear = null;
    let selectedMonth = null;
    let selectedCities = ["Ho Chi Minh City", "Hanoi", "Da Nang"];

    function updateTempChart() {
        let data = [];
        let tickFormat = d3.timeFormat("%Y");

        const backBtn = document.getElementById("backButton");
        const label = document.getElementById("currentViewLabel");

        if (currentLevel === "year") {
            data = getFilteredAggregatedData("year");
            tickFormat = d3.timeFormat("%Y");
            label.innerText = "10-Year Overview (By Year)";
            backBtn.style.display = "none";
        } else if (currentLevel === "month") {
            data = getFilteredAggregatedData("month", d => d.date.getFullYear() === selectedYear);
            tickFormat = d3.timeFormat("%b %Y");
            label.innerText = `Year ${selectedYear} (Monthly Details)`;
            backBtn.innerText = "← Back to Overview";
            backBtn.style.display = "inline-block";
        } else if (currentLevel === "day") {
            data = getFilteredAggregatedData("day", d => {
                return d.date.getFullYear() === selectedYear && (d.date.getMonth() + 1) === selectedMonth;
            });
            tickFormat = d3.timeFormat("%b %d");
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            label.innerText = `${monthNames[selectedMonth - 1]} ${selectedYear} (Daily Details)`;
            backBtn.innerText = `← Back to Year`;
            backBtn.style.display = "inline-block";
        }

        if (data.length === 0) return;

        data = data.filter(d => selectedCities.includes(d.city));

        const x = d3.scaleTime()
                    .domain(d3.extent(data, d => d.date))
                    .range([0, width]);

        const yMin = data.length > 0 ? d3.min(data, d => d.temp) : 15;
        const yMax = data.length > 0 ? d3.max(data, d => d.temp) : 38;

        const y = d3.scaleLinear()
                    .domain([Math.floor(yMin - 2), Math.ceil(yMax + 2)])
                    .range([height, 0]);

        svgTemp.select(".y-grid")
           .selectAll("line")
           .data(y.ticks(6))
           .join("line")
           .attr("x1", 0)
           .attr("x2", width)
           .attr("y1", d => y(d))
           .attr("y2", d => y(d))
           .attr("stroke", "#e2e8f0")
           .attr("stroke-dasharray", "4,4");

        xAxisGroupTemp.call(d3.axisBottom(x).ticks(6).tickFormat(tickFormat));
        yAxisGroupTemp.call(d3.axisLeft(y));

        const nestedData = d3.group(data, d => d.city);
        const isDense = currentLevel === "day";

        const line = d3.line()
                       .x(d => x(d.date))
                       .y(d => y(d.temp))
                       .curve(isDense ? d3.curveLinear : d3.curveMonotoneX);

        const cityGroups = svgTemp.selectAll(".city-group")
                              .data(nestedData, d => d[0]);

        cityGroups.exit().remove();

        const cityGroupsEnter = cityGroups.enter()
                                          .append("g")
                                          .attr("class", "city-group");

        cityGroupsEnter.append("path")
                       .attr("class", "line")
                       .style("fill", "none");

        const allGroups = cityGroupsEnter.merge(cityGroups);

        allGroups.select("path")
                 .transition().duration(400)
                 .attr("d", d => line(d[1]))
                 .style("stroke", d => color(d[0]))
                 .style("stroke-width", isDense ? "1.5px" : "2.5px")
                 .style("opacity", isDense ? 0.6 : 0.9);

        const dots = allGroups.selectAll(".dot")
                              .data(d => d[1], d => d.date);

        dots.exit().remove();

        dots.enter()
            .append("circle")
            .attr("class", "dot")
            .style("cursor", currentLevel !== "day" ? "pointer" : "default")
            .merge(dots)
            .transition().duration(400)
            .attr("r", isDense ? 2 : 4)
            .attr("cx", d => x(d.date))
            .attr("cy", d => y(d.temp))
            .attr("fill", d => color(d.city));

        // Drill-Down Click Handlers
        allGroups.selectAll(".dot")
            .on("click", (event, d) => {
                if (currentLevel === "year") {
                    selectedYear = d.date.getFullYear();
                    currentLevel = "month";
                    updateTempChart();
                } else if (currentLevel === "month") {
                    selectedYear = d.date.getFullYear();
                    selectedMonth = d.date.getMonth() + 1;
                    currentLevel = "day";
                    updateTempChart();
                }
            })
            .on("mouseover", (event, d) => {
                tooltipTemp.transition().duration(200).style("opacity", .9);
                tooltipTemp.html(`<strong>${d.city}</strong><br/>Date: ${d3.timeFormat("%Y-%m-%d")(d.date)}<br/>Temp: ${d.temp}°C`)
                       .style("left", (event.pageX + 10) + "px")
                       .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", () => {
                tooltipTemp.transition().duration(500).style("opacity", 0);
            });
    }

    // Back Button Event Listener
    document.getElementById("backButton").addEventListener("click", () => {
        if (currentLevel === "day") {
            currentLevel = "month";
            selectedMonth = null;
        } else if (currentLevel === "month") {
            currentLevel = "year";
            selectedYear = null;
        }
        updateTempChart();
    });

    // Checkbox Change Event Listeners for City Filtering
    document.querySelectorAll("#cityFilters input[type='checkbox']").forEach(checkbox => {
        checkbox.addEventListener("change", () => {
            selectedCities = Array.from(document.querySelectorAll("#cityFilters input[type='checkbox']:checked"))
                                  .map(cb => cb.value);
            updateTempChart();
        });
    });

    updateTempChart();
}
// Calculate rainfall by period (year, month, day) and city.
function rainfallByPeriod(level, filterFn = () => true) {
    const bucket = {
        year: d => d.year,
        month: d => d.yearMonth,
        day: d => d.dayStr
    }[level];

    const parse = {
        year: key => new Date(+key, 0, 1),
        month: key => d3.timeParse("%Y-%m")(key),
        day: key => d3.timeParse("%Y-%m-%d")(key)}[level];

    return d3.rollups(
        rawParsedWeather.filter(filterFn),
        rows => d3.sum(rows, d => d.precipitation), d => d.city,
    bucket)
    
    .flatMap(([city, periods]) => periods.map(([key, rainfall]) => ({
        city,
        date: parse(key),
        rainfall: +rainfall.toFixed(1)
    }))
    );
}

// --- Link to the global time window (js/dashboardSync.js) ---
// Drilling into a year or a month makes it the global time window, so every other chart follows;
// the back button returns to the window that was set before the first drill-down.
let rainfallBaseRange = null;
let skipRainfallSync = false;

function syncRainfallToDashboard() {
    if (typeof DashSync === "undefined" || !DashSync.ready || skipRainfallSync) return;
    if (rainfallState.level === "year") {
        if (rainfallBaseRange) DashSync.setRange(rainfallBaseRange, "rainfall");
        rainfallBaseRange = null;
        return;
    }
    if (!rainfallBaseRange) rainfallBaseRange = DashSync.range();
    const year = rainfallState.year;
    const month = rainfallState.level === "day" ? rainfallState.month : null;
    DashSync.setRange(month
        ? [new Date(year, month - 1, 1), new Date(year, month, 0)]
        : [new Date(year, 0, 1), new Date(year, 11, 31)], "rainfall");
}

// Rows of the whole years inside the global time window and of the global season.
const rainfallInWindow = d => {
    const [first, last] = DashSync.years();
    const year = d.date.getFullYear();
    return year >= first && year <= last && DashSync.inSeason(d);
};

if (typeof DashSync !== "undefined") {
    DashSync.on(detail => {
        if (detail.source === "init" || detail.source === "rainfall") return;
        if (detail.keys.includes("range") && rainfallState.level !== "year") {
            const year = DashSync.singleYear();
            if (year !== null) {
                rainfallState.year = year;
                if (rainfallState.level === "day") rainfallState.level = "month";
                rainfallState.month = null;
            } else {
                Object.assign(rainfallState, { level: "year", city: null, year: null, month: null });
                rainfallBaseRange = null;
            }
            selectedRainfallDate = null;
        }
        skipRainfallSync = true;   // the window was set elsewhere: do not send it back
        drawRainfallChart();
        skipRainfallSync = false;
    }, ["range", "quarter"]);
}

// Draw rainfall chart based on the current state (year, month, day).
function drawRainfallChart() {
    syncRainfallToDashboard();
    const container = d3.select("#rainfall-chart");
    container.selectAll("*").remove();
    hideRainfallTooltip();
    setupRainfallCityFilters();
    getRainfallTooltip();

    const cityFilters = document.getElementById("rainfallCityFilters");
    if (cityFilters) {
        cityFilters.style.display = rainfallState.level === "year" ? "flex" : "none";
    }

    let data = [];

    if (rainfallState.level === "year") {
        data = rainfallByPeriod("year", rainfallInWindow);
    } else if (rainfallState.level === "month") {
        data = rainfallByPeriod(
            "month",
            d => d.city === rainfallState.city &&
                 d.date.getFullYear() === rainfallState.year && DashSync.inSeason(d)
        );
    } else {
        data = rainfallByPeriod(
            "day",
            d => d.city === rainfallState.city &&
                 d.date.getFullYear() === rainfallState.year &&
                 d.date.getMonth() + 1 === rainfallState.month
        );
    }

    if (rainfallState.level === "year") {
        data = data.filter(d => rainfallSelectedCities.has(d.city));
    }

    if (data.length === 0) {
        const message = rainfallState.level === "year" && rainfallSelectedCities.size === 0
            ? "Select at least one city to display rainfall."
            : "No rainfall data available.";
        container.append("p").attr("class", "rainfall-empty").text(message);
        drawCalendarHeatmap();
        drawPrecipitationHumidityChart();
        drawRainfallDurationSubgraph();
        return;
    }

    data.sort((a, b) => a.date - b.date);

    const label = document.getElementById("rainfallViewLabel");
    const backButton = document.getElementById("rainfallBackButton");

    if (rainfallState.level === "year") {
        label.textContent = "Annual rainfall by city";
        backButton.style.display = "none";
    } else if (rainfallState.level === "month") {
        label.textContent = `${rainfallState.city}: monthly rainfall in ${rainfallState.year}`;
        backButton.style.display = "inline-block";
    } else {
        const monthName = d3.timeFormat("%B")(data[0].date);
        label.textContent = `${rainfallState.city}: daily rainfall in ${monthName} ${rainfallState.year} (click a bar for duration details)`;
        backButton.style.display = "inline-block";
    }

    backButton.onclick = () => {
        if (rainfallState.level === "day") {
            rainfallState.level = "month";
            rainfallState.month = null;
            selectedRainfallDate = null;
        } else if (rainfallState.level === "month") {
            rainfallState.level = "year";
            rainfallState.city = null;
            rainfallState.year = null;
            selectedRainfallDate = null;
        }

        drawRainfallChart();
    };

    const margin = { top: 35, right: 30, bottom: 60, left: 65 };
    const width = 850 - margin.left - margin.right;
    const height = 420 - margin.top - margin.bottom;

    const rootSvg = container.append("svg")
        .attr("class", "rainfall-svg")
        .attr("width", 850)
        .attr("height", 420)
        .attr("viewBox", "0 0 850 420")
        .attr("role", "group")
        .attr("aria-label", "Rainfall by city and period")
        .style("opacity", 0);
    const svg = rootSvg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    rootSvg.transition().duration(rainfallAnimationDuration(260)).style("opacity", 1);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.rainfall) || 1])
        .nice()
        .range([height, 0]);

    const grid = svg.append("g")
        .selectAll("line")
        .data(y.ticks(6))
        .join("line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", height)
        .attr("y2", height)
        .attr("stroke", "#e2e8f0")
        .attr("stroke-dasharray", "4,4")
        .attr("opacity", 0);
    grid.transition().duration(rainfallAnimationDuration(520)).ease(d3.easeCubicOut)
        .attr("y1", d => y(d))
        .attr("y2", d => y(d))
        .attr("opacity", 1);

    svg.append("g").attr("class", "axis rainfall-y-axis")
        .style("opacity", 0)
        .call(d3.axisLeft(y))
        .transition().duration(rainfallAnimationDuration(420)).style("opacity", 1);

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -48)
        .attr("text-anchor", "middle")
        .attr("fill", "#64748b")
        .text("Rainfall (mm)");

    const colors = d3.scaleOrdinal()
        .domain(rainfallCities)
        .range(rainfallCities.map(city => rainfallCityColors[city]));

    const ZERO_BAR_HEIGHT = 6;
    const barHeight = d => d.rainfall === 0
        ? ZERO_BAR_HEIGHT
        : Math.max(0.75, height - y(d.rainfall));
    const barY = d => height - barHeight(d);
    const formatAmount = d => d.rainfall === 0 ? "0" : d3.format(",.1f")(d.rainfall);

    if (rainfallState.level === "year") {
        const years = [...new Set(data.map(d => d.date.getFullYear()))];
        const visibleCities = rainfallCities.filter(city => rainfallSelectedCities.has(city));

        const xYear = d3.scaleBand()
            .domain(years)
            .range([0, width])
            .padding(0.2);

        const xCity = d3.scaleBand()
            .domain(visibleCities)
            .range([0, xYear.bandwidth()])
            .padding(0.08);

        svg.append("g")
            .attr("class", "axis rainfall-x-axis")
            .attr("transform", `translate(0,${height})`)
            .style("opacity", 0)
            .call(d3.axisBottom(xYear))
            .transition().duration(rainfallAnimationDuration(420)).style("opacity", 1);

        svg.selectAll(".rainfall-bar")
            .data(data)
            .join("rect")
            .attr("class", d => d.rainfall === 0 ? "rainfall-bar is-zero" : "rainfall-bar")
            .attr("x", d => xYear(d.date.getFullYear()) + xCity(d.city))
            .attr("y", height)
            .attr("width", xCity.bandwidth())
            .attr("height", 0)
            .attr("fill", d => d.rainfall === 0 ? "#f8fafc" : colors(d.city))
            .attr("stroke", d => d.rainfall === 0 ? colors(d.city) : "none")
            .attr("stroke-width", d => d.rainfall === 0 ? 1.5 : 0)
            .attr("stroke-dasharray", d => d.rainfall === 0 ? "2,1" : null)
            .attr("opacity", 0)
            .style("cursor", "pointer")
            .transition("rainfall-bars")
            .delay((d, i) => rainfallAnimationDelay(Math.min(i * 16, 420)))
            .duration(rainfallAnimationDuration(560))
            .ease(d3.easeCubicOut)
            .attr("y", barY)
            .attr("height", barHeight)
            .attr("opacity", 1);

        const barSelection = svg.selectAll(".rainfall-bar");
        bindRainfallBarInteractions(
            barSelection,
            true,
            d => `${d.city}, ${d.date.getFullYear()}: ${formatAmount(d)} millimeters of rainfall. Activate to view monthly details.`
        );
        barSelection.on("click", (event, d) => {
            rainfallState.city = d.city;
            rainfallState.year = d.date.getFullYear();
            rainfallState.level = "month";
            selectedRainfallDate = null;
            drawRainfallChart();
        }).on("keydown", (event, d) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                rainfallState.city = d.city;
                rainfallState.year = d.date.getFullYear();
                rainfallState.level = "month";
                selectedRainfallDate = null;
                drawRainfallChart();
            }
        });

        svg.selectAll(".rainfall-hit-area")
            .data(data)
            .join("rect")
            .attr("class", "rainfall-hit-area")
            .attr("x", d => xYear(d.date.getFullYear()) + xCity(d.city))
            .attr("y", height - 14)
            .attr("width", xCity.bandwidth())
            .attr("height", 14)
            .attr("aria-hidden", "true")
            .on("pointerenter", showRainfallTooltip)
            .on("pointermove", event => positionRainfallTooltip(event))
            .on("pointerleave", hideRainfallTooltip)
            .on("click", (event, d) => {
                rainfallState.city = d.city;
                rainfallState.year = d.date.getFullYear();
                rainfallState.level = "month";
                drawRainfallChart();
            });

        const zeroData = data.filter(d => d.rainfall === 0);
        svg.selectAll(".rainfall-zero-label")
            .data(zeroData)
            .join("text")
            .attr("class", "rainfall-zero-label")
            .attr("x", d => xYear(d.date.getFullYear()) + xCity(d.city) + xCity.bandwidth() / 2)
            .attr("y", height - ZERO_BAR_HEIGHT - 3)
            .attr("text-anchor", "middle")
            .attr("fill", d => colors(d.city))
            .attr("opacity", 0)
            .text("0")
            .transition().delay((d, i) => rainfallAnimationDelay(Math.min(i * 16, 420) + 360))
            .duration(rainfallAnimationDuration(240))
            .attr("opacity", 1);
    } else {
        const formatDate = rainfallState.level === "month"
            ? d3.timeFormat("%b")
            : d3.timeFormat("%d");

        const x = d3.scaleBand()
            .domain(data.map(d => formatDate(d.date)))
            .range([0, width])
            .padding(0.2);

        svg.append("g")
            .attr("class", "axis rainfall-x-axis")
            .attr("transform", `translate(0,${height})`)
            .style("opacity", 0)
            .call(
                d3.axisBottom(x)
                    .tickValues(
                        rainfallState.level === "day"
                            ? x.domain().filter((d, i) => i % 4 === 0)
                            : x.domain()
                    )
            )
            .transition().duration(rainfallAnimationDuration(420)).style("opacity", 1);

        svg.selectAll(".rainfall-bar")
            .data(data)
            .join("rect")
            .attr("class", d => [
                "rainfall-bar",
                d.rainfall === 0 ? "is-zero" : "",
                selectedRainfallDate === d.date.getTime() ? "is-selected" : ""
            ].filter(Boolean).join(" "))
            .attr("x", d => x(formatDate(d.date)))
            .attr("y", height)
            .attr("width", x.bandwidth())
            .attr("height", 0)
            .attr("fill", d => d.rainfall === 0 ? "#f8fafc" : colors(rainfallState.city))
            .attr("stroke", d => d.rainfall === 0 ? colors(rainfallState.city) : "none")
            .attr("stroke-width", d => d.rainfall === 0 ? 1.5 : 0)
            .attr("stroke-dasharray", d => d.rainfall === 0 ? "2,1" : null)
            .attr("opacity", 0)
            .style("cursor", rainfallState.level === "month" || rainfallState.level === "day" ? "pointer" : "default")
            .transition("rainfall-bars")
            .delay((d, i) => rainfallAnimationDelay(Math.min(i * 12, 360)))
            .duration(rainfallAnimationDuration(520))
            .ease(d3.easeCubicOut)
            .attr("y", barY)
            .attr("height", barHeight)
            .attr("opacity", 1);

        const barSelection = svg.selectAll(".rainfall-bar");
        const canDrillDown = rainfallState.level === "month" || rainfallState.level === "day";
        bindRainfallBarInteractions(
            barSelection,
            canDrillDown,
            d => rainfallState.level === "month"
                ? `${d.city}, ${d3.timeFormat("%B %Y")(d.date)}: ${formatAmount(d)} millimeters of rainfall. Activate to view daily details.`
                : `${d.city}, ${d3.timeFormat("%A, %d %B %Y")(d.date)}: ${formatAmount(d)} millimeters of rainfall. Activate to compare rainfall duration.`
        );
        barSelection.on("click", (event, d) => {
            if (rainfallState.level === "month") {
                rainfallState.month = d.date.getMonth() + 1;
                rainfallState.level = "day";
                selectedRainfallDate = null;
                drawRainfallChart();
            } else if (rainfallState.level === "day") {
                selectRainfallDurationDay(d.date);
            }
        }).on("keydown", (event, d) => {
            if (rainfallState.level === "month" && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                rainfallState.month = d.date.getMonth() + 1;
                rainfallState.level = "day";
                selectedRainfallDate = null;
                drawRainfallChart();
            } else if (rainfallState.level === "day" && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                selectRainfallDurationDay(d.date);
            }
        });

        svg.selectAll(".rainfall-hit-area")
            .data(data)
            .join("rect")
            .attr("class", "rainfall-hit-area")
            .attr("x", d => x(formatDate(d.date)))
            .attr("y", height - 14)
            .attr("width", x.bandwidth())
            .attr("height", 14)
            .attr("aria-hidden", "true")
            .on("pointerenter", showRainfallTooltip)
            .on("pointermove", event => positionRainfallTooltip(event))
            .on("pointerleave", hideRainfallTooltip)
            .on("click", (event, d) => {
                if (rainfallState.level === "month") {
                    rainfallState.month = d.date.getMonth() + 1;
                    rainfallState.level = "day";
                    selectedRainfallDate = null;
                    drawRainfallChart();
                } else if (rainfallState.level === "day") {
                    selectRainfallDurationDay(d.date);
                }
            });

        const zeroData = data.filter(d => d.rainfall === 0);
        svg.selectAll(".rainfall-zero-label")
            .data(zeroData)
            .join("text")
            .attr("class", "rainfall-zero-label")
            .attr("x", d => x(formatDate(d.date)) + x.bandwidth() / 2)
            .attr("y", height - ZERO_BAR_HEIGHT - 3)
            .attr("text-anchor", "middle")
            .attr("fill", colors(rainfallState.city))
            .attr("opacity", 0)
            .text("0")
            .transition().delay((d, i) => rainfallAnimationDelay(Math.min(i * 12, 360) + 340))
            .duration(rainfallAnimationDuration(220))
            .attr("opacity", 1);
    }

    if (data.some(d => d.rainfall === 0)) {
        svg.append("text")
            .attr("class", "zero-bar-note")
            .attr("x", width)
            .attr("y", -12)
            .attr("text-anchor", "end")
            .attr("opacity", 0)
            .text("Dashed bars labeled 0 indicate no rainfall")
            .transition().delay(rainfallAnimationDelay(180))
            .duration(rainfallAnimationDuration(250)).attr("opacity", 1);
    }

    drawCalendarHeatmap();
    drawPrecipitationHumidityChart();
    drawRainfallDurationSubgraph();
}

function selectRainfallDurationDay(date) {
    selectedRainfallDate = date.getTime();
    hideRainfallTooltip();
    d3.select("#rainfall-chart")
        .selectAll(".rainfall-bar")
        .classed("is-selected", d => d.date.getTime() === selectedRainfallDate);
    drawRainfallDurationSubgraph();
}

// Show the selected day's rainfall amount against rain duration for the month.
function drawRainfallDurationSubgraph() {
    const panel = document.getElementById("rainfall-duration-breakdown");
    const summary = d3.select("#rainfall-duration-summary");
    const container = d3.select("#rainfall-duration-chart");
    container.selectAll("*").remove();

    const isDailyView = rainfallState.level === "day" &&
        rainfallState.city && rainfallState.year && Number.isInteger(rainfallState.month);
    if (!panel || !isDailyView || selectedRainfallDate === null) {
        if (panel) panel.hidden = true;
        summary.text("");
        return;
    }

    const monthRows = rawParsedWeather
        .filter(d =>
            d.city === rainfallState.city &&
            d.date.getFullYear() === rainfallState.year &&
            d.date.getMonth() + 1 === rainfallState.month
        )
        .sort((a, b) => a.date - b.date);
    const selectedDay = monthRows.find(d => d.date.getTime() === selectedRainfallDate);
    if (!selectedDay) {
        panel.hidden = true;
        summary.text("");
        return;
    }

    panel.hidden = false;
    const durationText = Number.isFinite(selectedDay.precipitationHours)
        ? `${d3.format(".1f")(selectedDay.precipitationHours)} hours`
        : "not available";
    const rateText = Number.isFinite(selectedDay.precipitationHours) && selectedDay.precipitationHours > 0
        ? `${d3.format(",.1f")(selectedDay.precipitation / selectedDay.precipitationHours)} mm per rain hour`
        : "not available";
    summary.text(`${d3.timeFormat("%A, %d %B %Y")(selectedDay.date)}: ${d3.format(",.1f")(selectedDay.precipitation)} mm over ${durationText}; average rate ${rateText}.`);

    const plotRows = monthRows.filter(d =>
        Number.isFinite(d.precipitation) && Number.isFinite(d.precipitationHours)
    );
    if (plotRows.length === 0) {
        container.append("p").text("No rainfall duration observations are available for this month.");
        return;
    }

    // Draw the selected point last so it remains visible when days overlap at zero.
    const orderedRows = [...plotRows].sort((a, b) =>
        Number(a.date.getTime() === selectedRainfallDate) - Number(b.date.getTime() === selectedRainfallDate)
    );
    const margin = { top: 20, right: 30, bottom: 60, left: 70 };
    const outerWidth = 850;
    const outerHeight = 330;
    const width = outerWidth - margin.left - margin.right;
    const height = outerHeight - margin.top - margin.bottom;
    const cityColor = rainfallCityColors[rainfallState.city] || "#0284C7";
    const x = d3.scaleLinear()
        .domain([0, d3.max(plotRows, d => d.precipitation) || 1])
        .nice()
        .range([0, width]);
    const y = d3.scaleLinear()
        .domain([0, 24])
        .range([height, 0]);
    const svg = container.append("svg")
        .attr("width", outerWidth)
        .attr("height", outerHeight)
        .attr("viewBox", `0 0 ${outerWidth} ${outerHeight}`)
        .attr("role", "img")
        .attr("aria-label", `Daily rainfall amount and duration for ${rainfallState.city} in ${d3.timeFormat("%B %Y")(selectedDay.date)}`)
        .style("opacity", 0);
    const chart = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
    svg.transition().duration(rainfallAnimationDuration(220)).style("opacity", 1);

    chart.append("g")
        .selectAll("line")
        .data(y.ticks(6))
        .join("line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", d => y(d))
        .attr("y2", d => y(d))
        .attr("stroke", "#e2e8f0")
        .attr("stroke-dasharray", "4,4");
    chart.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(7));
    chart.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(y).ticks(6).tickFormat(d => `${d}h`));
    chart.append("text")
        .attr("x", width / 2)
        .attr("y", height + 42)
        .attr("text-anchor", "middle")
        .attr("fill", "#64748b")
        .attr("font-size", "12px")
        .text("Daily precipitation (mm)");
    chart.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -50)
        .attr("text-anchor", "middle")
        .attr("fill", "#64748b")
        .attr("font-size", "12px")
        .text("Rain duration (hours)");

    chart.selectAll(".rainfall-duration-point")
        .data(orderedRows, d => d.dayStr)
        .join("circle")
        .attr("class", d => d.date.getTime() === selectedRainfallDate
            ? "rainfall-duration-point is-selected"
            : "rainfall-duration-point")
        .attr("cx", d => x(d.precipitation))
        .attr("cy", d => y(d.precipitationHours))
        .attr("r", d => d.date.getTime() === selectedRainfallDate ? 7 : 4)
        .attr("fill", cityColor)
        .attr("fill-opacity", d => d.date.getTime() === selectedRainfallDate ? 1 : 0.38)
        .attr("stroke", d => d.date.getTime() === selectedRainfallDate ? "#0f172a" : "none")
        .attr("stroke-width", d => d.date.getTime() === selectedRainfallDate ? 2 : 0)
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-describedby", "rainfall-tooltip")
        .attr("aria-label", d => `${d3.timeFormat("%A, %d %B %Y")(d.date)}: ${d3.format(",.1f")(d.precipitation)} mm over ${d3.format(".1f")(d.precipitationHours)} rain hours. Activate to select this day.`)
        .on("pointerenter", (event, d) => showRainfallDurationTooltip(event, d))
        .on("pointermove", event => positionRainfallTooltip(event))
        .on("pointerleave", hideRainfallTooltip)
        .on("focus", (event, d) => showRainfallDurationTooltip(event, d))
        .on("blur", hideRainfallTooltip)
        .on("click", (event, d) => selectRainfallDurationDay(d.date))
        .on("keydown", (event, d) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectRainfallDurationDay(d.date);
            }
        });
}

function showRainfallDurationTooltip(event, day) {
    const tooltip = getRainfallTooltip();
    const hours = Number.isFinite(day.precipitationHours)
        ? `${d3.format(".1f")(day.precipitationHours)} hours`
        : "not available";
    const rate = Number.isFinite(day.precipitationHours) && day.precipitationHours > 0
        ? `${d3.format(",.1f")(day.precipitation / day.precipitationHours)} mm per rain hour`
        : "not available";

    tooltip.interrupt()
        .html(`<strong>${d3.timeFormat("%A, %d %B %Y")(day.date)}</strong><br>Rainfall: <strong>${d3.format(",.1f")(day.precipitation)} mm</strong><br>Rain duration: ${hours}<br>Average rate: ${rate}`)
        .attr("aria-hidden", "false");
    positionRainfallTooltip(event);
    tooltip.transition().duration(rainfallAnimationDuration(140)).style("opacity", 0.96);
}

// Draw a calendar heatmap for daily rainfall in a selected city and period.
function drawCalendarHeatmap() {
    const container = d3.select("#rainfall-heatmap");
    container.selectAll("*").remove();
    const calendarLayout = document.querySelector(".rainfall-calendar-layout");
    if (calendarLayout) {
        calendarLayout.classList.toggle("detail-below", rainfallState.level === "month");
    }

    const detail = document.getElementById("rainfall-detail");
    if (detail) detail.hidden = true;
    const isMonthView = rainfallState.level === "day" && Number.isInteger(rainfallState.month);

    // A city and year are selected after the user clicks an annual bar.
    // No city yet: the three cities are shown side by side for the selected year (js/dashboardViews.js).
    if (!rainfallState.city || !rainfallState.year) {
        drawRainfallCalendarCompare(container);
        return;
    }

    const rows = rawParsedWeather
        .filter(d =>
            d.city === rainfallState.city &&
            d.date.getFullYear() === rainfallState.year &&
            (!isMonthView || d.date.getMonth() + 1 === rainfallState.month)
        )
        .sort((a, b) => a.date - b.date);

    if (rows.length === 0) {
        const period = isMonthView
            ? `${d3.timeFormat("%B %Y")(new Date(rainfallState.year, rainfallState.month - 1, 1))}`
            : rainfallState.year;
        container.append("p").text(`No daily rainfall data available for ${period}.`);
        return;
    }

    const cellSize = 14;
    const gap = 3;
    const periodStart = isMonthView
        ? new Date(rainfallState.year, rainfallState.month - 1, 1)
        : new Date(rainfallState.year, 0, 1);
    const weekStart = d3.timeWeek.floor(periodStart);
    const weekIndex = date => d3.timeWeek.count(weekStart, date);
    const weekCount = d3.max(rows, d => weekIndex(d.date)) + 1;
    const width = 65 + weekCount * (cellSize + gap);
    const height = 55 + 7 * (cellSize + gap);
    const periodLabel = isMonthView
        ? d3.timeFormat("%B %Y")(periodStart)
        : String(rainfallState.year);

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", `Daily rainfall calendar for ${rainfallState.city} in ${periodLabel}`);

    const chart = svg.append("g")
        .attr("transform", "translate(50,35)");

    const maxRainfall = d3.max(rows, d => d.precipitation) || 1;

    // Full color syncing with the cities chosen colors
    const cityColor = rainfallCityColors[rainfallState.city] || "#0284C7";

    const color = d3.scaleSequential()
        .domain([0, maxRainfall])
        .interpolator(d3.interpolateRgb("#f8fafc", cityColor));  
        
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    chart.selectAll(".day-name")
        .data(dayNames)
        .join("text")
        .attr("class", "day-name")
        .attr("x", -8)
        .attr("y", (_, index) => index * (cellSize + gap) + cellSize - 2)
        .attr("text-anchor", "end")
        .attr("font-size", "10px")
        .attr("fill", "#64748b")
        .text(d => d);

    const calendarCells = chart.selectAll(".rainfall-day")
        .data(rows, d => d.dayStr)
        .join("rect")
        .attr("class", "rainfall-day")
        .attr("x", d => weekIndex(d.date) * (cellSize + gap))
        .attr("y", d => d.date.getDay() * (cellSize + gap))
        .attr("width", cellSize)
        .attr("height", cellSize)
        .attr("rx", 2)
        .attr("fill", d => color(d.precipitation))
        .attr("stroke", d => d.precipitation === 0 ? "#cbd5e1" : "none")
        .attr("opacity", 0)
        .style("cursor", "pointer")
        .on("click", (event, d) => showRainfallDetail(d))
        .on("pointerenter", (event, d) => {
            const tooltip = getRainfallTooltip();
            const amount = d.precipitation === 0 ? "0" : d3.format(",.1f")(d.precipitation);
            tooltip.interrupt()
                .html(`<strong>${d.city}</strong><br><span class="tooltip-period">${d3.timeFormat("%A, %d %B %Y")(d.date)}</span><br>Rainfall: <strong>${amount} mm</strong>`)
                .attr("aria-hidden", "false");
            positionRainfallTooltip(event);
            tooltip.transition().duration(rainfallAnimationDuration(140)).style("opacity", 0.96);
        })
        .on("pointermove", event => positionRainfallTooltip(event))
        .on("pointerleave", hideRainfallTooltip);

    calendarCells.transition("rainfall-calendar")
        .delay((d, i) => rainfallAnimationDelay(Math.min(i * 1.2, 260)))
        .duration(rainfallAnimationDuration(360))
        .ease(d3.easeCubicOut)
        .attr("opacity", 1);
}
// Show detailed rainfall information for a specific day.
function showRainfallDetail(day) {
    const panel = document.getElementById("rainfall-detail");

    if (!panel) return;

    const date = d3.timeFormat("%A, %d %B %Y")(day.date);
    const rainHours = Number.isFinite(day.precipitationHours)
        ? `${day.precipitationHours} hours`
        : "Not available";

    panel.hidden = false;
    panel.innerHTML = `
        <h4>${day.city}</h4>
        <p><strong>${date}</strong></p>
        <p>Rainfall: <strong>${day.precipitation.toFixed(1)} mm</strong></p>
        <p>Rain duration: ${rainHours}</p>
        <p>Mean temperature: ${day.tempMean.toFixed(1)} °C</p>
        <p>Maximum temperature: ${day.tempMax.toFixed(1)} °C</p>
    `;
}

// Compare the seasonal cycle of monthly rainfall totals and mean humidity.
function drawPrecipitationHumidityChart() {
    const container = d3.select("#precipitation-humidity-chart");
    container.selectAll("*").remove();

    const isDailyMonth = rainfallState.level === "day" && Number.isInteger(rainfallState.month);
    const cities = rainfallState.level === "year"
        ? rainfallCities.filter(city => rainfallSelectedCities.has(city))
        : rainfallState.city ? [rainfallState.city] : [];
    const scopedRows = rawParsedWeather.filter(d =>
        cities.includes(d.city) &&
        (rainfallState.year ? d.date.getFullYear() === rainfallState.year && DashSync.inSeason(d) : rainfallInWindow(d)) &&
        (!isDailyMonth || d.date.getMonth() + 1 === rainfallState.month)
    );

    if (cities.length === 0 || scopedRows.length === 0) {
        container.append("p")
            .attr("class", "rainfall-empty")
            .text("Select a city with rainfall and humidity data to display this trend.");
        return;
    }

    let data;
    if (isDailyMonth) {
        data = scopedRows.map(d => ({
            city: d.city,
            month: d.date.getMonth(),
            date: d.date,
            positionDate: new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate(), 12),
            precipitation: d.precipitation,
            humidity: d.relativeHumidityMean
        })).sort((a, b) => a.date - b.date);
    } else {
        // First compute each year's monthly rainfall total and daily humidity mean.
        const monthlyByYear = d3.rollups(
            scopedRows,
            rows => ({
                precipitation: d3.sum(rows, d => d.precipitation),
                humidity: d3.mean(rows, d => d.relativeHumidityMean)
            }),
            d => d.city,
            d => d.date.getFullYear(),
            d => d.date.getMonth()
        );

        const observations = [];
        for (const [city, years] of monthlyByYear) {
            for (const [year, months] of years) {
                for (const [month, values] of months) {
                    observations.push({ city, year, month, ...values });
                }
            }
        }

        // Average those monthly observations across years for the annual overview.
        data = d3.rollups(
            observations,
            rows => ({
                precipitation: d3.mean(rows, d => d.precipitation),
                humidity: d3.mean(rows, d => d.humidity)
            }),
            d => d.city,
            d => d.month
        ).flatMap(([city, months]) => months.map(([month, values]) => ({
            city,
            month,
            date: new Date(2000, month, 15),
            positionDate: new Date(2000, month, 15),
            precipitation: values.precipitation,
            humidity: values.humidity
        }))).sort((a, b) => a.month - b.month);
    }

    if (data.length === 0) {
        container.append("p")
            .attr("class", "rainfall-empty")
            .text(isDailyMonth
                ? `No daily precipitation and humidity data available for ${d3.timeFormat("%B %Y")(new Date(rainfallState.year, rainfallState.month - 1, 1))}.`
                : "No monthly precipitation and humidity data available.");
        return;
    }

    const margin = { top: 48, right: 72, bottom: 86, left: 76 };
    const outerWidth = 850;
    const outerHeight = 470;
    const width = outerWidth - margin.left - margin.right;
    const height = outerHeight - margin.top - margin.bottom;
    const color = d3.scaleOrdinal()
        .domain(rainfallCities)
        .range(rainfallCities.map(city => rainfallCityColors[city]));
    const maxPrecipitation = d3.max(data, d => d.precipitation) || 1;
    const dailyMonthStart = isDailyMonth
        ? new Date(rainfallState.year, rainfallState.month - 1, 1)
        : null;
    const dailyMonthEnd = isDailyMonth
        ? new Date(rainfallState.year, rainfallState.month, 1)
        : null;
    const x = d3.scaleTime()
        .domain(isDailyMonth
            ? [dailyMonthStart, dailyMonthEnd]
            : [new Date(2000, 0, 1), new Date(2001, 0, 1)])
        .range([0, width]);
    const yPrecipitation = d3.scaleLinear()
        .domain([0, maxPrecipitation])
        .nice()
        .range([height, 0]);
    const yHumidity = d3.scaleLinear()
        .domain([0, 100])
        .range([height, 0]);
    // Center each aggregate on its label; daily points use the center of each date.
    const xTicks = isDailyMonth
        ? d3.timeDay.range(dailyMonthStart, dailyMonthEnd, 5)
            .map(day => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12))
        : d3.range(12).map(month => new Date(2000, month, 15));
    const xTickFormat = isDailyMonth ? d3.timeFormat("%d") : d3.timeFormat("%b");

    const svg = container.append("svg")
        .attr("width", outerWidth)
        .attr("height", outerHeight)
        .attr("viewBox", `0 0 ${outerWidth} ${outerHeight}`)
        .attr("role", "img")
        .attr("aria-label", isDailyMonth
            ? `Daily precipitation and mean relative humidity trend for ${d3.timeFormat("%B %Y")(dailyMonthStart)}`
            : "Monthly precipitation and mean relative humidity trend")
        .style("opacity", 0);
    const chart = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
    svg.transition().duration(rainfallAnimationDuration(260)).style("opacity", 1);

    chart.append("g")
        .selectAll("line")
        .data(yPrecipitation.ticks(6))
        .join("line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", d => yPrecipitation(d))
        .attr("y2", d => yPrecipitation(d))
        .attr("stroke", "#e2e8f0")
        .attr("stroke-dasharray", "4,4");

    chart.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickValues(xTicks).tickFormat(xTickFormat));
    chart.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(yPrecipitation).ticks(6));
    chart.append("g")
        .attr("class", "axis humidity-axis")
        .attr("transform", `translate(${width},0)`)
        .call(d3.axisRight(yHumidity).tickValues([0, 20, 40, 60, 80, 100]).tickFormat(d => `${d}%`));

    chart.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -54)
        .attr("text-anchor", "middle")
        .attr("fill", "#64748b")
        .attr("font-size", "12px")
        .text(isDailyMonth
            ? "Daily precipitation (mm)"
            : rainfallState.year ? "Monthly precipitation (mm)" : "Mean monthly precipitation (mm)");
    chart.append("text")
        .attr("transform", "rotate(90)")
        .attr("x", height / 2)
        .attr("y", -width - 48)
        .attr("text-anchor", "middle")
        .attr("fill", "#64748b")
        .attr("font-size", "12px")
        .text("Mean relative humidity (%)");
    chart.append("text")
        .attr("x", width / 2)
        .attr("y", height + 38)
        .attr("text-anchor", "middle")
        .attr("fill", "#64748b")
        .attr("font-size", "12px")
        .text(isDailyMonth ? "Day of month" : "Month of year");

    const precipitationLine = d3.line()
        .defined(d => Number.isFinite(d.precipitation))
        .x(d => x(d.positionDate))
        .y(d => yPrecipitation(d.precipitation))
        .curve(d3.curveMonotoneX);
    const humidityLine = d3.line()
        .defined(d => Number.isFinite(d.humidity))
        .x(d => x(d.positionDate))
        .y(d => yHumidity(d.humidity))
        .curve(d3.curveMonotoneX);

    const cityGroups = chart.selectAll(".precipitation-humidity-city")
        .data(cities)
        .join("g")
        .attr("class", "precipitation-humidity-city")
        .attr("data-city", d => d);

    cityGroups.each(function(city) {
        const cityData = data.filter(d => d.city === city);
        const group = d3.select(this);
        group.append("path")
            .datum(cityData)
            .attr("class", "precipitation-line")
            .attr("fill", "none")
            .attr("stroke", color(city))
            .attr("stroke-width", 2.5)
            .attr("d", precipitationLine);
        group.append("path")
            .datum(cityData)
            .attr("class", "humidity-line")
            .attr("fill", "none")
            .attr("stroke", color(city))
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "6,4")
            .attr("d", humidityLine);
    });

    const hoverLine = chart.append("line")
        .attr("class", "precipitation-humidity-hover-line")
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "#64748b")
        .attr("stroke-dasharray", "2,3")
        .attr("opacity", 0)
        .style("pointer-events", "none");

    // One hover target per day or month reports both measures for visible cities.
    const tooltipData = isDailyMonth
        ? d3.groups(data, d => d.date.getTime()).map(([, cityRows]) => ({
            date: cityRows[0].date,
            positionDate: cityRows[0].positionDate,
            cities: cityRows
        }))
        : d3.range(12).map(month => ({
            month,
            date: new Date(2000, month, 15),
            positionDate: new Date(2000, month, 15),
            cities: cities.map(city => data.find(d => d.city === city && d.month === month)).filter(Boolean)
        })).filter(d => d.cities.length > 0);
    chart.selectAll(".precipitation-humidity-hit")
        .data(tooltipData)
        .join("rect")
        .attr("class", "precipitation-humidity-hit")
        .attr("x", d => isDailyMonth
            ? x(new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate()))
            : x(new Date(2000, d.month, 1)))
        .attr("y", 0)
        .attr("width", d => isDailyMonth
            ? x(new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate() + 1)) - x(new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate()))
            : x(new Date(2000, d.month + 1, 1)) - x(new Date(2000, d.month, 1)))
        .attr("height", height)
        .on("pointerenter", (event, d) => {
            const tooltip = getRainfallTooltip();
            const rows = d.cities.map(cityData =>
                `<span style="color:${color(cityData.city)}">● ${cityData.city}</span>: ${d3.format(",.1f")(cityData.precipitation)} mm, ${Number.isFinite(cityData.humidity) ? `${d3.format(".1f")(cityData.humidity)}% RH` : "humidity unavailable"}`
            );
            const periodLabel = isDailyMonth
                ? d3.timeFormat("%A, %B %d, %Y")(d.date)
                : rainfallState.year
                    ? `${d3.timeFormat("%B")(d.date)}, ${rainfallState.year}`
                    : d3.timeFormat("%B")(d.date);
            tooltip.interrupt()
                .html(`<strong>${periodLabel}</strong><br>${rows.join("<br>")}`)
                .attr("aria-hidden", "false");
            positionRainfallTooltip(event);
            tooltip.transition().duration(rainfallAnimationDuration(140)).style("opacity", 0.96);
            hoverLine.attr("x1", x(d.positionDate)).attr("x2", x(d.positionDate))
                .transition().duration(rainfallAnimationDuration(100)).attr("opacity", 0.75);
        })
        .on("pointermove", event => positionRainfallTooltip(event))
        .on("pointerleave", () => {
            hideRainfallTooltip();
            hoverLine.transition().duration(rainfallAnimationDuration(120)).attr("opacity", 0);
        });

    // City colors match the rainfall filters; this key distinguishes the two measures.
    const measureLegend = svg.append("g")
        .attr("class", "precipitation-humidity-legend")
        .attr("transform", `translate(${margin.left + width / 2 - 125},${margin.top + height + 64})`);
    measureLegend.append("line")
        .attr("x1", 0).attr("x2", 26).attr("y1", 0).attr("y2", 0)
        .attr("stroke", "#475569").attr("stroke-width", 2.5);
    measureLegend.append("text")
        .attr("x", 32).attr("y", 4).text("Precipitation");
    measureLegend.append("line")
        .attr("x1", 145).attr("x2", 171).attr("y1", 0).attr("y2", 0)
        .attr("stroke", "#475569").attr("stroke-width", 2)
        .attr("stroke-dasharray", "6,4");
    measureLegend.append("text")
        .attr("x", 177).attr("y", 4).text("Relative humidity");
}

// Annual extreme weather charts.
function drawExtremeCharts() {
    drawExtremeTrends();
}
