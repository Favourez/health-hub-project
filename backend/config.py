import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Application configuration"""
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_USER = os.getenv('DB_USER', 'root')
    DB_PASSWORD = os.getenv('DB_PASSWORD', 'R1O3o5t.@')
    DB_NAME = os.getenv('DB_NAME', 'healthhub')
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'healthhub_secret_key_2024_secure_random_string')
    JWT_ACCESS_TOKEN_EXPIRES = 86400  # 24 hours

