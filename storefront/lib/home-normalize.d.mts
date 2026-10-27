import type {Field,HomeConfig,SectionKind} from "./home-layout";
export function cleanNumber(value:unknown,field:Pick<Field,"min"|"max"|"defaultValue">):number;
export function normalizeNumbers(config:HomeConfig,fields:Record<SectionKind,Field[]>):{config:HomeConfig;fixed:string[]};
