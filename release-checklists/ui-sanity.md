# Packaged UI Release Sanity

Run this short pass against release-candidate packages after source CI and the
platform packaging workflows succeed. It covers native, packaged, credentialed,
and media seams that the required Playwright suite intentionally does not fake.
It is not a second copy of the automated smoke suite.

Record one result per package/platform:

- Tag and commit SHA:
- CI run URL (successful for the exact commit):
- Package/asset name and source:
- Platform and OS version:
- Tester and date:
- Start/end time (target: 10–15 minutes):
- Result: pass / fail / not applicable
- Evidence or issue links:
- Notes and every not-applicable reason:

Use a disposable folder and non-sensitive test documents. Do not paste tokens,
credentials, personal documents, or private Agent output into screenshots or
issue reports. Check an item only after observing the result; record a concise
reason when a platform cannot exercise it.

## Residual checks

- [ ] Install or unpack the release asset and launch it through the platform's
  normal path. Confirm one window appears and quits cleanly. On unsigned macOS
  builds, verify the bundled `Fix.sh`/`Read Me.txt` recovery instructions when
  Gatekeeper blocks first launch.
- [ ] Use the real native folder picker: cancel once without changing the
  library, then add a disposable folder and confirm it opens.
- [ ] Drag a real OS file or folder onto each supported drop target and confirm
  the intended import/attachment behavior and rejection feedback.
- [ ] Exercise native menus and the platform shortcuts for Quick Open, Command
  Palette, search, Settings, window close, and quit. Confirm focus returns to a
  sensible control after dismissing an overlay.
- [ ] With tester-owned credentials and an installed supported CLI, send one
  harmless Agent turn. Confirm streaming/activity, one permission or stop
  interaction when available, completion, and a clean close. Never use a real
  user workspace or capture credentials in evidence.
- [ ] Paste one non-sensitive clipboard image into the Agent composer. Confirm
  the attachment preview appears, accompanying text remains, and the competing
  clipboard library-import offer does not appear.
- [ ] Open representative real PDF, DOCX, image, and audio fixtures in the
  packaged app on platforms where those formats ship. The automated journey
  uses synthetic/minimal fixtures; here confirm production rendering and, for
  audio, that play/pause and seeking produce sound and preserve control state.
- [ ] Open a second window, switch folders, close both windows, relaunch, and
  confirm no orphan process/port, duplicate unexpected window, or lost save.

If a check fails, keep the candidate unpublished or stop the rollout, attach
sanitized evidence, and file the smallest reproducible issue. Re-run the failed
item and any adjacent native boundary after a replacement package is built.
