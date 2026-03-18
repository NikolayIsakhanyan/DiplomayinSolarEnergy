from typing import List, Optional
from pydantic import BaseModel


class BatteryConfig(BaseModel):
    capacity: float
    initial_soc: float
    charge_efficiency: float = 0.95
    discharge_efficiency: float = 0.95
    degradation_cost: float


class OptimizeRequest(BaseModel):
    day_tariff: float
    night_tariff: float
    sell_price: float
    load: List[float]
    solar: List[float]
    battery: Optional[BatteryConfig] = None
