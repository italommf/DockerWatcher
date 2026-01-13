#!/bin/bash
set -e

echo "=== Docker Watcher Backend - Iniciando ==="

# Aguardar um pouco para garantir que o sistema está pronto
sleep 2

# Executar migrações
echo "Executando migrações do banco de dados..."
python manage.py migrate --noinput || echo "Aviso: Erro ao executar migrações (pode ser normal se as tabelas já existem)"

# Verificar se deve usar Gunicorn
if [ "${USE_GUNICORN:-1}" = "1" ] && command -v gunicorn &> /dev/null; then
    echo "Iniciando servidor com Gunicorn..."
    exec gunicorn -c gunicorn.conf.py docker_watcher.wsgi:application
else
    echo "Iniciando servidor com start_server.py..."
    exec python start_server.py
fi

