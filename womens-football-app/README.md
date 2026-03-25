# Women's Football Predictions App

## Setup

### 1. Instalar dependencias
```bash
npm install
```

### 2. Agregar predictions.json
Copia el archivo `data/predictions.json` generado por el notebook a la carpeta `public/`:
```bash
cp ../data/predictions.json public/predictions.json
```

### 3. Correr en desarrollo
```bash
npm start
```

### 4. Build para producción
```bash
npm run build
```

## Estructura
```
womens-football-app/
├── public/
│   ├── index.html
│   └── predictions.json   ← copiá acá el JSON del notebook
├── src/
│   ├── App.jsx            ← componente principal
│   ├── App.css            ← estilos
│   └── index.js           ← entry point
└── package.json
```

## Firebase
Las credenciales ya están en `App.jsx`. La colección de Firestore se llama `predictions` y guarda:
```json
{
  "alias": "nombre del usuario",
  "bracket": {
    "qfWinners": ["team1", "team2", "team3", "team4"],
    "sfWinners": ["team1", "team2"],
    "champion": "team1"
  },
  "probability": 0.0023,
  "createdAt": "timestamp"
}
```

## Deploy en GitHub Pages (opcional)
```bash
npm install --save-dev gh-pages
```
Agregar en `package.json`:
```json
"homepage": "https://veronicadeleonh.github.io/womens-football",
"scripts": {
  "predeploy": "npm run build",
  "deploy": "gh-pages -d build"
}
```
Luego: `npm run deploy`
