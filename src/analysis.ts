export type Confidence = "High" | "Medium" | "Low";
export type SourceOrigin = "website" | "pasted" | "demo";

export interface SourceDocument {
  url: string;
  title: string;
  text: string;
  origin: SourceOrigin;
}

export interface Evidence {
  url: string;
  title: string;
  quote: string;
  origin: SourceOrigin;
}

export interface Opportunity {
  title: string;
  observedSignal: string;
  evidence: Evidence;
  supportingEvidence: Evidence[];
  confidence: Confidence;
  confidenceReason: string;
  possibleFriction: string;
  isHypothesis: true;
}

export interface LeadAnalysis {
  companyName: string;
  website: string;
  sourceMode: "public-website" | "pasted-text" | "website-and-pasted-text" | "fictional-demo";
  providerMode: "local-rules";
  snapshot: {
    whatItDoes: string;
    audience: string;
    evidence: Evidence[];
  };
  opportunities: Opportunity[];
  recommendedPilot: {
    title: string;
    whyThisFirst: string;
    trigger: string;
    automationSteps: string[];
    humanReview: string;
    outcome: string;
  };
  brief: {
    title: string;
    context: string;
    proposedPilot: string;
    confirm: string;
  };
  whyAi: {
    actual: string;
    deterministicWork: string;
    llmRole: string;
    humanRole: string;
  };
  sources: Array<{ url: string; title: string; origin: SourceOrigin }>;
}

export interface AnalysisProvider {
  readonly mode: "local-rules";
  analyze(companyName: string, website: string, documents: SourceDocument[], sourceMode: LeadAnalysis["sourceMode"]): LeadAnalysis;
}

// Kept with the provider boundary so a credential-backed LLM can be added without changing the UI contract.
export const STRICT_LLM_INSTRUCTIONS = [
  "Use only the supplied website text. Do not add company facts, contacts, tools, budgets, manual work, or results that the sources do not prove.",
  "For each factual claim, return a source URL and a short verbatim evidence quote from the supplied text.",
  "Describe workflow pain points as hypotheses unless a source explicitly proves the problem. State uncertainty and use High, Medium, or Low confidence with a reason.",
  "Do not infer that a public form, catalogue, or spreadsheet is currently handled manually.",
  "Recommend one small pilot with trigger, automation steps, a human approval point, and a qualitative outcome.",
  "Write the client brief in professional Czech and mark it as a human-reviewed draft.",
  "Return only valid JSON matching the application schema. If evidence is insufficient, say so instead of inventing details."
].join("\n");

function clean(text: string): string {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[kontaktní údaj vynechán]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[telefon vynechán]")
    .replace(/[\t\u00a0]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textSentences(documents: SourceDocument[]): Array<{ text: string; document: SourceDocument }> {
  return documents.flatMap((document) => {
    const text = clean(document.text);
    return text
      .split(/(?<=[.!?])\s+|\s*\n+|\s*\|\s*/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 18)
      .map((part) => ({ text: part, document }));
  });
}

function findEvidence(
  sentences: Array<{ text: string; document: SourceDocument }>,
  pattern: RegExp
): Evidence | null {
  const found = sentences.find((sentence) => pattern.test(sentence.text));
  if (!found) return null;
  const quote = found.text.length > 280 ? found.text.slice(0, 277).trimEnd() + "…" : found.text;
  return {
    url: found.document.url,
    title: found.document.title || found.document.url,
    quote,
    origin: found.document.origin
  };
}

function opportunity(
  title: string,
  observedSignal: string,
  evidence: Evidence,
  explicitManualSignal: boolean,
  confidenceReason: string,
  possibleFriction: string,
  supportingEvidence: Evidence[] = []
): Opportunity {
  return {
    title,
    observedSignal,
    evidence,
    supportingEvidence,
    confidence: explicitManualSignal ? "High" : "Medium",
    confidenceReason: explicitManualSignal
      ? "Veřejný text přímo popisuje ruční krok; rozsah a opakování je přesto třeba potvrdit."
      : confidenceReason,
    possibleFriction,
    isHypothesis: true
  };
}

function hasManualEvidence(evidence: Evidence): boolean {
  return /\b(?:ručně|manuálně|přepisujeme|přepisuje|kopírujeme|copy[- ]?paste)\b/i.test(evidence.quote);
}

function makeAnalysis(
  companyName: string,
  website: string,
  documents: SourceDocument[],
  sourceMode: LeadAnalysis["sourceMode"]
): LeadAnalysis {
  const sentences = textSentences(documents);
  if (sentences.reduce((sum, sentence) => sum + sentence.text.length, 0) < 70) {
    throw new Error("Ve zdrojích je příliš málo čitelného textu pro podloženou analýzu. Vložte delší veřejný popis firmy nebo zkuste jinou stránku.");
  }

  const priceFileSignal = findEvidence(sentences, /(?:(?:ceník|ceny|cena|price|velkoobchod|katalog).*(?:\bxlsx\b|\bcsv\b|\bexcel\b|\bpdf\b)|(?:\bxlsx\b|\bcsv\b|\bexcel\b|\bpdf\b).*(?:ceník|ceny|cena|price|velkoobchod|katalog))/i);
  const priceList = priceFileSignal || findEvidence(sentences, /(?:ceník|ceny|cena|price list|velkoobchodn[ií])/i);
  const orderFlow = findEvidence(sentences, /(?:objednávk|objednáv|poptávk|poptav|formulář|formulár)/i);
  const productCatalog = findEvidence(sentences, /(?:sortiment|produkty|výrobky|položk|kategorie|produktov[ýy] kód|nabízíme|dodáváme|prodáváme)/i);
  const customerService = findEvidence(sentences, /(?:doručen|dodání|reklamac|vrácen|časté otázky|faq|podpora|servis)/i);
  const manualPriceSignal = findEvidence(sentences, /(?:(?:ceník|ceny|cena|xlsx|csv|excel).*(?:ručně|manuálně|přepis|kopírujeme)|(?:ručně|manuálně|přepis|kopírujeme).*(?:ceník|ceny|cena|xlsx|csv|excel))/i);
  const manualOrderSignal = findEvidence(sentences, /(?:(?:objednávk|poptávk|formulář|produktov[ýy] kód|množstv[ií]).*(?:ručně|manuálně|přepis|kopírujeme)|(?:ručně|manuálně|přepis|kopírujeme).*(?:objednávk|poptávk|formulář|produktov[ýy] kód|množstv[ií]))/i);
  const manualProductSignal = findEvidence(sentences, /(?:(?:sortiment|produkty|výrobky|položk|kategorie).*(?:ručně|manuálně|přepis|kopírujeme)|(?:ručně|manuálně|přepis|kopírujeme).*(?:sortiment|produkty|výrobky|položk|kategorie))/i);
  const manualServiceSignal = findEvidence(sentences, /(?:(?:doručen|dodání|reklamac|vrácen|faq|podpora|servis).*(?:ručně|manuálně|přepis|kopírujeme)|(?:ručně|manuálně|přepis|kopírujeme).*(?:doručen|dodání|reklamac|vrácen|faq|podpora|servis))/i);
  const opportunities: Opportunity[] = [];

  if (priceList) {
    const strongerEvidence = priceFileSignal || priceList;
    opportunities.push(opportunity(
      "Kontrola a sjednocení ceníku",
      "Veřejný text zmiňuje souborový katalog nebo ceník; současný interní postup není znám.",
      strongerEvidence,
      hasManualEvidence(manualPriceSignal || strongerEvidence),
      "Formát souboru nebo ceníku je doložen. To samo o sobě neprokazuje ruční zpracování.",
      "Při opakovaných změnách může být užitečné před dalším použitím ověřit kódy, ceny a chybějící hodnoty. Zda se změny dnes kontrolují ručně, je hypotéza.",
      manualPriceSignal && manualPriceSignal.quote !== strongerEvidence.quote ? [manualPriceSignal] : []
    ));
  }

  if (orderFlow) {
    opportunities.push(opportunity(
      "Předkontrola příchozích objednávek nebo poptávek",
      "Web popisuje objednávku, poptávkový formulář nebo požadované údaje.",
      manualOrderSignal || orderFlow,
      hasManualEvidence(manualOrderSignal || orderFlow),
      "Vstupní formulář či objednávkový proces je doložen; počet variant a případná ruční práce nejsou veřejně ověřené.",
      "Pokud přicházejí neúplné nebo různě strukturované požadavky, kontrolní návrh může zvýraznit chybějící pole ještě před potvrzením.",
      manualOrderSignal && manualOrderSignal.quote !== orderFlow.quote ? [manualOrderSignal] : []
    ));
  }

  if (productCatalog && opportunities.length < 3) {
    opportunities.push(opportunity(
      "Kontrola změn v produktových datech",
      "Web uvádí sortiment, produktové položky nebo jejich kódy.",
      manualProductSignal || productCatalog,
      hasManualEvidence(manualProductSignal || productCatalog),
      "Katalogové informace jsou doložené. Veřejné stránky neukazují, zda se data mění často ani jak se spravují.",
      "Při změně většího počtu položek může pomoci přehled rozdílů a chybných kódů před ručním schválením. Potřebu je nutné ověřit se zákazníkem.",
      manualProductSignal && manualProductSignal.quote !== productCatalog.quote ? [manualProductSignal] : []
    ));
  }

  if (customerService && opportunities.length < 2) {
    opportunities.push(opportunity(
      "Příprava přehledu opakujících se provozních dotazů",
      "Veřejná stránka popisuje dodání, reklamace nebo podporu.",
      manualServiceSignal || customerService,
      hasManualEvidence(manualServiceSignal || customerService),
      "Téma zákaznické podpory je veřejně uvedené; četnost dotazů ani současný postup zdroj neuvádí.",
      "Pokud se stejné otázky opakují, jejich roztřídění do návrhu odpovědí může zjednodušit lidskou kontrolu.",
      manualServiceSignal && manualServiceSignal.quote !== customerService.quote ? [manualServiceSignal] : []
    ));
  }

  if (opportunities.length < 2) {
    const fallbackEvidence = priceList || orderFlow || productCatalog || customerService;
    if (fallbackEvidence) {
      opportunities.push(opportunity(
        "Přehled neúplných údajů před dalším krokem",
        "Veřejný popis obsahuje údaje o nabídce nebo procesu, ale nedokládá interní způsob zpracování.",
        manualPriceSignal || manualOrderSignal || manualProductSignal || manualServiceSignal || fallbackEvidence,
        hasManualEvidence(manualPriceSignal || manualOrderSignal || manualProductSignal || manualServiceSignal || fallbackEvidence),
        "Jde o nízkou jistotu odvozenou z omezeného veřejného popisu; je potřeba ověřit, zda podobná kontrola vůbec dává smysl.",
        "Jednoduchá validační kontrola může pomoci zachytit chybějící hodnoty, pokud se s těmito údaji opakovaně pracuje.",
        [manualPriceSignal, manualOrderSignal, manualProductSignal, manualServiceSignal]
          .filter((item): item is Evidence => item !== null && item.quote !== fallbackEvidence.quote)
      ));
      if (opportunities[opportunities.length - 1].confidence !== "High") {
    opportunities[opportunities.length - 1].confidence = "Low";
        opportunities[opportunities.length - 1].confidenceReason = "Jde o nízkou jistotu odvozenou z omezeného veřejného popisu; je potřeba ověřit, zda podobná kontrola vůbec dává smysl.";
      }
    }
  }

  if (opportunities.length === 0) {
    throw new Error("Veřejný text neobsahuje dost konkrétních signálů pro návrh workflow. Vložte delší popis produktů, objednávky nebo jiného procesu.");
  }

  const firstSentence = sentences[0];
  const productEvidence = productCatalog || priceList || orderFlow || customerService;
  const descriptionEvidence = firstSentence
    ? {
        url: firstSentence.document.url,
        title: firstSentence.document.title || firstSentence.document.url,
        quote: firstSentence.text.slice(0, 280),
        origin: firstSentence.document.origin
      }
    : null;
  const audienceEvidence = findEvidence(sentences, /(?:velkoobchod|b2b|pro obchodn[ií] partnery|kavárn|obchodům|zákazník|domácnost|firmám|provozu)/i);
  let audience = "Z dostupného textu nelze bezpečně určit cílovou skupinu.";
  if (audienceEvidence) {
    const audienceText = audienceEvidence.quote;
    if (/(?:velkoobchod|b2b|pro obchodn[ií] partnery|firmám|provozu)/i.test(audienceText)) {
      audience = "Text naznačuje obchodní zákazníky nebo partnery; jde o odhad podle citované stránky.";
    } else if (/(?:kavárn|obchodům|zákazník|domácnost)/i.test(audienceText)) {
      audience = "Text naznačuje zákazníky uvedené ve zdroji; jde o odhad podle citované stránky.";
    }
  }

  const pilotOpportunity = opportunities.find((item) => /ceníku|katalogu/i.test(item.title))
    || opportunities.find((item) => /objednávek|poptávek/i.test(item.title))
    || opportunities[0];
  const isFilePilot = /ceníku|katalogu/i.test(pilotOpportunity.title);
  const pilotTitle = isFilePilot
    ? "Jeden ceník → kontrolní návrh importu"
    : "Jeden vstupní formulář → kontrolní přehled";
  const pilotTrigger = isFilePilot
    ? "Po potvrzení rozsahu: klient dodá jeden anonymizovaný CSV/XLSX vzorek a cílové sloupce. To je návrh, ne ověřený současný proces."
    : "Po potvrzení rozsahu: klient dodá anonymizovaný vzorek jednoho typu formuláře a určí povinná pole."
  ;
  const pilotSteps = isFilePilot
    ? [
        "Deterministická pravidla načtou jeden soubor, sjednotí potvrzené sloupce a označí chybějící nebo duplicitní kódy a neplatné ceny.",
        "Volitelný LLM krok by mohl navrhnout význam neznámých názvů sloupců a stručně vysvětlit výjimky; v této instalaci LLM neběží."
      ]
    : [
        "Deterministická pravidla ověří dohodnutá povinná pole a připraví strukturovaný návrh k posouzení.",
        "Volitelný LLM krok by mohl shrnout volný text a upozornit na nejednoznačné požadavky; v této instalaci LLM neběží."
      ];
  const sources = documents.map((document) => ({
    url: document.url,
    title: document.title || document.url,
    origin: document.origin
  }));
  const snapshotEvidence = [descriptionEvidence, audienceEvidence, productEvidence]
    .filter((item): item is Evidence => item !== null)
    .filter((item, index, values) => values.findIndex((other) => other.url === item.url && other.quote === item.quote) === index)
    .slice(0, 3);

  return {
    companyName,
    website,
    sourceMode,
    providerMode: "local-rules",
    snapshot: {
      whatItDoes: descriptionEvidence
        ? "Veřejný text popisuje: „" + descriptionEvidence.quote + "“"
        : "Popis činnosti nelze z dostupného textu bezpečně sestavit.",
      audience,
      evidence: snapshotEvidence
    },
    opportunities: opportunities.slice(0, 3),
    recommendedPilot: {
      title: pilotTitle,
      whyThisFirst: "Jde o malý, kontrolovatelný test navázaný na citovaný veřejný signál. Veřejné zdroje neprokazují, že současný postup je ruční nebo že firma pilot potřebuje.",
      trigger: pilotTrigger,
      automationSteps: pilotSteps,
      humanReview: "Člověk potvrdí mapování i výjimky. Návrh se nikam automaticky nezapisuje a nikomu se neposílá.",
      outcome: "Kontrolní soubor nebo přehled výjimek k ručnímu ověření; případná úspora se bez změření výchozího stavu neslibuje."
    },
    brief: {
      title: "Návrh malého pilotu pro " + companyName,
      context: (descriptionEvidence ? descriptionEvidence.quote : "Veřejný popis firmy je omezený.") + " Ve zdroji je také signál: „" + pilotOpportunity.evidence.quote + "“. Případná provozní potřeba je zatím hypotéza.",
      proposedPilot: pilotTitle + ": po potvrzení procesu připravit na jednom anonymizovaném vzorku kontrolní výstup s chybami a návrhem sloupců. Platba ani rozsah nejsou tímto výzkumem potvrzeny.",
      confirm: "Zda se s tímto typem souboru nebo požadavku pracuje opakovaně, jak vypadají vstup a požadovaný výstup, kdo schvaluje změny a které údaje je nutné anonymizovat."
    },
    whyAi: {
      actual: "Tento běh používá lokální pravidla, protože není nakonfigurován žádný LLM API klíč. Aplikace netvrdí, že právě teď používá generativní AI.",
      deterministicWork: "Pravidlová automatizace zpracuje stránky, oddělí citace od hypotéz, kontroluje povolené URL a formátuje výstup. Tyto kroky nevyžadují AI.",
      llmRole: "Při zapojení provideru by LLM dostal jen zadaný veřejný text a přísné instrukce: shrnout doložené signály, navrhnout opatrné hypotézy a vrátit strukturovaný JSON s citacemi. Nejasné sloupce či volný text může vysvětlit pružněji než statický formulář.",
      humanRole: "Člověk ověří citace, potvrdí hypotézy a schválí každý budoucí pilot. Aplikace nic neodesílá ani nemění v cizích systémech."
    },
    sources
  };
}

export class LocalRulesProvider implements AnalysisProvider {
  readonly mode = "local-rules" as const;

  analyze(
    companyName: string,
    website: string,
    documents: SourceDocument[],
    sourceMode: LeadAnalysis["sourceMode"]
  ): LeadAnalysis {
    return makeAnalysis(companyName, website, documents, sourceMode);
  }
}

export const analysisProvider = new LocalRulesProvider();
