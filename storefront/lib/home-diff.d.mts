import type {HomeConfig} from "./home-layout";
export type HomeDiff={added:{id:string;name:string}[];removed:{id:string;name:string}[];toggled:{id:string;name:string;enabled:boolean}[];edited:{id:string;name:string;fields:string[]}[];moved:boolean;total:number};
export function diffHome(before:HomeConfig|null|undefined,after:HomeConfig,names?:{section?:(type:string)=>string;field?:(type:string,key:string)=>string}):HomeDiff;
export function describeDiff(diff:HomeDiff):string[];
