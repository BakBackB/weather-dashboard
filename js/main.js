document.addEventListener("DOMContentLoaded", async () => {
    await loadWeatherData();
    document.dispatchEvent(new Event("weatherDataLoaded"));
});

// Start each chart independently after loading data.
document.addEventListener("weatherDataLoaded", drawTemperatureChart);
document.addEventListener("weatherDataLoaded", drawExtremeCharts);

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
