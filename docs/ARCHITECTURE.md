# System Architecture

## Overview

Wrapster follows a modern client-server architecture with a React single-page application (SPA) frontend and Appwrite as the Backend-as-a-Service (BaaS) platform. Background job processing is handled by Trigger.dev.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Browser                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    React Application                         ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐││
│  │  │  Pages   │ │Components│ │  Hooks   │ │    Contexts      │││
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘││
│  │       │            │            │                 │          ││
│  │  ┌────┴────────────┴────────────┴─────────────────┴─────────┐││
│  │  │                    Service Layer                          │││
│  │  │  (auth.ts, database.ts, products.ts, packaging.ts, etc)  │││
│  │  └────────────────────────┬──────────────────────────────────┘││
│  └───────────────────────────┼───────────────────────────────────┘│
└──────────────────────────────┼────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │      Internet       │
                    └──────────┬──────────┘
                               │
     ┌─────────────────────────┼─────────────────────────┐
     │                         │                         │
     ▼                         ▼                         ▼
┌─────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Appwrite   │      │   Trigger.dev   │      │     Resend      │
│   Cloud     │      │   Job Queue     │      │  Email Service  │
├─────────────┤      ├─────────────────┤      ├─────────────────┤
│ - Auth      │◄────►│ - Import Jobs   │      │ - Send Reports  │
│ - Database  │      │ - Export Jobs   │──────►│ - Attachments   │
│ - Storage   │◄────►│ - Report Jobs   │      │                 │
│ - Functions │      │ - Email Jobs    │      │                 │
└─────────────┘      └─────────────────┘      └─────────────────┘
```

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.0 | UI library |
| TypeScript | 5.9.3 | Type-safe JavaScript |
| Vite | 7.2.4 | Build tool and dev server |
| Tailwind CSS | 4.1.18 | Utility-first CSS framework |
| TanStack Query | 5.90.12 | Server state management |
| TanStack Table | 8.21.3 | Headless table component |
| React Router | 7.11.0 | Client-side routing |
| React Hook Form | 7.69.0 | Form state management |
| Zod | 4.2.1 | Schema validation |
| i18next | 25.7.3 | Internationalization |

### UI Components

| Library | Purpose |
|---------|---------|
| shadcn/ui | Pre-built component library |
| Radix UI | Unstyled, accessible primitives |
| Lucide React | Icon library |
| Sonner | Toast notifications |
| react-day-picker | Date selection |

### Backend Services

| Service | Purpose |
|---------|---------|
| Appwrite | Authentication, database, storage |
| Trigger.dev | Background job processing |
| Resend | Transactional email delivery |

### Document Generation

| Library | Purpose |
|---------|---------|
| XLSX | Excel file generation |
| jsPDF + jsPDF-AutoTable | Client-side PDF generation |
| pdfkit + pdfkit-table | Server-side PDF generation |
| jsbarcode | Barcode rendering |

### Testing

| Tool | Purpose |
|------|---------|
| Vitest | Unit testing |
| Testing Library | React component testing |
| Playwright | End-to-end testing |

## Design Patterns

### Service Layer Pattern

All backend communication is abstracted through a service layer in `src/lib/appwrite/`:

```typescript
// Generic database service
databaseService.createDocument<T>(collectionId, data)
databaseService.listDocuments<T>(collectionId, queries)

// Domain-specific services
productService.create(product)
productService.search(query)
packagingRecordService.getByDate(date)
```

### React Query for Server State

Server state is managed using TanStack Query with custom hooks:

```typescript
// Data fetching with caching
const { data, isLoading } = useProducts({ type: 'single' })

// Mutations with cache invalidation
const createProduct = useCreateProduct()
await createProduct.mutateAsync(newProduct)
```

### Context API for Global State

Application-wide state is managed through React Context:

- **AuthContext**: User authentication state
- **LoadingContext**: Global loading indicators

### Form Handling

Forms use React Hook Form with Zod validation:

```typescript
const schema = z.object({
  barcode: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['single', 'bundle'])
})

const form = useForm({ resolver: zodResolver(schema) })
```

## Data Flow

### Read Operations

```
User Action → React Query Hook → Service Layer → Appwrite SDK → Database
                  ↓
              Cache Update
                  ↓
            Component Re-render
```

### Write Operations

```
User Action → Form Submit → Mutation Hook → Service Layer → Appwrite SDK
                                 ↓
                          Cache Invalidation
                                 ↓
                          Automatic Refetch
```

### Background Jobs

```
User Trigger → Queue Job → Create DB Record → Trigger.dev Task
                                                     ↓
                                              Process Data
                                                     ↓
                                              Update DB Record
                                                     ↓
                                              Upload Result File
                                                     ↓
UI Polling ← React Query ← Job Status Update ←──────┘
```

## Security

### Authentication

- Email/password authentication via Appwrite
- Session-based authentication with automatic token refresh
- Protected routes via AuthGuard component

### Authorization

- User-scoped data access (user_id filters)
- Appwrite permissions on documents
- API key authentication for server-side operations

### Data Validation

- Zod schemas for client-side validation
- Server-side validation in Appwrite
- Type-safe database operations

## Scalability Considerations

### Frontend

- Virtual scrolling for large lists (TanStack Virtual)
- React Query caching reduces API calls
- Code splitting via Vite

### Backend

- Appwrite handles scaling automatically
- Trigger.dev manages job concurrency (5 per task type)
- Batched database operations for imports

### Storage

- Appwrite Storage for file management
- Automatic file cleanup for temporary exports
