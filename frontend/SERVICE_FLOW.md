# Daily service flow

`/` is the service entry point. A first-visit splash leads to a demo login screen, then to the setup-required home state. The old scenario picker remains at `/demo` for regression testing, with no link from the service UI.

1. “데모 버전으로 로그인” stores only a local demo-authenticated flag. The main screen then sends the user to the first-use survey, which records wake habits, per-schedule-type wake deadlines, alarm preferences, the daily planning time, and optional outcome-sync consent. The initial automation policy always asks for approval.
2. `/calendar` imports varied sample events through October 30, 2026. It uses the existing anonymous-session API, saves the survey through the routine/profile APIs, and upserts imported or edited events through `schedule-events:batch`.
3. After explicit AI consent, calendar titles are classified against the user's own schedule types by Gemini through `POST /api/v1/ai/schedule-classifications`; deterministic classification remains the safe fallback. Only the title and category labels are transferred, never notes or locations. Users can override every result.
4. The home screen reads tomorrow's first event and category from the backend. It derives the wake-complete deadline, reads the normalized health adapter locally, and sends only aggregate sleep/activity/condition signals to Gemini. A deterministic safety guard prevents the AI result from weakening learned or high-fatigue alarm minimums.
5. Create, approve, edit and cancel actions use the existing wake-plan APIs with revisions. Calendar edits retire the old plan and calculate a replacement.
6. The separate presentation controls play an actual Web Audio chime, issue a browser system notification when permission is granted, and move the virtual clock to the first alarm. Turning it off prompts for wake confirmation. The response updates local learning and the next recommendation; aggregate sync uses the existing consent-based outcome API.
7. “Next automation time” moves the virtual clock to the configured time and runs the same fetch/recommend/persist pipeline. The short-sleep sample includes high activity and low condition, yielding three alarm steps and approval.
8. “After 14 days” adds explicitly marked preview records (without overwriting observed records), advances time, and runs the same eligibility policy. The full record provenance is visible in history and the presentation panel.

## Automation policy

No elapsed-time graduation threshold existed in the repository. This implementation introduces an explicit product default, not a recovered historical requirement:

- At least 14 elapsed days, 10 distinct recorded dates, and 4 on-time wakes in the latest 5 records.
- User consent is required. Only `NORMAL` events can auto-apply; low confidence and elevated recommendation risk still require approval.
- A user may explicitly opt into early automation before day 14. The settings screen warns that fewer observations can increase classification and timing errors.
- After day 14, users can still switch back to Human-in-the-loop approval at any time. Automatically applied plans remain editable and cancellable.
- Clock advancement alone does not satisfy the policy. The learning preview supplies labeled sample history.
- The policy is centralized in `src/features/service/model/service-policy.ts` and covered by boundary tests.

## Integration limits

- Accounts still use the existing 24-hour anonymous-session backend. This is not email/Apple sign-in or durable multi-device identity.
- Calendar sample import and app-side editing work against the actual backend. External calendar OAuth and provider writeback are not implemented.
- Apple HealthKit is a native iOS/watchOS framework requiring entitlements and authorization. `HealthDataSource` is the normalization seam: the web judging build injects sample values through `healthKitDemoSource`, while a native iOS adapter can normalize authorized HealthKit sleep/activity results into the same internal record without changing planning logic.
- Automatic checks currently run while the home screen is open, every 30 seconds. The web build provides Web Audio plus browser system notifications after permission; reliable closed-browser or lock-screen alarms still require native scheduling.
- The presentation clock is independent of wall-clock authentication/session expiry. Preview history is local and labeled; it is not uploaded as real aggregate outcomes.

## Verification

`e2e/service-flow.spec.ts` exercises real FastAPI/SQLite requests for survey, AI schedule classification, the October 30 calendar horizon, category settings, early automation, Human-in-the-loop fallback, calendar edits, approvals, failure feedback, sleep-sensitive recommendations, automatic application, changes and cancellation on Chromium and WebKit. Legacy scenarios are retained in `e2e/demo-flow.spec.ts`.
