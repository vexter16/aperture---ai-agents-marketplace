# Aperture Protocol

**A cryptoeconomically-secured intelligence marketplace connecting hyperlocal human observers to autonomous AI agents.**

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Solidity-363636?style=for-the-badge&logo=solidity&logoColor=white" />
  <img src="https://img.shields.io/badge/Flutter-02569B?style=for-the-badge&logo=flutter&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Base_Sepolia-0052FF?style=for-the-badge&logo=coinbase&logoColor=white" />
</p>

> **Solo undergraduate project** — ~15,000 lines across TypeScript, Dart, Solidity, and SQL. Every layer designed, implemented, and deployed by a single developer.

---

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [System Architecture](#system-architecture)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Database Setup](#1-database-setup)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Frontend Dashboard](#3-frontend-dashboard)
  - [4. Mobile App (Optional)](#4-mobile-app-optional)
- [Running the Demo](#running-the-demo)
- [API Reference](#api-reference)
- [Credibility Engine](#credibility-engine)
- [Smart Contracts](#smart-contracts)
- [Verification Suite](#verification-suite)
- [License](#license)

---

## The Problem

Large Language Models are **blind to the present moment**. Every frontier model — GPT, Claude, Gemini — operates behind a knowledge cutoff date. They cannot independently access real-time, hyperlocal physical information.

Consider what this means:
- An autonomous trading agent needs to know whether a port is *actually congested right now* before repositioning commodity futures.
- A disaster-response model needs to know which roads are passable *at this instant*, not when the last satellite image was captured.
- A supply-chain optimizer needs ground-truth confirmation that a warehouse fire is real before rerouting logistics across continents.

In every case, the information exists — in the heads and phones of people physically standing at those locations. **But there is no secure, trustless, economically sound protocol for an AI agent to pay a stranger for a verified fact.**

Current solutions fail because:
| Approach | Why It Fails |
|---|---|
| Web scraping / APIs | Stale data, no hyperlocal coverage, no freshness guarantees |
| Decentralized oracles (Chainlink, UMA) | Designed for on-chain price feeds, not arbitrary physical-world facts |
| Prediction markets (Augur, Polymarket) | Resolve via human vote escalation, days-long settlement, no M2M payment rails |
| Crowdsourcing platforms (MTurk) | Centralized, no cryptographic verification, no economic skin-in-the-game |

---

## The Solution

Aperture Protocol creates a **direct, trustless bridge** between humans with ground-truth observations and AI agents that need that information — with cryptoeconomic guarantees that make lying more expensive than telling the truth.

```
┌─────────────────┐     Submit fact + USDC stake     ┌─────────────────────┐
│   Human with    │ ──────────────────────────────▶  │   5-Signal Scoring  │
│   a smartphone  │                                  │   Engine            │
└─────────────────┘                                  └────────┬────────────┘
                                                              │
                                                     Score + Lock fact
                                                              │
                                                              ▼
┌─────────────────┐    x402 USDC micropayment        ┌─────────────────────┐
│   Autonomous    │ ◀──────────────────────────────  │   Intelligence      │
│   AI Agent      │ ──────────────────────────────▶  │   Marketplace       │
│   (any LLM)     │    MCP tool: search/buy/verify   │   (MCP + x402)      │
└────────┬────────┘                                  └────────┬────────────┘
         │                                                    │
         │  submit_feedback(true/false)                       │
         ▼                                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    On-Chain Settlement (Base Sepolia)                   │
│         Honest → stake returned + reward  |  Dishonest → stake slashed │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key design properties:**
1. **Truth-telling is the dominant economic strategy.** Lying costs real USDC. The cost compounds as reputation degrades.
2. **AI agents can autonomously discover, purchase, and verify intelligence** without custom integration — via Model Context Protocol (MCP) tools.
3. **Payment happens machine-to-machine** via the x402 HTTP payment protocol — no API keys, no subscriptions.
4. **No central authority.** Settlement is via on-chain smart contracts. The protocol operator cannot alter outcomes.

---

## System Architecture

```
veritas/
├── aperture_agent/          # Flutter mobile app (iOS/Android)
│   └── lib/
│       ├── main.dart        # Fact submission UI + hardware GPS/time capture
│       └── wallet_service.dart  # On-device Web3 wallet (key generation, USDC staking)
│
├── backend/                 # Node.js + Express API server
│   └── src/
│       ├── server.ts        # REST API (fact submission, search, settlement)
│       ├── mcp-server.ts    # Model Context Protocol server for AI agents
│       ├── demo.ts          # Interactive 3-scenario demo script
│       ├── services/
│       │   ├── credibility.ts   # 5-Signal Heuristic Scoring Engine
│       │   ├── embeddings.ts    # all-MiniLM-L6-v2 sentence transformer pipeline
│       │   └── blockchain.ts    # On-chain interactions (staking, slashing, rewards)
│       └── db/
│           └── index.ts     # PostgreSQL + pgvector queries
│
├── frontend/                # Next.js web dashboard
│   └── src/
│       ├── components/
│       │   ├── ActualMap.tsx     # Leaflet.js global map with live fact markers
│       │   ├── StatsBar.tsx     # Network statistics display
│       │   └── AgentTerminal.tsx # Real-time activity log (purchases, settlements)
│       └── app/
│           └── layout.tsx
│
├── contracts/               # Solidity smart contracts
│   └── src/
│       └── ApertureVault.sol    # On-chain escrow, staking, reward/slash settlement
│
└── deploy.sh                # One-command iOS deployment script
```

---

## How It Works

### Stage 1: Human Submission → Credibility Scoring

1. A human opens the **Aperture mobile app**, observes something in the real world, and submits a structured fact (text + optional photo).
2. The app automatically captures **hardware-level GPS coordinates** and **UTC timestamps** from the device's native sensors — not user-entered, making spoofing significantly harder.
3. The user **stakes USDC** (real money on Base Sepolia) on the claim's truthfulness.
4. The backend runs the fact through the **5-Signal Credibility Engine**, producing a composite score:
   - **S_rep**: Submitter's historical track record
   - **S_stake**: Quadratic stake weighting (√stake, preventing whale dominance)
   - **S_geo**: Gaussian corroboration over observer separation distances
   - **S_temporal**: Shannon entropy of submission timing (bots are periodic, humans are irregular)
   - **S_semantic**: Embedding variance via all-MiniLM-L6-v2 (detects LLM-generated clone text)
5. Facts scoring ≥ 0.70 are **approved for the marketplace**. Below 0.40 are **rejected as Sybil suspects**. Between is **pending corroboration**.

### Stage 2: AI Agent Purchase → Terminal Settlement

6. An external AI agent connects via **MCP tools** (`search_facts`, `get_fact`, `submit_feedback`).
7. The agent discovers relevant locked facts via **cosine similarity vector search** (pgvector).
8. To access the full data, the agent pays via **x402** — the server returns HTTP 402 with payment instructions, the agent sends USDC on-chain, and receives the unlocked payload.
9. The agent independently evaluates truthfulness and calls `submit_feedback(fact_id, true/false)`.
10. **Terminal settlement** fires on-chain:
    - **Honest submitter** → stake returned + reward
    - **Dishonest submitter** → stake permanently slashed (burned)
    - **Agent trust score** updated based on feedback consistency

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Mobile** | Flutter (Dart) | Hardware GPS/time capture, Web3 wallet, fact submission |
| **Backend** | Node.js, Express, TypeScript | REST API, credibility scoring, MCP server |
| **Database** | PostgreSQL + pgvector | Fact storage, 384-dim vector similarity search |
| **Embeddings** | all-MiniLM-L6-v2 (@xenova/transformers) | On-device sentence embeddings for semantic analysis |
| **Dashboard** | Next.js, React, Leaflet.js, Recharts | Real-time map, signal charts, activity terminal |
| **Blockchain** | Solidity, Hardhat, Base Sepolia (L2) | Staking escrow, reward/slash settlement |
| **AI Integration** | Model Context Protocol (MCP) | Structured tool interface for any LLM agent |
| **Payments** | x402 Protocol, USDC | Machine-to-machine HTTP micropayments |
| **Web3 Client** | viem | TypeScript Ethereum client for on-chain reads/writes |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** ≥ 14 with the **pgvector** extension
- **npm** (comes with Node.js)
- (Optional) **Flutter** ≥ 3.0 — only needed if you want to run the mobile app

### 1. Database Setup

Install PostgreSQL and pgvector, create a database, then run the schema migration:

```bash
# macOS (Homebrew)
brew install postgresql@16
brew install pgvector

# Start PostgreSQL
brew services start postgresql@16

# Create the database (uses default 'postgres' database)
# The setup script will create all tables automatically
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create your environment file
cp .env.example .env   # Or create .env manually (see below)

# Initialize database schema (creates all tables + pgvector extension)
npm run setup-db

# Start the development server
npm run dev
# Server starts on http://localhost:3001
```

**Required `.env` configuration:**

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres

# Server
PORT=3001

# Blockchain (Base Sepolia Testnet — these are public testnet addresses)
CHAIN_ID=84532
RPC_URL=https://sepolia.base.org
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Your own keys (generate fresh ones for testing)
OPERATOR_PRIVATE_KEY=<your_private_key>
OPERATOR_WALLET_ADDRESS=<your_wallet_address>
APERTURE_VAULT_ADDRESS=<deployed_vault_address>

# AI Agent (optional — for demo mode)
AGENT_PRIVATE_KEY=<agent_private_key>
AGENT_WALLET_ADDRESS=<agent_wallet_address>

# x402 Protocol
X402_FACILITATOR_URL=https://x402.org/facilitator
FACT_PRICE_USDC=0.05

# Demo Mode (set to false for production)
DEMO_MODE=true
```

> **Note:** To generate a fresh agent wallet, run: `npm run generate-agent-wallet`

### 3. Frontend Dashboard

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
# Dashboard opens on http://localhost:3000
```

The dashboard will connect to the backend at `localhost:3001` and display:
- **Live Map** — fact markers color-coded by credibility score
- **Signal Radar** — interactive breakdown of the 5 scoring signals per fact
- **Activity Terminal** — real-time log of AI agent purchases and on-chain settlements

### 4. Mobile App (Optional)

The Flutter mobile app requires an iOS or Android device. For iOS:

```bash
cd aperture_agent

# Get Flutter dependencies
flutter pub get

# Run on a connected iPhone (release mode)
flutter run --release
```

Or use the included deployment script:
```bash
./deploy.sh
```

> **iOS Note:** Free Apple Developer accounts require rebuilding every 7 days to refresh the provisioning profile.

---

## Running the Demo

The project includes an interactive, keystroke-driven demo that walks through three scenarios demonstrating the full lifecycle:

```bash
cd backend
npm run demo
```

**Scenario 1 — Honest Submission:** A legitimate fact is submitted with a real USDC stake, scored by the credibility engine, purchased by an AI agent, verified as true, and the submitter is rewarded on-chain.

**Scenario 2 — False Claim:** A fabricated fact is submitted. The credibility engine flags anomalies. The AI agent purchases it, determines it's false, and the submitter's stake is slashed (burned on-chain).

**Scenario 3 — Low-Quality Spam:** A minimal-effort submission with a tiny stake. The engine's quadratic weighting assigns it negligible influence, demonstrating how the scoring naturally filters noise.

> **Important:** The demo requires funded wallets on Base Sepolia. You can get testnet ETH from [Coinbase Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet) and testnet USDC from the [Circle USDC Faucet](https://faucet.circle.com/).

---

## API Reference

### Core Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/submit` | Submit a new fact (text + GPS + stake) |
| `GET` | `/facts` | List all facts with scores |
| `GET` | `/fact/:id` | Get a specific fact (x402 paywall for locked facts) |
| `POST` | `/search` | Semantic vector search across all facts |
| `POST` | `/feedback` | AI agent submits verification feedback |
| `GET` | `/health` | Server health check |
| `GET` | `/blockchain/status` | On-chain vault balance and network info |
| `POST` | `/demo/reset` | Reset demo state (demo mode only) |

### MCP Tools (for AI Agents)

The MCP server exposes three tools via JSON-RPC over stdio:

```bash
npm run mcp    # Start the MCP server
```

| Tool | Parameters | Description |
|---|---|---|
| `search_facts` | `query: string` | Semantic search for relevant intelligence |
| `get_fact` | `fact_id: string` | Purchase and retrieve a locked fact (triggers x402 payment) |
| `submit_feedback` | `fact_id: string, is_true: boolean` | Submit verification feedback (triggers settlement) |

---

## Credibility Engine

The scoring engine (`backend/src/services/credibility.ts`) computes a composite heuristic from five independent signals:

```
Final Score = 0.30 × S_rep + 0.25 × S_stake + 0.15 × S_geo + 0.15 × S_temporal + 0.15 × S_semantic
```

| Signal | What it measures | How it catches attackers |
|---|---|---|
| **S_rep** (Reputation) | Submitter's historical accuracy | Fresh/fake accounts have low rep → lower scores |
| **S_stake** (Quadratic Stake) | √(USDC staked), not raw amount | Whales can't buy influence (√$100 = 10, not 100) |
| **S_geo** (Geospatial) | Gaussian over observer GPS separation | Bot farms cluster at identical GPS → penalized |
| **S_temporal** (Entropy) | Shannon entropy of submission timing | Bots submit periodically → low entropy → caught |
| **S_semantic** (Variance) | Cosine similarity variance of embeddings | LLM-generated clones have near-zero variance → caught |

The engine is a **weighted heuristic**, not a learned model. Its power comes from **signal orthogonality**: an attacker can game one or two signals, but satisfying all five simultaneously requires behaving indistinguishably from an honest user.

**Stage 2 adds a 6th signal** — AI agent feedback (`S_agent`), weighted by the agent's own trust score. This triggers terminal settlement (reward or slash).

---

## Smart Contracts

**ApertureVault.sol** — deployed on Base Sepolia (Chain ID: 84532)

The vault handles three operations:
1. **`lockStake(factId, amount)`** — Human locks USDC when submitting a fact
2. **`releaseStake(factId)`** — Returns stake + reward to honest submitters
3. **`slashStake(factId)`** — Permanently burns a dishonest submitter's stake

Built with OpenZeppelin's `SafeERC20`, `Ownable`, and `ReentrancyGuard`.

To deploy your own vault:
```bash
cd contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network base-sepolia
```

---

## Verification Suite

The project includes a comprehensive 5-experiment thesis verification suite:

```bash
cd backend
npx ts-node scripts/thesis-verification.ts
```

| Experiment | What it tests | Key results |
|---|---|---|
| **Exp 1: Unit Boundaries** | Each signal function with known inputs | 25/28 assertions pass |
| **Exp 2: Monte Carlo** | 10K trials each: honest, Sybil, smart attacker, solo, mixed | Zero distribution overlap between honest (min 71.6%) and Sybil (max 57.7%) |
| **Exp 3: Ablation** | Remove one signal at a time | S_rep and S_stake most critical; S_temporal and S_semantic matter for sophisticated attackers |
| **Exp 4: ROC/AUC** | Sweep threshold 0→1, compute TPR/FPR | AUC = 0.997 (honest vs. basic Sybil) |
| **Exp 5: Game Theory** | 50 honest + 50 liar agents, 100 rounds | 100% of liars bankrupt; honest agents 3.4× starting capital |

> **Honest caveat:** The AUC of 0.997 is measured against deliberately extreme bot scenarios (identical GPS, sub-second timing, clone embeddings). Against sophisticated attackers who add jitter across signals, the engine scores ~0.65 — near the decision boundary. The system's strength is that gaming all five signals simultaneously is economically irrational.

---

## License

MIT

---

*Built by [Veeshal](https://github.com/vexter16) as an undergraduate major project (AIP81) at the Department of AI & ML.*
