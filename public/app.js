const form = document.querySelector('#research-form');
const nameField = document.querySelector('#company-name');
const urlField = document.querySelector('#company-url');
const pastedField = document.querySelector('#pasted-text');
const formError = document.querySelector('#form-error');
const demoList = document.querySelector('#demo-list');
const emptyState = document.querySelector('#empty-state');
const loadingState = document.querySelector('#loading-state');
const resultsRoot = document.querySelector('#results');

const confidenceLabels = { High: 'Vysoká', Medium: 'Střední', Low: 'Nízká' };
const originLabels = { website: 'VEŘEJNÝ WEB', pasted: 'VLOŽENÝ TEXT', demo: 'FIKTIVNÍ DEMO' };

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

function button(text, className, onClick) {
  const element = node('button', className, text);
  element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}

async function requestJson(path, options) {
  const response = await fetch(path, options);
  let data;
  try { data = await response.json(); }
  catch { throw new Error('Server vrátil nečitelnou odpověď. Zkuste stránku obnovit.'); }
  if (!response.ok) throw new Error(data.error || 'Analýzu se nepodařilo dokončit.');
  return data;
}

function setError(message) {
  formError.textContent = message || '';
  formError.hidden = !message;
}

async function loadDemos() {
  try {
    const data = await requestJson('/api/demos');
    demoList.replaceChildren();
    for (const demo of data.items) {
      const card = node('article', 'demo-card');
      const top = node('div', 'demo-card-top');
      const name = node('strong', 'demo-name', demo.name);
      const badge = node('span', 'fictional-badge', 'FIKTIVNÍ');
      top.append(name, badge);
      card.append(top, node('p', 'demo-sector', demo.sector), node('p', 'demo-description', demo.description));
      const run = button('Otevřít ukázku', 'demo-run', () => runAnalysis({ demoId: demo.id }));
      run.setAttribute('aria-label', 'Spustit fiktivní demo: ' + demo.name);
      card.append(run);
      demoList.append(card);
    }
  } catch (error) {
    demoList.replaceChildren(node('p', 'demo-error', error.message));
  }
}

function startProgress() {
  const items = Array.from(document.querySelectorAll('#progress-steps li'));
  items.forEach((item) => item.classList.remove('is-active', 'is-done'));
  return new Promise((resolve) => {
    let index = 0;
    items[index]?.classList.add('is-active');
    const timer = setInterval(() => {
      items[index]?.classList.remove('is-active');
      items[index]?.classList.add('is-done');
      index += 1;
      if (index >= items.length) {
        clearInterval(timer);
        resolve();
        return;
      }
      items[index].classList.add('is-active');
    }, 260);
  });
}

async function runAnalysis(input) {
  setError('');
  emptyState.hidden = true;
  resultsRoot.hidden = true;
  resultsRoot.replaceChildren();
  loadingState.hidden = false;

  try {
    const request = requestJson('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    const [result] = await Promise.all([request, startProgress()]);
    loadingState.hidden = true;
    renderResults(result);
    resultsRoot.hidden = false;
  } catch (error) {
    loadingState.hidden = true;
    emptyState.hidden = false;
    setError(error.message || 'Analýzu se nepodařilo dokončit.');
    formError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  runAnalysis({
    companyName: nameField.value.trim(),
    website: urlField.value.trim(),
    pastedText: pastedField.value.trim()
  });
});

function addSectionHeading(container, eyebrow, title, badge) {
  const header = node('div', 'result-heading');
  const copy = node('div', 'result-heading-copy');
  copy.append(node('div', 'eyebrow', eyebrow), node('h2', '', title));
  header.append(copy);
  if (badge) header.append(node('span', 'small-badge', badge));
  container.append(header);
  return header;
}

function citation(evidence, options) {
  const box = node('div', 'citation');
  const meta = node('div', 'citation-meta');
  meta.append(node('span', 'source-kind', originLabels[evidence.origin] || 'ZDROJ'));
  const address = node('span', 'source-url', evidence.url);
  meta.append(address);
  box.append(meta);
  if (evidence.quote) {
    const quote = node('blockquote', '', '„' + evidence.quote + '“');
    box.append(quote);
  }
  if (evidence.title && options?.showTitle) box.append(node('div', 'source-title', evidence.title));
  if (evidence.origin === 'website' && /^https?:\/\//i.test(evidence.url)) {
    const link = node('a', 'source-open', 'Otevřít zdroj ↗');
    link.href = evidence.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    box.append(link);
  }
  return box;
}

function renderSnapshot(result) {
  const card = node('section', 'panel result-card snapshot-card');
  addSectionHeading(card, '03 / 01 · DOLOŽENÉ INFORMACE', 'Rychlý přehled', 'SNAPSHOT');
  const facts = node('div', 'snapshot-facts');
  const description = node('div', 'snapshot-fact');
  description.append(node('span', 'fact-label', 'CO FIRMA UVÁDÍ'), node('p', '', result.snapshot.whatItDoes));
  const audience = node('div', 'snapshot-fact');
  audience.append(node('span', 'fact-label', 'KDO MŮŽE BÝT ZÁKAZNÍK'), node('p', '', result.snapshot.audience));
  facts.append(description, audience);
  card.append(facts);
  const evidenceWrap = node('div', 'evidence-list');
  for (const evidence of result.snapshot.evidence) evidenceWrap.append(citation(evidence));
  card.append(evidenceWrap);
  return card;
}

function renderOpportunities(result) {
  const section = node('section', 'panel result-card opportunities-card');
  addSectionHeading(section, '03 / 02 · MOŽNOSTI K OVĚŘENÍ', 'Mapa příležitostí', 'HYPOTÉZY');
  section.append(node('p', 'section-intro', 'Každá položka je pracovní hypotéza. Veřejný web sám o sobě nepotvrzuje ruční práci, zájem ani rozpočet.'));
  const list = node('div', 'opportunity-list');
  result.opportunities.forEach((item, index) => {
    const card = node('article', 'opportunity');
    const head = node('div', 'opportunity-head');
    head.append(node('span', 'opportunity-index', String(index + 1).padStart(2, '0')));
    const title = node('h3', '', item.title);
    const confidence = node('span', 'confidence confidence-' + item.confidence.toLowerCase(), confidenceLabels[item.confidence] || item.confidence);
    head.append(title, confidence);
    const signal = node('div', 'signal-row');
    signal.append(node('span', 'mini-label', 'SIGNÁL'), node('p', '', item.observedSignal));
    const reason = node('div', 'inference-row');
    reason.append(node('span', 'hypothesis-tag', 'HYPOTÉZA'), node('p', '', item.possibleFriction));
    const confidenceNote = node('p', 'confidence-reason', item.confidenceReason);
    card.append(head, signal, reason, confidenceNote, citation(item.evidence));
    (item.supportingEvidence || []).forEach((evidence) => card.append(citation(evidence)));
    list.append(card);
  });
  section.append(list);
  return section;
}

function renderPilot(result) {
  const pilot = result.recommendedPilot;
  const section = node('section', 'panel result-card pilot-card');
  addSectionHeading(section, '03 / 03 · DOPORUČENÝ PRVNÍ KROK', pilot.title, 'K NÁVRHU');
  section.append(node('p', 'pilot-reason', pilot.whyThisFirst));

  const flow = node('div', 'pilot-flow');
  const trigger = node('article', 'flow-step');
  trigger.append(node('span', 'flow-number', '01'), node('span', 'flow-label', 'SPOUŠTĚČ'), node('p', '', pilot.trigger));
  const automation = node('article', 'flow-step flow-automation');
  automation.append(node('span', 'flow-number', '02'), node('span', 'flow-label', 'AUTOMATIZACE + VOLITELNÉ AI'));
  const steps = node('ul', 'automation-steps');
  pilot.automationSteps.forEach((step) => steps.append(node('li', '', step)));
  automation.append(steps);
  const human = node('article', 'flow-step flow-human');
  human.append(node('span', 'flow-number', '03'), node('span', 'flow-label', 'LIDSKÁ KONTROLA'), node('p', '', pilot.humanReview));
  flow.append(trigger, automation, human);
  section.append(flow);

  const outcome = node('div', 'outcome-strip');
  outcome.append(node('span', 'outcome-icon', '↳'), node('div', '', ''));
  outcome.lastChild.append(node('span', 'flow-label', 'VÝSLEDEK'), node('p', '', pilot.outcome));
  section.append(outcome);
  return section;
}

function makeBriefText(brief) {
  return brief.title + '\n\n' +
    'KONTEXT\n' + brief.context + '\n\n' +
    'NAVRŽENÝ PILOT\n' + brief.proposedPilot + '\n\n' +
    'K OVĚŘENÍ\n' + brief.confirm + '\n\n' +
    'Návrh k lidské revizi. Není odeslán.';
}

function renderBrief(result) {
  const section = node('section', 'panel result-card brief-card');
  const heading = addSectionHeading(section, 'ČESKÝ VÝSTUP', 'Brief pro lidskou revizi', 'DRAFT');
  const copyButton = button('Kopírovat brief', 'button button-copy', async () => {
    const text = makeBriefText(result.brief);
    try {
      await navigator.clipboard.writeText(text);
      copyButton.textContent = 'Zkopírováno ✓';
      window.setTimeout(() => { copyButton.textContent = 'Kopírovat brief'; }, 1800);
    } catch {
      const temp = document.createElement('textarea');
      temp.value = text;
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.append(temp);
      temp.select();
      const copied = document.execCommand('copy');
      temp.remove();
      copyButton.textContent = copied ? 'Zkopírováno ✓' : 'Kopírování se nezdařilo';
      window.setTimeout(() => { copyButton.textContent = 'Kopírovat brief'; }, 1800);
    }
  });
  heading.append(copyButton);
  const brief = node('div', 'brief-body');
  brief.append(node('h3', '', result.brief.title));
  const rows = [
    ['POZOROVANÝ KONTEXT', result.brief.context],
    ['NÁVRH PILOTU', result.brief.proposedPilot],
    ['CO JE POTŘEBA POTVRDIT', result.brief.confirm]
  ];
  for (const [label, text] of rows) {
    const row = node('div', 'brief-row');
    row.append(node('span', 'mini-label', label), node('p', '', text));
    brief.append(row);
  }
  brief.append(node('p', 'draft-disclaimer', 'Jde o návrh pro lidskou revizi, nikoli o automaticky odeslanou zprávu.'));
  section.append(brief);
  return section;
}

function renderWhyAi(result) {
  const section = node('section', 'panel result-card ai-card');
  addSectionHeading(section, 'CO V TOM DĚLÁ AI', 'Co běží teď — a co by přidalo AI', 'TRANSPARENTNĚ');
  section.append(node('p', 'ai-status', result.whyAi.actual));
  const grid = node('div', 'ai-grid');
  const items = [
    ['PRAVIDLOVÁ AUTOMATIZACE', result.whyAi.deterministicWork],
    ['ROLE LLM PROVIDERU', result.whyAi.llmRole],
    ['ČLOVĚK SCHVALUJE', result.whyAi.humanRole]
  ];
  items.forEach(([label, text], index) => {
    const item = node('article', 'ai-item');
    item.append(node('span', 'ai-index', '0' + (index + 1)), node('span', 'mini-label', label), node('p', '', text));
    grid.append(item);
  });
  section.append(grid);
  return section;
}

function renderSources(result) {
  const section = node('details', 'panel source-panel');
  const summary = node('summary', 'source-summary');
  summary.append(node('span', '', 'Použité zdroje'), node('span', 'source-count', String(result.sources.length).padStart(2, '0')));
  section.append(summary);
  const list = node('div', 'source-list');
  result.sources.forEach((source, index) => {
    const evidence = { ...source, quote: '' };
    const row = citation(evidence, { showTitle: true });
    row.classList.add('source-row');
    row.prepend(node('span', 'source-index', String(index + 1).padStart(2, '0')));
    list.append(row);
  });
  section.append(list);
  return section;
}

function renderResults(result) {
  resultsRoot.replaceChildren();
  const origin = result.sourceMode === 'fictional-demo' ? 'FIKTIVNÍ LOKÁLNÍ DATA' : 'VEŘEJNÝ VÝZKUM';
  const hero = node('section', 'result-hero');
  const heroTop = node('div', 'result-hero-top');
  heroTop.append(node('span', 'small-badge result-origin', origin), node('span', 'result-confidence-note', 'Fakta oddělena od hypotéz'));
  hero.append(heroTop, node('h2', '', result.companyName), node('p', 'result-domain', result.website));
  if (result.fetchNote) {
    const note = node('div', 'warning-note', 'Web se nepodařilo načíst; analýza používá pouze vložený veřejný text. ' + result.fetchNote);
    hero.append(note);
  }
  resultsRoot.append(hero, renderSnapshot(result), renderOpportunities(result), renderPilot(result), renderBrief(result), renderWhyAi(result), renderSources(result));
  resultsRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

requestJson('/api/health')
  .then((status) => {
    const element = document.querySelector('#provider-status');
    element.textContent = status.llmConfigured ? 'LLM provider aktivní' : 'Lokální režim · bez LLM klíče';
  })
  .catch(() => {
    document.querySelector('#provider-status').textContent = 'Lokální server';
  });

loadDemos();
