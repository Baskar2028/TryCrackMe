# TRY CRACK ME
### DEBUG. THINK. CRACK THE CODE.

A full-stack debugging competition platform for college technical events. It uses React + Vite + Tailwind CSS on the client, Node.js + Express + Socket.IO on the server, SQLite for persistence, and GCC/Python/JDK for code execution.

## What is included
- Separate Participant and Admin authentication.
- Server-authoritative 30-minute event timer.
- Event states: `NOT_STARTED`, `RUNNING`, `PAUSED`, `ENDED`.
- Fullscreen gate before entering the coding console.
- Best-effort browser anti-cheat monitoring with server-side warning records.
- 10-warning hard termination and no re-entry for that session.
- Exactly 25 seeded challenges: C 10, Python 10, Java 5.
- C: 20 marks each; every C question has exactly six server-side bug records (3 syntax + 3 logical intent records).
- Python: 20 marks each + up to one hidden-test bonus point.
- Java: 30 marks each.
- Maximum score: 560.
- Monaco Editor with syntax highlighting.
- Run Code and Submit flows with compile/runtime/timeout handling.
- Public tests visible; hidden tests stay server-side.
- SQLite persistence for progress, submissions, warnings, activity and sessions.
- Admin live leaderboard through Socket.IO.
- Participant monitoring with warnings, submission history and activity.
- Event Start / Pause / Resume / End / Reset.
- Refresh persistence and autosave when navigating.

## Requirements
Linux/macOS/WSL is recommended for the included shell scripts.

- Node.js 20+
- npm
- GCC
- Python 3
- JDK (javac + java)

## Quick start

```bash
cd try-crack-me
cp .env.example .env
./setup.sh
./start.sh
```

Open:
- Participant/Admin UI: http://localhost:5173
- API health: http://localhost:5000/api/health

`setup.sh` installs the workspace dependencies and creates `.env` if it does not exist.

## Default development credentials
The credentials are configured through `.env` and are not hardcoded into the frontend.

**Admin**
- Username: `admin`
- Password: `TryCrackMe@2026`

**Sample participants**
- ID: `TC001` / Password: `participant@123`
- ID: `TC002` / Password: `participant@123`

Change these values in `.env` before an actual event.

## Event flow
1. Participant logs in.
2. Before Start, the participant sees `EVENT HAS NOT STARTED YET` and cannot enter the coding screen.
3. Admin presses **Start**. The server starts the 30-minute event clock.
4. Participant enters fullscreen to unlock the console.
5. Participant chooses any question order and debugs code.
6. Run checks public tests. Submit performs official validation.
7. Successful questions update the server-side score and live leaderboard.
8. Python receives +1 only when its public and hidden tests both pass.
9. Pause freezes the server clock and submissions. Resume continues it.
10. At 00:00, the server automatically ends the event and locks competition sessions.
11. Admin can End early and finalize results.

## Anti-cheat model
The browser records detectable events such as:
- Tab/visibility changes
- Window focus loss
- Copy / paste / cut
- Context-menu attempts
- Fullscreen exits
- Detectable screenshot shortcuts such as PrintScreen where the browser exposes the key
- Common DevTools shortcuts such as F12 and Ctrl/Cmd+Shift+I/J/C

Every warning is stored in SQLite. At warning 10, the server marks the session `TERMINATED` and rejects re-entry.

**Important:** normal browsers cannot reliably detect every operating-system screenshot or external-device action. The screenshot controls are deterrence and best-effort detection, not a security guarantee.

## Code execution safety
The execution service:
- uses temporary per-run directories;
- invokes GCC, Python and Java without shell string interpolation;
- applies short execution timeouts;
- kills timed-out process groups on POSIX systems;
- limits captured output;
- removes temporary files after each run;
- gives child processes a minimal environment instead of the server environment;
- validates the requested language on the server.

For an internet-facing production event, run code inside a stronger sandbox such as an isolated container/VM with CPU, memory, filesystem, syscall and network restrictions. The included runner is intended as a practical college-event starting point, not a hardened multi-tenant code-execution boundary.

## Scoring
| Language | Questions | Base/question | Base total | Bonus |
|---|---:|---:|---:|---:|
| C | 10 | 20 | 200 | — |
| Python | 10 | 20 | 200 | +10 max |
| Java | 5 | 30 | 150 | — |
| **Total** | **25** | | **550** | **+10** |

A question earns its base score only when the server validates the corrected behavior against all official public tests. Python also runs hidden tests; passing them awards the one-point bonus. Repeated successful submissions do not farm additional points.

## Data design
Questions are defined in `server/src/questions.js`. The server sanitizes question data before sending it to participants. Bug metadata and hidden tests are never included in the participant API response.

SQLite tables:
- `admins`
- `participants`
- `event`
- `questions`
- `participant_sessions`
- `participant_progress`
- `submissions`
- `warnings`
- `activity_logs`

## Data validation
Run:

```bash
node scripts/validate-data.mjs
```

It checks the exact 25-question distribution and 560-point maximum.

## Resetting an event
Use the Admin **Reset** button. It clears progress, scores, warnings, submissions, activity and event sessions while preserving admin/participant accounts and the seeded question bank.

## Production notes
- Set a strong random `JWT_SECRET`.
- Change admin and participant passwords.
- Put the app behind HTTPS.
- Replace or harden the local process runner with a container/VM sandbox.
- Consider an external reverse proxy and database backup strategy.
- Restrict server access to trusted administrators.
