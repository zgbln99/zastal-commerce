export type CatalogItem = {
  id: number; name: string; sku: string; price: number; stock: number; category: string;
  image: string; tag?: string; subtitle: string; color?: string; sizes?: string[];
};
export const catalog: CatalogItem[] = [
  {id:1,name:"Bluza Zastal Logo",sku:"ZS-HD-001",price:9900,stock:38,category:"Bluzy",subtitle:"Klasyczna bluza z kapturem • zieleń",tag:"BESTSELLER",image:"https://zastal.store/wp-content/uploads/2026/04/bluza-LOGO-2.png",sizes:["S","M","L","XL","XXL"]},
  {id:2,name:"Bluza Zastal Retro",sku:"ZS-HD-002",price:9900,stock:19,category:"Bluzy",subtitle:"Kultowe logo i klubowa tradycja",tag:"HERITAGE",image:"https://zastal.store/wp-content/uploads/2026/04/bluza-retro-1.png",sizes:["S","M","L","XL","XXL"]},
  {id:3,name:"Koszulka Wicemistrz Polski",sku:"ZS-TS-003",price:6500,stock:24,category:"Koszulki",subtitle:"Kolekcja sezonowa • męska",tag:"LIMITOWANA",image:"https://zastal.store/wp-content/uploads/2026/06/5012d617-f03b-4e73-ad54-a0d6019f8eb6.jpeg",sizes:["S","M","L","XL","XXL"]},
  {id:4,name:"Koszulka The Final — ciemna",sku:"ZS-TS-004",price:6000,stock:27,category:"Koszulki",subtitle:"Sezon 2025/26 • ciemna zieleń",image:"https://zastal.store/wp-content/uploads/2026/06/koszulka-final-ciemna.png",sizes:["S","M","L","XL","XXL"]},
  {id:5,name:"Koszulka The Final — jasna",sku:"ZS-TS-005",price:6000,stock:17,category:"Koszulki",subtitle:"Sezon 2025/26 • jasna zieleń",image:"https://zastal.store/wp-content/uploads/2026/06/KOSZULKA-final-jasna.png",sizes:["S","M","L","XL","XXL"]},
  {id:6,name:"Koszulka Zastal Sulima",sku:"ZS-TS-006",price:6000,stock:35,category:"Koszulki",subtitle:"Kolekcja zawodnicza",image:"https://zastal.store/wp-content/uploads/2026/06/sulima-tee-2.png",sizes:["S","M","L","XL","XXL"]},
  {id:7,name:"Zastal Express — koszulka",sku:"ZS-TS-007",price:5500,stock:25,category:"Koszulki",subtitle:"Linia kibicowska • jasna zieleń",tag:"FAN FAVORITE",image:"https://zastal.store/wp-content/uploads/2026/02/zielona-dziecieca-winogrona-rozowe-1.png",sizes:["S","M","L","XL","XXL"]},
  {id:8,name:"Worek sportowy Zastal",sku:"ZS-AC-008",price:5000,stock:42,category:"Akcesoria",subtitle:"Sezon 2025/26",image:"https://zastal.store/wp-content/uploads/2026/04/20260430_121010-removebg-preview-1.png"},
  {id:9,name:"Koszulka dziecięca Wicemistrz",sku:"ZS-KD-009",price:5500,stock:20,category:"Dzieci",subtitle:"Kolekcja dziecięca",image:"https://zastal.store/wp-content/uploads/2026/05/KOSZULKA-wice-dziec-jasna.png",sizes:["116","128","140","152","164"]},
  {id:10,name:"Koszulka Zastal Trio",sku:"ZS-TS-010",price:6000,stock:24,category:"Koszulki",subtitle:"Kolekcja zawodnicza",image:"https://zastal.store/wp-content/uploads/2026/06/trio-tee.png",sizes:["S","M","L","XL","XXL"]},
  {id:11,name:"Brelok Dziczek 3D",sku:"ZS-AC-011",price:3000,stock:60,category:"Akcesoria",subtitle:"Kibicowski drobiazg",image:"https://zastal.store/wp-content/uploads/2026/07/ae464cc7-76b9-4827-9350-f6a1f827c7c1.jpeg"},
  {id:12,name:"Magnes Zastal Dziczek",sku:"ZS-AC-012",price:2500,stock:45,category:"Akcesoria",subtitle:"Kolekcja gadżetów",image:"https://zastal.store/wp-content/uploads/2026/07/89528fc9-8fb1-4ae4-9134-98a05d412fdb.jpeg"},
];
export const fmt=(n:number)=>new Intl.NumberFormat("pl-PL",{style:"currency",currency:"PLN"}).format(n/100);
export const fanPhoto = "https://cdn.sportigio.com/spaces/476/img/news/0db1d9bb09d6f6361ccaf15f2ef06691.webp";
export const gamePhoto = "https://plk.pl/_next/image?q=75&url=https%3A%2F%2Fplk.pl%2Finternalfiles%2Fimage%2Fgaleria%2F3582%2F127466.jpg&w=3840";
