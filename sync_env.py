import os
from dotenv import load_dotenv

# Load from .env
load_dotenv()

username = os.getenv("AIO_USERNAME", "YOUR_AIO_USERNAME")
key = os.getenv("AIO_KEY", "YOUR_AIO_KEY")

# 2. Write config.js for PWA
with open("webapp/config.js", "w") as f:
    f.write(f'const AIO_USERNAME = "{username}";\n')
    f.write(f'const AIO_KEY = "{key}";\n')

print("✅ Successfully synced .env to secrets.h and webapp/config.js")
