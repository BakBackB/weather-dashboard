function getFilteredAggregatedData(scale, filterFn = () => true) {
    const filteredRows = rawParsedWeather.filter(filterFn);
    let groupByFn;
    let parseKeyFn;

    if (scale === "year") {
        groupByFn = d => d.year;
        parseKeyFn = k => new Date(parseInt(k), 0, 1);
    } else if (scale === "month") {
        groupByFn = d => d.yearMonth;
        parseKeyFn = k => d3.timeParse("%Y-%m")(k);
    } else { // "day"
        groupByFn = d => d.dayStr;
        parseKeyFn = k => d3.timeParse("%Y-%m-%d")(k);
    }

    const rolledUpData = d3.rollups(
        filteredRows,
        v => d3.mean(v, d => d.tempMean),
        d => d.city,
        groupByFn
    );

    const formattedData = [];
    for (const [city, timeBuckets] of rolledUpData) {
        for (const [key, meanTemp] of timeBuckets) {
            const dateObj = parseKeyFn(key);
            if (dateObj) {
                formattedData.push({
                    city: city,
                    date: dateObj,
                    temp: +meanTemp.toFixed(2)
                });
            }
        }
    }

    return formattedData.sort((a, b) => a.date - b.date);
}

// Count extreme days for each city and year.
function getAnnualExtremeData() {
    const groupedData = d3.rollups(
        rawParsedWeather,
        rows => ({
            hotDays: rows.filter(d => d.tempMax > 35).length,
            heavyRainDays: rows.filter(d => d.precipitation > 50).length
        }),
        d => d.city,
        d => Number(d.year)
    );

    const annualData = [];
    for (const [city, years] of groupedData) {
        for (const [year, counts] of years) {
            annualData.push({
                city: city,
                year: year,
                hotDays: counts.hotDays,
                heavyRainDays: counts.heavyRainDays
            });
        }
    }

    return annualData.sort((a, b) => a.year - b.year);
}
