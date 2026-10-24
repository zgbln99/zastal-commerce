"use client";

import {useEffect, useRef, useState, type ReactNode} from "react";
import {Activity, AlertCircle, ArrowLeft, ArrowRight, ClipboardCheck, LayoutDashboard, LogIn, LogOut, Menu, Package, RefreshCw, ShoppingBag, Tag, Warehouse, Users, Shirt, Settings, X} from "lucide-react";
import Operations, {AdminApiError, emptyOperationsData, formatDate, formatMoney, isClosedOrder, isClosedTask, loadOperationsData, orderNumber, StatusBadge, type OperationsData, type OperationsTab} from "./Operations";
import "./admin.css";
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

const views:{id:OperationsTab; label:string; title:string; description:string; icon:ReactNode; cap?:string}[] = [
  {id:"homepage",cap:"cms",label:"Edytor strony",title:"Edytor strony głównej",description:"Sekcje, multimedia, widok telefonu, wersje robocze i publikacja.",icon:<LayoutDashboard size={19}/>},
  {id:"pages",cap:"pages",label:"Strony informacyjne",title:"Strony informacyjne",description:"Regulamin, polityka prywatności, zwroty, dostawa i kontakt — szkic i publikacja.",icon:<LayoutDashboard size={19}/>},
  {id:"dashboard", label:"Przegląd", title:"Przegląd sklepu", description:"Zamówienia i zadania wymagające uwagi.", icon:<LayoutDashboard size={19}/>},
  {id:"pos",cap:"pos",label:"Kasa POS",title:"Kasa sklepu",description:"Koszyk, warianty, nadruki i zapis sprzedaży testowej.",icon:<ShoppingBag size={19}/>},
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
  {id:"settings",cap:"settings",label:"Sprzedaż i dostawy",title:"Sprzedaż, płatności i dostawy",description:"Tryb sprzedaży, PayU, przelew, odbiór osobisty i metody dostawy.",icon:<Settings size={19}/>},
  {id:"launch",cap:"launch",label:"Uruchomienie sklepu",title:"Uruchomienie sprzedaży",description:"Konfiguracja podmiotu, lista warunków i gotowość operacyjna.",icon:<Settings size={19}/>},
  {id:"staff",cap:"staff",label:"Pracownicy",title:"Konta pracowników",description:"Loginy, role i uprawnienia personelu sklepu.",icon:<Users size={19}/>},
  {id:"account",label:"Ustawienia konta",title:"Ustawienia konta",description:"Hasło, klucz odzyskiwania i sesje administratora.",icon:<Settings size={19}/>},
  {id:"audit", cap:"audit", label:"Historia", title:"Historia operacji", description:"Zapisane działania i ruchy magazynowe.", icon:<Activity size={19}/>},
];

export default function Admin() {
  const auth=useAuth();
  const storeSales=useStore().sales;
  const [activeTab, setActiveTab] = useState<OperationsTab>("dashboard");
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
  const currentView = allowedViews.find(view => view.id === activeTab) || allowedViews[0] || views[0];
  const clearData=()=>{requestId.current++;setData(emptyOperationsData);setUpdatedAt("");setSidebarOpen(false);setRequestedOrderId(null);setActiveTab("dashboard");setLoading(false);};
  const logout=async()=>{try{await auth.logout();clearData();}catch(e){setMessage(e instanceof Error?e.message:"Nie udało się wylogować.");}};
  const refresh=async():Promise<boolean>=>{const id=++requestId.current;setLoading(true);setMessage("");try{const snapshot=await loadOperationsData(auth.request,auth.user?.capabilities||[]);if(id!==requestId.current)return false;setData(snapshot);setUpdatedAt(new Date().toISOString());return true;}catch(e){if(id===requestId.current)setMessage(e instanceof Error?e.message:"Nie można pobrać danych.");return false;}finally{if(id===requestId.current)setLoading(false);}};
  useEffect(()=>{clearData();if(isStaff(auth.user))void refresh();return()=>{requestId.current++;};},[auth.user?.id]);
  const selectView = (id:OperationsTab) => {if (!allowedViews.some(view => view.id === id)) return; setActiveTab(id); setSidebarOpen(false);};
  const openOrder = (id:number) => {selectView("orders"); setRequestedOrderId(id);};
  useEffect(() => {
    if (!sidebarOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    navigation.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event:KeyboardEvent) => {
      if (event.key === "Escape") {setSidebarOpen(false); menuButton.current?.focus();}
      if (event.key !== "Tab" || !navigation.current) return;
      const controls = Array.from(navigation.current.querySelectorAll<HTMLElement>("button, a[href]")).filter(element => element.getClientRects().length > 0);
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

  const activeOrders = data.orders.filter(order => !isClosedOrder(order.status));
  const orderValue = data.orders.filter(order => order.status !== "anulowane").reduce((sum, order) => sum + order.total, 0);
  const lowStock = data.inventory.filter(variant => variant.stock <= 2).sort((first, second) => first.stock - second.stock || first.id - second.id);
  const activeTasks = data.tasks.filter(task => !isClosedTask(task.status));
  const availableTransfers = data.batches.reduce((sum, batch) => sum + batch.available, 0);
  const awaitingTransfers = data.batches.reduce((sum, batch) => sum + Math.max(0, batch.ordered - batch.received), 0);
  const metrics = [
    {label:"Zamówienia w toku", value:String(activeOrders.length), note:"Z ostatnich 300 zapisanych zamówień", icon:<ShoppingBag size={20}/>, tab:"orders" as OperationsTab},
    {label:storeSales.checkoutEnabled?"Wartość zamówień":"Wartość zamówień testowych", value:formatMoney(orderValue), note:"Ostatnie 300 zamówień, bez anulowanych", icon:<LayoutDashboard size={20}/>, tab:"orders" as OperationsTab},
    {label:"Niskie stany wariantów", value:String(lowStock.length), note:"Dostępność 0–2 szt. w rozmiarze", icon:<Warehouse size={20}/>, tab:"inventory" as OperationsTab},
    {label:"Nanoszenie w toku", value:String(activeTasks.length), note:"Aktywne zlecenia DTF", icon:<ClipboardCheck size={20}/>, tab:"production" as OperationsTab},
  ];

  return <div className="admin-shell">
    {sidebarOpen && <button className="admin-mobile-backdrop" aria-label="Zamknij nawigację" tabIndex={-1} onClick={() => {setSidebarOpen(false); menuButton.current?.focus();}}/>}
    <aside ref={navigation} className={"admin-sidebar" + (sidebarOpen ? " is-open" : "")} id="admin-navigation" aria-label="Nawigacja panelu"><div className="admin-brand"><img src="/assets/zastal-logo.svg" alt="Zastal"/><div><strong>Zastal</strong><span>Panel sklepu</span></div><button className="admin-sidebar-close" aria-label="Zamknij nawigację" onClick={() => {setSidebarOpen(false); menuButton.current?.focus();}}><X size={20}/></button></div><nav>{allowedViews.map(view => <button key={view.id} className={"admin-navitem" + (activeTab === view.id ? " active" : "")} aria-current={activeTab === view.id ? "page" : undefined} onClick={() => selectView(view.id)}>{view.icon}<span>{view.label}</span>{view.id === "orders" && activeOrders.length > 0 && <b>{activeOrders.length}</b>}{view.id === "production" && activeTasks.length > 0 && <b>{activeTasks.length}</b>}</button>)}</nav><div className="admin-side-bottom"><div className="admin-signed-in"><span>{auth.user.name.slice(0,1)}</span><div><strong>{auth.user.name}</strong><small>{auth.user.identifier}</small></div></div><a href="/"><ArrowLeft size={17}/>Przejdź do sklepu</a><button onClick={() => void logout()}><LogOut size={17}/>Wyloguj</button></div></aside>
    <main className="admin-main"><header className="admin-topbar"><div className="admin-topbar-left"><button ref={menuButton} className="admin-mobile-menu" aria-label="Otwórz nawigację" aria-expanded={sidebarOpen} aria-controls="admin-navigation" onClick={() => setSidebarOpen(true)}><Menu size={22}/></button><span className="admin-breadcrumb">Panel sklepu <span>/</span> <strong>{currentView.label}</strong></span></div><div className="admin-topbar-right"><span>{updatedAt ? "Dane z " + formatDate(updatedAt) : ""}</span><button className="admin-refresh" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? "admin-spinning" : ""}/><span>{loading ? "Odświeżanie…" : "Odśwież"}</span></button></div></header><div className="admin-page">{!storeSales.checkoutEnabled&&<div className="admin-demo-notice"><AlertCircle size={17}/><p>Sklep w przygotowaniu do uruchomienia. Przyjmowanie nowych zamówień jest wstrzymane do czasu aktywowania prawdziwych usług sprzedażowych.</p></div>}<div className="admin-page-heading"><div><h1>{currentView.title}</h1><p>{currentView.description}</p></div></div>{message && <div className="admin-alert" role="alert"><AlertCircle size={18}/><span>{message} Wyświetlone dane mogą być nieaktualne.</span><button aria-label="Zamknij komunikat" onClick={() => setMessage("")}><X size={17}/></button></div>}
      {activeTab === "dashboard" && <div className="admin-dashboard" aria-busy={loading}><div className="admin-metrics">{metrics.map(metric => <button key={metric.label} className="admin-metric" onClick={() => selectView(metric.tab)}><div><span>{metric.label}</span>{metric.icon}</div><strong>{metric.value}</strong><small>{metric.note}</small></button>)}</div><div className="admin-dashboard-grid"><section className="admin-panel"><div className="admin-panel-head"><div><h2>Najnowsze zamówienia</h2><p>{activeOrders.length} w toku · {data.orders.length} w pobranych danych</p></div><button className="admin-text-link" onClick={() => selectView("orders")}>Wszystkie<ArrowRight size={15}/></button></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Zamówienie</th><th>Wartość</th><th>Status</th><th><span className="admin-sr-only">Otwórz szczegóły</span></th></tr></thead><tbody>{data.orders.slice(0, 6).map(order => <tr key={order.id}><td><strong>{orderNumber(order.id)}</strong><small>{formatDate(order.created)}</small></td><td className="admin-nowrap">{formatMoney(order.total)}</td><td><StatusBadge status={order.status}/></td><td><button className="admin-row-action" aria-label={"Otwórz " + orderNumber(order.id)} onClick={() => openOrder(order.id)}><ArrowRight size={17}/></button></td></tr>)}</tbody></table></div>{!data.orders.length && <p className="admin-empty">Nie ma jeszcze zamówień testowych.</p>}</section><section className="admin-panel"><div className="admin-panel-head"><div><h2>Warianty do uzupełnienia</h2><p>Stan 0–2 szt. w magazynie</p></div><button className="admin-text-link" onClick={() => selectView("inventory")}>Magazyn<ArrowRight size={15}/></button></div><div className="admin-low-stock">{lowStock.slice(0, 6).map(variant => <div key={variant.id}><div><strong>{variant.name} <span>/ {variant.size}</span></strong><small>{variant.sku}</small></div><b className={variant.stock === 0 ? "admin-no-stock" : ""}>{variant.stock} szt.</b></div>)}{!lowStock.length && <p className="admin-empty">Wszystkie warianty mają zapas powyżej 2 szt.</p>}</div>{lowStock.length > 6 && <button className="admin-panel-footer" onClick={() => selectView("inventory")}>Pozostałe warianty: {lowStock.length - 6}<ArrowRight size={15}/></button>}</section></div><div className="admin-dashboard-secondary"><section className="admin-panel admin-work-summary"><div className="admin-panel-head"><div><h2>Transfery i nanoszenie DTF</h2><p>Gotowe transfery kupowane od dostawców</p></div><Package size={20}/></div><div className="admin-transfer-summary"><button onClick={() => selectView("transfers")}><strong>{availableTransfers}</strong><span>Transferów dostępnych</span><ArrowRight size={16}/></button><button onClick={() => selectView("transfers")}><strong>{awaitingTransfers}</strong><span>Transferów do przyjęcia</span><ArrowRight size={16}/></button><button onClick={() => selectView("production")}><strong>{activeTasks.length}</strong><span>Aktywnych zleceń</span><ArrowRight size={16}/></button></div></section><section className="admin-panel"><div className="admin-panel-head"><div><h2>Ostatnie działania</h2><p>Na podstawie zapisanej historii</p></div><button className="admin-text-link" onClick={() => selectView("audit")}>Historia<ArrowRight size={15}/></button></div><div className="admin-recent-activity">{data.activity.slice(0, 3).map(event => <div key={event.id}><span/><div><p>{event.note}</p><small>{formatDate(event.created)}</small></div></div>)}{!data.activity.length && <p className="admin-empty">Brak zapisanych działań.</p>}</div></section></div></div>}
      {activeTab==="homepage"&&<HomeEditor/>}
      {activeTab==="pos"&&<POS key={auth.user.id} onSaved={refresh}/>}
      {activeTab==="fulfillment"&&<Fulfillment key={auth.user.id} onSaved={refresh}/>}
      {activeTab==="email"&&<EmailCenter key={auth.user.id}/>}
      {activeTab==="staff"&&<Staff/>}
      {activeTab==="settings"&&<SalesSettings/>}
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
