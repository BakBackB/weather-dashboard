// Shared dashboard state ("slicers") used by every panel of dashboard.html.
//
//   range    – time window [first day, last day] (inclusive). Default: the whole data set.
//   quarter  – season index into DASH_SEASONS (0 = all months).
//   cities   – set of cities that are switched on.
//
// Any chart can read the state and any chart can change it. A change is announced with the
// "dashsync" event on document: detail = { keys: ["range"|"quarter"|"cities"], source, state }.
// `source` is the name of whoever made the change, so a chart can ignore its own echo.
//
// Load this file before the chart files. DashSync.init(rows) runs once from js/dashboard.js
// after the CSV is loaded.

const DASH_CITIES = ["Hanoi", "Da Nang", "Ho Chi Minh City"];
const DASH_SEASONS = [
    { label: "All months", months: d3.range(12) },
    { label: "Q1 · Jan–Mar", months: [0, 1, 2] },
    { label: "Q2 · Apr–Jun", months: [3, 4, 5] },
    { label: "Q3 · Jul–Sep", months: [6, 7, 8] },
    { label: "Q4 · Oct–Dec", months: [9, 10, 11] }
];

const DashSync = (() => {
    const state = { range: null, quarter: 0, cities: new Set(DASH_CITIES) };
    let full = null;
    const saved = [];                         // ranges remembered before a drill-down, see push()/pop()
    const sameDay = (a, b) => +d3.timeDay.floor(a) === +d3.timeDay.floor(b);

    function emit(keys, source) {
        document.dispatchEvent(new CustomEvent("dashsync", { detail: { keys, source: source || null, state } }));
    }

    const api = {
        ready: false,

        init(rows) {
            full = d3.extent(rows, d => d.date);
            state.range = full.slice();
            api.ready = true;
            emit(["range", "quarter", "cities"], "init");
        },

        // ---- time window ----
        full: () => full.slice(),
        range: () => state.range.slice(),
        years: () => [state.range[0].getFullYear(), state.range[1].getFullYear()],
        fullYears: () => [full[0].getFullYear(), full[1].getFullYear()],
        isFull: () => sameDay(state.range[0], full[0]) && sameDay(state.range[1], full[1]),
        // The year when the window lies inside one calendar year, otherwise null.
        singleYear() {
            const [a, b] = api.years();
            return a === b ? a : null;
        },
        setRange(range, source) {
            let [a, b] = range.map(d => d3.timeDay.floor(d));
            if (a > b) [a, b] = [b, a];
            a = new Date(Math.max(+a, +full[0]));
            b = new Date(Math.min(+b, +full[1]));
            if (+b < +a) b = a;
            if (sameDay(a, state.range[0]) && sameDay(b, state.range[1])) return;
            state.range = [a, b];
            emit(["range"], source);
        },
        setYears(y0, y1, source) {
            api.setRange([new Date(y0, 0, 1), new Date(y1, 11, 31)], source);
        },
        // One year, or null for the whole period.
        setYear(year, source) {
            if (year === null || year === undefined) api.setRange(full, source);
            else api.setYears(year, year, source);
        },
        // Remember the current window before a drill-down; pop() returns to it.
        push() { saved.push(state.range.slice()); },
        pop(source) {
            const range = saved.pop();
            if (range) api.setRange(range, source);
            else api.setRange(full, source);
        },
        clearSaved() { saved.length = 0; },

        // ---- season ----
        quarter: () => state.quarter,
        season: () => DASH_SEASONS[state.quarter],
        setQuarter(index, source) {
            if (index === state.quarter) return;
            state.quarter = index;
            emit(["quarter"], source);
        },

        // ---- cities ----
        cities: () => new Set(state.cities),
        hasCity: city => state.cities.has(city),
        setCities(cities, source) {
            const next = new Set(cities);
            if (next.size === state.cities.size && [...next].every(c => state.cities.has(c))) return;
            state.cities = next;
            emit(["cities"], source);
        },
        toggleCity(city, on, source) {
            const next = new Set(state.cities);
            if (on === undefined ? !next.has(city) : on) next.add(city); else next.delete(city);
            api.setCities(next, source);
        },

        reset(source) {
            state.range = full.slice();
            state.quarter = 0;
            state.cities = new Set(DASH_CITIES);
            saved.length = 0;
            emit(["range", "quarter", "cities"], source);
        },

        // ---- row filters (shared data) ----
        inRange: row => row.date >= state.range[0] && row.date <= state.range[1],
        inSeason: row => state.quarter === 0 || DASH_SEASONS[state.quarter].months.includes(row.date.getMonth()),
        inCity: row => state.cities.has(row.city),
        // Daily rows inside the time window and season (and the switched-on cities if cities = true).
        rows(cities = false) {
            return rawParsedWeather.filter(row =>
                api.inRange(row) && api.inSeason(row) && (!cities || api.inCity(row)));
        },
        // Same, but the season only (time window ignored): for charts that draw their own time axis.
        rowsInSeason() {
            return rawParsedWeather.filter(api.inSeason);
        },

        // ---- text ----
        rangeLabel() {
            const fmt = d3.timeFormat("%b %Y");
            if (api.isFull()) return "All years";
            const [a, b] = state.range;
            const wholeYears = a.getMonth() === 0 && a.getDate() === 1 && b.getMonth() === 11 && b.getDate() === 31;
            if (wholeYears) return a.getFullYear() === b.getFullYear() ? String(a.getFullYear()) : `${a.getFullYear()}–${b.getFullYear()}`;
            return `${fmt(a)} – ${fmt(b)}`;
        },
        isFiltered: () => !api.isFull() || state.quarter !== 0 || state.cities.size !== DASH_CITIES.length,

        // Subscribe: handler(detail) is called after every change; keys = optional filter ("range", ...).
        on(handler, keys) {
            document.addEventListener("dashsync", event => {
                if (!keys || event.detail.keys.some(k => keys.includes(k))) handler(event.detail);
            });
        }
    };
    return api;
})();

// Initialise before the charts draw: this file loads before main.js, so its listener runs first.
document.addEventListener("weatherDataLoaded", () => DashSync.init(rawParsedWeather));
