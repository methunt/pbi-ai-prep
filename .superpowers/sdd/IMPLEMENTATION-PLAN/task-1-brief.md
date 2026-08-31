### Task 0.1: Vite + React + TS scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `.env.d.ts`

**Interfaces:**
- Produces: a working `npm run dev` app shell; `tsconfig` with `strict: true`.

- [ ] **Step 1: Scaffold**

```bash
npm create vite@latest . -- --template react-ts
npm i react@19.2.8 react-dom@19.2.8
npm i @tanstack/react-virtual@latest zustand@5.0.15 @xyflow/react@12.11.5 elkjs@0.12.0 lucide-react
npm i -D vite@8.2.2 vitest tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 eslint eslint-plugin-import
```

- [ ] **Step 2: Set Vite `base` to relative for GitHub Pages**

Edit `vite.config.ts` to add `base: './'`.

- [ ] **Step 3: Add Playwright-style smoke hook (only for `e2e`, never runtime)**

Add a `data-testid="app-root"` on the root in `src/main.tsx`.

- [ ] **Step 4: Verify**

```bash
npm run dev
```
Expected: app renders at localhost with a `data-testid="app-root"` element. `npm run build` completes with no errors.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: step 0a1f"`

