# Daily service flow

`/` is the service entry point. A first-visit splash leads to a demo login screen, then to the setup-required home state. The old scenario picker remains at `/demo` for regression testing, with no link from the service UI.

1. “데모 버전으로 로그인” stores only a local demo-authenticated flag. The main screen then sends the user to the first-use survey, which records wake habits, per-schedule-type wake deadlines, alarm preferences, the daily planning time, and optional outcome-sync consent. The initial automation policy always asks for approval.
2. `/calendar` imports varied sample events through October 30, 2026. It uses the existing anonymous-session API, saves the survey through the routine/profile APIs, and upserts imported or edited events through `schedule-events:batch`.
3. AI classification is a core service behavior rather than an optional consent toggle. Every unique imported calendar title is classified against the user's own schedule types in one Gemini batch through `POST /api/v1/ai/schedule-classifications:batch`; deterministic classification remains the safe fallback. Only titles and category labels are transferred, never notes or locations. Users can override every result.
4. The home screen reads tomorrow's first event and category from the backend. It derives the wake-complete deadline, reads the normalized health adapter locally, and sends only aggregate sleep/activity/condition signals to Gemini. A deterministic safety guard prevents the AI result from weakening learned or high-fatigue alarm minimums.
5. Create, approve, edit and cancel actions use the existing wake-plan APIs with revisions. Calendar edits recalculate only when the first event used by the current plan changes. Unrelated dates retain the approved plan; an empty target date cancels its old alarm without treating the saved edit as an error.
6. The separate presentation controls play an actual Web Audio chime, issue a browser system notification when permission is granted, and move the virtual clock to the first alarm. Turning it off prompts for wake confirmation. The response updates local learning and the next recommendation; aggregate sync uses the existing consent-based outcome API.
7. “Next automation time” moves the virtual clock to the configured time and runs the same fetch/recommend/persist pipeline. The short-sleep sample includes high activity and low condition, yielding three alarm steps and approval.
8. “After 14 days” adds explicitly marked preview records (without overwriting observed records), advances time, and runs the same eligibility policy. The full record provenance is visible in history and the presentation panel.

## Automation policy

No elapsed-time graduation threshold existed in the repository. This implementation introduces an explicit product default, not a recovered historical requirement:

- At least 14 elapsed days, 10 distinct recorded dates, and 4 on-time wakes in the latest 5 records.
- The user must explicitly choose automatic application. Only `NORMAL` events can auto-apply; low confidence and elevated recommendation risk still require approval.
- A user may explicitly opt into early automation before day 14. The settings screen warns that fewer observations can increase classification and timing errors.
- After day 14, users can still switch back to Human-in-the-loop approval at any time. Automatically applied plans remain editable and cancellable.
- Clock advancement alone does not satisfy the policy. The learning preview supplies labeled sample history.
- The policy is centralized in `src/features/service/model/service-policy.ts` and covered by boundary tests.

## Integration limits

- Accounts still use the existing 24-hour anonymous-session backend. This is not email/Apple sign-in or durable multi-device identity. An expired browser session is renewed automatically and the current settings and calendar are rehydrated into it.
- Calendar sample import and app-side editing work against the actual backend. External calendar OAuth and provider writeback are not implemented.
- Apple HealthKit is a native iOS/watchOS framework requiring entitlements and authorization. The web judging build creates a serializable projection of `HKCategorySample` and `HKQuantitySample`, then runs it through the same `HealthDataSource` normalization boundary intended for a native iOS adapter. No actual HealthKit authorization is claimed on web.
- Automatic checks run from the app-level provider every 15 seconds, regardless of which service tab is visible. A persisted plan id prevents duplicate ringing, and a four-hour grace window recovers delayed browser timers. The web build provides Web Audio plus browser system notifications after permission; reliable closed-browser or lock-screen alarms still require native scheduling.
- The presentation clock is independent of wall-clock authentication/session expiry. Preview history is local and labeled; it is not uploaded as real aggregate outcomes.

## Verification

`e2e/service-flow.spec.ts` exercises real FastAPI/SQLite requests for survey, AI schedule classification, the October 30 calendar horizon, category settings, early automation, Human-in-the-loop fallback, calendar edits, approvals, failure feedback, sleep-sensitive recommendations, automatic application, changes and cancellation on Chromium and WebKit. Legacy scenarios are retained in `e2e/demo-flow.spec.ts`.

## Demo sleep history and preview provenance

The demo controls separate today's health sample from a habitual sleep pattern
(roughly six, seven, or eight hours). Each pattern generates reproducible,
date-varying HealthKit-shaped samples for the previous 14 days. The shared
normalizer produces local sleep records; a median over at least seven distinct,
valid prior dates supplies the same baseline to local recommendations, the AI
request, and the saved decision report. Today's sample is excluded from that
baseline. The health screen explicitly identifies this as sample-derived data.
Wake outcome counts no longer turn a fixed seven-hour value into a personal
sleep baseline.

The unused usual wake-time survey field has been removed. The service derives
wake deadlines from event start times and the user's per-category preparation
time; first-alarm success remains a relevant survey input. Persisted older
survey drafts are migrated without losing the remaining preferences.

The 14-day learning preview records retain their sample provenance in the
history list and receive a dedicated explanation on the detail page. They are
identified in the summary count and do not request a nonexistent server report.
Observed reports continue to show their actual alarm timeline and learning.
The sample calendar still intentionally ends on October 30, 2026.


## Alarm recovery and failed saves

The scheduler restores persisted ringing/wake-confirmation progress before
considering a new daily plan. An approved plan is retained through its four-hour
alarm window, and unanswered confirmation survives beyond it. Session renewal
recreates the same plan, restores its approval/edit and remaps queued alarm events
without replacing today's alarm with tomorrow's recommendation. Empty calendar
dates are remembered to avoid repeatedly requesting the same empty plan.

Automation, alarm, and outcome-consent settings become effective only after a
successful server save. Removing a schedule type moves affected events to the
fallback type; a failed preference save rolls those events back. A failed explicit
plan creation retains the existing approved alarm. After an actual calendar
change, the obsolete alarm is retired and a failed recalculation is explained as
a separate failure from the successful event save.

Alarm report delivery and browser audio autoplay do not block alarm controls.
An explicit sound-play button is available during ringing. Privacy settings
separately describe local HealthKit/model data, AI summaries, report events and
learning adjustments, and the optional aggregate outcome synchronization.

`e2e/demo-regressions.spec.ts` covers reload/session recovery, unrelated edits,
empty dates, planning failures, and failed settings writes against FastAPI on
both desktop Chromium and mobile WebKit.
