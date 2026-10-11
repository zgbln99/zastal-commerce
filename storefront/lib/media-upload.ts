import type {ApiRequest} from "../components/AuthProvider";
// Only aspect-preserving encoding; the server remains authoritative for format and sanitation.
export async function prepareMedia(file:File):Promise<string> {
 if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("Dozwolone są JPG, PNG i WebP.");
 if(file.size>25_000_000)throw Error("Plik przekracza 25 MB. Zmniejsz go przed przesłaniem.");
 const picture=await createImageBitmap(file).catch(()=>{throw Error("Nie można odczytać obrazu. Wybierz poprawny JPG, PNG lub WebP.");});
 try {
  if(picture.width<300||picture.height<200)throw Error("Zdjęcie musi mieć co najmniej 300×200 px.");
  let scale=Math.min(1,2200/picture.width,1700/picture.height);
  const width=Math.round(picture.width*scale),height=Math.round(picture.height*scale);
  if(width<300||height<200)throw Error("Zbyt skrajne proporcje obrazu. Po zmniejszeniu wymagane jest minimum 300×200 px.");
  const canvas=document.createElement("canvas");
  const minimumScale=Math.max(300/picture.width,200/picture.height);
  const encode=(type:string,quality:number)=>new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,type,quality));
  let blob:Blob|null=null;
  for(let attempt=0;attempt<16;attempt++){
   canvas.width=Math.round(picture.width*scale);canvas.height=Math.round(picture.height*scale);
   const context=canvas.getContext("2d");if(!context)throw Error("Przeglądarka nie może przetworzyć zdjęcia.");
   context.drawImage(picture,0,0,canvas.width,canvas.height);
   for(const quality of [0.88,0.78,0.68]){
    blob=await encode("image/webp",quality);
    // Unsupported canvas formats silently become PNG. JPEG input has no alpha;
    // use its supported encoder without flattening transparent PNG/WebP input.
    if(blob&&blob.type!=="image/webp"&&file.type==="image/jpeg")blob=await encode("image/jpeg",quality);
    if(!blob||!["image/jpeg","image/png","image/webp"].includes(blob.type))throw Error("Przeglądarka nie może zakodować zdjęcia.");
    if(blob.size<=1_200_000)break;
    if(blob.type==="image/png")break; // PNG ignores the quality argument.
   }
   if(blob&&blob.size<=1_200_000)break;
   const nextScale=Math.max(minimumScale,scale*Math.min(0.85,Math.sqrt(1_200_000/blob!.size)*0.95));
   if(nextScale>=scale)break;
   scale=nextScale;
  }
  if(!blob||blob.size>1_200_000)throw Error("Nie można przygotować tego zdjęcia w tej przeglądarce. Wybierz inną wersję pliku.");
  return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error("Nie można odczytać zdjęcia."));reader.readAsDataURL(blob);});
 } finally {picture.close();}
}
export async function uploadMedia(file:File,request:ApiRequest):Promise<string>{
 const image=await prepareMedia(file);
 const out=await request<{url:string}>("/api/admin/home/media",{method:"POST",body:JSON.stringify({image,name:file.name.slice(0,140)})});
 return out.url;
}
