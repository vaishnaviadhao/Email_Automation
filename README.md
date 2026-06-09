# ReachX — Email Marketing Platform

ReachX is a full-stack email marketing platform built for modern GTM teams. It combines Gmail & Zoho OAuth sending, real-time email validation, per-recipient pixel tracking, visual workflow automation, and deep campaign analytics—all in one place.

---

## What We Offer

### Multi-Provider OAuth Sending
Connect multiple Gmail and/or Zoho accounts via OAuth2. ReachX automatically prefers Zoho accounts when available, then falls back to Gmail. Round-robin sends across all active accounts to maximize deliverability without hitting provider limits. No SMTP configuration required.

### Campaign Engine
Create email campaigns with a subject line, HTML content, and a recipient list. Send immediately or schedule for a future date. Track delivery, opens, clicks, bounces, and unsubscribes per campaign.

### Email Validation
Validate email addresses before sending—format checks, MX record lookups, and mailbox existence verification. Bulk validate your full contact list in one go to protect your sender reputation.

### Pixel Folder
Manage tracking pixels and image assets in a central folder. Create named tracking pixels, upload images, and insert them into campaigns with a single click. See per-recipient open stats per pixel asset—know exactly who opened, when, and from which campaign.

### Open & Click Tracking
Every email sent includes a per-recipient tracking pixel and rewritten click links. Opens and clicks are recorded individually per recipient, giving you real engagement data—not campaign-level estimates.

### Visual Workflow Builder
An n8n-style drag-and-drop canvas for building email automation sequences. Add steps (Trigger, Send Email, Wait, If/Else, Update Tag, Remove Tag, End), connect them with arrows, and configure each step in a side panel. If/Else nodes support Yes/No branch routing.

### Contacts & Segments
Import contacts via CSV or add manually. Tag contacts, create dynamic segments by tag or status, and filter your list before sending. Bulk delete, export to CSV, and search across your full contact database.

### Analytics
Per-campaign analytics including sent count, open rate, click rate, bounce rate, and unsubscribe count. Dashboard overview with aggregate stats across all campaigns.

### Scheduled Campaigns
Schedule campaigns to send at a future date and time. A built-in scheduler checks every 60 seconds and fires scheduled campaigns automatically.

### Follow-up Workflows
Attach a workflow to any campaign. After sending, contacts are automatically enrolled into the linked workflow based on a trigger (all recipients, opened, or clicked).

### Workflow Automation Engine
Background BullMQ workers process workflow enrollments with Redis. Supports wait steps (minutes, hours, days), conditional branching, tag updates, and email sends—all non-blocking.

---

## Tech Stack

### Frontend (`reachx-frontend`)
- React 18 + Vite
- React Router v6
- Tailwind CSS
- @xyflow/react (workflow canvas)
- Vanilla CSS (landing page animations)

### Backend (`reachx-backend`)
- Node.js + Express
- Prisma ORM + PostgreSQL
- BullMQ + Redis (email & workflow queues)
- Nodemailer + Gmail OAuth2 (Gmail sending)
- Zoho Mail REST API + OAuth2 (Zoho sending)
- googleapis (Google OAuth2 token management)
- JWT authentication
- Multer (image uploads)

---

## Project Structure

```
Email_Automation/
├── reachx-frontend/        # Vite + React frontend
│   ├── src/
│   │   ├── components/     # Sidebar
│   │   ├── pages/
│   │   │   ├── dashboard/  # All dashboard pages
│   │   │   ├── LandingPage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   └── RegisterPage.jsx
│   │   └── lib/            # API client, auth helpers
│   └── .env                # VITE_API_URL, Gmail/Zoho OAuth credentials
│
└── reachx-backend/         # Express API server
    ├── src/
    │   ├── routes/         # campaigns, contacts, pixels, gmail, zoho, workflows, track, etc.
    │   ├── lib/            # smtp, gmail, zoho, prisma, rewriteLinks, workflowQueue
    │   ├── workers/        # emailWorker, workflowWorker
    │   └── middleware/     # requireAuth (JWT)
    ├── prisma/
    │   └── schema.prisma   # Full DB schema including GmailAccount & ZohoAccount
    ├── uploads/            # Uploaded images served as static files
    └── .env                # DATABASE_URL, GOOGLE/ZOHO_CLIENT_ID/SECRET, JWT_SECRET, etc.
```

---

## Getting Started

### Prerequisites
- Node.js >= 20
- PostgreSQL
- Redis

### 1. Clone and install

```bash
# Install backend dependencies
cd reachx-backend
npm install

# Install frontend dependencies
cd ../reachx-frontend
npm install
```

### 2. Configure environment

**`reachx-backend/.env`**
```env
DATABASE_URL="postgresql://user:password@localhost:5432/reachx"
JWT_SECRET="your-secret"
APP_URL="http://localhost:4000"
FRONTEND_URL="http://localhost:3000"
REDIS_URL="redis://localhost:6379"

# Gmail OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:4000/api/gmail/callback"

# Zoho OAuth (India region example)
ZOHO_AUTH_DOMAIN="https://accounts.zoho.in"
ZOHO_CLIENT_ID="your-zoho-client-id"
ZOHO_CLIENT_SECRET="your-zoho-client-secret"
ZOHO_LOGIN_REDIRECT_URI="http://localhost:4000/api/auth/zoho-callback"
ZOHO_REDIRECT_URI="http://localhost:4000/api/zoho/callback"

# Gemini API (for AI-powered email templates)
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_PROJECT="your-gemini-project"
```

**`reachx-frontend/.env`**
```env
VITE_API_URL=http://localhost:4000
```

### 3. Run database migrations

```bash
cd reachx-backend
npx prisma db push
```

### 4. Start the servers

```bash
# Backend
cd reachx-backend
npm run dev

# Frontend (in another terminal)
cd reachx-frontend
npm run dev
```

The app will be available at `http://localhost:3000`.

---

## Key API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a new account |
| POST | `/api/auth/login` | Login and receive JWT |
| GET | `/api/auth/google-url` | Get Google OAuth URL for Gmail login |
| GET | `/api/auth/zoho-url` | Get Zoho OAuth URL for Zoho login |
| GET | `/api/auth/callback` | Gmail OAuth callback (login flow) |
| GET | `/api/auth/zoho-callback` | Zoho OAuth callback (login flow) |
| GET | `/api/campaigns` | List all campaigns |
| POST | `/api/campaigns/:id/send` | Send a campaign (auto-selects Zoho or Gmail) |
| POST | `/api/campaigns/:id/schedule` | Schedule a campaign |
| GET | `/api/contacts` | List contacts |
| POST | `/api/contacts/import` | Bulk import contacts from CSV |
| GET | `/api/pixels` | List pixel folder assets |
| POST | `/api/pixels/upload` | Upload an image asset |
| GET | `/api/gmail/auth-url` | Get Google OAuth URL for Gmail connect |
| GET | `/api/gmail/callback` | OAuth callback—saves Gmail account |
| GET | `/api/gmail/accounts` | List connected Gmail accounts |
| PATCH | `/api/gmail/accounts/:id` | Toggle Gmail account active/inactive |
| DELETE | `/api/gmail/accounts/:id` | Disconnect a Gmail account |
| GET | `/api/zoho/auth-url` | Get Zoho OAuth URL for Zoho connect |
| GET | `/api/zoho/callback` | OAuth callback—saves Zoho account |
| GET | `/api/zoho/accounts` | List connected Zoho accounts |
| PATCH | `/api/zoho/accounts/:id` | Toggle Zoho account active/inactive |
| DELETE | `/api/zoho/accounts/:id` | Disconnect a Zoho account |
| GET | `/api/track` | Tracking pixel endpoint (opens + clicks) |
| GET | `/api/workflows` | List workflows |
| PUT | `/api/workflows/:id/steps` | Save workflow steps |
| GET | `/api/stats` | Dashboard aggregate stats |

---

## Gmail OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Gmail API**
3. Create OAuth 2.0 credentials (Web application type)
4. Add `http://localhost:4000/api/gmail/callback` as an authorized redirect URI
5. Add test users in OAuth consent screen
6. Copy Client ID and Secret to `.env`
7. In the app: Settings → Connect Gmail → authorize each account, OR Login → Continue with Gmail

---

## Zoho OAuth Setup

1. Go to [Zoho API Console](https://api-console.zoho.in/) (India region) or [api-console.zoho.com](https://api-console.zoho.com) (US region)
2. Create a new Self Client application
3. Add `http://localhost:4000/api/auth/zoho-callback` and `http://localhost:4000/api/zoho/callback` as redirect URIs
4. Copy Client ID and Secret to `.env`
5. Set `ZOHO_AUTH_DOMAIN` to match your region (e.g., `https://accounts.zoho.in` for India)
6. In the app: Login → Continue with Zoho (auto-saves account), OR Settings → Connect Zoho → authorize

---

## Send Provider Priority

- **Zoho is preferred** when at least one active Zoho account exists
- **Gmail is used** only if no active Zoho accounts are available
- Sends are **round-robined** across all active accounts of the chosen provider

To control which provider is used:
- **Use Zoho**: Ensure at least one Zoho account is connected and active in Settings
- **Use Gmail only**: Disconnect all Zoho accounts or toggle them inactive

---

## License

MIT
