# Avatar Removal + Legal Pages (T&C Rewrite + Privacy Policy)

**Date:** 2026-06-14  
**Status:** Approved

---

## Part 1 — Avatar Removal

### Goal
Remove the DiceBear cartoon avatar builder entirely. Keep profile photo uploads.

### What gets deleted
- `src/components/AvatarBuilder.tsx` — delete file
- `@dicebear/core` and `@dicebear/collection` — remove from `package.json` / `pnpm-lock.yaml`

### What gets simplified

**`src/components/AvatarPicker.tsx`**
- Remove the two-tab UI ("Build avatar" / "Upload photo")
- Become a single photo-upload component only
- Remove all `AvatarBuilder` import and usage, all `avatarConfig` / `AvatarConfig` state
- Keep the Supabase storage upload logic (`avatars` bucket, `avatar_url`)
- Keep the `saveConfig` pathway removed; only `handleUpload` remains

**`src/components/UserAvatar.tsx`**
- Remove the `avatarConfig` / `AvatarConfig` prop
- Remove the `buildSvgUrl` function and the DiceBear SVG rendering branch
- Keep: photo URL branch (`avatarUrl` → `<img>`) and initials fallback
- Result: two cases instead of three

**`src/lib/chat/types.ts`**
- Delete the `AvatarConfig` type entirely
- Remove `avatar_config: AvatarConfig | null` from `ChatMember`

**`src/components/chat/ChatRealtimeProvider.tsx`**
- Remove `avatar_config` from the Supabase `.select()` string
- Remove `AvatarConfig` import
- Remove `avatar_config: row.profiles?.avatar_config ?? null` from the member map

**`src/components/chat/MessageThread.tsx`**
- Remove `avatarConfig={members[m.sender_id]?.avatar_config}` from `<UserAvatar>`

**`src/components/chat/ConversationList.tsx`**
- Remove `avatarConfig={m?.avatar_config}` from `<UserAvatar>`

**`src/components/chat/NewDmDialog.tsx`**
- Remove `avatarConfig={m.avatar_config}` from `<UserAvatar>`

**`src/app/settings/page.tsx`**
- Remove `import type { AvatarConfig } from '@/lib/chat/types'`
- Remove `avatar_config` from the Supabase `.select()` string
- Remove `initialAvatarConfig={(profile?.avatar_config ?? null) as AvatarConfig | null}` prop from `<AvatarPicker>`
- Pass only `userId`, `initialAvatarUrl`, `displayName` to the simplified `AvatarPicker`

### Database migration
- File: `supabase/schema-NNN-drop-avatar-config.sql`
- Content: `ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_config;`
- Applied via Supabase MCP `apply_migration`

### Verification
- `pnpm run build` passes clean (no references to `AvatarConfig` or `avatarConfig` remaining)
- Manual smoke: settings page shows only photo upload, no avatar builder tab
- Chat: `UserAvatar` renders photo or initials correctly in message thread, DM list, conversation list

---

## Part 2 — Terms of Service Rewrite

### Goal
Replace the existing thin T&C at `/terms` with a professional, comprehensive document that:
- Clearly absolves Vividex and TimeWiseHub of liability for user misconduct
- Covers all four misconduct categories: harassment/defamation, illegal uploads, data misuse, unauthorised access
- Includes an indemnification clause
- Includes proper AS-IS disclaimers and expanded liability cap
- Corrects governing law to NSW, Australia

### File
`src/app/terms/page.tsx` — full rewrite (metadata and page structure kept, content replaced)

### Sections

**1. Acceptance**
Agreement on use or account creation. If using on behalf of an organisation, user warrants they have authority to bind that organisation.

**2. Accounts**
- Accurate registration information required
- User responsible for credential security and all activity under their account
- Minimum age 16
- One account per person or organisation

**3. Subscriptions & Billing**
- Monthly billing in advance, AUD
- Cancellation any time; access continues to end of billing period
- 30 days' notice for price changes
- Business plan billed per seat; new members added at next billing cycle
- Refunds at our discretion for billing errors only

**4. User Content**
- Users retain ownership of content they create or upload (messages, files, task notes, profile photos, attachments)
- By posting content, users warrant: (a) they have all rights to do so; (b) the content does not violate any law or third-party rights; (c) the content does not constitute harassment, defamation, or illegal material
- Vividex is not responsible for, and does not endorse, any user-generated content
- We do not monitor content but reserve the right (not obligation) to remove content and suspend accounts at our sole discretion

**5. Acceptable Use**
Users agree not to:
- Harass, threaten, defame, bully, or discriminate against other users or third parties
- Upload, share, or transmit illegal, infringing, pornographic, or malicious content
- Misuse access to payroll, HR, or employee data — including exporting and sharing such data outside the platform without authorisation
- Attempt unauthorised access to other accounts, systems, or data
- Use the service for any unlawful purpose
- Reverse engineer or attempt to extract source code
- Interfere with service performance or availability
- Impersonate another person or organisation

**6. Platform Role**
- TimeWiseHub is a software tool and platform — not a publisher, editor, or speaker of user content
- Vividex has no obligation to monitor, review, or moderate user content or interactions
- Users interact with each other entirely at their own risk
- Vividex and TimeWiseHub are not liable for the actions, conduct, communications, or content of any user, whether or not in violation of these Terms

**7. Indemnification**
Users agree to indemnify, defend, and hold harmless Vividex, its directors, officers, employees, contractors, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or in connection with:
- Their use of or access to the service
- Their content
- Their breach of these Terms
- Their violation of any law or third-party rights

**8. Intellectual Property**
- Vividex owns all rights in the platform, including software, design, trademarks, and brand
- Users own their data
- No licence is granted to copy, reproduce, or reverse-engineer any part of the platform

**9. Disclaimers**
- The service is provided **AS IS** and **AS AVAILABLE** without warranty of any kind
- Vividex expressly disclaims all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement
- We do not warrant that the service will be uninterrupted, error-free, secure, or free of viruses or harmful components
- We do not warrant the accuracy or completeness of any content on the platform

**10. Limitation of Liability**
- To the maximum extent permitted by law, Vividex is not liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, revenue, data, goodwill, or business opportunity
- This applies whether based in contract, tort, statute, or any other theory, even if advised of the possibility of such damages
- Vividex's total aggregate liability for any claims arising from use of the service is limited to the total fees paid by the user in the 12 months preceding the claim
- Some jurisdictions do not allow exclusion of certain warranties or limitations of liability — in those cases liability is limited to the fullest extent permitted

**11. Your Data**
- You own your data
- We use it only to provide and improve the service, as described in our Privacy Policy
- You may export or delete your data at any time from within the platform or by contacting us

**12. Service Availability**
- We aim for high availability but do not guarantee uninterrupted service
- We are not liable for losses arising from downtime, data loss, or service interruptions

**13. Termination**
- You may close your account at any time via account settings or by contacting us
- We may suspend or terminate accounts that violate these Terms, with or without notice
- On termination, your data will be deleted within 30 days

**14. Governing Law**
- These Terms are governed by the laws of New South Wales, Australia
- Disputes will be resolved in the courts of New South Wales
- Nothing in this clause limits rights you may have under mandatory consumer protection laws in your jurisdiction, including the Australian Consumer Law

**15. Changes**
- We may update these Terms from time to time
- Material changes will be notified by email at least 14 days in advance
- Continued use of the service after the effective date constitutes acceptance

**16. Contact**
admin@vividex.au

### Last Updated Date
Update to current date at time of implementation.

---

## Part 3 — Privacy Policy (new page)

### Goal
Create a new page at `/privacy` to satisfy the existing links from `/terms` and the register page, and meet Australian Privacy Act + basic GDPR obligations.

### File
`src/app/privacy/page.tsx` — new file

### Sections

**1. Who We Are**
Vividex, operating TimeWiseHub, based in New South Wales, Australia. Contact: admin@vividex.au

**2. Data We Collect**
- Account data: name, email address, username, password (hashed by Supabase Auth)
- Profile data: job title, profile photo, work hours preferences
- Usage data: time logs, expense records, tasks, leave requests, chat messages and attachments
- Payment data: billing is handled by Stripe — we do not store raw card numbers; we store only Stripe customer/subscription IDs
- Device/technical data: IP address, browser type, collected automatically for security and analytics

**3. How We Use Your Data**
- To provide and operate the service
- To send transactional emails (account verification, password reset, notifications) via Resend
- To process subscription billing via Stripe
- To provide customer support
- We do not sell your data. We do not use it for advertising.

**4. Third-Party Processors**
| Processor | Purpose | Region |
|-----------|---------|--------|
| Supabase | Database, file storage, authentication | Australia (ap-southeast-2) |
| Stripe | Subscription billing and payment processing | Global |
| Resend | Transactional email delivery | Global |
| Vercel | Application hosting and edge delivery | Global |

All processors are bound by data processing agreements.

**5. Data Retention**
- Active account data is retained while your account is open
- On account deletion, data is removed within 30 days
- Billing records are retained for 7 years as required by Australian tax law

**6. Your Rights**
You have the right to:
- Access the personal data we hold about you
- Correct inaccurate data
- Request deletion of your data
- Object to certain processing
Contact admin@vividex.au to exercise any of these rights. We will respond within 30 days.

**7. Security**
- All data is encrypted in transit (TLS) and at rest
- Access to production systems is restricted and logged
- We follow responsible disclosure practices — report vulnerabilities to admin@vividex.au

**8. Cookies**
- We use session cookies only, required for authentication
- We do not use tracking, advertising, or analytics cookies

**9. Changes**
- We will notify you by email of material changes to this policy
- The current version is always available at /privacy

**10. Contact**
admin@vividex.au

### Verification
- `/privacy` renders and is linked correctly from `/terms` and the register page
- `pnpm run build` passes

---

## Out of Scope
- A separate User Content Policy page (not needed at this scale)
- DMCA takedown process (can be added later if needed)
- Cookie consent banner (session-only cookies don't require one under most frameworks)
