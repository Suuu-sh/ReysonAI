import { accountApiBase } from '../account/config.ts';
export async function rankedRequest(path,body=undefined) {
  const response=await fetch(`${accountApiBase(import.meta.env??{})}/v1/ranked/${path}`,{credentials:'include',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error??'ranked_service_unavailable');
  return result;
}
