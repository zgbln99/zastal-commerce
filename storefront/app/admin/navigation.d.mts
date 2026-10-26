export const ADMIN_ROUTES:Readonly<Record<string,string>>;
export function adminPath(view:string):string;
export function adminView(path:string):string;
export function orderInScope(order:{status:string;payment_status?:string|null},scope:string):boolean;
