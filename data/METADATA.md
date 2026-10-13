# Dataset Metadata

## Dataset Name

**dailyweather_hcm_hue_hanoi.csv**

---

# Dataset Description

This dataset contains daily historical weather observations collected from the Open-Meteo Historical Weather API for three Vietnamese cities over a 10-year period. Each row represents the weather conditions of one city on one specific day.

---

# Dataset Structure

| Property | Value |
|----------|-------|
| File Format | CSV |
| Number of Columns | 17 |
| Observation Unit | One city on one day |
| Temporal Resolution | Daily |
| Date Column | `time` |
| Geographic Coverage | Three Vietnamese cities |
| Missing Values | None expected after preprocessing |

---

# Column Metadata

| Column Name | Data Type | Unit | Description |
|-------------|-----------|------|-------------|
| `location_id` | Integer | - | Identifier of the observation location. |
| `time` | Date (String) | DD/MM/YYYY | Observation date. |
| `weather_code (wmo code)` | Integer | WMO Code | Daily weather condition according to the WMO Weather Interpretation Codes. |
| `temperature_2m_mean (°C)` | Float | °C | Daily mean air temperature measured at 2 meters above ground. |
| `temperature_2m_max (°C)` | Float | °C | Maximum daily air temperature at 2 meters. |
| `temperature_2m_min (°C)` | Float | °C | Minimum daily air temperature at 2 meters. |
| `apparent_temperature_mean (°C)` | Float | °C | Daily average apparent ("feels like") temperature. |
| `apparent_temperature_max (°C)` | Float | °C | Maximum apparent temperature recorded during the day. |
| `apparent_temperature_min (°C)` | Float | °C | Minimum apparent temperature recorded during the day. |
| `precipitation_sum (mm)` | Float | mm | Total daily precipitation. |
| `precipitation_hours (h)` | Integer | Hours | Total number of hours with measurable precipitation. |
| `wind_speed_10m_max (km/h)` | Float | km/h | Maximum wind speed measured at 10 meters above ground. |
| `wind_speed_10m_min (km/h)` | Float | km/h | Minimum wind speed measured at 10 meters above ground. |
| `winddirection_10m_dominant (°)` | Integer | Degrees | Dominant wind direction during the day (0°–360°). |
| `relative_humidity_2m_mean (%)` | Integer | % | Average daily relative humidity at 2 meters. |
| `sunshine_duration (s)` | Float | Seconds | Total sunshine duration during the day. |
| `daylight_duration (s)` | Float | Seconds | Total daylight duration between sunrise and sunset. |

---

# Data Type Summary

| Data Type | Columns |
|-----------|---------|
| Integer | `location_id`, `weather_code (wmo code)`, `precipitation_hours (h)`, `winddirection_10m_dominant (°)`, `relative_humidity_2m_mean (%)` |
| Float | `temperature_2m_mean (°C)`, `temperature_2m_max (°C)`, `temperature_2m_min (°C)`, `apparent_temperature_mean (°C)`, `apparent_temperature_max (°C)`, `apparent_temperature_min (°C)`, `precipitation_sum (mm)`, `wind_speed_10m_max (km/h)`, `wind_speed_10m_min (km/h)`, `sunshine_duration (s)`, `daylight_duration (s)` |
| Date | `time` |

---

# Variable Categories

### Identification
- `location_id`

### Temporal
- `time`

### Weather Classification
- `weather_code (wmo code)`

### Temperature
- `temperature_2m_mean (°C)`
- `temperature_2m_max (°C)`
- `temperature_2m_min (°C)`

### Apparent Temperature
- `apparent_temperature_mean (°C)`
- `apparent_temperature_max (°C)`
- `apparent_temperature_min (°C)`

### Precipitation
- `precipitation_sum (mm)`
- `precipitation_hours (h)`

### Wind
- `wind_speed_10m_max (km/h)`
- `wind_speed_10m_min (km/h)`
- `winddirection_10m_dominant (°)`

### Humidity
- `relative_humidity_2m_mean (%)`

### Solar Information
- `sunshine_duration (s)`
- `daylight_duration (s)`

---

# Units of Measurement

| Measurement | Unit |
|-------------|------|
| Temperature | °C |
| Apparent Temperature | °C |
| Precipitation | mm |
| Precipitation Duration | hours |
| Wind Speed | km/h |
| Wind Direction | degrees (0–360°) |
| Relative Humidity | % |
| Sunshine Duration | seconds |
| Daylight Duration | seconds |

---

# Notes

- Each record corresponds to one location for one calendar day.
- Temperature variables are measured at a height of 2 meters.
- Wind variables are measured at a height of 10 meters.
- Weather conditions follow the World Meteorological Organization (WMO) weather code standard.
- The `location_id` field is used as a numeric identifier for locations and should be mapped to the corresponding city names in the project documentation or application.
