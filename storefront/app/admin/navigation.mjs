export const ADMIN_ROUTES=Object.freeze({
 dashboard:'',orders:'zamowienia',pos:'kasa',fulfillment:'realizacja',returns:'zwroty',
 products:'produkty',inventory:'magazyn',inventory_import:'import-magazynu',transfers:'zakupy-transferow',
 production:'nadruki',labels:'etykiety',players:'zawodnicy',homepage:'strona-glowna',pages:'strony',
 marketing:'promocje',customers:'klienci',giftcards:'karty-podarunkowe',reports:'raporty',email:'poczta',
 settings:'sprzedaz-i-dostawy',launch:'uruchomienie',staff:'pracownicy',account:'moje-konto',audit:'historia'
});
export function adminPath(view){return '/admin'+(ADMIN_ROUTES[view]?'/'+ADMIN_ROUTES[view]:'');}
export function adminView(path){return Object.keys(ADMIN_ROUTES).find(key=>adminPath(key)===path)||'';}
export function orderInScope(order,scope){
 const closed=['anulowane','wyslane_demo','wydane','wyslane','zwrot'].includes(order.status);
 const payment=order.status==='oczekuje_platnosci';
 return scope==='all'||(scope==='closed'?closed:scope==='payment'?!closed&&payment:!closed&&!payment);
}
