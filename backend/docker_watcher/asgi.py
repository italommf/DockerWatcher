"""
ASGI config for docker_watcher project.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'docker_watcher.settings')

application = get_asgi_application()

