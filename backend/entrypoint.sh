#!/bin/bash
set -e

echo "=== Docker Watcher Backend - Iniciando ==="

# Aguardar um pouco para garantir que o sistema está pronto
sleep 2

# Executar migrações
echo "Executando migrações do banco de dados..."
python manage.py migrate --noinput || echo "Aviso: Erro ao executar migrações (pode ser normal se as tabelas já existem)"

# Iniciar servidor com Waitress
echo "Iniciando servidor Waitress..."
exec python start_server.py

