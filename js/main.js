document.addEventListener("DOMContentLoaded", async () => {
    await loadWeatherData();

    const margin = { top: 40, right: 40, bottom: 50, left: 60 },
          width = 850 - margin.left - margin.right,
          height = 420 - margin.top - margin.bottom;

    const svg = d3.select("#temperature-chart")
                  .append("svg")
                  .attr("width", width + margin.left + margin.right)
                  .attr("height", height + margin.top + margin.bottom)
                  .append("g")
                  .attr("transform", `translate(${margin.left},${margin.top})`);

    const tooltip = d3.select("body").append("div")
                      .attr("class", "tooltip")
                      .style("opacity", 0);

    const rootStyles = getComputedStyle(document.documentElement);
    const color = d3.scaleOrdinal()
                    .domain(["Ho Chi Minh City", "Nam Dinh", "Hue"])
                    .range([
                        rootStyles.getPropertyValue('--color-hcm').trim() || "#D93856",
                        rootStyles.getPropertyValue('--color-namdinh').trim() || "#0284C7",
                        rootStyles.getPropertyValue('--color-hue').trim() || "#D97706"
                    ]);

    svg.append("g").attr("class", "y-grid");
    const xAxisGroup = svg.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${height})`);
    const yAxisGroup = svg.append("g").attr("class", "axis y-axis");

    svg.append("text")
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
    let selectedCities = ["Ho Chi Minh City", "Nam Dinh", "Hue"];

    function updateChart() {
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

        svg.select(".y-grid")
           .selectAll("line")
           .data(y.ticks(6))
           .join("line")
           .attr("x1", 0)
           .attr("x2", width)
           .attr("y1", d => y(d))
           .attr("y2", d => y(d))
           .attr("stroke", "#e2e8f0")
           .attr("stroke-dasharray", "4,4");

        xAxisGroup.call(d3.axisBottom(x).ticks(6).tickFormat(tickFormat));
        yAxisGroup.call(d3.axisLeft(y));

        const nestedData = d3.group(data, d => d.city);
        const isDense = currentLevel === "day";

        const line = d3.line()
                       .x(d => x(d.date))
                       .y(d => y(d.temp))
                       .curve(isDense ? d3.curveLinear : d3.curveMonotoneX);

        const cityGroups = svg.selectAll(".city-group")
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
            .attr("r", isDense ? 2 : 4) // Radius hierhin verschieben!
            .attr("cx", d => x(d.date))
            .attr("cy", d => y(d.temp))
            .attr("fill", d => color(d.city));

        // Drill-Down Click Handlers
        allGroups.selectAll(".dot")
            .on("click", (event, d) => {
                if (currentLevel === "year") {
                    selectedYear = d.date.getFullYear();
                    currentLevel = "month";
                    updateChart();
                } else if (currentLevel === "month") {
                    selectedYear = d.date.getFullYear();
                    selectedMonth = d.date.getMonth() + 1;
                    currentLevel = "day";
                    updateChart();
                }
            })
            .on("mouseover", (event, d) => {
                tooltip.transition().duration(200).style("opacity", .9);
                tooltip.html(`<strong>${d.city}</strong><br/>Date: ${d3.timeFormat("%Y-%m-%d")(d.date)}<br/>Temp: ${d.temp}°C`)
                       .style("left", (event.pageX + 10) + "px")
                       .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", () => {
                tooltip.transition().duration(500).style("opacity", 0);
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
        updateChart();
    });

    // Checkbox Change Event Listeners for City Filtering
    document.querySelectorAll("#cityFilters input[type='checkbox']").forEach(checkbox => {
        checkbox.addEventListener("change", () => {
            selectedCities = Array.from(document.querySelectorAll("#cityFilters input[type='checkbox']:checked"))
                                  .map(cb => cb.value);
            updateChart();
        });
    });

    updateChart();
});