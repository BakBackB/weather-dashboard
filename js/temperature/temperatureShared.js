// Constants, helper functions and the year and season filter used by all temperature charts.

// The three cities, in the order north to south
const TEMP_CITIES = ["Hanoi", "Da Nang", "Ho Chi Minh City"];

// Short month names, index 0 is January
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Season filter options
// Calendar quarters are used, so no season crosses the end of a year.
const TEMP_QUARTERS = [
    { label: "All months", months: d3.range(12) },
    { label: "Q1 · Jan–Mar", months: [0, 1, 2] },
    { label: "Q2 · Apr–Jun", months: [3, 4, 5] },
    { label: "Q3 · Jul–Sep", months: [6, 7, 8] },
    { label: "Q4 · Oct–Dec", months: [9, 10, 11] }
];

// Length of the animations when a filter changes, in milliseconds
const TEMP_DURATION = 450;

// Width of every temperature chart in pixels (the height is set per chart)
const TEMP_CHART_WIDTH = 1080;


// Helper functions

// Colour scale for the cities
// The colours come from the CSS variables in dashboard.css, so all tabs use the same colours.
function cityColorScale() {
    const rootStyles = getComputedStyle(document.documentElement);
    return d3.scaleOrdinal()
        .domain(TEMP_CITIES)
        .range([
            rootStyles.getPropertyValue("--color-hanoi").trim(),
            rootStyles.getPropertyValue("--color-danang").trim(),
            rootStyles.getPropertyValue("--color-hcm").trim()
        ]);
}

// Tooltip that follows the mouse
// Returns an object with show(event, html) and hide().
function createTooltip() {
    const tooltipBox = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);

    return {
        show(event, html) {
            tooltipBox.style("opacity", 0.9)
                .html(html)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        },
        hide() {
            tooltipBox.style("opacity", 0);
        }
    };
}

// Creates a new SVG in the container (an old one is removed first)
// Returns the inner group, moved by the margins, and the size of the plot area.
function createSvg(container, height, margin) {
    d3.select(container).selectAll("*").remove();
    const svg = d3.select(container).append("svg")
        .attr("width", TEMP_CHART_WIDTH)
        .attr("height", height)
        .attr("viewBox", `0 0 ${TEMP_CHART_WIDTH} ${height}`)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    return { svg, width: TEMP_CHART_WIDTH - margin.left - margin.right, height: height - margin.top - margin.bottom };
}

// Dashed horizontal grid lines at the ticks of a y scale
function addGrid(svg, yScale, width) {
    svg.append("g").selectAll("line")
        .data(yScale.ticks(6)).join("line")
        .attr("x1", 0).attr("x2", width)
        .attr("y1", tick => yScale(tick)).attr("y2", tick => yScale(tick))
        .attr("stroke", "#e2e8f0")
        .attr("stroke-dasharray", "4,4");
}

// Axis title, rotated for a vertical axis
function addAxisLabel(svg, text, xPosition, yPosition, rotate = false) {
    svg.append("text")
        .attr("transform", rotate ? "rotate(-90)" : null)
        .attr("x", xPosition).attr("y", yPosition)
        .attr("text-anchor", "middle")
        .attr("fill", "#64748b").attr("font-size", "12px")
        .text(text);
}

// The cities that are checked in the city filter
function checkedCities() {
    return Array.from(document.querySelectorAll("#cityFilters input:checked")).map(checkbox => checkbox.value);
}

// Hides the marks of unchecked cities in every temperature chart
// Every mark that belongs to a city has the class temp-city and a data-city attribute.
function applyTemperatureCityFilter() {
    const checked = checkedCities();
    d3.selectAll("#temperature .temp-city")
        .style("display", function() { return checked.includes(this.dataset.city) ? null : "none"; });
}

// Mean of a value over a list of rows (sum divided by count)
function average(rows, value) {
    return d3.sum(rows, value) / rows.length;
}

// Groups rows by two keys with d3.group and turns every group into one object
// summary(groupRows, firstKey, secondKey) builds the object for one group.
function summarizeGroups(rows, firstKey, secondKey, summary) {
    const result = [];
    d3.group(rows, firstKey, secondKey).forEach((innerGroups, firstValue) => {
        innerGroups.forEach((groupRows, secondValue) => result.push(summary(groupRows, firstValue, secondValue)));
    });
    return result;
}

// Mean temperature of every city and month, and how far it lies above or below the 10-year average of that month
function monthlyAnomalies() {
    const monthValues = summarizeGroups(rawParsedWeather, row => row.city, row => row.yearMonth, (rows, city) => ({
        city,
        month: rows[0].date.getMonth(),
        mean: average(rows, row => row.tempMean),
        date: d3.timeMonth(rows[0].date)  // first day of the month
    }));

    // 10-year average of every city and calendar month
    const normalByCityAndMonth = d3.group(monthValues, entry => entry.city, entry => entry.month);
    monthValues.forEach(entry => {
        const sameMonths = normalByCityAndMonth.get(entry.city).get(entry.month);
        entry.anomaly = entry.mean - average(sameMonths, other => other.mean);
    });

    return monthValues.sort((first, second) => first.date - second.date);
}


// Year and season filter
// Shared by all temperature charts. The city checkboxes are handled separately.

// Current filter values
// year is null for "All years", quarter is one entry of TEMP_QUARTERS.
// startMonth is the month where the 12-month window of the year slider begins (0 is January, so a calendar year).
// A window starting later, for example March 2016 to February 2017, is only used by the temperature charts.
// span is [first year, last year] when the dashboard's time window covers several but not all years (year is then null).
const temperatureFilters = { year: null, startMonth: 0, quarter: TEMP_QUARTERS[0], span: null };

// True once the filter controls are built
let temperatureFiltersReady = false;

// Last year of the data, set when the filter controls are built
let temperatureLastYear = null;

// Optional other use of the year slider, set by a chart (the day view uses it to move month by month)
// An object with active(), value(), label(), select(position), step(direction) and canStep(direction).
// Positions count months: year * 12 + month, direction is -1 for back and +1 for forward.
let temperatureSliderOverride = null;

// Whether the year slider shows a 12-month window that does not start in January
function temperatureRollingWindow() {
    return temperatureFilters.year !== null && temperatureFilters.startMonth !== 0;
}

// Text for a 12-month window that does not start in January, for example "Mar 2016 – Feb 2017"
function temperatureWindowLabel() {
    const { year, startMonth } = temperatureFilters;
    return `${MONTH_LABELS[startMonth]} ${year} – ${MONTH_LABELS[(startMonth + 11) % 12]} ${year + 1}`;
}

// True on pages that load the shared dashboard state (dashboard.html), false on index.html
function dashboardSyncActive() {
    return typeof DashSync !== "undefined" && DashSync.ready;
}

// Whether a day passes the day condition of the dashboard (humidity and temperature box of the scatter plot)
// Without the shared dashboard state every day passes.
function temperatureInCondition(row) {
    return dashboardSyncActive() ? DashSync.inCondition(row) : true;
}

// Whether the dashboard has a day condition set
function temperatureHasCondition() {
    return dashboardSyncActive() && DashSync.condition() !== null;
}

// Days of the year span, or of every year when there is no span (the single selected year is ignored here)
function temperatureSpanRows() {
    const span = temperatureFilters.span;
    if (!span) return rawParsedWeather;
    return rawParsedWeather.filter(row => row.date.getFullYear() >= span[0] && row.date.getFullYear() <= span[1]);
}

// Days of the selected 12-month window, or of the year span, or of every year, that pass the day condition
function temperatureRows() {
    if (temperatureFilters.year !== null) {
        const windowStart = new Date(temperatureFilters.year, temperatureFilters.startMonth, 1);
        const windowEnd = new Date(temperatureFilters.year + 1, temperatureFilters.startMonth, 1);
        return rawParsedWeather.filter(row => row.date >= windowStart && row.date < windowEnd && temperatureInCondition(row));
    }
    return temperatureSpanRows().filter(temperatureInCondition);
}

// Text for the current year selection, for example "2019", "2016–2019 average" or "10-year average (2015–2025)"
function temperatureYearLabel() {
    const { year, span } = temperatureFilters;
    if (temperatureRollingWindow()) return temperatureWindowLabel();
    if (year !== null) return String(year);
    return span ? `${span[0]}–${span[1]} average` : "10-year average (2015–2025)";
}

// Builds the "All years" button, the year slider with its labels and the season buttons
function initTemperatureFilters() {
    temperatureFiltersReady = true;
    const years = Array.from(new Set(rawParsedWeather.map(row => row.date.getFullYear()))).sort(d3.ascending);
    temperatureLastYear = years[years.length - 1];

    // "All years" shows the 10-year average, it is a button because it is not a point on the time scale
    document.getElementById("temperatureAllYears")
        .addEventListener("click", () => setTemperatureFilters({ year: null }));

    // Year slider
    // It moves in months: each step shifts a 12-month window by one month, so new months come in on one side
    // and old months leave on the other. Its positions count months (year * 12 + month).
    // While a season is selected it only moves in whole years. The charts update while dragging.
    // While "All years" is active the slider is grey and keeps its position.
    const slider = document.getElementById("temperatureYear");
    slider.min = years[0] * 12;
    slider.max = temperatureLastYear * 12 + 11;
    slider.value = years[0] * 12;
    slider.addEventListener("input", selectSliderPosition);
    slider.addEventListener("pointerdown", selectSliderPosition);  // clicking the grey handle also selects its position

    // Buttons left and right of the slider, one step back or forward
    const sliderBox = document.getElementById("temperatureYearSlider");
    [-1, 1].forEach(direction => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "temperature-step-button";
        button.dataset.direction = direction;
        button.textContent = direction < 0 ? "‹" : "›";
        button.setAttribute("aria-label", direction < 0 ? "One step back" : "One step forward");
        button.addEventListener("click", () => stepTemperatureSlider(direction));
        if (direction < 0) sliderBox.before(button);
        else sliderBox.after(button);
    });

    // Year labels under the slider, each at the January of its year
    // Clicking one selects exactly that calendar year.
    const sliderRange = slider.max - slider.min;
    d3.select("#temperatureYearTicks").selectAll("button")
        .data(years).join("button")
        .attr("type", "button")
        .style("left", year => `calc(9px + (100% - 18px) * ${(year * 12 - slider.min) / sliderRange})`)
        .text(year => `'${String(year).slice(2)}`)
        .on("click", (event, year) => setTemperatureFilters({ year, startMonth: 0 }));

    // Season buttons
    d3.select("#temperatureSeasonFilter")
        .selectAll("button")
        .data(TEMP_QUARTERS).join("button")
        .attr("class", "temperature-season")
        .text(quarter => quarter.label)
        .on("click", (event, quarter) => setTemperatureFilters({ quarter }));

    syncTemperatureFilters();
}

// The active other use of the year slider, or null
function activeSliderOverride() {
    return temperatureSliderOverride && temperatureSliderOverride.active() ? temperatureSliderOverride : null;
}

// Selects the position the year slider was moved to
function selectSliderPosition() {
    const slider = document.getElementById("temperatureYear");
    const position = +slider.value;
    const override = activeSliderOverride();
    if (override) {
        override.select(position);
        return;
    }
    // The window starts at the latest in January of the last year, so it always lies inside the data
    const start = Math.min(position, temperatureLastYear * 12);
    let year = Math.floor(start / 12);
    let startMonth = start % 12;
    if (temperatureFilters.quarter.months.length < 12) {
        year = Math.min(Math.round(position / 12), temperatureLastYear);
        startMonth = 0;
    }
    if (year !== temperatureFilters.year || startMonth !== temperatureFilters.startMonth) {
        setTemperatureFilters({ year, startMonth });
    }
}

// Size of one step of the step buttons and the last position a step may reach
// With a season the window moves in whole years, otherwise in months.
function sliderStepSize() {
    return temperatureFilters.quarter.months.length < 12 ? 12 : 1;
}

// Position one step away from the current one (direction -1 or +1), or null at the edge
function sliderStepTarget(direction) {
    const slider = document.getElementById("temperatureYear");
    const current = +slider.value;
    const target = current + direction * sliderStepSize();
    if (target < +slider.min || target > temperatureLastYear * 12) return null;
    return target;
}

// Moves the year slider one step back (direction -1) or forward (direction +1)
function stepTemperatureSlider(direction) {
    const override = activeSliderOverride();
    if (override) {
        override.step(direction);
        return;
    }
    const target = sliderStepTarget(direction);
    if (target === null) return;
    document.getElementById("temperatureYear").value = target;
    selectSliderPosition();
}

// Makes the filter controls show the current filter values
function syncTemperatureFilters() {
    const allYears = temperatureFilters.year === null;
    const slider = document.getElementById("temperatureYear");
    const override = activeSliderOverride();
    if (override) slider.value = override.value();
    else if (!allYears) slider.value = temperatureFilters.year * 12 + temperatureFilters.startMonth;

    // The part of the slider left of the handle is coloured (see .temperature-year-slider in dashboard.css)
    slider.style.setProperty("--fill", `${(slider.value - slider.min) / (slider.max - slider.min) * 100}%`);

    d3.select("#temperatureYearSlider").classed("inactive", allYears);
    d3.select("#temperatureAllYears").classed("active", allYears).attr("aria-pressed", allYears);
    d3.select("#temperatureYearValue")
        .text(override ? override.label() : temperatureRollingWindow() ? temperatureWindowLabel() : temperatureFilters.year)
        .style("display", allYears ? "none" : null);
    d3.selectAll("#temperatureYearTicks button")
        .classed("active", year => year === temperatureFilters.year && !temperatureRollingWindow());
    d3.selectAll("#temperatureSeasonFilter button")
        .classed("active", quarter => quarter === temperatureFilters.quarter)
        .attr("aria-pressed", quarter => quarter === temperatureFilters.quarter);

    // Step buttons are disabled at the edge
    d3.selectAll(".temperature-step-button").property("disabled", function() {
        const direction = +this.dataset.direction;
        return override ? !override.canStep(direction) : sliderStepTarget(direction) === null;
    });
}

// Changes the filter values and tells every chart to redraw
// changes holds the values to change, for example { year: 2019 }.
// fromSync is true when the change comes from the shared dashboard state, so it is not sent back to it.
function setTemperatureFilters(changes, fromSync = false) {
    if (!fromSync && "year" in changes) changes = { ...changes, span: null };
    // A new year without a start month is a whole calendar year
    if ("year" in changes && !("startMonth" in changes)) changes = { ...changes, startMonth: 0 };
    // A season only works with whole years, so a shifted window jumps to the calendar year it mostly covers
    if ("quarter" in changes && changes.quarter.months.length < 12 && temperatureRollingWindow() && !("year" in changes)) {
        const { year, startMonth } = temperatureFilters;
        changes = { ...changes, year: Math.min(startMonth <= 6 ? year : year + 1, temperatureLastYear), startMonth: 0 };
    }
    Object.assign(temperatureFilters, changes);
    syncTemperatureFilters();

    // On the dashboard the year and season are also shared with the other panels
    // A shifted 12-month window stays inside the temperature charts.
    if (!fromSync && dashboardSyncActive()) {
        if ("year" in changes && !temperatureRollingWindow()) DashSync.setYear(changes.year, "temperature");
        if ("quarter" in changes) DashSync.setQuarter(TEMP_QUARTERS.indexOf(changes.quarter), "temperature");
    }
    document.dispatchEvent(new Event("temperatureFiltersChanged"));
}

// On the dashboard the shared time window, season and day condition drive the temperature filters
// A window inside one year selects that year, a window over several years becomes a year span,
// and the whole period means "All years".
if (typeof DashSync !== "undefined") {
    DashSync.on(detail => {
        if (detail.source === "init" || detail.source === "temperature" || !temperatureFiltersReady) return;
        const changes = {};
        if (detail.keys.includes("range")) {
            const [firstYear, lastYear] = DashSync.years();
            const [fullFirstYear, fullLastYear] = DashSync.fullYears();
            if (firstYear === lastYear) Object.assign(changes, { year: firstYear, span: null });
            else if (firstYear === fullFirstYear && lastYear === fullLastYear) Object.assign(changes, { year: null, span: null });
            else Object.assign(changes, { year: null, span: [firstYear, lastYear] });
        }
        if (detail.keys.includes("quarter")) changes.quarter = TEMP_QUARTERS[DashSync.quarter()];
        // A new day condition changes which days are averaged, so the charts are redrawn as well
        setTemperatureFilters(changes, true);
    });
}
