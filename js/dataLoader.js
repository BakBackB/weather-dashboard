let rawParsedWeather = [];

async function loadWeatherData() {
    try {
        const [locationData, weatherData] = await Promise.all([
            d3.csv("data/location.csv"),
            d3.csv("data/dailyweather_hanoi_danang_hcm.csv")
        ]);

        console.log("csv data loaded successfully:", { locationData, weatherData });

        const cityMapping = {
            "0": "Hanoi",
            "1": "Da Nang",
            "2": "Ho Chi Minh City"
        };

        rawParsedWeather = weatherData.map(d => {
            const parsedDate = parseDateYYYYMMDD(d.time);
            return {
                locationId: d.location_id,
                city: cityMapping[d.location_id] || `Location ${d.location_id}`,
                date: parsedDate,
                year: parsedDate ? parsedDate.getFullYear().toString() : null,
                yearMonth: parsedDate ? d3.timeFormat("%Y-%m")(parsedDate) : null,
                yearWeek: parsedDate ? `${parsedDate.getFullYear()}-W${String(Math.min(52, Math.ceil(d3.timeDay.count(d3.timeYear(parsedDate), parsedDate) / 7))).padStart(2, '0')}` : null,
                dayStr: parsedDate ? d3.timeFormat("%Y-%m-%d")(parsedDate) : null,
                tempMean: Number(d.temperature_2m_mean)
            };
        }).filter(d => d.date !== null && !isNaN(d.tempMean));

        return getFilteredAggregatedData("year"); // Default view starts at Yearly overview
    } catch (error) {
        console.error("Error loading weather data:", error);
        return [];
    }
}
