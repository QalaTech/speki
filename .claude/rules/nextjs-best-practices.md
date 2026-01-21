```markdown
---
paths:
  - "**/app/**/*"
  - "**/pages/**/*"
  - "**/components/**/*"
  - "**/lib/**/*"
  - "**/utils/**/*"
  - "**/middleware.ts"
  - "*.ts"
  - "*.tsx"
---

# Next.js Best Practices

Strictly follow these **official Next.js best practices** (distilled from the Next.js documentation) for all Next.js
projects (version 13+ with App Router preferred). The goal is performant, maintainable, scalable, and SEO-friendly
applications leveraging Server Components, streaming, and modern React features.

Prefer the **App Router** (`app/` directory) over the legacy Pages Router (`pages/`) for new projects—it is the
recommended default.

## Project Structure (App Router)

Organize for clarity, scalability, and colocation:

```

app/
├── layout.tsx # Root layout (required)
├── page.tsx # Home page
├── [slug]/ # Dynamic routes
│ └── page.tsx
├── dashboard/
│ ├── layout.tsx # Nested layout
│ ├── page.tsx
│ └── settings/
│ └── page.tsx
├── api/ # Route Handlers (server-side API routes)
│ └── route.ts
├── components/ # Reusable UI components
├── lib/ # Utilities, data fetching, etc.
├── styles/ # Global styles
└── middleware.ts # Optional middleware

```

- Colocate related files (data fetching, components) with routes.
- Use nested layouts for shared UI.
- Keep `public/` for static assets.

## Routing

- Use **file-system routing** in `app/`.
- Dynamic segments: `[slug]`, `[...catchAll]`.
- Parallel routes (`@slot`) and intercepting routes for advanced patterns.
- Prefer **client-side navigation** with `<Link>`.

```tsx
// app/blog/[slug]/page.tsx
export default function Post({ params }: { params: { slug: string } }) {
  return <h1>Post: {params.slug}</h1>;
}
```

## Data Fetching & Rendering

- **Server Components by default** (no `'use client'`).
- Fetch data directly in Server Components (no need for `getServerSideProps`).
- Use `async/await` with `fetch` (Next.js extends caching).
- **Caching strategies**:
    - `fetch(..., { cache: 'force-cache' })` → static
    - `fetch(..., { next: { revalidate: 60 } })` → ISR
    - `fetch(..., { cache: 'no-store' })` → dynamic
- **Streaming** with `Suspense` and `loading.tsx`.
- **Server Actions** for mutations (forms, no API routes needed).
- Client Components only when needed (`'use client'`).

```tsx
// Server Component
async function getData() {
    const res = await fetch('https://api.example.com/data', {cache: 'force-cache'});
    return res.json();
}

export default async function Page() {
    const data = await getData();
    return <div>{data.title}</div>;
}
```

```tsx
// Server Action
'use server';

export async function createPost(formData: FormData) {
    // mutate data
}
```

## Components

- Server Components for data-heavy UI.
- Client Components for interactivity (`useState`, `useEffect`).
- Use **Partial Prerendering** (PPR) for mixed static/dynamic.
- Avoid unnecessary `'use client'`.

## Optimization

- **Image**: Use `<Image>` component (automatic optimization).
- **Font**: Use `next/font` (self-hosted, optimized).
- **Script**: Use `<Script>` with strategies (`beforeInteractive`, `afterInteractive`, `lazyOnload`).
- **Metadata**: Define in `metadata` object or `generateMetadata`.
- **Analytics**: Use `next/script` or partial hydration.

```tsx
import Image from 'next/image';

<Image src="/hero.jpg" width={1200} height={600} alt="Hero" priority/>
```

## Security & Environment

- Use **environment variables** with `NEXT_PUBLIC_` prefix for client.
- **Middleware** for auth, redirects, rewrites.
- Validate with Zod or similar in Server Actions.

## Error Handling & Loading States

- `error.tsx` for error boundaries.
- `loading.tsx` for Suspense fallbacks.
- `not-found.tsx` for 404.

## Testing & Tooling

- Use Jest/React Testing Library or Playwright.
- Lint with ESLint (Next.js config).
- Type-check with TypeScript.

## Deployment & Performance

- Deploy on Vercel for optimal features (edge functions, ISR).
- Analyze with `next build` and Lighthouse.
- Enable Turbopack for faster dev (`next dev --turbo`).

## Quick Checklist (Before Every Next.js Commit/PR)

- [ ] App Router used (unless legacy)
- [ ] Server Components by default
- [ ] Data fetched in Server Components with proper caching
- [ ] Streaming/Suspense where beneficial
- [ ] Optimized images/fonts/scripts
- [ ] Metadata defined
- [ ] Error/loading/not-found handled
- [ ] No unnecessary client-side code
- [ ] Environment vars prefixed correctly
- [ ] TypeScript strict mode
- [ ] Lint/type-check pass

## Full Reference

For complete explanations, advanced patterns (Parallel Routes, Intercepting Routes, Route Handlers, Turbopack, etc.),
and the full official documentation, consult the detailed guide in the project folder:

`references/next-js-guides/next_js_guides.txt`