# FinTrack — Guía completa del proyecto

> App de escritorio multiplataforma para tracking de gastos personales.  
> Stack: TypeScript · RTK · React · Electron Forge · Jest · Tailwind · SQLite

---

## Tabla de contenidos

1. [Descripción del proyecto](#1-descripción-del-proyecto)
2. [Estructura de carpetas](#2-estructura-de-carpetas)
3. [Arquitectura e integración de tecnologías](#3-arquitectura-e-integración-de-tecnologías)
4. [Configuración de tecnologías](#4-configuración-de-tecnologías)
5. [Dónde y cómo corre SQLite](#5-dónde-y-cómo-corre-sqlite)
6. [Features y flujos detallados](#6-features-y-flujos-detallados)
7. [Proyecto SCRUM](#7-proyecto-scrum)
8. [Pasos a seguir — guía de desarrollo](#8-pasos-a-seguir--guía-de-desarrollo)
9. [Errores comunes y soluciones](#9-errores-comunes-y-soluciones)
10. [Recursos](#10-recursos)


---

## 1. Descripción del proyecto

**FinTrack** es una app de escritorio que permite:

- Registrar ingresos y gastos con categoría, descripción y fecha
- Filtrar transacciones por mes y categoría
- Visualizar estadísticas en un dashboard (balance, totales, gráficos)
- Importar y exportar transacciones en formato CSV
- Configurar un límite de presupuesto mensual y recibir alertas nativas del OS cuando se supera

**Todo se almacena localmente en SQLite — sin backend, sin cloud.**

### Conceptos RTK que se practican

| Concepto | Dónde se usa |
|---|---|
| `createSlice` | Estado de filtros activos, presupuesto mensual, loading states |
| `createApi` + `baseQuery` custom | CRUD completo con cache automático vía IPC |
| `createAsyncThunk` | Import/export CSV con `pending`, `fulfilled`, `rejected` |
| `createSelector` | Selectors memoizados en cascada para totales y gráficos |
| `createListenerMiddleware` | Alerta reactiva cuando se supera el límite de gasto |
| IPC + `contextBridge` | Comunicación segura entre renderer y main process |

---

## 2. Estructura de carpetas

```
fintrack/
├── forge.config.ts                  # Config de Electron Forge (makers, plugins)
├── webpack.main.config.ts           # Webpack para el main process
├── webpack.renderer.config.ts       # Webpack para el renderer (React)
├── webpack.rules.ts                 # Reglas compartidas: babel-loader, css-loader
├── src/
│   ├── main/                        # Electron main process (Node.js)
│   │   ├── ipc/
│   │   │   ├── index.ts             # Registra todos los handlers
│   │   │   ├── transactions.ts      # ipcMain.handle() para CRUD transacciones
│   │   │   └── categories.ts        # ipcMain.handle() para CRUD categorías
│   │   ├── db/
│   │   │   └── index.ts             # initDb(), getDb(), migraciones
│   │   └── index.ts                 # Entry point del main process
│   │
│   ├── preload/                     # Bridge entre main y renderer
│   │   └── index.ts                 # contextBridge → window.electronAPI
│   │
│   ├── renderer/                    # React app (Chrome/Chromium)
│   │   ├── index.html               # HTML raíz con <div id="root">
│   │   ├── main.tsx                 # Entry point: ReactDOM.createRoot()
│   │   ├── App.tsx                  # Componente raíz con react-router-dom
│   │   ├── app/
│   │   │   ├── store.ts             # configureStore con todos los reducers
│   │   │   ├── hooks.ts             # useAppDispatch, useAppSelector tipados
│   │   │   └── listenerMiddleware.ts
│   │   ├── features/
│   │   │   ├── transactions/
│   │   │   │   ├── transactionsSlice.ts
│   │   │   │   ├── transactionsApi.ts       # RTK Query + baseQuery custom
│   │   │   │   ├── transactionsSelectors.ts # createSelector en cascada
│   │   │   │   ├── filtersSlice.ts
│   │   │   │   └── importExportThunk.ts     # createAsyncThunk
│   │   │   └── categories/
│   │   │       ├── categoriesSlice.ts
│   │   │       ├── categoriesApi.ts         # RTK Query CRUD de categorías
│   │   │       └── categoriesSelectors.ts
│   │   ├── components/
│   │   ├── pages/
│   │   └── assets/
│   │       └── main.css             # @tailwind directives
│   │
│   └── shared/                      # Tipos compartidos main ↔ renderer
│       ├── types.ts                 # Transaction, Category, BudgetConfig
│       └── ipcChannels.ts           # Constantes de canales IPC
│
└── tests/
    ├── setup.ts                     # Mock global de window.electronAPI
    └── features/
        └── transactions/
            ├── transactionsSlice.test.ts
            ├── selectors.test.ts
            └── importExportThunk.test.ts
```

---

## 3. Arquitectura e integración de tecnologías

### Visión general

```
┌─────────────────────────────┐         ┌─────────────────────────────┐
│   Main process (Node.js)    │         │  Renderer process (Chrome)  │
│                             │         │                             │
│  ┌─────────────────────┐   │         │  ┌─────────────────────┐   │
│  │   IPC handlers       │   │         │  │   Redux Store (RTK) │   │
│  │   ipcMain.handle()   │◄──┼─────────┼──│   configureStore()  │   │
│  └──────────┬──────────┘   │         │  └──────────┬──────────┘   │
│             │               │         │             │               │
│  ┌──────────▼──────────┐   │         │  ┌──────────▼──────────┐   │
│  │   better-sqlite3    │   │  IPC     │  │   RTK Query         │   │
│  │   SQLite engine     │   │ Bridge   │  │   electronBaseQuery │   │
│  └──────────┬──────────┘   │         │  └──────────┬──────────┘   │
│             │               │         │             │               │
│  ┌──────────▼──────────┐   │         │  ┌──────────▼──────────┐   │
│  │   Node FS           │   │         │  │   Async Thunks      │   │
│  │   Electron Dialog   │   │         │  │   Selectors         │   │
│  │   Notifications     │   │         │  │   Listener MW       │   │
│  └─────────────────────┘   │         │  └─────────────────────┘   │
└─────────────────────────────┘         └─────────────────────────────┘
              ▲                                        │
              │         ┌──────────────┐               │
              └─────────│  preload.ts  │───────────────┘
                        │ contextBridge│
                        └──────────────┘
                               │
                    ┌──────────▼──────────┐
                    │    src/shared/      │
                    │    types.ts         │
                    │    ipcChannels.ts   │
                    └─────────────────────┘
```

### Flujo IPC — Renderer → Main

| Pieza RTK | Método IPC | Dirección |
|---|---|---|
| RTK Query endpoints | `ipcRenderer.invoke` | Bidireccional (devuelve Promise) |
| Async thunks (CSV) | `ipcRenderer.invoke` | Bidireccional (devuelve Promise) |
| Listener middleware (alertas) | `ipcRenderer.send` | Unidireccional (solo dispara) |

---

## 4. Configuración de tecnologías

### Electron Forge + Webpack + React

Electron Forge con el plugin `@electron-forge/plugin-webpack` es la integración **estable y oficialmente soportada**. Webpack maneja el bundle del main process, preload y renderer por separado.

El transpilado de TypeScript y JSX lo hace `ts-loader` con `transpileOnly: true` (rápido, sin type checking bloqueante). El type checking corre en paralelo via `ForkTsCheckerWebpackPlugin`. Para JSX se requiere `"jsx": "react-jsx"` en `tsconfig.json`.

```typescript
// forge.config.ts
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

const config: ForgeConfig = {
  packagerConfig: { asar: true },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/renderer/index.html',
            js:   './src/renderer/main.tsx',
            name: 'main_window',
            preload: {
              js: './src/preload/index.ts',
            },
          },
        ],
      },
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
```

```typescript
// webpack.main.config.ts
import type { Configuration } from 'webpack';
import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

export const mainConfig: Configuration = {
  entry: './src/main/index.ts',
  module: { rules },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
};
```

```typescript
// webpack.renderer.config.ts
// El CSS rule se define aquí (no en webpack.rules.ts) porque postcss-loader
// solo aplica al renderer, no al main process.
import type { Configuration } from 'webpack';
import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

rules.push({
  test: /\.css$/,
  use: [
    { loader: 'style-loader' },
    { loader: 'css-loader' },
    { loader: 'postcss-loader' },
  ],
});

export const rendererConfig: Configuration = {
  module: { rules },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
  },
};
```

```typescript
// webpack.rules.ts — se mantiene el ts-loader generado por el template
// No se migra a babel-loader: ts-loader + ForkTsCheckerWebpackPlugin
// ya logran el mismo resultado sin dependencias extra.
import type { ModuleOptions } from 'webpack';

export const rules: Required<ModuleOptions>['rules'] = [
  {
    test: /native_modules[/\\].+\.node$/,
    use: 'node-loader',
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: '@vercel/webpack-asset-relocator-loader',
      options: { outputAssetBase: 'native_modules' },
    },
  },
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: 'ts-loader',
      options: { transpileOnly: true },
    },
  },
];
```

```json
// tsconfig.json — "jsx": "react-jsx" habilita el nuevo JSX transform de React 17+
// No requiere importar React en cada archivo TSX.
{
  "compilerOptions": {
    "target": "ES6",
    "allowJs": true,
    "module": "commonjs",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "noImplicitAny": true,
    "sourceMap": true,
    "baseUrl": ".",
    "outDir": "dist",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "paths": {
      "*": ["node_modules/*"]
    }
  },
  "include": ["src/**/*"]
}
```

```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { initDb } from './db'

// Electron Forge Webpack inyecta estas variables en tiempo de compilación
declare const MAIN_WINDOW_WEBPACK_ENTRY: string
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload:          MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      sandbox:          false,   // requerido para contextBridge
      contextIsolation: true,
    },
  })

  win.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)
}

app.whenReady().then(() => {
  initDb()
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannels } from '../shared/ipcChannels'

const electronAPI = {
  invoke: <T>(channel: IpcChannels, args?: unknown): Promise<T> =>
    ipcRenderer.invoke(channel, args),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}
```

```tsx
// src/renderer/index.html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'" />
    <title>FinTrack</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

```tsx
// src/renderer/main.tsx  — entry point de React
import './assets/main.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './app/store'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
)
```

```json
// package.json — scripts de Electron Forge
{
  "scripts": {
    "start":   "electron-forge start",
    "build":   "electron-forge package",
    "make":    "electron-forge make",
    "publish": "electron-forge publish",
    "test":    "jest"
  }
}
```

---

### TypeScript — tipos compartidos

```typescript
// src/shared/types.ts

// Categoría dinámica — ya no es un union fijo, viene de la DB
export interface Category {
  id: string
  name: string
  color: string    // hex: "#16A34A"
  icon?: string    // nombre de icono opcional
  createdAt: string
}

export interface Transaction {
  id: string
  amount: number
  type: 'income' | 'expense'
  categoryId: string   // FK a Category.id
  description: string
  date: string         // ISO: "2024-03-15"
  createdAt: string
}

export interface TransactionFilters {
  month: string        // "2024-03"
  categoryId: string | 'all'
}

export interface BudgetConfig {
  monthlyLimit: number
  currency: 'ARS' | 'USD' | 'EUR'
}
```

```typescript
// src/shared/ipcChannels.ts
export const IPC = {
  // Transacciones
  TRANSACTIONS_GET_ALL:    'transactions:getAll',
  TRANSACTIONS_ADD:        'transactions:add',
  TRANSACTIONS_UPDATE:     'transactions:update',
  TRANSACTIONS_DELETE:     'transactions:delete',
  TRANSACTIONS_IMPORT:     'transactions:import',
  TRANSACTIONS_EXPORT:     'transactions:export',
  // Categorías
  CATEGORIES_GET_ALL:      'categories:getAll',
  CATEGORIES_ADD:          'categories:add',
  CATEGORIES_UPDATE:       'categories:update',
  CATEGORIES_DELETE:       'categories:delete',
  // Notificaciones
  NOTIFY_BUDGET_EXCEEDED:  'notify:budgetExceeded',
} as const

export type IpcChannels = typeof IPC[keyof typeof IPC]
```

---

### RTK — Store y hooks tipados

```typescript
// src/renderer/app/store.ts
import { configureStore } from '@reduxjs/toolkit'
import { listenerMiddleware } from './listenerMiddleware'
import { transactionsApi } from '../features/transactions/transactionsApi'
import { categoriesApi } from '../features/categories/categoriesApi'
import transactionsReducer from '../features/transactions/transactionsSlice'
import filtersReducer from '../features/transactions/filtersSlice'

export const store = configureStore({
  reducer: {
    transactions: transactionsReducer,
    filters:      filtersReducer,
    [transactionsApi.reducerPath]: transactionsApi.reducer,
    [categoriesApi.reducerPath]:   categoriesApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .prepend(listenerMiddleware.middleware)
      .concat(transactionsApi.middleware)
      .concat(categoriesApi.middleware),
})

export type RootState   = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
```

```typescript
// src/renderer/app/hooks.ts
import { useDispatch, useSelector } from 'react-redux'
import type { RootState, AppDispatch } from './store'

export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector = <T>(selector: (s: RootState) => T) =>
  useSelector(selector)
```

---

### RTK Query — electronBaseQuery custom

```typescript
// src/renderer/features/transactions/transactionsApi.ts
import { createApi, BaseQueryFn } from '@reduxjs/toolkit/query/react'
import { IPC } from '@shared/ipcChannels'
import type { Transaction } from '@shared/types'

// baseQuery custom: delega en window.electronAPI.invoke
const electronBaseQuery: BaseQueryFn<
  { channel: string; args?: unknown },
  unknown,
  string
> = async ({ channel, args }) => {
  try {
    const data = await window.electronAPI.invoke(channel, args)
    return { data }
  } catch (error) {
    return { error: String(error) }
  }
}

export const transactionsApi = createApi({
  reducerPath: 'transactionsApi',
  baseQuery: electronBaseQuery,
  tagTypes: ['Transaction'],
  endpoints: (builder) => ({
    getTransactions: builder.query<Transaction[], void>({
      query: () => ({ channel: IPC.TRANSACTIONS_GET_ALL }),
      providesTags: ['Transaction'],
    }),
    addTransaction: builder.mutation<Transaction, Omit<Transaction, 'id' | 'createdAt'>>({
      query: (args) => ({ channel: IPC.TRANSACTIONS_ADD, args }),
      invalidatesTags: ['Transaction'],
    }),
    deleteTransaction: builder.mutation<void, string>({
      query: (id) => ({ channel: IPC.TRANSACTIONS_DELETE, args: id }),
      invalidatesTags: ['Transaction'],
    }),
  }),
})

export const {
  useGetTransactionsQuery,
  useAddTransactionMutation,
  useDeleteTransactionMutation,
} = transactionsApi
```

---

### RTK Query — categoriesApi

```typescript
// src/renderer/features/categories/categoriesApi.ts
import { createApi, BaseQueryFn } from '@reduxjs/toolkit/query/react'
import { IPC } from '@shared/ipcChannels'
import type { Category } from '@shared/types'

const electronBaseQuery: BaseQueryFn<
  { channel: string; args?: unknown },
  unknown,
  string
> = async ({ channel, args }) => {
  try {
    const data = await window.electronAPI.invoke(channel, args)
    return { data }
  } catch (error) {
    return { error: String(error) }
  }
}

export const categoriesApi = createApi({
  reducerPath: 'categoriesApi',
  baseQuery: electronBaseQuery,
  tagTypes: ['Category'],
  endpoints: (builder) => ({
    getCategories: builder.query<Category[], void>({
      query: () => ({ channel: IPC.CATEGORIES_GET_ALL }),
      providesTags: ['Category'],
    }),
    addCategory: builder.mutation<Category, Omit<Category, 'id' | 'createdAt'>>({
      query: (args) => ({ channel: IPC.CATEGORIES_ADD, args }),
      invalidatesTags: ['Category'],
    }),
    updateCategory: builder.mutation<Category, Category>({
      query: (args) => ({ channel: IPC.CATEGORIES_UPDATE, args }),
      invalidatesTags: ['Category'],
    }),
    deleteCategory: builder.mutation<void, string>({
      query: (id) => ({ channel: IPC.CATEGORIES_DELETE, args: id }),
      // Al borrar una categoría también cambian transacciones
      invalidatesTags: ['Category', 'Transaction'],
    }),
  }),
})

export const {
  useGetCategoriesQuery,
  useAddCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
} = categoriesApi
```

> Agregar `categoriesApi.reducer` y `categoriesApi.middleware` al store junto a `transactionsApi`.

---

```typescript
// src/renderer/app/listenerMiddleware.ts
import { createListenerMiddleware } from '@reduxjs/toolkit'
import { transactionsApi } from '../features/transactions/transactionsApi'
import { selectTotals } from '../features/transactions/transactionsSelectors'
import { IPC } from '@shared/ipcChannels'
import type { RootState } from './store'

export const listenerMiddleware = createListenerMiddleware()

listenerMiddleware.startListening({
  matcher: transactionsApi.endpoints.addTransaction.matchFulfilled,
  effect: async (_action, listenerApi) => {
    const state = listenerApi.getState() as RootState
    const { totalExpenses } = selectTotals(state)
    const limit = state.filters.budgetLimit

    if (limit > 0 && totalExpenses >= limit) {
      await window.electronAPI.invoke(IPC.NOTIFY_BUDGET_EXCEEDED, {
        expenses: totalExpenses,
        limit
      })
    }
  }
})
```

---

### SQLite — main process

```typescript
// src/main/db/index.ts
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

export function initDb(): void {
  const dbPath = join(app.getPath('userData'), 'fintrack.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')   // FK entre transactions y categories
  runMigrations()
}

export function getDb(): Database.Database {
  if (!db) throw new Error('DB not initialized')
  return db
}

function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id          TEXT PRIMARY KEY,
      name        TEXT    NOT NULL UNIQUE,
      color       TEXT    NOT NULL DEFAULT '#71717A',
      icon        TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id          TEXT PRIMARY KEY,
      amount      REAL    NOT NULL,
      type        TEXT    NOT NULL CHECK(type IN ('income','expense')),
      category_id TEXT    NOT NULL REFERENCES categories(id),
      description TEXT    NOT NULL DEFAULT '',
      date        TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tx_date        ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_tx_type        ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_tx_category    ON transactions(category_id);

    -- Categorías por defecto (se insertan solo si la tabla está vacía)
    INSERT OR IGNORE INTO categories (id, name, color) VALUES
      ('cat-01', 'Alimentación',   '#16A34A'),
      ('cat-02', 'Transporte',     '#2563EB'),
      ('cat-03', 'Servicios',      '#D97706'),
      ('cat-04', 'Entretenimiento','#DB2777'),
      ('cat-05', 'Salud',          '#0D9488'),
      ('cat-06', 'Shopping',       '#EA580C'),
      ('cat-07', 'Salario',        '#7C3AED'),
      ('cat-08', 'Ahorros',        '#4F46E5'),
      ('cat-09', 'Otro',           '#71717A');
  `)
}
```

```typescript
// src/main/ipc/index.ts  — registrar todos los handlers
import { registerTransactionHandlers } from './transactions'
import { registerCategoryHandlers } from './categories'

export function registerIpcHandlers(): void {
  registerTransactionHandlers()
  registerCategoryHandlers()
}
```
```

```typescript
// src/main/ipc/transactions.ts
import { ipcMain } from 'electron'
import { getDb } from '../db'
import { IPC } from '../../shared/ipcChannels'
import { randomUUID } from 'crypto'
import type { Transaction } from '../../shared/types'

export function registerTransactionHandlers(): void {
  const db = getDb()

  ipcMain.handle(IPC.TRANSACTIONS_GET_ALL, () => {
    return db.prepare('SELECT * FROM transactions ORDER BY date DESC').all()
  })

  ipcMain.handle(IPC.TRANSACTIONS_ADD, (_e, tx: Omit<Transaction, 'id' | 'createdAt'>) => {
    const id = randomUUID()
    db.prepare(`
      INSERT INTO transactions (id, amount, type, category_id, description, date)
      VALUES (@id, @amount, @type, @categoryId, @description, @date)
    `).run({ id, ...tx })
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
  })

  ipcMain.handle(IPC.TRANSACTIONS_UPDATE, (_e, tx: Transaction) => {
    db.prepare(`
      UPDATE transactions
      SET amount=@amount, type=@type, category_id=@categoryId,
          description=@description, date=@date
      WHERE id=@id
    `).run(tx)
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(tx.id)
  })

  ipcMain.handle(IPC.TRANSACTIONS_DELETE, (_e, id: string) => {
    db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
  })
}
```

```typescript
// src/main/ipc/categories.ts
import { ipcMain } from 'electron'
import { getDb } from '../db'
import { IPC } from '../../shared/ipcChannels'
import { randomUUID } from 'crypto'
import type { Category } from '../../shared/types'

export function registerCategoryHandlers(): void {
  const db = getDb()

  ipcMain.handle(IPC.CATEGORIES_GET_ALL, () => {
    return db.prepare('SELECT * FROM categories ORDER BY name ASC').all()
  })

  ipcMain.handle(IPC.CATEGORIES_ADD, (_e, cat: Omit<Category, 'id' | 'createdAt'>) => {
    const id = randomUUID()
    db.prepare(`
      INSERT INTO categories (id, name, color, icon)
      VALUES (@id, @name, @color, @icon)
    `).run({ id, icon: null, ...cat })
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id)
  })

  ipcMain.handle(IPC.CATEGORIES_UPDATE, (_e, cat: Category) => {
    db.prepare(`
      UPDATE categories SET name=@name, color=@color, icon=@icon WHERE id=@id
    `).run(cat)
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id)
  })

  ipcMain.handle(IPC.CATEGORIES_DELETE, (_e, id: string) => {
    // Mover transacciones a la categoría "Otro" antes de borrar
    const other = db.prepare("SELECT id FROM categories WHERE name='Otro'").get() as any
    if (other) {
      db.prepare('UPDATE transactions SET category_id=? WHERE category_id=?')
        .run(other.id, id)
    }
    db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  })
}
```
```

---

### Tailwind CSS

> **Versión instalada: Tailwind CSS v4.x**
> La v4 cambia radicalmente la configuración respecto a v3: no hay `tailwind.config.js`, el contenido se detecta automáticamente y la configuración se hace en CSS.

**Paso 1 — Instalar**
```bash
npm install -D tailwindcss @tailwindcss/postcss postcss autoprefixer postcss-loader
```

**Paso 2 — Crear `postcss.config.mjs`** en la raíz del proyecto
```js
// postcss.config.mjs
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}
```

> No se necesita `tailwind.config.js`. La detección de archivos es automática en v4.

**Paso 3 — CSS entry point**
```css
/* src/renderer/assets/main.css */
@import "tailwindcss";
```

**Paso 4 — Agregar `postcss-loader` en `webpack.renderer.config.ts`**
```typescript
rules.push({
  test: /\.css$/,
  use: [
    { loader: 'style-loader' },
    { loader: 'css-loader' },
    { loader: 'postcss-loader' },
  ],
});
```

**Paso 5 — Importar el CSS en el entry point**
```tsx
// src/renderer/main.tsx
import './assets/main.css'
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')).render(<App />)
```

**Verificar que funciona:**
```tsx
<div className="bg-blue-500 text-white p-4 rounded-lg">
  Tailwind funciona
</div>
```

Si el fondo aparece azul, está todo bien. Si no, verificar:
1. `postcss.config.mjs` existe en la raíz con `@tailwindcss/postcss`
2. `src/renderer/assets/main.css` tiene `@import "tailwindcss"`
3. `webpack.renderer.config.ts` incluye `postcss-loader` en el CSS rule
4. `src/renderer/main.tsx` importa `'./assets/main.css'`

---

### Jest

```typescript
// jest.config.ts
import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@shared/(.*)$':   '<rootDir>/src/shared/$1',
    '^@renderer/(.*)$': '<rootDir>/src/renderer/src/$1',
    '^electron$':       '<rootDir>/tests/__mocks__/electron.ts',
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'src/renderer/src/features/**/*.ts',
  ],
  coverageThreshold: {
    global: { branches: 70, functions: 80, lines: 80 }
  }
}

export default config
```

```typescript
// tests/setup.ts
import '@testing-library/jest-dom'

Object.defineProperty(window, 'electronAPI', {
  value: { invoke: jest.fn() },
  writable: true,
})
```

```typescript
// tests/__mocks__/electron.ts
export const app     = { getPath: jest.fn(() => '/tmp') }
export const ipcMain = { handle: jest.fn() }
```

---

## 5. Dónde y cómo corre SQLite

### Respuesta corta

`better-sqlite3` corre **exclusivamente en el main process**. El renderer (React) **no puede** importarlo directamente.

### Por qué solo en main

`better-sqlite3` es un módulo nativo de Node.js — un archivo `.node` compilado en C++. El renderer corre en Chromium, que no tiene acceso a Node.js ni al sistema de archivos. Si intentás hacer `import Database from 'better-sqlite3'` en el renderer, la app explota.

### Dónde queda el archivo `.db`

En la carpeta `userData` del OS, resuelta automáticamente por `app.getPath('userData')`:

```
Windows:  C:\Users\<usuario>\AppData\Roaming\fintrack\fintrack.db
macOS:    ~/Library/Application Support/fintrack/fintrack.db
Linux:    ~/.config/fintrack/fintrack.db
```

### Flujo completo para llegar a la DB desde React

```
React component
  → useAddTransactionMutation()     (RTK Query hook)
  → electronBaseQuery()             (tu baseQuery custom)
  → window.electronAPI.invoke()     (expuesto por preload.ts)
  → ipcRenderer.invoke()            (canal IPC de Electron)
  → ipcMain.handle()                (main process recibe)
  → better-sqlite3                  (ejecuta el SQL)
  → Promise resolve                 (devuelve resultado al renderer)
```

### Por qué better-sqlite3 y no sqlite3

`better-sqlite3` es **síncrono**. En el main process eso está perfecto porque las queries son rápidas y el main process no bloquea la UI (que corre en otro proceso). Tiene también una API muy limpia:

```ts
const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
```

### Gotcha importante al empaquetar

`better-sqlite3` es un módulo nativo, necesita ser **rebuildeado** contra la versión de Node que usa Electron internamente. Sin esto la app empaquetada falla con `NODE_MODULE_VERSION mismatch`.

```json
// package.json
"scripts": {
  "postinstall": "electron-rebuild -f -w better-sqlite3"
}
```

---

## 6. Features y flujos detallados

### Feature 1 — CRUD con RTK Query

El punto clave es el `electronBaseQuery`: RTK Query no sabe que está hablando con Electron en lugar de una API REST. Recibe `{ channel, args }` y hace `window.electronAPI.invoke(channel, args)`.

```
UI (TransactionForm)
  → useAddTransactionMutation()       trigger
  → electronBaseQuery()               llama
  → window.electronAPI.invoke()       IPC invoke
  → ipcMain.handle('transactions:add')
  → SQLite INSERT
  → Promise resolve
  → invalidatesTags(['Transaction'])  refetch automático
  → UI re-renderiza con lista nueva
```

### Feature 2 — Selectors con createSelector

`selectFiltered` es el selector base. Los demás lo toman como input, así la memoización funciona en cascada. Si los filtros no cambian, nada se recalcula.

```
Redux Store (transactions[], filters)
  → selectFiltered          filtra por mes y categoría
      → selectTotals        calcula balance/ingresos/egresos
      → selectByCategory    agrupa y suma por categoría
      → selectMonthlyChart  formatea datos para recharts
```

### Feature 3 — Import/Export CSV con createAsyncThunk

Los tres estados del thunk se manejan con `extraReducers`, dando feedback de loading/error a la UI automáticamente.

```
dispatch(importCSV())
  → pending:    loading = true  (UI muestra spinner)
  → invoke IPC → dialog.showOpenDialog
  → fs.readFileSync
  → parsear CSV
  → db.transaction() bulk INSERT
  → fulfilled:  loading = false (UI actualiza lista)
  → rejected:   error = message (UI muestra error)
```

### Feature 4 — Listener middleware para alertas

El listener middleware es **reactivo, no bloqueante**. La acción llega al store igual, y el efecto corre en paralelo.

```
dispatch(addTransaction.fulfilled)
  → Redux Store se actualiza (flujo normal, no bloqueado)
  → listenerMiddleware.effect() corre en paralelo
      → getState() → calcular gasto total del mes
      → ¿supera límite mensual?
          SÍ → invoke IPC → Notification nativa del OS
          NO → sin efecto
```

### Feature 5 — Tests con Jest

| Qué | Cómo | Qué verifica |
|---|---|---|
| Reducer / slice | `reducer(state, action)` | Estado correcto post-dispatch |
| Selectors | `selector(mockState)` | Valores calculados correctos |
| Async thunks | `jest.fn()` en `window.electronAPI` | Actions dispatched correctas |
| Listener middleware | `configureStore` de test real | IPC fue llamado con args correctos |
| RTK Query endpoints | Mock de `baseQuery` | Cache poblado correctamente |

---

## 7. Proyecto SCRUM

### Resumen

| | |
|---|---|
| Total sprints | 6 |
| Story points | 107 |
| User stories | 29 |
| Duración estimada | 12 semanas |

**Definition of Done:** código con tests (Jest), PR aprobado, sin regresiones en build, feature probada en Electron main + renderer.

---

### Sprint 1 — Setup del proyecto y fundamentos
**Goal:** Tener el proyecto corriendo con todas las tecnologías integradas  
**Duración:** 2 semanas · 18 story points

| ID | Historia | Puntos |
|---|---|---|
| FT-01 | Setup con Electron Forge + Vite + React + TS + Tailwind, estructura de carpetas | 5 |
| FT-02 | Configurar Redux store con RTK + categoriesApi, hooks tipados, Provider en renderer | 3 |
| FT-03 | Configurar Jest + ts-jest + setupTests + mock de `window.electronAPI` | 3 |
| FT-04 | IPC Bridge base: preload.ts, contextBridge, ipcChannels.ts con canales de categorías | 4 |
| FT-05 | SQLite setup: tablas `categories` y `transactions` con FK, categorías por defecto | 3 |

---

### Sprint 2 — CRUD de categorías
**Goal:** Módulo de categorías completamente funcional antes de arrancar transacciones  
**Duración:** 2 semanas · 18 story points

| ID | Historia | Puntos |
|---|---|---|
| FT-06 | `categoriesApi` RTK Query con endpoints getAll, add, update, delete | 4 |
| FT-07 | IPC handlers de categorías: SELECT, INSERT, UPDATE, DELETE (con reasignación a "Otro") | 4 |
| FT-08 | Pantalla Categories: grid de tarjetas con color, nombre y contador de transacciones | 4 |
| FT-09 | Modal New/Edit Category: nombre, color picker (10 swatches), preview del badge | 3 |
| FT-10 | Modal Delete confirmation: mensaje de advertencia sobre reasignación de transacciones | 3 |

---

### Sprint 3 — CRUD de transacciones con RTK Query
**Goal:** App funcional con alta/baja/modificación de transacciones  
**Duración:** 2 semanas · 21 story points

| ID | Historia | Puntos |
|---|---|---|
| FT-11 | `electronBaseQuery` custom + tests unitarios del adapter | 5 |
| FT-12 | `transactionsApi` con endpoints CRUD + cache invalidation con tags | 5 |
| FT-13 | `ipcMain` handlers para SELECT, INSERT, UPDATE, DELETE con SQLite | 4 |
| FT-14 | `TransactionForm` component con Tailwind + `useAddTransactionMutation` + selector de categoría | 4 |
| FT-15 | `TransactionList` con `useGetTransactionsQuery`, loading/error/empty states | 3 |

---

### Sprint 4 — Filtros, selectors y dashboard
**Goal:** Dashboard con estadísticas y filtros funcionales  
**Duración:** 2 semanas · 18 story points

| ID | Historia | Puntos |
|---|---|---|
| FT-16 | `filtersSlice` con `setMonth`, `setCategoryId` + tests del reducer | 3 |
| FT-17 | Selectors con `createSelector`: selectFiltered, selectTotals, selectByCategory, selectMonthlyChart | 5 |
| FT-18 | `StatsCards` component usando `selectTotals` + tests de los valores | 3 |
| FT-19 | `CategoryChart` PieChart con recharts usando `selectByCategory` | 4 |
| FT-20 | `MonthlyChart` BarChart con recharts + navegación por mes | 3 |

---

### Sprint 5 — Import/Export CSV y alertas de presupuesto
**Goal:** Thunks avanzados y listener middleware funcionando  
**Duración:** 2 semanas · 18 story points

| ID | Historia | Puntos |
|---|---|---|
| FT-21 | `importCSV` async thunk: dialog → leer CSV → parsear → bulk INSERT | 5 |
| FT-22 | `exportCSV` async thunk: generar CSV → dialog guardado → escribir con fs | 4 |
| FT-23 | `extraReducers` para CSV en slice: pending/fulfilled/rejected | 3 |
| FT-24 | `budgetSlice` + `listenerMiddleware` que detecta límite superado | 4 |
| FT-25 | Handler IPC en main que dispara `new Notification()` de Electron | 2 |

---

### Sprint 6 — Polish, tests completos y empaquetado
**Goal:** App lista para distribuir con cobertura de tests adecuada  
**Duración:** 2 semanas · 14 story points

| ID | Historia | Puntos |
|---|---|---|
| FT-26 | Suite de tests completa: reducers, selectors, thunks, middleware, categoriesApi | 5 |
| FT-27 | UI polish: sidebar con categorías, react-router-dom, transiciones, estados vacíos | 4 |
| FT-28 | Electron Forge makers config para Windows/Mac/Linux + scripts de package | 3 |
| FT-29 | README y documentación técnica de la arquitectura IPC | 2 |

---

## 8. Pasos a seguir — guía de desarrollo

### Prerrequisitos

Software requerido antes de arrancar:

- **Node.js 18+** — verificar con `node -v`
- **Git**
- **VS Code** con extensiones: ESLint, Tailwind CSS IntelliSense, TypeScript
- **Python + build tools** — requerido para compilar `better-sqlite3`

Build tools por OS:

```bash
# Windows
npm install --global windows-build-tools

# macOS
xcode-select --install

# Linux
sudo apt-get install build-essential python3
```

---

### Sprint 1 — Setup inicial

**Paso 1 — Crear el proyecto con Electron Forge + Webpack**
```bash
npm init electron-app@latest fintrack -- --template=webpack-typescript
cd fintrack
npm install
```

El template `webpack-typescript` genera `forge.config.ts`, `webpack.main.config.ts`, `webpack.renderer.config.ts`, `webpack.rules.ts` y TypeScript preconfigurado. Es el template **estable y recomendado** por la documentación oficial de Electron Forge.

**Paso 2 — Instalar React**
```bash
npm install react react-dom
npm install -D @types/react @types/react-dom
```

**Paso 3 — Instalar dependencias de producción**
```bash
npm install @reduxjs/toolkit react-redux
npm install better-sqlite3
npm install recharts
npm install react-router-dom
```

**Paso 4 — Instalar dependencias de desarrollo**
```bash
npm install -D tailwindcss @tailwindcss/postcss postcss autoprefixer postcss-loader
npm install -D jest ts-jest @types/jest
npm install -D @testing-library/react @testing-library/jest-dom
npm install -D @types/better-sqlite3
```

> `style-loader` y `css-loader` ya vienen incluidos en el template de Electron Forge.
> No se instala `babel-loader` — el template ya incluye `ts-loader` + `ForkTsCheckerWebpackPlugin`, que es equivalente sin dependencias extra.

**Paso 5 — Agregar `"jsx": "react-jsx"` a `tsconfig.json`**

Habilita el nuevo JSX transform de React 17+. No requiere importar React en cada archivo `.tsx`.

```json
"resolveJsonModule": true,
"jsx": "react-jsx",
```

**Paso 6 — `webpack.rules.ts` — no modificar**

El template genera `ts-loader` correctamente. Se mantiene sin cambios.

**Paso 7 — Configurar `webpack.main.config.ts`**

Solo actualizar el `entry`:
```typescript
entry: './src/main/index.ts',
```

**Paso 8 — Configurar `webpack.renderer.config.ts`**

Agregar `postcss-loader` al CSS rule. El CSS rule va aquí (no en `webpack.rules.ts`) porque PostCSS solo aplica al renderer:
```typescript
import type { Configuration } from 'webpack';
import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

rules.push({
  test: /\.css$/,
  use: [
    { loader: 'style-loader' },
    { loader: 'css-loader' },
    { loader: 'postcss-loader' },
  ],
});

export const rendererConfig: Configuration = {
  module: { rules },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
  },
};
```

**Paso 9 — Crear `postcss.config.mjs`** en la raíz
```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}
```
```

**Paso 9 — Crear index.html y entry point de React**

El template genera un `src/index.html`. Moverlo a `src/renderer/index.html` y agregar el div raíz:
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'" />
    <title>FinTrack</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

Crear `src/renderer/main.tsx`:
```tsx
import './assets/main.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './app/store'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
)
```

**Paso 10 — Actualizar forge.config.ts con los entry points correctos**

Reemplazar los `entryPoints` del WebpackPlugin:
```typescript
entryPoints: [
  {
    html:    './src/renderer/index.html',
    js:      './src/renderer/main.tsx',
    name:    'main_window',
    preload: { js: './src/preload/index.ts' },
  },
],
```

**Paso 11 — Crear estructura de carpetas**
```bash
mkdir -p src/main/ipc src/main/db
mkdir -p src/renderer/app
mkdir -p src/renderer/features/transactions
mkdir -p src/renderer/features/categories
mkdir -p src/renderer/features/dashboard
mkdir -p src/renderer/components
mkdir -p src/renderer/pages
mkdir -p src/renderer/assets
mkdir -p src/shared
mkdir -p src/preload
mkdir -p tests/features/transactions
mkdir -p tests/__mocks__
```

**Paso 12 — Verificar que levanta con React**
```bash
npm start
```
Debe abrir una ventana de Electron mostrando el componente `App` de React.
Si hay errores de JSX, verificar que `babel-loader` está configurado en `webpack.rules.ts`
y que los archivos de componentes tienen extensión `.tsx`.

**Paso 13 — Verificar rebuild de better-sqlite3**

Electron Forge detecta y rebuilda módulos nativos automáticamente vía `rebuildConfig`.
Si falla, forzarlo:
```bash
npx electron-rebuild -f -w better-sqlite3
```

---

### Sprints 2 y 3 — RTK Query + Selectors

El orden importa, hay dependencias entre pasos:

1. Crear `src/shared/types.ts` y `src/shared/ipcChannels.ts` (con canales de categorías)
2. Crear `src/main/db/index.ts` con `initDb()`, migraciones y categorías por defecto
3. Crear `src/main/ipc/categories.ts` con los 4 handlers CRUD de categorías
4. Registrar handlers en `src/main/ipc/index.ts`
5. Implementar `preload.ts` con `contextBridge`
6. Implementar `categoriesApi` con RTK Query
7. Construir pantalla de Categories + modales New/Edit/Delete
8. Crear `src/main/ipc/transactions.ts` con los handlers CRUD (usa `category_id`)
9. Implementar `electronBaseQuery` y `transactionsApi`
10. Armar `store.ts` con ambas APIs y hooks tipados en `hooks.ts`
11. Crear `filtersSlice.ts` con `setMonth` y `setCategoryId`
12. Escribir tests del reducer de filters
13. Implementar selectors en cascada con `createSelector`
14. Escribir tests de selectors con estado mockeado
15. Crear componentes React del dashboard conectados a RTK Query y selectors

---

### Sprints 4 y 5 — Thunks, middleware y cierre

**importCSV:**
```typescript
export const importCSV = createAsyncThunk(
  'transactions/importCSV',
  async (_, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.invoke(IPC.TRANSACTIONS_IMPORT)
      return result
    } catch (e) {
      return rejectWithValue(String(e))
    }
  }
)
```

**extraReducers en el slice:**
```typescript
extraReducers: (builder) => {
  builder
    .addCase(importCSV.pending,   (state) => { state.loading = true })
    .addCase(importCSV.fulfilled, (state) => { state.loading = false })
    .addCase(importCSV.rejected,  (state, action) => {
      state.loading = false
      state.error = action.payload as string
    })
}
```

**Notificación en main:**
```typescript
ipcMain.handle(IPC.NOTIFY_BUDGET_EXCEEDED, (_e, data) => {
  new Notification({
    title: 'Límite de presupuesto superado',
    body: `Gastaste $${data.expenses} de $${data.limit}`
  }).show()
})
```

**Tests y empaquetado:**
```bash
npm run test -- --coverage

# Empaquetar sin instalador (solo carpeta)
npm run build

# Generar instalador para el OS actual
npm run make
```

---

## 9. Errores comunes y soluciones

### NODE_MODULE_VERSION mismatch
`better-sqlite3` fue compilado para la versión de Node de tu sistema, no para la de Electron.
Con Electron Forge el rebuild es automático vía `rebuildConfig` en `forge.config.ts`.
Si falla igualmente, forzarlo manualmente:
```bash
npx electron-rebuild -f -w better-sqlite3
```

### window.electronAPI is undefined
El preload no corre o `contextBridge` no está configurado.
```typescript
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: false  // sin esto, contextBridge no funciona
}
```

### RTK Query no invalida el cache
Los tags en `invalidatesTags` y `providesTags` no coinciden.
```typescript
addTransaction: builder.mutation({
  invalidatesTags: ['Transaction'],  // debe coincidir exactamente
}),
getTransactions: builder.query({
  providesTags: ['Transaction'],
})
```

### Selector recalcula siempre
El selector se está creando dentro del componente en cada render.
```typescript
// MAL — nueva instancia en cada render
const MyComponent = () => {
  const sel = createSelector(...)  // no hacer esto
}

// BIEN — instancia estable fuera del componente
const selectFiltered = createSelector(...)
const MyComponent = () => {
  const data = useAppSelector(selectFiltered)
}
```

### Tests fallan por import de Electron
Jest no conoce el módulo `electron`. Mockearlo con `moduleNameMapper`.
```typescript
// jest.config.ts
moduleNameMapper: {
  '^electron$': '<rootDir>/tests/__mocks__/electron.ts',
}
```

### Listener middleware no dispara
El middleware debe agregarse con `.prepend()` antes del middleware de RTK Query.
```typescript
middleware: (getDefaultMiddleware) =>
  getDefaultMiddleware()
    .prepend(listenerMiddleware.middleware)  // primero
    .concat(transactionsApi.middleware)     // después
```

### Tailwind no aplica estilos
En v4 no hay `tailwind.config.js`. El problema suele ser la configuración de PostCSS o que falta `postcss-loader`.

Verificar:
1. `postcss.config.mjs` existe en la raíz con `"@tailwindcss/postcss": {}`
2. `src/renderer/assets/main.css` tiene `@import "tailwindcss"`
3. `webpack.renderer.config.ts` incluye `postcss-loader` en el CSS rule
4. `src/renderer/main.tsx` importa `'./assets/main.css'`

---

## 10. Recursos

### Documentación oficial

| Tecnología | URL | Secciones clave |
|---|---|---|
| Redux Toolkit | https://redux-toolkit.js.org | createSlice, RTK Query, createAsyncThunk, createSelector, createListenerMiddleware |
| Electron | https://www.electronjs.org/docs | Process Model, IPC, Context Isolation |
| Electron Forge | https://www.electronforge.io/config/plugins/webpack | Plugin Webpack, makers, rebuildConfig |
| better-sqlite3 | https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md | prepare(), run/get/all, db.transaction() |
| ts-jest | https://kulshekhar.github.io/ts-jest/docs | Setup, path aliases |
| Tailwind CSS | https://tailwindcss.com/docs | Installation, configuration, dark mode |

### Orden de lectura recomendado

No leer toda la documentación antes de arrancar. Leer solo la sección que se necesita para el paso en el que se está:

1. **Sprint 1:** Electron Forge Vite guide → Electron Process Model
2. **Sprint 2:** RTK Quick Start → RTK Query Overview → Electron IPC
3. **Sprint 3:** createSelector (reselect) → RTK Query Cache
4. **Sprint 4:** createAsyncThunk → createListenerMiddleware
5. **Sprint 5:** Jest + ts-jest setup → Electron Forge makers

---

*Generado con Claude — FinTrack project guide v1.2 — Electron Forge + Webpack + React*
