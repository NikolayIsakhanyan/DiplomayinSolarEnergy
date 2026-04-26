from fastapi import APIRouter
from models import OptimizeRequest
from crud import run_lp

router = APIRouter()


@router.post("/optimize")
def optimize(req: OptimizeRequest):
    return run_lp(req)
