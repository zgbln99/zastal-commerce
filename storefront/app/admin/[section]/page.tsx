import {notFound} from 'next/navigation';
import Admin from '../page';
import {ADMIN_ROUTES} from '../navigation.mjs';
export default async function AdminSection({params}:{params:Promise<{section:string}>}){
 const {section}=await params;
 if(!Object.values(ADMIN_ROUTES).includes(section))notFound();
 return <Admin/>;
}
