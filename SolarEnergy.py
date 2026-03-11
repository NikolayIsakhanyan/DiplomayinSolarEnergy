import pulp as pl
import pandas as pd

n = 24

C = []
for i in range(n):
    if 6 <= i < 22:  #
        C.append(48.48)
    else:
        C.append(38.48)

Cp = [18]*24

q = [5,5,6,7,8,9,10,11,9,8,7,6,
     5,5,6,7,8,9,10,11,9,8,7,6]


r = [0,0,0,0,0,0,
     1,2,4,6,8,10,10,8,6,4,2,1,
     0,0,0,0,0,0]

model = pl.LpProblem("OnGrid_simplex", pl.LpMinimize)

G = pl.LpVariable.dicts("G", range(n), lowBound=0)   # Grid buy
S = pl.LpVariable.dicts("S", range(n), lowBound=0)   # Grid sell

model += pl.lpSum([C[i] * G[i] - Cp[i] * S[i] for i in range(n)])

for i in range(n):
    model += q[i] + G[i] == r[i] + S[i]

print("Լուծում է խնդիրը...")
model.solve(pl.PULP_CBC_CMD(msg=0))

baseline_cost = sum(q[i] * C[i] for i in range(n))
optimized_cost = pl.value(model.objective)
savings = baseline_cost - optimized_cost

time_period = []
for i in range(n):
    if 6 <= i < 22:
        time_period.append("Ցերեկ")
    else:
        time_period.append("Գիշեր")

result = pd.DataFrame({
    "Ժամ": list(range(0, n)),
    "Ժամանակ": time_period,
    "Բեռ (q)": q,
    "PV (r)": r,
    "Գնել (G)": [round(G[i].value(), 2) if G[i].value() else 0 for i in range(n)],
    "Վաճառել (S)": [round(S[i].value(), 2) if S[i].value() else 0 for i in range(n)],
    "Գնման գին": C,
    "Վաճառքի գին": Cp
})


print("\n" + "="*90)
print("ԱՐԴՅՈՒՆՔՆԵՐ - ON-GRID ԱՐԵՎԱՅԻՆ ՀԱՄԱԿԱՐԳ")
print("="*90)
print(result.to_string(index=False))
print("\n" + "="*90)
print(f"Բազային ծախս (առանց արեվային): {baseline_cost:.2f} AMD")
print(f"Օպտիմալացված ծախս: {optimized_cost:.2f} AMD")
print(f"Խնայողություն: {savings:.2f} AMD")
print(f"Խնայողություն %: {(savings/baseline_cost*100):.2f}%")
print("="*90)
print("\nՏԱՐԻՖՆԵՐ:")
print("  • Ցերեկ (06:00-22:00): 48.48 AMD/kWh")
print("  • Գիշեր (22:00-06:00): 38.48 AMD/kWh")
print("  • Վաճառք: 18.00 AMD/kWh")
print("\nՊԱՆԵԼԻ ԱՐՏԱԴՐԱՆՔ:")
print("  • Գիշեր (0-5, 18-23): 0 kWh (չկա արևային լույս)")
print("  • Ցերեկ (6-17): 1-10 kWh (արևային արտադրություն)")
print("="*90)

input("\nԽնդրում եմ սեղմեք Enter՝ ավարտելու համար...")