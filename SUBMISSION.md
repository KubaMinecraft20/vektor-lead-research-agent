# EvoHacks 2026 submission pack

## Devpost fields

### Project name

Vektor Lead Research Agent

### Tagline

Public-web research that shows its evidence, labels its guesses, and drafts a small automation pilot in Czech.

### Detailed project description

Small businesses publish clues about products, B2B catalogues, enquiries, and orders on their websites. Turning those clues into a useful automation idea takes manual reading, careful source checking, and a concise explanation. It is also easy to mistake a visible form or spreadsheet for proof that a team has a manual-work problem.

Vektor Lead Research Agent turns that research into one reviewable workflow. Enter a company name and public website URL, or choose one of two fictional companies stored locally for a reliable demo. For a real URL, the app reads at most three same-site public pages. It extracts short evidence excerpts and builds a company snapshot, a map of possible repetitive workflows, and one bounded first-pilot proposal. Each opportunity cites its source, explains its confidence, and is labelled as a hypothesis. The final output is a concise Czech brief with the context observed, proposed pilot, and questions a person must confirm. The brief is copied to the clipboard; the app never sends it.

The recommended pilot has a trigger, deterministic automation steps, an optional LLM reasoning step, a human review point, and a qualitative outcome. For example, if the public evidence mentions a spreadsheet price catalogue, a small pilot could check one anonymized sample, validate agreed product codes and prices, and produce a reviewable import draft. The website alone does not prove that the company needs this work, does it manually, or has a budget. The business would need to confirm those points before implementation.

### How it works

The browser sends the requested company name, URL, and optional public text to a small Node.js server. The server validates the URL and DNS results, pins the connection to a public address, follows only revalidated redirects, and reads a limited number of same-site pages. It strips executable markup and uses a local analysis provider to match evidence patterns, attach source excerpts, and form cautious workflow hypotheses. The UI separates quoted observations from inferences and formats a human-reviewed Czech pilot brief.

Two demo companies are fictional local fixtures with reserved `.example` URLs; selecting a demo never fetches those URLs. They allow the whole flow to run without a network connection.

### How AI is used

This submission is honest about the available runtime: **no LLM credential was configured, so this build makes no model API calls.** Its current provider uses simple, deterministic rules to produce repeatable evidence mapping and a structured result. The app contains a provider boundary and strict LLM instructions for a future credential-backed model. If enabled, an LLM would receive only the supplied public page text and would be asked to summarize supported facts, propose uncertainty-labelled workflow hypotheses, cite source excerpts, and return valid JSON with a Czech client brief. Deterministic URL checks, field validation, excerpt capture, and approval remain ordinary code. A person reviews every recommendation; the app takes no external action.

### What makes it useful

It turns scattered public clues into an inspectable lead-research draft and makes uncertainty visible. A reviewer can open the cited pages, challenge each hypothesis, and confirm a small pilot before anyone makes a business commitment. The project does not invent time savings, client results, contacts, budgets, or testimonials.

### Built with

Node.js built-ins, TypeScript, HTML, CSS, and browser JavaScript. No third-party package or paid API is required to run the demo.

### Links and setup

- **Public source repository:** https://github.com/KubaMinecraft20/vektor-lead-research-agent
- **Live demo:** Not deployed. Run locally with Node.js 22.6+ using `npm start`, then open `http://127.0.0.1:3000`.
- **Automated checks:** `npm test`.

## Video demo script — 2 minutes 35 seconds

| Time | Screen / action | Narration |
|---|---|---|
| 0:00–0:15 | Show app title and input/demo panel. | “Vektor Lead Research Agent helps turn public company information into a careful automation proposal. Its key rule is simple: show the evidence before the idea.” |
| 0:15–0:35 | Click the fictional Papírna Lípa Trade demo. Show progress, then the company snapshot. | “I’m opening a locally stored fictional wholesaler. The demo is deterministic and works offline; this is not a real company or a live website scan.” |
| 0:35–1:00 | Scroll to opportunity map. Point to the XLSX catalogue excerpt and the order-form excerpt. | “The catalogue and order workflow are visible signals. Each card shows the exact source excerpt. The possible friction is explicitly a hypothesis; the public page does not prove that the business works manually.” |
| 1:00–1:22 | Point to confidence reasons and source list. | “Confidence describes how directly the signal is supported. It does not claim verified need, customer interest, or budget. A real run also lists the URLs and lets the reviewer open the pages.” |
| 1:22–1:45 | Show the recommended pilot flow. | “The first pilot is deliberately small: one anonymized input, agreed fields, validation rules, and a reviewable output. A person approves the mapping and exceptions. Nothing is written to an e-shop or sent.” |
| 1:45–2:03 | Click “Kopírovat brief”; show Czech brief. | “The app creates a concise Czech draft with observed context, the proposed pilot, and the points the business would need to confirm. It is for human review, not automatic outreach.” |
| 2:03–2:21 | Show “Co běží teď — a co by přidalo AI.” | “This build has no LLM credential, so it says plainly that it uses local rules today. The provider boundary and strict prompt describe how a future model could interpret ambiguous text and return cited JSON. We don’t fake an AI call.” |
| 2:21–2:35 | Brief view of `src/server.ts`, `src/analysis.ts`, tests, then finish on the app. | “The small Node server has no dependencies. It bounds page fetching and rejects local network addresses. Run `npm start`; run `npm test` for the checks. Vektor keeps evidence, uncertainty, and human approval visible.” |

## Submission checklist

- [x] Create a public GitHub repository and include its URL above.
- [x] Push the complete project folder; README and tests are visible in the public repository.
- [ ] Run `npm start` from a clean checkout on Node.js 22.6+ and test both fictional demos.
- [ ] Test one public site and one unavailable site with pasted public text; verify the source citations and error fallback.
- [ ] Record the 2:35 walkthrough, including the brief copy action and a short code view.
- [ ] Upload the video to the submission and confirm its link is viewable by judges.
- [ ] Paste the detailed description and source repository URL into Devpost.
- [ ] Submit before **11 October 2026, 20:59 Europe/Prague (hard deadline)**.
