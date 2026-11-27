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
