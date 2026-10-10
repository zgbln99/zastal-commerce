export type CatalogItem = {
  id: number; name: string; sku: string; price: number; stock: number; category: string;
  image: string; tag?: string; subtitle: string; color?: string; sizes?: string[];
};
export const catalog: CatalogItem[] = [
  {id:1,name:"Bluza Zastal Logo",sku:"ZS-HD-001",price:9900,stock:38,category:"Bluzy",subtitle:"Klasyczna bluza z kapturem • zieleń",image:"/assets/photos/product-1.webp",sizes:["S","M","L","XL","XXL"]},
  {id:2,name:"Bluza Zastal Retro",sku:"ZS-HD-002",price:9900,stock:19,category:"Bluzy",subtitle:"Bluza z logo retro",image:"/assets/photos/product-2.webp",sizes:["S","M","L","XL","XXL"]},
  {id:3,name:"Koszulka Wicemistrz Polski",sku:"ZS-TS-003",price:6500,stock:24,category:"Koszulki",subtitle:"Kolekcja sezonowa • męska",image:"/assets/photos/product-3.webp",sizes:["S","M","L","XL","XXL"]},
  {id:4,name:"Koszulka The Final — ciemna",sku:"ZS-TS-004",price:6000,stock:27,category:"Koszulki",subtitle:"Sezon 2025/26 • ciemna zieleń",image:"/assets/photos/product-4.webp",sizes:["S","M","L","XL","XXL"]},
  {id:5,name:"Koszulka The Final — jasna",sku:"ZS-TS-005",price:6000,stock:17,category:"Koszulki",subtitle:"Sezon 2025/26 • jasna zieleń",image:"/assets/photos/product-5.webp",sizes:["S","M","L","XL","XXL"]},
  {id:6,name:"Koszulka Zastal Sulima",sku:"ZS-TS-006",price:6000,stock:35,category:"Koszulki",subtitle:"Kolekcja zawodnicza",image:"/assets/photos/product-6.webp",sizes:["S","M","L","XL","XXL"]},
  {id:7,name:"Zastal Express — koszulka",sku:"ZS-TS-007",price:5500,stock:25,category:"Koszulki",subtitle:"Linia kibicowska • jasna zieleń",image:"/assets/photos/product-7.webp",sizes:["S","M","L","XL","XXL"]},
  {id:8,name:"Worek sportowy Zastal",sku:"ZS-AC-008",price:5000,stock:42,category:"Akcesoria",subtitle:"Sezon 2025/26",image:"/assets/photos/product-8.webp"},
  {id:9,name:"Koszulka dziecięca Wicemistrz",sku:"ZS-KD-009",price:5500,stock:20,category:"Dzieci",subtitle:"Kolekcja dziecięca",image:"/assets/photos/product-9.webp",sizes:["116","128","140","152","164"]},
  {id:10,name:"Koszulka Zastal Trio",sku:"ZS-TS-010",price:6000,stock:24,category:"Koszulki",subtitle:"Kolekcja zawodnicza",image:"/assets/photos/product-10.webp",sizes:["S","M","L","XL","XXL"]},
  {id:11,name:"Brelok Dziczek 3D",sku:"ZS-AC-011",price:3000,stock:60,category:"Akcesoria",subtitle:"Brelok klubowy",image:"/assets/photos/product-11.webp"},
  {id:12,name:"Magnes Zastal Dziczek",sku:"ZS-AC-012",price:2500,stock:45,category:"Akcesoria",subtitle:"Kolekcja gadżetów",image:"/assets/photos/product-12.webp"},
];
export const fmt=(n:number)=>new Intl.NumberFormat("pl-PL",{style:"currency",currency:"PLN"}).format(n/100);
export const fanPhoto = "/assets/photos/fans.webp";
