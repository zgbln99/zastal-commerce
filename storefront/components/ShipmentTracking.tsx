import {ArrowUpRight,Package} from "lucide-react";

export type ShipmentEvent={code:string;label:string;occurred_at:string};
export type Shipment={carrier:string;tracking_number:string;tracking_url:string;status_code:string|null;status_label:string;occurred_at:string|null;checked_at:string|null;events:ShipmentEvent[];sync_state:"not_configured"|"pending"|"ok"|"error";source:"dpd"|null};
type Props={shipment?:Shipment|null;carrier?:string;trackingNumber?:string;trackingUrl?:string};
const fallback="Aktualny status sprawdzisz na stronie DPD";
const date=(value:string)=>{const parsed=new Date(value);return Number.isNaN(parsed.getTime())?"":parsed.toLocaleString("pl-PL",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Warsaw",timeZoneName:"short"});};
function safeLink(value:string){
 try{const url=new URL(value);return ["https:","http:"].includes(url.protocol)&&!url.username&&!url.password?url.href:"";}catch{return "";}
}

/** Carrier progress is separate from the store's fulfillment timeline. */
export default function ShipmentTracking({shipment,carrier="",trackingNumber="",trackingUrl=""}:Props){
 const number=shipment?.tracking_number||trackingNumber;
 const name=shipment?.carrier||carrier;
 if(!number)return null;
 const dpd=name.trim().toUpperCase()==="DPD";
 const url=dpd?(/^[0-9]{13}[0-9A-Z]$/.test(number)?"https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1="+number:""):safeLink(shipment?.tracking_url||trackingUrl);
 const actual=dpd&&shipment?.source==="dpd"&&!!shipment.status_code;
 const events=actual?shipment.events.slice(0,100):[];
 return <section className="shipment-tracking" aria-label={"Śledzenie przesyłki "+name}>
  <div className="shipment-tracking-heading"><Package size={21} aria-hidden="true"/><div><h3>Przesyłka {name}</h3><p className="shipment-tracking-number">Numer: <span>{number}</span></p></div>{url&&<a href={url} target="_blank" rel="noopener noreferrer">Śledź {dpd?"w DPD":"przesyłkę"}<ArrowUpRight size={15} aria-hidden="true"/></a>}</div>
  {dpd&&<div className="shipment-tracking-status"><strong>{actual?shipment.status_label:fallback}</strong>{actual&&shipment.occurred_at&&<time dateTime={shipment.occurred_at}>{date(shipment.occurred_at)}</time>}{shipment?.checked_at&&<p>Ostatnio sprawdzono: <time dateTime={shipment.checked_at}>{date(shipment.checked_at)}</time></p>}{shipment?.sync_state==="error"&&<p className="shipment-tracking-notice">Nie udało się odświeżyć statusu.{actual?" Pokazujemy ostatnie informacje od DPD.":" Spróbuj sprawdzić przesyłkę na stronie DPD."}</p>}{actual&&shipment.sync_state==="not_configured"&&<p className="shipment-tracking-notice">Pokazujemy ostatnie informacje od DPD. Aktualny status sprawdzisz na stronie przewoźnika.</p>}</div>}
  {events.length>0&&<details className="shipment-tracking-history"><summary>Historia przesyłki ({events.length})</summary><ol>{events.map((event,i)=><li key={event.code+event.occurred_at+i}><span>{event.label}</span><time dateTime={event.occurred_at}>{date(event.occurred_at)}</time></li>)}</ol></details>}
 </section>;
}
