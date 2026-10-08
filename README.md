# Cross-Regional Weather Dynamics in Vietnam

> Interactive Data Visualization Dashboard using **HTML**, **CSS**, **JavaScript**, and **D3.js**

## Project Overview

Vietnam experiences diverse climate conditions across its three major regions. Northern Vietnam has cold winters, Central Vietnam is heavily influenced by monsoon storms, while Southern Vietnam remains warm throughout the year.

This project explores **10 years of historical weather data (2015–2025)** from three representative cities:

- Hanoi (Northern Vietnam)
- Da Nang (Central Vietnam)
- Ho Chi Minh City (Southern Vietnam)

Using interactive visualizations built with **D3.js**, the dashboard allows users to compare weather patterns, discover regional differences, and investigate the environmental factors behind those differences.

---

## Research Questions

### RQ1. Temperature Dynamics

- How do temperatures compare across Hanoi, Da Nang, and Ho Chi Minh City?
- How do daily temperature variations differ between regions?

### RQ2. Rainy Season Characteristics

- How do rainy seasons differ in:
  - Timing
  - Duration
  - Rainfall intensity

### RQ3. Extreme Weather Trends

- Are extreme heat days (>35°C) and heavy rainfall events (>50 mm) becoming more frequent over time?

---

# Dataset

## Source

Open-Meteo Historical Weather API

https://open-meteo.com/en/docs/historical-weather-api

## Time Range

2015 – 2025 (Daily observations)

## Locations

| City | Latitude | Longitude |
|-------|----------|-----------|
| Hanoi | 21.0285 | 105.8542 |
| Da Nang | 16.0544 | 108.2022 |
| Ho Chi Minh City | 10.8231 | 106.6297 |

---

# Weather Variables

## Temperature

- Mean Temperature
- Maximum Temperature
- Minimum Temperature

## Apparent Temperature

- Mean Apparent Temperature
- Maximum Apparent Temperature
- Minimum Apparent Temperature

## Rainfall

- Daily Precipitation
- Precipitation Duration

## Wind

- Maximum Wind Speed
- Minimum Wind Speed
- Dominant Wind Direction

## Humidity

- Mean Relative Humidity

## Solar Information

- Sunshine Duration
- Daylight Duration

## Weather Classification

- Weather Code

---

# Project Objectives

The dashboard aims to:

- Compare regional climate characteristics
- Identify seasonal weather patterns
- Analyze rainfall distribution
- Detect long-term climate trends
- Explain weather differences through humidity, sunlight, and wind conditions
- Provide interactive exploration instead of static charts

---

# Dashboard Features

## Temperature Analysis

### Primary Visualizations

- Multi-Line Chart
- Monthly Boxplots

### Supporting Analytics

- Sunshine vs Temperature Dual-Axis Chart
- Humidity vs Daily Temperature Range Scatter Plot

---

## Rainfall Analysis

### Primary Visualizations

- Calendar Heatmap
- Monthly Rainfall Bar Chart

### Supporting Analytics

- Humidity & Rainfall Trend Chart
- Drill-down Rainfall Duration View

---

## Extreme Weather Analysis

### Primary Visualizations

- Annual Trend Lines
- Threshold Frequency Bar Chart

### Supporting Analytics

- Apparent Temperature Heatmap
- Storm Driver Visualization
  - Wind Speed
  - Wind Direction
  - Sunshine Reduction

---

## Advanced Analytics

Interactive Correlation Dashboard featuring:

- Scatter Plot
- Linked Views
- Brushing & Filtering
- Seasonal Selection
- City Selection
- Year Selection
- Drill-down from Monthly to Daily Records

---

# Technology Stack

| Technology | Purpose |
|------------|---------|
| HTML5 | Page Structure |
| CSS3 | Styling |
| JavaScript (ES6+) | Application Logic |
| D3.js | Data Visualization |
| Git & GitHub | Version Control |
| Open-Meteo API | Weather Data Source |

---

# Project Structure

```
weather-dashboard/
│
├── data/
│   ├── raw/
│   ├── processed/
│   └── metadata/
│
├── css/
│   ├── style.css
│   └── dashboard.css
│
├── js/
│   ├── main.js
│   ├── dataLoader.js
│   ├── filters.js
│   ├── utils.js
│   └── charts/
│
├── assets/
│   ├── icons/
│   └── images/
│
├── index.html
├── README.md
└── LICENSE
```

---

# Data Processing Workflow

1. Retrieve weather data from Open-Meteo API.
2. Clean missing or invalid observations.
3. Convert dates into year/month/day features.
4. Calculate derived variables such as:
   - Daily Temperature Range
   - Hot Days (>35°C)
   - Heavy Rainfall Days (>50 mm)
5. Store processed datasets.
6. Render interactive visualizations with D3.js.

---

# Expected Insights

The dashboard is expected to reveal:

- Distinct seasonal temperature patterns across Vietnam.
- Differences in rainy season timing between the three regions.
- Relationships between humidity and apparent temperature.
- Connections between sunlight duration and temperature.
- Increasing trends in extreme weather events.
- Meteorological factors contributing to storms and heatwaves.

---

# Team Members

| Member | Role |
|--------|------|
| **Trần Minh Phúc** | Project Coordinator & Data Engineer |
| **Eva Wimmer** | Visualization Developer (RQ1) |
| **Dương Minh Chính** | Visualization Developer (RQ2) |
| **Evgeniia Kazakova** | Visualization Developer (RQ3 & UI) |

---

# Development Timeline

| Weeks | Tasks |
|--------|-------|
| Week 1–3 | Data Collection & Cleaning |
| Week 3–6 | Visualization Development |
| Week 3–7 | Dashboard Integration |
| Final Week | Testing, Presentation, Demo |

---

# Future Improvements

Potential extensions include:

- Additional Vietnamese provinces
- Hourly weather analysis
- Climate anomaly detection
- Machine learning-based weather clustering
- Predictive weather trend visualization
- Mobile-responsive dashboard
- Dark mode support

---

# References

Open-Meteo Historical Weather API

https://open-meteo.com/en/docs/historical-weather-api

Vietnam Tourism – Climate Overview

https://www.vietnamtourism.com/en/weather

---

# License

This project was developed as part of the **Data Science and Data Visualization** course at **Vietnam National University Ho Chi Minh City – International University**.

For educational purposes only.
