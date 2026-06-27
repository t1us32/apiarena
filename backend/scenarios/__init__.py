from .definitions import SCENARIOS
from .definitions import ScenarioDef

__all__ = ["SCENARIOS", "ScenarioDef", "get_scenario", "list_scenarios"]


def get_scenario(scenario_id: str) -> ScenarioDef | None:
    return SCENARIOS.get(scenario_id)


def list_scenarios() -> list[ScenarioDef]:
    return list(SCENARIOS.values())
