// Dashboard-only helpers for dashboard.html:
//  1. KPI row, computed from the data already loaded by dataLoader.js
//  2. highlight the nav link of the section currently in view
// Chart code of the three panels is untouched.

const KPI_CITIES = [
    { name: "Hanoi", color: "#0284C7", coords: "21.03°N, 105.85°E" },
    { name: "Da Nang", color: "#D97706", coords: "16.05°N, 108.20°E" },
    { name: "Ho Chi Minh City", color: "#D93856", coords: "10.82°N, 106.63°E" }
];

// Least-squares slope of y on x (change per year).
function kpiSlope(points) {
    if (points.length < 2) return 0;
    const mx = d3.mean(points, p => p[0]);
    const my = d3.mean(points, p => p[1]);
    const num = d3.sum(points, p => (p[0] - mx) * (p[1] - my));
    const den = d3.sum(points, p => (p[0] - mx) ** 2);
    return den === 0 ? 0 : num / den;
}

function kpiTrendHtml(slope, unit) {
    const rounded = Math.round(slope * 10) / 10;
    const cls = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
    const arrow = rounded > 0 ? "▲" : rounded < 0 ? "▼" : "■";
    const sign = rounded > 0 ? "+" : "";
    return `<span class="kpi-trend ${cls}">${arrow} ${sign}${rounded.toFixed(1)} ${unit}</span>`;
}

function kpiStat(label, value, unit, extra = "") {
    return `<div class="kpi-stat"><dt>${label}</dt><dd>${value}<small>${unit}</small>${extra}</dd></div>`;
}

function buildKpis() {
    const host = document.getElementById("kpiRow");
    if (!host) return;
    if (!rawParsedWeather.length) {
        host.innerHTML = '<p class="kpi-loading">No data loaded.</p>';
        return;
    }

    const fmt1 = d3.format(".1f");
    const fmt0 = d3.format(",.0f");

    // The figures follow the global time window and season (js/dashboardSync.js); switched-off cities are dimmed.
    const scoped = DashSync.rows();
    const scope = document.getElementById("kpiScope");
    if (scope) {
        scope.textContent = `Figures for ${DashSync.rangeLabel()}${DashSync.quarter() ? " · " + DashSync.season().label : ""}` +
            ` · ${d3.format(",")(scoped.length)} daily records`;
    }

    const [firstDay, lastDay] = d3.extent(rawParsedWeather, d => d.date);
    const meta = document.getElementById("dashMeta");
    if (meta) {
        meta.textContent = `Hanoi · Da Nang · Ho Chi Minh City · ${d3.timeFormat("%b %Y")(firstDay)} – ` +
            `${d3.timeFormat("%b %Y")(lastDay)} · ${d3.format(",")(rawParsedWeather.length)} daily records · Open-Meteo`;
    }

    host.innerHTML = KPI_CITIES.map(city => {
        const rows = scoped.filter(d => d.city === city.name);
        const off = DashSync.hasCity(city.name) ? "" : " is-off";
        if (!rows.length) return `<article class="kpi-city${off}" style="--kpi-color:${city.color}"><header><h2>${city.name}</h2><span>${city.coords}</span></header><p class="kpi-loading">No data in this selection.</p></article>`;

        // Annual totals / counts, one row per year.
        const annual = d3.rollups(rows, v => ({
            rain: d3.sum(v, d => d.precipitation),
            hot: v.filter(d => d.tempMax > 35).length,
            heavy: v.filter(d => d.precipitation > 50).length
        }), d => +d.year).sort((a, b) => a[0] - b[0]);

        // A trend needs at least three years.
        const trend = (field, unit) => annual.length >= 3 ? kpiTrendHtml(kpiSlope(annual.map(([y, c]) => [y, c[field]])), unit) : "";

        return `
        <article class="kpi-city${off}" style="--kpi-color:${city.color}">
            <header><h2>${city.name}</h2><span>${city.coords}</span></header>
            <dl class="kpi-stats">
                ${kpiStat("Mean temperature", fmt1(d3.mean(rows, d => d.tempMean)), "°C")}
                ${kpiStat("Rainfall per year", fmt0(d3.mean(annual, ([, c]) => c.rain)), "mm")}
                ${kpiStat("Mean humidity", fmt0(d3.mean(rows, d => d.humidity)), "%")}
                ${kpiStat("Hot days &gt;35°C / yr", fmt1(d3.mean(annual, ([, c]) => c.hot)), "days", trend("hot", "days/yr"))}
                ${kpiStat("Heavy rain &gt;50 mm / yr", fmt1(d3.mean(annual, ([, c]) => c.heavy)), "days", trend("heavy", "days/yr"))}
                ${kpiStat("Sunshine per day", fmt1(d3.mean(rows, d => d.sunshineHours)), "h")}
            </dl>
        </article>`;
    }).join("");
}

// Nav highlight: mark the section whose top has passed under the sticky header.
function setupNavSpy() {
    const links = Array.from(document.querySelectorAll(".dash-nav a"));
    const sections = links.map(a => document.getElementById(a.dataset.spy)).filter(Boolean);
    if (!sections.length) return;

    function update() {
        const line = 120;
        let current = sections[0].id;
        sections.forEach(section => {
            if (section.getBoundingClientRect().top <= line) current = section.id;
        });
        links.forEach(a => a.classList.toggle("active", a.dataset.spy === current));
    }

    window.addEventListener("scroll", update, { passive: true });
    update();
}

document.addEventListener("weatherDataLoaded", buildKpis);
DashSync.on(detail => { if (detail.source !== "init") buildKpis(); });
document.addEventListener("DOMContentLoaded", setupNavSpy);
