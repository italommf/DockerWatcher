"""
WSGI config for docker_watcher project.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'docker_watcher.settings')

application = get_wsgi_application()

