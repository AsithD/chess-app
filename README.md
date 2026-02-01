# ♟️ Chess Duel: Elite Multiplayer Arena

A high-performance, visually stunning real-time chess platform built with **React**, **Socket.IO**, and **Firebase**. Experience competitive chess with real-time Elo ratings, AI-powered move analysis, and a premium neural-link aesthetic.

![Chess Duel Interface](https://via.placeholder.com/800x450/111827/3b82f6?text=Chess+Duel+Elite+Interface)

## 🚀 Core Features

### ⚔️ Competitive Ecosystem
- **Elo Rating System**: Start at **400 Elo** and climb the ranks. Ratings are calculated in real-time using the **K=32** algorithm.
- **Match Types**: Choose between **Rated Duels** (affects Elo) and **Casual Duels** (friendly practice).
- **Direct Challenges**: Duel online agents immediately from the global "Active Agents" list.

### 🧠 Tactical Intel (Move Analysis)
- **AI Engine Integration**: Every move is processed to determine its quality.
- **Visual Feedback**: Real-time labels identify **Best**, **Good**, **Inaccuracy**, and **Blunder** moves.
- **Match History**: Scrub through full move-by-move FEN history for every match you've played.

### 🎨 Premium Visual Engine
- **Neural Link Aesthetic**: Sleek glassmorphism, vibrant gradients, and high-frequency animations.
- **King Check Alerts**: Intense red pulse animation when your King is under fire.
- **Board Navigation**: Intuitive playback controls (◀/▶) to analyze games mid-match or post-match.

### 🔐 Secure Tactical Network
- **Firebase Auth**: Seamlessly login via **Google** or participate as a **Guest Agent**.
- **Real-time Sync**: Global online user tracking and instant challenge notifications.

---

## 🛠️ Technical Arsenal

- **Frontend**: React + Vite + TailwindCSS
- **Backend**: Node.js + Express + Socket.IO
- **Database**: Firestore (Persistence)
- **Auth**: Firebase Authentication
- **Engine**: js-chess-engine & chess.js

---

## 🏁 Quick Start

### 1. Intelligence Gathering (Cloning)
```bash
git clone https://github.com/AsithD/chess-app.git
cd chess-app
```

### 2. Supply Drop (Installation)
```bash
npm install
cd server
npm install
cd ..
```

### 3. Ignition (Local Launch)
In one terminal:
```bash
npm run dev
```
In another:
```bash
npm run server
```

---

## ☣️ Secret Protocol (God Mode)
For development and training, a hidden **God Mode** can be activated to reveal engine-calculated best moves in real-time.
- **Activation**: Type `IAMGOD` anywhere on the keyboard during a match.
- **Effect**: Activates a neural hint overlay showing the engine's top choice.

---

Designed with ⚡ by **Antigravity**
