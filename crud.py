import pulp
from models import OptimizeRequest


def run_lp(req: OptimizeRequest) -> dict:
    hours = list(range(24))

    def tariff(h):
        return req.day_tariff if 6 <= h < 22 else req.night_tariff

    prob = pulp.LpProblem("SolarOpt", pulp.LpMinimize)

    buy  = [pulp.LpVariable(f"buy_{h}",  lowBound=0) for h in hours]
    sell = [pulp.LpVariable(f"sell_{h}", lowBound=0) for h in hours]

    has_battery = req.battery is not None

    if has_battery:
        bat = req.battery
        charge    = [pulp.LpVariable(f"ch_{h}",  lowBound=0) for h in hours]
        discharge = [pulp.LpVariable(f"dis_{h}", lowBound=0) for h in hours]
        soc       = [pulp.LpVariable(f"soc_{h}", lowBound=0, upBound=bat.capacity) for h in hours]

        prob += pulp.lpSum(
            buy[h] * tariff(h)
            - sell[h] * req.sell_price
            + discharge[h] * bat.degradation_cost
            for h in hours
        )

        for h in hours:
            prob += (
                req.solar[h] + buy[h] + discharge[h]
                == req.load[h] + sell[h] + charge[h]
            )

        for h in hours:
            if h == 0:
                prob += soc[h] == bat.initial_soc + bat.charge_efficiency * charge[h] - (1 / bat.discharge_efficiency) * discharge[h]
            else:
                prob += soc[h] == soc[h-1] + bat.charge_efficiency * charge[h] - (1 / bat.discharge_efficiency) * discharge[h]

    else:
        prob += pulp.lpSum(
            buy[h] * tariff(h) - sell[h] * req.sell_price for h in hours
        )
        for h in hours:
            prob += buy[h] + req.solar[h] - sell[h] == req.load[h]

    prob.solve(pulp.PULP_CBC_CMD(msg=0))

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
        row = {
            "hour":   h,
            "period": "Day" if 6 <= h < 22 else "Night",
            "load":   round(req.load[h], 2),
            "solar":  round(req.solar[h], 2),
            "buy":    round(pulp.value(buy[h]), 2),
            "sell":   round(pulp.value(sell[h]), 2),
            "tariff": tariff(h),
        }
        if has_battery:
            row["charge"]    = round(pulp.value(charge[h]), 2)
            row["discharge"] = round(pulp.value(discharge[h]), 2)
            row["soc"]       = round(pulp.value(soc[h]), 2)
        hour_data.append(row)

    result = {
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
        "has_battery":    has_battery,
    }

    if has_battery:
        result["total_charged"]    = round(sum(pulp.value(charge[h])    for h in hours), 2)
        result["total_discharged"] = round(sum(pulp.value(discharge[h]) for h in hours), 2)

    return result
