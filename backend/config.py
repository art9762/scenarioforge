from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    trinity_api_key: str = ""
    trinity_aurora_url: str = "https://gate.trinity.tg/aurora/v1"
    trinity_orion_url: str = "https://gate.trinity.tg/orion/v1"
    storage_dir: str = "./data"
    host: str = "0.0.0.0"
    port: int = 8000

    class Config:
        env_file = ".env"


settings = Settings()

AVAILABLE_MODELS = [
    {"id": "claude-haiku-4-5", "provider": "aurora", "name": "Claude Haiku 4.5"},
    {"id": "claude-sonnet-4-6", "provider": "aurora", "name": "Claude Sonnet 4.6"},
    {"id": "claude-opus-4-6", "provider": "aurora", "name": "Claude Opus 4.6"},
    {"id": "gpt-5.2", "provider": "orion", "name": "GPT 5.2"},
]

DEPTH_MODES = {
    "fast": {
        "name": "Fast",
        "iterations": 1,
        "agents": ["director", "screenwriter"],
        "default_models": {
            "director": "claude-haiku-4-5",
            "screenwriter": "claude-haiku-4-5",
            "visual_director": "claude-haiku-4-5",
            "copywriter": "claude-haiku-4-5",
            "editor": "claude-haiku-4-5",
        },
    },
    "standard": {
        "name": "Standard",
        "iterations": 2,
        "agents": ["director", "screenwriter", "visual_director", "copywriter", "editor"],
        "default_models": {
            "director": "claude-sonnet-4-6",
            "screenwriter": "claude-sonnet-4-6",
            "visual_director": "claude-sonnet-4-6",
            "copywriter": "claude-sonnet-4-6",
            "editor": "claude-sonnet-4-6",
        },
    },
    "deep": {
        "name": "Deep",
        "iterations": 3,
        "agents": ["director", "screenwriter", "visual_director", "copywriter", "editor"],
        "default_models": {
            "director": "claude-opus-4-6",
            "screenwriter": "claude-opus-4-6",
            "visual_director": "claude-sonnet-4-6",
            "copywriter": "claude-opus-4-6",
            "editor": "claude-opus-4-6",
        },
    },
}
