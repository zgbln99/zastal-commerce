import {notFound} from 'next/navigation';
import {Suspense} from 'react';
import ShopClient from '../ShopClient';
import {CATEGORY_PATHS, categoryUrl} from '../../../lib/urls.mjs';
import '../shop.css';
import '../../shop-category.css';
async function categoryName(params:Promise<{category:string}>) { const {category}=await params;const name=Object.keys(CATEGORY_PATHS).find(k=>CATEGORY_PATHS[k]===category);if(!name)notFound();return name; }
export async function generateMetadata({params}:{params:Promise<{category:string}>}) {const name=await categoryName(params);return {title:name==='Dzieci'?'Dla dzieci':name,alternates:{canonical:categoryUrl(name)}};}
export default async function CategoryPage({params}:{params:Promise<{category:string}>}) {await categoryName(params);return <Suspense fallback={<div className="container">Wczytywanie produktów…</div>}><ShopClient/></Suspense>;}
