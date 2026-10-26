export type SectionKind="hero"|"categories"|"products"|"personalization"|"retro"|"accessories"|"banner"|"text"|"services"|"campaign";
export type SectionSettings=Record<string,string|number|boolean>;
export type HomeSection={id:string;type:SectionKind;enabled:boolean;settings:SectionSettings};
export type HomeConfig={version:1;sections:HomeSection[]};
export type HomeResponse={config:HomeConfig;revision:number;published_revision:number;draft_changed:boolean;updated:string};
export type Field={key:string;label:string;type:"short"|"long"|"image"|"url"|"number"|"select"|"toggle"|"color"|"product";min?:number;max?:number;options?:{value:string|number;label:string}[];hint?:string;defaultValue?:string|number|boolean};
const opts=(values:string[])=>values.map(v=>({value:v,label:v}));
export const categories=["Wszystko","Koszulki","Bluzy","Akcesoria","Dzieci"];
export const SECTION_DESCRIPTIONS:Record<SectionKind,{name:string;about:string}>={
 campaign:{name:"Kampania z produktami",about:"Zdjęcie pasujących produktów na modelu lub lifestyle i powiązany katalog"},
 hero:{name:"Baner główny / slajdy",about:"Pierwszy baner i dwie opcjonalne kolekcje. Domyślne zdjęcia pochodzą z aktualnego katalogu."},
 categories:{name:"Kolekcje",about:"Wybór kategorii i liczba kolumn"},
 products:{name:"Produkty",about:"Produkty z katalogu, filtry i liczba elementów"},
 personalization:{name:"Personalizacja",about:"Wyróżnienie konkretnej koszulki lub bluzy z nadrukiem"},
 retro:{name:"Zdjęcie + produkt",about:"Opowieść o produkcie, dwie kolumny"},
 accessories:{name:"Akcesoria",about:"Kafelki produktów z kategorii Akcesoria"},
 banner:{name:"Baner kampanii",about:"Zdjęcie, kolor, przycisk i historia klubu"},
 text:{name:"Sekcja tekstowa",about:"Nagłówek i opis do dowolnej sekcji"},
 services:{name:"Informacje",about:"Trzy linki pomocy na dole strony"}
};
const productField:Field={key:"product_id",label:"Produkt z katalogu",type:"product"};
const eyebrow:Field={key:"eyebrow",label:"Nadtytuł",type:"short"};
const heading:Field={key:"title",label:"Nagłówek",type:"short",hint:"Możesz wymusić nową linię znakiem |"};
const desc:Field={key:"description",label:"Opis",type:"long"};
const cta:Field={key:"cta_text",label:"Tekst przycisku",type:"short"};
const image:Field={key:"image",label:"Zdjęcie",type:"image"};
const align:Field={key:"alignment",label:"Wyrównanie tekstu",type:"select",options:opts(["left","center","right"])};
const catOptions=opts(categories);
const cols:Field={key:"columns",label:"Liczba kolumn",type:"select",options:[2,3,4].map(n=>({value:n,label:String(n)}))};
const count:Field={key:"count",label:"Liczba produktów",type:"number",min:1,max:12};
const heroRoles=[{value:"packshot",label:"Produkt / packshot"},{value:"model",label:"Na modelu"},{value:"detail",label:"Detal"},{value:"lifestyle",label:"Lifestyle / kibice"}];
const slideFields=(n:number):Field[]=>[
 {key:`slide_${n}_enabled`,label:`Pokaż slajd ${n}`,type:"toggle",defaultValue:true,hint:"Puste pola korzystają z kolekcji i zdjęcia z aktualnego katalogu."},
 {key:`slide_${n}_eyebrow`,label:"Nadtytuł",type:"short"},
 {key:`slide_${n}_title`,label:"Nagłówek",type:"short"},
 {key:`slide_${n}_description`,label:"Opis",type:"long"},
 {key:`slide_${n}_image`,label:"Zdjęcie (puste = katalog)",type:"image"},
 {key:`slide_${n}_image_alt`,label:"Opis zdjęcia",type:"short",hint:"Wymagany dla własnego zdjęcia aktywnego slajdu."},
 {key:`slide_${n}_image_role`,label:"Rola zdjęcia",type:"select",options:heroRoles,defaultValue:"packshot"},
 {key:`slide_${n}_image_illustrative`,label:"Materiał poglądowy",type:"toggle",defaultValue:true,hint:"Wyłącz tylko dla zdjęcia przedstawiającego dokładny produkt, kolor i wzór."},
 {key:`slide_${n}_cta_text`,label:"Tekst przycisku",type:"short"},
 {key:`slide_${n}_cta_url`,label:"Link przycisku",type:"url"},
];
export const EDIT_FIELDS:Record<SectionKind,Field[]>={
 campaign:[eyebrow,heading,desc,{key:"product_ids",label:"Produkty kampanii",type:"short"},image,{key:"image_alt",label:"Opis zdjęcia",type:"short"},{key:"image_role",label:"Rola zdjęcia",type:"select",options:[{value:"model",label:"Na modelu"},{value:"lifestyle",label:"Lifestyle"}]},{key:"image_illustrative",label:"Materiał poglądowy",type:"toggle"},cta,{key:"cta_url",label:"Link przycisku",type:"url"},align],
 hero:[eyebrow,heading,desc,image,{key:"image_alt",label:"Opis pierwszego zdjęcia",type:"short"},
   {key:"image_role",label:"Rola pierwszego zdjęcia",type:"select",options:heroRoles,defaultValue:"lifestyle"},
   {key:"image_illustrative",label:"Materiał poglądowy",type:"toggle",defaultValue:false},cta,{key:"cta_url",label:"Link przycisku",type:"url"},
   {key:"secondary_text",label:"Drugi przycisk",type:"short"},{key:"secondary_url",label:"Drugi link",type:"url"},
   {key:"height",label:"Wysokość banera (px)",type:"number",min:400,max:850},
   {key:"overlay",label:"Przyciemnienie zdjęcia (%)",type:"number",min:0,max:95},align,
   {key:"slides_enabled",label:"Dodatkowe slajdy kolekcji",type:"toggle",defaultValue:true,hint:"Wyłącz, aby zachować tylko pierwszy baner."},
   {key:"autoplay",label:"Automatyczna zmiana slajdów",type:"toggle",defaultValue:true,hint:"Zatrzymuje się podczas czytania, obsługi okien sklepu i przy ograniczonym ruchu."},
   {key:"interval_ms",label:"Czas slajdu (ms)",type:"number",min:3000,max:15000,defaultValue:6000,hint:"6000 ms = 6 sekund. Zakres od 3 do 15 sekund."},
   ...slideFields(2),...slideFields(3)],
 categories:[eyebrow,heading,{key:"cta_text",label:"Tekst linku",type:"short"},
   {key:"categories",label:"Kategorie (po przecinku)",type:"short",hint:"Koszulki,Bluzy,Dzieci,Akcesoria"},cols],
 products:[eyebrow,heading,{key:"category",label:"Początkowa kategoria",type:"select",options:catOptions},count,cols,
   {key:"show_filters",label:"Pokaż przełącznik kategorii",type:"toggle"},
   {key:"cta_text",label:"Tekst linku katalogu",type:"short"},
   {key:"product_ids",label:"Wybrane ID produktów (opcjonalnie)",type:"short",hint:"Np. 1,3,6,8. Puste = produkty z katalogu"}],
 personalization:[eyebrow,heading,desc,{key:"button_text",label:"Tekst przycisku",type:"short"},productField],
 retro:[eyebrow,heading,desc,{key:"button_text",label:"Tekst przycisku",type:"short"},productField,image],
 accessories:[eyebrow,heading,desc,count],
 banner:[eyebrow,heading,desc,image,cta,{key:"cta_url",label:"Link",type:"url"},
   {key:"background",label:"Kolor tła",type:"color"},{key:"text_color",label:"Kolor tekstu",type:"color"},align],
 text:[eyebrow,heading,desc,align,{key:"background",label:"Tło",type:"color"},{key:"text_color",label:"Tekst",type:"color"}],
 services:[heading,{key:"first_title",label:"Kafelek 1 · tytuł",type:"short"},{key:"first_text",label:"Kafelek 1 · opis",type:"short"},
   {key:"second_title",label:"Kafelek 2 · tytuł",type:"short"},{key:"second_text",label:"Kafelek 2 · opis",type:"short"},
   {key:"third_title",label:"Kafelek 3 · tytuł",type:"short"},{key:"third_text",label:"Kafelek 3 · opis",type:"short"}]
};
export const DEFAULT_HOME:HomeConfig={version:1,sections:[
{id:"hero-main",type:"hero",enabled:true,settings:{eyebrow:"Klubowa kolekcja",title:"Sklep Zastalu",description:"Koszulki, bluzy i akcesoria dla kibiców.",image:"/assets/photos/fans.webp",cta_text:"Zobacz produkty",cta_url:"/sklep",secondary_text:"",secondary_url:"/sklep/koszulki",height:620,overlay:72,alignment:"left"}},
{id:"shop-categories",type:"categories",enabled:false,settings:{eyebrow:"",title:"Kolekcje",cta_text:"Cały sklep",categories:"Koszulki,Bluzy,Dzieci,Akcesoria",columns:4}},
{id:"merch-grid",type:"products",enabled:true,settings:{eyebrow:"",title:"Produkty",category:"Wszystko",count:8,columns:4,show_filters:true,cta_text:"Wszystkie produkty",product_ids:""}},
{id:"print-studio",type:"personalization",enabled:true,settings:{eyebrow:"",title:"Twoje nazwisko. Twój numer.",description:"Wybierz zawodnika z listy lub wpisz własne nazwisko i numer.",button_text:"Personalizuj ten produkt",product_id:1}},
{id:"retro-feature",type:"retro",enabled:true,settings:{eyebrow:"Zastal Retro",title:"Bluza z retro logo",description:"Retro logo Zastalu na zielonej bluzie.",button_text:"Zobacz kolekcję",product_id:2,image:""}},
{id:"accessories-edit",type:"accessories",enabled:false,settings:{eyebrow:"",title:"Akcesoria",description:"Akcesoria, które możesz zabrać ze sobą nie tylko na mecz.",count:3}},
{id:"shop-services",type:"services",enabled:false,settings:{title:"Informacje o sklepie",first_title:"Dostawa i odbiór",first_text:"Warunki po uruchomieniu sprzedaży",second_title:"Twoje konto",second_text:"Zamówienia i ustawienia w jednym miejscu",third_title:"Dobierz rozmiar",third_text:"Informacje przed zakupem"}}
]};
export const titleLines=(value:string)=>value.split("|").map(s=>s.trim()).filter(Boolean);
export const text=(s:SectionSettings,key:string)=>String(s[key]??"");
export const num=(s:SectionSettings,key:string,fallback=0)=>Number(s[key]??fallback);
export const bool=(s:SectionSettings,key:string)=>s[key]===true;
export const copyConfig=(config:HomeConfig):HomeConfig=>JSON.parse(JSON.stringify(config));
export function makeSection(type:SectionKind):HomeSection{
 const defaults=DEFAULT_HOME.sections.find(s=>s.type===type);
 const custom:Record<string,SectionSettings>={
 campaign:{eyebrow:"Kolekcja",title:"W barwach Zastalu",description:"",image:"",image_alt:"",image_role:"model",image_illustrative:true,product_ids:"",cta_text:"Zobacz kolekcję",cta_url:"/sklep",alignment:"left"},
 banner:{eyebrow:"KOLEKCJA",title:"Nowa kolekcja",description:"",image:"/assets/photos/fans.webp",cta_text:"Zobacz więcej",cta_url:"/sklep",background:"#143e2d",text_color:"#ffffff",alignment:"left"},
 text:{eyebrow:"Zastal Zielona Góra",title:"Historia naszego klubu",description:"",alignment:"left",background:"#f4f5f1",text_color:"#173c2b"}
 };
 return {id:"section-"+crypto.randomUUID().slice(0,8),type,enabled:type!=="campaign",settings:{...(defaults?.settings??custom[type]??{})}};
}

/** Small label above a heading: drops legacy "01 / " numbering and shouted caps so saved CMS values stay readable. */
export function kicker(value:string):string{const t=(value||"").replace(/^\d+\s*[\/|·\-]+\s*/,"").trim();if(!t)return "";const letters=t.replace(/[^\p{L}]/gu,"");if(letters.length>3&&letters===letters.toUpperCase()){const low=t.toLowerCase();return low.charAt(0).toUpperCase()+low.slice(1);}return t;}
