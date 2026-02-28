# Website_Frontend

Marketing site and documentation for Web2Wireframe.

## Tech Stack

- React 19.2.0
- Vite 7.2.4
- React Router DOM 7.10.1
- SCSS Modules (Sass 1.95.0)
- TypeScript 5.6.3
- ESLint 9.39

## Pages

| Route | Page |
|-------|------|
| `/` | Home |
| `/how-it-works` | HowItWorks |
| `/pricing` | Pricing |
| `/docs` | Docs (searchable) |
| `/support` | Support form |
| `/terms` | Terms & Conditions |
| `/privacy` | Privacy Policy |
| `/legal` | Legal |

## Setup

```bash
npm install
cp .env.local.example .env.local
```

Set the backend URL in `.env.local`:

```env
VITE_API_URL=http://localhost:3001
```

## Development

```bash
npm run dev      # Vite dev server @ :5173
npm run build    # Production build → dist/
npm run preview  # Preview production build
npm run lint     # ESLint check
```

## Project Structure

```
Website_Frontend/
├── src/
│   ├── main.tsx           # React root entry
│   ├── App.tsx            # Router setup
│   ├── components/        # Shared (Header, Footer)
│   ├── pages/             # Page components
│   ├── styles/            # Global SCSS
│   ├── assets/            # Images, SVGs
│   └── data/              # Static data
├── public/
├── vite.config.ts
└── tsconfig.json
```

## Integration

- API calls to Website_Backend at port 3001
- Support form → `POST /api/support`
