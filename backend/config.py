import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "AI Arena"
    debug: bool = True
    default_temperature: float = 0.7
    default_max_tokens: int = 2048

    class Config:
        env_file = ".env"


settings = Settings()
