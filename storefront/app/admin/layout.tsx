import type {Metadata} from "next";
import AuthProvider from "../../components/AuthProvider";
export const metadata:Metadata={title:"Panel sklepu — Zastal Store",robots:{index:false,follow:false}};
/** The panel signs in on its own (staff cookie and routes), independent of a customer logged in to the shop in the same browser. */
export default function AdminLayout({children}:{children:React.ReactNode}){return <AuthProvider scope="staff">{children}</AuthProvider>;}
