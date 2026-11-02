"""EDA for Research Question 1: temperatures and daily temperature changes
in Hanoi, Da Nang and Ho Chi Minh City (2015-2025).

Run from the repository root:  python3 report/eda.py
Writes figures to report/figures/ and summary numbers to report/stats.txt.
"""
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats

ROOT = Path(__file__).resolve().parent
FIG = ROOT / "figures"
FIG.mkdir(exist_ok=True)

CITIES = ["Hanoi", "Da Nang", "Ho Chi Minh City"]
COLORS = {"Hanoi": "#0284C7", "Da Nang": "#D97706", "Ho Chi Minh City": "#D93856"}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

plt.rcParams.update({
    "figure.dpi": 150, "savefig.bbox": "tight", "font.size": 9,
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": "#e2e8f0", "grid.linestyle": "--",
})

# ---------------------------------------------------------------- load & clean
df = pd.read_csv(ROOT.parent / "data" / "dailyweather_hanoi_danang_hcm.csv", parse_dates=["time"])
df["city"] = df["location_id"].map(dict(enumerate(CITIES)))
df = df.rename(columns={
    "temperature_2m_mean": "tmean", "temperature_2m_max": "tmax", "temperature_2m_min": "tmin",
    "relative_humidity_2m_mean": "rh", "precipitation_sum": "precip",
})
df["dtr"] = df["tmax"] - df["tmin"]                 # diurnal temperature range
df["sun_h"] = df["sunshine_duration"] / 3600
df["daylight_h"] = df["daylight_duration"] / 3600
df["year"] = df["time"].dt.year
df["month"] = df["time"].dt.month
df = df.sort_values(["city", "time"])
df["dT"] = df.groupby("city")["tmean"].diff()        # day-to-day change of the mean

out = []
def log(*parts):
    out.append(" ".join(str(p) for p in parts))

log("rows", len(df), "range", df.time.min().date(), "-", df.time.max().date())
log("missing values", int(df.isna().sum().sum() - df["dT"].isna().sum()))
for c, g in df.groupby("city"):
    full = pd.date_range(g.time.min(), g.time.max())
    log(c, "missing dates", len(full) - len(g), "duplicates", int(g.time.duplicated().sum()))
log("tmin > tmean or tmax < tmean:", int(((df.tmin > df.tmean) | (df.tmax < df.tmean)).sum()))

# ---------------------------------------------------------------- summaries
summary = df.groupby("city")[["tmean", "tmax", "tmin", "dtr"]].agg(["mean", "std", "min", "median", "max"])
log("\nSUMMARY\n" + summary.loc[CITIES].round(2).to_string())

clim = df.groupby(["city", "month"])[["tmean", "tmax", "tmin", "dtr", "rh", "sun_h", "daylight_h", "precip"]].mean()
amp = clim["tmean"].groupby("city").agg(lambda s: s.max() - s.min())
log("\nSeasonal amplitude (warmest - coldest month):", amp.round(1).to_dict())
log("Monthly mean T\n" + clim["tmean"].unstack().loc[CITIES].round(1).to_string())
log("Monthly median DTR\n" + df.groupby(["city", "month"]).dtr.median().unstack().loc[CITIES].round(1).to_string())

log("\nDay-to-day |dT| mean:", df.groupby("city").dT.apply(lambda s: s.abs().mean()).round(2).to_dict())
log("Day-to-day dT std:", df.groupby("city").dT.std().round(2).to_dict())
log("Drops of >= 4 C in one day:", df[df.dT <= -4].groupby("city").size().to_dict())
log("Days with Tmin < 15 C:", df[df.tmin < 15].groupby("city").size().to_dict())

kw_t = stats.kruskal(*[df.loc[df.city == c, "tmean"] for c in CITIES])
kw_d = stats.kruskal(*[df.loc[df.city == c, "dtr"] for c in CITIES])
log("\nKruskal-Wallis Tmean H=%.0f p=%.1e ; DTR H=%.0f p=%.1e" % (kw_t.statistic, kw_t.pvalue, kw_d.statistic, kw_d.pvalue))

log("\nCorrelations with DTR (Pearson r / Spearman rho):")
for c in CITIES:
    g = df[df.city == c]
    for v in ["rh", "sun_h", "precip"]:
        log("  %-17s %-7s r=%.2f rho=%.2f" % (c, v, g[v].corr(g.dtr), g[v].corr(g.dtr, method="spearman")))
    log("  %-17s daylight vs Tmean r=%.2f" % (c, g.daylight_h.corr(g.tmean)))

yearly = df.groupby(["city", "year"])[["tmean", "tmax", "tmin", "dtr"]].mean().reset_index()
log("\nTrends per decade (OLS slope, p; Mann-Kendall tau, p):")
for c in CITIES:
    g = yearly[yearly.city == c]
    for v in ["tmean", "tmax", "tmin", "dtr"]:
        r = stats.linregress(g.year, g[v])
        tau = stats.kendalltau(g.year, g[v])
        log("  %-17s %-5s %+.2f C/decade p=%.3f  tau=%+.2f p=%.3f" % (c, v, r.slope * 10, r.pvalue, tau.statistic, tau.pvalue))

# El Niño: monthly anomalies vs. NOAA Oceanic Niño Index (ONI)
oni = pd.read_csv(ROOT.parent / "data" / "oni.csv")
oni["date"] = pd.to_datetime(dict(year=oni.year, month=oni.month, day=1))
oni = oni.set_index("date")["oni"]

monthly_anom = df.groupby(["city", "year", "month"]).agg(tmean=("tmean", "mean"), precip=("precip", "sum")).reset_index()
for v in ["tmean", "precip"]:
    monthly_anom[v + "_anom"] = monthly_anom[v] - monthly_anom.groupby(["city", "month"])[v].transform("mean")
monthly_anom["date"] = pd.to_datetime(dict(year=monthly_anom.year, month=monthly_anom.month, day=1))

log("\nEl Nino: correlation of monthly anomaly with ONI n months earlier:")
for c in CITIES:
    g = monthly_anom[monthly_anom.city == c]
    rs = [np.corrcoef(oni.shift(lag, freq="MS").reindex(g.date), g.tmean_anom)[0, 1] for lag in [0, 2, 4, 6]]
    log("  %-17s lag0 %.2f  lag2 %.2f  lag4 %.2f  lag6 %.2f" % (c, *rs))

LAG = 3
monthly_anom["oni_lag"] = oni.shift(LAG, freq="MS").reindex(monthly_anom.date).values
monthly_anom["phase"] = pd.cut(monthly_anom.oni_lag, [-9, -0.5, 0.5, 9], labels=["La Nina", "Neutral", "El Nino"], right=False)
monthly_anom["season"] = monthly_anom.month.map(lambda m: "Dec-Feb" if m in (12, 1, 2) else "Mar-May" if m <= 5 else "Jun-Aug" if m <= 8 else "Sep-Nov")
log(f"Mean anomaly by phase (ONI {LAG} months earlier):")
log(monthly_anom.pivot_table(index="city", columns="phase", values="tmean_anom", observed=True).loc[CITIES].round(2).to_string())
log("Rain anomaly (mm/month) by phase:")
log(monthly_anom.pivot_table(index="city", columns="phase", values="precip_anom", observed=True).loc[CITIES].round(1).to_string())
log("Temperature anomaly by season and phase (all cities):")
log(monthly_anom.pivot_table(index="season", columns="phase", values="tmean_anom", observed=True).round(2).to_string())
log("Months per phase:", monthly_anom[monthly_anom.city == "Hanoi"].phase.value_counts().to_dict())

(ROOT / "stats.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))

# ---------------------------------------------------------------- figures
def save(fig, name):
    fig.savefig(FIG / f"{name}.pdf")
    plt.close(fig)

# 1. Distributions: histogram + KDE of daily mean temperature and DTR
fig, axes = plt.subplots(1, 2, figsize=(7.2, 2.6))
for ax, col, label in [(axes[0], "tmean", "Daily mean temperature (°C)"), (axes[1], "dtr", "Daily range Tmax − Tmin (°C)")]:
    grid = np.linspace(df[col].min(), df[col].max(), 300)
    for c in CITIES:
        v = df.loc[df.city == c, col]
        ax.hist(v, bins=40, density=True, color=COLORS[c], alpha=0.18)
        ax.plot(grid, stats.gaussian_kde(v)(grid), color=COLORS[c], lw=1.6, label=c)
    ax.set_xlabel(label)
    ax.set_ylabel("Density")
axes[0].legend(frameon=False)
save(fig, "distributions")

# 2. Seasonal cycle: monthly mean with Tmin-Tmax band
fig, ax = plt.subplots(figsize=(7.2, 3.0))
x = np.arange(1, 13)
for c in CITIES:
    m = clim.loc[c]
    ax.fill_between(x, m.tmin, m.tmax, color=COLORS[c], alpha=0.12, lw=0)
    ax.plot(x, m.tmean, color=COLORS[c], lw=2, marker="o", ms=3, label=c)
ax.set_xticks(x, MONTHS)
ax.set_ylabel("Temperature (°C)")
ax.legend(frameon=False, ncol=3, loc="lower center")
save(fig, "seasonal_cycle")

# 3. Monthly DTR box plots as small multiples (shared y axis)
fig, axes = plt.subplots(1, 3, figsize=(7.2, 2.6), sharey=True)
for ax, c in zip(axes, CITIES):
    data = [df.loc[(df.city == c) & (df.month == m), "dtr"] for m in x]
    ax.boxplot(data, widths=0.6, patch_artist=True,
               boxprops=dict(facecolor=COLORS[c], alpha=0.35, color=COLORS[c]),
               medianprops=dict(color=COLORS[c], lw=1.6), whiskerprops=dict(color=COLORS[c]),
               capprops=dict(color=COLORS[c]),
               flierprops=dict(marker=".", ms=2, markerfacecolor=COLORS[c], markeredgecolor="none"))
    ax.set_xticks(x, [m[0] for m in MONTHS])
    ax.set_title(c, fontsize=9)
axes[0].set_ylabel("Daily range (°C)")
save(fig, "dtr_boxplots")

# 4. Year x month heatmap of temperature anomaly (vs. 10-year monthly mean)
monthly = df.groupby(["city", "year", "month"]).tmean.mean()
anom = monthly - monthly.groupby(["city", "month"]).transform("mean")
lim = np.abs(anom).max()
fig, axes = plt.subplots(1, 3, figsize=(7.2, 2.6), sharey=True)
for ax, c in zip(axes, CITIES):
    im = ax.imshow(anom.loc[c].unstack(), cmap="RdBu_r", vmin=-lim, vmax=lim, aspect="auto")
    ax.set_xticks(range(12), [m[0] for m in MONTHS])
    ax.set_yticks(range(11), range(2015, 2026))
    ax.set_title(c, fontsize=9)
    ax.grid(False)
fig.colorbar(im, ax=axes, label="Anomaly (°C)", shrink=0.9)
save(fig, "anomaly_heatmap")

# 5. Drivers: humidity and sunshine vs DTR (small multiples)
fig, axes = plt.subplots(2, 3, figsize=(7.2, 4.6), sharey=True)
for col, c in enumerate(CITIES):
    g = df[df.city == c]
    for row, (v, label) in enumerate([("rh", "Mean relative humidity (%)"), ("sun_h", "Sunshine (h/day)")]):
        ax = axes[row, col]
        ax.scatter(g[v], g.dtr, s=2, color=COLORS[c], alpha=0.15, lw=0)
        slope, intercept = np.polyfit(g[v], g.dtr, 1)
        xs = np.array([g[v].min(), g[v].max()])
        ax.plot(xs, slope * xs + intercept, color="#1e293b", lw=1)
        ax.text(0.03, 0.92, f"r = {g[v].corr(g.dtr):.2f}", transform=ax.transAxes)
        ax.set_xlabel(label)
        if row == 0:
            ax.set_title(c, fontsize=9)
    axes[0, 0].set_ylabel("Daily range (°C)")
    axes[1, 0].set_ylabel("Daily range (°C)")
fig.tight_layout()
save(fig, "drivers_scatter")

# 6. Monthly humidity and sunshine climatology
fig, axes = plt.subplots(1, 2, figsize=(7.2, 2.4))
for c in CITIES:
    axes[0].plot(x, clim.loc[c].rh, color=COLORS[c], marker="o", ms=3, label=c)
    axes[1].plot(x, clim.loc[c].sun_h, color=COLORS[c], marker="o", ms=3)
axes[0].set_ylabel("Relative humidity (%)")
axes[1].set_ylabel("Sunshine (h/day)")
for ax in axes:
    ax.set_xticks(x, [m[0] for m in MONTHS])
axes[0].legend(frameon=False, fontsize=7)
save(fig, "humidity_sunshine")

# 7. Day-to-day change distribution
fig, ax = plt.subplots(figsize=(7.2, 2.4))
ax.boxplot([df.loc[df.city == c, "dT"].dropna() for c in CITIES], vert=False, widths=0.5,
           tick_labels=CITIES, flierprops=dict(marker=".", ms=2))
ax.set_xlabel("Change of daily mean temperature vs. previous day (°C)")
save(fig, "day_to_day")

# 8. Annual means with linear trend
fig, axes = plt.subplots(1, 2, figsize=(7.2, 2.5))
for c in CITIES:
    g = yearly[yearly.city == c]
    for ax, v in zip(axes, ["tmean", "dtr"]):
        ax.plot(g.year, g[v], color=COLORS[c], marker="o", ms=3, label=c)
        r = stats.linregress(g.year, g[v])
        ax.plot(g.year, r.intercept + r.slope * g.year, color=COLORS[c], lw=0.8, ls="--")
axes[0].set_ylabel("Annual mean temperature (°C)")
axes[1].set_ylabel("Annual mean daily range (°C)")
axes[0].legend(frameon=False, fontsize=7)
save(fig, "annual_trends")

# 9. El Niño timeline: 3-month mean anomaly with El Niño / La Niña months shaded
fig, ax = plt.subplots(figsize=(7.2, 2.8))
for date, value in oni["2015":"2025"].items():
    if abs(value) >= 0.5:
        ax.axvspan(date, date + pd.offsets.MonthBegin(1), color="#fecaca" if value > 0 else "#bfdbfe", lw=0)
for c in CITIES:
    g = monthly_anom[monthly_anom.city == c].set_index("date").tmean_anom
    ax.plot(g.index, g.rolling(3, center=True, min_periods=1).mean(), color=COLORS[c], lw=1.4, label=c)
ax.axhline(0, color="#94a3b8", lw=0.8)
ax.set_ylabel("Temperature anomaly (°C)")
ax.legend(frameon=False, ncol=3, fontsize=7, loc="lower left")
save(fig, "elnino")
