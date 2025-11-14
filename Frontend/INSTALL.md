# Instalação e Configuração

## Pré-requisitos

- Node.js 18+ instalado
- Python 3.8+ instalado
- Dependências Python do backend instaladas

## Passo a passo

1. **Instalar dependências do frontend:**

```bash
cd Frontend
npm install
```

2. **Configurar backend Django:**

Certifique-se de que o backend está configurado corretamente:
- Arquivo `shared/config.ini` configurado com credenciais SSH e MySQL
- Dependências Python instaladas: `pip install -r requirements.txt`

3. **Desenvolvimento:**

```bash
# Em um terminal, rodar o backend Django:
cd ../backend
python run_server.py

# Em outro terminal, rodar o frontend:
cd Frontend
npm run dev
```

O Electron abrirá automaticamente após o React iniciar.

4. **Build para produção:**

```bash
# Build completo (React + Electron)
npm run package
```

O executável será gerado em `out/` ou `dist/`.

## Troubleshooting

### Backend não inicia
- Verifique se o Python está instalado
- Verifique se as dependências estão instaladas
- Verifique o arquivo `shared/config.ini`

### Frontend não conecta ao backend
- Certifique-se que o backend está rodando em `http://127.0.0.1:8000`
- Verifique se há erros no console do Electron (DevTools)

### Electron não abre
- Verifique se o React está rodando em `http://localhost:5173`
- Verifique os logs no terminal

