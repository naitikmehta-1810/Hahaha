# Copilot instructions for this repository

## Build, lint, and test commands

- Install dependencies: `npm install`
- Start local dev server: `npm run dev`
- Build production bundle: `npm run build`
- Start production server (after build): `npm run start`
- Lint entire repo: `npm run lint`
- Lint a single file: `npx eslint src\components\Seller\AddProduct.tsx`
- Test suite: no test runner/script is currently configured in `package.json`
- Single test: not available until a test framework is added

## High-level architecture

- This is a **Next.js App Router** storefront template. Routes are under `src\app\(site)`, with most page files acting as thin wrappers that set `metadata` and render a component from `src\components`.
- There is no `src\app\layout.tsx`; the effective app shell is `src\app\(site)\layout.tsx` (client component). It applies global CSS, shows a preloader, and wraps all routes with:
  - `ReduxProvider` (`src\redux\provider.tsx`)
  - UI modal context providers (`src\app\context\*.tsx`)
  - shared chrome/components (`Header`, `Footer`, `QuickViewModal`, `CartSidebarModal`, `PreviewSliderModal`, `ScrollToTop`)
- State is split across:
  - **Redux slices** for commerce data (`cart`, `wishlist`, `quickView`, `productDetails`) in `src\redux\features\`
  - **React Context** for UI modal visibility (`QuickViewModalContext`, `CartSidebarModalContext`, `PreviewSliderContext`)
- Most catalog/blog content is template data (for example `src\components\Shop\shopData.ts`) and static assets from `public\images`.
- Seller pages (`/seller*`) are fully client-side and persist data in `localStorage` via `src\components\Seller\sellerStorage.ts` under the `seller-products` key.

## Key conventions in this codebase

- Use the `@/*` import alias (configured in `tsconfig.json`) instead of long relative paths.
- Keep App Router pages lightweight: route files in `src\app\(site)\...` usually only export metadata and render one feature component.
- Product-detail navigation relies on state handoff, not dynamic route params:
  - `ProductItem` dispatches selected product to Redux (`updateproductDetails`, `updateQuickView`)
  - `ShopDetails` reads from Redux and mirrors to `localStorage` (`productDetails`) as fallback
- If you add or change seller features, read/write through `loadSellerProducts` and `saveSellerProducts` instead of direct scattered `localStorage` access.
- UI styling depends on project-specific Tailwind tokens (custom colors, spacing, shadows, breakpoints) in `tailwind.config.ts`; prefer existing utility patterns/tokens over introducing ad-hoc values.
- README context: this is the **Stuffsy free/lite template** with static pages and core storefront UI; advanced backend integrations are not wired as part of this template baseline.
