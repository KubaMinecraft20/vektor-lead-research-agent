import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_COMPANIES } from '../src/demo-data.ts';
import { LocalRulesProvider, STRICT_LLM_INSTRUCTIONS } from '../src/analysis.ts';
import { analyzeRequest, demoAnalysis, extractHtmlDocument, validatePublicUrl } from '../src/server.ts';

const provider = new LocalRulesProvider();

test('both local fictional companies produce cited, uncertainty-labelled results', async () => {
  for (const company of DEMO_COMPANIES) {
    const result = demoAnalysis(company.id);
    assert.equal(result.companyName, company.name);
    assert.equal(result.sourceMode, 'fictional-demo');
    assert.equal(result.providerMode, 'local-rules');
    assert.ok(result.opportunities.length >= 2 && result.opportunities.length <= 3);
    assert.ok(result.opportunities.every((item) => item.isHypothesis === true));
    assert.ok(result.opportunities.every((item) => item.evidence.quote.length > 0 && item.evidence.url.includes('.example')));
    assert.ok(result.snapshot.evidence.length > 0);
    assert.match(result.brief.title, /Návrh malého pilotu/);
    assert.match(result.whyAi.actual, /LLM/);
    assert.equal(result.sources.every((source) => source.origin === 'demo'), true);
  }
});

test('analyze API input can select local demo without fetching a website', async () => {
  const result = await analyzeRequest({ demoId: 'papirna-lipa' });
  assert.equal(result.companyName, 'Papírna Lípa Trade');
  assert.ok(result.opportunities.some((item) => /ceníku/.test(item.title)));
  assert.ok(result.opportunities.some((item) => /objednávek/.test(item.title)));
  assert.ok(result.recommendedPilot.trigger.includes('anonymizovaný'));
  assert.ok(result.recommendedPilot.humanReview.includes('nezapisuje'));
});

test('unavailable website falls back to user-supplied public text and labels that source', async () => {
  const result = await analyzeRequest({
    companyName: 'Testovací velkoobchod',
    website: 'https://public.invalid',
    pastedText: 'Velkoobchodní katalog je dostupný jako XLSX a obsahuje produktový kód a cenu. Objednávky přijímáme přes formulář s kódem produktu a množstvím.'
  }, {
    validateUrl: async () => new URL('https://public.invalid/'),
    fetchPages: async () => { throw new Error('Web neodpovídá.'); }
  });
  assert.equal(result.sourceMode, 'pasted-text');
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].origin, 'pasted');
  assert.equal(result.fetchNote, 'Web neodpovídá.');
  assert.ok(result.opportunities.every((item) => item.evidence.origin === 'pasted'));
});

test('confidence is high only when that opportunity has direct manual-work evidence', () => {
  const result = provider.analyze('Příklad', 'https://example.invalid', [
    {
      url: 'https://firma.test/cenik',
      title: 'Ceník',
      text: 'Ceník XLSX obsahuje produktový kód a cenu. Ceny v ceníku přepisujeme ručně každý týden. Objednávky přijímáme přes webový formulář.',
      origin: 'pasted'
    }
  ], 'pasted-text');
  const price = result.opportunities.find((item) => /ceníku/.test(item.title));
  const order = result.opportunities.find((item) => /objednávek/.test(item.title));
  assert.equal(price.confidence, 'High');
  assert.ok(price.supportingEvidence.some((item) => /přepisujeme ručně/.test(item.quote)));
  assert.equal(order.confidence, 'Medium');
});

test('HTML extraction removes executable content and ignores off-site links', () => {
  const page = extractHtmlDocument(
    '<html><head><title>Firma Lipa</title><meta name="description" content="Dodáváme obaly pro obchody."><script>DO_NOT_KEEP()</script></head><body><h1>Katalog</h1><p>Sortiment má přes padesát položek.</p><a href="/b2b/katalog">B2B</a><a href="https://other.example/about">external</a></body></html>',
    'https://firma.example/'
  );
  assert.equal(page.title, 'Firma Lipa');
  assert.match(page.text, /Dodáváme obaly/);
  assert.match(page.text, /Sortiment/);
  assert.doesNotMatch(page.text, /DO_NOT_KEEP/);
  assert.deepEqual(page.links, ['https://firma.example/b2b/katalog']);
});

test('URL guard rejects schemes, local addresses, example hosts, and nonstandard ports', async () => {
  for (const value of ['file:///etc/passwd', 'http://127.0.0.1', 'http://[::1]', 'http://localhost', 'https://demo.example/path', 'https://example.com:8443/']) {
    await assert.rejects(validatePublicUrl(value));
  }
});

test('strict LLM prompt requires evidence, hypotheses, Czech brief, and JSON', () => {
  assert.match(STRICT_LLM_INSTRUCTIONS, /source URL/i);
  assert.match(STRICT_LLM_INSTRUCTIONS, /hypotheses/i);
  assert.match(STRICT_LLM_INSTRUCTIONS, /professional Czech/i);
  assert.match(STRICT_LLM_INSTRUCTIONS, /valid JSON/i);
});
