import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname } from "node:path";
import { analysisProvider, type SourceDocument, type LeadAnalysis } from "./analysis.ts";
import { DEMO_COMPANIES } from "./demo-data.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PUBLIC_DIR = resolve(ROOT, "public");
const MAX_BODY_BYTES = 24_000;
const MAX_PAGE_BYTES = 1_200_000;
const MAX_PAGES = 3;
const FETCH_TIMEOUT_MS = 8_000;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function safeHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
}

function json(response: ServerResponse, status: number, data: unknown): void {
  safeHeaders(response);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += part.length;
    if (bytes > MAX_BODY_BYTES) throw new HttpError(413, "Odeslaný text je příliš dlouhý. Zkraťte jej a zkuste to znovu.");
    chunks.push(part);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Požadavek se nepodařilo přečíst. Zkuste stránku obnovit.");
  }
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&", quot: "\"", apos: "'", nbsp: " ", lt: "<", gt: ">",
    aacute: "á", Aacute: "Á", eacute: "é", Eacute: "É", iacute: "í", Iacute: "Í",
    oacute: "ó", Oacute: "Ó", uacute: "ú", Uacute: "Ú", yacute: "ý", Yacute: "Ý",
    ccaron: "č", Ccaron: "Č", dcaron: "ď", Dcaron: "Ď", ecaron: "ě", Ecaron: "Ě",
    ncaron: "ň", Ncaron: "Ň", rcaron: "ř", Rcaron: "Ř", scaron: "š", Scaron: "Š",
    tcaron: "ť", Tcaron: "Ť", uring: "ů", Uring: "Ů", zcaron: "ž", Zcaron: "Ž"
  };
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === "#") {
      const value = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      try { return Number.isFinite(value) ? String.fromCodePoint(value) : whole; } catch { return whole; }
    }
    return named[entity] ?? named[entity.toLowerCase()] ?? whole;
  });
}

function stripMarkup(html: string): string {
  return decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|template|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|section|article|tr|br|main|header|footer|dt|dd)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " "))
    .replace(/[\t\u00a0 ]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function extractHtmlDocument(html: string, url: string): SourceDocument & { links: string[] } {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  const metaDescription = html.match(/<meta\b(?=[^>]*\bname\s*=\s*["']description["'])(?=[^>]*\bcontent\s*=\s*["']([^"']*)["'])[^>]*>/i)
    || html.match(/<meta\b(?=[^>]*\bcontent\s*=\s*["']([^"']*)["'])(?=[^>]*\bname\s*=\s*["']description["'])[^>]*>/i);
  const title = stripMarkup(titleMatch?.[1] ?? "") || new URL(url).hostname;
  const description = metaDescription?.[1] ? stripMarkup(metaDescription[1]) : "";
  const bodyText = stripMarkup(html);
  const text = [description, bodyText].filter(Boolean).join("\n").slice(0, 16_000);
  const links: string[] = [];
  const hrefs = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  for (const match of html.matchAll(hrefs)) {
    const raw = decodeEntities(match[1] || match[2] || match[3] || "").trim();
    if (!raw || /^(?:mailto:|tel:|javascript:|#)/i.test(raw)) continue;
    try {
      const candidate = new URL(raw, url);
      if (candidate.origin !== new URL(url).origin) continue;
      if (!/(?:about|company|products?|catalog|cen[ií]k|b2b|wholesale|services?|contact|faq|objedn|velkoobchod|pro[-_]partn)/i.test(candidate.pathname)) continue;
      candidate.hash = "";
      if (!links.includes(candidate.href)) links.push(candidate.href);
      if (links.length >= 6) break;
    } catch { /* Ignore malformed links. */ }
  }
  return { url, title, text, origin: "website", links };
}

function isPublicIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 88 && c === 99))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function expandIPv6(address: string): number[] | null {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized.includes(".")) {
    const splitAt = normalized.lastIndexOf(":");
    const ipv4 = normalized.slice(splitAt + 1);
    if (!isIP(ipv4)) return null;
    const parts = ipv4.split(".").map(Number);
    const tail = [((parts[0] << 8) | parts[1]), ((parts[2] << 8) | parts[3])];
    return expandIPv6(normalized.slice(0, splitAt + 1) + tail.map((value) => value.toString(16)).join(":"));
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right].map((value) => parseInt(value || "0", 16));
  return groups.length === 8 && groups.every((value) => Number.isInteger(value) && value >= 0 && value <= 65535) ? groups : null;
}

function isPublicAddress(address: string, family: number): boolean {
  if (family === 4 || isIP(address) === 4) return isPublicIPv4(address);
  if (family !== 6 && isIP(address) !== 6) return false;
  const groups = expandIPv6(address);
  if (!groups) return false;
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mapped) {
    const ipv4 = [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join(".");
    return isPublicIPv4(ipv4);
  }
  // Accept global-unicast IPv6 only; this excludes loopback, link-local, ULA, and special-use ranges.
  if ((groups[0] & 0xe000) !== 0x2000) return false;
  if (groups[0] === 0x2001 && (groups[1] === 0x0db8 || (groups[1] & 0xfff0) === 0x0010)) return false;
  return true;
}

function parsePublicUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 2_000) {
    throw new HttpError(400, "Zadejte platnou veřejnou webovou adresu začínající https:// nebo http://.");
  }
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new HttpError(400, "Zadejte platnou veřejnou webovou adresu začínající https:// nebo http://."); }
  const literalHost = url.hostname.replace(/^\[|\]$/g, "");
  if (!/^(?:https?:)$/.test(url.protocol) || url.username || url.password || isIP(literalHost)) {
    throw new HttpError(400, "Povolená je pouze veřejná webová adresa HTTP/HTTPS bez přihlašovacích údajů.");
  }
  const host = literalHost.toLowerCase().replace(/\.$/, "");
  if (!host || /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host)) {
    throw new HttpError(400, "Tato adresa není veřejný web. Použijte doménu veřejně dostupné firmy.");
  }
  const port = url.port ? Number(url.port) : (url.protocol === "https:" ? 443 : 80);
  if (port !== 80 && port !== 443) throw new HttpError(400, "Z bezpečnostních důvodů jsou povolené pouze standardní webové porty 80 a 443.");
  return url;
}

export async function validatePublicUrl(value: unknown): Promise<URL> {
  const url = parsePublicUrl(value);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  let addresses: Array<{ address: string; family: number }>;
  try { addresses = await dnsLookup(host, { all: true, verbatim: true }); }
  catch { throw new HttpError(422, "Doménu se nepodařilo najít. Zkontrolujte adresu nebo vložte veřejný text ručně."); }
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address, item.family))) {
    throw new HttpError(400, "Tato doména se nepřekládá pouze na veřejné IP adresy, proto ji aplikace z bezpečnostních důvodů nenačte.");
  }
  return url;
}

interface PageResponse { status: number; headers: IncomingMessage["headers"]; body: Buffer }

async function requestPinned(url: URL): Promise<PageResponse> {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const addresses = await dnsLookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address, item.family))) {
    throw new HttpError(400, "Web přesměroval na neveřejnou adresu, kterou aplikace z bezpečnostních důvodů nenačte.");
  }
  const requestFunction = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolvePromise, rejectPromise) => {
    let done = false;
    const finishError = (error: Error) => { if (!done) { done = true; rejectPromise(error); } };
    const lookup = (_hostname: string, options: { all?: boolean }, callback: (...args: any[]) => void) => {
      if (options?.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    };
    const request = requestFunction({
      protocol: url.protocol,
      hostname: host,
      port: url.port || undefined,
      path: url.pathname + url.search,
      method: "GET",
      headers: {
        "User-Agent": "VektorLeadResearch/1.0 (+public-page fetch; no tracking)",
        Accept: "text/html, text/plain;q=0.9",
        "Accept-Encoding": "identity",
        "Accept-Language": "cs,en;q=0.7"
      },
      lookup,
      servername: url.protocol === "https:" ? host : undefined,
      timeout: FETCH_TIMEOUT_MS
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer | string) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += data.length;
        if (size > MAX_PAGE_BYTES) {
          response.destroy();
          request.destroy();
          finishError(new HttpError(422, "Stránka je příliš velká pro bezpečné načtení."));
          return;
        }
        chunks.push(data);
      });
      response.on("end", () => {
        if (done) return;
        done = true;
        resolvePromise({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) });
      });
      response.on("error", finishError);
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", (error) => finishError(new HttpError(422, error.message === "timeout"
      ? "Web neodpovídá v časovém limitu. Vložte veřejný text ručně."
      : "Web se nepodařilo bezpečně načíst. Vložte veřejný text ručně.")));
    request.end();
  });
}

function decodeBody(body: Buffer, contentType: string | undefined): string {
  const charset = contentType?.match(/charset\s*=\s*['"]?([^\s;'\"]+)/i)?.[1] ?? "utf-8";
  try { return new TextDecoder(charset, { fatal: false }).decode(body); }
  catch { return body.toString("utf8"); }
}

async function getPublicPage(startUrl: string): Promise<SourceDocument & { links: string[] }> {
  let current = startUrl;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const url = await validatePublicUrl(current);
    const result = await requestPinned(url);
    if (result.status >= 300 && result.status < 400 && result.headers.location) {
      if (redirect === 3) throw new HttpError(422, "Web přesměrovává příliš často.");
      current = new URL(result.headers.location, url).href;
      continue;
    }
    if (result.status < 200 || result.status >= 300) {
      throw new HttpError(422, "Web vrátil stav " + result.status + ". Zkontrolujte adresu nebo vložte veřejný text ručně.");
    }
    const contentType = result.headers["content-type"];
    if (!contentType || !/(?:text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) {
      throw new HttpError(422, "Adresa nevrátila čitelnou webovou stránku. Vložte veřejný text ručně.");
    }
    const doc = extractHtmlDocument(decodeBody(result.body, contentType), url.href);
    if (doc.text.length < 70) throw new HttpError(422, "Na stránce se nenašel dost čitelného textu. Vložte veřejný text ručně.");
    return doc;
  }
  throw new HttpError(422, "Web se nepodařilo načíst. Vložte veřejný text ručně.");
}

async function collectWebsiteDocuments(startUrl: string): Promise<SourceDocument[]> {
  const first = await getPublicPage(startUrl);
  const documents: SourceDocument[] = [first];
  const sameOrigin = new URL(first.url).origin;
  for (const link of first.links) {
    if (documents.length >= MAX_PAGES) break;
    try {
      if (new URL(link).origin !== sameOrigin || documents.some((doc) => doc.url === link)) continue;
      const page = await getPublicPage(link);
      documents.push(page);
    } catch {
      // The requested public page remains a valid source when a linked page is unavailable.
    }
  }
  return documents;
}

export function demoAnalysis(id: string): LeadAnalysis {
  const company = DEMO_COMPANIES.find((candidate) => candidate.id === id);
  if (!company) throw new HttpError(404, "Ukázková firma už není dostupná.");
  const documents: SourceDocument[] = company.pages.map((page) => ({
    url: new URL(page.path, company.url).href,
    title: page.title,
    text: page.text,
    origin: "demo"
  }));
  return analysisProvider.analyze(company.name, company.url, documents, "fictional-demo");
}

export async function analyzeRequest(
  body: Record<string, unknown>,
  dependencies: {
    validateUrl?: (value: unknown) => Promise<URL>;
    fetchPages?: (url: string) => Promise<SourceDocument[]>;
    analyze?: typeof analysisProvider.analyze;
  } = {}
): Promise<LeadAnalysis> {
  if (typeof body.demoId === "string" && body.demoId) return demoAnalysis(body.demoId);
  const companyName = typeof body.companyName === "string" ? body.companyName.trim().slice(0, 140) : "";
  const urlValue = body.website;
  const pasted = typeof body.pastedText === "string" ? body.pastedText.trim().slice(0, 12_000) : "";
  if (!companyName) throw new HttpError(400, "Doplňte název firmy.");
  let checkedUrl: URL;
  let documents: SourceDocument[] = [];
  let fetchNote = "";
  try {
    checkedUrl = await (dependencies.validateUrl ?? validatePublicUrl)(urlValue);
  } catch (error) {
    if (!pasted || !(error instanceof HttpError) || error.status !== 422) throw error;
    checkedUrl = parsePublicUrl(urlValue);
    fetchNote = error.message;
  }
  if (!fetchNote) {
    try {
      documents = await (dependencies.fetchPages ?? collectWebsiteDocuments)(checkedUrl.href);
    } catch (error) {
      if (!pasted) throw error;
      fetchNote = error instanceof Error ? error.message : "Web se nepodařilo načíst.";
    }
  }
  if (pasted) {
    documents.push({
      url: "Vložený veřejný text (uživatelem)",
      title: "Vložený veřejný text",
      text: pasted,
      origin: "pasted"
    });
  }
  if (!documents.length) throw new HttpError(422, "Web se nepodařilo načíst. Vložte veřejný text z webu do volitelného pole.");
  const sourceMode: LeadAnalysis["sourceMode"] = pasted
    ? (documents.some((doc) => doc.origin === "website") ? "website-and-pasted-text" : "pasted-text")
    : "public-website";
  const analyze = dependencies.analyze ?? analysisProvider.analyze.bind(analysisProvider);
  const result = analyze(companyName, checkedUrl.href, documents, sourceMode);
  if (fetchNote) (result as LeadAnalysis & { fetchNote: string }).fetchNote = fetchNote;
  return result;
}

const staticFiles: Record<string, string> = {
  "/": "index.html",
  "/index.html": "index.html",
  "/app.js": "app.js",
  "/styles.css": "styles.css"
};

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const fileName = staticFiles[pathname];
  if (!fileName) {
    json(response, 404, { error: "Tato stránka neexistuje." });
    return;
  }
  try {
    const content = await readFile(resolve(PUBLIC_DIR, fileName));
    const type = extname(fileName) === ".css" ? "text/css" : extname(fileName) === ".js" ? "text/javascript" : "text/html";
    safeHeaders(response);
    response.writeHead(200, { "Content-Type": type + "; charset=utf-8", "Cache-Control": "no-store" });
    response.end(content);
  } catch {
    json(response, 500, { error: "Nepodařilo se načíst soubor aplikace." });
  }
}

export function createServer() {
  return createHttpServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && requestUrl.pathname === "/api/health") {
        json(response, 200, { ok: true, providerMode: "local-rules", llmConfigured: false });
        return;
      }
      if (request.method === "GET" && requestUrl.pathname === "/api/demos") {
        json(response, 200, {
          items: DEMO_COMPANIES.map(({ id, name, url, sector, description }) => ({ id, name, url, sector, description, fictional: true }))
        });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/api/analyze") {
        const body = await readJson(request);
        const result = await analyzeRequest(body);
        json(response, 200, result);
        return;
      }
      if (request.method === "GET") {
        await serveStatic(requestUrl.pathname, response);
        return;
      }
      json(response, 405, { error: "Tato metoda není podporovaná." });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 422;
      const message = error instanceof Error ? error.message : "Analýzu se nepodařilo dokončit.";
      json(response, status, { error: message });
    }
  });
}

const launchedFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (launchedFile === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT must be an integer from 0 to 65535");
  const server = createServer();
  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.log("Vektor Lead Research Agent běží na http://" + host + ":" + actualPort);
  });
  server.on("error", (error: Error & { code?: string }) => {
    if (error.code === "EADDRINUSE") console.error("Port " + port + " je obsazený. Zkuste například PORT=3001 npm start.");
    else console.error("Server se nepodařilo spustit: " + error.message);
    process.exitCode = 1;
  });
}
