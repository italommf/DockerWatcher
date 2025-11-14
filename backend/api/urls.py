from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views import jobs, rpas, cronjobs, deployments, pods, executions, connection, config

router = DefaultRouter()
router.register(r'jobs', jobs.JobViewSet, basename='job')
router.register(r'rpas', rpas.RPAViewSet, basename='rpa')
router.register(r'cronjobs', cronjobs.CronjobViewSet, basename='cronjob')
router.register(r'deployments', deployments.DeploymentViewSet, basename='deployment')
router.register(r'pods', pods.PodViewSet, basename='pod')
router.register(r'executions', executions.ExecutionViewSet, basename='execution')

urlpatterns = [
    path('', include(router.urls)),
    path('connection/status/', connection.connection_status, name='connection-status'),
    path('connection/reload/', connection.reload_services, name='connection-reload'),
    path('config/', config.get_config, name='config-get'),
    path('config/save/', config.save_config, name='config-save'),
]

