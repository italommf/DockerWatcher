#!/usr/bin/env python
"""Script simples para limpar RPAs do banco SQLite."""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'db.sqlite3')

if not os.path.exists(db_path):
    print(f'ERRO: Banco de dados nao encontrado: {db_path}')
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Contar RPAs
cursor.execute("SELECT COUNT(*) FROM robos_dockerizados WHERE tipo = 'rpa'")
count = cursor.fetchone()[0]
print(f'RPAs encontrados: {count}')

if count > 0:
    # Deletar RPAs
    cursor.execute("DELETE FROM robos_dockerizados WHERE tipo = 'rpa'")
    conn.commit()
    print('SUCCESS: Todos os RPAs foram deletados com sucesso!')
else:
    print('INFO: Nenhum RPA encontrado no banco de dados.')

conn.close()
