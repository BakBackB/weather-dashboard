const EXTREME_CITIES = ["Hanoi", "Da Nang", "Ho Chi Minh City"];
const EXTREME_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EXTREME_WIND_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const EXTREME_HOT_THRESHOLD = 35;
const EXTREME_RAIN_THRESHOLD = 50;

function extremeCityColorScale() {
    const styles = getComputedStyle(document.documentElement);
    return d3.scaleOrdinal().domain(EXTREME_CITIES).range([
        styles.getPropertyValue("--color-hanoi").trim() || "#0284c7",
        styles.getPropertyValue("--color-danang").trim() || "#d97706",
        styles.getPropertyValue("--color-hcm").trim() || "#d93856"
    ]);
}

// Each observation is one city-day. Threshold comparisons are strictly greater than.
function getAnnualExtremeData(rows = rawParsedWeather) {
    const groups = new Map();
    rows.forEach(row => {
        const year = Number(row.year);
        const key = `${row.city}-${year}`;
        if (!groups.has(key)) groups.set(key, { city: row.city, year, hotDays: 0, heavyRainDays: 0 });
        const counts = groups.get(key);
        if (Number.isFinite(row.tempMax) && row.tempMax > EXTREME_HOT_THRESHOLD) counts.hotDays += 1;
        if (Number.isFinite(row.precipitation) && row.precipitation > EXTREME_RAIN_THRESHOLD) counts.heavyRainDays += 1;
    });
    return Array.from(groups.values()).sort((a, b) => a.year - b.year);
}

// Keep all twelve months, including those with no threshold exceedances.
function getMonthlyExtremeData(rows = rawParsedWeather) {
    const groups = new Map();
    rows.forEach(row => {
        if (!row.date || !Number.isFinite(row.date.getTime())) return;
        const year = row.date.getFullYear();
        const key = `${row.city}-${year}`;
        if (!groups.has(key)) {
            groups.set(key, Array.from({ length: 12 }, (_, month) => ({
                city: row.city, year, month, hotDays: 0, heavyRainDays: 0
            })));
        }
        const counts = groups.get(key)[row.date.getMonth()];
        if (Number.isFinite(row.tempMax) && row.tempMax > EXTREME_HOT_THRESHOLD) counts.hotDays += 1;
        if (Number.isFinite(row.precipitation) && row.precipitation > EXTREME_RAIN_THRESHOLD) counts.heavyRainDays += 1;
    });
    return Array.from(groups.values()).flat().sort((a, b) => a.year - b.year || a.month - b.month);
}

function extremeCreateSvg(container, outerHeight, label, margin = { top: 25, right: 25, bottom: 55, left: 65 }, outerWidth = 850) {
    const host = d3.select(container);
    host.selectAll("*").remove();
    const svg = host.append("svg")
        .attr("width", outerWidth).attr("height", outerHeight)
        .attr("viewBox", `0 0 ${outerWidth} ${outerHeight}`)
        .attr("role", "img").attr("aria-label", label);
    const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    return { svg, plot, width: outerWidth - margin.left - margin.right, height: outerHeight - margin.top - margin.bottom };
}

function extremeCreateTooltip() {
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip extreme-tooltip").style("opacity", 0);
    return {
        show(event, html) {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = Number.isFinite(event.pageX) ? event.pageX : rect.left + window.scrollX;
            const y = Number.isFinite(event.pageY) ? event.pageY : rect.top + window.scrollY;
            tooltip.html(html).style("left", `${x + 12}px`).style("top", `${y - 28}px`).style("opacity", 0.96);
        },
        hide() { tooltip.style("opacity", 0); }
    };
}

function extremeAddAxes(plot, x, y, width, height, xLabel, yLabel, xAxis = d3.axisBottom(x), yAxis = d3.axisLeft(y)) {
    plot.append("g").attr("class", "extreme-grid").selectAll("line")
        .data(y.ticks(5)).join("line")
        .attr("x1", 0).attr("x2", width).attr("y1", d => y(d)).attr("y2", d => y(d));
    plot.append("g").attr("class", "axis").attr("transform", `translate(0,${height})`).call(xAxis);
    plot.append("g").attr("class", "axis").call(yAxis);
    plot.append("text").attr("class", "extreme-axis-label")
        .attr("x", width / 2).attr("y", height + 43).attr("text-anchor", "middle").text(xLabel);
    plot.append("text").attr("class", "extreme-axis-label")
        .attr("transform", "rotate(-90)").attr("x", -height / 2).attr("y", -48)
        .attr("text-anchor", "middle").text(yLabel);
}

function extremeInitCityFilters(id, onChange) {
    const selected = new Set(EXTREME_CITIES);
    const color = extremeCityColorScale();
    const labels = d3.select(`#${id}`).selectAll("label").data(EXTREME_CITIES).join("label")
        .attr("class", "filter-label");
    labels.append("input").attr("type", "checkbox").attr("value", d => d)
        .property("checked", true).style("accent-color", d => color(d))
        .on("change", function(event, city) {
            if (this.checked) selected.add(city);
            else selected.delete(city);
            onChange();
        });
    labels.append("span").text(d => d);
    return selected;
}

function extremeDrawLegend(container, items, color, classPrefix = "extreme-city") {
    const legend = d3.select(container).selectAll("span").data(items).join("span")
        .attr("class", `${classPrefix}-legend-item`).attr("role", "listitem");
    legend.append("span").attr("class", `${classPrefix}-swatch`).attr("aria-hidden", "true")
        .style("background-color", item => color(item));
    legend.append("span").text(item => item);
}

function extremeDrawColorLegend(container, scale, label, boundaries) {
    const { plot } = extremeCreateSvg(container, 40, label,
        { top: 5, right: 35, bottom: 5, left: 15 }, 500);
    const width = 450;
    const [min, max] = scale.domain();
    const x = d3.scaleLinear().domain([min, max]).range([0, width]);
    plot.selectAll("rect").data(d3.pairs(boundaries)).join("rect")
        .attr("class", "extreme-colour-step")
        .attr("x", d => x(d[0])).attr("width", d => x(d[1]) - x(d[0])).attr("height", 12)
        .attr("fill", d => scale((d[0] + d[1]) / 2))
        .attr("stroke", "#fff").attr("stroke-width", 1);
    plot.append("g").attr("class", "axis").attr("transform", "translate(0,12)")
        .call(d3.axisBottom(x).tickValues(boundaries).tickFormat(d3.format("d")));
}

// Bin observed days; empty cells are constructed separately by the renderer.
function getExtremeHeatmapCells(rows) {
    const bins = new Map();
    rows.forEach(row => {
        if (![row.tempMax, row.humidity, row.apparentTempMax].every(Number.isFinite) || row.humidity < 0 || row.humidity > 100) return;
        const tempBin = Math.floor(row.tempMax / 2) * 2;
        const humidityBin = Math.min(95, Math.floor(row.humidity / 5) * 5);
        const key = `${row.city}-${tempBin}-${humidityBin}`;
        if (!bins.has(key)) bins.set(key, { city: row.city, tempBin, humidityBin, count: 0, apparentSum: 0 });
        const bin = bins.get(key);
        bin.count += 1;
        bin.apparentSum += row.apparentTempMax;
    });
    return Array.from(bins.values(), bin => ({
        city: bin.city, tempBin: bin.tempBin, humidityBin: bin.humidityBin,
        count: bin.count, apparentMean: bin.apparentSum / bin.count
    }));
}

// Keep daily observations unchanged; missing wind/sunshine values remain unavailable.
function getExtremeStormEvents(rows, range) {
    return rows.filter(row => Number.isFinite(row.date?.getTime()) &&
        row.date >= range[0] && row.date <= range[1] && DashSync.inSeason(row) &&
        Number.isFinite(row.precipitation) && row.precipitation > EXTREME_RAIN_THRESHOLD)
        .sort((a, b) => a.date - b.date);
}

function getExtremeWindDirection(value) {
    if (!Number.isFinite(value)) return null;
    const degrees = ((value % 360) + 360) % 360;
    const sector = Math.round(degrees / 45) % 8;
    return { degrees, sector, name: EXTREME_WIND_DIRECTIONS[sector] };
}

// One slot per city/year, including zero-event years. Unknown directions stay separate.
function getExtremeAnnualWindCounts(rows, range) {
    const groups = new Map();
    for (let year = range[0].getFullYear(); year <= range[1].getFullYear(); year += 1) {
        EXTREME_CITIES.forEach(city => groups.set(`${city}-${year}`, {
            city, year, total: 0, counts: Array(8).fill(0), missing: 0
        }));
    }
    getExtremeStormEvents(rows, range).forEach(row => {
        const group = groups.get(`${row.city}-${row.date.getFullYear()}`);
        if (!group) return;
        group.total += 1;
        const direction = getExtremeWindDirection(row.windDirection);
        if (direction) group.counts[direction.sector] += 1;
        else group.missing += 1;
    });
    return Array.from(groups.values());
}

// Combine the same annual sector counts over the selected dates for the city roses.
function getExtremeWindCounts(rows, range) {
    const totals = EXTREME_CITIES.map(city => ({ city, total: 0, counts: Array(8).fill(0), missing: 0 }));
    const byCity = new Map(totals.map(row => [row.city, row]));
    getExtremeAnnualWindCounts(rows, range).forEach(row => {
        const total = byCity.get(row.city);
        total.total += row.total;
        total.missing += row.missing;
        row.counts.forEach((count, i) => { total.counts[i] += count; });
    });
    return totals;
}

// Keep all twelve months; the monthly sum matches the selected city/year bar.
function getExtremeMonthlyWindCounts(rows, range, city, year) {
    const months = Array.from({ length: 12 }, (_, month) => ({
        city, year, month, total: 0, counts: Array(8).fill(0), missing: 0
    }));
    getExtremeStormEvents(rows, range).forEach(row => {
        if (row.city !== city || row.date.getFullYear() !== year) return;
        const group = months[row.date.getMonth()];
        group.total += 1;
        const direction = getExtremeWindDirection(row.windDirection);
        if (direction) group.counts[direction.sector] += 1;
        else group.missing += 1;
    });
    return months;
}

// Keep previous-year comparisons independent of the visible range and city filters.
function getAnnualExtremeChanges(data, field) {
    const byCityYear = new Map(data.map(d => [`${d.city}-${d.year}`, d]));
    return data.map(d => {
        const previous = byCityYear.get(`${d.city}-${d.year - 1}`);
        const previousValue = previous ? previous[field] : null;
        return { ...d, previousValue, change: previousValue === null ? null : d[field] - previousValue };
    });
}

function getExtremeChangesAboveThreshold(data, selectedYears, visibleCities, threshold) {
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 366) return [];
    return data.filter(d =>
        visibleCities.has(d.city) &&
        d.year >= selectedYears[0] && d.year <= selectedYears[1] &&
        d.change !== null && Math.abs(d.change) >= threshold
    );
}

// Select the year centres inside a brush; a narrow selection keeps its nearest year.
function getExtremeInclusiveYearRange(range, fullYears) {
    if (!range) return fullYears.slice();
    const clamp = year => Math.max(fullYears[0], Math.min(fullYears[1], year));
    const start = clamp(Math.ceil(range[0]));
    const end = clamp(Math.floor(range[1]));
    if (start <= end) return [start, end];
    const nearest = clamp(Math.round((range[0] + range[1]) / 2));
    return [nearest, nearest];
}

// Snap a brush selection to whole years, keeping at least two years in view.
function getExtremeYearRange(range, fullYears) {
    if (!range) return fullYears.slice();
    let [start, end] = range.map(value =>
        Math.max(fullYears[0], Math.min(fullYears[1], Math.round(value)))
    );
    if (start === end) {
        if (end < fullYears[1]) end += 1;
        else start = Math.max(fullYears[0], start - 1);
    }
    return [start, end];
}
