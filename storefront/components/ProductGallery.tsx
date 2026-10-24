"use client";
import {useRef,useState} from "react";
import {ChevronLeft,ChevronRight,Maximize2,X} from "lucide-react";
import {galleryIndex,productImages,swipeIndex,type ImageProduct} from "../lib/product-media.mjs";
import {ProductImage} from "./ProductCard";
import Modal from "./Modal";
export default function ProductGallery({product}:{product:ImageProduct}) {
 const images=productImages(product),[index,setIndex]=useState(0),[zoom,setZoom]=useState(false);
 const start=useRef<{x:number;y:number}|null>(null);
 const current=images[galleryIndex(index,0,images.length)];
 const move=(step:number)=>setIndex(i=>galleryIndex(i,step,images.length));
 const view=(expanded=false)=><div className={"gallery-view "+(expanded?"expanded":"")} tabIndex={0} role="group" aria-label="Galeria produktu. Strzałki w lewo i w prawo zmieniają zdjęcie." onKeyDown={e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();move(e.key==="ArrowLeft"?-1:1);}}}>
  <div className="product-gallery-main" onTouchStart={e=>{const p=e.touches[0];start.current=e.touches.length===1?{x:p.clientX,y:p.clientY}:null;}} onTouchCancel={()=>{start.current=null;}} onTouchEnd={e=>{const p=e.changedTouches[0],origin=start.current;start.current=null;if(origin&&p)setIndex(i=>swipeIndex(i,images.length,p.clientX-origin.x,p.clientY-origin.y));}}>
   <ProductImage product={product} media={current} eager/>
   {!expanded&&current&&<button type="button" className="gallery-zoom" aria-label="Powiększ aktualne zdjęcie produktu" onClick={()=>setZoom(true)}><Maximize2 size={18}/></button>}
  </div>
  <div className="gallery-navigation"><button type="button" aria-label="Poprzednie zdjęcie" disabled={images.length<2} onClick={()=>move(-1)}><ChevronLeft size={20}/></button><span role="status" aria-live="polite">{images.length?`${galleryIndex(index,0,images.length)+1} / ${images.length}`:"Brak zdjęć produktu"}</span><button type="button" aria-label="Następne zdjęcie" disabled={images.length<2} onClick={()=>move(1)}><ChevronRight size={20}/></button></div>
  {images.length>1&&<div className="gallery-thumbnails" aria-label="Wybierz zdjęcie">{images.map((img,i)=><button type="button" key={img.id} className={img.id===current?.id?"selected":""} aria-label={`Zdjęcie ${i+1}: ${img.alt}`} aria-pressed={img.id===current?.id} onClick={()=>setIndex(i)}><ProductImage product={product} media={img} showLabel={false}/></button>)}</div>}
 </div>;
 return <div className="product-gallery">{view()}{zoom&&<Modal title={"Zdjęcia: "+product.name} onClose={()=>setZoom(false)} className="product-zoom-modal"><button className="icon-btn gallery-close" aria-label="Zamknij powiększenie" onClick={()=>setZoom(false)}><X size={23}/></button>{view(true)}</Modal>}</div>;
}
