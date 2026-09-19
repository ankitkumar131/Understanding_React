# Redux Toolkit Cheat Sheet

> Store, slices, typed hooks, async thunks, selectors. Deep version: [Part 9 · 03–05](../09-state-management/)

## First: do you need it?

```text
Data from an API                     → TanStack Query (server state), NOT Redux
Theme, locale, current user, cart    → Redux Toolkit or Zustand (client state)
One or two values in one subtree     → useState / lift state up
Cross-cutting, rarely-changing value → Context
```

Redux Toolkit (RTK) earns its place when you need devtools time-travel, middleware, many slices
with complex interactions, or a large team that benefits from a single explicit pattern.
→ [Part 9 · 01](../09-state-management/01-state-management.md)

## Install

```bash
npm install @reduxjs/toolkit react-redux
```

## A slice

```ts
// src/features/cart/cartSlice.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface CartItem { id: string; name: string; price: number; quantity: number }

interface CartState {
  items: CartItem[];
  couponCode: string | null;
  status: 'idle' | 'saving';
}

const initialState: CartState = { items: [], couponCode: null, status: 'idle' };

export const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    // "Mutating" syntax is allowed — Immer produces a new state immutably
    itemAdded(state, action: PayloadAction<CartItem>) {
      const existing = state.items.find((item) => item.id === action.payload.id);
      if (existing) existing.quantity += 1;
      else state.items.push(action.payload);
    },
    quantityChanged(state, action: PayloadAction<{ id: string; quantity: number }>) {
      const item = state.items.find((i) => i.id === action.payload.id);
      if (!item) return;
      if (action.payload.quantity <= 0) {
        state.items = state.items.filter((i) => i.id !== action.payload.id);
      } else {
        item.quantity = action.payload.quantity;
      }
    },
    itemRemoved(state, action: PayloadAction<string>) {
      state.items = state.items.filter((item) => item.id !== action.payload);
    },
    couponApplied(state, action: PayloadAction<string>) {
      state.couponCode = action.payload;
    },
    cartCleared(state) {
      return initialState;                     // returning a value replaces the state entirely
    },
  },
});

export const { itemAdded, quantityChanged, itemRemoved, couponApplied, cartCleared } = cartSlice.actions;
export default cartSlice.reducer;
```

⚠️ **Immer rules:** inside a reducer you may mutate the *draft* (`state.items.push(...)`) **or**
return a new value — never both, and never mutate something that is not the draft (a prop, a
value from outside the slice).

## The store

```ts
// src/app/store.ts
import { configureStore } from '@reduxjs/toolkit';
import cartReducer from '@/features/cart/cartSlice';
import uiReducer from '@/features/ui/uiSlice';

export const store = configureStore({
  reducer: { cart: cartReducer, ui: uiReducer },
  // middleware: (getDefault) => getDefault().concat(myMiddleware),
  devTools: import.meta.env.MODE !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

```tsx
// src/app/providers.tsx
import { Provider } from 'react-redux';
import { store } from './store';

export function Providers({ children }: { children: ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
```

## Typed hooks (do this once, use everywhere)

```ts
// src/app/hooks.ts
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './store';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
```

```tsx
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { itemAdded, itemRemoved } from '@/features/cart/cartSlice';

function Cart() {
  const items = useAppSelector((state) => state.cart.items);
  const dispatch = useAppDispatch();

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          {item.name} × {item.quantity}
          <button onClick={() => dispatch(itemRemoved(item.id))}>Remove</button>
        </li>
      ))}
    </ul>
  );
}
```

⚠️ **Use the typed hooks, never the raw ones.** Without them, `dispatch` will not accept a thunk
and selectors lose their types.

## Selectors

```ts
// Inline — fine for simple reads
const total = useAppSelector((state) => state.cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0));
```

⚠️ **An inline selector that returns a new object or array re-renders on every store change**,
because `useSelector` compares by reference:

```tsx
// ❌ New object every time → re-renders constantly
const { items, couponCode } = useAppSelector((state) => ({ items: state.cart.items, couponCode: state.cart.couponCode }));

// ✅ Two selectors, each returning a stable reference
const items = useAppSelector((state) => state.cart.items);
const couponCode = useAppSelector((state) => state.cart.couponCode);
```

```ts
// Memoised, reusable selectors
import { createSelector } from '@reduxjs/toolkit';

const selectCartItems = (state: RootState) => state.cart.items;
const selectCoupon = (state: RootState) => state.cart.couponCode;

export const selectCartTotal = createSelector([selectCartItems, selectCoupon], (items, coupon) => {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return coupon ? subtotal * 0.9 : subtotal;
});

export const selectItemCount = createSelector([selectCartItems], (items) =>
  items.reduce((sum, i) => sum + i.quantity, 0));
```

## Async thunks

```ts
// src/features/cart/cartThunks.ts
import { createAsyncThunk } from '@reduxjs/toolkit';
import { cartApi } from './cartApi';

export const checkout = createAsyncThunk<
  Order,                     // the resolved value
  CartItem[],                // the argument
  { rejectValue: string }    // the error type
>('cart/checkout', async (items, { rejectWithValue }) => {
  try {
    return await cartApi.checkout(items);
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Checkout failed');
  }
});
```

```ts
// Handle the three lifecycle actions with extraReducers
export const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: { /* … */ },
  extraReducers: (builder) => {
    builder
      .addCase(checkout.pending, (state) => { state.status = 'saving'; })
      .addCase(checkout.fulfilled, (state) => { state.status = 'idle'; state.items = []; })
      .addCase(checkout.rejected, (state, action) => {
        state.status = 'idle';
        state.error = action.payload ?? 'Checkout failed';
      });
  },
});
```

```tsx
const status = useAppSelector((state) => state.cart.status);
const error  = useAppSelector((state) => state.cart.error);
const dispatch = useAppDispatch();

<button disabled={status === 'saving'} onClick={() => void dispatch(checkout(items))}>
  {status === 'saving' ? 'Placing order…' : 'Checkout'}
</button>
{error && <p role="alert">{error}</p>}
```

🏭 **If the async work is fetching server data, use TanStack Query instead.** Thunks are right
for *commands* (checkout, save draft, upload); queries are right for *reads* that need caching,
deduplication and invalidation.

## The listener middleware (side effects)

```ts
import { addListener, createListenerMiddleware } from '@reduxjs/toolkit';

const listenerMiddleware = createListenerMiddleware();
listenerMiddleware.startListening({
  actionCreator: cartCleared,
  effect: (_action, listenerApi) => { localStorage.removeItem('cart'); },
});

export const store = configureStore({
  reducer: { cart: cartReducer },
  middleware: (getDefault) => getDefault().prepend(listenerMiddleware.middleware),
});
```

## Persisting (optional)

```bash
npm install redux-persist
```

```ts
import { persistReducer, persistStore, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

const persistedCart = persistReducer({ key: 'cart', storage, version: 1 }, cartReducer);

export const store = configureStore({
  reducer: { cart: persistedCart },
  middleware: (getDefault) => getDefault({ serializableCheck: { ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER] } }),
});
export const persistor = persistStore(store);
```

```tsx
<PersistGate loading={<Spinner />} persistor={persistor}><App /></PersistGate>
```

⚠️ **Version the persist config** and write a `migrate` function. Users with an old shape in
`localStorage` will otherwise crash on boot — the same defence as the `try/catch` around
`JSON.parse` in [Part 14 · 05](../14-authentication/05-token-management.md).

## Zustand (the lighter alternative)

```ts
// src/features/cart/store.ts
import { create } from 'zustand';

interface CartStore {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (id: string) => void;
}

export const useCart = create<CartStore>((set) => ({
  items: [],
  add: (item) => set((state) => ({ items: [...state.items, item] })),
  remove: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
}));

// Component — selector-based, so only relevant changes re-render
const items = useCart((state) => state.items);
const add = useCart((state) => state.add);
```

No provider, no actions, no reducers, ~1 kB. Choose it when you want a global store without
Redux's structure. → [Part 9 · 05](../09-state-management/05-zustand.md)

## DevTools

Install the **Redux DevTools** browser extension. `configureStore` enables them automatically in
development. You get: the full action list, the state after each action, time travel, and action
diffs — the reason teams accept Redux's boilerplate.

## Diagnostics

| Symptom | Cause → fix |
| --- | --- |
| `dispatch` rejects a thunk | Using `useDispatch` instead of the typed `useAppDispatch` |
| A component re-renders on every store change | An inline selector returning a new object — split it or memoise |
| State does not update | Mutating outside the draft, or returning *and* mutating |
| "A non-serializable value was detected in the state" | A `Date`, `Promise` or class instance in the store — store primitives |
| Action fires but nothing changes | The reducer name does not match, or you imported the wrong slice |
| Thunk error is `undefined` | You did not `rejectWithValue`, so it landed in `action.error`, not `action.payload` |
| Persisted state crashes after a schema change | Bump `version` and add a `migrate` function |
