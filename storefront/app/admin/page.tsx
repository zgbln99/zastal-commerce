"use client";

import Link from "next/link";
import {usePathname,useRouter,useSearchParams} from "next/navigation";
import {adminPath,adminView,orderInScope} from "./navigation.mjs";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {Activity, AlertCircle, ArrowLeft, ArrowRight, ClipboardCheck, Clock3, LayoutDashboard, LogIn, LogOut, Menu, Search, ChevronDown, Package, RefreshCw, ShoppingBag, Tag, Warehouse, Users, Shirt, Settings, X} from "lucide-react";
import Operations, {AdminApiError, emptyOperationsData, formatDate, formatMoney, isClosedOrder, loadOperationsData, orderNumber, StatusBadge, type OperationsData, type OperationsTab} from "./Operations";
import "./admin.css";
import "./brand-admin.css";
import "./workspace-v2.css";
import "./workspace-v3.css";
import "./workspace-v4.css";
import {useAuth,isStaff} from "../../components/AuthProvider";
import {useStore} from "../../components/StoreProvider";
import AuthForm from "../../components/AuthForm";
import AccountSecurity from "../../components/AccountSecurity";
import Products from "./Products";
import Customers from "./Customers";
import Players from "./Players";
import LaunchCenter from "./LaunchCenter";
import InventoryImport from "./InventoryImport";
import HomeEditor from "./HomeEditor";
import POS from "./POS";
import Fulfillment from "./Fulfillment";
import EmailCenter from "./EmailCenter";
import Staff from "./Staff";
import SalesSettings from "./SalesSettings";
import Returns from "./Returns";
import Pages from "./Pages";
import Marketing from "./Marketing";
import GiftCards from "./GiftCards";
import Reports from "./Reports";
import DailyDigest from "./DailyDigest";

const views:{id:OperationsTab; label:string; title:string; description:string; icon:ReactNode; cap?:string}[] = [
  {id:"homepage",cap:"cms",label:"Edytor strony",title:"Edytor strony głównej",description:"Sekcje, multimedia, widok telefonu, wersje robocze i publikacja.",icon:<LayoutDashboard size={19}/>},
  {id:"pages",cap:"pages",label:"Strony informacyjne",title:"Strony informacyjne",description:"Regulamin, polityka prywatności, zwroty, dostawa i kontakt — szkic i publikacja.",icon:<LayoutDashboard size={19}/>},
  {id:"dashboard", label:"Przegląd", title:"Przegląd sklepu", description:"Zamówienia i zadania wymagające uwagi.", icon:<LayoutDashboard size={19}/>},
  {id:"pos",cap:"pos",label:"Kasa POS",title:"Kasa sklepu",description:"Sprzedaż przy kasie, płatności i rozliczenie zmiany.",icon:<ShoppingBag size={19}/>},
  {id:"fulfillment",cap:"fulfillment",label:"Realizacja",title:"Realizacja zamówień",description:"Zapisana kompletacja, nadruki, kontrola i wydanie.",icon:<ClipboardCheck size={19}/>},
  {id:"email",cap:"email",label:"Poczta sklepu",title:"Poczta sklepu",description:"Konfiguracja SMTP i status wiadomości.",icon:<Activity size={19}/>},
  {id:"products",cap:"products",label:"Produkty",title:"Produkty",description:"Katalog, warianty i ustawienia nadruku.",icon:<Shirt size={19}/>},
  {id:"players",cap:"players",label:"Zawodnicy",title:"Zawodnicy",description:"Lista nazwisk i numerów do personalizacji koszulek.",icon:<Users size={19}/>},
  {id:"customers",cap:"customers",label:"Klienci",title:"Klienci",description:"Konta klientów i ich historia zamówień.",icon:<Users size={19}/>},
  {id:"orders", cap:"orders", label:"Zamówienia", title:"Zamówienia", description:"Szczegóły, kompletacja i historia realizacji.", icon:<ShoppingBag size={19}/>},
  {id:"returns",cap:"returns",label:"Zwroty i reklamacje",title:"Zwroty i reklamacje",description:"Zgłoszenia klientów, decyzje, zwroty środków i przyjęcia na stan.",icon:<ShoppingBag size={19}/>},
  {id:"inventory", cap:"inventory", label:"Magazyn", title:"Magazyn wariantów", description:"Dostępność każdego rozmiaru i korekty z uzasadnieniem.", icon:<Warehouse size={19}/>},
  {id:"transfers", cap:"transfers", label:"Zakupy DTF", title:"Zakupy transferów DTF", description:"Gotowe transfery od dostawców i przyjęcia dostaw.", icon:<Package size={19}/>},
  {id:"production", cap:"production", label:"Nanoszenie DTF", title:"Nanoszenie i kontrola", description:"Przydzielanie transferów do zamówień oraz etapy pracy.", icon:<ClipboardCheck size={19}/>},
  {id:"labels", cap:"labels", label:"Etykiety", title:"Etykiety EAN i QR", description:"Weryfikacja kodów i wydruk dla konkretnych wariantów.", icon:<Tag size={19}/>},
  {id:"inventory_import",cap:"inventory",label:"Import magazynu",title:"Import stanów magazynowych",description:"Hurtowa aktualizacja stanów SKU z arkusza CSV.",icon:<Warehouse size={19}/>},
  {id:"marketing",cap:"settings",label:"Promocje i kody",title:"Promocje, kody i powiadomienia",description:"Kody rabatowe z limitami i ważnością oraz klienci czekający na brakujący rozmiar.",icon:<Tag size={19}/>},
  {id:"reports",cap:"settings",label:"Raporty",title:"Raporty sprzedaży",description:"Sprzedaż dziennie, kanały, płatności, produkty i pliki CSV dla księgowości.",icon:<Activity size={19}/>},
  {id:"giftcards",cap:"settings",label:"Karty podarunkowe",title:"Karty podarunkowe",description:"Wydawanie kart sprzedanych przy kasie, salda, historia użyć i blokowanie.",icon:<Tag size={19}/>},
  {id:"settings",cap:"settings",label:"Sprzedaż i dostawy",title:"Sprzedaż, płatności i dostawy",description:"Tryb sprzedaży, PayU, przelew, odbiór osobisty i metody dostawy.",icon:<Settings size={19}/>},
  {id:"launch",cap:"launch",label:"Uruchomienie sklepu",title:"Uruchomienie sprzedaży",description:"Konfiguracja podmiotu, lista warunków i gotowość operacyjna.",icon:<Settings size={19}/>},
  {id:"staff",cap:"staff",label:"Pracownicy",title:"Konta pracowników",description:"Loginy, role i uprawnienia personelu sklepu.",icon:<Users size={19}/>},
  {id:"account",label:"Ustawienia konta",title:"Ustawienia konta",description:"Hasło, klucz odzyskiwania i sesje administratora.",icon:<Settings size={19}/>},
  {id:"audit", cap:"audit", label:"Historia", title:"Historia operacji", description:"Zapisane działania i ruchy magazynowe.", icon:<Activity size={19}/>},
];

const navGroups:{label:string;ids:OperationsTab[]}[] = [
 {label:"Codzienna praca",ids:["dashboard","orders","fulfillment","pos","inventory","products"]},
 {label:"Produkty i zaplecze",ids:["production","transfers","labels","inventory_import","players"]},
 {label:"Klienci i promocje",ids:["customers","returns","marketing","giftcards","reports"]},
 {label:"Strona i komunikacja",ids:["homepage","pages","email"]},
 {label:"Ustawienia",ids:["settings","launch","staff","audit","account"]},
];

export default function Admin() {
  const auth=useAuth();
  const storeSales=useStore().sales;
  const pathname=usePathname() || "/admin";
  const router=useRouter();const searchParams=useSearchParams();
  const requestedView=(adminView(pathname)||"dashboard") as OperationsTab;
  const [navSearch,setNavSearch]=useState("");
  const [data, setData] = useState<OperationsData>(emptyOperationsData);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [requestedOrderId, setRequestedOrderId] = useState<number | null>(null);
  const requestId = useRef(0);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const capabilities = auth.user?.capabilities || [];
  const allowedViews = views.filter(view => !view.cap || capabilities.includes(view.cap));
  const activeTab=allowedViews.some(view=>view.id===requestedView)?requestedView:"dashboard";
  const currentView = allowedViews.find(view => view.id === activeTab) || allowedViews[0] || views[0];
  const clearData=()=>{requestId.current++;setData(emptyOperationsData);setUpdatedAt("");setSidebarOpen(false);setRequestedOrderId(null);setLoading(false);};
  const logout=async()=>{try{await auth.logout();clearData();}catch(e){setMessage(e instanceof Error?e.message:"Nie udało się wylogować.");}};
  const refresh=async():Promise<boolean>=>{const id=++requestId.current;setLoading(true);setMessage("");try{const snapshot=await loadOperationsData(auth.request,auth.user?.capabilities||[]);if(id!==requestId.current)return false;setData(snapshot);setUpdatedAt(new Date().toISOString());return true;}catch(e){if(id===requestId.current)setMessage(e instanceof Error?e.message:"Nie można pobrać danych.");return false;}finally{if(id===requestId.current)setLoading(false);}};
  useEffect(()=>{clearData();if(isStaff(auth.user))void refresh();return()=>{requestId.current++;};},[auth.user?.id]);
  const selectView = (id:OperationsTab) => {if (!allowedViews.some(view => view.id === id)) return; router.push(adminPath(id)); setSidebarOpen(false);setNavSearch("");};
  const openOrder = (id:number) => {router.push(adminPath("orders")+"?zamowienie="+id);setSidebarOpen(false);};
  useEffect(()=>{
    const value=searchParams?.get("zamowienie")||"";
    if(activeTab==="orders"&&/^[1-9][0-9]*$/.test(value))setRequestedOrderId(Number(value));
  },[activeTab,searchParams]);
  useEffect(() => {
    if (!sidebarOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    navigation.current?.querySelector<HTMLInputElement>("input")?.focus();
    const onKey = (event:KeyboardEvent) => {
      if (event.key === "Escape") {setSidebarOpen(false); menuButton.current?.focus();}
      if (event.key !== "Tab" || !navigation.current) return;
      const controls = Array.from(navigation.current.querySelectorAll<HTMLElement>("button, a[href], input, summary")).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
    };
    document.addEventListener("keydown", onKey);
    return () => {document.body.style.overflow = overflow; document.removeEventListener("keydown", onKey);};
  }, [sidebarOpen]);

  if(auth.loading)return <main className="admin-account-loading">Wczytywanie panelu…</main>;
  if(auth.error)return <main className="admin-account-loading"><p>{auth.error}</p><button className="button button-dark" onClick={()=>void auth.refresh().catch(()=>{})}>Spróbuj ponownie</button></main>;
  if(!auth.user)return <main className="admin-login"><section className="admin-login-panel"><a href="/" className="admin-return"><ArrowLeft size={17}/>Wróć do sklepu</a><div className="admin-login-brand"><img src="/assets/zastal-logo.svg" alt="Zastal"/><span>Panel administratora</span></div><AuthForm admin onSuccess={()=>{}}/></section></main>;
  if(!isStaff(auth.user))return <main className="admin-access-denied"><h1>Konto klienta</h1><p>Panel sklepu jest dostępny dla administratora. Swoje zamówienia znajdziesz na koncie klienta.</p><a className="button button-dark" href="/konto">Przejdź do mojego konta</a><button className="inline-link" onClick={()=>void logout()}>Wyloguj się</button></main>;

  const live = storeSales.checkoutEnabled;
  const counted = live ? data.orders.filter(order => order.mode === "live") : data.orders;
  const activeOrders = counted.filter(order => !isClosedOrder(order.status));
  const awaitingPayment = counted.filter(order => order.status === "oczekuje_platnosci");
  const today = new Date().toISOString().slice(0, 10);
  const paidOrders = counted.filter(order => order.status !== "anulowane" && order.status !== "zwrot" && (!live || order.payment_status === "paid" || order.payment_status === "partially_refunded"));
  const orderValue = paidOrders.reduce((sum, order) => sum + order.total, 0);
  const todayValue = paidOrders.filter(order => order.created.slice(0, 10) === today).reduce((sum, order) => sum + order.total, 0);
  const lowStock = data.inventory.filter(variant => variant.stock <= 2).sort((first, second) => first.stock - second.stock || first.id - second.id);


  const queue=activeOrders.filter(order=>orderInScope(order,"active")).sort((a,b)=>b.created.localeCompare(a.created)||b.id-a.id);
  const navItems=allowedViews.filter(view=>(view.label+" "+view.title).toLocaleLowerCase("pl").includes(navSearch.toLocaleLowerCase("pl")));
  const renderNavItem=(view:(typeof views)[number])=><Link key={view.id} href={adminPath(view.id)} className={"admin-navitem"+(activeTab===view.id?" active":"")} aria-current={activeTab===view.id?"page":undefined} onClick={()=>{setSidebarOpen(false);setNavSearch("");}}>{view.icon}<span>{view.label}</span>{view.id==="orders"&&activeOrders.length>0&&<b>{activeOrders.length}</b>}</Link>;
  return <div className="admin-shell">
    {sidebarOpen && <button className="admin-mobile-backdrop" aria-label="Zamknij nawigację" tabIndex={-1} onClick={() => {setSidebarOpen(false); menuButton.current?.focus();}}/>}
    <aside ref={navigation} className={"admin-sidebar" + (sidebarOpen ? " is-open" : "")} id="admin-navigation" aria-label="Nawigacja panelu"><div className="admin-brand"><img src="/assets/zastal-logo.svg" alt="Zastal"/><div><strong>Zastal</strong><span>Panel sklepu</span></div><button className="admin-sidebar-close" aria-label="Zamknij nawigację" onClick={() => {setSidebarOpen(false); menuButton.current?.focus();}}><X size={20}/></button></div><div className="admin-nav-search"><Search size={16}/><input aria-label="Znajdź funkcję w panelu" placeholder="Znajdź funkcję…" value={navSearch} onChange={e=>setNavSearch(e.target.value)}/>{navSearch&&<button onClick={()=>setNavSearch("")} aria-label="Wyczyść wyszukiwanie"><X size={14}/></button>}</div><nav>{navSearch?<div className="admin-nav-results">{navItems.map(renderNavItem)}{!navItems.length&&<p>Brak pasujących funkcji.</p>}</div>:navGroups.map((group,index)=>{const items=group.ids.map(id=>allowedViews.find(view=>view.id===id)).filter((view):view is (typeof views)[number]=>Boolean(view));if(!items.length)return null;return index===0?<div className="admin-nav-group" key={group.label}>{items.map(renderNavItem)}</div>:<details className="admin-nav-section" key={group.label+activeTab} open={group.ids.includes(activeTab)}><summary>{group.label}<ChevronDown size={15}/></summary><div>{items.map(renderNavItem)}</div></details>;})}</nav><div className="admin-side-bottom"><div className="admin-signed-in"><span>{auth.user.name.slice(0,1)}</span><div><strong>{auth.user.name}</strong><small>{auth.user.identifier}</small></div></div><a href="/"><ArrowLeft size={17}/>Przejdź do sklepu</a><button onClick={() => void logout()}><LogOut size={17}/>Wyloguj</button></div></aside>
    <main className="admin-main"><header className="admin-topbar"><div className="admin-topbar-left"><button ref={menuButton} className="admin-mobile-menu" aria-label="Otwórz nawigację" aria-expanded={sidebarOpen} aria-controls="admin-navigation" onClick={() => setSidebarOpen(true)}><Menu size={22}/></button><span className="admin-breadcrumb"><Link href="/admin">Panel sklepu</Link><span>/</span><strong>{currentView.label}</strong></span></div><div className="admin-topbar-right"><span>{updatedAt ? "Dane z " + formatDate(updatedAt) : ""}</span><button className="admin-refresh" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? "admin-spinning" : ""}/><span>{loading ? "Odświeżanie…" : "Odśwież"}</span></button></div></header><div className="admin-page">{!storeSales.checkoutEnabled&&["dashboard","settings","launch"].includes(activeTab)&&<div className="admin-demo-notice"><AlertCircle size={17}/><p>Sprzedaż online jest wyłączona.</p>{capabilities.includes("launch")&&<Link href={adminPath("launch")}>Sprawdź konfigurację <ArrowRight size={15}/></Link>}</div>}<div className="admin-page-heading"><div><h1>{currentView.title}</h1><p>{currentView.description}</p></div></div>{message && <div className="admin-alert" role="alert"><AlertCircle size={18}/><span>{message} Wyświetlone dane mogą być nieaktualne.</span><button aria-label="Zamknij komunikat" onClick={() => setMessage("")}><X size={17}/></button></div>}
      {activeTab==="dashboard"&&<div className="admin-dashboard" aria-busy={loading}>
       <div className="admin-quick-actions">{allowedViews.filter(v=>["orders","pos","products","fulfillment"].includes(v.id)).map(view=><Link key={view.id} href={adminPath(view.id)}>{view.icon}<span>{view.id==="pos"?"Otwórz kasę":view.id==="products"?"Zarządzaj produktami":view.label}</span><ArrowRight size={16}/></Link>)}</div>
       <div className="admin-overview-stats">
        {capabilities.includes("orders")&&<><Link href={adminPath("orders")}><span>Do realizacji</span><strong>{queue.length}</strong><small>W pobranych zamówieniach</small></Link><Link href={adminPath("orders")+"?lista=payment"}><span>Czekają na płatność</span><strong>{awaitingPayment.length}</strong><small>Do sprawdzenia</small></Link></>}
        {capabilities.includes("inventory")&&<Link href={adminPath("inventory")}><span>Niskie stany</span><strong>{lowStock.length}</strong><small>Warianty z 0–2 szt.</small></Link>}
        <div><span>{live?"Opłacona sprzedaż dziś":"Wartość zamówień testowych"}</span><strong>{formatMoney(live?todayValue:orderValue)}</strong><small>{live?"Na podstawie ostatnich 300 zamówień":"Bez anulowanych zamówień"}</small></div>
       </div>
       <div className="admin-dashboard-grid">
        {capabilities.includes("orders")&&<section className="admin-panel"><div className="admin-panel-head"><div><h2>Do obsłużenia</h2><p>Najnowsze niezamknięte zamówienia bez oczekujących na płatność</p></div><Link className="admin-text-link" href={adminPath("orders")}>Wszystkie <ArrowRight size={15}/></Link></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Zamówienie</th><th>Klient</th><th>Kwota</th><th>Status</th><th></th></tr></thead><tbody>{queue.slice(0,8).map(order=><tr key={order.id}><td><button className="admin-order-link" onClick={()=>openOrder(order.id)}>{orderNumber(order.id)}</button><small>{formatDate(order.created)}</small></td><td>{order.customer_name||order.customer?.name||"Gość"}</td><td className="admin-nowrap">{formatMoney(order.total)}</td><td><StatusBadge status={order.status}/></td><td><button className="admin-row-action" aria-label={"Otwórz "+orderNumber(order.id)} onClick={()=>openOrder(order.id)}><ArrowRight size={17}/></button></td></tr>)}</tbody></table></div>{!queue.length&&<p className="admin-empty">Nie ma zamówień do realizacji.</p>}</section>}
        {capabilities.includes("inventory")&&<section className="admin-panel"><div className="admin-panel-head"><div><h2>Do uzupełnienia</h2><p>Warianty z najniższym stanem</p></div><Link className="admin-text-link" href={adminPath("inventory")}>Magazyn <ArrowRight size={15}/></Link></div><div className="admin-low-stock">{lowStock.slice(0,8).map(v=><div key={v.id}><div><strong>{v.name} <span>/ {v.size}</span></strong><small>{v.sku}</small></div><b className={v.stock===0?"admin-no-stock":""}>{v.stock} szt.</b></div>)}{!lowStock.length&&<p className="admin-empty">Wszystkie warianty mają zapas powyżej 2 szt.</p>}</div></section>}
       </div>
       {capabilities.includes("audit")&&<details className="admin-panel admin-secondary-panel"><summary>Ostatnie działania <ChevronDown size={16}/></summary><div className="admin-recent-activity">{data.activity.slice(0,5).map(event=><div key={event.id}><span/><div><p>{event.note}</p><small>{formatDate(event.created)}</small></div></div>)}{!data.activity.length&&<p className="admin-empty">Brak zapisanych działań.</p>}</div></details>}
       {capabilities.includes("orders")&&<details className="admin-panel admin-secondary-panel"><summary>Podsumowanie dnia <ChevronDown size={16}/></summary><DailyDigest onOpenOrder={openOrder} canSend={capabilities.includes("settings")}/></details>}
      </div>}
      {activeTab==="homepage"&&<HomeEditor/>}
      {activeTab==="pos"&&<POS key={auth.user.id} onSaved={refresh}/>}
      {activeTab==="fulfillment"&&<Fulfillment key={auth.user.id} onSaved={refresh}/>}
      {activeTab==="email"&&<EmailCenter key={auth.user.id}/>}
      {activeTab==="staff"&&<Staff/>}
      {activeTab==="settings"&&<SalesSettings/>}
      {activeTab==="marketing"&&<Marketing/>}
      {activeTab==="giftcards"&&<GiftCards/>}
      {activeTab==="reports"&&<Reports/>}
      {activeTab==="returns"&&<Returns onOpenOrder={openOrder}/>}
      {activeTab==="pages"&&<Pages/>}
      {activeTab==="products"&&<Products inventory={data.inventory} onRefresh={refresh}/>}
      {activeTab==="players"&&<Players/>}
      {activeTab==="customers"&&<Customers onOpenOrder={openOrder}/>}
      {activeTab==="account"&&<AccountSecurity/>}
      {activeTab==="launch"&&<LaunchCenter/>}
      {activeTab==="inventory_import"&&<InventoryImport inventory={data.inventory} onRefresh={refresh}/>}
      <Operations request={auth.request} activeTab={activeTab} data={data} loading={loading} onRefresh={() => refresh()} onAuthError={()=>void auth.refresh().catch(()=>{})} requestedOrderId={requestedOrderId} onOrderOpened={() => setRequestedOrderId(null)}/>
    </div></main>
  </div>;
}
