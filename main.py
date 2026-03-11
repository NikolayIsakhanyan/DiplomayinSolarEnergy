from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List
import pulp
import os

app = FastAPI()

class OptimizeRequest(BaseModel):
    day_tariff: float
    night_tariff: float
    sell_price: float
    load: List[float]
    solar: List[float]

@app.get("/", response_class=HTMLResponse)
def index():
    with open("index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.post("/optimize")
def optimize(req: OptimizeRequest):
    hours = list(range(24))

    def tariff(h):
        return req.day_tariff if 6 <= h < 22 else req.night_tariff

    # LP problem
    prob = pulp.LpProblem("SolarOpt", pulp.LpMinimize)

    buy  = [pulp.LpVariable(f"buy_{h}",  lowBound=0) for h in hours]
    sell = [pulp.LpVariable(f"sell_{h}", lowBound=0) for h in hours]

    # Objective: minimize cost of buying - revenue from selling
    prob += pulp.lpSum(
        buy[h] * tariff(h) - sell[h] * req.sell_price for h in hours
    )

    # Constraints: energy balance each hour
    for h in hours:
        prob += buy[h] + req.solar[h] - sell[h] == req.load[h]

    prob.solve(pulp.PULP_CBC_CMD(msg=0))

    # Results
    total_bought = round(sum(pulp.value(buy[h])  for h in hours), 2)
    total_sold   = round(sum(pulp.value(sell[h]) for h in hours), 2)
    total_solar  = round(sum(req.solar), 2)

    optimized_cost = round(sum(
        pulp.value(buy[h]) * tariff(h) - pulp.value(sell[h]) * req.sell_price
        for h in hours
    ), 2)

    baseline_cost = round(sum(req.load[h] * tariff(h) for h in hours), 2)
    savings       = round(baseline_cost - optimized_cost, 2)
    sell_revenue  = round(total_sold * req.sell_price, 2)
    savings_pct   = round((savings / baseline_cost) * 100, 1) if baseline_cost else 0

    hour_data = []
    for h in hours:
        hour_data.append({
            "hour":   h,
            "period": "Day" if 6 <= h < 22 else "Night",
            "load":   round(req.load[h], 2),
            "solar":  round(req.solar[h], 2),
            "buy":    round(pulp.value(buy[h]), 2),
            "sell":   round(pulp.value(sell[h]), 2),
            "tariff": tariff(h),
        })



    if __name__ == "__main__":
            import uvicorn
            uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

    return {
        "status":         pulp.LpStatus[prob.status],
        "baseline_cost":  baseline_cost,
        "optimized_cost": optimized_cost,
        "savings":        savings,
        "savings_pct":    savings_pct,
        "sell_revenue":   sell_revenue,
        "total_solar":    total_solar,
        "total_bought":   total_bought,
        "total_sold":     total_sold,
        "hours":          hour_data,
    }