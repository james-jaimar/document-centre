

## Web-to-Print SaaS Platform — Stage 0: Foundation Shell

### What we're building first
The app shell with authentication, role-based routing, and the basic portal structure for all user types. This gives us the skeleton to build the document engine into.

### Key Principles (embedded throughout)
- **Minimal hard-coding** — all configurable elements (product families, finishing options, branch capabilities, etc.) are managed through admin CRUD interfaces, not code changes
- **PRD as living reference** — stored in-app as a knowledge document to guide all future work

### Pages & Navigation

**1. Auth Flow**
- Login / Register pages with email auth
- Post-login redirect based on user role
- Password reset flow

**2. Customer Portal** (`/dashboard`)
- Welcome screen with "Start New Order" CTA
- Order history list
- Account settings

**3. Branch Portal** (`/branch`)
- Branch order queue
- Job status management
- Local settings

**4. Head Office Admin** (`/admin`)
- Tenant settings & branding
- Branch management (CRUD)
- Product families management (CRUD)
- Product options management (CRUD)
- Pricing rules management (CRUD)
- Branch capabilities management (CRUD)
- User & role management

**5. Platform Admin** (`/platform`)
- Tenant management (CRUD)
- Global settings

### Layout & Design
- Match the Print Stream Labels UI style — clean sidebar navigation, card-based layouts
- Responsive with mobile support
- Role-based sidebar that shows only relevant sections

### Database
- Schema is already in place (tenants, branches, profiles, user_roles, product_families, product_options, pricing_rules, branch_capabilities)
- May need additional tables for documents/orders in Stage 2+

### What comes next (Stage 2)
Once this shell is solid, we dive into the **Document Engine MVP** — the heart of the platform:
- File upload pipeline via Edge Functions → AllianceBox
- Document processing, inspection, and preview asset generation
- Image-based flipbook preview
- Document builder UI (source tray → build sequence → live preview)

