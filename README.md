# O-ZENITH — Intelligent PDF & Document Workspace

<p align="center">
  <img src="public/favicon.svg" width="96" height="96" alt="O-ZENITH Emblem" />
</p>

<p align="center">
  <strong>A privacy-first, browser-native document intelligence engine and complete PDF suite.</strong><br>
  95+ high-performance PDF tools, multi-model BYOK AI document chat, local encrypted storage, and real-time frosted glass physics.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6.2-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Privacy-100%25_Browser_Local-0297DE?style=flat-square" alt="Privacy-First" />
  <img src="https://img.shields.io/badge/License-MIT-brightgreen?style=flat-square" alt="License" />
</p>

---

## Highlights

- **🔒 100% Client-Side & Zero-Knowledge Architecture**: Every PDF manipulation, conversion, OCR extraction, and signature is processed locally on your hardware using WebAssembly and client-side web workers. Your documents are never uploaded to any intermediary processing server.
- **⚡ 95+ Browser-Native PDF Tools**: Split, Merge, Compress, Edit, Redact, Sign (e-signature with stroke capture), Form Fill, OCR, Convert to/from Office formats (Word, Excel, PPTX, HTML, Images, HEIC), and organize documents with drag-and-drop ease.
- **🧠 Multi-Model BYOK AI Document Copilot**: Bring-Your-Own-Key (BYOK) support for OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet), Google Gemini (1.5 Pro / Flash), Groq, OpenRouter, and DeepSeek. Ask questions, generate executive summaries, translate, extract structured JSON data, and draft study flashcards directly from your documents.
- **💎 Adaptive Midnight & Arctic Glassmorphism**: High-precision Apple-grade design language featuring hardware-accelerated ambient fluted glass physics (`FluxPrismCanvas`), critically-damped spring animations, progressive scroll blurring, and seamless Dark/Light mode synchronization.
- **☁️ Zero-Backend Cloud Vault with Google Drive**: Optional Google Drive integration for direct cloud backups, instant export, and cross-device account synchronization without requiring a central database.
- **📱 Universal Multi-Device Optimization**: Fully responsive layout tailored for mobile phones, tablets, laptops, and ultra-wide displays with offline PWA support and touch gesture mechanics.

---

## Tech Stack

| Domain | Technologies |
|---|---|
| **Core Framework** | [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/) |
| **Styling & Physics** | [Tailwind CSS](https://tailwindcss.com/), Framer Motion, HTML5 Canvas 2D / WebGL |
| **PDF & Document Engine** | `pdf-lib`, `pdfjs-dist`, `@neslinesli93/qpdf-wasm`, `mammoth`, `xlsx`, `docx` |
| **OCR & Image Processing** | `tesseract.js`, `heic2any` |
| **AI Integration** | Direct client-to-provider streaming SSE protocol (OpenAI, Anthropic, Gemini, Groq, OpenRouter, DeepSeek) |
| **Storage & Identity** | Encrypted `localStorage`, Google Identity Services (OAuth 2.0 PKCE) |

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.0.0` or later (`v22+` recommended)
- **Package Manager**: `npm` (comes with Node.js) or `pnpm`

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/o-zenith.git
   cd o-zenith
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables** (optional):
   ```bash
   cp .env.example .env.local
   ```
   *Note: O-ZENITH runs out of the box without any backend or API keys. If you wish to enable 1-click Google Sign-in and Google Drive backup, populate `VITE_GOOGLE_CLIENT_ID` in `.env.local`.*

4. **Launch the development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Available Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Starts the Vite development server with Hot Module Replacement (HMR) |
| `npm run build` | Runs TypeScript type checking (`tsc -b`) and bundles production assets into `dist/` |
| `npm run preview` | Locally serves the optimized production build from `dist/` |
| `npm run lint` | Runs ESLint to verify code quality and style standards |
| `node --test src/utils/*.test.ts` | Runs the zero-dependency Node.js test suite for core utilities |

---

## Project Structure

```
zenith/
├── public/                 # Static assets, favicon, web manifest, service worker
├── src/
│   ├── assets/             # Fonts (DejaVu Sans), static images, SVGs
│   ├── components/         # Reusable UI & Layout Components
│   │   ├── auth/           # Authentication dialogs & form kits
│   │   ├── canvas/         # Interactive WebGL & Canvas physics (FluxPrismCanvas)
│   │   ├── layout/         # DashboardLayout, AuthLayout, ViewportScrollBlur
│   │   ├── tools/          # Tool workspace layouts, dropzones, error banners
│   │   └── ErrorBoundary.tsx # Glassmorphism error boundary & recovery cards
│   ├── context/            # React Contexts (AuthContext, SubscriptionContext, FavoritesContext)
│   ├── data/               # Tool registry (toolsData.ts — single source of truth)
│   ├── hooks/              # Custom hooks (useTheme, useToast, useKeyboard, usePwa)
│   ├── pages/
│   │   ├── auth/           # Login, Register, ForgotPassword, Welcome
│   │   ├── dashboard/      # Home Bento, Tools directory, AI Chat, Files, Favorites, Profile
│   │   │   └── tools/      # Dedicated tool execution modules (OCR, Compress, Merge, etc.)
│   │   └── public/         # Embedded Terms of Service and Privacy Policy
│   ├── utils/              # PDF engines, Web Workers, AI streaming, Google Drive sync
│   ├── App.tsx             # Main routing table, route guards, error boundaries
│   ├── index.css           # Design tokens, custom scrollbars, typography scales
│   └── main.tsx            # Application entrypoint
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules for node_modules, dist, and secrets
├── package.json            # Dependencies and npm scripts
├── tsconfig.json           # TypeScript configuration
└── vite.config.ts          # Vite configuration with chunk splitting & PWA plugins
```

---

## Security & Privacy Architecture

- **No Remote Telemetry or Log Ingestion**: No analytics trackers, keystroke monitors, or file upload endpoints are embedded.
- **Local Vault**: File metadata and user preferences are retained strictly within browser `localStorage` and `IndexedDB`.
- **Bring Your Own Key (BYOK)**: AI credentials are held securely within the user's local session and transmitted directly to the respective model provider over HTTPS.
- **Content Security Policy**: Strict CSP headers restrict script execution and network endpoints to designated authorized services.

---

## Contributing

Contributions, bug reports, and feature requests are welcome!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
