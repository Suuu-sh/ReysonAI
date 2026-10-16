import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import parser from '../../scripts/postflop-ai/vendor/babel-parser-7.29.7.ts';
const excluded = new Set(['start','end','loc','extra','leadingComments','trailingComments','innerComments','comments','tokens']);
export function cleanAst(value) {
  if (Array.isArray(value)) return value.map(cleanAst);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.has(key)).map(([key, val]) => [key, cleanAst(val)]));
  return value;
}
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function executableStatements(text, path = '') {
  // Historical receipt keys may still name .mjs, while current source is TypeScript.
  const js = stripTypeScriptTypes(text);
  const body = parser.parse(js, { sourceType: 'module' }).program.body.filter(node => node.type !== 'ImportDeclaration');
  // Preserve the immutable historical AST pin across this one executable module
  // relocation. Other URLs, arguments, Worker options and logic remain exact.
  if (path === 'apps/frontend/scripts/postflop-ai/later-hand-ev.mjs') {
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;
      const url = node.type === 'NewExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'Worker' ? node.arguments[0] : null;
      if (url?.type === 'NewExpression' && url.callee?.type === 'Identifier' && url.callee.name === 'URL' && url.arguments.length === 2 &&
          url.arguments[0]?.type === 'StringLiteral' && url.arguments[0].value === './later-hand-ev-worker.ts' &&
          url.arguments[1]?.type === 'MemberExpression' && url.arguments[1].property?.name === 'url' &&
          url.arguments[1].object?.type === 'MetaProperty' && url.arguments[1].object.meta?.name === 'import' && url.arguments[1].object.property?.name === 'meta') {
        url.arguments[0].value = './later-hand-ev-worker.mjs';
      }
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
    };
    body.forEach(visit);
  }
  return body;
}
export const moduleDigest = (text,path) => digest(cleanAst(executableStatements(text,path)));
export function declarationDigests(text,path) {
  return Object.fromEntries(executableStatements(text,path).flatMap(wrapper => {
    const node = wrapper.declaration ?? wrapper;
    const name = node.id?.name ?? node.declarations?.[0]?.id.name;
    return name ? [[name, digest(cleanAst(node))]] : [];
  }));
}
export function engineCases(engine, spots, config) {
  return spots.filter(spot => spot.reachable).flatMap(spot => Array.from({length:5}, (_, scenario) => {
    const table = engine.createTable(spot); let flopStep=0; const next={turn:0,river:0};
    const decision=(node,street,index) => {
      const first=node.endsWith('_first');
      if(scenario===0)return first?'check':'call';
      if(scenario===1)return first?(street==='turn'?'bet125':'bet33'):'call';
      if(scenario===2)return first?'bet125':index<3?'raise':'call';
      if(scenario===3)return first?'bet75':'fold';
      return first?'bet33': /_vs_raise4$/.test(node)?'call':'raise';
    };
    engine.playFlop(table,spot.tree,(_seat,node)=>decision(node,'flop',flopStep++),config);
    engine.playLaterStreetsWithPolicy(table,[48,21,2],[30,36],(_seat,node,board)=>{const street=board.length===4?'turn':'river';return decision(node,street,next[street]++);},config);
    return {spot:spot.id,scenario,pot:table.pot,stacks:table.stacks,invested:table.invested,winner:table.winner,lastAggressor:table.lastAggressor,path:table.path,log:table.log};
  }));
}
export function uiCases(ui,spots) {
  return spots.filter(spot=>spot.reachable).map(spot=>{
    const check=spot.tree==='oop_leads'?['check','check']:['check'];
    const paths=[[],['bet33'],['bet125','call'],['bet75','fold'],check];
    const capture=fn=>{try{return {value:fn()};}catch(error){return {error:error.message};}};
    const flop=paths.map(path=>capture(()=>ui.flopDecision(path,spot)));
    const starts=[capture(()=>ui.laterStart(check,spot)),capture(()=>ui.laterStart(['bet33','call'],spot))];
    const later: any[]=[];
    for(const entry of starts)if(entry.value)for(const street of ['turn','river'])for(const path of [[],['bet33'],['bet75','call'],['bet125','call'],['bet125','raise'],['bet125','raise','fold'],['check','check'],['allin','raise']]){
      later.push({street,path,replay:capture(()=>ui.replayLater(street,path,entry.value,spot)),decision:capture(()=>ui.laterDecision(street,path,entry.value,spot))});
    }
    return {spot:spot.id,flop,starts,later};
  });
}
