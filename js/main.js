document.addEventListener("DOMContentLoaded", async () => {
    await loadWeatherData();
    document.dispatchEvent(new Event("weatherDataLoaded"));
});

// Start each chart independently after loading data.
document.addEventListener("weatherDataLoaded", drawTemperatureInsights);
document.addEventListener("weatherDataLoaded", drawTemperatureComparison);
document.addEventListener("weatherDataLoaded", drawExtremeCharts);
document.addEventListener("weatherDataLoaded", drawRainfallChart);

// Rainfall State values
const rainfallState = {
    level: "year",
    city: null,
    year: null,
    month: null
};

// Rainfall colors for each city  
const rainfallCityColors = { 
    "Hanoi": "#0284C7",
    "Da Nang": "#D97706",
    "Ho Chi Minh City": "#D93856"
};

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

// Draw rainfall chart based on the current state (year, month, day).
function drawRainfallChart() {
    const container = d3.select("#rainfall-chart");
    container.selectAll("*").remove();

    let data = [];

    if (rainfallState.level === "year") {
        data = rainfallByPeriod("year");
    } else if (rainfallState.level === "month") {
        data = rainfallByPeriod(
            "month",
            d => d.city === rainfallState.city &&
                 d.date.getFullYear() === rainfallState.year
        );
    } else {
        data = rainfallByPeriod(
            "day",
            d => d.city === rainfallState.city &&
                 d.date.getFullYear() === rainfallState.year &&
                 d.date.getMonth() + 1 === rainfallState.month
        );
    }

    if (data.length === 0) {
        container.append("p").text("No rainfall data available.");
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
        label.textContent = `${rainfallState.city}: daily rainfall in ${monthName} ${rainfallState.year}`;
        backButton.style.display = "inline-block";
    }

    backButton.onclick = () => {
        if (rainfallState.level === "day") {
            rainfallState.level = "month";
            rainfallState.month = null;
        } else if (rainfallState.level === "month") {
            rainfallState.level = "year";
            rainfallState.city = null;
            rainfallState.year = null;
        }

        drawRainfallChart();
    };

    const margin = { top: 35, right: 30, bottom: 60, left: 65 };
    const width = 850 - margin.left - margin.right;
    const height = 420 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", 850)
        .attr("height", 420)
        .attr("viewBox", "0 0 850 420")
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.rainfall) || 1])
        .nice()
        .range([height, 0]);

    svg.append("g")
        .selectAll("line")
        .data(y.ticks(6))
        .join("line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", d => y(d))
        .attr("y2", d => y(d))
        .attr("stroke", "#e2e8f0")
        .attr("stroke-dasharray", "4,4");

    svg.append("g")
        .call(d3.axisLeft(y));

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -48)
        .attr("text-anchor", "middle")
        .attr("fill", "#64748b")
        .text("Rainfall (mm)");

    const colors = d3.scaleOrdinal()
        .domain(["Hanoi", "Da Nang", "Ho Chi Minh City"])
        .range(["#0284C7", "#D97706", "#D93856"]);

    if (rainfallState.level === "year") {
        const years = [...new Set(data.map(d => d.date.getFullYear()))];

        const xYear = d3.scaleBand()
            .domain(years)
            .range([0, width])
            .padding(0.2);

        const xCity = d3.scaleBand()
            .domain(colors.domain())
            .range([0, xYear.bandwidth()])
            .padding(0.08);

        svg.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(xYear));

        svg.selectAll(".rainfall-bar")
            .data(data)
            .join("rect")
            .attr("class", "rainfall-bar")
            .attr("x", d => xYear(d.date.getFullYear()) + xCity(d.city))
            .attr("y", d => y(d.rainfall))
            .attr("width", xCity.bandwidth())
            .attr("height", d => height - y(d.rainfall))
            .attr("fill", d => colors(d.city))
            .style("cursor", "pointer")
            .on("click", (event, d) => {
                rainfallState.city = d.city;
                rainfallState.year = d.date.getFullYear();
                rainfallState.level = "month";
                drawRainfallChart();
            })
            .append("title")
            .text(d => `${d.city}, ${d.date.getFullYear()}: ${d.rainfall} mm`);
    } else {
        const formatDate = rainfallState.level === "month"
            ? d3.timeFormat("%b")
            : d3.timeFormat("%d");

        const x = d3.scaleBand()
            .domain(data.map(d => formatDate(d.date)))
            .range([0, width])
            .padding(0.2);

        svg.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(
                d3.axisBottom(x)
                    .tickValues(
                        rainfallState.level === "day"
                            ? x.domain().filter((d, i) => i % 4 === 0)
                            : x.domain()
                    )
            );

        svg.selectAll(".rainfall-bar")
            .data(data)
            .join("rect")
            .attr("class", "rainfall-bar")
            .attr("x", d => x(formatDate(d.date)))
            .attr("y", d => y(d.rainfall))
            .attr("width", x.bandwidth())
            .attr("height", d => height - y(d.rainfall))
            .attr("fill", colors(rainfallState.city))
            .style("cursor", rainfallState.level === "month" ? "pointer" : "default")
            .on("click", (event, d) => {
                if (rainfallState.level === "month") {
                    rainfallState.month = d.date.getMonth() + 1;
                    rainfallState.level = "day";
                    drawRainfallChart();
                }
            })
            .append("title")
            .text(d => `${d3.timeFormat("%Y-%m-%d")(d.date)}: ${d.rainfall} mm`);
    }
    drawCalendarHeatmap();
}

// Draw a calendar heatmap for daily rainfall in a selected city and year.
function drawCalendarHeatmap() {
    const container = d3.select("#rainfall-heatmap");
    container.selectAll("*").remove();

    const detail = document.getElementById("rainfall-detail");
    if (detail) detail.hidden = true;

    // A city and year are selected after the user clicks an annual bar.
    if (!rainfallState.city || !rainfallState.year) {
        container.append("p")
            .text("Click an annual rainfall bar to view its daily calendar.");
        return;
    }

    const rows = rawParsedWeather
        .filter(d =>
            d.city === rainfallState.city &&
            d.date.getFullYear() === rainfallState.year
        )
        .sort((a, b) => a.date - b.date);

    if (rows.length === 0) {
        container.append("p").text("No daily rainfall data available.");
        return;
    }

    const cellSize = 14;
    const gap = 3;
    const yearStart = new Date(rainfallState.year, 0, 1);
    const yearEnd = new Date(rainfallState.year + 1, 0, 1);
    const weekCount = d3.timeWeek.count(yearStart, yearEnd);
    const width = 65 + (weekCount + 1) * (cellSize + gap);
    const height = 55 + 7 * (cellSize + gap);

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", `Daily rainfall calendar for ${rainfallState.city} in ${rainfallState.year}`);

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

    chart.selectAll(".rainfall-day")
        .data(rows, d => d.dayStr)
        .join("rect")
        .attr("class", "rainfall-day")
        .attr("x", d =>
            d3.timeWeek.count(d3.timeYear(d.date), d.date) * (cellSize + gap)
        )
        .attr("y", d => d.date.getDay() * (cellSize + gap))
        .attr("width", cellSize)
        .attr("height", cellSize)
        .attr("rx", 2)
        .attr("fill", d => color(d.precipitation))
        .style("cursor", "pointer")
        .on("click", (event, d) => showRainfallDetail(d))
        .append("title")
        .text(d => `${d.dayStr}: ${d.precipitation} mm`);
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

// Annual extreme weather charts.
function drawExtremeCharts() {
    const data = getAnnualExtremeData();
    if (data.length === 0) return;

    const margin = { top: 40, right: 40, bottom: 50, left: 60 };
    const width = 850 - margin.left - margin.right;
    const height = 420 - margin.top - margin.bottom;
    const cities = ["Hanoi", "Da Nang", "Ho Chi Minh City"];
    const rootStyles = getComputedStyle(document.documentElement);
    const color = d3.scaleOrdinal()
        .domain(cities)
        .range([
            rootStyles.getPropertyValue("--color-hanoi").trim(),
            rootStyles.getPropertyValue("--color-danang").trim(),
            rootStyles.getPropertyValue("--color-hcm").trim()
        ]);

    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip extreme-tooltip")
        .style("opacity", 0);

    function drawChart(container, field, eventLabel, filters) {
        const svg = d3.select(container).append("svg")
            .attr("width", 850)
            .attr("height", 420)
            .attr("viewBox", "0 0 850 420")
            .attr("role", "img")
            .attr("aria-label", eventLabel + " per year across three cities")
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const x = d3.scaleLinear()
            .domain(d3.extent(data, d => d.year))
            .range([0, width]);
        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => d[field]) || 1])
            .nice()
            .range([height, 0]);
        const ticks = y.ticks(Math.min(6, y.domain()[1]));

        svg.append("g").selectAll("line")
            .data(ticks).join("line")
            .attr("x1", 0).attr("x2", width)
            .attr("y1", d => y(d)).attr("y2", d => y(d))
            .attr("stroke", "#e2e8f0")
            .attr("stroke-dasharray", "4,4");

        svg.append("g").attr("class", "axis")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(data.length / cities.length).tickFormat(d3.format("d")));
        svg.append("g").attr("class", "axis")
            .call(d3.axisLeft(y).tickValues(ticks).tickFormat(d3.format("d")));

        svg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -height / 2).attr("y", -45)
            .attr("text-anchor", "middle")
            .attr("fill", "#64748b").attr("font-size", "12px")
            .text("Number of Days");
        svg.append("text")
            .attr("x", width / 2).attr("y", height + 40)
            .attr("text-anchor", "middle")
            .attr("fill", "#64748b").attr("font-size", "12px")
            .text("Year");

        const line = d3.line()
            .x(d => x(d.year))
            .y(d => y(d[field]));

        cities.forEach(city => {
            const cityData = data.filter(d => d.city === city);
            const group = svg.append("g")
                .attr("class", "extreme-city")
                .attr("data-city", city);

            group.append("path")
                .datum(cityData)
                .attr("class", "line")
                .attr("stroke", color(city))
                .attr("d", line);

            group.selectAll("circle")
                .data(cityData).join("circle")
                .attr("class", "dot")
                .attr("r", 4)
                .attr("cx", d => x(d.year))
                .attr("cy", d => y(d[field]))
                .attr("fill", color(city))
                .on("mouseover", (event, d) => {
                    tooltip.style("opacity", 0.9)
                        .html(`<strong>${d.city}</strong><br/>Year: ${d.year}<br/>${eventLabel}: ${d[field]}`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mouseout", () => tooltip.style("opacity", 0));
        });

        // Filter this chart by city.
        document.querySelectorAll(filters + " input").forEach(checkbox => {
            checkbox.addEventListener("change", () => {
                svg.selectAll(".extreme-city")
                    .filter(function() { return this.dataset.city === checkbox.value; })
                    .style("display", checkbox.checked ? null : "none");
                tooltip.style("opacity", 0);
            });
        });
    }

    drawChart("#hot-days-chart", "hotDays", "Hot days", "#extremeCityFilters");
    drawChart("#heavy-rain-days-chart", "heavyRainDays", "Heavy rainfall days", "#heavyRainCityFilters");
}
