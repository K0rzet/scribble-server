# 🎮 Scribble Server

Серверная часть мультиплеерной игры Scribble (клон Skribbl.io) для Яндекс Игр.

## Технологии
- **Node.js** + **Express**
- **Socket.io** — реалтайм коммуникация
- **TypeScript**

## Установка
```bash
npm install
```

## Разработка
```bash
npm run dev
```
Сервер: `http://localhost:3001`

## Продакшн
```bash
npm run build
npm start
```

## Переменные окружения
| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3001` | Порт сервера |
| `CLIENT_URL` | `*` | CORS origin |

## Деплой на VPS
```bash
git clone https://github.com/K0rzet/scribble-server.git
cd scribble-server
npm install
npm run build
PORT=3001 pm2 start dist/index.js --name scribble-server
```
