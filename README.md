# Vektor Lead Research Agent

An evidence-first research assistant for a small, specific job: review a Czech business's public website, identify possible repetitive workflows without claiming unverified pain, and prepare a short Czech pilot brief for a person to review.

## Problem

Small businesses publish useful clues about products, catalogues, B2B offers, enquiries, and orders across their websites. A researcher still has to read those pages, keep source evidence beside each idea, decide what is fact versus inference, and turn the result into a useful next step. A confident-sounding guess can make this process worse.

## Solution

Enter a company name and public website URL, or use one of two fictional local demo companies. The app reads up to three same-site public pages, captures short source excerpts, and returns:

- a company snapshot and likely audience, each tied to visible evidence;
- two or three possible workflow opportunities with a confidence level and a clear hypothesis label;
- one small pilot with a trigger, automation steps, human review point, and qualitative outcome;
- a concise Czech brief that can be copied and reviewed by a person;
- a clear explanation of which steps are deterministic and where an LLM could help.

Nothing is sent to a company. There is no CRM write access, login, database, payment, or outbound messaging.

## Architecture

- **Node.js HTTP server** (`src/server.ts`): serves the app and the small JSON API with no package dependencies.
- **Analysis provider boundary** (`src/analysis.ts`): one stable result schema, a strict LLM instruction string, and the current local rule-based provider.
- **Fictional local fixtures** (`src/demo-data.ts`): two made-up companies and page excerpts on reserved `.example` domains; demo runs never make network requests.
- **Browser UI** (`public/`): responsive Czech single-page experience, progress indicator, confidence/evidence cards, and copy-to-clipboard brief.
- **Built-in tests** (`tests/`): verify cited demo output, workflow confidence, HTML extraction, and unsafe URL rejection.

The production path is intentionally explainable: browser form → same-origin JSON endpoint → validated public page fetch or local fixture → analysis provider → evidence-backed result JSON → human-reviewed brief.

## AI use

This environment had no LLM API credential configured, so the app does **not** pretend to call a generative model. The running MVP uses transparent text-pattern rules to find signals, attach exact excerpts, label hypotheses, and produce its output. The provider interface and `STRICT_LLM_INSTRUCTIONS` define a safe place to add a credential-backed model later. That model would receive only the supplied public text and would be instructed to return evidence-backed structured JSON and a Czech draft.

Deterministic checks are better for URL validation, page limits, source capture, field validation, and human approval. An LLM could add value by interpreting ambiguous headings or summarizing free-text process descriptions. A person must verify claims and approve any real pilot. No model call, automatic contact, or external system write is active in this build.

## Run locally

Requirements: Node.js 22.6 or newer. No dependency installation is needed.

```bash
npm start
```

Open <http://127.0.0.1:3000>. The local demo cards work without an internet connection. The live website mode needs outbound access to the submitted public site.

If port 3000 is already in use, run `PORT=3001 npm start` and open <http://127.0.0.1:3001>.

Run the checks:

```bash
npm test
```

## Safety and limitations

- Fetches only a URL deliberately entered by the user, using HTTP/HTTPS on ports 80/443. It rejects IP literals, local/special-use addresses, private DNS results, reserved example domains, non-web schemes, and unsafe redirects.
- Reads at most three same-origin pages, caps each page at 1.2 MB, and uses an eight-second request timeout. JavaScript-rendered content is not executed.
- Does not persist submitted names, URLs, pasted text, page contents, or analysis results. The server does not log request content.
- Pasted content should be public business text only. Obvious emails and phone numbers are removed from text used for analysis.
- A public catalogue or form does not prove anyone handles work manually. Confidence describes support for the signal, not a verified customer problem, budget, interest, or result.
- The two demo businesses and all `.example` excerpts are fictional. They are never presented as real research.
- The pilot is a proposal. This research app does not transform customer spreadsheets, write to an e-shop, or guarantee savings.
- The current provider is deterministic, not an active LLM. The application says so in the results.

## Project files

- `src/analysis.ts` — result schema, strict future-LLM instructions, local analysis rules.
- `src/server.ts` — API, public URL protections, bounded website reading, static server.
- `src/demo-data.ts` — local fictional demo companies.
- `public/` — app UI.
- `tests/analysis.test.mjs` — automated checks.
- `SUBMISSION.md` — Devpost draft, timed video script, and hand-in checklist.
