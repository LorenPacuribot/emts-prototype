# Facebook and Instagram Integration (dev handoff)

How to connect Estimate Master's Social Media and Marketing module (feature 34) to Facebook Pages and Instagram through Meta's Graph API. The prototype already models the screens and the rules; this document says what the server has to do to make them real.

Written 5 Oct 2026. Meta changes its API and review rules often. Check every permission name, limit and endpoint below against Meta's current developer docs before building, and pin one Graph API version.

## Is it feasible?

Yes. Publishing organic posts to a Facebook Page and to an Instagram professional account is a standard, supported use of Meta's Graph API. The constraints that matter:

| Constraint | What it means for us |
| --- | --- |
| Meta App Review and Business Verification | Plan 1 to 4 weeks before any customer can connect. Start it first. |
| Instagram fetches photos from a public URL | Uploaded photos must live in cloud storage, not in the browser or database. |
| Instagram's API has no "publish later" | Estimate Master needs its own scheduler. |
| Professional accounts only | Personal Instagram accounts can't be connected. The customer must switch to Business or Creator (free, in the Instagram app). |
| Access tokens can stop working | Password changes, removed Page roles or Meta security checks can revoke access. The prototype's "Access expired" flags already model this. |

## What the prototype already models

The action functions in `features/lib/store/actions/*` describe what each API endpoint has to do (see the note at the top of `features/lib/store/index.ts`). For this integration:

| Prototype | File | Becomes |
| --- | --- | --- |
| Settings › Social Accounts, access health, test account, draft fallback | `features/components/features/marketing/accounts-screen.tsx`, `SocialAccount` in `features/types` | The connect flow and stored tokens (steps 2 and 3) |
| Media Library upload, crops, withdrawals | `media-screen.tsx`, `media-upload.tsx`, `uploadMedia` / `createCrop` / `withdrawMedia` | Cloud storage (step 4) |
| Post preview | `post-preview.tsx`, `features/lib/rules/marketing-preview.ts` | Stays client-side. Meta has no preview service for organic posts. |
| Consent check, owner approval, checklist | `postChecks` in `actions/marketing.ts` | Unchanged. The server must enforce these before every publish, not just the UI. |
| Schedule, "nothing publishes late on its own", missed after 30 minutes | `schedulePost`, `runScheduler`, `lateness` | The scheduler (step 6) |
| Per-platform result, "Outcome unclear", retry only the failed platform | `publishPost`, `checkOutcome`, `retryFailed`, `PostPublication` | Publishing (step 5) |
| Social Inbox, engagement numbers | `SocialMessage`, `SocialMetricSnapshot` (sandbox data today) | Webhooks and insights (step 7) |

The platform list in `features/lib/rules/marketing-social.ts` refers to a live adapter in `lib/integrations/social-server`. That adapter doesn't exist yet; it is what this document describes. `features/lib/integrations/messaging-server.ts` and `supplier-server.ts` show the pattern used for the other live connectors.

In production, `MediaAsset.dataUrl` (the prototype's in-record photo, capped at about 10 photos) is replaced by the stored file's URL.

## How it fits together

1. Estimate Master owns **one Meta app**.
2. Each subscriber (organisation) clicks **Connect with Facebook** or **Connect with Instagram** in Settings › Social Accounts. Meta asks them which Pages and accounts to share.
3. The server stores that organisation's access tokens, encrypted.
4. Photos uploaded in the Media Library go to cloud storage.
5. At the scheduled minute, a background job publishes approved posts through the Graph API and writes the result back on the post.
6. Meta sends comments, messages and mentions to an Estimate Master webhook, which fills the Social Inbox. A daily job fetches engagement numbers.

## Step 1: Meta app, permissions and review

- Create a Business-type app in Meta for Developers, owned by Estimate Master's Meta Business account.
- Complete **Business Verification** for Estimate Master (company documents, domain verification).
- Add the products: Facebook Login for Business, and Instagram (either through Facebook Login, or Instagram's own login; see step 2).
- Request **Advanced Access** through App Review for each permission. Each needs a screencast of the feature using it, recorded against a test Page.

| Feature | Permissions (check current names) |
| --- | --- |
| List and connect Pages | `pages_show_list`, `business_management` |
| Publish to a Page | `pages_manage_posts`, `pages_read_engagement` |
| Publish to Instagram | `instagram_basic`, `instagram_content_publish` (Facebook Login route) or `instagram_business_basic`, `instagram_business_content_publish` (Instagram Login route) |
| Social Inbox: comments | `pages_manage_engagement`, `pages_read_user_content`, `instagram_manage_comments` |
| Social Inbox: messages | `pages_messaging`, `instagram_manage_messages` |
| Engagement numbers | `read_insights`, `instagram_manage_insights` |

Ask only for what the first release uses. Publishing alone (first two rows) is the smallest review. Comments, messages and insights can be a second review.

Meta also requires a privacy policy URL and a **data deletion callback**. Wire the callback to the same deletion path as the Media Library's personal-data deletion.

Until review passes, the app works only for people who have a role on the app (developers and testers). That is enough to build and test against a test Page and test Instagram account, as the prototype's "Test account" badge assumes.

## Step 2: Connecting an organisation's accounts

There are two login routes. Support the first; add the second if customers ask for Instagram without a Facebook Page.

**Facebook Login for Business (covers both platforms)**

1. Redirect to Meta's OAuth dialog with the permissions above and a `state` value tied to the organisation and user.
2. Exchange the returned code for a user access token, then for a **long-lived** user token (about 60 days).
3. Call `GET /me/accounts` to list the Pages the user granted. Each comes with a **Page access token**. A Page token obtained from a long-lived user token has no fixed expiry.
4. For each Page, read `instagram_business_account` to find the linked Instagram professional account.
5. Let the owner pick which Page and Instagram account to use (the prototype allows several per platform via `SocialAccount.id`).

**Instagram Login (Instagram only, no Facebook Page needed)**

Same OAuth shape against Instagram's endpoints. The token is long-lived (about 60 days) and must be **refreshed** before expiry. Schedule a refresh job and raise the "access expires in N days" warning if it fails.

Only the business owner can connect or remove accounts (`marketing.accounts` permission).

## Step 3: Storing and checking tokens

- Store tokens per organisation, encrypted at rest. Never send them to the browser. The prototype's `TokenHealth.scopes` records the granted scopes, never the token.
- Check health daily with `GET /debug_token`, and immediately on any 190 (invalid token) error. Map the result onto `SocialAccount.status` and `health`.
- When access breaks, flag the affected scheduled posts and notify the office manager. The prototype's `simulateAccountIssue` shows the expected behaviour.

## Step 4: Photo storage

- Store uploads in cloud storage (Amazon S3, Cloudflare R2 or Supabase Storage).
- Instagram downloads the photo itself from `image_url`, so the URL must be reachable from the internet when the publish call runs. A signed URL that expires after about an hour is fine.
- Instagram feed photos must be **JPEG**, at most 8 MB, between 4:5 portrait and 1.91:1 landscape. Convert PNG and WebP to JPEG on upload. The prototype already limits uploads to 8 MB and offers square (1080 × 1080) and portrait (1080 × 1350) crops.
- Keep the original and every crop. Withdrawals and the ten-year retention rule apply to the stored files, and a personal-data deletion must delete the files too.

## Step 5: Publishing

Run these server-side only, after re-running the consent check and approval check on the exact version being published.

**Facebook Page**

| Post | Calls |
| --- | --- |
| Text only | `POST /{page-id}/feed` with `message` |
| One photo | `POST /{page-id}/photos` with `url` and `caption` |
| Several photos | For each photo `POST /{page-id}/photos` with `published=false`, then `POST /{page-id}/feed` with `message` and `attached_media[]` |

**Instagram**

| Post | Calls |
| --- | --- |
| One photo | `POST /{ig-user-id}/media` with `image_url` and `caption`, which returns a container ID; then `POST /{ig-user-id}/media_publish` with `creation_id` |
| Carousel (2 to 10) | One container per photo with `is_carousel_item=true`; then a container with `media_type=CAROUSEL`, `children` and `caption`; then `media_publish` |

Before `media_publish`, check that the container's `status_code` is `FINISHED` (instant for photos, slower for video). Instagram captions are limited to 2,200 characters and 30 hashtags.

**Recording the result**

- Save the returned ID as `PostPublication.externalRef`, and fetch the post's link (`permalink_url` on Facebook, `permalink` on Instagram) into `url`.
- Each platform succeeds or fails on its own. Keep the existing rule: a retry only re-sends platforms that did not succeed.
- On a timeout or network error the post may or may not exist. Mark it **Outcome unclear** (`uncertain`), and before any retry look for it in the account's recent posts. Don't retry blindly; that is how duplicates happen.

## Step 6: Scheduler

- Instagram's API can't schedule a post for later. Facebook can (`scheduled_publish_time`), but use one path for both platforms.
- Run a job every minute. It publishes posts that are `scheduled` and due, and whose approval still matches the current version.
- Keep the prototype's rules: nothing publishes late on its own; a post more than 30 minutes late becomes **Missed** and needs a person (`lateness`, `runScheduler`).
- Use a lock per post so two workers can't publish the same post.
- Instagram allows about **100 API-published posts per account per 24 hours** (check with `GET /{ig-user-id}/content_publishing_limit`). A painting business posting about ten a month won't come near it, but handle the error.

## Step 7: Social Inbox and engagement numbers

- Subscribe each connected Page and Instagram account to webhooks: Page `feed` and `messages`; Instagram `comments`, `mentions` and `messages`.
- Verify every webhook with the `X-Hub-Signature-256` header. Store events by Meta's ID so repeats are ignored (`SocialMessage.externalId` already models this).
- Replies go back through the Graph API, and their status is recorded as in `SocialReply`.
- Fetch engagement numbers (reach, impressions, likes, comments, shares, saves) once a day per published post into `SocialMetricSnapshot`, with `sandbox: false`.

## Testing

- Build against a Meta **test Page** and a test Instagram professional account, with the app in development mode.
- Keep a sandbox connector that returns the prototype's deterministic results (`sandboxMetrics`, the `simulate` outcomes), so tests and demos never hit Meta.
- Test token expiry, a revoked permission, an Instagram container that never finishes, a timeout after the publish call (Outcome unclear), and the 100-post limit error.

## Rough effort

Estimates for one developer familiar with the codebase. App Review runs in parallel and is usually the long pole.

| Part | Estimate |
| --- | --- |
| Meta app, Business Verification, App Review submissions | 1 to 4 weeks elapsed (a few days of work, plus waiting and resubmitting) |
| Connect flow, token storage, health checks | 1 to 1.5 weeks |
| Cloud photo storage | 2 to 3 days |
| Publishing (Facebook and Instagram, single and multi-photo) with result handling | 1 to 1.5 weeks |
| Scheduler with locking and missed-post handling | 3 to 5 days |
| **Publishing release, total** | **about 3 to 5 weeks of development** |
| Social Inbox webhooks and replies | 1.5 to 2 weeks |
| Engagement numbers | 3 to 5 days |

## Open questions

1. Which Meta Business account owns the Estimate Master app, and who completes Business Verification?
2. First release: publishing only, or publishing plus the Social Inbox? This decides the scope of the first App Review.
3. Is the Instagram-only login (no Facebook Page) needed at launch?
4. Which cloud storage does the production app already use?
