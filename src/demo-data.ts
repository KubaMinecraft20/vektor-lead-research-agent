export interface DemoPage {
  path: string;
  title: string;
  text: string;
}

export interface DemoCompany {
  id: string;
  name: string;
  url: string;
  sector: string;
  description: string;
  pages: DemoPage[];
}

// These companies and pages are deliberately fictional. Their .example URLs are reserved placeholders.
export const DEMO_COMPANIES: DemoCompany[] = [
  {
    id: "dilna-sever",
    name: "Dílna Sever",
    url: "https://dilna-sever.example",
    sector: "Zakázkový nábytek · fiktivní ukázka",
    description: "Zakázkové stoly a police z masivního dřeva",
    pages: [
      {
        path: "/",
        title: "Dílna Sever — nábytek na míru",
        text: "Navrhujeme a vyrábíme stoly a police z masivního dřeva na míru. Poptávky přijímáme přes webový formulář; zákazník v něm vyplní rozměry, dřevinu a požadovaný termín. Ukázky realizací jsou rozdělené podle typu výrobku."
      },
      {
        path: "/pro-partnery",
        title: "Pro interiérová studia",
        text: "Pro architekty a interiérová studia poskytujeme B2B ceník ve formátu XLSX. Ceník obsahuje kód varianty, materiál, rozměry a doporučenou cenu. Každou zakázku před výrobou potvrzuje člověk."
      },
      {
        path: "/pece-a-dodani",
        title: "Péče a dodání",
        text: "U každého výrobku uvádíme materiál a doporučenou péči. Dodání se domlouvá po potvrzení rozměrů a termínu zakázky."
      }
    ]
  },
  {
    id: "papirna-lipa",
    name: "Papírna Lípa Trade",
    url: "https://papirna-lipa.example",
    sector: "Obaly a kancelářské potřeby · fiktivní ukázka",
    description: "Velkoobchodní katalog obalů a kancelářských potřeb",
    pages: [
      {
        path: "/",
        title: "Papírna Lípa Trade — obaly pro provozy",
        text: "Dodáváme papírové obaly, krabice a kancelářské potřeby kavárnám, obchodům a menším výrobnám. Sortiment je rozdělený do kategorií a každá položka má produktový kód."
      },
      {
        path: "/b2b/katalog",
        title: "Katalog pro obchodní partnery",
        text: "Aktuální velkoobchodní katalog je ke stažení jako XLSX. Obsahuje kód produktu, jednotku, cenu a dostupnost. Katalog aktualizujeme při změně sortimentu."
      },
      {
        path: "/objednavky",
        title: "Objednávky",
        text: "Objednávky přijímáme přes formulář nebo jako tabulku s produktovým kódem a množstvím. Dostupnost každé položky před potvrzením objednávky ověří náš tým."
      }
    ]
  }
];
