import type {Model,ModelField} from "../shared/types.ts";
import {vidGenMediaType} from "../shared/vidgen.ts";
import {get} from "./store.ts";
import {assetDataURL} from "./storage.ts";

// Resolve media sequentially; text fields (especially prompt) remain literal.
export async function materializeVidGen(payload:Record<string,unknown>,model:Model) {
  async function visit(value:unknown,field:ModelField,name:string):Promise<unknown> {
    if(typeof value === "string" && value.startsWith("asset:") && vidGenMediaType(name,field)) {
      const asset=get("assets",value.slice(6));
      if(!asset)throw new Error(`A reference for ${name} is missing.`);
      if(!asset.mime.startsWith(vidGenMediaType(name,field)!+"/"))throw new Error(`Choose a matching media type for ${name}.`);
      return assetDataURL(asset);
    }
    if(Array.isArray(value)) {
      const items:unknown[]=[];
      for(let i=0;i<value.length;i++)items.push(await visit(value[i],field.items || {},`${name}[${i}]`));
      return items;
    }
    if(value && typeof value === "object") {
      const entries:[string,unknown][]=[];
      for(const [key,child] of Object.entries(value))entries.push([key,await visit(child,((field.properties || {}) as Record<string,ModelField>)[key] || {},`${name}.${key}`)]);
      return Object.fromEntries(entries);
    }
    return value;
  }
  const entries:[string,unknown][]=[];
  for(const [name,value] of Object.entries(payload))entries.push([name,await visit(value,model.schema?.properties?.[name] || {},name)]);
  return Object.fromEntries(entries);
}
