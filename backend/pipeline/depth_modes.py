from backend.config import DEPTH_MODES


def get_depth_mode(mode: str) -> dict:
    return DEPTH_MODES.get(mode, DEPTH_MODES["standard"])
