# Daily service flow

`/` is the service entry point. The old scenario picker remains at `/demo` for regression testing, with no link from the service UI.

1. First-use survey records wake habits, preparation duration, travel duration, alarm preferences, the daily planning time, and optional automation/outcome-sync consent.
2. `/calendar` imports a 30-day sample calendar with an 11:00 class. It uses the existing anonymous-session API, saves the survey through the routine/profile APIs, and upserts imported or edited events through `schedule-events:batch`.
3. The home screen reads tomorrow's first event and the saved routine from the backend. It subtracts preparation, travel and a 15-minute buffer, reads the mock sleep provider locally, and runs the recommendation engine. Health input is never sent to the backend.
4. The initial plan requires approval. Create, approve, edit and cancel actions use the existing wake-plan APIs with revisions. Calendar edits retire the old plan and calculate a replacement.
5. The separate presentation controls play an actual Web Audio chime and move the virtual clock to the first alarm. Turning it off prompts for wake confirmation. The response updates local learning and the next recommendation; aggregate sync uses the existing consent-based outcome API.
6. “Next automation time” moves the virtual clock to the configured time and runs the same fetch/recommend/persist pipeline. The short-sleep sample includes high activity and low condition, yielding three alarm steps and approval.
7. “After 14 days” adds explicitly marked preview records (without overwriting observed records), advances time, and runs the same eligibility policy. The full record provenance is visible in history and the presentation panel.

## Automation policy

No elapsed-time graduation threshold existed in the repository. This implementation introduces an explicit product default, not a recovered historical requirement:

- At least 14 elapsed days, 10 distinct recorded dates, and 4 on-time wakes in the latest 5 records.
- User consent is required. Only `NORMAL` events can auto-apply; low confidence and elevated recommendation risk still require approval.
- Clock advancement alone does not satisfy the policy. The learning preview supplies labeled sample history.
- The policy is centralized in `src/features/service/model/service-policy.ts` and covered by boundary tests.

## Integration limits

- Accounts still use the existing 24-hour anonymous-session backend. This is not email/Apple sign-in or durable multi-device identity.
- Calendar sample import and app-side editing work against the actual backend. External calendar OAuth and provider writeback are not implemented.
- Apple HealthKit is a native iOS/watchOS framework requiring entitlements and authorization. The web build uses `mockSleepSource`, behind a replaceable `SleepDataSource` interface. It does not claim HealthKit is connected.
- Automatic checks currently run while the home screen is open, every 30 seconds. Browser sound requires user permission/interaction. Background or lock-screen alarms require native scheduling; this web build must not be relied on as a system alarm.
- The presentation clock is independent of wall-clock authentication/session expiry. Preview history is local and labeled; it is not uploaded as real aggregate outcomes.

## Verification

`e2e/service-flow.spec.ts` exercises real FastAPI/SQLite requests for survey, calendar edits, approvals, failure feedback, sleep-sensitive recommendations, automatic application, changes and cancellation on Chromium and WebKit. Legacy scenarios are retained in `e2e/demo-flow.spec.ts`.
