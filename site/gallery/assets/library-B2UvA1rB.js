const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/highlighter-core-DpYe-e9U.js","assets/frame-Caxs0_Mb.js","assets/code-highlight-DRfWOiCq.js","assets/code-highlight-CgFQbpHq.css"])))=>i.map(i=>d[i]);
import{b as d,k as e,_ as ea,a as yt,v as je,G as B,C as jt,w as na,x as le,y as ta,U as aa,z as sa,l as N,B as D,E as Ce,m as ia,M as Ee,H as V,J as mn,K as pn,n as pe,L as ra,u as oa}from"./frame-Caxs0_Mb.js";import{e as la,u as ca,H as Ze,C as da,g as ha,j as ua,r as ma,d as pa,S as Nt,M as ga,k as St,D as ue,l as Ct,m as fa,U as Me,n as gn,A as Te,o as ze,P as ge,p as fn,B as dn,q as Ne,t as Tt,v as ba,x as xa,y as va,z as wa,E as bn,F as Le,G as j,I as O,J as Ie,K as ka,N as ya,O as Re,Q as fe,R as ja,T as Na,V as Sa,W as Q,X as Ca,Y as xn,Z as Ta,_ as Aa,$ as At,a0 as He,a1 as Ea,a2 as vn,a3 as Ma,a4 as za,a5 as La,a6 as Ia,a7 as Pe,a8 as Ra,a9 as ce,aa as Ha,ab as Be,ac as Pa,ad as Ba,ae as Oa,af as Da,ag as _a,ah as $a,ai as Fa,aj as Et,ak as wn,al as kn,am as K,an as yn,ao as jn,ap as J,aq as ae,ar as Xe,as as de,at as en,au as Nn,av as Z,aw as qa,ax as Wa,ay as $,az as Sn,aA as Ga,aB as Ua,aC as Va,aD as Ka,aE as Ja,aF as Oe,aG as Ya,aH as Cn,aI as Qa,aJ as Tn,aK as Za,aL as Xa,aM as es,aN as An,aO as ns,aP as En,aQ as Mn,aR as ts,aS as be,aT as De,aU as zn,aV as as,aW as ss,aX as is,aY as rs,aZ as os,a_ as Ln,a$ as In,b0 as Rn,b1 as ls,b2 as cs,b3 as _e,b4 as ds,b5 as hs,b6 as Hn,b7 as us,b8 as ms,b9 as ps,ba as Pn,bb as gs,bc as fs,bd as $e,be as X,bf as bs,bg as xs,bh as vs,bi as Bn,bj as xe,bk as ws,bl as ks,bm as ys,bn as On,bo as Dn,bp as _n,bq as js,br as Ns,bs as Ss,bt as $n,bu as Cs,bv as Ts,bw as As,bx as Fn,by as Es,bz as Ms,bA as zs,bB as Ls,bC as Is,bD as Rs,bE as Hs,bF as Ps,bG as Bs}from"./code-highlight-DRfWOiCq.js";import{K as Os,N as Ds,O as _s,P as $s,Q as nn,X as Fs,R as qs,U as Ws,u as y,t as q,W as re,Y as Gs,B as Us,A as Vs,Z as Ks,J as Js}from"./frame-Br8y82j-.js";const Ys=1e3,Mt="diff-word";function qn(a){if(a==="")return[];const n=a.replace(/\r\n?/g,`
`).split(`
`);return n[n.length-1]===""&&n.pop(),n}const se=(a,n)=>Array(a).fill(n);function zt(a,n,t=Ys,s="replace"){let i=0;for(;i<a.length&&i<n.length&&a[i]===n[i];)i++;let r=0;for(;r<a.length-i&&r<n.length-i&&a[a.length-1-r]===n[n.length-1-r];)r++;const o=a.slice(i,a.length-r),l=n.slice(i,n.length-r),c=Qs(o,l,t)??(s==="replace"?[...se(o.length,"delete"),...se(l.length,"insert")]:null);return c===null?null:[...se(i,"equal"),...c,...se(r,"equal")]}function Qs(a,n,t){const s=a.length,i=n.length;if(s===0)return se(i,"insert");if(i===0)return se(s,"delete");const r=Math.min(s+i,t),o=r+1,l=new Int32Array(2*r+3),c=p=>l[p+o]??0,u=[];for(let p=0;p<=r;p++){u.push(l.slice(o-p-1,o+p+2));for(let m=-p;m<=p;m+=2){let g=m===-p||m!==p&&c(m-1)<c(m+1)?c(m+1):c(m-1)+1,x=g-m;for(;g<s&&x<i&&a[g]===n[x];)g++,x++;if(l[m+o]=g,g>=s&&x>=i)return Zs(u,s,i)}}return null}function Zs(a,n,t){const s=[];let i=n,r=t;for(let o=a.length-1;o>=0;o--){const l=a[o],c=x=>l[x+o+1]??0,u=i-r,p=u===-o||u!==o&&c(u-1)<c(u+1)?u+1:u-1,m=c(p),g=m-p;for(;i>m&&r>g;)s.push("equal"),i--,r--;o>0&&s.push(i===m?"insert":"delete"),i=m,r=g}return s.reverse()}const Wn=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|(?:(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])[\p{L}\p{N}_])+|\s+|[^\p{L}\p{N}_\s]/gu;function Xs(a,n){const t={removed:[],added:[]};if(a===n)return t;const s=a.match(Wn)??[],i=n.match(Wn)??[],r=zt(s,i,500,"none");if(r===null)return t;const o=[],l=[];let c=0,u=0,p=0,m=0,g=0;const x=(b,f,v)=>{const w=b[b.length-1];w!==void 0&&w[1]===f?b[b.length-1]=[w[0],v]:b.push([f,v])};for(const b of r)if(b==="equal"){const f=s[c++];u++,f.trim()!==""&&(g+=f.length),p+=f.length,m+=f.length}else if(b==="delete"){const f=s[c++];x(o,p,p+f.length),p+=f.length}else{const f=i[u++];x(l,m,m+f.length),m+=f.length}return g<.4*Math.max(a.trim().length,n.trim().length)?t:{removed:o,added:l}}function Lt(a){let n=0;for(;n<a.length;){if(a[n].kind!=="del"){n++;continue}const t=n;for(;n<a.length&&a[n].kind==="del";)n++;const s=n;for(;n<a.length&&a[n].kind==="add";)n++;const i=Math.min(s-t,n-s);for(let r=0;r<i;r++){const o=a[t+r],l=a[s+r],c=Xs(o.text,l.text);a[t+r]={...o,words:c.removed},a[s+r]={...l,words:c.added}}}}function ei(a,n,t){const s=a.filter(l=>l.kind!=="add").length,i=a.filter(l=>l.kind!=="del").length,r=s===0?n:n+1,o=i===0?t:t+1;return`@@ -${r},${s} +${o},${i} @@`}function It(a){const n=[],t=[];return{hunks:a.map(i=>({header:i.header,lines:i.lines.map(r=>{let o;return r.kind==="del"?(o=n.length,n.push(r.text)):(r.kind==="context"&&n.push(r.text),o=t.length,t.push(r.text)),{...r,at:o}})})),oldSide:n,newSide:t}}function ni(a,n,t=3){const s=qn(a),i=qn(n),r=zt(s,i)??[],o=[];let l=0,c=0;for(const m of r)m==="equal"?(o.push({kind:"context",text:i[c],oldNo:l+1,newNo:c+1,at:0,words:[]}),l++,c++):m==="delete"?(o.push({kind:"del",text:s[l],oldNo:l+1,newNo:null,at:0,words:[]}),l++):(o.push({kind:"add",text:i[c],oldNo:null,newNo:c+1,at:0,words:[]}),c++);const u=[];let p=0;for(;p<o.length;){if(o[p].kind==="context"){p++;continue}const m=Math.max(0,p-t);let g=p;for(let w=p;w<o.length;w++)if(o[w].kind!=="context")g=w;else if(w-g>2*t)break;const x=Math.min(o.length,g+t+1),b=o.slice(m,x);Lt(b);let f=0,v=0;for(const w of o.slice(0,m))w.kind!=="add"&&f++,w.kind!=="del"&&v++;u.push({header:ei(b,f,v),lines:b}),p=x}return It(u)}const ti=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;function ai(a){const n=[];let t=null,s=0,i=0,r=0,o=0;for(const l of a.replace(/\r\n?/g,`
`).split(`
`)){const c=ti.exec(l);if(c!==null){t={header:l,lines:[]},n.push(t),s=Number(c[1]),i=Number(c[3]),r=c[2]===void 0?1:Number(c[2]),o=c[4]===void 0?1:Number(c[4]);continue}if(t===null||r<=0&&o<=0||l.startsWith("\\"))continue;const u=l[0],p=l.slice(1);u==="+"?(t.lines.push({kind:"add",text:p,oldNo:null,newNo:i,at:0,words:[]}),i++,o--):u==="-"?(t.lines.push({kind:"del",text:p,oldNo:s,newNo:null,at:0,words:[]}),s++,r--):(t.lines.push({kind:"context",text:p,oldNo:s,newNo:i,at:0,words:[]}),s++,i++,r--,o--)}for(const l of n)Lt(l.lines);return It(n)}function si(a){const n=[];let t=0;for(;t<a.length;){const s=a[t];if(s.kind==="context"){n.push({left:s,right:s}),t++;continue}const i=[];for(;t<a.length&&a[t].kind==="del";)i.push(a[t++]);const r=[];for(;t<a.length&&a[t].kind==="add";)r.push(a[t++]);for(let o=0;o<Math.max(i.length,r.length);o++)n.push({left:i[o]??null,right:r[o]??null})}return n}function ii(a,n){return a.hunks.flatMap(t=>t.lines.filter(s=>s.kind===n).flatMap(s=>s.words.map(([i,r])=>({line:s.at,start:i,end:r,className:Mt}))))}function ri(a,n){const t=a.indexOf("<code>"),s=a.lastIndexOf("</code>");if(t===-1||s<t)return null;const i=a.slice(t+6,s).split(/<span class="line(?: [^"]*)?">/);if(i.shift()!=="")return null;const r=i.map(o=>o.endsWith("</span>")?o.slice(0,-7):o);return r.length===n?r:null}const Rt={context:"",add:"bg-[var(--ui-diff-add-bg)]",del:"bg-[var(--ui-diff-del-bg)]"},Ht={context:" ",add:"+",del:"-"},tn="w-px select-none whitespace-nowrap px-2 text-right align-top text-[var(--ui-code-gutter)]",Pt="w-px select-none pl-2 align-top text-fg-subtle";function oi(a,n){if(n.length===0)return a;const t=[];let s=0;for(const[i,r]of n)i>s&&t.push(a.slice(s,i)),t.push(e.jsx("span",{className:Mt,children:a.slice(i,r)},i)),s=r;return s<a.length&&t.push(a.slice(s)),t}function li(a,n){return(n.kind==="del"?a?.oldSide:a?.newSide)?.[n.at]}function Bt({line:a,markup:n}){const t=li(n,a),s=a.kind==="del"?"del":a.kind==="add"?"ins":"span";return t===void 0?e.jsx(s,{children:oi(a.text,a.words)}):e.jsx(s,{className:"shiki",dangerouslySetInnerHTML:t})}function Fe(a){const{language:n="text",mode:t="unified",wrap:s=!1,highlight:i=!0,label:r,className:o=""}=a,{before:l,after:c,patch:u,context:p}=a,m=d.useMemo(()=>u!==void 0?ai(u):ni(l??"",c??"",p??3),[l,c,u,p]),g=la(i,ca()),[x,b]=d.useState(null);d.useEffect(()=>{if(g===null)return;let S=!0;const A=(C,H)=>C.length===0?Promise.resolve(null):Promise.resolve().then(()=>g(C.join(`
`),n,{blockLines:!0,marks:ii(m,H)})).then(z=>z===void 0?null:ri(z,C.length)).catch(()=>null);return Promise.all([A(m.oldSide,"del"),A(m.newSide,"add")]).then(([C,H])=>{if(!S)return;const z=L=>L?.map(k=>({__html:k}))??null;b({model:m,oldSide:z(C),newSide:z(H)})}),()=>{S=!1}},[m,n,g]);const f=g!==null&&x?.model===m?x:null,v=s?"whitespace-pre-wrap [overflow-wrap:anywhere]":"whitespace-pre",w=(S,A)=>e.jsx("tr",{className:"bg-[var(--ui-diff-hunk-bg)] text-fg-muted",children:e.jsx("td",{colSpan:A,className:"select-none px-3 py-1",children:S})});return e.jsx("div",{className:`code-diff overflow-hidden rounded-lg border border-[var(--ui-code-line)] bg-canvas ${o}`,children:e.jsx("div",{className:"overflow-x-auto",children:e.jsx("table",{"aria-label":r,className:"w-full border-collapse font-mono text-[length:var(--ui-text-code-size)] leading-relaxed",children:m.hunks.map((S,A)=>e.jsxs("tbody",{children:[w(S.header,t==="split"?6:4),t==="split"?si(S.lines).map((C,H)=>e.jsx("tr",{children:[C.left,C.right].map((z,L)=>z===null?e.jsx("td",{colSpan:3,className:"bg-surface-muted"},L):e.jsx(ci,{line:z,number:L===0?z.oldNo:z.newNo,markup:f,code:v},L))},H)):S.lines.map((C,H)=>e.jsxs("tr",{"data-kind":C.kind,className:Rt[C.kind],children:[e.jsx("td",{className:tn,children:C.oldNo??""}),e.jsx("td",{className:tn,children:C.newNo??""}),e.jsx("td",{className:Pt,children:Ht[C.kind]}),e.jsx("td",{className:`w-full pr-3 pl-1 ${v}`,children:e.jsx(Bt,{line:C,markup:f})})]},H))]},A))})})})}function ci({line:a,number:n,markup:t,code:s}){const i=Rt[a.kind];return e.jsxs(e.Fragment,{children:[e.jsx("td",{"data-kind":a.kind,className:`${tn} ${i}`,children:n??""}),e.jsx("td",{"data-kind":a.kind,className:`${Pt} ${i}`,children:Ht[a.kind]}),e.jsx("td",{"data-kind":a.kind,className:`w-1/2 pr-3 pl-1 ${s} ${i}`,children:e.jsx(Bt,{line:a,markup:t})})]})}function di({media:a,name:n,level:t=1,meta:s,description:i,actions:r,children:o,className:l=""}){return e.jsxs("div",{className:`flex items-start gap-3 ${l}`,children:[a!==void 0&&e.jsx("div",{className:"flex shrink-0 items-center",children:a}),e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsxs("div",{className:"flex flex-wrap items-baseline gap-x-2 gap-y-1",children:[e.jsx(Ze,{level:t,className:"min-w-0 [overflow-wrap:anywhere]",children:n}),s!==void 0&&e.jsx("span",{className:"flex min-w-0 items-center gap-1.5 text-xs text-fg-subtle",children:s})]}),i!==void 0&&e.jsx("p",{className:"mt-1 text-sm text-fg-muted",children:i}),o!==void 0&&e.jsx("div",{className:"mt-2",children:o})]}),r!==void 0&&e.jsx("div",{className:"flex shrink-0 items-center gap-2",children:r})]})}function an(a){return a.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu,"").replace(/\s+/g,"-")}function hi(a){const n=[];let t=!1;for(const s of a.split(`
`)){if(/^\s*(```|~~~)/.test(s)){t=!t;continue}if(t)continue;const i=/^(#{2,3})\s+(.+?)\s*$/.exec(s);if(!i)continue;const r=i[2];n.push({id:an(r),text:r,depth:i[1].length===2?2:3})}return n}function Gn(a){const n=a.startsWith("#")?a.slice(1):a;try{return decodeURIComponent(n)}catch{return n}}function Ae(a){return a==null||typeof a=="boolean"?"":typeof a=="string"||typeof a=="number"?String(a):Array.isArray(a)?a.map(Ae).join(""):typeof a=="object"&&"props"in a?Ae(a.props.children):""}function ui(a){const n=a?.children?.find(r=>r.tagName==="code"),t=n?.properties?.className,s=(Array.isArray(t)?t:[]).map(String).find(r=>r.startsWith("language-"))?.slice(9),i=r=>r?.type==="text"?r.value??"":(r?.children??[]).map(i).join("");return{code:i(n).replace(/\n$/,""),language:s??""}}function mi(a){if(typeof a!="string")return[];try{const n=JSON.parse(a);return Array.isArray(n)?n.map(String):[]}catch{return[]}}function pi(a,n,t){if(a.length===0)return"";const s=t.maxScroll>0?Math.min(1,t.scrollY/t.maxScroll):0,i=100+Math.max(0,t.height-140)*s;let r=a[0];return a.forEach((o,l)=>{const c=n[l];c!=null&&c<=i&&(r=o)}),t.maxScroll>0&&t.scrollY>=t.maxScroll-4&&(r=a[a.length-1]),r}function Un({link:a,className:n}){const t={href:a.href,className:n,children:a.label,...a.external?{target:"_blank",rel:"noreferrer"}:{}};return a.render?a.render(t):e.jsx("a",{...t})}function Vn({copyright:a,brand:n,columns:t,links:s=[]}){return n===void 0&&t===void 0?e.jsx("footer",{className:"site-footer",children:e.jsxs("div",{className:"site-footer-line mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-xs sm:px-6",children:[e.jsx("p",{children:a}),e.jsx("div",{className:"flex flex-wrap items-center gap-x-4 gap-y-1",children:s.map(i=>e.jsx(Un,{link:i,className:"site-footer-link whitespace-nowrap"},i.id))})]})}):e.jsx("footer",{className:"site-footer",children:e.jsxs("div",{className:"mx-auto max-w-7xl px-4 py-12 sm:px-6",children:[e.jsxs("div",{className:"flex flex-col gap-10 sm:flex-row sm:justify-between",children:[n&&e.jsxs("div",{className:"max-w-xs",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("img",{src:n.logo,alt:"",className:"h-7 w-7"}),e.jsx("span",{className:"site-footer-name",children:n.name})]}),e.jsx("p",{className:"site-footer-tagline mt-3 text-sm",children:n.tagline})]}),e.jsx("div",{className:"grid grid-cols-2 gap-10 text-sm",children:(t??[]).map(i=>e.jsxs("div",{children:[e.jsx("p",{className:"mb-3 font-medium",children:i.title}),e.jsx("ul",{className:"site-footer-links space-y-2",children:i.links.map(r=>e.jsx("li",{children:e.jsx(Un,{link:r,className:"site-footer-link"})},r.id))})]},i.title))})]}),e.jsx("p",{className:"site-footer-copyright mt-10 pt-6 text-xs",children:a})]})})}function gi({tone:a,children:n}){return e.jsx("span",{className:"site-pill","data-tone":a,children:n})}async function fi(a){try{return await navigator.clipboard.writeText(a),!0}catch{const n=document.createElement("textarea");n.value=a,n.setAttribute("readonly",""),n.style.cssText="position:fixed;top:0;left:0;opacity:0",document.body.appendChild(n);try{return n.select(),document.execCommand("copy")}catch{return!1}finally{n.remove()}}}const bi={pill:"site-copy inline-flex items-center gap-1.5 px-2 py-1 text-xs","pill-md":"site-copy inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-xs",text:"site-copy-text inline-flex items-center gap-1.5"},xi={copy:_s,link:Ds};function vi({text:a,label:n,announcement:t,look:s,glyph:i,className:r}){const{copied:o,flash:l}=ha(),c=xi[i];return e.jsxs(e.Fragment,{children:[e.jsxs("button",{type:"button",onClick:()=>l(typeof a=="function"?a():a),title:s==="text"?void 0:n,className:`${bi[s]} ${r}`,children:[o?e.jsx(Os,{className:"site-copy-done h-3.5 w-3.5"}):e.jsx(c,{className:"h-3.5 w-3.5"}),e.jsx("span",{children:n})]}),e.jsx(ua,{copied:o,announcement:t})]})}function Se({text:a,label:n,announcement:t,look:s="pill",glyph:i="copy",className:r=""}){return e.jsx(da,{write:fi,children:e.jsx(vi,{text:a,label:n,announcement:t,look:s,glyph:i,className:r})})}const Ot=d.createContext(null);function wi({code:a,language:n,highlight:t}){const s=d.useContext(Ot),i=t??s,[r,o]=d.useState(null);return d.useEffect(()=>{const l=ma(n);if(i===null||l===void 0||pa(l)){o(null);return}let c=!0;return i(a,l).then(u=>{c&&o(u?{__html:u}:null)},()=>{c&&o(null)}),()=>{c=!1}},[a,n,i]),e.jsx("div",{className:"site-code",children:r?e.jsx("div",{dangerouslySetInnerHTML:r}):e.jsx("pre",{children:e.jsx("code",{children:a})})})}function ki({labels:a,children:n}){const t=d.Children.toArray(n),[s,i]=d.useState(0),r=d.useId(),o=d.useRef(null),l=Math.min(s,a.length-1),c=u=>{const p=(l+u+a.length)%a.length;i(p),o.current?.querySelectorAll("button")[p]?.focus()};return e.jsxs("div",{className:"site-code-tabs",children:[e.jsx("div",{className:"site-code-tabs-strip",role:"tablist",ref:o,children:a.map((u,p)=>e.jsx("button",{type:"button",role:"tab",id:`${r}-tab-${p}`,"aria-controls":`${r}-panel-${p}`,"aria-selected":p===l,tabIndex:p===l?0:-1,onClick:()=>i(p),onKeyDown:m=>{m.key==="ArrowRight"?(m.preventDefault(),c(1)):m.key==="ArrowLeft"&&(m.preventDefault(),c(-1))},children:u},u))}),e.jsx("div",{role:"tabpanel",id:`${r}-panel-${l}`,"aria-labelledby":`${r}-tab-${l}`,children:t[l]})]})}function yi({code:a,label:n="shell",copy:t,className:s=""}){const i=a.split(`
`);return e.jsxs("div",{className:`site-code-card ${s}`,children:[e.jsxs("div",{className:"site-code-card-head flex items-center justify-between gap-2 px-3 py-2",children:[e.jsxs("span",{className:"site-code-card-label inline-flex min-w-0 items-center gap-1.5 text-xs",children:[e.jsx($s,{className:"h-3.5 w-3.5 shrink-0"}),e.jsx("span",{className:"truncate font-mono",children:n})]}),e.jsx(Se,{text:a,label:t.label,announcement:t.announcement})]}),e.jsx("pre",{className:"site-code-card-body overflow-x-auto px-4 py-3",children:e.jsx("code",{children:i.map((r,o)=>e.jsx("span",{className:"site-code-card-line block whitespace-pre","data-comment":r.trimStart().startsWith("#")||void 0,children:r.length>0?r:" "},o))})})]})}const ji=(a,n,t)=>ea(async()=>{const{highlight:s}=await import("./highlighter-core-DpYe-e9U.js");return{highlight:s}},__vite__mapDeps([0,1,2,3])).then(({highlight:s})=>s(a,n,t)),Ni=["ArrowDown","ArrowUp","PageDown","PageUp","Home","End"," "];function Si(a){const[n,t]=d.useState(""),s=d.useRef(null),i=d.useCallback(r=>{s.current=r,t(r)},[]);return d.useEffect(()=>{if(a.length<2)return;const r=a.map(x=>x.id),o=Gn(window.location.hash);s.current=r.includes(o)?o:null;let l=0;const c=()=>{if(l=0,s.current!==null){t(s.current);return}const x=document.documentElement;t(pi(r,r.map(b=>document.getElementById(b)?.getBoundingClientRect().top??null),{scrollY:window.scrollY,maxScroll:Math.max(0,x.scrollHeight-window.innerHeight),height:window.innerHeight}))},u=()=>{l===0&&(l=requestAnimationFrame(c))},p=()=>{s.current!==null&&(s.current=null,u())},m=x=>{Ni.includes(x.key)&&p()},g=()=>{const x=Gn(window.location.hash);r.includes(x)&&i(x)};return c(),window.addEventListener("scroll",u,{passive:!0}),window.addEventListener("resize",u),window.addEventListener("wheel",p,{passive:!0}),window.addEventListener("touchmove",p,{passive:!0}),window.addEventListener("keydown",m),window.addEventListener("hashchange",g),()=>{window.removeEventListener("scroll",u),window.removeEventListener("resize",u),window.removeEventListener("wheel",p),window.removeEventListener("touchmove",p),window.removeEventListener("keydown",m),window.removeEventListener("hashchange",g),l&&cancelAnimationFrame(l)}},[a,i]),{activeId:n,pinTo:i}}function Ci({label:a,entries:n,activeId:t,onNavigate:s,className:i="hidden xl:block"}){return e.jsx("aside",{className:`site-toc ${i}`,children:e.jsxs("nav",{className:"sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto","aria-label":a,children:[e.jsx("p",{className:"site-eyebrow ui-eyebrow",children:a}),e.jsx("ul",{className:"site-rail-list mt-3 space-y-1 text-sm",children:n.map(r=>e.jsx("li",{children:e.jsx("a",{href:`#${r.id}`,onClick:()=>s?.(r.id),"aria-current":t===r.id?"location":void 0,className:`site-rail-link py-0.5 ${r.depth===3?"pl-6":"pl-3"}`,children:r.text})},r.id))})]})})}function Ti(a){return a&&/(Mac|iPhone|iPad|iPod)/i.test(a)?"⌘ K":"Ctrl K"}function Kn(){const a=typeof navigator>"u"?void 0:navigator.platform||navigator.userAgent;return Ti(a)}function Dt({label:a,shortcut:n,onOpen:t}){return e.jsxs("button",{type:"button",onClick:s=>t(s.currentTarget),className:"site-search-trigger mb-6 flex min-h-11 w-full items-center gap-2 px-3 text-left",children:[e.jsx(nn,{className:"h-4 w-4 shrink-0"}),e.jsx("span",{className:"min-w-0 flex-1 truncate",children:a}),e.jsx("kbd",{className:"site-search-kbd",children:n})]})}function qe({text:a,ranges:n}){if(n.length===0)return a;const t=[];let s=0;for(const i of n)i.start>s&&t.push(a.slice(s,i.start)),t.push(e.jsx("mark",{children:a.slice(i.start,i.end)},`${i.start}:${i.end}`)),s=i.end;return s<a.length&&t.push(a.slice(s)),t}function Ai({open:a,onClose:n,returnFocusRef:t,search:s,highlight:i,onSelect:r,labels:o}){const l=d.useId(),c=`${l}-input`,u=`${l}-title`,p=`${l}-results`,m=k=>`${l}-result-${k}`,g=d.useRef(null),x=d.useRef(null),b=d.useRef(null),[f,v]=d.useState(""),[w,S]=d.useState(0),A=d.useMemo(()=>s(f),[s,f]);d.useEffect(()=>{S(0)},[f]),d.useEffect(()=>{b.current?.scrollIntoView({block:"nearest"})},[w,A]),d.useEffect(()=>{if(!a){v("");const P=t.current;t.current=null,P?.isConnected&&P.focus();return}const k=document.body.style.overflow;document.body.style.overflow="hidden";const T=requestAnimationFrame(()=>g.current?.focus());return()=>{cancelAnimationFrame(T),document.body.style.overflow=k}},[a,t]);const C=k=>{const T=A[k];T&&(r(T),n())},H=k=>{A.length!==0&&(k.key==="ArrowDown"?(k.preventDefault(),S(T=>(T+1)%A.length)):k.key==="ArrowUp"?(k.preventDefault(),S(T=>(T-1+A.length)%A.length)):k.key==="Enter"&&(k.preventDefault(),C(w)))},z=k=>{if(k.key==="Escape"){k.preventDefault(),n();return}if(k.key!=="Tab")return;const T=Array.from(x.current?.querySelectorAll('input, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')??[]);if(T.length===0)return;const P=T[0],U=T[T.length-1];k.shiftKey&&document.activeElement===P?(k.preventDefault(),U.focus()):!k.shiftKey&&document.activeElement===U&&(k.preventDefault(),P.focus())},L=k=>{k.target===k.currentTarget&&n()};return a?e.jsx("div",{className:"site-search-backdrop anim-fade fixed inset-0 z-50 flex items-start justify-center px-3 pt-[10vh] sm:px-6 sm:pt-[14vh]",onMouseDown:L,children:e.jsxs("div",{ref:x,role:"dialog","aria-modal":"true","aria-labelledby":u,className:"site-search-panel anim-rise flex max-h-[min(38rem,80vh)] w-full max-w-2xl flex-col overflow-hidden",onKeyDown:z,children:[e.jsxs("div",{className:"site-search-head flex min-h-14 items-center gap-3 px-4",children:[e.jsx(nn,{className:"site-search-glyph h-5 w-5 shrink-0"}),e.jsx("label",{id:u,htmlFor:c,className:"sr-only",children:o.label}),e.jsx("input",{ref:g,id:c,type:"text",inputMode:"search",enterKeyHint:"search",spellCheck:!1,value:f,onChange:k=>v(k.target.value),onKeyDown:H,placeholder:o.placeholder,autoComplete:"off",role:"combobox","aria-expanded":"true","aria-autocomplete":"list","aria-controls":p,"aria-activedescendant":A[w]?m(w):void 0,className:"site-search-input min-w-0 flex-1 py-4"}),e.jsx("button",{type:"button",onClick:n,"aria-label":o.close,className:"site-search-close inline-flex h-11 w-11 shrink-0 items-center justify-center",children:e.jsx(Fs,{className:"h-5 w-5"})})]}),e.jsx("div",{className:"min-h-32 overflow-y-auto p-2",children:f.trim()?A.length===0?e.jsxs("div",{className:"flex min-h-28 flex-col items-center justify-center px-5 text-center",children:[e.jsx("p",{className:"site-search-note","data-strong":"",children:o.noResults}),e.jsx("p",{className:"site-search-note mt-1",children:o.noResultsHint})]}):e.jsx("ul",{id:p,role:"listbox","aria-label":o.results,children:A.map((k,T)=>{const P=T===w;return e.jsx("li",{children:e.jsxs("button",{ref:P?b:void 0,id:m(T),type:"button",role:"option","aria-selected":P,onMouseEnter:()=>S(T),onFocus:()=>S(T),onClick:()=>C(T),className:"site-search-result flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left",children:[e.jsxs("span",{className:"min-w-0 flex-1",children:[e.jsxs("span",{className:"flex min-w-0 items-baseline gap-2",children:[e.jsx("span",{className:"truncate text-sm font-medium",children:e.jsx(qe,{text:k.title,ranges:i(k.title,f)})}),k.context&&e.jsx("span",{className:"site-search-context truncate",children:e.jsx(qe,{text:k.context,ranges:i(k.context,f)})})]}),k.snippet&&e.jsx("span",{className:"site-search-snippet mt-1 line-clamp-2",children:e.jsx(qe,{text:k.snippet,ranges:i(k.snippet,f)})})]}),e.jsx(qs,{className:"site-search-arrow h-4 w-4 shrink-0"})]})},k.key)})}):e.jsxs("div",{className:"flex min-h-28 flex-col items-center justify-center px-5 text-center",children:[e.jsx(nn,{className:"site-search-empty-glyph h-6 w-6"}),e.jsx("p",{className:"site-search-note mt-3",children:o.start})]})}),e.jsx("div",{className:"site-search-foot hidden px-4 py-2 sm:block",children:o.keyboardHint})]})}):null}function Jn({item:a,nested:n,renderLink:t,onNavigate:s}){return t({href:a.href,onClick:s,"aria-current":a.active?"page":void 0,"data-nested":n||void 0,className:`site-rail-link py-1 ${n?"pl-6":"pl-3"}`,children:a.label})}function Ei({label:a,sections:n,renderLink:t,onNavigate:s,search:i}){return e.jsxs("nav",{"aria-label":a,className:"site-sidebar text-sm",children:[i&&e.jsx(Dt,{label:i.label,shortcut:i.shortcut,onOpen:i.onOpen}),n.map(r=>e.jsxs("div",{className:"mb-6",children:[e.jsx("p",{className:"site-eyebrow ui-eyebrow mb-2",children:r.title}),e.jsx("ul",{className:"site-rail-list site-rail-tight",children:r.items.map(o=>e.jsxs("li",{children:[e.jsx(Jn,{item:o,nested:!1,renderLink:t,onNavigate:s}),o.children&&e.jsx("ul",{className:"site-rail-tight",children:o.children.map(l=>e.jsx("li",{children:e.jsx(Jn,{item:l,nested:!0,renderLink:t,onNavigate:s})},l.id))})]},o.id))})]},r.id))]})}const _t=d.createContext(null);function Mi({labels:a,children:n}){const t=d.useRef(null),s=d.useRef(null),i=d.useRef(null),r=d.useRef(!1),[o,l]=d.useState(null),c=d.useId(),u=d.useId();d.useLayoutEffect(()=>{const g=t.current;o===null||!g||g.open||(g.showModal(),s.current?.focus())},[o]);const p=d.useCallback((g,x)=>{i.current=x,l(g)},[]),m=()=>t.current?.close();return e.jsxs(_t.Provider,{value:p,children:[n,e.jsx("dialog",{ref:t,"aria-labelledby":c,"aria-describedby":u,className:"site-leave m-auto w-[calc(100%-2rem)] max-w-sm text-left",onClose:()=>{l(null),i.current?.focus({preventScroll:!0})},onPointerDown:g=>{r.current=g.target===g.currentTarget},onClick:g=>{g.target===g.currentTarget&&r.current&&m()},children:e.jsxs("div",{className:"site-leave-body",children:[e.jsx("h2",{id:c,className:"text-base font-semibold tracking-tight",children:a.title}),e.jsxs("div",{id:u,className:"site-leave-text mt-2 text-sm leading-6",children:[e.jsx("p",{children:a.body}),e.jsx("p",{className:"site-leave-href mt-1.5 font-mono text-xs leading-5 break-all",children:o})]}),e.jsxs("div",{className:"mt-5 flex flex-wrap justify-end gap-2",children:[e.jsx("button",{ref:s,type:"button",onClick:m,className:"site-leave-cancel inline-flex h-9 items-center justify-center px-4 text-sm font-medium",children:a.cancel}),e.jsxs("a",{href:o??void 0,target:"_blank",rel:"noopener noreferrer",onClick:m,className:"site-leave-open inline-flex h-9 items-center justify-center gap-1.5 px-4 text-sm font-semibold",children:[a.open,e.jsx(Ws,{className:"h-3.5 w-3.5"})]})]})]})})]})}function zi({href:a,className:n,title:t,"aria-label":s,children:i}){const r=d.useContext(_t),o=l=>{r&&(l.preventDefault(),r(a,l.currentTarget))};return e.jsx("a",{href:a,target:"_blank",rel:"noopener noreferrer",className:n,title:t,"aria-label":s,onClick:o,onAuxClick:l=>{l.button===1&&o(l)},children:i})}const Li=/^\[!(\w+)\]([-+]?)[ \t]*(.*)$/;function Ii(){return a=>{$t(a)}}function $t(a){if(a.children)for(const n of a.children)n.type==="blockquote"&&Ri(n),$t(n)}function Ri(a){const n=a.children?.[0],t=n?.type==="paragraph"?n.children?.[0]:void 0;if(!n||t?.type!=="text"||typeof t.value!="string")return;const[s="",...i]=t.value.split(`
`),r=Li.exec(s);if(!r)return;const[,o="",l="",c=""]=r,u=o.toLowerCase(),p=l==="-"||l==="+",m=i.join(`
`);m?t.value=m:(n.children=n.children?.slice(1),n.children?.length===0&&(a.children=a.children?.slice(1))),a.children=[{type:"calloutTitle",children:[{type:"text",value:c.trim()||u.toUpperCase()}],data:{hName:p?"summary":"p",hProperties:{className:"callout-title"}}},...a.children??[]],a.data={hName:p?"details":"aside",hProperties:{className:`callout callout-${u}`,...l==="+"?{open:!0}:{}}}}const Hi=/(?:^|\s)tab="([^"]+)"/;function Pi(){return a=>{Ft(a)}}function Bi(a){if(a.type==="code")return Hi.exec(a.meta??"")?.[1]}function Ft(a){if(!a.children)return;const n=[];let t=[],s=[];const i=()=>{t.length!==0&&(n.push({type:"tabGroup",children:t,data:{hName:"div",hProperties:{className:"md-tabs","data-tab-labels":JSON.stringify(s)}}}),t=[],s=[])};for(const r of a.children){const o=Bi(r);if(o!==void 0){t.push(r),s.push(o);continue}i(),Ft(r),n.push(r)}i(),a.children=n}const Oi={h2:({children:a})=>e.jsx("h2",{id:an(Ae(a)),className:"scroll-mt-20",children:a}),h3:({children:a})=>e.jsx("h3",{id:an(Ae(a)),className:"scroll-mt-20",children:a}),pre:({node:a,children:n})=>{const{code:t,language:s}=ui(a);return t?e.jsx(wi,{code:t,language:s}):e.jsx("pre",{children:n})},div:({node:a,className:n,children:t,...s})=>{if(n!=="md-tabs")return e.jsx("div",{className:n,...s,children:t});const i=mi(a?.properties?.["data-tab-labels"]);return i.length===0?e.jsx("div",{className:n,children:t}):e.jsx(ki,{labels:i,children:t})}},Di=[...Nt,Pi,Ii];function _i({children:a,variant:n,remarkPlugins:t=Nt,rehypePlugins:s,components:i,highlight:r,className:o=""}){const l=d.useMemo(()=>({...Oi,...i}),[i]);return e.jsx("div",{className:`site-prose ${o}`,"data-variant":n,children:e.jsx(Ot.Provider,{value:r??null,children:e.jsx(ga,{remarkPlugins:t,rehypePlugins:s,components:l,children:a})})})}const $i=1e3;let sn=0;const rn=new Set;function Fi(a){a.addEventListener("resize",n=>{if(!(Date.now()>sn)){sn=0,n.stopImmediatePropagation();for(const t of rn)t()}},!0)}function qi(a){return rn.add(a),()=>{rn.delete(a)}}function Wi(){sn=Date.now()+$i}const Gi=`/**
 * Console (\`geek\`) — as plain as a terminal. The interface and its reading text are set in IBM
 * Plex Sans; JetBrains Mono is kept for code and for the marks that are technical on purpose —
 * the status-line tags, a step's label, a chart's axis labels. Paper-white light
 * and warm near-black dark with no fill on a card or a row (a card is the page), one accent —
 * black and white by default, the interface orange and five terminal hues as presets — square
 * corners everywhere, no shadow anywhere, hairlines only where they carry structure, a
 * ruled full-bleed window, a standalone frame a plain hairline box, the selected navigation row
 * set in the bold cut, a block caret, motion that jumps in steps, and the agent's work rendered
 * as a transcript — \`└\` steps, mono capitals. References: opencode.ai (the paper and the warm
 * black, the ruled column, the underline tabs, the calm dark), e2b.dev (the orange, the square
 * shapes, the stepped signals), claude.dev's blog (the tree, the progress line, the near-boxless
 * dark) and a Linux console (the owner's ask of 2026-09-29: as minimal as possible, no
 * decoration).
 *
 * Status of each group:
 * - Light is opencode's paper (\`#fdfcfc\` page, \`rgb(29 29 31)\` ink, \`rgb(100 98 98)\` muted),
 *   stepped one shade so cards read as a lighter step on the page; dark is opencode's warm
 *   near-black (\`#131010\`) with the same steps upward, and its ink set calm but not dim
 *   (2026-09-29): the body at about 12:1 on the canvas, the near-white kept for headings, the
 *   muted ink about 6.2:1 and the subtle 4.7:1 on the muted surface — a first pass at
 *   opencode's \`rgb(184 178 178)\` (8.7:1) read too dim to the owner. The theme's own accent is
 *   monochrome (owner's call, 2026-09-30): the ink in light under a white label, a warm
 *   near-white in dark under black ink, as every dark fill here takes; E2B's orange, the accent
 *   the theme shipped with, stays as its first preset. The rest of the family derives from
 *   \`--ui-accent\` (hover and active shaded, the wash and the line at an alpha), so a preset sets
 *   the one value per mode.
 * - Semantic tones are a hairline and its ink on E2B's code hues, with no tint (a badge is a
 *   ruled word, never a coloured shape), tuned so every tone reads at 4.5:1 as text on the page
 *   and 3:1 as a mark on every surface; the line and the solid fill of a tone are its ink,
 *   declared once; dark danger is lifted to \`#ff5252\` so it reads on the warm black.
 * - Fonts (owner's call, 2026-09-30): IBM Plex Sans is the main face — navigation, controls,
 *   labels, headings and reading text alike — and JetBrains Mono the mono face, with Noto Sans
 *   SC behind both for Han (\`fonts/geek.css\`; JetBrains Mono is declared once for every theme in
 *   \`fonts/github.css\`). The mono face is kept for code and for the few marks that are technical
 *   on purpose, each named in its recipe below; everywhere else the sans takes over from the
 *   monospaced chrome (Commit Mono) the theme had before. The Plex Sans Condensed face the old
 *   uppercase h1 used is still declared and no longer named here; drop its dependency with the
 *   next install.
 * - Radius is 0 everywhere, badges, counters, avatars and controls included (\`--ui-radius-pill\`
 *   and \`--ui-radius-control\` are 0). State dots and the switch knob stay round and the switch
 *   track stays a pill: those components use Tailwind's literal \`rounded-full\`, which no token
 *   re-points.
 * - Density and type are Console's own: a 0.225rem space unit (10% under Tailwind's 0.25rem, so
 *   every \`h-8\` and \`px-2\` shrinks with it) and a 0.8125rem body rung. Medium weight is 400 and
 *   strong the 700 cut: the recipes emphasise with colour, not with a middle weight.
 * - Lines and fills (2026-09-29): a rule is drawn only where it carries structure, and a fill
 *   nowhere but a hover. The window's columns are ruled off each other and a standalone frame
 *   keeps a plain hairline box (the earlier TUI head — the title standing in the top rule — was
 *   decoration and went); a frame that holds a tree or sits in one gives its box up, a tree row
 *   hangs off a \`└\` alone (no \`│\` between siblings — the indent already says the level), an
 *   overlay's own 1px line is its edge (no ring around it), a step of the agent's work is a bare
 *   row, and the card surface is the page itself.
 *
 * Shape of the file (the same in every theme): one \`@layer ui-theme\` block holding the base rule,
 * which defines every name in tokens.ts in its group order with its light value, after the gray
 * bridge that re-points Tailwind's \`--color-gray-*\` / \`--color-white\` so the app's existing
 * palette classes follow the theme; the dark rule, which declares only what dark changes (the
 * rest keeps its base value, since this file comes after \`github.css\` and so its base rule beats
 * that file's dark rule); and then this theme's recipes for the style hooks (hooks.ts). After it,
 * one \`@layer ui-accent\` block with the theme's own accent presets.
 */
@layer ui-theme {
  /* Light: paper. */
  :root[data-theme="geek"] {
    /* Tailwind bridge. white = the surface. */
    --color-white: var(--ui-surface);
    --color-gray-50: #fbfafa;
    --color-gray-100: #f4f2f2;
    --color-gray-200: #e6e3e3;
    --color-gray-300: #d3cfcf;
    --color-gray-400: #8f8b8b;
    --color-gray-500: #5f5c5c;
    --color-gray-600: #4d4a4a;
    --color-gray-700: #383535;
    --color-gray-800: #282525;
    --color-gray-900: #1d1d1f;
    --color-gray-950: #131010;

    /* Colour — surfaces: the page is paper, and a card or an overlay is the page too — a
       hairline, not a fill, sets it apart; only a hover and an inset (a code block) step off it */
    --ui-canvas: #fbfafa;
    --ui-surface: var(--ui-canvas);
    --ui-surface-muted: #f4f2f2;
    --ui-fill-neutral: var(--color-gray-100);
    --ui-inset: #f0eeee;
    --ui-overlay: var(--ui-canvas);
    --ui-overlay-backdrop: rgb(19 16 16 / 0.28);

    /* Colour — text. A link is the ink, underlined by the markup; it takes the accent on hover
       (under the black-and-white default that is the ink again — the underline is the link). */
    --ui-fg: #1d1d1f;
    --ui-fg-emphasis: var(--ui-fg);
    --ui-fg-muted: #5f5c5c;
    --ui-fg-subtle: #8f8b8b;
    --ui-fg-link: var(--ui-fg);
    --ui-fg-link-hover: var(--ui-accent);

    /* Colour — lines */
    --ui-line: #e6e3e3;
    --ui-line-muted: #efeded;
    --ui-line-emphasis: #bdb8b8;
    --ui-divider: #efeded;

    /* Colour — accent: the ink itself under a white label — the default is black and white,
       and a hue is a preset. The family derives from it: hover and active shade toward black
       (away from the white label, so they only gain contrast; on the ink the step is slight,
       and a fill that barely moves is this theme's way), the wash and the line are the accent
       at an alpha. A preset sets \`--ui-accent\` alone; its label ink is the theme's for the
       mode. */
    --ui-accent: #1d1d1f;
    --ui-accent-hover: color-mix(in srgb, var(--ui-accent) 86%, #000000);
    --ui-accent-active: color-mix(in srgb, var(--ui-accent) 74%, #000000);
    --ui-accent-fg: #ffffff;
    --ui-accent-muted: color-mix(in srgb, var(--ui-accent) 10%, transparent);
    --ui-accent-line: color-mix(in srgb, var(--ui-accent) 50%, transparent);

    /* Colour — semantic tones: a hairline and its ink, no tint — a badge is a ruled word on the
       page. A tone's line and its solid fill are its ink, so each tone is two values per mode
       (ink, the fill's label); neutral's line is the plain line and its fill a mid grey. */
    --ui-tone-success-fg: #4d6000;
    --ui-tone-success-bg: transparent;
    --ui-tone-success-line: var(--ui-tone-success-fg);
    --ui-tone-success-emphasis: var(--ui-tone-success-fg);
    --ui-tone-success-emphasis-fg: #ffffff;
    --ui-tone-attention-fg: #7d6300;
    --ui-tone-attention-bg: transparent;
    --ui-tone-attention-line: var(--ui-tone-attention-fg);
    --ui-tone-attention-emphasis: var(--ui-tone-attention-fg);
    --ui-tone-attention-emphasis-fg: #ffffff;
    --ui-tone-danger-fg: #ad2000;
    --ui-tone-danger-bg: transparent;
    --ui-tone-danger-line: var(--ui-tone-danger-fg);
    --ui-tone-danger-emphasis: var(--ui-tone-danger-fg);
    --ui-tone-danger-emphasis-fg: #ffffff;
    --ui-tone-done-fg: #9a0fa4;
    --ui-tone-done-bg: transparent;
    --ui-tone-done-line: var(--ui-tone-done-fg);
    --ui-tone-done-emphasis: var(--ui-tone-done-fg);
    --ui-tone-done-emphasis-fg: #ffffff;
    --ui-tone-neutral-fg: var(--ui-fg-muted);
    --ui-tone-neutral-bg: transparent;
    --ui-tone-neutral-line: var(--ui-line);
    --ui-tone-neutral-emphasis: #5f5c5c;
    --ui-tone-neutral-emphasis-fg: #ffffff;
    --ui-tone-info-fg: #003ee9;
    --ui-tone-info-bg: transparent;
    --ui-tone-info-line: var(--ui-tone-info-fg);
    --ui-tone-info-emphasis: var(--ui-tone-info-fg);
    --ui-tone-info-emphasis-fg: #ffffff;

    /* Colour — marks: the update dot in the bright terminal red of the dark page's danger ink,
       one value on paper and on black */
    --ui-mark-new: #ff5252;

    /* Charts: terminal hues in the roles (indigo, ochre, cobalt, crimson, phosphor, magenta,
       cyan, orange — the presets' own hues, deep enough for paper), the reference curve in the
       muted ink, the token-kind blues, and a plotter's geometry — thin solid bars with square
       tops outlined 1px in the ink, 1px lines directly connecting points, small square points, next
       to no fill under a line. */
    --ui-chart-1: #5b3fd6;
    --ui-chart-2: #a87d00;
    --ui-chart-3: #2f6bd8;
    --ui-chart-4: #c8123f;
    --ui-chart-5: #1f7a1f;
    --ui-chart-6: #b0177e;
    --ui-chart-7: #0e7490;
    --ui-chart-8: #d24b1f;
    --ui-chart-ref: var(--ui-fg-muted);
    --ui-chart-cache-read: #9ab8f6;
    --ui-chart-cache-write: #3d74ec;
    --ui-chart-output: #0030b5;
    --ui-chart-grid: #efeded;
    --ui-chart-axis: #8f8b8b;
    --ui-chart-bar-fill: 0.38;
    --ui-chart-bar-radius: 0px;
    --ui-chart-line-width: 1px;
    --ui-chart-point-radius: 2px;
    --ui-chart-curve: linear;
    --ui-chart-area-opacity: 0.06;
    --ui-chart-bar-stroke: 1px;
    --ui-chart-bar-stroke-color: var(--ui-fg);
    --ui-chart-bar-opacity: 1;

    /* Colour — code (E2B light code hues live in the Shiki theme, W5) */
    --ui-code-bg: #f4f2f2;
    --ui-code-line: #e6e3e3;
    --ui-code-gutter: #8f8b8b;
    --ui-code-selection: color-mix(in srgb, var(--ui-accent) 14%, transparent);
    --ui-diff-add-bg: rgb(77 96 0 / 0.08);
    --ui-diff-add-word: rgb(77 96 0 / 0.2);
    --ui-diff-del-bg: rgb(173 32 0 / 0.07);
    --ui-diff-del-word: rgb(173 32 0 / 0.18);
    --ui-diff-hunk-bg: rgb(0 62 233 / 0.06);

    /* Shape: square. Emphasis is carried by colour, never by a thicker line. */
    --ui-radius-xs: 0;
    --ui-radius-sm: 0;
    --ui-radius-md: 0;
    --ui-radius-lg: 0;
    --ui-radius-xl: 0;
    --ui-radius-pill: 0;
    --ui-radius-control: 0;
    --ui-border-w: 1px;
    --ui-border-w-thick: 1px;

    /* Elevation: layering, not shadow. Every overlay, drawer and modal card draws its own 1px
       line, and that line is its edge — no ring around it, which would double the rule. Zero
       shadows are \`0 0 #0000\`, not \`none\`, which would break Tailwind's shadow list. */
    --ui-shadow-flat: 0 0 #0000;
    --ui-shadow-raised: 0 0 #0000;
    --ui-shadow-overlay: 0 0 #0000;
    --ui-shadow-modal: 0 0 #0000;
    --ui-shadow-drawer: 0 0 #0000;
    --ui-glass-bg: var(--ui-overlay);
    --ui-glass-blur: 0px;
    --ui-glass-saturate: 1;
    --ui-glass-line: var(--ui-line);

    /* Shell: full bleed. Both columns are the page, one hairline between them, no inset, no
       corner, no shadow. Every value is a reference or a zero, so dark needs no second copy. */
    --ui-shell-field: var(--ui-canvas);
    --ui-shell-nav-bg: var(--ui-canvas);
    --ui-shell-main-bg: var(--ui-canvas);
    --ui-shell-line: var(--ui-line);
    --ui-shell-gap: 0px;
    --ui-shell-radius: 0px;
    --ui-shell-shadow: 0 0 #0000;

    /* Structure: a tree indents 1rem per level from the row inset, and its connector rules take
       the emphasis line so \`└\` reads on paper and on the warm black alike; a field is a table row
       with a 10rem label column and three quarters of a rem before the value. */
    --ui-tree-inset: 0.625rem;
    --ui-tree-indent: 1rem;
    --ui-tree-guide: var(--ui-line-emphasis);
    --ui-field-label-w: 10rem;
    --ui-field-gap: 0.75rem;

    /* Controls: the switch's off track is the line, its knob the muted ink (5:1 on the track);
       on the accent the knob takes the accent's label ink. */
    --ui-switch-track: var(--color-gray-200);
    --ui-switch-knob: var(--ui-fg-muted);
    --ui-switch-knob-on: var(--ui-accent-fg);
    --ui-switch-knob-line: rgb(0 0 0 / 0.1);

    /* Badges: one tag. The tones have no tint, so a soft tag draws the same 1px inset rule in its
       tone's line as an outlined one — the two weights are one ruled word, and a solid tag is the
       tone's ink filled in; the regular cut (the weight scale has no middle step to give a tag),
       in the chrome face a step under the small rung (11px on a 16px line at the 16px root); and
       the md tag takes the sm tag's padding, so a row of tags and counts is one height. */
    --ui-badge-soft-ring: 1px;
    --ui-badge-weight: var(--ui-weight-body);
    --ui-badge-pad-md: 1px calc(var(--ui-space-unit) * 1.5);
    --ui-badge-size: 0.6875rem;
    --ui-badge-lh: 1rem;

    /* Typography — families. Latin face first, so ASCII always renders in the theme's face; the
       chrome and reading text share Plex Sans — the chrome reads the sans by name, so a chosen
       Latin face reaches it as in every theme — with Noto behind it for Han, and JetBrains Mono
       is the code face. */
    --ui-font-cjk: "Noto Sans SC Variable", "PingFang SC", "Microsoft YaHei";
    --ui-font-sans:
      "IBM Plex Sans Variable", var(--ui-font-cjk), ui-sans-serif, system-ui, sans-serif;
    --ui-font-mono:
      "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono",
      var(--ui-font-cjk), monospace;
    --ui-font-ui: var(--ui-font-sans);
    --ui-font-display: var(--ui-font-ui);

    /* Typography — scale and roles: a 13px body at the 16px root, 12px small and caption, 16px
       reading text; headings in the chrome face at 700, sentence case, no tracking, and the h6
       group label uppercase with letter-spacing, the one eyebrow rung. */
    --ui-text-body-size: 0.8125rem;
    --ui-text-body-lh: 1.5;
    --ui-text-small-size: 0.75rem;
    --ui-text-small-lh: 1.5;
    --ui-text-caption-size: 0.75rem;
    --ui-text-caption-lh: 1.4;
    --ui-text-code-size: 0.8125rem;
    --ui-text-code-lh: 1.6;
    --ui-text-prose-size: 1rem;
    --ui-text-prose-lh: 1.6;
    --ui-h1-size: 1.75rem;
    --ui-h1-lh: 1.15;
    --ui-h1-weight: 700;
    --ui-h1-tracking: 0;
    --ui-h1-transform: none;
    --ui-h1-font: var(--ui-font-display);
    --ui-h2-size: 1.375rem;
    --ui-h2-lh: 1.2;
    --ui-h2-weight: 700;
    --ui-h2-tracking: 0;
    --ui-h2-transform: none;
    --ui-h2-font: var(--ui-font-ui);
    --ui-h3-size: 1.125rem;
    --ui-h3-lh: 1.3;
    --ui-h3-weight: 700;
    --ui-h3-tracking: 0;
    --ui-h3-transform: none;
    --ui-h3-font: var(--ui-font-ui);
    --ui-h4-size: 1rem;
    --ui-h4-lh: 1.4;
    --ui-h4-weight: 700;
    --ui-h4-tracking: 0;
    --ui-h4-transform: none;
    --ui-h4-font: var(--ui-font-ui);
    --ui-h5-size: 0.875rem;
    --ui-h5-lh: 1.5;
    --ui-h5-weight: 700;
    --ui-h5-tracking: 0;
    --ui-h5-transform: none;
    --ui-h5-font: var(--ui-font-ui);
    --ui-h6-size: 0.75rem;
    --ui-h6-lh: 1.5;
    --ui-h6-weight: 500;
    --ui-h6-tracking: 0.08em;
    --ui-h6-transform: uppercase;
    --ui-h6-font: var(--ui-font-ui);
    --ui-md-h1-size: 1.25rem;
    --ui-md-h2-size: 1.125rem;
    --ui-md-h3-size: 1rem;
    --ui-weight-body: 400;
    --ui-weight-medium: 400;
    --ui-weight-strong: 700;
    --ui-tracking-body: 0;
    --ui-tracking-mono: 0;
    --ui-tracking-label: 0.08em;

    /* Density: a 0.225rem space unit (every Tailwind spacing and size utility shrinks with it),
       tight control, row and menu-row padding, and short stacks. */
    --ui-space-unit: 0.225rem;
    --ui-control-py-sm: 0.1875rem;
    --ui-control-py-md: 0.3125rem;
    --ui-control-py-lg: 0.5rem;
    --ui-control-px-sm: 0.5rem;
    --ui-control-px-md: 0.75rem;
    --ui-control-px-lg: 0.875rem;
    --ui-control-gap-sm: 0.375rem;
    --ui-control-gap-md: 0.5rem;
    --ui-row-py: 0.25rem;
    --ui-row-px: 0.625rem;
    --ui-menu-row-py: 0.375rem;
    --ui-menu-row-px: 0.5rem;
    --ui-card-p: 0.75rem;
    --ui-panel-p: 1rem;
    --ui-stack-0: 0.25rem;
    --ui-stack-1: 0.5rem;
    --ui-stack-2: 0.875rem;
    --ui-stack-3: 1.25rem;
    --ui-stack-4: 2rem;

    /* Motion: colour changes stay quick and smooth (E2B's 100ms held to the 120ms floor every
       theme's state changes share); everything that appears, leaves or resizes jumps. A layer
       enters in three frames over 120ms and leaves in two over 60ms, with no slide, no scale and
       no blur; an appended chunk or row is simply there (a zero reveal — a streaming reply is
       paced by the typewriter below instead); the sidebar's width jumps through four steps;
       the live signals tick. */
    --ui-dur-fast: 120ms;
    --ui-dur-base: 150ms;
    --ui-dur-slow: 260ms;
    --ui-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    --ui-ease-in-out: cubic-bezier(0.215, 0.61, 0.355, 1);
    --ui-ease-spring: cubic-bezier(0.23, 1, 0.32, 1);
    --ui-ease-overlay-in: steps(3, jump-none);
    --ui-ease-overlay-out: steps(2, jump-none);
    --ui-live-timing: steps(2, end);
    --ui-dur-enter: 120ms;
    --ui-dur-exit: 60ms;
    --ui-ease-enter: steps(3, jump-none);
    --ui-ease-exit: steps(2, jump-none);
    --ui-enter-shift: 0px;
    --ui-enter-scale: 1;
    --ui-enter-blur: 0px;
    --ui-dur-reveal: 0ms;
    --ui-reveal-blur: 0px;
    --ui-dur-layout: 160ms;
    --ui-ease-layout: steps(4, end);

    /* Streaming: a reply is typed out a character at a time, 90 a second — about one and a
       half characters a frame, so the line visibly runs on behind the block cursor the
       \`ui-stream\` recipe draws, the way a terminal prints. */
    --ui-stream-reveal: typewriter;
    --ui-stream-rate: 90;

    /* Icons: the pixel drawings carry no duotone body (0), and decorative icons are hidden, so
       the hues are declared but unread — the chart palette's terminal hues, with a cool grey
       for slate, each a 3:1 mark on the page */
    --ui-icon-stroke: 1.4;
    --ui-icon-cap: butt;
    --ui-icon-join: miter;
    --ui-icon-duo-opacity: 0;
    --ui-icon-tint-blue: #2f6bd8;
    --ui-icon-tint-violet: #5b3fd6;
    --ui-icon-tint-pink: #b0177e;
    --ui-icon-tint-red: #c8123f;
    --ui-icon-tint-orange: #d24b1f;
    --ui-icon-tint-amber: #a87d00;
    --ui-icon-tint-green: #1f7a1f;
    --ui-icon-tint-teal: #0e7490;
    --ui-icon-tint-slate: #5c6470;

    /* Focus, selection and scrollbar: a 1px accent outline off the edge; always-visible square
       thumbs on a tinted track. */
    --ui-focus-ring: 1px solid var(--ui-accent);
    --ui-focus-ring-offset: 2px;
    --ui-focus-ring-input: inset 0 0 0 1px var(--ui-accent);
    --ui-selection-bg: color-mix(in srgb, var(--ui-accent) 18%, transparent);
    --ui-scrollbar-w: thin;
    --ui-scrollbar-thumb: #d3cfcf;
    --ui-scrollbar-thumb-hover: #bdb8b8;
    --ui-scrollbar-track: #f4f2f2;
    --ui-scrollbar-visibility: always;
  }

  /* Dark: opencode's warm near-black, with the ink set calm. */
  :root[data-theme="geek"].dark {
    /* Tailwind bridge: 950 keeps the base's canvas value, 900 raised, 800 hover / panel line,
       700 control line, then the ink ramp — 500 subtle, 400 muted, 100 body, 50 the near-white
       for headings. white stays literal: \`dark:*-white/N\` hairlines read it as ink. */
    --color-white: #ffffff;
    --color-gray-50: #f3f1f0;
    --color-gray-100: #d9d4d3;
    --color-gray-200: #c5c0bf;
    --color-gray-300: #b4afae;
    --color-gray-400: #a39e9d;
    --color-gray-500: #8d8887;
    --color-gray-600: #5a5453;
    --color-gray-700: #2f2b2b;
    --color-gray-800: #242020;
    --color-gray-900: var(--ui-canvas);

    /* Colour — surfaces: the warm black is the page, the card and the overlay alike; a hover
       steps up, an inset steps down */
    --ui-canvas: #131010;
    --ui-surface-muted: #221f1f;
    --ui-fill-neutral: var(--color-gray-800);
    --ui-inset: #0d0b0b;
    --ui-overlay-backdrop: rgb(0 0 0 / 0.6);

    /* Colour — text: body about 12:1 on the canvas, headings and links near-white, muted about
       6.2:1 and subtle 4.7:1 on the muted surface */
    --ui-fg: var(--color-gray-100);
    --ui-fg-emphasis: var(--color-gray-50);
    --ui-fg-muted: var(--color-gray-400);
    --ui-fg-subtle: var(--color-gray-500);
    --ui-fg-link: var(--ui-fg-emphasis);

    /* Colour — lines */
    --ui-line: #2f2b2b;
    --ui-line-muted: #242020;
    --ui-line-emphasis: #5a5453;
    --ui-divider: #242020;

    /* Colour — accent: a warm near-white with black ink, as every dark fill here takes, so
       hover shades toward white and active toward black — away from the ink, as in light — and
       the wash and the line strengthen a step on the dark page. */
    --ui-accent: #f4f2f2;
    --ui-accent-hover: color-mix(in srgb, var(--ui-accent) 86%, #ffffff);
    --ui-accent-active: color-mix(in srgb, var(--ui-accent) 90%, #000000);
    --ui-accent-fg: #000000;
    --ui-accent-muted: color-mix(in srgb, var(--ui-accent) 16%, transparent);
    --ui-accent-line: color-mix(in srgb, var(--ui-accent) 60%, transparent);

    /* Colour — semantic tones: E2B's code hues; fills take black ink. The lines, the fills and
       the absent tints follow the base rule. */
    --ui-tone-success-fg: #9dc20c;
    --ui-tone-success-emphasis-fg: #000000;
    --ui-tone-attention-fg: #f2c230;
    --ui-tone-attention-emphasis-fg: #000000;
    --ui-tone-danger-fg: #ff5252;
    --ui-tone-danger-emphasis-fg: #000000;
    --ui-tone-done-fg: #b57cff;
    --ui-tone-done-emphasis-fg: #000000;
    --ui-tone-neutral-emphasis: #5a5453;
    --ui-tone-info-fg: #5696fd;
    --ui-tone-info-emphasis-fg: #000000;

    /* Charts: the same roles as bright terminal hues on the warm black */
    --ui-chart-1: #9b7bff;
    --ui-chart-2: #f2c230;
    --ui-chart-3: #5696fd;
    --ui-chart-4: #ff5c8a;
    --ui-chart-5: #3ddc84;
    --ui-chart-6: #ff6ac1;
    --ui-chart-7: #22d3ee;
    --ui-chart-8: #ff795b;
    --ui-chart-cache-read: #a8c8fe;
    --ui-chart-cache-write: #5696fd;
    --ui-chart-output: #2059d1;
    --ui-chart-grid: #242020;
    --ui-chart-axis: var(--color-gray-500);

    /* Colour — code */
    --ui-code-bg: #0d0b0b;
    --ui-code-line: #2f2b2b;
    --ui-code-gutter: var(--color-gray-500);
    --ui-code-selection: color-mix(in srgb, var(--ui-accent) 28%, transparent);
    --ui-diff-add-bg: rgb(157 194 12 / 0.1);
    --ui-diff-add-word: rgb(157 194 12 / 0.28);
    --ui-diff-del-bg: rgb(255 82 82 / 0.1);
    --ui-diff-del-word: rgb(255 82 82 / 0.3);
    --ui-diff-hunk-bg: rgb(86 150 253 / 0.1);

    /* Elevation: a glass layer's line steps up so it reads on the dark overlay. */
    --ui-glass-line: var(--ui-line-emphasis);

    /* Controls: the dark off track, and the body ink as the knob on it */
    --ui-switch-track: var(--color-gray-700);
    --ui-switch-knob: var(--ui-fg);

    /* Icons: the hues lifted with the chart palette */
    --ui-icon-tint-blue: #5696fd;
    --ui-icon-tint-violet: #9b7bff;
    --ui-icon-tint-pink: #ff6ac1;
    --ui-icon-tint-red: #ff5c8a;
    --ui-icon-tint-orange: #ff795b;
    --ui-icon-tint-amber: #f2c230;
    --ui-icon-tint-green: #3ddc84;
    --ui-icon-tint-teal: #22d3ee;
    --ui-icon-tint-slate: #9aa3ad;

    /* Focus, selection and scrollbar */
    --ui-selection-bg: color-mix(in srgb, var(--ui-accent) 32%, transparent);
    --ui-scrollbar-thumb: #2f2b2b;
    --ui-scrollbar-thumb-hover: #5a5453;
    --ui-scrollbar-track: #0d0b0b;
  }

  /*
   * Style hooks (hooks.ts). A component opts into a hook with its class; this theme decides what
   * the hook does. These rules sit in \`ui-theme\`, after Tailwind's \`utilities\`, so a hook wins over
   * the utilities its component also carries — that is what lets \`.ui-live\` re-time an
   * \`animate-spin\` and \`.ui-frame\` redraw a card's box.
   *
   * Console gives a recipe to: eyebrow (its ink; the rung is theme.css's), display, live, frame,
   * underline-nav, shell, icon-decor, tree, field, activity, notice, chart, stream, glyph,
   * widget.
   * \`.ui-glass\` and \`.ui-scrim\` are no-ops here: the overlay is opaque through the glass tokens,
   * and the page behind a dialog is dimmed, not blurred.
   */

  /* Group label on the h6 rung (theme.css): the chrome face, uppercase, tracked — and muted. */
  :root[data-theme="geek"] .ui-eyebrow {
    color: var(--ui-fg-muted);
  }

  /* The page's one display title: the chrome face at its bold cut, sentence case, no tracking.
     Han glyphs need a little more leading than the Latin bold. */
  :root[data-theme="geek"] .ui-display {
    font-family: var(--ui-font-ui);
    font-weight: 700;
    text-transform: none;
    letter-spacing: 0;
  }
  :root[data-theme="geek"] .ui-display:lang(zh) {
    line-height: 1.25;
  }

  /* Stepped live signals: the busy dot blinks, the caret is a block, the spinner ticks. */
  :root[data-theme="geek"] .ui-live {
    animation-timing-function: var(--ui-live-timing);
  }
  :root[data-theme="geek"] .ui-live[data-live="dot"] {
    animation: ui-geek-signal 1.25s var(--ui-live-timing) infinite;
  }
  :root[data-theme="geek"] .ui-live[data-live="spinner"] {
    animation-timing-function: steps(8, end);
  }
  :root[data-theme="geek"] .ui-live[data-live="caret"] {
    display: inline-block;
    width: 0.6ch;
    height: 1em;
    vertical-align: text-bottom;
    overflow: hidden;
    background-color: currentColor;
    -webkit-text-fill-color: transparent;
    animation: ui-geek-signal 1s var(--ui-live-timing) infinite;
  }
  @keyframes ui-geek-signal {
    50% {
      opacity: 0.2;
    }
  }

  /* A frame is a plain hairline box on the page: one rule round it, one under its head and over
     its foot, one between panes, no fill of its own, head text in the chrome face. (A first
     pass drew a TUI box with the title standing in the top rule; it was decoration and went.)
     The parts are selected through \`:where()\`, which adds no specificity, so the boxless rules
     further down — a frame that holds a tree or sits in one — can take every part of it back. */
  :root[data-theme="geek"] .ui-frame {
    border: var(--ui-border-w) solid var(--ui-line);
    border-radius: 0;
    background-color: transparent;
  }
  :root[data-theme="geek"] .ui-frame > :where([data-slot="head"]) {
    border-bottom: var(--ui-border-w) solid var(--ui-line);
    background-color: transparent;
    font-family: var(--ui-font-ui);
  }
  :root[data-theme="geek"] .ui-frame > :where([data-slot="foot"]) {
    border-top: var(--ui-border-w) solid var(--ui-line);
  }
  :root[data-theme="geek"] .ui-frame :where([data-slot="pane"] + [data-slot="pane"]) {
    border-left: var(--ui-border-w) solid var(--ui-line);
  }

  /* Tabs: a 2px ink rule under the selected tab, opencode's underline; no hover bar. */
  :root[data-theme="geek"] .ui-underline-nav [role="tab"] {
    position: relative;
    /* The ink rule below is the only marker: the host's own bottom border (and its hover bar)
       gives way. */
    border-bottom-color: transparent;
  }
  :root[data-theme="geek"] .ui-underline-nav [role="tab"]::after {
    content: "";
    position: absolute;
    inset-inline: 0;
    bottom: -1px;
    height: 2px;
    background-color: transparent;
    pointer-events: none;
  }
  :root[data-theme="geek"] .ui-underline-nav [role="tab"][aria-selected="true"]::after {
    background-color: var(--ui-fg);
  }

  /* The app window: full bleed on the page, the navigation column ruled off the main column by
     one hairline (and a dock column, when there is one, ruled off on its other side), no corner
     anywhere, and a \`>\` in the accent before the selected navigation row — a nav entry or the
     open session — standing in the row's own inline padding (two space units, the narrowest
     row's) at the small rung, so the row's content does not move. */
  :root[data-theme="geek"] .ui-shell {
    background-color: var(--ui-shell-field);
    border-radius: 0;
  }
  :root[data-theme="geek"] .ui-shell > [data-slot="nav"] {
    background-color: var(--ui-shell-nav-bg);
    border-inline-end: var(--ui-border-w) solid var(--ui-shell-line);
  }
  :root[data-theme="geek"] .ui-shell > [data-slot="main"] {
    background-color: var(--ui-shell-main-bg);
  }
  :root[data-theme="geek"] .ui-shell > [data-slot="dock"] {
    border-inline-start: var(--ui-border-w) solid var(--ui-shell-line);
  }
  /* The selected navigation row — a nav entry or the open session — is marked quietly: the
     bold cut over the host's own selected fill, no glyph (a first pass hung an accent \`>\` before
     it; the owner asked for it to go). The bold cut is wider than the regular, but a row's label
     starts the row and is the last thing in its flow (a trailing mark is positioned), so it
     grows only toward the row's free end, and a label that fills the row truncates a little
     earlier; nothing else in the row moves. */
  :root[data-theme="geek"] .ui-shell [data-slot="nav"] [aria-current="page"] {
    font-weight: var(--ui-weight-strong);
  }

  /* Decorative icons are not drawn: a navigation row is its label, a group header its eyebrow, a
     menu row its verb, and the selected row is marked by its weight alone. Icons that carry
     information (status marks, file kinds, tool glyphs, avatars) never take the hook and stay. */
  :root[data-theme="geek"] .ui-icon-decor {
    display: none;
  }

  /* Icons are pixel drawings: every glyph that has one (the registry's and the marks') shows its
     16x16 drawing on crisp edges in place of the line drawing, the way claude.dev draws its
     marks. From a 13px box up the drawing keeps one cell to a CSS pixel and may spill a pixel or
     two past the box, so the box must not clip it. */
  :root[data-theme="geek"] .ui-glyph {
    overflow: visible;
  }
  :root[data-theme="geek"] .ui-glyph > [data-set="line"] {
    display: none;
  }
  :root[data-theme="geek"] .ui-glyph > [data-set="pixel"] {
    display: inline;
  }

  /* Nested rows hang off \`└\` elbows, the way claude.dev prints its tree, and the box goes: the
     host's border, fill, corner and shadow turn off, and so do the rules it draws between its
     rows. Each row past the roots indents on the tree tokens and draws one elbow on its parent's
     column, half an indent before its own content — a rule from the row's top to its middle
     with a short tick at the end. No \`│\` runs between siblings and none continues alongside a
     branch: the indent already says the level, and every rule not drawn is a line less. Nothing
     here is a glyph in the markup. */
  :root[data-theme="geek"] .ui-tree {
    border-color: transparent;
    border-radius: 0;
    background-color: transparent;
    box-shadow: none;
  }
  :root[data-theme="geek"] .ui-tree > [data-depth],
  :root[data-theme="geek"] .ui-tree > [data-branch] {
    border-color: transparent;
  }
  :root[data-theme="geek"] .ui-tree [data-depth]:not([data-branch]) {
    position: relative;
    padding-inline-start: calc(var(--ui-tree-inset) + var(--ui-tree-indent) * var(--_depth));
  }
  :root[data-theme="geek"] .ui-tree [data-depth]:not([data-branch], [data-depth="0"])::before {
    content: "";
    position: absolute;
    top: 0;
    height: 50%;
    inset-inline-start: calc(var(--ui-tree-inset) + var(--ui-tree-indent) * (var(--_depth) - 0.5));
    width: calc(var(--ui-tree-indent) * 0.5 - 0.1875rem);
    border-inline-start: var(--ui-border-w) solid var(--ui-tree-guide);
    border-bottom: var(--ui-border-w) solid var(--ui-tree-guide);
    pointer-events: none;
  }

  /* A frame headed by a step of the agent's work (a work group, open or collapsed — collapsed
     it has no tree, so the head is what names it) or holding a tree, or sitting inside one (a
     tool card hung off an elbow), gives up the box: no rule on it or on any part (the host's
     own rules between head and body included), so the rows hang off the head, or the card off
     its elbow, by the connector rules alone. A frame standing on its own keeps its box. */
  :root[data-theme="geek"] .ui-frame:has(> .ui-tree, > .ui-activity),
  :root[data-theme="geek"] .ui-tree .ui-frame,
  :root[data-theme="geek"] .ui-frame:has(> .ui-tree, > .ui-activity) > *,
  :root[data-theme="geek"] .ui-tree .ui-frame > * {
    border: 0;
  }

  /* A labelled control row is a table row: a fixed label column, the control left-aligned in the
     next column at its own width (a switch, a segmented control, a group of selects), the hint
     under the control. The label keeps the host's offset onto the row's first line and may wrap
     in its fixed column, its first line still on the control's; rows separate by the host's own
     rules, so a page of them reads like a table. */
  :root[data-theme="geek"] .ui-field {
    display: grid;
    grid-template-columns: var(--ui-field-label-w) minmax(0, 1fr);
    column-gap: var(--ui-field-gap);
    row-gap: var(--ui-stack-0);
    align-items: start;
  }
  :root[data-theme="geek"] .ui-field > [data-slot="label"] {
    grid-row: 1;
    grid-column: 1;
    min-width: 0;
    white-space: normal;
  }
  :root[data-theme="geek"] .ui-field > [data-slot="control"] {
    grid-row: 1;
    grid-column: 2;
    justify-content: flex-start;
    min-width: 0;
    max-width: 100%;
  }
  :root[data-theme="geek"] .ui-field > [data-slot="hint"] {
    grid-column: 2;
  }

  /* Work in progress, as a transcript (claude.dev's tree and progress line): the row is no box —
     no border, no corner, no shadow, and the rule a list draws above it goes with the border —
     its label is the mono face at the small rung, uppercase and tracked like an eyebrow, muted
     once the step is done and the body ink while it runs (the danger ink when it failed), the
     detail (a path, an argument preview, a duration) is muted in the host's own face (the host
     sets a duration or a step count in mono and a description in the sans). The progress slot
     stays hidden, as the host leaves it: the spinner and the ticking duration already say a step
     is running (the owner dropped the block bar, 2026-09-30). A step in a work group hangs off
     the \`└\` its tree row draws, so no connector is added here. The slots are found anywhere
     inside the row (a card nests them in its own button). */
  :root[data-theme="geek"] .ui-activity {
    border-color: transparent;
    border-radius: 0;
    box-shadow: none;
  }
  /* In a boxless work group the header and the rows are painted in the page's own colour: they
     stick while their bodies scroll, so they must stay opaque, and on the page that fill is
     invisible in every state. A row inside a frame that keeps its box keeps its own fill. */
  :root[data-theme="geek"] .ui-frame:has(> .ui-tree, > .ui-activity) > [data-slot="head"],
  :root[data-theme="geek"] .ui-tree .ui-activity {
    background-color: var(--ui-canvas);
  }
  /* A hover changes the ink alone — the label steps up to the body ink — so the group looks the
     same at rest, hovered, open and stuck; no fill moves. Only a row that does something answers
     the pointer: a harness note or a server with nothing to open stays as it is. */
  :root[data-theme="geek"]
    .ui-frame:has(> .ui-tree, > .ui-activity)
    > [data-slot="head"]:is(button, :has(button)):hover
    [data-slot="label"],
  :root[data-theme="geek"]
    .ui-tree
    .ui-activity:is(button, :has(button)):hover
    [data-slot="label"] {
    color: var(--ui-fg);
  }
  :root[data-theme="geek"] .ui-activity [data-slot="label"] {
    font-family: var(--ui-font-mono);
    font-size: var(--ui-text-small-size);
    font-weight: var(--ui-weight-body);
    letter-spacing: var(--ui-tracking-label);
    text-transform: uppercase;
    color: var(--ui-fg-muted);
  }
  :root[data-theme="geek"] .ui-activity[data-state="running"] [data-slot="label"] {
    color: var(--ui-fg);
  }
  :root[data-theme="geek"] .ui-activity[data-state="error"] [data-slot="label"] {
    color: var(--ui-tone-danger-fg);
  }
  /* Folds: the leading mark is the fold — ▸ closed, ▾ open, in the row's state ink (subtle when
     settled, danger on error). While the row runs its spinner stays; the
     chevrons go. */
  :root[data-theme="geek"] .ui-activity :is([data-slot="toggle"], [data-slot="toggle-end"]) {
    display: none;
  }
  :root[data-theme="geek"]
    .ui-activity:has([data-slot="toggle"]):not([data-state="running"])
    [data-slot="mark"]
    > * {
    display: none;
  }
  :root[data-theme="geek"]
    .ui-activity:has([data-slot="toggle"]):not([data-state="running"])
    [data-slot="mark"]::before {
    content: "▸";
    display: inline-block;
    width: 1em;
    line-height: 1;
    text-align: center;
    color: var(--ui-fg-subtle);
  }
  :root[data-theme="geek"]
    :is(.ui-activity[aria-expanded="true"], .ui-activity:has(> [aria-expanded="true"])):has(
      [data-slot="toggle"]
    ):not([data-state="running"])
    [data-slot="mark"]::before {
    content: "▾";
  }
  :root[data-theme="geek"] .ui-activity[data-state="error"] [data-slot="mark"]::before {
    color: var(--ui-tone-danger-fg);
  }
  :root[data-theme="geek"] .ui-activity [data-slot="detail"] {
    font-size: var(--ui-text-small-size);
    color: var(--ui-fg-muted);
  }
  /* A reply still arriving is typed out behind a block cursor, the way a terminal prints (the
     reveal paces it a character at a time): the stream's caret is a solid cell in the body
     ink, one character of the chrome's mono face wide, with the host's own glyph painted out.
     While the text so far ends in a paragraph, that paragraph runs in — it lays out inline
     with the caret after it — so the cursor sits right after its last character; after a list
     the last item draws the cell itself (below); after a table or a code block it waits at the
     start of the next line, like a prompt. The cursor
     blinks in the theme's stepped live signal, and nothing else moves: no veil, no fade. Under
     reduced motion it holds still (theme.css). */
  :root[data-theme="geek"] .ui-stream[data-state="streaming"] > p:has(+ [data-slot="caret"]) {
    display: inline;
  }
  /* After a list the cursor belongs at the end of its last item, not on a line of its own: the
     item draws the block cell itself, and the host's caret slot steps aside. */
  :root[data-theme="geek"]
    .ui-stream[data-state="streaming"]
    > :is(ul, ol):has(+ [data-slot="caret"])
    > li:last-child::after {
    content: "";
    display: inline-block;
    inline-size: 1ch;
    block-size: 1.2em;
    margin-inline-start: 1px;
    vertical-align: text-bottom;
    background-color: var(--ui-fg);
    animation: ui-geek-signal 1s var(--ui-live-timing) infinite;
  }
  :root[data-theme="geek"] .ui-stream[data-state="streaming"] > :is(ul, ol) + [data-slot="caret"] {
    display: none;
  }
  :root[data-theme="geek"] .ui-stream > [data-slot="caret"] {
    display: inline-block;
    inline-size: 1ch;
    block-size: 1.2em;
    vertical-align: text-bottom;
    overflow: hidden;
    font-family: var(--ui-font-ui);
    color: transparent;
    -webkit-text-fill-color: transparent;
    background-color: var(--ui-fg);
    animation: ui-geek-signal 1s var(--ui-live-timing) infinite;
  }

  /* A notice is a status line, the way a console prints one: a bracketed tone tag in the tone's
     ink — \`[ OK ]\`, \`[WARN]\`, \`[FAIL]\` — in the mono face at the start, the message beside it
     in the reading face, nothing round it, painted in the page's own colour (quiet on the page,
     opaque where a toast floats over content). The tag stands out of the flow — absolutely at
     the row's inset, the host padded for it — because a host lays its body and actions out as a
     flex row, and a tag in the flow would be a third item pushing the body to the middle. Every
     tag is six characters, so in the mono face all five are one width, and the fixed 4rem
     column holds each of them with room to spare. A toast is the same line inside one hairline,
     so it has an edge where it floats. (Two earlier passes — a coloured left rule, then a solid
     tone block — were decoration and went.) */
  :root[data-theme="geek"] .ui-notice {
    position: relative;
    padding-inline-start: calc(4rem + var(--ui-row-px));
    border: 0;
    border-radius: 0;
    background-color: var(--ui-canvas);
    box-shadow: none;
    color: var(--ui-fg);
    font-family: var(--ui-font-sans);
  }
  :root[data-theme="geek"] button.ui-notice {
    border: var(--ui-border-w) solid var(--ui-line-emphasis);
  }
  /* The host's own leading mark gives way to the tag: two marks would say the same thing. */
  :root[data-theme="geek"] .ui-notice [data-slot="icon"] {
    display: none;
  }
  :root[data-theme="geek"] .ui-notice::before {
    content: "[INFO]";
    position: absolute;
    inset-inline-start: var(--ui-row-px);
    inset-block: 0;
    display: flex;
    align-items: center;
    color: var(--_tone-fg);
    font-family: var(--ui-font-mono);
    font-size: var(--ui-text-small-size);
    font-weight: var(--ui-weight-strong);
  }
  :root[data-theme="geek"] .ui-notice[data-tone="success"]::before {
    content: "[ OK ]";
  }
  :root[data-theme="geek"] .ui-notice[data-tone="warning"]::before {
    content: "[WARN]";
  }
  :root[data-theme="geek"] .ui-notice[data-tone="danger"]::before {
    content: "[FAIL]";
  }
  :root[data-theme="geek"] .ui-notice[data-tone="neutral"]::before {
    content: "[NOTE]";
  }

  /* Charts are drawn like a terminal plot: a dashed grid on crisp pixels, axis labels in the
     mono face as tracked capitals, 1px lines with hard joins and ends, square points, and
     thin solid bars outlined in the ink (the tokens say so; an earlier stripe hatch was
     decoration and went). The chart primitives write every colour, width, radius and opacity
     the tokens hold; the recipe owns only what a token cannot: dashes, joins and caps, pixel
     alignment, the label face. A grid line is SVG in the usage charts and an HTML lane track
     in the Trace timeline, so its rule carries both spellings — a dashed stroke, and a dashed
     rule under a lane with no fill — and an engine ignores the one that does not apply. */
  :root[data-theme="geek"] .ui-chart [data-part="grid"] {
    background-color: transparent;
    border-bottom: var(--ui-border-w) dashed var(--ui-line-emphasis);
  }
  /* Dashes and pixel alignment are for the grid's straight rules — the SVG lines, and the HTML
     lane rule above — never the donut's track, a circle that is a grid part too and stays a
     solid ring (dashed it read as stitching; without anti-aliasing it is a staircase). */
  :root[data-theme="geek"] .ui-chart line[data-part="grid"] {
    stroke-dasharray: 2 3;
  }
  :root[data-theme="geek"] .ui-chart line:is([data-part="grid"], [data-part="axis"]) {
    shape-rendering: crispEdges;
  }
  /* The axis part is both the tick text and the axis-break marks: the face rules reach the text
     alone, so a line never picks up a font. */
  :root[data-theme="geek"] .ui-chart text:is([data-part="axis"], [data-part="label"]) {
    font-family: var(--ui-font-mono);
    letter-spacing: var(--ui-tracking-label);
    text-transform: uppercase;
  }
  :root[data-theme="geek"] .ui-chart :is(path, polyline)[data-part="series"] {
    stroke-linejoin: miter;
    stroke-linecap: butt;
  }
  /* A point is a rect the chart rounds to a circle by its \`rx\`; squared off here. */
  :root[data-theme="geek"] .ui-chart [data-part="point"] {
    rx: 0;
    shape-rendering: crispEdges;
  }

  /* Widgets as text-first panels: a hairline box with a ruled head, no fill anywhere, numerals in
     the mono face (a reading is data), the illustration with square caps on crisp edges, and its
     loops stepping (the live timing token) rather than gliding. */
  :root[data-theme="geek"] .ui-widget {
    border: var(--ui-border-w) solid var(--ui-line);
    border-radius: 0;
    background-color: transparent;
  }
  :root[data-theme="geek"] .ui-widget > [data-slot="head"] {
    padding-bottom: calc(var(--ui-space-unit) * 2);
    border-bottom: var(--ui-border-w) solid var(--ui-line);
  }
  :root[data-theme="geek"] .ui-widget [data-tile] {
    border: var(--ui-border-w) solid var(--ui-line);
    border-radius: 0;
    background-color: transparent;
  }
  :root[data-theme="geek"] .ui-widget [data-figure] {
    font-family: var(--ui-font-mono);
    letter-spacing: var(--ui-tracking-mono);
  }
  :root[data-theme="geek"] .ui-widget [data-art] {
    stroke-linecap: butt;
    stroke-linejoin: miter;
    shape-rendering: crispEdges;
  }
}

/*
 * The user's accent presets (tokens.ts, \`ACCENT_PRESETS.geek\`): E2B's orange, the accent the
 * theme shipped with before its own went black and white, then five terminal hues — phosphor
 * green, cyan, magenta, gold, cobalt — each deep in light for the theme's white label and bright
 * in dark for its black ink, the way the theme's dark fills are. A preset sets \`--ui-accent\` and
 * nothing else — hover, active, wash and line derive from it in the theme's rules above, and the
 * label ink is the theme's for the mode — so each preset is one value per mode; the orange holds
 * across modes (black ink on it clears 4.5:1 in dark) and has no dark rule. The selectors match
 * only Console's root, so a preset another theme lists paints nothing here.
 */
@layer ui-accent {
  :root[data-theme="geek"][data-accent="orange"] {
    --ui-accent: #e32a01;
  }
  :root[data-theme="geek"][data-accent="phosphor"] {
    --ui-accent: #1f7a1f;
  }
  :root[data-theme="geek"][data-accent="phosphor"].dark {
    --ui-accent: #3ddc84;
  }
  :root[data-theme="geek"][data-accent="cyan"] {
    --ui-accent: #0e7490;
  }
  :root[data-theme="geek"][data-accent="cyan"].dark {
    --ui-accent: #22d3ee;
  }
  :root[data-theme="geek"][data-accent="magenta"] {
    --ui-accent: #b0177e;
  }
  :root[data-theme="geek"][data-accent="magenta"].dark {
    --ui-accent: #ff6ac1;
  }
  :root[data-theme="geek"][data-accent="gold"] {
    --ui-accent: #8a6d00;
  }
  :root[data-theme="geek"][data-accent="gold"].dark {
    --ui-accent: #f2c230;
  }
  :root[data-theme="geek"][data-accent="cobalt"] {
    --ui-accent: #003ee9;
  }
  :root[data-theme="geek"][data-accent="cobalt"].dark {
    --ui-accent: #5696fd;
  }
}
`,Ui=`/**
 * Primer (\`github\`) — the stylesheet's fallback theme (the product starts a browser in Frost,
 * \`INITIAL_THEME_ID\` in tokens.ts). Reference: github.com and primer.style.
 *
 * W0 status: the LIGHT values are the v0.2.13 look — system font stacks, stock Tailwind gray,
 * emerald / amber / red status tones, the 6px control radius, Tailwind's stock shadow recipes and
 * the 3px gray focus ring. A W1a pass (2026-09-30) moved the faces to Mona Sans and the grays to
 * a zero-chroma neutral; the owner found the result worse than the release and both were
 * withdrawn on 2026-10-02, with the dark adjustment below kept. Values the app had no equivalent
 * for (the \`done\` and \`info\` tones, diff surfaces, glass, the type and density roles) are
 * proposals in the same palette, consumed by nothing yet.
 *
 * Dark is no longer the app's white-on-pure-black inversion (user decision, 2026-09-29): the
 * canvas lifts to #121212, the body ink sits at about 12:1 with the muted ink at 6:1 and the
 * subtle at 4.7:1 (a first pass at 9:1 read too dim), and the near-white is kept for headings
 * and emphasis, the way claude.dev and opencode.ai set their dark pages. The dark rule
 * re-points the whole gray bridge to that ramp, so the app's \`dark:text-gray-*\` classes calm
 * with the tokens.
 *
 * Shape every theme file follows: one \`@layer ui-theme\` block with a base rule and a dark rule,
 * then one \`@layer ui-accent\` block with the theme's own accent presets. The base rule declares
 * every name in tokens.ts, in its group order, with its light value, plus the gray bridge that
 * re-points Tailwind's \`--color-gray-*\` / \`--color-white\` so the app's existing palette classes
 * follow the theme. The dark rule matches the same root and declares only what dark changes,
 * bridge steps included; everything else keeps its base value.
 *
 * This file is the fallback and is imported first, so it also matches <html> with no \`data-theme\`
 * at all. Another theme's base rule outranks this base rule, and ties with this dark rule and wins
 * by coming later, so its dark mode starts from its own base values and never from these; the
 * theme files must therefore be imported in this order (theme.css shows it).
 *
 * Tokens here may read the gray bridge declared in the same block (\`var(--color-gray-500)\`); the
 * bridge itself is always literal, so no reference can cycle. Stock Tailwind colours are copied
 * as their exact \`oklch()\` values from tailwindcss/theme.css — a rounded hex would move pixels.
 *
 * The names added for the theme identities (the space unit, the chrome face, the shell, the
 * presence / reveal / layout motion) carry the values that reproduce today's rendering: Tailwind's
 * stock 0.25rem unit, one face for chrome and reading, no field behind the window, quick fades
 * with a few px of slide. \`.ui-shell\` is a no-op here — the window's look is its own classes.
 */
@layer ui-theme {
  :root,
  :root[data-theme="github"] {
    /* ---- Gray bridge: stock Tailwind v4 gray — the v0.2.13 look, restored 2026-10-02 after a
       neutral pass (W1a) read worse to the owner. The oklch values are tailwindcss/theme.css's.
       ---- */
    --color-white: var(--ui-surface);
    --color-gray-50: oklch(98.5% 0.002 247.839);
    --color-gray-100: oklch(96.7% 0.003 264.542);
    --color-gray-200: oklch(92.8% 0.006 264.531);
    --color-gray-300: oklch(87.2% 0.01 258.338);
    --color-gray-400: oklch(70.7% 0.022 261.325);
    --color-gray-500: oklch(55.1% 0.027 264.364);
    --color-gray-600: oklch(44.6% 0.03 256.802);
    --color-gray-700: oklch(37.3% 0.034 259.733);
    --color-gray-800: oklch(27.8% 0.033 256.848);
    --color-gray-900: oklch(21% 0.034 264.665);
    --color-gray-950: oklch(13% 0.028 261.692);

    /* ---- Colour — surfaces ---- */
    --ui-canvas: #ffffff;
    --ui-surface: #ffffff;
    --ui-surface-muted: var(--color-gray-50);
    --ui-fill-neutral: var(--color-gray-100);
    --ui-inset: var(--color-gray-50);
    --ui-overlay: #ffffff;
    --ui-overlay-backdrop: oklab(0% 0 0 / 0.45); /* = bg-black/45, alpha exactly .45 */

    /* ---- Colour — text ---- */
    --ui-fg: var(--color-gray-900);
    --ui-fg-emphasis: var(--ui-fg);
    --ui-fg-muted: var(--color-gray-500);
    --ui-fg-subtle: var(--color-gray-400);
    --ui-fg-link: #0b57d0; /* brand-700 */
    --ui-fg-link-hover: #1a73e8; /* brand-600 */

    /* ---- Colour — lines ---- */
    --ui-line: var(--color-gray-200);
    --ui-line-muted: var(--color-gray-100);
    --ui-line-emphasis: var(--color-gray-300);
    --ui-divider: var(--color-gray-200);

    /* ---- Colour — accent (neutral: the ink's near-black, gray-900, on white — v0.2.13's
       accent) ---- */
    --ui-accent: #111827;
    --ui-accent-hover: #1f2937;
    --ui-accent-active: #374151;
    --ui-accent-fg: #ffffff;
    --ui-accent-muted: rgb(17 24 39 / 0.08);
    --ui-accent-line: rgb(17 24 39 / 0.4);

    /* ---- Colour — semantic tones ----
       Ink on a tint and a solid fill's label clear 4.5:1 (badge text is the 700 step, as the app's
       tinted pills draw it); fg on the page surfaces clears 3:1. \`neutral\` ink is the muted pill's
       gray-600. The package's badges, dots and status marks read these; the app's own call sites
       still take their tones from tone.ts classes until their components move. */
    --ui-tone-success-fg: oklch(50.8% 0.118 165.612); /* emerald-700 */
    --ui-tone-success-bg: oklch(97.9% 0.021 166.113); /* emerald-50 */
    --ui-tone-success-line: oklch(84.5% 0.143 164.978); /* emerald-300 */
    --ui-tone-success-emphasis: oklch(50.8% 0.118 165.612); /* emerald-700 */
    --ui-tone-success-emphasis-fg: #ffffff;
    --ui-tone-attention-fg: oklch(55.5% 0.163 48.998); /* amber-700 */
    --ui-tone-attention-bg: oklch(98.7% 0.022 95.277); /* amber-50 */
    --ui-tone-attention-line: oklch(87.9% 0.169 91.605); /* amber-300 */
    --ui-tone-attention-emphasis: oklch(76.9% 0.188 70.08); /* amber-500, dark label */
    --ui-tone-attention-emphasis-fg: var(--color-gray-950);
    --ui-tone-danger-fg: oklch(50.5% 0.213 27.518); /* red-700 */
    --ui-tone-danger-bg: oklch(97.1% 0.013 17.38); /* red-50 */
    --ui-tone-danger-line: oklch(80.8% 0.114 19.571); /* red-300 */
    --ui-tone-danger-emphasis: oklch(50.5% 0.213 27.518); /* red-700 */
    --ui-tone-danger-emphasis-fg: #ffffff;
    --ui-tone-done-fg: oklch(49.6% 0.265 301.924); /* purple-700 */
    --ui-tone-done-bg: oklch(97.7% 0.014 308.299); /* purple-50 */
    --ui-tone-done-line: oklch(82.7% 0.119 306.383); /* purple-300 */
    --ui-tone-done-emphasis: oklch(49.6% 0.265 301.924); /* purple-700 */
    --ui-tone-done-emphasis-fg: #ffffff;
    --ui-tone-neutral-fg: var(--color-gray-600);
    --ui-tone-neutral-bg: var(--color-gray-100);
    --ui-tone-neutral-line: var(--color-gray-200);
    --ui-tone-neutral-emphasis: var(--color-gray-600);
    --ui-tone-neutral-emphasis-fg: #ffffff;
    --ui-tone-info-fg: oklch(50% 0.134 242.749); /* sky-700 */
    --ui-tone-info-bg: oklch(97.7% 0.013 236.62); /* sky-50 */
    --ui-tone-info-line: oklch(82.8% 0.111 230.318); /* sky-300 */
    --ui-tone-info-emphasis: oklch(50% 0.134 242.749); /* sky-700 */
    --ui-tone-info-emphasis-fg: #ffffff;

    /* ---- Colour — marks: the update dot's notification red, the pale rung so it reads as news
       rather than as an alarm; the app's value, one in both modes ---- */
    --ui-mark-new: oklch(70.4% 0.191 22.216); /* red-400 */

    /* ---- Charts: the series palette in its roles (violet, amber, sky, rose, emerald, fuchsia,
       then teal and orange from the employee palette). Amber, sky, emerald, teal and orange sit
       at their 600 steps — the steps the app's dark series already used — since their 500s read
       at 2.2–2.9:1 on white (lifted 2026-09-30 to clear the floor; violet, rose and fuchsia clear
       3:1 at 500). The reference curve is amber like the second series; the token-kind blues and
       today's geometry — bars at 60% of their band with square tops, 2px lines joined straight,
       2.5px points, a 10% fill under a line. ---- */
    --ui-chart-1: oklch(60.6% 0.25 292.717); /* violet-500 */
    --ui-chart-2: oklch(66.6% 0.179 58.318); /* amber-600 */
    --ui-chart-3: oklch(58.8% 0.158 241.966); /* sky-600 */
    --ui-chart-4: oklch(64.5% 0.246 16.439); /* rose-500 */
    --ui-chart-5: oklch(59.6% 0.145 163.225); /* emerald-600 */
    --ui-chart-6: oklch(66.7% 0.295 322.15); /* fuchsia-500 */
    --ui-chart-7: oklch(60% 0.118 184.704); /* teal-600 */
    --ui-chart-8: oklch(64.6% 0.222 41.116); /* orange-600 */
    --ui-chart-ref: var(--ui-chart-2);
    --ui-chart-cache-read: #7dd3fc;
    --ui-chart-cache-write: #0ea5e9;
    --ui-chart-output: #0369a1;
    --ui-chart-grid: var(--color-gray-200);
    --ui-chart-axis: var(--color-gray-400);
    --ui-chart-bar-fill: 0.6;
    --ui-chart-bar-radius: 0px;
    --ui-chart-line-width: 2px;
    --ui-chart-point-radius: 2.5px;
    --ui-chart-curve: linear;
    --ui-chart-area-opacity: 0.1;
    --ui-chart-bar-stroke: 0px;
    --ui-chart-bar-stroke-color: series;
    --ui-chart-bar-opacity: 1;

    /* ---- Colour — code ---- */
    --ui-code-bg: var(--color-gray-50);
    --ui-code-line: var(--color-gray-200);
    --ui-code-gutter: var(--color-gray-400);
    --ui-code-selection: oklch(90.1% 0.058 230.902); /* sky-200 */
    --ui-diff-add-bg: oklch(97.9% 0.021 166.113); /* emerald-50 */
    --ui-diff-add-word: oklch(90.5% 0.093 164.15); /* emerald-200 */
    --ui-diff-del-bg: oklch(97.1% 0.013 17.38); /* red-50 */
    --ui-diff-del-word: oklch(88.5% 0.062 18.334); /* red-200 */
    --ui-diff-hunk-bg: oklch(97.7% 0.013 236.62); /* sky-50 */

    /* ---- Shape: Tailwind's stock radius scale ---- */
    --ui-radius-xs: 0.125rem;
    --ui-radius-sm: 0.25rem;
    --ui-radius-md: 0.375rem;
    --ui-radius-lg: 0.5rem;
    --ui-radius-xl: 0.75rem;
    --ui-radius-pill: 9999px;
    --ui-radius-control: 0.375rem;
    --ui-border-w: 1px;
    --ui-border-w-thick: 2px;

    /* ---- Elevation: Tailwind's stock shadow-sm / lg / xl / 2xl; no glass ---- */
    --ui-shadow-flat: 0 0 #0000;
    --ui-shadow-raised: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    --ui-shadow-overlay: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    --ui-shadow-modal: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
    --ui-shadow-drawer: 0 25px 50px -12px rgb(0 0 0 / 0.25);
    --ui-glass-bg: var(--ui-overlay);
    --ui-glass-blur: 0px;
    --ui-glass-saturate: 100%;
    --ui-glass-line: var(--ui-line);

    /* ---- Shell: today's window — the sidebar's muted fill beside the canvas, one rule between
       them, no field, no inset, no corner, no shadow. Every value is a reference, so dark needs
       no second copy. ---- */
    --ui-shell-field: var(--ui-canvas);
    --ui-shell-nav-bg: var(--ui-surface-muted);
    --ui-shell-main-bg: var(--ui-canvas);
    --ui-shell-line: var(--ui-line);
    --ui-shell-gap: 0px;
    --ui-shell-radius: 0px;
    --ui-shell-shadow: 0 0 #0000;

    /* ---- Structure: today's file tree (a 0.5rem inset and 0.875rem per level) and form rows.
       No recipe draws the guide or reads the label column here; the values are what a Primer
       polish would start from. ---- */
    --ui-tree-inset: 0.5rem;
    --ui-tree-indent: 0.875rem;
    --ui-tree-guide: var(--ui-line-muted);
    --ui-field-label-w: auto;
    --ui-field-gap: 0.375rem;

    /* ---- Controls: the switch the app has always drawn — the gray-200 track when off, a white
       knob, and the accent's own label ink for the knob on the accent (white on the dark fills).
       The white knob on the gray-200 track is under 3:1 and kept: it is today's look, and the
       knob's own hairline draws its edge — that hairline is gray-500 here (2026-09-30, the
       least visible change that reads at 3:1 on the track; it was a 10% black), so the edge
       carries the knob where the fill cannot. ---- */
    --ui-switch-track: var(--color-gray-200);
    --ui-switch-knob: #ffffff;
    --ui-switch-knob-on: var(--ui-accent-fg);
    --ui-switch-knob-line: var(--color-gray-500);

    /* ---- Badges: the tag the app has always drawn — a soft tag is its tone's tint with no rule
       round it, set in the semibold cut, and the md tag is padded half a space unit by two —
       11px on a 16px line at the 16px root, a step under the small rung: the size the badges
       had before W1. ---- */
    --ui-badge-soft-ring: 0px;
    --ui-badge-weight: 600;
    --ui-badge-pad-md: calc(var(--ui-space-unit) * 0.5) calc(var(--ui-space-unit) * 2);
    --ui-badge-size: 0.6875rem;
    --ui-badge-lh: 1rem;

    /* ---- Typography — families: the platform's system stacks, as v0.2.13 shipped them (the W1a
       move to Mona Sans / Noto Sans SC was withdrawn on 2026-10-02); chrome and reading text
       share the one face. The sans stack reads the CJK face where the app's stack named the two
       system CJK faces, so a chosen CJK face reaches it. JetBrains Mono stays the code face every
       theme shares. ---- */
    --ui-font-sans:
      ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, var(--ui-font-cjk), sans-serif;
    --ui-font-ui: var(--ui-font-sans);
    --ui-font-mono:
      "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      "Liberation Mono", "Courier New", monospace;
    --ui-font-display: var(--ui-font-sans);
    --ui-font-cjk: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC";

    /* ---- Typography — scale and roles: Tailwind's stock text-sm / text-xs rungs, which is what
       the app's classes render today (theme.css bridges \`text-sm\` and \`text-xs\` to these). The two
       line-heights are Tailwind's own unitless ratios, not their rem equivalents: a child that sets
       only its font size inherits a ratio but would inherit a rem as a fixed length, and every row
       holding such a child would grow by a fraction of a pixel. ---- */
    --ui-text-body-size: 0.875rem;
    --ui-text-body-lh: calc(1.25 / 0.875);
    --ui-text-small-size: 0.75rem;
    --ui-text-small-lh: calc(1 / 0.75);
    --ui-text-caption-size: 0.75rem;
    --ui-text-caption-lh: 1rem;
    --ui-text-code-size: 0.8125rem;
    --ui-text-code-lh: 1.25rem;
    --ui-text-prose-size: 0.875rem;
    --ui-text-prose-lh: 1.5rem;
    --ui-h1-size: 1.5rem;
    --ui-h1-lh: 2rem;
    --ui-h1-weight: 600;
    --ui-h1-tracking: normal;
    --ui-h1-transform: none;
    --ui-h1-font: var(--ui-font-sans);
    --ui-h2-size: 1.25rem;
    --ui-h2-lh: 1.75rem;
    --ui-h2-weight: 600;
    --ui-h2-tracking: normal;
    --ui-h2-transform: none;
    --ui-h2-font: var(--ui-font-sans);
    --ui-h3-size: 1.125rem;
    --ui-h3-lh: 1.75rem;
    --ui-h3-weight: 600;
    --ui-h3-tracking: normal;
    --ui-h3-transform: none;
    --ui-h3-font: var(--ui-font-sans);
    --ui-h4-size: 1rem;
    --ui-h4-lh: 1.5rem;
    --ui-h4-weight: 600;
    --ui-h4-tracking: normal;
    --ui-h4-transform: none;
    --ui-h4-font: var(--ui-font-sans);
    --ui-h5-size: 0.875rem;
    --ui-h5-lh: 1.25rem;
    --ui-h5-weight: 600;
    --ui-h5-tracking: normal;
    --ui-h5-transform: none;
    --ui-h5-font: var(--ui-font-sans);
    /* The h6 rung is the group label's (the eyebrow's): the app sets the Sessions label, its time
       and Agent groups and the settings dialog's rail in 11 px semibold capitals tracked wide, in
       px so they hold at every root size. */
    --ui-h6-size: 11px;
    --ui-h6-lh: 1rem;
    --ui-h6-weight: 600;
    --ui-h6-tracking: 0.025em;
    --ui-h6-transform: uppercase;
    --ui-h6-font: var(--ui-font-sans);
    --ui-md-h1-size: 1.25rem;
    --ui-md-h2-size: 1.125rem;
    --ui-md-h3-size: 1rem;
    --ui-weight-body: 400;
    --ui-weight-medium: 500;
    --ui-weight-strong: 600;
    --ui-tracking-body: normal;
    --ui-tracking-mono: normal;
    --ui-tracking-label: normal;

    /* ---- Density ----
       The space unit is Tailwind's stock 0.25rem, so every \`h-8\` / \`px-2\` / \`gap-3\` the app spells
       computes to what it computes today. Control rungs, content height = 2 × padding-block + the
       rung's line-height (sm: small, md and lg: body), plus a 1px border on each side:
         sm 0.25rem × 2 + 1rem    = 1.5rem  (Button sm, Input sm)
         md 0.375rem × 2 + 1.25rem = 2rem   (Button md)
         lg 0.625rem × 2 + 1.25rem = 2.5rem (Input base; it reaches the height with py-2 + text-base)
       That is 27 / 36 / 45px at the default 18px root (29 / 38 / 47 with borders) and 24 / 32 / 40
       at 16px. They are the app's existing controls, which is why they are not Primer's
       28 / 32 / 40px at the 18px root: moving there changes every control's height, a visible
       change for a later wave. */
    --ui-space-unit: 0.25rem;
    --ui-control-py-sm: 0.25rem;
    --ui-control-py-md: 0.375rem;
    --ui-control-py-lg: 0.625rem;
    --ui-control-px-sm: 0.625rem;
    --ui-control-px-md: 0.75rem;
    --ui-control-px-lg: 0.75rem;
    --ui-control-gap-sm: 0.25rem;
    --ui-control-gap-md: 0.5rem;
    --ui-row-py: 0.375rem;
    --ui-row-px: 0.5rem;
    --ui-menu-row-py: 0.5rem;
    --ui-menu-row-px: 0.875rem;
    --ui-card-p: 1rem;
    --ui-panel-p: 1rem;
    --ui-stack-0: 0.25rem;
    --ui-stack-1: 0.5rem;
    --ui-stack-2: 1rem;
    --ui-stack-3: 1.5rem;
    --ui-stack-4: 2.5rem;

    /* ---- Motion ---- */
    --ui-dur-fast: 150ms;
    --ui-dur-base: 200ms;
    --ui-dur-slow: 280ms;
    --ui-ease-out: cubic-bezier(0.2, 0.7, 0.3, 1);
    --ui-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
    --ui-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --ui-ease-overlay-in: ease-out;
    --ui-ease-overlay-out: ease-in;
    --ui-live-timing: linear;
    /* Presence, reveal and layout: the app's own feel — a layer fades in over 150ms with a 4px
       slide from its edge and leaves faster, streamed text fades in, the sidebar's width eases. */
    --ui-dur-enter: 150ms;
    --ui-dur-exit: 100ms;
    --ui-ease-enter: var(--ui-ease-overlay-in);
    --ui-ease-exit: var(--ui-ease-overlay-out);
    --ui-enter-shift: 4px;
    --ui-enter-scale: 1;
    --ui-enter-blur: 0px;
    --ui-dur-reveal: 150ms;
    --ui-reveal-blur: 0px;
    --ui-dur-layout: 200ms;
    --ui-ease-layout: var(--ui-ease-in-out);

    /* ---- Streaming: today's reply — the text shows as it lands, under the host's own pulsing
       caret; no pace, so no rate. ---- */
    --ui-stream-reveal: instant;
    --ui-stream-rate: 0;

    /* ---- Icons: the line set, as v0.2.13 drew them (the Octicons of 2026-10-01 were withdrawn
       on 2026-10-02); no duotone body (0), and decorative icons stay monochrome, so the hues are
       declared but unread — Tailwind's 600 steps (amber and green at 700, the steps the accent
       presets take), each a 3:1 mark on the page ---- */
    --ui-icon-stroke: 1.7;
    --ui-icon-cap: round;
    --ui-icon-join: round;
    --ui-icon-duo-opacity: 0;
    --ui-icon-tint-blue: oklch(54.6% 0.245 262.881); /* blue-600 */
    --ui-icon-tint-violet: oklch(54.1% 0.281 293.009); /* violet-600 */
    --ui-icon-tint-pink: oklch(59.2% 0.249 0.584); /* pink-600 */
    --ui-icon-tint-red: oklch(57.7% 0.245 27.325); /* red-600 */
    --ui-icon-tint-orange: oklch(64.6% 0.222 41.116); /* orange-600 */
    --ui-icon-tint-amber: oklch(55.5% 0.163 48.998); /* amber-700 */
    --ui-icon-tint-green: oklch(52.7% 0.154 150.069); /* green-700 */
    --ui-icon-tint-teal: oklch(60% 0.118 184.704); /* teal-600 */
    --ui-icon-tint-slate: oklch(55.4% 0.046 257.417); /* slate-500 */

    /* ---- Focus, selection and scrollbar ---- */
    --ui-focus-ring: 3px solid rgb(107 114 128 / 0.4); /* gray-500 */
    --ui-focus-ring-offset: 2px;
    --ui-focus-ring-input: 0 0 0 2px color-mix(in oklab, var(--color-gray-400) 30%, transparent);
    --ui-selection-bg: rgb(0 0 0 / 0.1);
    --ui-scrollbar-w: thin;
    --ui-scrollbar-thumb: rgb(60 64 67 / 0.28);
    --ui-scrollbar-thumb-hover: rgb(60 64 67 / 0.45);
    --ui-scrollbar-track: transparent;
    --ui-scrollbar-visibility: auto;
  }

  /* Dark declares only what the mode changes. \`:root.dark\` also matches the rule above, so every
     name not repeated here — the shape, type, density and motion groups whole, the icons' stroke
     and duotone opacity, the solid fills and their labels, the backdrop — keeps its one value
     from there, and a \`var()\` in it resolves against this rule's values (\`--ui-glass-bg:
     var(--ui-overlay)\` is the dark overlay). */
  :root.dark,
  :root[data-theme="github"].dark {
    /* ---- Gray bridge: one neutral ramp (no indigo tint) for a calm dark. The four dark steps
       lift off pure black — the canvas is 950 at #121212 — and the ink steps come down from
       white: 50 is the near-white kept for headings, 100 the body ink at about 12:1 on the
       canvas, 300 a secondary ink at about 8:1, 400 the muted ink at about 6:1, 500 the subtle
       ink for placeholders and meta text at about 4.7:1 on the muted surface. The app's message
       prose is \`dark:text-gray-100\` and its meta text \`dark:text-gray-400\`, so re-pointing the
       whole ramp is what sets the app's dark. ---- */
    --color-gray-950: #121212;
    --color-gray-900: #1a1a1a;
    --color-gray-800: #262626;
    --color-gray-700: #333333;
    --color-gray-600: #5a5a5a;
    --color-gray-500: #8a8a8a;
    --color-gray-400: #a1a1a1;
    --color-gray-300: #b0b0b0;
    --color-gray-200: #c2c2c2;
    --color-gray-100: #d6d6d6;
    --color-gray-50: #f0f0f0;
    /* Stays literal white in dark: the app's \`dark:border-white/10\`, \`dark:bg-white/10\`,
       \`dark:hover:bg-white\` and \`ring-white\` read it as light INK, and its few unpaired \`bg-white\`
       have always rendered white here. A theme that re-points it at a dark surface must first
       move those call sites to tokens. */
    --color-white: #ffffff;

    /* ---- Colour — surfaces: the canvas a step off black, cards a step above it, the inset a
       step below ---- */
    --ui-canvas: var(--color-gray-950);
    --ui-surface: var(--color-gray-900);
    --ui-surface-muted: #202020;
    --ui-fill-neutral: var(--color-gray-800);
    --ui-inset: #0e0e0e;
    --ui-overlay: var(--color-gray-900);

    /* ---- Colour — text: body about 12:1, headings near-white, muted about 6:1, subtle 4.7:1 ---- */
    --ui-fg: var(--color-gray-100);
    --ui-fg-emphasis: var(--color-gray-50);
    --ui-fg-muted: var(--color-gray-400);
    --ui-fg-subtle: var(--color-gray-500);
    --ui-fg-link: #8ab4f8; /* brand-300 */
    --ui-fg-link-hover: var(--ui-fg-link);

    /* ---- Colour — lines ---- */
    --ui-line: var(--color-gray-800);
    --ui-line-muted: var(--color-gray-800); /* the app's dark divider, \`dark:border-gray-800\` */
    --ui-line-emphasis: var(--color-gray-700);
    --ui-divider: var(--color-gray-800);

    /* ---- Colour — accent (neutral: light gray with dark text — v0.2.13's gray-100 / 200 / 300)
       ---- */
    --ui-accent: #f3f4f6;
    --ui-accent-hover: #e5e7eb;
    --ui-accent-active: #d1d5db;
    --ui-accent-fg: #111827;
    --ui-accent-muted: rgb(243 244 246 / 0.12);
    --ui-accent-line: rgb(243 244 246 / 0.4);

    /* ---- Colour — semantic tones: 400 ink on the 950/40 tints the app's dark notices use; the
       solid fills and their labels are the light ones ---- */
    --ui-tone-success-fg: oklch(76.5% 0.177 163.223); /* emerald-400 */
    --ui-tone-success-bg: oklch(26.2% 0.051 172.552 / 0.4); /* emerald-950/40 */
    --ui-tone-success-line: oklch(50.8% 0.118 165.612); /* emerald-700 */
    --ui-tone-attention-fg: oklch(82.8% 0.189 84.429); /* amber-400 */
    --ui-tone-attention-bg: oklch(27.9% 0.077 45.635 / 0.4); /* amber-950/40 */
    --ui-tone-attention-line: oklch(55.5% 0.163 48.998); /* amber-700 */
    --ui-tone-danger-fg: oklch(70.4% 0.191 22.216); /* red-400 */
    --ui-tone-danger-bg: oklch(25.8% 0.092 26.042 / 0.4); /* red-950/40 */
    --ui-tone-danger-line: oklch(50.5% 0.213 27.518); /* red-700 */
    --ui-tone-done-fg: oklch(71.4% 0.203 305.504); /* purple-400 */
    --ui-tone-done-bg: oklch(29.1% 0.149 302.717 / 0.4); /* purple-950/40 */
    --ui-tone-done-line: oklch(49.6% 0.265 301.924); /* purple-700 */
    --ui-tone-neutral-fg: var(--color-gray-300);
    --ui-tone-neutral-bg: var(--color-gray-800);
    --ui-tone-neutral-line: var(--color-gray-800);
    --ui-tone-info-fg: oklch(74.6% 0.16 232.661); /* sky-400 */
    --ui-tone-info-bg: oklch(29.3% 0.066 243.157 / 0.4); /* sky-950/40 */
    --ui-tone-info-line: oklch(50% 0.134 242.749); /* sky-700 */

    /* ---- Charts: light now shares the 600 steps the app's dark series use, so dark restates
       only what still differs — emerald at 400 as the timeline draws its work phase, fuchsia at
       600; violet and rose hold ---- */
    --ui-chart-5: oklch(76.5% 0.177 163.223); /* emerald-400 */
    --ui-chart-6: oklch(59.1% 0.293 322.896); /* fuchsia-600 */
    --ui-chart-grid: var(--color-gray-800);
    --ui-chart-axis: var(--color-gray-500);

    /* ---- Colour — code ---- */
    --ui-code-bg: var(--color-gray-900);
    --ui-code-line: var(--color-gray-800);
    --ui-code-gutter: var(--color-gray-600);
    --ui-code-selection: color-mix(in oklab, oklch(68.5% 0.169 237.323) 40%, transparent);
    --ui-diff-add-bg: color-mix(in oklab, oklch(69.6% 0.17 162.48) 15%, transparent);
    --ui-diff-add-word: color-mix(in oklab, oklch(69.6% 0.17 162.48) 35%, transparent);
    --ui-diff-del-bg: color-mix(in oklab, oklch(63.7% 0.237 25.331) 15%, transparent);
    --ui-diff-del-word: color-mix(in oklab, oklch(63.7% 0.237 25.331) 35%, transparent);
    --ui-diff-hunk-bg: color-mix(in oklab, oklch(68.5% 0.169 237.323) 15%, transparent);

    /* ---- Controls: the app's dark off track, and the body ink as the knob on it ---- */
    --ui-switch-track: var(--color-gray-700);
    --ui-switch-knob: var(--ui-fg);
    --ui-switch-knob-line: rgb(0 0 0 / 0.1);

    /* ---- Icons: the hues at Tailwind's 400 steps for the dark page ---- */
    --ui-icon-tint-blue: oklch(70.7% 0.165 254.624); /* blue-400 */
    --ui-icon-tint-violet: oklch(70.2% 0.183 293.541); /* violet-400 */
    --ui-icon-tint-pink: oklch(71.8% 0.202 349.761); /* pink-400 */
    --ui-icon-tint-red: oklch(70.4% 0.191 22.216); /* red-400 */
    --ui-icon-tint-orange: oklch(75% 0.183 55.934); /* orange-400 */
    --ui-icon-tint-amber: oklch(82.8% 0.189 84.429); /* amber-400 */
    --ui-icon-tint-green: oklch(79.2% 0.209 151.711); /* green-400 */
    --ui-icon-tint-teal: oklch(77.7% 0.152 181.912); /* teal-400 */
    --ui-icon-tint-slate: oklch(70.4% 0.04 256.788); /* slate-400 */

    /* ---- Selection and scrollbar ---- */
    --ui-selection-bg: rgb(255 255 255 / 0.18);
    --ui-scrollbar-thumb: rgb(232 234 237 / 0.2);
    --ui-scrollbar-thumb-hover: rgb(232 234 237 / 0.35);
  }

  /*
   * Style hooks (hooks.ts): every one is a no-op in Primer. The app's look is what the
   * components' own classes render — an opaque overlay, a semibold h1, a linear pulse, a bordered
   * card with a muted head, the accent bar under a tab, the sidebar's muted fill beside the
   * canvas, monochrome icons, a bordered tree box with the host's own indent, a form's label
   * above its control and a settings row's label beside it, a plain row for a step of the
   * agent's work, a plain dim behind a dialog, a streaming reply under the host's own pulsing
   * caret glyph — so no recipe is written for those, and none may
   * be until a Primer polish wave changes that look on purpose (the 2026-09-30 lift of the light
   * chart steps and the knob's hairline were such changes, made in tokens, not recipes). The two
   * rules every theme shares (the eyebrow on the h6 rung, the display title in the emphasis ink)
   * live in theme.css and are what the app's group labels and page titles already draw: 11px
   * semibold tracked capitals, and the body ink in light. Icons are the line drawings theme.css
   * shows by default, as v0.2.13 drew them. \`.ui-widget\` is a documented no-op too: a reply's
   * widget keeps its host's card — the hairline box on the surface, muted tiles, medium-weight
   * numerals.
   */
}

/*
 * The user's accent presets (tokens.ts, \`ACCENT_PRESETS.github\`): the five ids and values the app
 * has always had, literal — a preset sets the six accent tokens itself, nothing derives — and
 * the same in both modes, with one lift: rose-700 was a 3:1 mark only on the pure-black dark,
 * and on the lifted dark surfaces it is 2.98:1, so dark takes rose-600 (its white label still
 * clears 4.5:1) with the 700 / 800 steps as hover and active. The selectors match only Primer's
 * root — a bare <html> or \`data-theme="github"\` — so a stored preset another theme lists paints
 * nothing here, and these paint nothing under another theme. The layer puts them after the
 * theme's dark rule, which they would otherwise only tie with.
 */
@layer ui-accent {
  :root:not([data-theme])[data-accent="blue"],
  :root[data-theme="github"][data-accent="blue"] {
    --ui-accent: #2563eb;
    --ui-accent-hover: #1d4ed8;
    --ui-accent-active: #1e40af;
    --ui-accent-fg: #ffffff;
    --ui-accent-muted: rgb(37 99 235 / 0.12);
    --ui-accent-line: rgb(37 99 235 / 0.5);
  }
  :root:not([data-theme])[data-accent="green"],
  :root[data-theme="github"][data-accent="green"] {
    --ui-accent: #15803d; /* green-700: white text clears AA */
    --ui-accent-hover: #166534;
    --ui-accent-active: #14532d;
    --ui-accent-fg: #ffffff;
    --ui-accent-muted: rgb(21 128 61 / 0.12);
    --ui-accent-line: rgb(21 128 61 / 0.5);
  }
  :root:not([data-theme])[data-accent="violet"],
  :root[data-theme="github"][data-accent="violet"] {
    --ui-accent: #7c3aed;
    --ui-accent-hover: #6d28d9;
    --ui-accent-active: #5b21b6;
    --ui-accent-fg: #ffffff;
    --ui-accent-muted: rgb(124 58 237 / 0.12);
    --ui-accent-line: rgb(124 58 237 / 0.5);
  }
  :root:not([data-theme])[data-accent="rose"],
  :root[data-theme="github"][data-accent="rose"] {
    --ui-accent: #be123c; /* rose-700: white text clears AA */
    --ui-accent-hover: #9f1239;
    --ui-accent-active: #881337;
    --ui-accent-fg: #ffffff;
    --ui-accent-muted: rgb(190 18 60 / 0.12);
    --ui-accent-line: rgb(190 18 60 / 0.5);
  }
  :root:not([data-theme])[data-accent="rose"].dark,
  :root[data-theme="github"][data-accent="rose"].dark {
    --ui-accent: #e11d48; /* rose-600: a 3:1 mark on the lifted dark surfaces */
    --ui-accent-hover: #be123c;
    --ui-accent-active: #9f1239;
    --ui-accent-muted: rgb(225 29 72 / 0.12);
    --ui-accent-line: rgb(225 29 72 / 0.5);
  }
  :root:not([data-theme])[data-accent="amber"],
  :root[data-theme="github"][data-accent="amber"] {
    --ui-accent: #b45309; /* amber-700: white text clears AA */
    --ui-accent-hover: #92400e;
    --ui-accent-active: #78350f;
    --ui-accent-fg: #ffffff;
    --ui-accent-muted: rgb(180 83 9 / 0.12);
    --ui-accent-line: rgb(180 83 9 / 0.5);
  }
}
`,Vi=`/**
 * Frost (\`modern\`) — soft, roomy, quiet. A cool-neutral off-white with almost no lines: the
 * navigation column is frosted glass over one flat field beside a near-white main column,
 * grouping comes from soft grey fills rather than borders, a card's edge is a hairline that
 * barely exists, dialogs are opaque on a dimmed backdrop with large corners; pill controls,
 * regular-weight titles set large with negative tracking, a light frost on the small layers
 * that float over content and on the plugin and skill tiles, motion that springs and de-blurs,
 * and work in progress shown by nothing more than a highlight sweeping across its label.
 * References: the owner's captures of 2026-09-29 (a sidebar beside a near-white transcript, an
 * opaque About dialog, a settings dialog whose rows sit in soft-filled groups), with Codex /
 * macOS for the lineless working state and the frosted sidebar.
 *
 * Status of each group:
 * - Light is a near-neutral grey ramp with a faint cool cast: the canvas \`#fafafa\` (never a
 *   stark white slab), the navigation column and grouped rows \`#f3f4f5\`, cards white, lines a
 *   step above the fill they sit on. Dark is the same ramp inverted, set calm but not dim — the
 *   body ink about 11:1 on the muted surface, the near-white kept for headings, the muted ink
 *   6.5:1 and the subtle 4.9:1 there.
 * - The accent family derives from \`--ui-accent\`: hover and active are the accent shaded, the
 *   wash and the line are the accent at an alpha, so a preset sets the one value per mode.
 * - Semantic tones use Sierra's hues, tuned until every tone reads at 4.5:1 as text on its own
 *   tint and 3:1 as a mark on every surface (proposal). Chart and code colours are proposals.
 * - Fonts: MiSans (Xiaomi) in place of Sierra's commercial GT America, Latin and Chinese in one
 *   family at weights 400 and 500, with JetBrains Mono for code (\`fonts/modern.css\`). Chrome and
 *   reading text share the face.
 * - Density and type are Frost's own: a 0.28rem space unit (12% above Tailwind's 0.25rem, so
 *   every \`h-8\` and \`px-2\` grows with it), a 0.9375rem body rung, roomier control padding. The
 *   size of nothing is shared with the other themes any more.
 *
 * Shape of the file (the same in every theme): one \`@layer ui-theme\` block holding the base rule,
 * which defines every name in tokens.ts in its group order with its light value, after the gray
 * bridge that re-points Tailwind's \`--color-gray-*\` / \`--color-white\` so the app's existing
 * palette classes follow the theme; the dark rule, which declares only what dark changes (the
 * rest keeps its base value, since this file comes after \`github.css\` and so its base rule beats
 * that file's dark rule); and then this theme's recipes for the style hooks (hooks.ts). After it,
 * one \`@layer ui-accent\` block with the theme's own accent presets.
 */
@layer ui-theme {
  :root[data-theme="modern"] {
    /* Tailwind bridge: the app's gray classes land on the cool-neutral ramp. white = the card
       surface. */
    --color-white: var(--ui-surface);
    --color-gray-50: #fafafa;
    --color-gray-100: #f3f4f5;
    --color-gray-200: #e6e8ea;
    --color-gray-300: #d0d3d6;
    --color-gray-400: #979b9f;
    --color-gray-500: #686c71;
    --color-gray-600: #565a5e;
    --color-gray-700: #424549;
    --color-gray-800: #313336;
    --color-gray-900: #242628;
    --color-gray-950: #18191b;

    /* Colour — surfaces. The canvas is a near-white, not a white slab; grouped rows and the
       navigation column sit on the muted grey; cards and dialogs are white. */
    --ui-canvas: #fafafa;
    --ui-surface: #ffffff;
    --ui-surface-muted: #f3f4f5;
    --ui-fill-neutral: var(--color-gray-100);
    --ui-inset: #f5f6f7;
    --ui-overlay: #ffffff;
    --ui-overlay-backdrop: rgb(24 25 27 / 0.4);

    /* Colour — text */
    --ui-fg: #232527;
    --ui-fg-emphasis: var(--ui-fg);
    --ui-fg-muted: #686c71;
    --ui-fg-subtle: #979b9f;
    --ui-fg-link: #2f66c4;
    --ui-fg-link-hover: #244f9a;

    /* Colour — lines: a step above the fill they sit on, so a card's edge barely exists */
    --ui-line: #e9eaec;
    --ui-line-muted: #f0f1f2;
    --ui-line-emphasis: #d0d3d6;
    --ui-divider: #f0f1f2;

    /* Colour — accent: the ink itself under a white label — black and white by default (user
       decision, 2026-10-02; the forest green became the preset \`forest\`). The rest of the family
       derives from it: hover and active are the accent shaded toward black (the label is white,
       so a darker fill only gains contrast), the wash and the line are the accent at an alpha. A
       preset therefore sets \`--ui-accent\` alone; its label ink is the theme's for the mode. */
    --ui-accent: #232527;
    --ui-accent-hover: color-mix(in srgb, var(--ui-accent) 86%, #000000);
    --ui-accent-active: color-mix(in srgb, var(--ui-accent) 74%, #000000);
    --ui-accent-fg: #ffffff;
    --ui-accent-muted: color-mix(in srgb, var(--ui-accent) 14%, transparent);
    --ui-accent-line: color-mix(in srgb, var(--ui-accent) 35%, transparent);

    /* Colour — semantic tones: a soft tint with its ink and no edge — a tone's line is its tint,
       so a badge or a pill is a tinted shape, never a bordered one. */
    --ui-tone-success-fg: #007a3a;
    --ui-tone-success-bg: #e4f2e8;
    --ui-tone-success-line: var(--ui-tone-success-bg);
    --ui-tone-success-emphasis: #007a3a;
    --ui-tone-success-emphasis-fg: #ffffff;
    --ui-tone-attention-fg: #806210;
    --ui-tone-attention-bg: #fbf4dc;
    --ui-tone-attention-line: var(--ui-tone-attention-bg);
    --ui-tone-attention-emphasis: #ebc247;
    --ui-tone-attention-emphasis-fg: #232527;
    --ui-tone-danger-fg: #c72d06;
    --ui-tone-danger-bg: #fcebe8;
    --ui-tone-danger-line: var(--ui-tone-danger-bg);
    --ui-tone-danger-emphasis: #c72d06;
    --ui-tone-danger-emphasis-fg: #ffffff;
    --ui-tone-done-fg: #7644a6;
    --ui-tone-done-bg: #f1edf8;
    --ui-tone-done-line: var(--ui-tone-done-bg);
    --ui-tone-done-emphasis: #7644a6;
    --ui-tone-done-emphasis-fg: #ffffff;
    --ui-tone-neutral-fg: #5f6367;
    --ui-tone-neutral-bg: #f3f4f5;
    --ui-tone-neutral-line: var(--ui-tone-neutral-bg);
    --ui-tone-neutral-emphasis: #6d7176;
    --ui-tone-neutral-emphasis-fg: #ffffff;
    --ui-tone-info-fg: #2f66c4;
    --ui-tone-info-bg: #eaf0fa;
    --ui-tone-info-line: var(--ui-tone-info-bg);
    --ui-tone-info-emphasis: #2f66c4;
    --ui-tone-info-emphasis-fg: #ffffff;

    /* Colour — marks: the update dot in a soft coral, the danger hue lifted so it reads as news;
       one value on both pages */
    --ui-mark-new: #f0765a;

    /* Charts: soft. A low-chroma palette in the roles (heather, ochre, dusk blue, rose, sage,
       mauve, teal, clay), each just clearing 3:1 on the canvas so a line and a point read; the
       bars are the same colours let through at seven tenths (a little more in dark) with no
       outline — a first pass edged them in their own colour and the owner preferred them plain
       — so a chart never glares. The reference curve in the muted ink, the token-kind blues
       softened, and a soft geometry: bars a little over half their band with rounded tops, a
       2px smooth curve, round points, a light wash under a line. */
    --ui-chart-1: #8b7cc4;
    --ui-chart-2: #a8863a;
    --ui-chart-3: #6590c2;
    --ui-chart-4: #c4718b;
    --ui-chart-5: #5f9c7a;
    --ui-chart-6: #b57cb3;
    --ui-chart-7: #58978f;
    --ui-chart-8: #bd7d52;
    --ui-chart-ref: var(--ui-fg-muted);
    --ui-chart-cache-read: #b9cfe8;
    --ui-chart-cache-write: #7fa3d2;
    --ui-chart-output: #4d6f9e;
    --ui-chart-grid: #eef0f1;
    --ui-chart-axis: #979b9f;
    --ui-chart-bar-fill: 0.55;
    --ui-chart-bar-radius: 3px;
    --ui-chart-line-width: 2px;
    --ui-chart-point-radius: 3px;
    --ui-chart-curve: smooth;
    --ui-chart-area-opacity: 0.12;
    --ui-chart-bar-stroke: 0px;
    --ui-chart-bar-stroke-color: series;
    --ui-chart-bar-opacity: 0.7;

    /* Colour — code */
    --ui-code-bg: #f5f6f7;
    --ui-code-line: #e9eaec;
    --ui-code-gutter: #979b9f;
    --ui-code-selection: rgb(47 102 196 / 0.16);
    --ui-diff-add-bg: #e7f3ea;
    --ui-diff-add-word: #c2e5ca;
    --ui-diff-del-bg: #fcebe8;
    --ui-diff-del-word: #f6c9bb;
    --ui-diff-hunk-bg: #eaf0fa;

    /* Shape: large on boxes — 6 / 8 / 12 / 20 / 24 px at the 16px root, so a card takes 12px
       and a dialog 20px — with the pill kept for every pressable control. */
    --ui-radius-xs: 0.375rem;
    --ui-radius-sm: 0.5rem;
    --ui-radius-md: 0.75rem;
    --ui-radius-lg: 1.25rem;
    --ui-radius-xl: 1.5rem;
    --ui-radius-pill: 9999px;
    --ui-radius-control: 9999px;
    --ui-border-w: 1px;
    --ui-border-w-thick: 2px;

    /* Elevation: untinted and soft — a faint drop, no ring (a layer's edge is its own hairline).
       \`flat\` is a zero shadow rather than \`none\`: Tailwind composes shadows into a comma list,
       where \`none\` would invalidate the whole declaration. The frost is light and nearly opaque:
       a small layer over content keeps a hint of what moves under it, no more. */
    --ui-shadow-flat: 0 0 #0000;
    --ui-shadow-raised: 0 1px 2px rgb(0 0 0 / 0.04);
    --ui-shadow-overlay: 0 4px 16px -4px rgb(0 0 0 / 0.1);
    --ui-shadow-modal: 0 12px 40px -12px rgb(0 0 0 / 0.18);
    --ui-shadow-drawer: var(--ui-shadow-modal);
    --ui-glass-bg: rgb(255 255 255 / 0.85);
    --ui-glass-blur: 16px;
    --ui-glass-saturate: 1.2;
    --ui-glass-line: rgb(0 0 0 / 0.06);

    /* Shell: the navigation column is frosted glass — milky white let through at a little over
       half — over one flat field, the ramp's 200 step, so the column comes out at the muted
       surface (about #f4f5f6), a shade under the opaque canvas of the main column. No gap,
       corner or shadow, and no wash or gradient on the field (owner, 2026-10-11): the column is
       set apart by its fill and a faint cool rule alone. */
    --ui-shell-field: var(--color-gray-200);
    --ui-shell-nav-bg: rgb(255 255 255 / 0.55);
    --ui-shell-main-bg: var(--ui-canvas);
    --ui-shell-line: rgb(28 40 72 / 0.08);
    --ui-shell-gap: 0px;
    --ui-shell-radius: 0px;
    --ui-shell-shadow: 0 0 #0000;

    /* Structure: a roomy tree (a 0.75rem inset, 1.125rem per level) against a soft guide in the
       line colour; a field keeps the host's label-beside-control row (the label column is
       unused), with a half-rem between label and control. */
    --ui-tree-inset: 0.75rem;
    --ui-tree-indent: 1.125rem;
    --ui-tree-guide: var(--ui-line);
    --ui-field-label-w: auto;
    --ui-field-gap: 0.5rem;

    /* Controls: the switch's off track is the line, its knob the muted ink (5:1 on the track);
       on the accent the knob takes the accent's label ink. */
    --ui-switch-track: var(--color-gray-200);
    --ui-switch-knob: var(--ui-fg-muted);
    --ui-switch-knob-on: var(--ui-accent-fg);
    --ui-switch-knob-line: rgb(0 0 0 / 0.1);

    /* Badges: a soft tag is its tint alone, with no rule round it (a tone's line is its tint
       here anyway), set in the semibold cut, and the md tag is padded half a space unit by two;
       12px on a 16px line at the 16px root, a step under the small rung (0.8125rem). */
    --ui-badge-soft-ring: 0px;
    --ui-badge-weight: 600;
    --ui-badge-pad-md: calc(var(--ui-space-unit) * 0.5) calc(var(--ui-space-unit) * 2);
    --ui-badge-size: 0.75rem;
    --ui-badge-lh: 1rem;

    /* Typography — families. MiSans sets Latin and Chinese alike; the system CJK faces stay ahead
       of the generic fallbacks for the rare ideograph MiSans's slices do not carry. Chrome and
       reading text share the one face. */
    --ui-font-cjk: "MiSans", "PingFang SC", "Microsoft YaHei";
    --ui-font-sans: "MiSans", var(--ui-font-cjk), ui-sans-serif, system-ui, sans-serif;
    --ui-font-ui: var(--ui-font-sans);
    --ui-font-mono:
      "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono",
      var(--ui-font-cjk), monospace;
    --ui-font-display: var(--ui-font-sans);

    /* Typography — scale and roles: a 15px body at the 16px root, 13px small and caption, and
       titles set large in the regular weight with tightening negative tracking up the scale, the
       way Sierra sets its h1 and h2 (400, −1.3px at 65px). Frost's weights stop at 500. */
    --ui-text-body-size: 0.9375rem;
    --ui-text-body-lh: 1.5;
    --ui-text-small-size: 0.8125rem;
    --ui-text-small-lh: 1.5;
    --ui-text-caption-size: 0.8125rem;
    --ui-text-caption-lh: 1.4;
    --ui-text-code-size: 0.8125rem;
    --ui-text-code-lh: 1.6;
    --ui-text-prose-size: 1rem;
    --ui-text-prose-lh: 1.65;
    --ui-h1-size: 2.25rem;
    --ui-h1-lh: 1.1;
    --ui-h1-weight: 400;
    --ui-h1-tracking: -0.03em;
    --ui-h1-transform: none;
    --ui-h1-font: var(--ui-font-display);
    --ui-h2-size: 1.75rem;
    --ui-h2-lh: 1.15;
    --ui-h2-weight: 400;
    --ui-h2-tracking: -0.025em;
    --ui-h2-transform: none;
    --ui-h2-font: var(--ui-font-display);
    --ui-h3-size: 1.375rem;
    --ui-h3-lh: 1.25;
    --ui-h3-weight: 400;
    --ui-h3-tracking: -0.015em;
    --ui-h3-transform: none;
    --ui-h3-font: var(--ui-font-sans);
    --ui-h4-size: 1.125rem;
    --ui-h4-lh: 1.35;
    --ui-h4-weight: 500;
    --ui-h4-tracking: -0.01em;
    --ui-h4-transform: none;
    --ui-h4-font: var(--ui-font-sans);
    --ui-h5-size: 0.9375rem;
    --ui-h5-lh: 1.5;
    --ui-h5-weight: 500;
    --ui-h5-tracking: 0;
    --ui-h5-transform: none;
    --ui-h5-font: var(--ui-font-sans);
    --ui-h6-size: 0.8125rem;
    --ui-h6-lh: 1.5;
    --ui-h6-weight: 500;
    --ui-h6-tracking: 0;
    --ui-h6-transform: none;
    --ui-h6-font: var(--ui-font-sans);
    --ui-md-h1-size: 1.5rem;
    --ui-md-h2-size: 1.25rem;
    --ui-md-h3-size: 1.0625rem;
    --ui-weight-body: 400;
    --ui-weight-medium: 500;
    --ui-weight-strong: 500;
    --ui-tracking-body: 0;
    --ui-tracking-mono: 0;
    --ui-tracking-label: 0;

    /* Density: a 0.28rem space unit (every Tailwind spacing and size utility scales with it), and
       control, row and menu-row padding a step roomier than the unit alone gives. Pills take wide
       padding-inline. Stacks are the unit's multiples. */
    --ui-space-unit: 0.28rem;
    --ui-control-py-sm: 0.375rem;
    --ui-control-py-md: 0.5rem;
    --ui-control-py-lg: 0.75rem;
    --ui-control-px-sm: 0.875rem;
    --ui-control-px-md: 1.125rem;
    --ui-control-px-lg: 1.375rem;
    --ui-control-gap-sm: 0.375rem;
    --ui-control-gap-md: 0.625rem;
    --ui-row-py: 0.5rem;
    --ui-row-px: 1rem;
    --ui-menu-row-py: 0.5625rem;
    --ui-menu-row-px: 0.75rem;
    --ui-card-p: 1.25rem;
    --ui-panel-p: 1.5rem;
    --ui-stack-0: 0.3125rem;
    --ui-stack-1: 0.625rem;
    --ui-stack-2: 1.25rem;
    --ui-stack-3: 1.875rem;
    --ui-stack-4: 3rem;

    /* Motion: Sierra's cubic-bezier(.4,0,.2,1) for state changes, held to 120–200ms. Layers enter
       on a soft spring (a touch of overshoot, never a bounce) scaling up from 0.96 with a 6px
       blur-in and an 8px slide from their edge, and leave quickly on the overlay-out curve;
       streamed text de-blurs in word by word over 360ms; the sidebar's width settles on a long
       ease-out. */
    --ui-dur-fast: 120ms;
    --ui-dur-base: 200ms;
    --ui-dur-slow: 320ms;
    --ui-ease-out: cubic-bezier(0, 0, 0.2, 1);
    --ui-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
    --ui-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --ui-ease-overlay-in: cubic-bezier(0.16, 1, 0.3, 1);
    --ui-ease-overlay-out: cubic-bezier(0.4, 0, 1, 1);
    --ui-live-timing: linear;
    --ui-dur-enter: 280ms;
    --ui-dur-exit: 160ms;
    --ui-ease-enter: cubic-bezier(0.22, 1.15, 0.36, 1);
    --ui-ease-exit: var(--ui-ease-overlay-out);
    --ui-enter-shift: 8px;
    --ui-enter-scale: 0.96;
    --ui-enter-blur: 6px;
    --ui-dur-reveal: 360ms;
    --ui-reveal-blur: 4px;
    --ui-dur-layout: 320ms;
    --ui-ease-layout: cubic-bezier(0.22, 1, 0.36, 1);

    /* Streaming: a reply surfaces word by word at about 220 characters a second — quick enough
       never to hold a fast model back for long, even enough to read as a calm flow — through
       the soft veil the \`ui-stream\` recipe draws over its trailing lines. */
    --ui-stream-reveal: fade;
    --ui-stream-rate: 220;

    /* Icons: the line set at 1.6 with round ends, a soft duotone body under each glyph that has
       one, and a hue per glyph for the decorative icons (the \`ui-icon-decor\` recipe below) —
       low-to-mid chroma, all at one luminance so no hue outweighs another, each a 3.6:1 mark
       or better on the glass column and on every page surface. */
    --ui-icon-stroke: 1.6;
    --ui-icon-cap: round;
    --ui-icon-join: round;
    --ui-icon-duo-opacity: 0.18;
    --ui-icon-tint-blue: oklch(58.5% 0.115 255);
    --ui-icon-tint-violet: oklch(59.5% 0.12 295);
    --ui-icon-tint-pink: oklch(60% 0.12 350);
    --ui-icon-tint-red: oklch(60% 0.13 22);
    --ui-icon-tint-orange: oklch(59.5% 0.125 48);
    --ui-icon-tint-amber: oklch(59% 0.115 78);
    --ui-icon-tint-green: oklch(57.5% 0.105 150);
    --ui-icon-tint-teal: oklch(57.5% 0.085 190);
    --ui-icon-tint-slate: oklch(58.5% 0.03 250);

    /* Focus, selection and scrollbar. The outline follows the element's radius, so pills get a
       round halo; inputs draw theirs as a box-shadow. */
    --ui-focus-ring: 3px solid color-mix(in srgb, var(--ui-accent) 32%, transparent);
    --ui-focus-ring-offset: 1px;
    --ui-focus-ring-input: 0 0 0 3px color-mix(in srgb, var(--ui-accent) 22%, transparent);
    --ui-selection-bg: rgb(47 102 196 / 0.2);
    --ui-scrollbar-w: thin;
    --ui-scrollbar-thumb: rgb(0 0 0 / 0.2);
    --ui-scrollbar-thumb-hover: rgb(0 0 0 / 0.36);
    --ui-scrollbar-track: transparent;
    --ui-scrollbar-visibility: auto;
  }

  /* Dark: the same cool-neutral ramp inverted — calm greys, fills rather than lines, the body
     ink a light grey and the near-white kept for headings. */
  :root[data-theme="modern"].dark {
    /* Tailwind bridge: 950 canvas, 900 surface, 800 grouped rows / hover, 700 control line, then
       the ink ramp — 500 subtle, 400 muted, 100 body, 50 the near-white for headings. white
       stays literal: \`dark:*-white/N\` hairlines read it as ink. */
    --color-white: #ffffff;
    --color-gray-50: #f5f5f6;
    --color-gray-100: #e4e4e5;
    --color-gray-200: #cfd0d2;
    --color-gray-300: #bcbdbf;
    --color-gray-400: #adaeb0;
    --color-gray-500: #95979a;
    --color-gray-600: #6a6c70;
    --color-gray-700: #3a3c3f;
    --color-gray-800: #2f3033;
    --color-gray-900: #232426;
    --color-gray-950: #1b1c1e;

    /* Colour — surfaces: cards a step above the canvas, grouped rows another; the navigation
       column (the shell's glass over the muted surface) comes out near the cards' step */
    --ui-canvas: #1b1c1e;
    --ui-surface: #232426;
    --ui-surface-muted: #2a2b2e;
    --ui-fill-neutral: var(--color-gray-800);
    --ui-inset: #161718;
    --ui-overlay: #262729;
    --ui-overlay-backdrop: rgb(0 0 0 / 0.55);

    /* Colour — text: body about 11:1 on the muted surface, muted 6.5:1 and subtle 4.9:1 there */
    --ui-fg: var(--color-gray-100);
    --ui-fg-emphasis: var(--color-gray-50);
    --ui-fg-muted: var(--color-gray-400);
    --ui-fg-subtle: var(--color-gray-500);
    --ui-fg-link: #8bbff5;
    --ui-fg-link-hover: #b8d7f9;

    /* Colour — lines */
    --ui-line: rgb(255 255 255 / 0.07);
    --ui-line-muted: rgb(255 255 255 / 0.04);
    --ui-line-emphasis: rgb(255 255 255 / 0.16);
    --ui-divider: rgb(255 255 255 / 0.04);

    /* Colour — accent: a near-white under the dark ink, as the light fills here take; hover
       shades toward white and active toward black — away from the ink — and the wash and the
       line strengthen a step on the dark page. */
    --ui-accent: #f5f5f6;
    --ui-accent-hover: color-mix(in srgb, var(--ui-accent) 86%, #ffffff);
    --ui-accent-active: color-mix(in srgb, var(--ui-accent) 90%, #000000);
    --ui-accent-fg: #111214;
    --ui-accent-muted: color-mix(in srgb, var(--ui-accent) 18%, transparent);
    --ui-accent-line: color-mix(in srgb, var(--ui-accent) 45%, transparent);

    /* Colour — semantic tones: the tints lifted; a tone's line stays its tint */
    --ui-tone-success-fg: #7ed185;
    --ui-tone-success-bg: rgb(126 209 133 / 0.14);
    --ui-tone-success-emphasis: #2a7a3f;
    --ui-tone-attention-fg: #ebc247;
    --ui-tone-attention-bg: rgb(235 194 71 / 0.14);
    --ui-tone-attention-emphasis-fg: #1b1c1e;
    --ui-tone-danger-fg: #f0765a;
    --ui-tone-danger-bg: rgb(233 78 42 / 0.16);
    --ui-tone-danger-emphasis: #c23a1c;
    --ui-tone-done-fg: #c9a8f0;
    --ui-tone-done-bg: rgb(166 115 222 / 0.16);
    --ui-tone-done-emphasis: #7f52b5;
    --ui-tone-neutral-fg: var(--color-gray-300);
    --ui-tone-neutral-bg: rgb(255 255 255 / 0.06);
    --ui-tone-neutral-emphasis: #5a5c60;
    --ui-tone-info-fg: #8bbff5;
    --ui-tone-info-bg: rgb(139 191 245 / 0.14);
    --ui-tone-info-emphasis: #3a6bc4;

    /* Charts: the same roles lifted for the dark page */
    --ui-chart-1: #9f90d4;
    --ui-chart-2: #c4a45f;
    --ui-chart-3: #84a8d6;
    --ui-chart-4: #d494ab;
    --ui-chart-5: #86b99b;
    --ui-chart-6: #c99ac5;
    --ui-chart-7: #82b5b0;
    --ui-chart-8: #d3a281;
    --ui-chart-cache-read: #c5d8ee;
    --ui-chart-cache-write: #8fb1dc;
    --ui-chart-output: #6a8fc0;
    --ui-chart-bar-opacity: 0.78;
    --ui-chart-grid: rgb(255 255 255 / 0.06);
    --ui-chart-axis: var(--color-gray-500);

    /* Colour — code */
    --ui-code-bg: #161718;
    --ui-code-line: rgb(255 255 255 / 0.07);
    --ui-code-gutter: var(--color-gray-500);
    --ui-code-selection: rgb(139 191 245 / 0.22);
    --ui-diff-add-bg: rgb(126 209 133 / 0.1);
    --ui-diff-add-word: rgb(126 209 133 / 0.28);
    --ui-diff-del-bg: rgb(233 78 42 / 0.12);
    --ui-diff-del-word: rgb(233 78 42 / 0.32);
    --ui-diff-hunk-bg: rgb(139 191 245 / 0.1);

    /* Elevation: a faint top edge on raised surfaces; overlays keep a soft drop, their edge a
       light hairline of their own. */
    --ui-shadow-raised: inset 0 1px 0 rgb(255 255 255 / 0.04);
    --ui-shadow-overlay: 0 4px 16px -4px rgb(0 0 0 / 0.5);
    --ui-shadow-modal: 0 12px 40px -12px rgb(0 0 0 / 0.6);
    --ui-glass-bg: rgb(35 36 38 / 0.85);
    --ui-glass-line: rgb(255 255 255 / 0.08);

    /* Shell: the same glass, smoked, over the flat muted surface — the column comes out near
       the card surface, a step above the canvas, the way the dark ramp inverts the light one —
       and a dark rule parting it from the canvas; the rest keeps its base values */
    --ui-shell-field: var(--ui-surface-muted);
    --ui-shell-nav-bg: rgb(28 29 32 / 0.5);
    --ui-shell-line: rgb(0 0 0 / 0.4);

    /* Controls: the dark off track, and the body ink as the knob on it */
    --ui-switch-track: var(--color-gray-700);
    --ui-switch-knob: var(--ui-fg);

    /* Icons: the duotone body a little stronger on the dark page, and the hues lifted to the
       muted ink's lightness, chroma eased so none glows */
    --ui-icon-duo-opacity: 0.22;
    --ui-icon-tint-blue: oklch(72% 0.095 255);
    --ui-icon-tint-violet: oklch(72% 0.1 295);
    --ui-icon-tint-pink: oklch(72% 0.1 350);
    --ui-icon-tint-red: oklch(72% 0.11 22);
    --ui-icon-tint-orange: oklch(72% 0.105 50);
    --ui-icon-tint-amber: oklch(72% 0.1 80);
    --ui-icon-tint-green: oklch(72% 0.09 150);
    --ui-icon-tint-teal: oklch(72% 0.075 190);
    --ui-icon-tint-slate: oklch(72% 0.025 250);

    /* Focus, selection and scrollbar */
    --ui-focus-ring: 3px solid color-mix(in srgb, var(--ui-accent) 40%, transparent);
    --ui-focus-ring-input: 0 0 0 3px color-mix(in srgb, var(--ui-accent) 28%, transparent);
    --ui-selection-bg: rgb(139 191 245 / 0.28);
    --ui-scrollbar-thumb: rgb(255 255 255 / 0.16);
    --ui-scrollbar-thumb-hover: rgb(255 255 255 / 0.3);
  }

  /*
   * Style hooks (hooks.ts). A component opts into a hook with its class; this theme decides what
   * the hook does. These rules sit in \`ui-theme\`, after Tailwind's \`utilities\`, so a hook wins over
   * the utilities its component also carries — that is what lets \`.ui-live\` re-time an
   * \`animate-spin\`, \`.ui-glass\` replace a panel's opaque fill and \`.ui-shell\` re-paint the
   * window's columns.
   *
   * Frost gives fifteen of the seventeen a recipe: glass, eyebrow (its ink; the rung is
   * theme.css's), display, live, frame, underline-nav, shell, icon-decor, tree, field, activity,
   * notice, chart, stream, widget. \`.ui-scrim\` is a documented no-op: the page behind a dialog is
   * the host's dim alone. \`.ui-glyph\` needs none: the line drawings theme.css shows are Frost's
   * own, and their duotone bodies show through \`--ui-icon-duo-opacity\`.
   */

  /* Frosted transient layer: menus, popovers, tooltips and the floating composer — the small
     layers with content moving underneath, which is what a light frost shows. Not on cards or
     the login card; the navigation column's glass is the shell's (below), a plugin tile's its
     own anatomy (\`data-glass="tile"\`, below). Elevation stays the host's own shadow token; the
     edge is the glass hairline, barely there. */
  :root[data-theme="modern"] .ui-glass {
    background-color: var(--ui-glass-bg);
    -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(var(--ui-glass-saturate));
    backdrop-filter: blur(var(--ui-glass-blur)) saturate(var(--ui-glass-saturate));
    border-color: var(--ui-glass-line);
  }
  /* A dialog is opaque, unfrosted and edgeless, with the large corner, on a dimmed backdrop —
     the reference's About and settings dialogs: a page of its own to read, nothing of the page
     behind showing through (even at 96% the Settings dialog let the transcript's lines ghost
     through its rows). Menus, popovers and tooltips keep the frost at a translucency whose ink
     clears 4.5:1 on the worst backdrop — the contrast suite measures the glass over black in
     light and over white in dark. */
  :root[data-theme="modern"] .ui-glass[role="dialog"] {
    background-color: var(--ui-overlay);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    border-color: transparent;
    border-radius: var(--ui-radius-lg);
  }
  /* Frost parts a dialog by space and type, not by rules — as it parts a frame's head from its
     body — so the head and the foot draw none; a rule there would also stop short of the card's
     sides by the card's own hairline. */
  :root[data-theme="modern"]
    .ui-glass[role="dialog"]
    > :is([data-slot="head"], [data-slot="foot"]) {
    border-color: transparent;
  }
  /* With no rule under it, the head's padding and the body's would add up to a gap that parts
     the title from what it heads. The title sits above the body as a section title sits above
     its rows — three space units, as the settings pane spaces its title from the first row — and
     the body keeps two of them for the focus ring of a field at its top, which its scroller
     would otherwise clip. A headerless dialog (a confirmation) keeps the host's padding. */
  :root[data-theme="modern"]
    .ui-glass[role="dialog"]
    > [data-slot="head"]:has(+ [data-slot="body"]) {
    padding-bottom: var(--ui-space-unit);
  }
  :root[data-theme="modern"] .ui-glass[role="dialog"] > [data-slot="head"] + [data-slot="body"] {
    padding-top: calc(var(--ui-space-unit) * 2);
  }
  /* A plugin or skill tile is a small frosted tile in its own hue, on its host's corner. The
     host sets the hue as its ink, so \`currentColor\` is the tile's colour: a tenth of it is the
     glass, an inner glow of it deepens the tile toward its foot, a hairline of it is the edge, a
     white inner highlight lights the top, and a soft drop of it sets the tile on the card. The
     deepening is an inset shadow rather than a gradient — gradients belong to the hooks whose
     job needs one. */
  :root[data-theme="modern"] .ui-glass[data-glass="tile"] {
    background-color: color-mix(in oklab, currentColor 11%, transparent);
    border-color: transparent;
    box-shadow:
      inset 0 1px 0 0 rgb(255 255 255 / 0.8),
      inset 0 0 0 1px color-mix(in oklab, currentColor 16%, transparent),
      inset 0 -10px 14px -10px color-mix(in oklab, currentColor 20%, transparent),
      0 1px 2px color-mix(in oklab, currentColor 14%, transparent);
    -webkit-backdrop-filter: blur(8px) saturate(1.4);
    backdrop-filter: blur(8px) saturate(1.4);
  }
  :root[data-theme="modern"].dark .ui-glass[data-glass="tile"] {
    background-color: color-mix(in oklab, currentColor 14%, transparent);
    box-shadow:
      inset 0 1px 0 0 rgb(255 255 255 / 0.1),
      inset 0 0 0 1px color-mix(in oklab, currentColor 22%, transparent),
      inset 0 -10px 14px -10px color-mix(in oklab, currentColor 22%, transparent),
      0 1px 2px rgb(0 0 0 / 0.3);
  }
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    :root[data-theme="modern"] .ui-glass {
      background-color: color-mix(in srgb, var(--ui-overlay) 96%, transparent);
    }
  }
  @media (prefers-reduced-transparency: reduce) {
    :root[data-theme="modern"] .ui-glass {
      background-color: color-mix(in srgb, var(--ui-overlay) 96%, transparent);
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
    /* The tile's tint is laid on the card's own surface instead of let through. */
    :root[data-theme="modern"] .ui-glass[data-glass="tile"] {
      background-color: color-mix(in oklab, currentColor 11%, var(--ui-surface));
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
    :root[data-theme="modern"].dark .ui-glass[data-glass="tile"] {
      background-color: color-mix(in oklab, currentColor 14%, var(--ui-surface));
    }
  }

  /* A menu's rows — a Menu's items in a dropdown, a select's options — are inset bands rather
     than edge-to-edge ones: on the panel's large corner a full-width band is cut by the curve
     where the first or last row lights up. Each row stands one space unit in from the panel's
     sides (its block padding is the unit already) and is rounded concentric with the panel —
     the panel's radius less its hairline and that unit; the inset comes out of the row's own
     inline padding, so its text keeps the column a menu's label and separator line up with. */
  :root[data-theme="modern"] .ui-glass:not([role="dialog"]) [role="menu"] > [role^="menuitem"],
  :root[data-theme="modern"] .ui-glass[role="listbox"] > [role="option"] {
    width: calc(100% - 2 * var(--ui-space-unit));
    margin-inline: var(--ui-space-unit);
    padding-inline: calc(var(--ui-space-unit) * 2);
    border-radius: calc(var(--ui-radius-md) - var(--ui-border-w) - var(--ui-space-unit));
  }

  /* The scrim — the dimmed layer behind a dialog, drawer or sheet — is the host's dim
     (--ui-overlay-backdrop) alone: the page behind a dialog is dimmed, never frosted. Frost's
     frost is for the chrome a reader works in (the navigation column, the plugin tiles) and the
     small layers floating over content, and the dialog itself is opaque. No recipe. */

  /* Group label, in sentence case on the h6 rung (theme.css), in the muted ink. */
  :root[data-theme="modern"] .ui-eyebrow {
    color: var(--ui-fg-muted);
  }

  /* Regular-weight display title with tight tracking. */
  :root[data-theme="modern"] .ui-display {
    font-weight: 400;
    letter-spacing: -0.03em;
  }

  :root[data-theme="modern"] .ui-live {
    animation-timing-function: var(--ui-live-timing);
  }
  :root[data-theme="modern"] .ui-live[data-live="caret"] {
    animation-duration: 1.2s;
  }

  /* Tool cards, code blocks and the work group: rounded on the box scale with an edge that
     barely exists, the header inside the box with no fill or rule of its own — it takes the
     box's fill rather than none, because a work group's header sticks while its rows scroll
     under it and must stay opaque. */
  :root[data-theme="modern"] .ui-frame {
    border-radius: var(--ui-radius-md);
    border-color: var(--ui-line-muted);
  }
  :root[data-theme="modern"] .ui-frame > [data-slot="head"] {
    background-color: inherit;
    border-bottom-color: transparent;
  }

  /* An activity card — a frame headed by an activity row: the agent's work group, a harness
     event, a one-line note — is lineless in every state, the way Codex and macOS list work: no
     card border, no fill, and no rule anywhere in it — none under the head, none between the
     rows, none atop a row's expanded body (the \`body\` slot after an activity row is a fold: its
     track, the box inside the track, and the parts that box holds directly; a code block inside
     a part keeps its own box). Head and rows sit on the page, painted in its colour so they stay
     opaque while they stick, spaced by whitespace; a running step adds nothing but the sweep
     across its label. */
  :root[data-theme="modern"] .ui-frame:has(> .ui-activity) {
    border-color: transparent;
    background-color: transparent;
    box-shadow: none;
  }
  :root[data-theme="modern"] .ui-frame:has(> .ui-activity) > *,
  :root[data-theme="modern"] .ui-frame:has(> .ui-activity) .ui-activity ~ [data-slot="body"],
  :root[data-theme="modern"] .ui-frame:has(> .ui-activity) .ui-activity ~ [data-slot="body"] > *,
  :root[data-theme="modern"]
    .ui-frame:has(> .ui-activity)
    .ui-activity
    ~ [data-slot="body"]
    > *
    > *,
  :root[data-theme="modern"] .ui-frame:has(> .ui-activity) .ui-activity ~ [data-slot="under"] > * {
    border-color: transparent;
  }
  :root[data-theme="modern"] .ui-frame:has(> .ui-activity) > [data-slot="head"],
  :root[data-theme="modern"] .ui-frame:has(> .ui-activity) .ui-tree .ui-activity {
    border-radius: var(--ui-radius-sm);
    background-color: var(--ui-canvas);
  }
  /* No fill on hover or open either: a row that does something answers the pointer by lifting
     its words to the body ink, the line otherwise unchanged; a harness note or a server with
     nothing to open is held still. The keyboard ring is drawn inside the row, since the card
     clips at the row's own edges. */
  :root[data-theme="modern"]
    .ui-frame:has(> .ui-activity)
    > [data-slot="head"]:is(button, :has(button)):hover
    :is([data-slot="label"], [data-slot="detail"]),
  :root[data-theme="modern"]
    .ui-frame:has(> .ui-activity)
    .ui-tree
    .ui-activity:is(button, :has(button)):hover
    :is([data-slot="label"], [data-slot="detail"]) {
    color: var(--ui-fg);
  }
  :root[data-theme="modern"] .ui-frame:has(> .ui-activity) button.ui-activity:focus-visible {
    outline-offset: -3px;
  }
  /* No status marks: a step reads as its words, its details and the small chevron after them —
     the sweep across the label says it runs, the label at rest that it settled. An error keeps
     its mark, the danger cross beside the danger-ink label. */
  :root[data-theme="modern"] .ui-activity:not([data-state="error"]) [data-slot="mark"] {
    display: none;
  }
  :root[data-theme="modern"] .ui-frame:has(> .ui-activity) .ui-tree > [data-depth] {
    border-color: transparent;
    margin-block: var(--ui-stack-0);
  }

  /* Tabs: a rounded accent bar under the selected tab. */
  :root[data-theme="modern"] .ui-underline-nav [role="tab"] {
    position: relative;
    /* The marker below is the only one: the host's own bottom border (Primer's) gives way. */
    border-bottom-color: transparent;
  }
  :root[data-theme="modern"] .ui-underline-nav [role="tab"]::after {
    content: "";
    position: absolute;
    inset-inline: 0.5rem;
    bottom: -1px;
    height: 2px;
    border-radius: var(--ui-radius-pill);
    background-color: transparent;
    transition: background-color var(--ui-dur-fast) var(--ui-ease-out);
    pointer-events: none;
  }
  :root[data-theme="modern"] .ui-underline-nav [role="tab"]:hover::after {
    background-color: var(--ui-line);
  }
  :root[data-theme="modern"] .ui-underline-nav [role="tab"][aria-selected="true"]::after {
    background-color: var(--ui-accent);
  }

  /* The app window: the navigation column is frosted glass over the field, the main column and
     the dock the opaque canvas — the reading surface — with no rule between those two. The field
     is one flat colour painted on the window, so the glass shows it only where the column is, and
     the column is the same colour from top to bottom at every size: no wash and no gradient, so
     nothing in the chrome is there for atmosphere (owner, 2026-10-11). The column's edge is the
     host's rule in the faint shell line, with a hairline highlight just inside it, the glass's
     lit edge. The column carries no backdrop filter: the flat field is all that lies behind it,
     so a blur would change no pixel — and a backdrop filter would make the column a stacking
     context and a containing block for fixed descendants, which the window's columns must
     never be (they open menus). Under reduced transparency the column is the opaque muted
     surface. */
  :root[data-theme="modern"] .ui-shell {
    background-color: var(--ui-shell-field);
  }
  :root[data-theme="modern"] .ui-shell > [data-slot="nav"] {
    background-color: var(--ui-shell-nav-bg);
    border-color: var(--ui-shell-line);
    box-shadow: inset -1px 0 0 rgb(255 255 255 / 0.7);
  }
  :root[data-theme="modern"].dark .ui-shell > [data-slot="nav"] {
    box-shadow: inset -1px 0 0 rgb(255 255 255 / 0.05);
  }
  @media (prefers-reduced-transparency: reduce) {
    :root[data-theme="modern"] .ui-shell > [data-slot="nav"],
    :root[data-theme="modern"].dark .ui-shell > [data-slot="nav"] {
      background-color: var(--ui-surface-muted);
      box-shadow: none;
    }
  }
  :root[data-theme="modern"] .ui-shell > [data-slot="main"],
  :root[data-theme="modern"] .ui-shell > [data-slot="dock"] {
    margin: var(--ui-shell-gap);
    border-radius: var(--ui-shell-radius);
    border-color: transparent;
    background-color: var(--ui-shell-main-bg);
    box-shadow: var(--ui-shell-shadow);
    overflow: clip;
  }
  :root[data-theme="modern"] .ui-shell > [data-slot="nav"] + [data-slot="main"],
  :root[data-theme="modern"] .ui-shell > [data-slot="main"] + [data-slot="dock"] {
    margin-inline-start: 0;
  }
  /* Decorative icons wear their glyph's hue (\`data-tint\`, from ICON_TINTS): a nav row's, a group
     header's and an empty state's icon is coloured by the concept it stands for, soft beside a
     label in the body ink, its duotone body following the same hue. A decorative icon whose
     path is not a registry glyph has no tint and keeps the muted ink; a menu row's icon keeps
     the row's own ink (a danger row's stays as red as its label). Ink only: no tinted chip
     behind an icon. */
  :root[data-theme="modern"] .ui-icon-decor:not([data-role="menu"]) {
    color: var(--ui-fg-muted);
  }
  :root[data-theme="modern"] .ui-icon-decor[data-tint="blue"]:not([data-role="menu"]) {
    color: var(--ui-icon-tint-blue);
  }
  :root[data-theme="modern"] .ui-icon-decor[data-tint="violet"]:not([data-role="menu"]) {
    color: var(--ui-icon-tint-violet);
  }
  :root[data-theme="modern"] .ui-icon-decor[data-tint="pink"]:not([data-role="menu"]) {
    color: var(--ui-icon-tint-pink);
  }
  :root[data-theme="modern"] .ui-icon-decor[data-tint="red"]:not([data-role="menu"]) {
    color: var(--ui-icon-tint-red);
  }
  :root[data-theme="modern"] .ui-icon-decor[data-tint="orange"]:not([data-role="menu"]) {
    color: var(--ui-icon-tint-orange);
  }
  :root[data-theme="modern"] .ui-icon-decor[data-tint="amber"]:not([data-role="menu"]) {
    color: var(--ui-icon-tint-amber);
  }
  :root[data-theme="modern"] .ui-icon-decor[data-tint="green"]:not([data-role="menu"]) {
    color: var(--ui-icon-tint-green);
  }
  :root[data-theme="modern"] .ui-icon-decor[data-tint="teal"]:not([data-role="menu"]) {
    color: var(--ui-icon-tint-teal);
  }
  :root[data-theme="modern"] .ui-icon-decor[data-tint="slate"]:not([data-role="menu"]) {
    color: var(--ui-icon-tint-slate);
  }

  /* Nested rows sit against a soft guide inside the host's own card: each row past its tree's
     first level indents on the tree tokens and draws a hairline down its parent's column — half
     an indent before its own content — and a branch continues its parent's guide alongside the
     rows it holds, so every ancestor's guide runs the whole way down. No elbows and no box of
     its own. The first level is the tree's base (theme.css): a file tree's roots sit at the
     inset, and a work group's steps, which hang off the header, sit flush with it — their
     icons in the header's icon column, no gutter and no guide, the card alone holding them. */
  :root[data-theme="modern"] .ui-tree [data-depth]:not([data-branch]) {
    position: relative;
    padding-inline-start: calc(
      var(--_lead) + var(--ui-tree-indent) * (var(--_depth) - var(--_base))
    );
  }
  :root[data-theme="modern"] .ui-tree [data-depth]:not([data-branch], [data-depth="0"])::before {
    content: "";
    position: absolute;
    inset-block: 0;
    inset-inline-start: calc(
      var(--_lead) + var(--ui-tree-indent) * (var(--_depth) - var(--_base) - 0.5)
    );
    border-inline-start: var(--ui-border-w) solid var(--ui-tree-guide);
    pointer-events: none;
  }
  :root[data-theme="modern"] .ui-tree [data-branch] {
    position: relative;
  }
  :root[data-theme="modern"]
    .ui-tree
    [data-branch]:not([data-depth="0"], [data-depth="1"])::before {
    content: "";
    position: absolute;
    inset-block: 0;
    inset-inline-start: calc(
      var(--_lead) + var(--ui-tree-indent) * (var(--_depth) - var(--_base) - 1.5)
    );
    border-inline-start: var(--ui-border-w) solid var(--ui-tree-guide);
    pointer-events: none;
  }
  /* In a tree that starts a level in, its first level has no parent column to draw on. */
  :root[data-theme="modern"] .ui-tree:not(:has([data-depth="0"])) [data-depth="1"]::before,
  :root[data-theme="modern"]
    .ui-tree:not(:has([data-depth="0"]))
    [data-branch][data-depth="2"]::before {
    content: none;
  }

  /* A labelled control row is a band in a grouped block, the way the reference lists its
     settings: the muted fill, the row's own padding, the label beside its control (the host's
     layout), the host's faint divider between rows, and the block's corners rounded on its first
     and last rows. Grouping by fill, not by border. */
  :root[data-theme="modern"] .ui-field {
    padding: var(--ui-row-py) var(--ui-row-px);
    background-color: var(--ui-surface-muted);
  }
  :root[data-theme="modern"] .ui-field:first-child {
    border-start-start-radius: var(--ui-radius-md);
    border-start-end-radius: var(--ui-radius-md);
  }
  :root[data-theme="modern"] .ui-field:last-child {
    border-end-start-radius: var(--ui-radius-md);
    border-end-end-radius: var(--ui-radius-md);
  }

  /* Work in progress is shown the way Codex and macOS show it: nothing around the row — no
     fill, no border, no ring, no halo (a first pass drew a luminous surface; the owner asked
     for the lineless version) — and a soft highlight in the accent's hue sweeping across the
     label, the one running signal once the status mark is hidden (above). The band is the
     accent mixed toward the page, so it stands off the ink whatever the accent: the theme's own
     accent is the ink itself, and the band would vanish into it. At rest (done, error) the row
     is its plain words, so a finished transcript adds nothing. The highlight is a gradient
     clipped to the label's glyphs and slid across them; parked at either end it shows only the
     ink, which is what reduced motion shows: a plain label. The slots are found anywhere inside
     the row (a card nests them in its own button); a work group's header shares the recipe with
     its rows. */
  :root[data-theme="modern"] .ui-activity[data-state="running"] [data-slot="label"] {
    color: var(--ui-fg);
    background-image: linear-gradient(
      90deg,
      currentColor 0 38%,
      color-mix(in oklab, var(--ui-accent) 55%, var(--ui-canvas)) 50%,
      currentColor 62% 100%
    );
    background-size: 300% 100%;
    background-position: 100% 0;
    background-repeat: no-repeat;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: ui-frost-shimmer 2.8s var(--ui-ease-in-out) infinite;
  }
  @keyframes ui-frost-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0% 0;
    }
  }

  /* A reply still arriving surfaces through a soft veil, so the newest words read as fading in
     (the reveal paces them word by word): over the trailing line and a half a gradient runs from
     nothing to the page's own colour at four tenths, so how faint a line is says how new it is —
     no line, no box, no band where the veil stops, and nothing under it: a glow there would sit
     on the middle of the block whatever its newest words were, saying nothing. The text moving
     up through it is the only motion; each line brightens as it leaves.
     The veil is the host's \`::after\`, drawn only while the stream's caret is the host's last
     child: the caret marks where the text ends, so what the host appends after it (a stop
     reason, a files card) is never veiled; the caret itself is not shown. On \`done\` — or once
     something follows the caret — the veil eases away over the reveal duration: the fade runs
     on opacity, and a discrete \`step-end\` transition holds the gradient until the fade is over,
     so the last lines settle into full ink instead of snapping. A reply that mounts finished
     carries only an empty, transparent layer. Under reduced motion the veil is not drawn. */
  :root[data-theme="modern"] .ui-stream {
    position: relative;
  }
  :root[data-theme="modern"] .ui-stream > [data-slot="caret"] {
    display: none;
  }
  :root[data-theme="modern"] .ui-stream::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-size: 100% 1.5lh;
    background-position: bottom;
    background-repeat: no-repeat;
    opacity: 0;
    transition:
      opacity var(--ui-dur-reveal) var(--ui-ease-out),
      background-image var(--ui-dur-reveal) step-end allow-discrete;
  }
  :root[data-theme="modern"]
    .ui-stream[data-state="streaming"]:has(> [data-slot="caret"]:last-child)::after {
    opacity: 1;
    /* The veil says which lines are newest. deslop-ignore-next-line 06 */
    background-image: linear-gradient(
      to bottom,
      transparent,
      color-mix(in srgb, var(--ui-canvas) 40%, transparent)
    );
    transition: opacity var(--ui-dur-reveal) var(--ui-ease-out);
  }
  :root[data-theme="modern"][data-motion="reduced"] .ui-stream::after {
    display: none;
  }
  @media (prefers-reduced-motion: reduce) {
    :root[data-theme="modern"] .ui-stream::after {
      display: none;
    }
  }

  /* A notice is a soft card: the overlay surface under the overlay's shadow, no coloured border
     and no tinted fill — the tone is one small dot of its ink at the start (a toast is a button;
     the dot is its \`::before\`, which a button draws too). The dot sits out of the flow,
     absolutely at the row's inset with the host padded to make room, because a host lays its
     body and actions out as a flex row — a dot in the flow would be a third item and push the
     body to the middle. A toast that also carries \`ui-glass\` frosts like every other floating
     layer. */
  :root[data-theme="modern"] .ui-notice {
    position: relative;
    padding-inline-start: calc(var(--ui-row-px) + 1.125em);
    border-color: transparent;
    border-radius: var(--ui-radius-lg);
    background-color: var(--ui-overlay);
    box-shadow: var(--ui-shadow-overlay);
    color: var(--ui-fg);
  }
  /* The host's own leading mark gives way to the dot: two marks would say the same thing. */
  :root[data-theme="modern"] .ui-notice [data-slot="icon"] {
    display: none;
  }
  :root[data-theme="modern"] .ui-notice::before {
    content: "";
    position: absolute;
    inset-inline-start: var(--ui-row-px);
    top: 50%;
    width: 0.5em;
    height: 0.5em;
    margin-top: -0.25em;
    border-radius: var(--ui-radius-pill);
    background-color: var(--_tone-fg);
  }

  /* A notice laid edge to edge (a banner) is still a rounded card here, so it stands off the
     column's edges and whatever sits beside it instead of butting its corners against them —
     with the same room above and below. What the page renders after it paints over anything
     reaching past its margin (a page's own header or background is positioned, the banner is
     not raised: chrome makes no stacking context), so the banner's shadow is fitted to that
     room: a contact shadow and a soft drop that fades out within about ten pixels below, inside
     the two and a half units of margin at every font-size tier, instead of the overlay shadow
     a toast floats on, which reaches twice as far. */
  :root[data-theme="modern"] .ui-notice[data-banner] {
    margin: calc(var(--ui-space-unit) * 2.5) calc(var(--ui-space-unit) * 3);
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.04),
      0 3px 10px -3px rgb(0 0 0 / 0.1);
  }
  :root[data-theme="modern"].dark .ui-notice[data-banner] {
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.3),
      0 3px 10px -3px rgb(0 0 0 / 0.45);
  }

  /* Folds: the chevron sits right after the row's words rather than at its far edge; a tool row
     shows its inline chevron and drops the one at its end. */
  :root[data-theme="modern"] .ui-activity [data-slot="toggle"] {
    order: 0;
    display: flex;
  }
  :root[data-theme="modern"] .ui-activity [data-slot="toggle-end"] {
    display: none;
  }

  /* Charts: the chart primitives write everything a token can say — colours, widths, radii,
     opacities, the curve — so the recipe owns only what a token cannot: lines join and end
     round, a line's area fades to nothing towards the baseline (a mask, the one gradient a
     chart may paint), and a point wears a thin ring of the surface. */
  :root[data-theme="modern"] .ui-chart :is(path, polyline)[data-part="series"] {
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  :root[data-theme="modern"] .ui-chart [data-part="area"] {
    /* The area fades towards its baseline: the data's shape. deslop-ignore-next-line 06 */
    -webkit-mask-image: linear-gradient(to bottom, #000000, transparent);
    /* deslop-ignore-next-line 06 */
    mask-image: linear-gradient(to bottom, #000000, transparent);
  }
  :root[data-theme="modern"] .ui-chart [data-part="point"] {
    stroke: var(--ui-surface);
    stroke-width: 1.5;
  }

  /* Widgets: a glanceable reading as a soft tile — no hairline, the muted fill with white tiles
     inside, and numerals at the regular weight with tight tracking, the way Frost sets a title
     large. The box radius is the host's md rung, so its p-3 clears the corners. */
  :root[data-theme="modern"] .ui-widget {
    border-color: transparent;
    background-color: var(--ui-surface-muted);
  }
  :root[data-theme="modern"] .ui-widget [data-tile] {
    background-color: var(--ui-surface);
  }
  :root[data-theme="modern"] .ui-widget [data-figure] {
    font-weight: var(--ui-weight-body);
    letter-spacing: -0.02em;
  }

  /* MiSans ships Regular (400) and Medium (500) only. A heavier request renders in Medium rather
     than as a synthesized bold, which smears Han strokes; Frost's own weights stop at 500. */
  :root[data-theme="modern"] {
    font-synthesis-weight: none;
  }
}

/*
 * The user's accent presets (tokens.ts, \`ACCENT_PRESETS.modern\`), six: the forest green the
 * theme shipped with (first, as Console lists its orange) and five warm, muted hues, each deep
 * enough in light for the theme's white label and lifted in dark for its dark ink, the way the
 * theme's own accent flips. A preset sets \`--ui-accent\` and nothing else — hover, active, wash
 * and line derive from it in the theme's rules above, and the label ink is the theme's for the
 * mode — so each preset is one value per mode. The selectors match only Frost's root, so a
 * preset another theme lists paints nothing here.
 */
@layer ui-accent {
  :root[data-theme="modern"][data-accent="forest"] {
    --ui-accent: #006838;
  }
  :root[data-theme="modern"][data-accent="forest"].dark {
    --ui-accent: #4aa45c;
  }
  :root[data-theme="modern"][data-accent="ocean"] {
    --ui-accent: #3b6ea8;
  }
  :root[data-theme="modern"][data-accent="ocean"].dark {
    --ui-accent: #7fa9df;
  }
  :root[data-theme="modern"][data-accent="clay"] {
    --ui-accent: #b8552f;
  }
  :root[data-theme="modern"][data-accent="clay"].dark {
    --ui-accent: #e08a66;
  }
  :root[data-theme="modern"][data-accent="plum"] {
    --ui-accent: #7a4d8f;
  }
  :root[data-theme="modern"][data-accent="plum"].dark {
    --ui-accent: #b78fd0;
  }
  :root[data-theme="modern"][data-accent="honey"] {
    --ui-accent: #96660f;
  }
  :root[data-theme="modern"][data-accent="honey"].dark {
    --ui-accent: #d9ab4a;
  }
  :root[data-theme="modern"][data-accent="slate"] {
    --ui-accent: #5c6470;
  }
  :root[data-theme="modern"][data-accent="slate"].dark {
    --ui-accent: #9ea6b3;
  }
}
`;function h({title:a,aside:n,action:t,children:s}){return e.jsxs("section",{className:"gf-group",children:[e.jsxs("div",{className:"gf-group-head",children:[e.jsx("h3",{children:a}),n!==void 0&&e.jsx("span",{className:"gf-aside",children:n}),t!==void 0&&e.jsx("span",{className:"gf-group-action",children:t})]}),s]})}function Yn({children:a,style:n,className:t}){const s=d.useRef(null),[i,r]=d.useState(null);return d.useLayoutEffect(()=>{const o=s.current;if(!o)return;const l=()=>r(Math.round(o.getBoundingClientRect().height*10)/10);l();const c=new ResizeObserver(l);return c.observe(o),()=>c.disconnect()},[]),e.jsxs("span",{className:"gf-measured",children:[e.jsx("span",{ref:s,className:t,style:n,children:a}),e.jsx("span",{className:"gf-caption gf-mono",children:i===null?"…":`${i}px`})]})}function ie({d:a,size:n=16}){const t={strokeWidth:"var(--ui-icon-stroke)",strokeLinecap:"var(--ui-icon-cap)",strokeLinejoin:"var(--ui-icon-join)"};return e.jsx("svg",{width:n,height:n,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",style:t,"aria-hidden":!0,className:"gf-glyph",children:e.jsx("path",{d:a})})}const W={newChat:"M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",agents:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",models:"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",folder:"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",file:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",chevronDown:"m6 9 6 6 6-6",chevronRight:"m9 18 6-6-6-6",pin:"M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"},he=[W.newChat,W.agents,W.models];function me({onClick:a,label:n}){const{S:t}=y();return e.jsx("button",{type:"button",className:"gf-replay",onClick:a,children:n??t.foundations.replay})}function qt(){const{S:a,state:n}=y(),[t,s,i]=a.foundations.motionSpecimens.sidebarRows,r=q[n.lang];return e.jsxs("div",{className:"ui-shell gf-shell",children:[e.jsxs("div",{"data-slot":"nav",className:"gf-shell-nav",children:[e.jsx("span",{className:"gf-shell-row","aria-current":"page",children:t}),e.jsx("span",{className:"gf-shell-row",children:s}),e.jsx("span",{className:"gf-shell-row",children:i})]}),e.jsxs("div",{"data-slot":"main",className:"gf-shell-main",children:[e.jsx("strong",{className:"gf-shell-title",children:r.heading}),e.jsx("p",{className:"gf-shell-text",children:r.ui})]})]})}const Ki=["--ui-canvas","--ui-surface","--ui-surface-muted","--ui-inset"],Ji=["--ui-fg","--ui-fg-muted","--ui-fg-subtle"],Yi=["--ui-line","--ui-line-muted","--ui-line-emphasis"],Qi={github:Ui,modern:Vi,geek:Gi};function Zi(a,n,t){const s=Qi[a],i={},r=o=>{const l=o?String.raw`\.dark`:"",c=new RegExp(String.raw`\[data-accent="${n}"\]${l}\s*\{([^}]*)\}`).exec(s)?.[1]??"";for(const u of c.matchAll(/(--ui-accent[\w-]*):\s*([^;]+);/g))i[u[1]]=u[2].trim()};return r(!1),t==="dark"&&r(!0),i}const G=(a,n)=>`var(--ui-tone-${a}-${n})`,Qn=[72,48,88,36,60,24];function Xi(){const{S:a}=y();return e.jsxs("div",{children:[e.jsxs("div",{className:"gf-surfaces-head gf-caption",children:[e.jsx("span",{}),e.jsx("span",{children:a.foundations.inks}),e.jsx("span",{children:a.foundations.lines})]}),e.jsx("div",{className:"gf-surfaces",children:Ki.map(n=>e.jsxs("div",{className:"gf-surface",style:{background:`var(${n})`},children:[e.jsx("code",{className:"gf-caption gf-mono",children:n.slice(5)}),e.jsx("span",{className:"gf-inks",children:Ji.map((t,s)=>e.jsx("span",{style:{color:`var(${t})`},children:a.foundations.inkWords[s]},t))}),e.jsx("span",{className:"gf-lines",children:Yi.map(t=>e.jsx("span",{className:"gf-line",style:{borderColor:`var(${t})`},children:e.jsx("span",{className:"gf-caption gf-mono",children:t==="--ui-line"?"line":t.slice(10)})},t))})]},n))})]})}function er(){const{S:a,state:n,mode:t}=y(),s=[{key:"theme",label:a.foundations.themeAccent,style:{}},...yt[n.theme].map(i=>({key:i.id,label:i.id,style:Zi(n.theme,i.id,t)}))];return e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"gf-accents",children:s.map(i=>e.jsxs("div",{className:"gf-accent",style:i.style,children:[e.jsx("span",{className:"gf-caption gf-mono",children:i.label}),e.jsx("span",{className:"gf-accent-button",children:a.foundations.sampleSend}),e.jsx("span",{className:"gf-accent-row",children:a.foundations.selectedRow})]},i.key))}),e.jsxs("p",{className:"gf-links",children:[e.jsx("a",{href:"#colour",onClick:i=>i.preventDefault(),className:"gf-link",children:a.foundations.sampleLink}),e.jsx("span",{className:"gf-link","data-hover":!0,children:a.foundations.sampleLink}),e.jsx("span",{className:"gf-caption",children:a.foundations.linkHover})]})]})}function nr(){const{S:a}=y();return e.jsx("div",{className:"gf-tones",children:je.map(n=>{const t=a.foundations.toneWords[n];return e.jsxs("div",{className:"gf-tone",children:[e.jsx("code",{className:"gf-caption gf-mono",children:n}),e.jsxs("span",{className:"gf-tone-mark",style:{color:G(n,"fg")},children:[e.jsx("span",{className:"gf-dot"}),t]}),e.jsx("span",{className:"gf-badge",style:{color:G(n,"fg"),background:G(n,"bg")},children:t}),e.jsx("span",{className:"gf-badge",style:{color:G(n,"fg"),borderColor:G(n,"line"),background:"transparent"},children:t}),e.jsx("span",{className:"gf-badge",style:{color:G(n,"emphasis-fg"),background:G(n,"emphasis"),borderColor:G(n,"emphasis")},children:t})]},n)})})}function tr(){const{S:a}=y();return e.jsxs("div",{className:"gf-charts",children:[e.jsxs("div",{children:[e.jsx("div",{className:"gf-bars",role:"img","aria-label":a.foundations.charts,children:Qn.map((n,t)=>e.jsx("span",{className:"gf-bar",style:{height:`${n}%`,background:`var(--ui-chart-${t+1})`}},t))}),e.jsx("div",{className:"gf-bar-captions gf-caption gf-mono",children:Qn.map((n,t)=>e.jsx("span",{children:t+1},t))})]}),e.jsxs("div",{className:"gf-stacked",children:[e.jsx("span",{className:"gf-caption",children:a.foundations.tokenSeries}),e.jsxs("span",{className:"gf-stacked-bar",children:[e.jsx("span",{style:{flexGrow:62,background:"var(--ui-chart-cache-read)"}}),e.jsx("span",{style:{flexGrow:14,background:"var(--ui-chart-cache-write)"}}),e.jsx("span",{style:{flexGrow:24,background:"var(--ui-chart-output)"}})]}),e.jsx("span",{className:"gf-legend gf-caption",children:["cache-read","cache-write","output"].map(n=>e.jsxs("span",{children:[e.jsx("span",{className:"gf-swatch",style:{background:`var(--ui-chart-${n})`}}),n]},n))})]})]})}function ar(){const{S:a}=y(),n=a.foundations.codeLines;return e.jsxs("div",{className:"gf-code",children:[e.jsxs("div",{className:"gf-code-line",style:{background:"var(--ui-diff-hunk-bg)"},children:[e.jsx("span",{className:"gf-gutter"}),e.jsx("span",{className:"gf-subtle",children:"@@ -38,3 +38,5 @@"})]}),e.jsxs("div",{className:"gf-code-line",style:{background:"var(--ui-diff-del-bg)"},children:[e.jsx("span",{className:"gf-gutter",children:"38"}),e.jsxs("span",{children:[n.before,e.jsx("mark",{style:{background:"var(--ui-diff-del-word)"},children:n.removed}),n.after]})]}),e.jsxs("div",{className:"gf-code-line",style:{background:"var(--ui-diff-add-bg)"},children:[e.jsx("span",{className:"gf-gutter",children:"38"}),e.jsxs("span",{children:[n.before,e.jsx("mark",{style:{background:"var(--ui-diff-add-word)"},children:n.added}),n.after]})]}),e.jsxs("div",{className:"gf-code-line",children:[e.jsx("span",{className:"gf-gutter",children:"39"}),e.jsx("span",{children:e.jsx("mark",{style:{background:"var(--ui-code-selection)"},children:n.selected})})]})]})}function sr(){const{S:a}=y();return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:a.foundations.surfaces,children:e.jsx(Xi,{})}),e.jsx(h,{title:a.foundations.accent,aside:a.foundations.presetsHint,children:e.jsx(er,{})}),e.jsx(h,{title:a.foundations.tones,children:e.jsx(nr,{})}),e.jsxs("div",{className:"gf-pair",children:[e.jsx(h,{title:a.foundations.charts,children:e.jsx(tr,{})}),e.jsx(h,{title:a.foundations.code,children:e.jsx(ar,{})})]})]})}const ir={sun:"M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41",type:"M4 7V4h16v3M9 20h6M12 4v16",bell:"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",globe:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"};function ee({step:a}){return e.jsx("div",{className:"gf-gap",style:{height:`var(--ui-stack-${a})`},children:e.jsxs("span",{className:"gf-gap-label gf-caption gf-mono",children:["stack-",a]})})}function ve({glyph:a,label:n,value:t}){return e.jsxs("div",{className:"gf-pref",children:[e.jsxs("span",{className:"gf-pref-label",children:[e.jsx(ie,{d:ir[a],size:15}),e.jsx("span",{className:"gf-gap-inline",style:{width:"var(--ui-stack-0)"}}),n]}),t]})}function We({options:a,value:n}){return e.jsx("span",{className:"gf-segmented",children:a.map((t,s)=>e.jsx("span",{"data-active":s===n||void 0,children:t},t))})}const rr=[{rung:"sm",text:"small"},{rung:"md",text:"body"},{rung:"lg",text:"body"}],or=[1,2,4,8];function lr(){const{S:a}=y(),n=a.foundations.spacingPage;return e.jsxs("div",{className:"gf-board",children:[e.jsxs("div",{className:"gf-ruler",children:[e.jsx("h3",{className:"gf-page-title",children:n.title}),e.jsx(ee,{step:4}),e.jsx("h4",{className:"gf-section-title",children:n.appearance}),e.jsx(ee,{step:2}),e.jsx(ve,{glyph:"sun",label:n.theme,value:e.jsx(We,{options:n.themeOptions,value:2})}),e.jsx(ee,{step:1}),e.jsx(ve,{glyph:"type",label:n.fontSize,value:e.jsx(We,{options:n.sizeOptions,value:1})}),e.jsx(ee,{step:3}),e.jsx("h4",{className:"gf-section-title",children:n.general}),e.jsx(ee,{step:2}),e.jsx(ve,{glyph:"globe",label:n.language,value:e.jsx(We,{options:n.languageOptions,value:0})}),e.jsx(ee,{step:1}),e.jsx(ve,{glyph:"bell",label:n.notifications,value:e.jsx("span",{className:"gf-switch","data-on":!0})}),e.jsx("p",{className:"gf-caption gf-note gf-ruler-note",children:a.foundations.stack0Note})]}),e.jsx(h,{title:a.foundations.spaceUnit,aside:a.foundations.spaceUnitNote,children:e.jsx("div",{className:"gf-units",children:or.map(t=>e.jsxs("span",{className:"gf-unit",children:[e.jsxs("span",{className:"gf-caption gf-mono",children:["× ",t]}),e.jsx(Yn,{className:"gf-unit-bar",style:{height:`calc(var(--ui-space-unit) * ${t})`}})]},t))})}),e.jsx(h,{title:a.foundations.controlHeights,children:e.jsx("div",{className:"gf-rungs",children:rr.map(({rung:t,text:s})=>e.jsxs("span",{className:"gf-rung",children:[e.jsx("span",{className:"gf-caption gf-mono",children:t}),e.jsx(Yn,{className:"gf-control",style:{paddingBlock:`var(--ui-control-py-${t})`,paddingInline:`var(--ui-control-px-${t})`,fontSize:`var(--ui-text-${s}-size)`,lineHeight:`var(--ui-text-${s}-lh)`},children:a.foundations.scene.primary})]},t))})})]})}function cr(){const{S:a,state:n}=y(),t=q[n.lang],s=t.paragraph,i=s.indexOf(" ",20)>0?s.indexOf(" ",20)+1:20,r=s.indexOf(" ",i+30)>0?s.indexOf(" ",i+30):i+30;return e.jsxs("div",{className:"gf-board",children:[e.jsxs("div",{className:"gf-pair",children:[e.jsx(h,{title:a.foundations.focusRing,children:e.jsxs("div",{className:"gf-controls",children:[e.jsx("span",{className:"gf-button gf-focused","data-variant":"primary",children:a.foundations.scene.primary}),e.jsx("span",{className:"gf-button gf-focused",children:a.foundations.scene.secondary}),e.jsx("span",{className:"gf-link gf-focused",children:a.foundations.sampleLink})]})}),e.jsx(h,{title:a.foundations.inputFocus,children:e.jsx("span",{className:"gf-input gf-input-focused",children:a.foundations.scene.input})})]}),e.jsxs("div",{className:"gf-pair",children:[e.jsx(h,{title:a.foundations.selection,children:e.jsxs("p",{className:"gf-selection",children:[s.slice(0,i),e.jsx("mark",{children:s.slice(i,r)}),s.slice(r)]})}),e.jsx(h,{title:a.foundations.scrollbar,children:e.jsx("div",{className:"gf-scroll",tabIndex:0,children:Array.from({length:12},(o,l)=>e.jsx("p",{children:t.ui},l))})})]})]})}function _({name:a,children:n}){const{S:t}=y();return e.jsxs("section",{className:"gf-hook",children:[e.jsxs("div",{className:"gf-group-head",children:[e.jsxs("h3",{className:"gf-mono",children:[".",a]}),e.jsx("span",{className:"gf-aside",children:t.foundations.hookJobs[a]})]}),e.jsx("div",{className:"gf-hook-body",children:n})]})}const dr=a=>({paddingInlineStart:`calc(var(--ui-tree-inset) + var(--ui-tree-indent) * ${a})`});function we({depth:a,last:n=!1,dir:t=!1,open:s=!1,children:i}){return e.jsxs("div",{className:"gh-tree-row","data-depth":a,"data-last":n||void 0,style:dr(a),children:[t?e.jsx(ie,{d:s?W.chevronDown:W.chevronRight,size:12}):e.jsx("span",{className:"gh-tree-gap"}),e.jsx(ie,{d:t?W.folder:W.file,size:14}),e.jsx("span",{className:"gh-tree-name",children:i})]})}function hr(){const{state:a,S:n}=y(),t=q[a.lang],s=n.foundations.hookSamples;return e.jsxs("div",{className:"gf-hooks",children:[e.jsx(_,{name:"ui-glass",children:e.jsxs("div",{className:"gh-stage",children:[e.jsx("p",{className:"gh-stage-text","aria-hidden":!0,children:t.paragraph}),e.jsx("div",{className:"ui-glass gh-panel",role:"menu",children:s.menu.map((i,r)=>e.jsx("span",{className:"gh-menu-row","data-active":r===1||void 0,children:i},i))})]})}),e.jsx(_,{name:"ui-eyebrow",children:e.jsxs("div",{className:"gh-list",children:[e.jsx("p",{className:"ui-eyebrow gh-eyebrow",children:s.group}),s.rows.map(i=>e.jsx("span",{className:"gh-list-row",children:i},i))]})}),e.jsxs(_,{name:"ui-display",children:[e.jsx("h1",{className:"ui-display gh-display",lang:"en",children:q.en.display}),e.jsx("h1",{className:"ui-display gh-display",lang:"zh-CN",children:q.zh.display})]}),e.jsx(_,{name:"ui-live",children:e.jsxs("div",{className:"gh-row",children:[e.jsxs("span",{children:[s.streaming,e.jsx(St,{})]}),e.jsxs("span",{className:"gh-live",children:[e.jsx(ue,{tone:"success",pulse:!0}),n.foundations.toneWords.success]}),e.jsxs("span",{className:"gh-live",children:[e.jsx(Ct,{size:"sm",tone:"success",label:n.foundations.loading}),n.foundations.loading]})]})}),e.jsxs(_,{name:"ui-frame",children:[e.jsxs("div",{className:"ui-frame gh-frame",children:[e.jsxs("div",{"data-slot":"head",className:"gh-frame-head",children:[e.jsx("span",{className:"gf-mono",children:"claude-code-expert/src/rag.ts"}),e.jsx("span",{children:s.copy})]}),e.jsx("pre",{"data-slot":"body",className:"gh-frame-body",children:t.code.split(`
`).slice(0,2).join(`
`)}),e.jsx("div",{"data-slot":"foot",className:"gh-frame-foot",children:e.jsx("span",{className:"gf-mono",children:"412ms · exit 0"})})]}),e.jsxs("div",{className:"ui-frame gh-frame gh-frame-panes",children:[e.jsx("div",{"data-slot":"pane",children:q.en.ui}),e.jsx("div",{"data-slot":"pane",children:q.zh.ui})]})]}),e.jsx(_,{name:"ui-underline-nav",children:e.jsx("div",{className:"ui-underline-nav gh-tabs",role:"tablist",children:s.tabs.map((i,r)=>e.jsx("span",{role:"tab","aria-selected":r===0,className:"gh-tab",children:i},i))})}),e.jsx(_,{name:"ui-shell",children:e.jsx(qt,{})}),e.jsx(_,{name:"ui-icon-decor",children:e.jsxs("div",{className:"gh-nav",children:[n.foundations.motionSpecimens.sidebarRows.map((i,r)=>e.jsxs("span",{className:"gh-nav-row","aria-current":r===0?"page":void 0,children:[e.jsx("span",{className:"ui-icon-decor gh-nav-glyph","data-role":"nav",children:e.jsx(ie,{d:he[r%he.length]??he[0],size:16})}),i]},i)),e.jsxs("span",{className:"gh-nav-group",children:[e.jsx("span",{className:"ui-icon-decor gh-nav-glyph","data-role":"group",children:e.jsx(ie,{d:W.folder,size:14})}),e.jsx("span",{className:"ui-eyebrow gh-nav-group-label",children:s.group})]}),e.jsxs("span",{className:"gh-nav-row gh-nav-menu",children:[e.jsx("span",{className:"ui-icon-decor gh-nav-glyph","data-role":"menu",children:e.jsx(ie,{d:W.pin,size:14})}),s.menu[0]]})]})}),e.jsx(_,{name:"ui-tree",children:e.jsxs("div",{className:"ui-tree gh-tree",children:[e.jsx(we,{depth:0,dir:!0,open:!0,children:s.tree.root}),e.jsxs("div",{"data-branch":!0,"data-depth":1,children:[e.jsx(we,{depth:1,dir:!0,open:!0,children:s.tree.dir}),e.jsx("div",{"data-branch":!0,"data-depth":2,children:s.tree.files.map((i,r)=>e.jsx(we,{depth:2,last:r===s.tree.files.length-1,children:i},i))}),e.jsx(we,{depth:1,last:!0,children:s.tree.last})]})]})}),e.jsx(_,{name:"ui-field",children:e.jsxs("div",{className:"gh-fields",children:[e.jsxs("div",{className:"ui-field gh-field",children:[e.jsx("span",{"data-slot":"label",className:"gh-field-label",children:s.field.name}),e.jsx("div",{"data-slot":"control",children:e.jsx("span",{className:"gh-field-input",children:s.field.value})}),e.jsx("span",{"data-slot":"hint",className:"gf-caption",children:s.field.hint})]}),e.jsxs("div",{className:"ui-field gh-field-row",children:[e.jsxs("div",{"data-slot":"label",className:"gh-field-label",children:[s.field.notify,e.jsx("span",{className:"gf-caption gh-field-sub",children:s.field.notifyHint})]}),e.jsx("div",{"data-slot":"control",children:e.jsx("span",{className:"gf-switch","data-on":!0})})]})]})})]})}const Zn=[{key:"caret",mark:e.jsx(jt,{size:16})},{key:"check",mark:e.jsx(na,{size:16})},{key:"plus",mark:e.jsx(le,{size:16})},{key:"download",mark:e.jsx(ta,{size:16})},{key:"upload",mark:e.jsx(aa,{size:16})},{key:"close",mark:e.jsx(sa,{size:16})},{key:"chevron",mark:e.jsx(fa,{open:!1,size:16})}];function ur(){const{S:a}=y(),n=[...new Set(re.map(s=>s.sources[0]??""))],t=re.find(s=>s.names.includes("ICONS.gear"))?.d??re[0]?.d??"";return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:a.foundations.iconSizes,aside:a.foundations.iconRegistry(re.length,n.length),children:e.jsx("div",{className:"gf-icon-sizes",children:Gs.map(({name:s,px:i})=>e.jsxs("span",{className:"gf-icon-size",children:[e.jsx(B,{d:t,size:i}),e.jsxs("span",{className:"gf-caption gf-mono",children:[s," ",i]})]},s))})}),n.map(s=>{const i=re.filter(r=>r.sources[0]===s);return e.jsx(h,{title:e.jsx("span",{className:"gf-mono",children:s}),aside:i.length,children:e.jsx("div",{className:"gf-icon-grid",children:i.map(r=>e.jsxs("span",{className:"gf-icon","data-tooltip":`${r.names.join(`
`)}
— ${r.sources.join(", ")}`,children:[e.jsx(B,{d:r.d,size:16}),e.jsx("span",{className:"gf-caption gf-mono gf-icon-name",children:r.names[0]?.replace(/_ICONS?$/,"").replace(/^(?:[A-Z_]+_)?ICONS\./,"")}),r.names.length>1&&e.jsxs("span",{className:"gf-caption gf-icon-dupes","data-tooltip":a.foundations.duplicateNames,children:["×",r.names.length]})]},r.d))})},s)}),e.jsx(h,{title:a.foundations.iconMarks,aside:Zn.length,children:e.jsx("div",{className:"gf-icon-grid",children:Zn.map(({key:s,mark:i})=>e.jsxs("span",{className:"gf-icon",children:[i,e.jsx("span",{className:"gf-caption gf-mono gf-icon-name",children:s})]},s))})})]})}const Xn=["fast","base","slow"],mr=["out","in-out","spring","overlay-in","overlay-out"],Wt=1400,pr=90,et=2;function gr(a){const[n,t]=d.useState("hidden"),[s,i]=d.useState(0),r=d.useRef(null),o=d.useRef(null),l=d.useCallback(()=>{o.current!==null&&window.clearTimeout(o.current),i(u=>u+1),t("enter"),o.current=window.setTimeout(()=>t("exit"),Wt)},[]);return d.useEffect(()=>{a>0&&l()},[a,l]),d.useEffect(()=>{if(n!=="exit")return;const u=r.current;u!==null&&getComputedStyle(u).animationName==="none"&&t("hidden")},[n]),d.useEffect(()=>()=>{o.current!==null&&window.clearTimeout(o.current)},[]),{phase:n,key:s,ref:r,play:l,onAnimationEnd:u=>{u.target===u.currentTarget&&n==="exit"&&t("hidden")}}}function Ge({title:a,side:n,run:t,backdrop:s=!1,children:i}){const{S:r}=y(),o=gr(t),l=o.phase!=="hidden",c=r.foundations.motionSpecimens.trigger;return e.jsxs("div",{className:"gf-specimen",children:[e.jsxs("div",{className:"gf-stage","data-side":n,children:[n==="top"&&e.jsx("span",{className:"gf-stage-trigger",children:c}),l&&s&&e.jsx("span",{className:"gf-backdrop","data-backdrop":o.phase}),l&&e.jsx("div",{ref:o.ref,className:"gf-layer","data-presence":o.phase,"data-side":n,onAnimationEnd:o.onAnimationEnd,children:i},o.key)]}),e.jsxs("div",{className:"gf-specimen-foot",children:[e.jsxs("span",{className:"gf-caption",children:[a," ",e.jsx("span",{className:"gf-mono",children:n})]}),e.jsx(me,{onClick:o.play})]})]})}function fr({run:a}){const{S:n}=y(),t=n.foundations.motionSpecimens.revealRows,s=t.length,[i,r]=d.useState(s),[o,l]=d.useState(!1),c=d.useRef(null),u=d.useCallback(()=>{c.current!==null&&window.clearInterval(c.current),l(!0),r(et),c.current=window.setInterval(()=>{r(p=>(p+1>=s&&c.current!==null&&(window.clearInterval(c.current),c.current=null),Math.min(p+1,s)))},pr)},[s]);return d.useEffect(()=>{a>0&&u()},[a,u]),d.useEffect(()=>()=>{c.current!==null&&window.clearInterval(c.current)},[]),e.jsxs("div",{className:"gf-specimen",children:[e.jsx("div",{className:"gf-reveal",children:t.slice(0,i).map((p,m)=>e.jsxs("div",{className:"gf-reveal-row",...o&&m>=et?{"data-reveal":!0}:{},children:[e.jsx(B,{d:N.checkCircle,size:14}),e.jsx("span",{className:"gf-mono",children:p.name}),e.jsx("span",{className:"gf-reveal-detail",children:p.detail})]},m))}),e.jsxs("div",{className:"gf-specimen-foot",children:[e.jsx("span",{className:"gf-caption gf-mono",children:"data-reveal"}),e.jsx(me,{onClick:u})]})]})}function br({run:a}){const{S:n}=y(),[t,s]=d.useState(!1),i=d.useRef(null),r=d.useCallback(()=>{i.current!==null&&window.clearTimeout(i.current),s(!0),i.current=window.setTimeout(()=>s(!1),Wt)},[]);return d.useEffect(()=>{a>0&&r()},[a,r]),d.useEffect(()=>()=>{i.current!==null&&window.clearTimeout(i.current)},[]),e.jsxs("div",{className:"gf-specimen",children:[e.jsxs("div",{className:"gf-layout-stage",children:[e.jsx("div",{className:"gf-layout-nav","data-layout-motion":!0,"data-rail":t||void 0,children:n.foundations.motionSpecimens.sidebarRows.map((o,l)=>e.jsxs("span",{className:"gf-layout-row","aria-current":l===0?"page":void 0,children:[e.jsx("svg",{width:16,height:16,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","aria-hidden":!0,className:"gf-glyph",style:{strokeWidth:"var(--ui-icon-stroke)"},children:e.jsx("path",{d:he[l]??he[0]})}),e.jsx("span",{className:"gf-layout-label",children:o})]},o))}),e.jsxs("div",{className:"gf-layout-main","aria-hidden":!0,children:[e.jsx("span",{style:{width:"72%"}}),e.jsx("span",{style:{width:"48%"}}),e.jsx("span",{style:{width:"60%"}})]})]}),e.jsxs("div",{className:"gf-specimen-foot",children:[e.jsx("span",{className:"gf-caption gf-mono",children:"data-layout-motion"}),e.jsx(me,{onClick:r})]})]})}function xr(){const{S:a,state:n}=y(),t=a.foundations,[s,i]=d.useState(0),r=window.matchMedia("(prefers-reduced-motion: reduce)").matches?t.reducedNote:void 0;return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:t.presence,aside:r??t.presenceNote,action:e.jsx(me,{label:t.replayAll,onClick:()=>i(o=>o+1)}),children:e.jsxs("div",{className:"gf-presence",children:[e.jsx(Ge,{title:t.motionSpecimens.menu,side:"top",run:s,children:e.jsx("div",{className:"ui-glass gf-motion-menu",role:"menu",children:t.scene.menuItems.map((o,l)=>e.jsx("span",{className:"gf-menu-row","data-active":l===1||void 0,children:o},o))})}),e.jsx(Ge,{title:t.motionSpecimens.dialog,side:"center",run:s,backdrop:!0,children:e.jsxs("div",{className:"ui-glass gf-motion-dialog",role:"dialog","aria-label":t.scene.dialogTitle,children:[e.jsx("strong",{children:t.scene.dialogTitle}),e.jsx("p",{className:"gf-muted",children:t.scene.dialogBody}),e.jsxs("div",{className:"gf-controls gf-controls-end",children:[e.jsx("span",{className:"gf-button",children:t.scene.cancel}),e.jsx("span",{className:"gf-button","data-variant":"danger",children:t.scene.confirm})]})]})}),e.jsx(Ge,{title:t.motionSpecimens.toast,side:"bottom",run:s,children:e.jsx("div",{className:"gf-motion-toast",role:"status",children:t.scene.toast})})]})}),e.jsxs("div",{className:"gf-pair",children:[e.jsx(h,{title:t.reveal,aside:t.revealNote,children:e.jsx(fr,{run:s})}),e.jsx(h,{title:t.layout,aside:t.layoutNote,children:e.jsx(br,{run:s})})]}),e.jsx(h,{title:t.durations,children:e.jsxs("div",{className:"gf-motion",children:[e.jsx("span",{}),Xn.map(o=>e.jsx("span",{className:"gf-caption gf-mono",children:o},o)),mr.map(o=>e.jsxs("div",{className:"gf-motion-row",children:[e.jsx("span",{className:"gf-caption gf-mono",children:o}),Xn.map(l=>e.jsx("span",{className:"gf-track",children:e.jsx("span",{className:"gf-track-dot",style:{"--gf-dur":`var(--ui-dur-${l})`,"--gf-ease":`var(--ui-ease-${o})`}})},l))]},o))]})}),e.jsx(h,{title:t.liveSignal,children:e.jsxs("div",{className:"gf-live",children:[e.jsxs("span",{children:[q[n.lang].heading,e.jsx(St,{})]}),e.jsxs("span",{className:"gf-live-item",children:[e.jsx(ue,{tone:"success",pulse:!0}),t.toneWords.success]}),e.jsxs("span",{className:"gf-live-item",children:[e.jsx(Ct,{size:"sm",tone:"success",label:t.loading}),t.loading]})]})})]})}const vr=["xs","sm","md","lg","xl","pill","control"],wr=["flat","raised","overlay","modal","drawer"],kr=[92,78,85,64,88,70,81,58];function nt({children:a}){return e.jsx("span",{className:"gf-tier gf-caption gf-mono",children:a})}function yr(){const{S:a}=y(),n=a.foundations.scene;return e.jsxs("div",{className:"gf-scene",children:[e.jsxs("div",{className:"gf-scene-page",children:[e.jsx(nt,{children:n.pageTier}),e.jsxs("div",{className:"gf-card",children:[e.jsxs("div",{className:"gf-card-head",children:[e.jsx("strong",{children:n.cardTitle}),e.jsx("span",{className:"gf-caption",children:n.cardMeta}),e.jsx("span",{className:"gf-more","aria-hidden":!0,children:"···"})]}),e.jsx("div",{className:"gf-nested",children:e.jsx("span",{className:"gf-caption",children:n.nested})}),e.jsxs("div",{className:"gf-controls",children:[e.jsx("span",{className:"gf-button","data-variant":"primary",children:n.primary}),e.jsx("span",{className:"gf-button",children:n.secondary}),e.jsx("span",{className:"gf-badge",children:n.badge})]}),e.jsx("span",{className:"gf-input",children:n.input}),e.jsxs("div",{className:"gf-menu ui-glass",role:"menu",children:[n.menuItems.map((t,s)=>e.jsx("span",{className:"gf-menu-row","data-active":s===1||void 0,children:t},t)),e.jsx("span",{className:"gf-layer-tier gf-caption gf-mono",children:n.menuTier})]})]})]}),e.jsxs("div",{className:"gf-scene-modal",children:[e.jsx("div",{className:"gf-scene-lines","aria-hidden":!0,children:kr.map((t,s)=>e.jsx("span",{style:{width:`${t}%`}},s))}),e.jsx("span",{className:"gf-backdrop"}),e.jsx(nt,{children:n.backdropTier}),e.jsxs("div",{className:"gf-dialog ui-glass",role:"dialog","aria-label":n.dialogTitle,children:[e.jsx("strong",{children:n.dialogTitle}),e.jsx("p",{className:"gf-muted",children:n.dialogBody}),e.jsxs("div",{className:"gf-controls gf-controls-end",children:[e.jsx("span",{className:"gf-button",children:n.cancel}),e.jsx("span",{className:"gf-button","data-variant":"danger",children:n.confirm})]})]}),e.jsxs("div",{className:"gf-toast",children:[e.jsx("span",{children:n.toast}),e.jsx("span",{className:"gf-caption gf-mono",children:n.toastTier})]})]})]})}function jr(){const{S:a}=y();return e.jsxs("div",{className:"gf-board",children:[e.jsx(yr,{}),e.jsx(h,{title:a.foundations.shell,aside:a.foundations.shellNote,children:e.jsx(qt,{})}),e.jsxs("div",{className:"gf-pair",children:[e.jsxs(h,{title:a.foundations.radius,children:[e.jsx("div",{className:"gf-radii",children:vr.map(n=>e.jsxs("span",{className:"gf-radius",children:[e.jsx("span",{className:"gf-radius-box",style:{borderRadius:`var(--ui-radius-${n})`}}),e.jsx("span",{className:"gf-caption gf-mono",children:n})]},n))}),e.jsx("div",{className:"gf-borders",children:["border-w","border-w-thick"].map(n=>e.jsxs("span",{className:"gf-border-row",children:[e.jsx("span",{className:"gf-border",style:{borderTopWidth:`var(--ui-${n})`}}),e.jsx("span",{className:"gf-caption gf-mono",children:n})]},n))})]}),e.jsx(h,{title:a.foundations.shadows,children:e.jsx("div",{className:"gf-shadows",children:wr.map(n=>e.jsx("span",{className:"gf-shadow",style:{boxShadow:`var(--ui-shadow-${n})`},children:e.jsx("span",{className:"gf-caption gf-mono",children:n})},n))})})]})]})}const ne=(a,n)=>({id:`h${a}`,style:{fontFamily:`var(--ui-h${a}-font)`,fontSize:`var(--ui-h${a}-size)`,lineHeight:`var(--ui-h${a}-lh)`,fontWeight:`var(--ui-h${a}-weight)`,letterSpacing:`var(--ui-h${a}-tracking)`,textTransform:`var(--ui-h${a}-transform)`},text:n}),Nr=[ne(1,a=>a.display),ne(2,a=>a.heading),ne(3,a=>a.heading),ne(4,a=>a.heading),ne(5,a=>a.heading),ne(6,a=>a.heading),{id:"prose",style:{fontFamily:"var(--ui-font-sans)",fontSize:"var(--ui-text-prose-size)",lineHeight:"var(--ui-text-prose-lh)"},text:a=>a.paragraph},{id:"body",style:{fontFamily:"var(--ui-font-sans)",fontSize:"var(--ui-text-body-size)",lineHeight:"var(--ui-text-body-lh)",letterSpacing:"var(--ui-tracking-body)"},text:a=>a.ui},{id:"ui",style:{fontFamily:"var(--ui-font-ui)",fontSize:"var(--ui-text-body-size)",lineHeight:"var(--ui-text-body-lh)",letterSpacing:"var(--ui-tracking-body)"},text:a=>a.ui},{id:"small",style:{fontSize:"var(--ui-text-small-size)",lineHeight:"var(--ui-text-small-lh)"},text:a=>a.ui},{id:"caption",style:{fontSize:"var(--ui-text-caption-size)",lineHeight:"var(--ui-text-caption-lh)",color:"var(--ui-fg-muted)"},text:a=>a.caption},{id:"code",style:{fontFamily:"var(--ui-font-mono)",fontSize:"var(--ui-text-code-size)",lineHeight:"var(--ui-text-code-lh)",letterSpacing:"var(--ui-tracking-mono)",whiteSpace:"pre-wrap"},text:a=>a.code.split(`
`).slice(0,2).join(`
`)}];function Sr(){const{S:a}=y();return e.jsxs("div",{className:"gf-board",children:[e.jsxs("div",{className:"gf-type",children:[e.jsx("span",{}),e.jsx("span",{className:"gf-caption",children:a.rail.langNames.en}),e.jsx("span",{className:"gf-caption",children:a.rail.langNames.zh}),Nr.map(n=>e.jsxs("div",{className:"gf-type-row",children:[e.jsx("code",{className:"gf-caption gf-mono",children:n.id}),["en","zh"].map(t=>e.jsx("p",{lang:t==="zh"?"zh-CN":"en",style:n.style,children:n.text(q[t])},t))]},n.id))]}),e.jsx("p",{className:"gf-caption gf-note",children:a.foundations.typeNote})]})}function Cr(){const{S:a}=y(),n=a.library.avatars,[t,s]=n.userNames,i=[{id:t??"admin",name:s??t??"admin",kind:"user"},...n.agents.map(r=>({id:r.id,name:r.name}))];return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:n.user,children:e.jsxs("div",{className:"lib-row",children:[e.jsxs("span",{className:"lib-cell",children:[e.jsx(Me,{userId:t??"admin"}),e.jsx("span",{className:"lib-caption",children:t})]}),e.jsxs("span",{className:"lib-cell",children:[e.jsx(Me,{userId:t??"admin",displayName:s}),e.jsx("span",{className:"lib-caption",children:s})]}),e.jsxs("span",{className:"lib-cell",children:[e.jsx(Me,{userId:t??"admin",displayName:s,size:gn.preview}),e.jsxs("span",{className:"lib-caption",children:[gn.preview,"px"]})]})]})}),e.jsx(h,{title:n.agent,children:e.jsxs("div",{className:"lib-row",children:[n.agents.map(r=>e.jsxs("span",{className:"lib-cell",children:[e.jsx(Te,{id:r.id,name:r.name}),e.jsx("span",{className:"lib-caption",children:r.name})]},r.id)),[24,32].map(r=>e.jsxs("span",{className:"lib-cell",children:[e.jsx(Te,{id:n.agents[0]?.id??"agent",name:n.agents[0]?.name,size:r}),e.jsxs("span",{className:"lib-caption",children:[r,"px"]})]},r))]})}),e.jsx(h,{title:n.stack,children:e.jsxs("div",{className:"lib-row",children:[e.jsxs("span",{className:"lib-cell",children:[e.jsx(ze,{items:i.slice(0,3),size:D.groupHeaderAvatar}),e.jsx("span",{className:"lib-caption",children:n.stackShown(3,3)})]}),e.jsxs("span",{className:"lib-cell",children:[e.jsx(ze,{items:i,size:D.groupHeaderAvatar}),e.jsx("span",{className:"lib-caption",children:n.stackShown(3,i.length)})]}),e.jsxs("span",{className:"lib-cell",children:[e.jsx(ze,{items:i,max:2,size:D.rowLead}),e.jsx("span",{className:"lib-caption",children:n.stackShown(2,i.length)})]})]})})]})}const Tr=["soft","outline","solid"],Ar=["running","waiting","done","failed","stopped"],Er=["running","compacting","completedUnread"];function Mr(){const{S:a}=y(),n=a.library.badges;return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:n.pills,aside:n.pillsHint,children:e.jsxs("div",{className:"lib-stack lib-stack-wide",children:[e.jsx("div",{className:"lib-row",children:je.map(t=>e.jsx(ge,{tone:t,children:n.tones[t]},t))}),e.jsxs("div",{className:"lib-row",children:[e.jsx(ge,{children:n.pillRow.thisServer}),e.jsx(ge,{tone:"info",children:n.pillRow.running}),e.jsx(ge,{children:"v0.2.16"}),e.jsx(fn,{onClick:()=>{},children:n.pillRow.update}),e.jsx("span",{className:"lib-caption",children:n.pillRow.caption})]})]})}),e.jsx(h,{title:n.badges,children:e.jsx("div",{className:"lib-stack lib-stack-wide",children:Tr.map(t=>e.jsxs("div",{className:"lib-row",children:[je.map(s=>e.jsx(dn,{tone:s,variant:t,children:n.tones[s]},s)),e.jsx("span",{className:"lib-caption",children:n.variants[t]})]},t))})}),e.jsx(h,{title:n.count,children:e.jsxs("div",{className:"lib-row",children:[e.jsx(Ne,{n:3}),e.jsx(Ne,{n:42}),e.jsx(Ne,{n:120,max:99})]})}),e.jsx(h,{title:n.dots,aside:n.dotsHint,children:e.jsxs("div",{className:"lib-row",children:[je.map(t=>e.jsxs("span",{className:"lib-cell",children:[e.jsx(ue,{tone:t,size:"md"}),e.jsx("code",{className:"lib-caption",children:t})]},t)),e.jsxs("span",{className:"lib-cell",children:[e.jsx(ue,{tone:"success",size:"md",pulse:!0,label:n.live}),e.jsx("span",{className:"lib-caption",children:n.live})]})]})}),e.jsx(h,{title:n.status,children:e.jsx("div",{className:"lib-row",children:Ar.map(t=>e.jsxs("span",{className:"lib-cell",children:[e.jsx(Tt,{state:t,label:n.states[t]}),e.jsx("span",{className:"lib-caption",children:n.states[t]})]},t))})}),e.jsx(h,{title:n.activity,children:e.jsx("div",{className:"lib-row",children:Er.map(t=>e.jsxs("span",{className:"lib-cell",children:[e.jsx(ba,{activity:t,label:n.activities[t]}),e.jsx("span",{className:"lib-caption",children:n.activities[t]})]},t))})}),e.jsx(h,{title:n.marks,children:e.jsxs("div",{className:"lib-row",children:[e.jsxs("span",{className:"lib-cell",children:[e.jsx(xa,{label:n.background,size:D.rowMark}),e.jsx("span",{className:"lib-caption",children:n.background})]}),e.jsxs("span",{className:"lib-cell",children:[e.jsx(va,{label:n.schedule,size:D.rowMark}),e.jsx("span",{className:"lib-caption",children:n.schedule})]}),e.jsxs("span",{className:"lib-cell",children:[e.jsxs("span",{className:"relative inline-flex rounded-md border px-2 py-1 text-sm",children:[n.dotAnchor,e.jsx(wa,{})]}),e.jsx("span",{className:"lib-caption",children:n.dot})]}),e.jsxs("span",{className:"lib-cell",children:[e.jsx(fn,{onClick:()=>{},children:n.pillText}),e.jsx("span",{className:"lib-caption",children:n.pill})]})]})}),e.jsx(h,{title:n.statTile,children:e.jsxs("div",{className:"grid max-w-xl grid-cols-2 gap-3",children:[e.jsx(bn,{icon:N.coin,label:n.spend,value:"$12.40",detail:n.spendDetail}),e.jsx(bn,{icon:N.info,label:n.alerts,value:2,tone:"danger",detail:n.alertsDetail})]})}),e.jsx(h,{title:n.statChip,children:e.jsxs("div",{className:"lib-row text-xs text-fg-subtle",children:[e.jsx(Le,{glyph:N.arrowUpFromLine,value:"18.2k",label:n.input}),e.jsx(Le,{glyph:N.arrowDownToLine,value:"1.4k",label:n.output}),e.jsx(Le,{glyph:N.clockCompact,value:"12.7s",compactValue:"13s",label:n.elapsed})]})})]})}const tt="https://github.com/Prism-Shadow/penguin-harness/releases",zr=a=>a.preventDefault();function Lr(){const{S:a}=y(),n=a.library.buttons;return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:n.variants,children:e.jsxs("div",{className:"lib-row",children:[e.jsx(j,{variant:"primary",children:n.primary}),e.jsx(j,{variant:"secondary",children:n.secondary}),e.jsx(j,{variant:"danger",children:n.danger}),e.jsx(j,{variant:"ghost",children:n.ghost}),e.jsx(j,{variant:"link",children:n.link})]})}),e.jsx(h,{title:n.sizes,children:e.jsxs("div",{className:"lib-row",children:[e.jsx(j,{variant:"primary",size:"md",children:n.md}),e.jsx(j,{variant:"primary",size:"sm",children:n.sm}),e.jsx(j,{variant:"secondary",size:"xs",children:n.xs}),e.jsx(j,{variant:"secondary",size:"sm",leading:e.jsx(le,{}),children:n.leading})]})}),e.jsx(h,{title:n.icon,aside:n.iconHint,children:e.jsxs("div",{className:"lib-row",children:[e.jsx(O,{label:n.add,children:e.jsx(le,{})}),e.jsx(O,{label:n.add,size:"sm",children:e.jsx(le,{})}),e.jsx(O,{label:n.edit,variant:"ghost",children:e.jsx(B,{d:N.pencil})}),e.jsx(O,{label:n.danger,variant:"danger",children:e.jsx(B,{d:N.trash})})]})}),e.jsx(h,{title:n.states,children:e.jsxs("div",{className:"lib-row",children:[e.jsx(j,{variant:"primary",disabled:!0,children:n.disabled}),e.jsx(j,{variant:"secondary",disabled:!0,children:n.disabled}),e.jsx(j,{variant:"primary",loading:!0,loadingLabel:n.busy,children:n.busy}),e.jsx(j,{variant:"secondary",size:"sm",loading:!0,loadingLabel:n.busy,children:n.busy}),e.jsx(O,{label:n.add,loading:!0,loadingLabel:n.busy,children:e.jsx(le,{})})]})}),e.jsx(h,{title:n.links,aside:n.linksHint,children:e.jsxs("div",{className:"lib-stack",children:[e.jsxs("p",{className:"text-sm",children:[n.inlineBefore,e.jsx(Ie,{href:"#release-notes",onClick:zr,children:n.inlineLink}),n.inlineAfter]}),e.jsxs("div",{className:"lib-row",children:[e.jsx(Ie,{href:tt,external:!0,variant:"standalone",className:"text-sm",children:n.external}),e.jsx(Ie,{href:tt,external:!0,variant:"standalone",className:"text-xs",children:n.external})]})]})}),e.jsx(h,{title:n.keys,children:e.jsx("div",{className:"lib-row",children:n.shortcuts.map(t=>e.jsx(ka,{keys:t},t.join("+")))})})]})}const on=240,ln=100,ke=84,Y=[[20,70],[70,34],[120,52],[170,22],[220,44]],Ir=["linear","smooth","step"],Rr=[{kind:"thinking",series:0,left:0,width:22},{kind:"tool_call",series:2,left:22,width:8},{kind:"approval",series:3,left:32,width:12},{kind:"tool",series:4,left:44,width:26},{kind:"text",series:1,left:72,width:28}];function te({children:a,label:n}){return e.jsx("svg",{className:"lib-stage",viewBox:`0 0 ${on} ${ln}`,role:"img","aria-label":n,xmlns:"http://www.w3.org/2000/svg",children:a})}function Hr(){const{S:a}=y(),n=a.library.charts.primitives,t=ya();return e.jsxs(e.Fragment,{children:[e.jsx(h,{title:n.bar,aside:n.barHint,children:e.jsxs(te,{label:n.bar,children:[[62,38,50,24,44].map((s,i)=>e.jsx(Re,{cx:24+i*40,band:40,y:ke-s,height:s,paint:{series:i}},i)),e.jsx(Re,{cx:224,band:40,y:ke-30,height:30,paint:{series:5},top:!1}),e.jsx(Re,{cx:224,band:40,y:ke-56,height:26,paint:{series:6}})]})}),e.jsxs(h,{title:n.line,aside:n.lineHint,children:[e.jsxs("div",{className:"lib-row",children:[e.jsxs(te,{label:`${n.line} · ${t.curve}`,children:[e.jsx(fe,{points:Y,paint:{series:0}}),e.jsx(fe,{points:Y.map(([s,i])=>[s,i+18]),paint:{role:"ref"},dash:"4 3"})]}),e.jsxs("span",{className:"lib-caption",children:["--ui-chart-curve: ",t.curve]})]}),e.jsx("div",{className:"lib-row",children:Ir.map(s=>e.jsxs("span",{className:"lib-cell",children:[e.jsx("svg",{className:"lib-stage lib-stage-small",viewBox:`0 0 ${on} ${ln}`,"aria-hidden":!0,children:e.jsx("path",{d:ja(Y,s),fill:"none",stroke:"currentColor",strokeWidth:t.lineWidth,className:"text-[var(--ui-fg-muted)]"})}),e.jsx("span",{className:"lib-caption",children:n.curves[s]})]},s))})]}),e.jsx(h,{title:n.area,aside:n.areaHint,children:e.jsxs(te,{label:n.area,children:[e.jsx(Na,{points:Y,baseY:ke,paint:{series:2}}),e.jsx(fe,{points:Y,paint:{series:2}})]})}),e.jsx(h,{title:n.point,aside:n.pointHint,children:e.jsx(te,{label:n.point,children:Y.map(([s,i],r)=>e.jsx(Sa,{cx:s,cy:i,paint:{series:r},grow:r===3},r))})}),e.jsx(h,{title:n.arc,aside:n.arcHint,children:e.jsxs(te,{label:n.arc,children:[e.jsx(Q,{cx:50,cy:50,r:36,width:10,paint:{ink:"text-[var(--ui-fg-subtle)]"},track:!0,trackOpacity:.3}),e.jsx(Q,{cx:50,cy:50,r:36,width:10,paint:{role:"cacheRead"},length:110}),e.jsx(Q,{cx:50,cy:50,r:36,width:10,paint:{role:"cacheWrite"},length:40,offset:-110}),e.jsx(Q,{cx:50,cy:50,r:36,width:10,paint:{role:"output"},length:30,offset:-150}),e.jsx(Q,{cx:150,cy:50,r:36,width:10,paint:{ink:"text-[var(--ui-fg-subtle)]"},track:!0,trackOpacity:.3}),[0,1,2,3].map(s=>e.jsx(Q,{cx:150,cy:50,r:36,width:10,paint:{series:s},length:40,offset:-s*48},s))]})}),e.jsx(h,{title:n.grid,aside:n.gridHint,children:e.jsxs(te,{label:n.grid,children:[[20,50,80].map((s,i)=>e.jsxs("g",{children:[e.jsx(Ca,{x1:36,x2:on-8,y:s}),e.jsx(xn,{x:30,y:s+3,anchor:"end",children:[100,50,0][i]})]},s)),["09-15","09-22","09-28"].map((s,i)=>e.jsx(xn,{x:36+i*98,y:ln-4,anchor:i===0?"start":i===2?"end":"middle",children:s},s)),e.jsx(fe,{points:Y,paint:{series:0}})]})}),e.jsx(h,{title:n.timeline,aside:n.timelineHint,children:e.jsx("div",{className:"lib-stack",children:Rr.map(s=>e.jsxs("div",{className:"lib-lane",children:[e.jsx("span",{className:"lib-caption lib-lane-label",children:n.kinds[s.kind]}),e.jsx("div",{className:"lib-lane-track",children:e.jsx(Ta,{paint:{series:s.series},place:{left:`${s.left}%`,width:`${s.width}%`},"aria-hidden":!0})})]},s.kind))})})]})}const Pr=["--ui-chart-1","--ui-chart-2","--ui-chart-3","--ui-chart-4","--ui-chart-5","--ui-chart-6","--ui-chart-7","--ui-chart-8","--ui-chart-ref","--ui-chart-cache-read","--ui-chart-cache-write","--ui-chart-output","--ui-chart-grid","--ui-chart-axis"],Br=["--ui-chart-bar-fill","--ui-chart-bar-radius","--ui-chart-bar-stroke","--ui-chart-bar-stroke-color","--ui-chart-bar-opacity","--ui-chart-line-width","--ui-chart-point-radius","--ui-chart-curve","--ui-chart-area-opacity"];function Or(a){return{palette:Pr.map(n=>({name:n,value:a(n).trim()})),geometry:Br.map(n=>({name:n,value:a(n).trim()}))}}function Dr(){const a=getComputedStyle(document.documentElement);return Or(n=>a.getPropertyValue(n))}function _r(){const[a,n]=d.useState(null);return d.useEffect(()=>{const t=()=>n(Dr());t();const s=new MutationObserver(t);return s.observe(document.documentElement,{attributes:!0,attributeFilter:["class","data-theme","data-accent","style"]}),()=>s.disconnect()},[]),a}function at({rows:a,swatch:n}){const{S:t}=y();return e.jsx("table",{className:"lib-tokens",children:e.jsx("tbody",{children:a.map(s=>e.jsxs("tr",{"data-unset":s.value===""||void 0,children:[n&&e.jsx("td",{className:"lib-tokens-swatch",children:e.jsx("span",{style:{background:s.value||"transparent"},"aria-hidden":!0})}),e.jsx("th",{scope:"row",children:e.jsx("code",{children:s.name})}),e.jsx("td",{className:"lib-tokens-meaning",children:t.library.charts.tokenMeaning[s.name]}),e.jsx("td",{className:"lib-tokens-value",children:e.jsx("code",{children:s.value||t.section.unset})})]},s.name))})})}function $r(){const{S:a}=y(),n=a.library.charts,t=_r();return t?e.jsxs("div",{className:"lib-stack lib-stack-wide",children:[e.jsxs("div",{children:[e.jsx("p",{className:"lib-caption",children:n.palette}),e.jsx(at,{rows:t.palette,swatch:!0})]}),e.jsxs("div",{children:[e.jsx("p",{className:"lib-caption",children:n.geometry}),e.jsx(at,{rows:t.geometry,swatch:!1})]})]}):e.jsx("p",{className:"gf-muted",children:a.intro.resolving})}const st=[.41,.63,.22,.98,1.24,.77,.15,.09,.88,1.43,1.02,.56,.71,.93];function Fr(){const a=Date.UTC(2026,8,28);return st.map((n,t)=>{const s=new Date(a-(st.length-1-t)*864e5),i=Math.round(n*40)+3,r=Math.round(n*3e4),o=r*6,l=Math.round(r*.8);return{bucket:s.toISOString().slice(0,10),cacheRead:o,cacheWrite:l,output:r,total:o+l+r,cost:n,requests:i,completed:i-(t%5===0?1:0),denominator:i}})}const ye=Fr();function qr(a,n){return[.6,.4].map((s,i)=>{const r=a.map(o=>Math.round(o.requests*s));return{label:n[i]??`agent-${i+1}`,requests:r,completed:r.map((o,l)=>o-(i===0&&l%5===0?1:0)),denominator:r}})}const Gt=[62,66,71,69,74,78,77,83],Wr=Gt.slice(-1),Gr=[2,3,1,5,6,4,1,0,4,7,5,3,4,5],Ur=[0,0,0,0,0,0,0],Vr=[{cacheRead:42e3,cacheWrite:6e3,output:9e3,size:44},{cacheRead:12e4,cacheWrite:14e3,output:31e3,size:44},{cacheRead:15e4,cacheWrite:2e4,output:26e3,size:44},{cacheRead:42e3,cacheWrite:6e3,output:9e3,size:64}],Kr=[{ratio:.41,tone:"success"},{ratio:.86,tone:"attention"},{ratio:1.2,tone:"danger"}],Jr=[.62,.9,.99],Yr=[.34,.22,.18,.12].map((a,n)=>({value:a,paint:{series:n}})),Qr=[{tokens:18400,percent:38},{tokens:9100,percent:19},{tokens:6300,percent:13},{tokens:14600,percent:30}];function Zr({tokens:a,percent:n}){return e.jsxs(e.Fragment,{children:[e.jsxs("span",{className:"shrink-0 font-mono font-medium text-fg",children:["~",At(a)]}),e.jsxs("span",{className:"w-8 shrink-0 text-right font-mono text-fg-subtle",children:[n,"%"]})]})}const Xr=Date.UTC(2026,8,28,9,0,0),E=a=>new Date(Xr+a*1e3).toISOString(),eo=[{kind:"thinking",startTs:E(0),endTs:E(1.8),taskIndex:0},{kind:"tool_call",startTs:E(1.8),endTs:E(2.4),toolCallId:"c1",name:"read_file",taskIndex:0},{kind:"thinking",startTs:E(4),endTs:E(5.2),taskIndex:0},{kind:"tool_call",startTs:E(5.2),endTs:E(5.6),toolCallId:"c2",name:"run_command",taskIndex:0},{kind:"tool_call",startTs:E(5.6),endTs:E(5.9),toolCallId:"c3",name:"read_file",taskIndex:0},{kind:"text",startTs:E(9.2),endTs:E(12.6),taskIndex:0},{kind:"thinking",startTs:E(20),endTs:E(21.1),taskIndex:1},{kind:"text",startTs:E(21.1),endTs:E(24),taskIndex:1}],no=[{toolCallId:"c1",name:"read_file",callTs:E(2.4),outputTs:E(3.9),taskIndex:0},{toolCallId:"c2",name:"run_command",callTs:E(5.9),approvalTs:E(6.9),decision:"allow",outputTs:E(9),taskIndex:0},{toolCallId:"c3",name:"read_file",callTs:E(5.9),outputTs:E(6.4),taskIndex:0}],to=[];function Ue({title:a,hint:n,children:t}){return e.jsxs("section",{className:"lib-part",children:[e.jsxs("div",{className:"lib-part-head",children:[e.jsx("h2",{children:a}),e.jsx("p",{children:n})]}),t]})}function ao(){const{S:a}=y(),n=a.library.charts,[t,s]=d.useState(null),[i,r]=d.useState(null),[o,l]=d.useState(null),[c,u]=d.useState(null),[p,m]=d.useState(null),g=d.useMemo(()=>qr(ye,n.agents),[n.agents]),x=d.useMemo(()=>[...["cacheRead","cacheWrite","output"].map(f=>({key:f,label:n.donutLabels[f],paint:{role:f},shape:"chip"})),{key:"hitRate",label:n.legendHitRate,paint:{role:"ref"},shape:"dash",interactive:!1}],[n]),b=d.useMemo(()=>Qr.map((f,v)=>({key:`part-${v}`,label:n.legendParts[v]??"",paint:{series:v},value:e.jsx(Zr,{...f})})),[n]);return e.jsxs("div",{className:"gf-board",children:[e.jsx(Ue,{title:n.parts.primitives,hint:n.parts.primitivesHint,children:e.jsx(Hr,{})}),e.jsx(Ue,{title:n.parts.tokens,hint:n.parts.tokensHint,children:e.jsx($r,{})}),e.jsxs(Ue,{title:n.parts.charts,hint:n.parts.chartsHint,children:[e.jsx(h,{title:n.donut,aside:n.donutHint,children:e.jsx("div",{className:"lib-row",children:Vr.map((f,v)=>e.jsx(Aa,{...f,max:2e5,labels:n.donutLabels,format:At},v))})}),e.jsx(h,{title:n.ring,aside:n.ringHint,children:e.jsxs("div",{className:"lib-row",children:[Kr.map(({ratio:f,tone:v})=>e.jsx(He,{segments:[{value:f}],max:1,size:40,width:4,tone:v,label:n.ringSpend(Math.round(f*100))},f)),e.jsx(He,{segments:[],max:1,size:40,width:4,label:n.ringNoBudget}),e.jsx(He,{segments:Yr,max:1,size:40,width:6,label:n.ringShares}),e.jsxs("span",{className:"lib-cell",children:[Jr.map(f=>e.jsx(Ea,{ratio:f,label:n.ringContextAt(Math.round(f*100))},f)),e.jsx("span",{className:"lib-caption",children:n.ringContext})]})]})}),e.jsx(h,{title:n.legend,aside:n.legendHint,children:e.jsxs("div",{className:"lib-stack",children:[e.jsx(vn,{items:x,active:o,onHover:l}),e.jsx("div",{className:"lib-box w-72 p-3",children:e.jsx(vn,{layout:"list",items:b,active:c??p,pinned:p,onHover:u,onSelect:f=>m(v=>v===f?null:f)})})]})}),e.jsx(h,{title:n.trend,aside:n.trendHint,children:e.jsx("div",{className:"lib-box p-3",children:e.jsx(Ma,{series:ye,granularity:"day"})})}),e.jsx(h,{title:n.tokens,aside:n.tokensHint,children:e.jsxs("div",{className:"lib-box p-3",children:[e.jsx(za,{series:ye,granularity:"day",legend:t}),e.jsx(La,{active:t,onHover:s})]})}),e.jsx(h,{title:n.requests,aside:n.requestsHint,children:e.jsx("div",{className:"lib-box p-3",children:e.jsx(Ia,{series:ye,entities:g,granularity:"day"})})}),e.jsx(h,{title:n.activity,aside:n.activityHint,children:e.jsx("div",{className:"lib-row",children:[Gr,Ur].map((f,v)=>e.jsx(Pe,{values:f,label:n.activity,area:!0,tone:"success",width:100,height:30,className:"h-8 w-40"},v))})}),e.jsx(h,{title:n.sparkline,aside:n.sparklineHint,children:e.jsxs("div",{className:"lib-row",children:[e.jsx(Pe,{values:Gt,label:n.sparkline,scale:"range",marker:!0}),e.jsx(Pe,{values:Wr,label:n.sparkline,scale:"range",marker:!0})]})}),e.jsx(h,{title:n.timeline,aside:n.timelineHint,children:e.jsx("div",{className:"lib-box p-3",children:e.jsx(Ra,{segments:eo,toolSpans:no,otherSpans:to,highlight:i,onHighlight:r})})})]})]})}const so=[1,2,3,4,5,6],io=["body","small","caption","eyebrow","mono","label"],it='export function greet(name: string, excited = false): string {\n  const mark = excited ? "!" : ".";\n  return `Hello, ${name}${mark}`;\n}\n',rt=`import { readFile } from "node:fs/promises";

export async function loadConfig(path: string) {
  const text = await readFile(path, "utf8");
  return JSON.parse(text);
}

export const DEFAULT_PATH = "config.json";
`,ot=`import { readFile } from "node:fs/promises";

export async function loadConfig(path: string, fallback = {}) {
  const text = await readFile(path, "utf8").catch(() => null);
  return text === null ? fallback : JSON.parse(text);
}

export const DEFAULT_PATH = "penguin.config.json";
`,ro=`diff --git a/src/limits.ts b/src/limits.ts
--- a/src/limits.ts
+++ b/src/limits.ts
@@ -1,4 +1,5 @@ export const LIMITS
 export const LIMITS = {
-  uploadMb: 10,
+  uploadMb: 14,
+  previewKb: 256,
   retries: 3,
 };
`,lt="handbook/release-process.md";function ct({text:a,className:n}){const t=Da();return e.jsxs("div",{className:`flex flex-col overflow-hidden rounded-md border border-line ${n}`,children:[e.jsxs("div",{className:"flex min-h-10 shrink-0 items-center gap-2 border-b border-line px-3 py-1.5",children:[t.findShown?e.jsx(_a,{reader:t,className:"flex-1"}):e.jsx("p",{className:"min-w-0 flex-1 truncate font-mono text-xs text-fg-muted",children:lt}),e.jsx($a,{reader:t})]}),e.jsx(Fa,{reader:t,text:a,label:lt,className:"min-h-0 flex-1"})]})}const dt=a=>{a!==""&&Et(a)},oo={zh:{interactive:!0,fill:dt,lang:"zh"},en:{interactive:!0,fill:dt,lang:"en"}},lo='{ "type": "slider", "min": 0, "max": 10 }',Ve=(a,n)=>`\`\`\`${a}
${n}
\`\`\``;function co(a){return[...a.a2uiReply.flatMap(({lead:n,spec:t})=>[n,Ve("a2ui",JSON.stringify(t,null,2))]),a.a2uiDiagramLead,Ve("mermaid",a.a2uiDiagram),a.a2uiInvalidLead,Ve("a2ui",lo)].join(`

`)}function ho(){const{S:a,state:n}=y(),t=a.library.content,s=d.useMemo(()=>co(t),[t]);return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:t.headings,aside:t.headingsHint,children:e.jsxs("div",{className:"lib-stack lib-stack-wide",children:[e.jsx(Ze,{level:1,display:!0,children:t.display}),so.map(i=>e.jsx(Ze,{level:i,children:t.heading(i)},i))]})}),e.jsx(h,{title:t.text,children:e.jsxs("div",{className:"lib-stack lib-stack-wide",children:[io.map(i=>e.jsxs("div",{className:"lib-row",children:[e.jsx(ce,{variant:i,children:t.samples[i]}),e.jsx("code",{className:"lib-caption",children:i})]},i)),e.jsxs("div",{className:"lib-row",children:[e.jsxs(ce,{children:[t.inline.before,e.jsx(Ha,{children:t.inline.code}),t.inline.after]}),e.jsx("code",{className:"lib-caption",children:"InlineCode"})]})]})}),e.jsx(h,{title:t.prose,children:e.jsxs("div",{className:"lib-stack lib-stack-wide",children:[e.jsx(Be,{text:t.proseSample,className:"text-base leading-relaxed text-fg"}),e.jsx("span",{className:"lib-caption",children:t.compact}),e.jsx(Be,{variant:"compact",text:t.compactSample,className:"text-sm text-fg"})]})}),e.jsx(h,{title:t.reader,aside:t.readerHint,children:e.jsxs("div",{className:"lib-stack lib-stack-wide",children:[e.jsx(ct,{text:t.readerSample,className:"h-[30rem]"}),e.jsx("span",{className:"lib-caption",children:t.readerNarrow}),e.jsx(ct,{text:t.readerSample,className:"h-[22rem] max-w-sm"})]})}),e.jsx(h,{title:t.code,children:e.jsxs("div",{className:"lib-stack lib-stack-wide",children:[e.jsx(Pa,{language:"ts",code:it}),e.jsx("span",{className:"lib-caption",children:t.surface}),e.jsx("div",{className:"lib-box text-xs leading-relaxed",children:e.jsx(Ba,{language:"ts",code:it,lineNumbers:!0})})]})}),e.jsx(h,{title:t.diff,children:e.jsxs("div",{className:"lib-stack lib-stack-wide",children:[e.jsx("span",{className:"lib-caption",children:t.unified}),e.jsx(Fe,{before:rt,after:ot,language:"ts",label:t.diffLabel}),e.jsx("span",{className:"lib-caption",children:t.split}),e.jsx(Fe,{before:rt,after:ot,language:"ts",mode:"split",label:t.diffLabel}),e.jsx("span",{className:"lib-caption",children:t.patch}),e.jsx(Fe,{patch:ro,language:"ts",label:t.patchLabel})]})}),e.jsx(h,{title:t.a2ui,aside:t.a2uiHint,children:e.jsx("div",{className:"lib-stack lib-stack-wide",children:e.jsx(Oa,{value:oo[n.lang],children:e.jsx(Be,{text:s,className:"text-base leading-relaxed text-fg"})})})})]})}const uo=[{name:"daily-digest",period:"0 9 * * *",cost:"$0.42",enabled:!0},{name:"inbox-triage",period:"*/30 * * * *",cost:"$1.08",enabled:!0},{name:"weekly-report",period:"0 17 * * 5",cost:"$0.00",enabled:!1}],mo=["$12.40","$8.75","$3.10"],po=["pdf","web-design","continual-learning"],ht=[{id:"local-proxy-noninteractive-shell-bypass",date:"2026-10-15"},{id:"penguinharness-0215-gemini-fetch-mismatch-inside-the-bundled-server-process-only",date:"2026-10-13"},{id:"verify-patents-and-literature-before-citing",date:"2026-10-15"}],ut="~/.penguin/data",go="m_7f3a9c21",fo=["Pulling penguin-harness 0.2.13","Verifying the download","Stopping the server","Starting the server on port 8930"];function bo(){const{S:a}=y(),n=a.library.data;return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:n.table,aside:n.tableHint,children:e.jsxs(wn,{caption:n.caption,tableClassName:"min-w-[32rem]",children:[e.jsxs(kn,{children:[e.jsx(K,{children:n.columns.name}),e.jsx(K,{children:n.columns.status}),e.jsx(K,{children:n.columns.period}),e.jsx(K,{align:"right",children:n.columns.cost}),e.jsx(K,{})]}),e.jsx(yn,{children:uo.map(t=>e.jsxs(jn,{children:[e.jsx(J,{className:"font-mono text-xs",children:t.name}),e.jsx(J,{nowrap:!0,children:e.jsx(dn,{tone:t.enabled?"success":"neutral",children:t.enabled?n.enabled:n.paused})}),e.jsx(J,{nowrap:!0,className:"font-mono text-xs text-fg-muted",children:t.period}),e.jsx(J,{numeric:!0,children:t.cost}),e.jsx(J,{align:"right",nowrap:!0,children:e.jsx(j,{size:"sm",variant:"ghost",children:t.enabled?n.pause:n.enable})})]},t.name))})]})}),e.jsx(h,{title:n.bare,children:e.jsx("div",{className:"lib-stack",children:e.jsxs(ae,{children:[e.jsx(Xe,{title:n.spendTitle}),e.jsxs(wn,{framed:!1,size:"sm",children:[e.jsxs(kn,{children:[e.jsx(K,{children:n.columns.employee}),e.jsx(K,{align:"right",children:n.columns.cost})]}),e.jsx(yn,{children:n.employees.map((t,s)=>e.jsxs(jn,{children:[e.jsx(J,{children:t}),e.jsx(J,{numeric:!0,children:mo[s]})]},t))})]})]})})}),e.jsx(h,{title:n.rows,aside:n.rowsHint,children:e.jsxs("div",{className:"lib-stack lib-stack-wide",children:[e.jsx(ae,{padding:"none",children:po.map((t,s)=>e.jsx(de,{leading:e.jsx(Te,{id:t,size:32}),title:e.jsx("span",{className:"font-mono",children:t}),description:n.skillDescriptions[s],meta:n.skillMeta,trailing:e.jsx(O,{label:n.exportSkill(t),size:"sm",variant:"ghost",children:e.jsx(B,{d:N.download,size:D.inlineGlyph})})},t))}),e.jsx("span",{className:"lib-caption",children:n.clickable}),e.jsx(ae,{padding:"none",as:"section",children:n.cases.map((t,s)=>e.jsx(de,{title:t,description:`case-0${s+1}`,onClick:()=>{}},t))})]})}),e.jsx(h,{title:n.longRows,aside:n.longRowsHint,children:e.jsx("div",{className:"lib-stack",children:e.jsx(en,{title:n.memoryTitle,meta:n.memoryCount(ht.length),children:e.jsx("ul",{children:ht.map((t,s)=>e.jsx(de,{as:"li",title:e.jsx("span",{className:"font-mono",children:t.id}),description:n.memoryDescriptions[s],meta:e.jsx("span",{className:"tabular-nums",children:t.date}),trailing:e.jsxs(e.Fragment,{children:[e.jsx(O,{label:n.viewMemory(t.id),children:e.jsx(B,{d:N.eye,size:D.iconButton})}),e.jsx(O,{label:n.editMemory(t.id),children:e.jsx(B,{d:N.penLine,size:D.iconButton})}),e.jsx(O,{variant:"danger",label:n.deleteMemory(t.id),children:e.jsx(B,{d:N.trash,size:D.iconButton})})]})},t.id))})})})}),e.jsx(h,{title:n.keyValue,children:e.jsxs("div",{className:"lib-row",children:[e.jsx(ae,{children:e.jsxs(Nn,{children:[e.jsx(Z,{label:n.labels.version,children:"0.2.13"}),e.jsx(Z,{label:n.labels.started,children:"2026-09-30 09:12"}),e.jsx(Z,{label:n.labels.root,mono:!0,children:ut}),e.jsx(Z,{label:n.labels.machineId,mono:!0,children:go})]})}),e.jsxs(Nn,{size:"sm",children:[e.jsx(Z,{label:n.labels.version,children:"0.2.13"}),e.jsx(Z,{label:n.labels.root,mono:!0,children:ut})]})]})}),e.jsx(h,{title:n.log,aside:n.logHint,children:e.jsx("div",{className:"lib-stack",children:e.jsx(qa,{lines:fo,highlightLast:!0,label:n.logLabel,maxHeight:"sm"})})})]})}function xo(){const{S:a}=y(),n=a.library.dialogs,[t,s]=d.useState(!1),[i,r]=d.useState(!1),[o,l]=d.useState(!1),[c,u]=d.useState(!1),[p,m]=d.useState("general"),[g,x]=d.useState(!1),[b,f]=d.useState(!1),[v,w]=d.useState("half"),[S,A]=d.useState(!1),[C,H]=d.useState(n.modalTitle),z=[{key:"app",label:n.pagedGroups.app,items:[{key:"general",label:n.pages.general},{key:"appearance",label:n.pages.appearance,info:n.appearanceInfo}]},{key:"you",label:n.pagedGroups.you,items:[{key:"account",label:n.pages.account}]}],L=[{id:"modal",label:n.modalTitle,run:()=>s(!0)},{id:"paged",label:n.openPaged,run:()=>u(!0)},{id:"drawer",label:n.openDrawer,run:()=>x(!0)},{id:"sheet",label:n.openSheet,run:()=>f(!0)}];return e.jsxs("div",{className:"gf-board",children:[e.jsxs(h,{title:n.modal,children:[e.jsx("div",{className:"lib-row",children:e.jsx(j,{variant:"primary",onClick:()=>s(!0),children:n.openModal})}),e.jsxs(Wa,{open:t,title:n.modalTitle,onClose:()=>s(!1),footer:e.jsxs(e.Fragment,{children:[e.jsx(j,{size:"sm",onClick:()=>s(!1),children:n.cancel}),e.jsx(j,{size:"sm",variant:"primary",onClick:()=>s(!1),children:n.save})]}),children:[e.jsx("p",{className:"mb-3 text-sm",children:n.modalBody}),e.jsx($,{value:C,onChange:k=>H(k.target.value)})]})]}),e.jsxs(h,{title:n.confirm,children:[e.jsxs("div",{className:"lib-row",children:[e.jsx(j,{variant:"danger",onClick:()=>r(!0),children:n.openConfirm}),e.jsx(j,{onClick:()=>l(!0),children:n.openSaveConfirm})]}),e.jsx(Sn,{open:i,title:n.confirmTitle,confirmLabel:n.confirmLabel,cancelLabel:n.cancel,onClose:()=>r(!1),onConfirm:()=>r(!1),children:n.confirmBody}),e.jsx(Sn,{open:o,title:n.saveConfirmTitle,tone:"primary",confirmLabel:n.save,cancelLabel:n.cancel,onClose:()=>l(!1),onConfirm:()=>l(!1),children:n.saveConfirmBody})]}),e.jsxs(h,{title:n.paged,children:[e.jsx("div",{className:"lib-row",children:e.jsx(j,{onClick:()=>u(!0),children:n.openPaged})}),e.jsx(Ga,{open:c,onClose:()=>u(!1),title:n.pagedTitle,groups:z,active:p,onSelect:m,children:e.jsx("p",{className:"text-sm",children:n.pageBody})})]}),e.jsxs(h,{title:n.drawer,children:[e.jsx("div",{className:"lib-row",children:e.jsx(j,{onClick:()=>x(!0),children:n.openDrawer})}),e.jsx(Ua,{open:g,title:n.drawerTitle,onClose:()=>x(!1),children:e.jsx("p",{className:"p-4 text-sm",children:n.drawerBody})})]}),e.jsxs(h,{title:n.sheet,children:[e.jsx("div",{className:"lib-row",children:e.jsx(j,{onClick:()=>f(!0),children:n.openSheet})}),e.jsx(Va,{open:b,snap:v,onSnapChange:w,title:n.sheetTitle,onClose:()=>f(!1),children:e.jsx("p",{className:"p-4 text-sm",children:n.sheetBody})})]}),e.jsx(h,{title:n.lightbox,aside:n.lightboxHint,children:e.jsx("div",{className:"lib-row",children:e.jsx(Ka,{src:`${Us}/penguin-logo.svg`,alt:n.lightboxAlt,className:"h-16 w-16"})})}),e.jsxs(h,{title:n.palette,aside:n.paletteAside,children:[e.jsx("div",{className:"lib-row",children:e.jsx(j,{onClick:()=>A(!0),children:n.openPalette})}),e.jsx(Ja,{open:S,onClose:()=>A(!1),actions:L,title:n.palette,placeholder:n.palettePlaceholder,emptyText:n.paletteEmpty,hint:n.paletteHint})]})]})}function vo(){const{S:a}=y(),n=a.library.empty;return e.jsxs("div",{className:"gf-board",children:[e.jsxs(h,{title:n.page,children:[e.jsx("div",{className:"lib-box",children:e.jsx(Oe,{title:n.title,description:n.description,action:e.jsx(j,{variant:"primary",children:n.action})})}),e.jsx("div",{className:"lib-box",children:e.jsx(Oe,{title:n.title})})]}),e.jsx(h,{title:n.settings,children:e.jsxs("div",{className:"lib-stack",children:[e.jsx(Ya,{children:n.settingsText}),e.jsx(Oe,{dashed:!0,title:n.title,description:n.description})]})})]})}const Ut=[{name:"corpus",children:[{name:"claude-code-docs",children:[{name:"hooks.md",size:8210}]},{name:"index.json",size:41230}]},{name:"src",children:[{name:"rag.ts",size:3944},{name:"embed.ts",size:1210},{name:"empty",children:[]}]},{name:"test",children:[{name:"rag.test.ts",size:2711}]},{name:"README.md",size:612},{name:"package.json",size:388}],wo=["src"];function Vt(a,n,t="",s=0){return a.flatMap((i,r)=>{const o=t===""?i.name:`${t}/${i.name}`,l=i.children!==void 0,c=l&&n.has(o),u={path:o,name:i.name,kind:l?"dir":"file",depth:s,posInSet:r+1,setSize:a.length,expanded:c,loaded:l,empty:l&&i.children.length===0};return c?[u,...Vt(i.children,n,o,s+1)]:[u]})}function Kt(a,n=Ut){const[t,...s]=a.split("/"),i=n.find(r=>r.name===t);return i?s.length===0?i.size??null:i.children?Kt(s.join("/"),i.children):null:null}const mt=`import { bm25 } from "./embed";

export function search(query: string, limit = 5) {
  return bm25(query).slice(0, limit);
}
`,pt="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.19 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48";function ko(a){return a>=1024?`${(a/1024).toFixed(1)} KB`:`${a} B`}function Ke(){const[a,n]=d.useState(()=>new Set(wo)),[t,s]=d.useState(null),[i,r]=d.useState(null),o=l=>{const c=new Set(a),u=!c.has(l);u?c.add(l):c.delete(l),n(c),s({dir:l,open:u,serial:(t?.serial??0)+1})};return{rows:Vt(Ut,a),toggled:t,selected:i,setSelected:r,toggle:o}}const gt=a=>{const n=Kt(a.path);return n===null?null:e.jsx("span",{className:"lib-caption",children:ko(n)})};function yo(){const{S:a}=y(),n=a.library.files,t=Ke(),s=Ke(),i=Ke(),[r,o]=d.useState(""),[l,c]=d.useState(200),[u,p]=d.useState(!1),[m,g]=d.useState(mt),x=s.selected===null?null:{path:s.selected,name:s.selected.split("/").pop()??s.selected,kind:s.selected.endsWith(".md")?"md":"text",content:s.selected==="README.md"?n.readme:`// ${s.selected}
`},b=i.selected===null?{kind:"empty",title:n.selectFile}:i.selected.endsWith(".md")?{kind:"markdown",text:i.selected==="README.md"?n.readme:""}:{kind:"source",code:i.selected==="src/rag.ts"?mt:`// ${i.selected}
`,language:"typescript",wrap:u},f=[n.root,...(i.selected??"").split("/").filter(S=>S!=="")],v={copyPath:n.copyPath,addToChat:n.addToChat,addSelectionToChat:n.addSelection,uploadHere:n.uploadHere,download:n.download,rename:n.rename,delete:n.delete,newTextFile:n.newTextFile,newFolder:n.newFolder},w=()=>{};return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:n.tree,children:e.jsx("div",{className:"lib-box","data-narrow":!0,children:e.jsx(Cn,{rows:t.rows,label:n.treeLabel,selectedPath:t.selected,toggled:t.toggled,rowTrailing:gt,emptyLabel:n.emptyDir,className:"py-1",onToggleDir:t.toggle,onOpenFile:t.setSelected})})}),e.jsx(h,{title:n.browser,children:e.jsx("div",{className:"lib-box",children:e.jsx(Qa,{rows:s.rows,treeLabel:n.treeLabel,selectedPath:s.selected,toggled:s.toggled,rowTrailing:gt,headerFallback:n.header,preview:x,emptyPreview:n.emptyPreview,emptyDirLabel:n.emptyDir,truncatedLabel:n.truncated,unsupportedLabel:n.unsupported,downloadLabel:n.download,treeMaxHeight:40,previewHeight:40,onToggleDir:s.toggle,onOpenFile:s.setSelected})})}),e.jsx(h,{title:n.panel,aside:n.panelHint,children:e.jsxs("div",{className:"lib-box flex flex-col",style:{height:360},children:[e.jsx("div",{className:"flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5",children:e.jsx(Tn,{className:"flex-1",items:f.map(S=>({label:S}))})}),e.jsx(Za,{className:"min-h-0 flex-1",size:l,min:160,max:320,label:n.treeWidth,onResize:c,first:e.jsx(es,{search:{value:r,onChange:o,placeholder:n.search},children:e.jsx(Cn,{rows:i.rows,label:n.treeLabel,selectedPath:i.selected,toggled:i.toggled,emptyLabel:n.emptyDir,className:"min-h-0 flex-1 overflow-auto",onToggleDir:i.toggle,onOpenFile:i.setSelected})}),second:e.jsx(Xa,{view:b,actions:b.kind==="source"&&e.jsx(O,{label:n.wrap,size:"sm",onClick:()=>p(!u),children:e.jsx(B,{d:N.wrapText})})})})]})}),e.jsx(h,{title:n.crumbs,aside:n.crumbsHint,children:e.jsx("div",{className:"lib-box","data-narrow":!0,children:e.jsx("div",{className:"flex px-2 py-1.5",children:e.jsx(Tn,{className:"flex-1",items:[n.root,"corpus","claude-code-docs","reference","hooks-guide.md"].map(S=>({label:S}))})})})}),e.jsx(h,{title:n.menu,children:e.jsxs("div",{className:"lib-row items-start",children:[e.jsxs("div",{className:"lib-stack",children:[e.jsx("span",{className:"lib-caption",children:n.menuFile}),e.jsx("div",{className:`${Ce} w-56`,children:e.jsx(An,{target:{path:"src/rag.ts",kind:"file"},labels:v,downloadHref:()=>"#",downloadName:S=>S.split("/").pop()??S,onCopyPath:w,onAddToChat:w,onUploadInto:w,onAddSelection:w,onRename:w,onDelete:w,onClose:w})})]}),e.jsxs("div",{className:"lib-stack",children:[e.jsx("span",{className:"lib-caption",children:n.menuFolder}),e.jsx("div",{className:`${Ce} w-56`,children:e.jsx(An,{target:{path:"src",kind:"dir"},labels:v,downloadHref:()=>"#",downloadName:S=>S,onCopyPath:w,onAddToChat:w,onUploadInto:w,onNewFile:w,onNewFolder:w,onRename:w,onClose:w})})]})]})}),e.jsx(h,{title:n.editor,children:e.jsx("div",{className:"lib-box",style:{height:180},children:e.jsx(ns,{path:"src/rag.ts",value:m,label:n.editorLabel("rag.ts"),wrap:u,onChange:g,onSave:w})})}),e.jsx(h,{title:n.drop,children:e.jsxs("div",{className:"lib-row items-start",children:[e.jsx("div",{className:"lib-box relative w-72",style:{height:200},children:e.jsx(En,{variant:"veil",glyph:pt,title:n.dropAttach,description:n.dropAttachHint})}),e.jsx("div",{className:"lib-box relative w-72",style:{height:200},children:e.jsx(En,{variant:"frame",glyph:pt,title:n.dropUpload("src")})})]})})]})}function jo(){const{S:a}=y(),n=a.library.inputs,[t,s]=d.useState(""),[i,r]=d.useState(n.emailValue),[o,l]=d.useState(""),[c,u]=d.useState(n.monoValue),[p,m]=d.useState(""),[g,x]=d.useState("200000"),[b,f]=d.useState("15.00"),[v,w]=d.useState(""),[S,A]=d.useState(""),[C,H]=d.useState(""),[z,L]=d.useState(""),[k,T]=d.useState(!1),[P,U]=d.useState("some"),[M,hn]=d.useState("skip"),un=[{value:"skip",label:n.radioSkip,hint:n.radioSkipHint},{value:"overwrite",label:n.radioOverwrite,hint:n.radioOverwriteHint},{value:"replace",label:n.radioReplace,hint:n.radioReplaceHint}];return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:n.basics,children:e.jsxs("div",{className:"lib-stack",children:[e.jsx($,{label:n.name,hint:n.nameHint,placeholder:n.namePlaceholder,value:t,onChange:I=>s(I.target.value)}),e.jsx($,{label:n.email,type:"email",error:n.emailError,value:i,onChange:I=>r(I.target.value)}),e.jsx($,{label:n.required,required:!0,placeholder:n.required}),e.jsx($,{label:n.info,info:n.infoText,infoLabel:n.info,id:"lib-input-info",placeholder:n.info})]})}),e.jsx(h,{title:n.sizes,children:e.jsxs("div",{className:"lib-stack",children:[e.jsx($,{label:n.base,size:"base",placeholder:n.base}),e.jsx($,{label:n.small,size:"sm",placeholder:n.small})]})}),e.jsx(h,{title:n.affix,children:e.jsxs("div",{className:"lib-stack",children:[e.jsx($,{label:n.affixContext,inputMode:"numeric",className:"font-mono",affix:{trailing:n.affixToken},value:g,onChange:I=>x(I.target.value)}),e.jsx($,{label:n.affixPrice,inputMode:"decimal",className:"text-right font-mono",affix:{leading:n.affixCurrency,trailing:n.affixUnit},value:b,onChange:I=>f(I.target.value)})]})}),e.jsx(h,{title:n.textarea,children:e.jsxs("div",{className:"lib-stack",children:[e.jsx(Mn,{label:n.textarea,placeholder:n.textareaPlaceholder,rows:3,value:o,onChange:I=>l(I.target.value)}),e.jsx(Mn,{label:n.mono,mono:!0,rows:3,value:c,onChange:I=>u(I.target.value)})]})}),e.jsx(h,{title:n.password,children:e.jsx("div",{className:"lib-stack",children:e.jsx(ts,{label:n.password,hint:n.passwordHint,value:p,onChange:I=>m(I.target.value)})})}),e.jsx(h,{title:n.search,children:e.jsxs("div",{className:"lib-stack",children:[e.jsx(be,{value:v,onChange:w,placeholder:n.searchField,"aria-label":n.searchField}),e.jsx(be,{icon:!0,value:S,onChange:A,placeholder:n.searchIcon,"aria-label":n.searchIcon}),e.jsx(be,{variant:"panel",value:C,onChange:H,placeholder:n.searchPanel,"aria-label":n.searchPanel}),e.jsx(be,{variant:"menu",value:z,onChange:L,placeholder:n.searchMenu,"aria-label":n.searchMenu})]})}),e.jsx(h,{title:n.checkboxes,children:e.jsxs("div",{className:"lib-stack",children:[e.jsx(De,{checked:k,onChange:T,label:n.checkboxLabel,hint:n.checkboxHint}),e.jsx(De,{checked:P==="all",indeterminate:P==="some",onChange:I=>U(I?"all":"none"),label:n.checkboxAll}),e.jsx(De,{checked:!0,disabled:!0,onChange:()=>{},label:n.checkboxDisabled})]})}),e.jsx(h,{title:n.radios,children:e.jsxs("div",{className:"lib-stack",children:[e.jsx(zn,{label:n.radioLabel,options:un,value:M,onChange:hn}),e.jsx(zn,{label:n.radioInline,orientation:"horizontal",options:un.map(({value:I,label:Xt})=>({value:I,label:Xt})),value:M,onChange:hn})]})})]})}const ft=["gpt-5.4","gpt-5.4-mini","o4-mini"],Je="code-reviewer",bt=[{key:"overview",glyph:N.gear},{key:"models",glyph:N.chip},{key:"schedules",glyph:N.alarmClock},{key:"vault",glyph:N.key},{key:"billing",glyph:N.dollarCircle}];function No(){const{S:a}=y(),n=a.library.layout,[t,s]=d.useState(""),[i,r]=d.useState(!0),[o,l]=d.useState("overview");return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:n.page,aside:n.pageHint,children:e.jsx("div",{className:"lib-box",children:e.jsxs(as,{width:"full",children:[e.jsx(ss,{title:n.pageTitle,info:n.pageInfo,description:n.pageDescription,back:{label:n.back,onClick:()=>{}},actions:e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"min-w-0 flex-1 sm:w-56 sm:flex-none",children:e.jsx($,{size:"sm",value:t,onChange:c=>s(c.target.value),placeholder:n.search,"aria-label":n.search})}),e.jsx(j,{size:"sm",variant:"primary",leading:e.jsx(B,{d:N.plus,size:D.inlineGlyph}),children:n.create})]})}),e.jsx(ce,{variant:"caption",children:n.pageBody})]})})}),e.jsx(h,{title:n.cards,children:e.jsxs("div",{className:"lib-stack lib-stack-wide",children:[e.jsx("span",{className:"lib-caption",children:n.padded}),e.jsxs(ae,{children:[e.jsx(Xe,{title:n.cardTitle,info:n.cardInfo,actions:e.jsx(j,{size:"xs",variant:"ghost",children:n.cardAction})}),e.jsx("p",{className:"text-lg font-semibold tabular-nums",children:n.cardValue}),e.jsx(ce,{variant:"caption",children:n.cardBody})]}),e.jsx("span",{className:"lib-caption",children:n.flush}),e.jsxs(ae,{padding:"none",children:[e.jsx(Xe,{title:n.flushTitle,description:n.flushDescription}),n.flushRows.map(c=>e.jsx(de,{title:c},c))]})]})}),e.jsx(h,{title:n.ruled,children:e.jsx(is,{title:n.ruledTitle,info:n.ruledInfo,count:3,actions:e.jsx(j,{size:"xs",variant:"ghost",children:n.ruledAction}),children:e.jsx(ce,{variant:"small",className:"text-fg-muted",children:n.ruledBody})})}),e.jsx(h,{title:n.collapsible,aside:n.collapsibleHint,children:e.jsxs("div",{className:"lib-stack lib-stack-wide",children:[e.jsx(en,{title:n.providerName,leading:e.jsx(rs,{provider:"openai",className:"size-5"}),meta:n.modelCount(ft.length),open:i,onOpenChange:r,actions:e.jsx(O,{label:n.addModel,size:"sm",variant:"ghost",children:e.jsx(B,{d:N.plus,size:D.inlineGlyph})}),children:ft.map(c=>e.jsx(de,{title:c},c))}),e.jsx(en,{title:n.foldedTitle,meta:n.modelCount(0),defaultOpen:!1,children:e.jsx("p",{className:"px-3 py-2 text-xs text-fg-subtle",children:n.foldedBody})})]})}),e.jsx(h,{title:n.entity,children:e.jsx(di,{media:e.jsx(Te,{id:Je,name:n.entityName,size:40}),name:n.entityName,meta:e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"font-mono",children:Je}),e.jsx(os,{text:Je,label:n.copyId,size:"sm"})]}),description:n.entityDescription,actions:e.jsx(j,{size:"sm",variant:"primary",children:n.entityAction}),children:e.jsx("div",{className:"flex flex-wrap gap-1.5",children:n.entityTags.map(c=>e.jsx(dn,{children:c},c))})})}),e.jsx(h,{title:n.nav,aside:n.navHint,children:e.jsxs("div",{className:"lib-stack lib-stack-wide",children:[e.jsx("span",{className:"lib-caption",children:n.navRail}),e.jsx("div",{className:"lib-box","data-narrow":!0,children:e.jsx(Ln,{label:n.navLabel,className:"p-3",children:bt.map(c=>e.jsx(In,{label:n.navRows[c.key],glyph:c.glyph,active:o===c.key,disabled:c.key==="billing",badge:c.key==="schedules"?e.jsx(Ne,{n:3}):void 0,onClick:()=>l(c.key)},c.key))})}),e.jsx("span",{className:"lib-caption",children:n.navDense}),e.jsx("div",{className:"lib-box","data-narrow":!0,children:e.jsx(Ln,{label:n.navDense,className:"p-2",children:bt.slice(0,3).map(c=>e.jsx(In,{density:"sm",label:n.navRows[c.key],glyph:c.glyph,active:o===c.key,onClick:()=>l(c.key)},c.key))})})]})})]})}const So=[["xs",10],["sm",12],["md",14]],Co=[["xs",30],["sm",60],["md",90]];function To(){const{S:a}=y(),n=a.library.loading;return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:n.spinner,aside:n.sizes,children:e.jsx("div",{className:"lib-row",children:So.map(([t,s])=>e.jsxs("span",{className:"lib-cell",children:[e.jsx(Tt,{state:"running",size:t}),e.jsxs("span",{className:"lib-caption",children:[t," · ",s,"px"]})]},t))})}),e.jsx(h,{title:n.skeleton,children:e.jsxs("div",{className:"lib-stack",children:[e.jsx(Rn,{className:"h-4 w-2/3"}),e.jsx(Rn,{className:"h-4 w-1/2"})]})}),e.jsx(h,{title:n.list,children:e.jsx("div",{className:"lib-box",children:e.jsx(ls,{rows:3})})}),e.jsx(h,{title:n.card,children:e.jsx("div",{className:"lib-stack",children:e.jsx(cs,{})})}),e.jsx(h,{title:n.progress,aside:n.progressHint,children:e.jsxs("div",{className:"lib-stack",children:[Co.map(([t,s])=>e.jsxs("div",{className:"grid gap-1",children:[e.jsxs("span",{className:"lib-caption",children:[t," · ",s,"%"]}),e.jsx(_e,{size:t,value:s,label:n.progressLabel})]},t)),e.jsxs("div",{className:"grid gap-1",children:[e.jsx("span",{className:"lib-caption",children:n.progressOver}),e.jsx(_e,{value:100,tone:"danger",label:n.progressLabel})]}),e.jsxs("div",{className:"grid gap-1",children:[e.jsx("span",{className:"lib-caption",children:n.progressIndeterminate}),e.jsx(_e,{indeterminate:!0,size:"md",label:n.progressLabel})]})]})})]})}const Ao="/home/ubuntu/.penguin/data",Jt="v0.2.16",xt="v0.2.15",Eo="7364",Mo="ssh: connect to host 10.0.0.12 port 22: Connection timed out",zo="Downloading penguin-harness 0.2.16…",Lo=["done","done","current","pending","pending","pending"],Io=["pending","pending","pending","pending","pending","pending"],Ro=[{alias:"gpu-a100",reach:"ubuntu@10.0.0.21:2222",note:null},{alias:"gpu-h200",reach:"ubuntu@10.0.0.22",note:Jt},{alias:"nas",reach:null,note:null}];function Ho(){const{S:a}=y(),n=a.library.machines,[t,s]=d.useState(()=>new Set(["gpu-a100"])),[i,r]=d.useState(""),[o,l]=d.useState(!0),[c,u]=d.useState("config"),p=b=>n.reasons[b]??null,m=(b,f={})=>{const v=[b?{glyph:N.house,value:n.card.local}:{glyph:N.terminalPrompt,value:"ssh"}];return f.version!==null&&v.push({glyph:N.hardDrive,value:f.version??Jt}),f.port===!0&&v.push({glyph:N.network,value:Eo}),v.push({glyph:N.clock,value:n.card.checked}),v},g=(b,f,v={})=>({id:b,alias:b,status:{state:f,label:n.states[f],reason:p(f)},root:Ao,facts:m(!1),onOpen:R,use:{label:n.card.use,disabled:!0,onClick:R},settingsLabel:n.card.settings,remove:{label:n.card.remove,onClick:R},...v}),x=[g("penguin-dev","serving",{local:{tag:n.card.thisServer,undeletable:n.card.undeletable},facts:m(!0,{port:!0}),use:{label:n.card.use,onClick:R}}),g("gpu-a100","ready",{facts:m(!1,{port:!0}),use:{label:n.card.use,onClick:R},sync:{label:n.card.sync,onClick:R}}),g("build-box","ready",{facts:m(!1,{port:!0,version:xt}),update:{label:n.card.update,onClick:R},use:{label:n.card.use,onClick:R}}),g("gpu-h200","working",{status:{state:"working",label:n.states.working,reason:zo},progress:{steps:Lo,caption:n.card.installing,running:!0},remove:{label:n.card.remove,disabled:!0,onClick:R}}),g("lab-mac","queued",{progress:{steps:Io,caption:n.states.queued,running:!1},remove:{label:n.card.remove,disabled:!0,onClick:R}}),g("mini","reconnecting",{waits:n.waits.reconnecting}),g("edge-1","unreachable",{status:{state:"unreachable",label:n.states.unreachable,reason:Mo},waits:n.waits.stopped}),g("office-2","notConnected",{facts:m(!1,{port:!0}),waits:n.waits.notConnected}),g("lab-pc","stopped",{waits:n.waits.stopped}),g("old-box","behind",{facts:m(!1,{port:!0,version:xt}),update:{label:n.card.update,onClick:R},waits:n.waits.notConnected}),g("gpu-v100","failed",{status:{state:"failed",label:n.states.failed,reason:p("failed")},waits:n.waits.failed}),g("vault","signInRefused",{waits:n.waits.signInRefused}),g("spare","notInstalled",{facts:m(!1,{version:null}),waits:n.waits.notInstalled}),g("win-box","installedOnly",{waits:n.waits.windows}),g("fresh","unknown",{waits:n.waits.stopped})];return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:n.pills,aside:n.pillsHint,children:e.jsx("div",{className:"flex flex-wrap items-center gap-2",children:ds.map(b=>e.jsx(hs,{state:b,label:n.states[b],reason:p(b)},b))})}),e.jsx(h,{title:n.cards,aside:n.cardsHint,children:e.jsx(Hn,{children:x.map(b=>e.jsx(us,{...b},b.id))})}),e.jsx(h,{title:n.loading,children:e.jsx(Hn,{loading:!0})}),e.jsx(h,{title:n.toolbar,aside:n.toolbarHint,children:e.jsx(ms,{label:n.toolbarLabel,busy:!1,note:n.held,onAct:R,items:[{verb:"update",label:n.verbs.update,glyph:N.refresh,primary:!0,held:!1},{verb:"stop",label:n.verbs.stop,glyph:N.stopCircle,primary:!1,held:!0},{verb:"restart",label:n.verbs.restart,glyph:N.rotateCw,primary:!1,held:!0},{verb:"configure",label:n.verbs.configure,glyph:N.slidersHorizontal,primary:!1,held:!1},{verb:"uninstall",label:n.verbs.uninstall,glyph:N.trash,primary:!1,held:!0}]})}),e.jsx(h,{title:n.add,aside:n.addHint,children:e.jsxs("div",{className:"lib-stack",children:[e.jsxs("div",{className:"lib-box",children:[e.jsx(ps,{intro:n.addIntro,tabs:[{key:"config",label:n.tabs.config},{key:"manual",label:n.tabs.manual}],tab:c,onTab:u,error:n.addError,children:e.jsx(Pn,{query:i,onQuery:r,searchLabel:n.search,children:Ro.map(b=>e.jsx(gs,{alias:b.alias,reach:b.reach,note:b.note===null?null:n.elsewhere(b.note),checked:t.has(b.alias),onToggle:()=>s(f=>{const v=new Set(f);return v.has(b.alias)?v.delete(b.alias):v.add(b.alias),v})},b.alias))})}),e.jsx("div",{className:"mt-4 flex flex-wrap items-center justify-end gap-2",children:e.jsx(fs,{installNow:o,onInstallNow:l,installNowLabel:n.installNow,cancelLabel:n.cancel,submitLabel:t.size>1?n.submitCount(t.size):n.submit,canSubmit:t.size>0,busy:!1,onCancel:R,onSubmit:R})})]}),e.jsx("span",{className:"lib-caption",children:n.exhaustedCaption}),e.jsx("div",{className:"lib-box",children:e.jsx(Pn,{query:"",onQuery:R,searchLabel:n.search,exhausted:{text:n.noHosts,actionLabel:n.tabs.manual,onAction:R}})})]})})]})}function R(){}const vt=["info","success","attention","danger","neutral"],Ye="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm";function Po(){const{S:a}=y(),n=a.library.notices,[t,s]=d.useState(()=>new Set),i=o=>()=>s(l=>new Set([...l,o])),r=()=>s(new Set);return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:n.plain,children:e.jsx("div",{className:"lib-stack",children:vt.map(o=>e.jsx($e,{tone:o,as:"p",className:Ye,children:n.texts[o]},o))})}),e.jsx(h,{title:n.dotted,children:e.jsx("div",{className:"lib-stack",children:vt.map(o=>e.jsxs($e,{tone:o,className:Ye,children:[e.jsx("span",{"data-slot":"icon",className:"flex",children:e.jsx(ue,{tone:o})}),e.jsx("span",{children:n.texts[o]})]},o))})}),e.jsx(h,{title:n.withActions,children:e.jsx("div",{className:"lib-stack",children:["info","attention","danger"].map(o=>e.jsxs($e,{tone:o,className:Ye,children:[e.jsx("span",{className:"min-w-0 flex-1",children:n.texts[o]}),e.jsxs("span",{"data-slot":"actions",className:"flex shrink-0 gap-2",children:[e.jsx(j,{size:"sm",variant:"ghost",children:n.dismiss}),e.jsx(j,{size:"sm",children:n.action})]})]},o))})}),e.jsx(h,{title:n.variants,children:e.jsxs("div",{className:"lib-stack",children:[e.jsx("span",{className:"lib-caption",children:n.variantNames.strip}),e.jsx("div",{className:"lib-box",children:e.jsx(X,{tone:"danger",variant:"strip",retry:{label:n.retry,onClick:F},children:n.texts.danger})}),e.jsx("span",{className:"lib-caption",children:n.variantNames.callout}),e.jsx(X,{tone:"attention",variant:"callout",title:n.calloutTitle,glyph:N.info,dismiss:{label:n.dismiss,onClick:F},action:{label:n.action,onClick:F},children:n.calloutBody}),e.jsx("span",{className:"lib-caption",children:n.variantNames.inline}),e.jsx(X,{tone:"info",variant:"inline",dismiss:{onClick:F},children:n.texts.info}),e.jsx("span",{className:"lib-caption",children:n.variantNames.banner}),e.jsx("div",{className:"lib-box",children:e.jsx(X,{tone:"attention",variant:"banner",action:{label:n.bannerAction,onClick:F},dismiss:{onClick:F},children:n.bannerText})})]})}),e.jsx(h,{title:n.closable,aside:n.closableHint,action:e.jsx(j,{size:"sm",variant:"ghost",onClick:r,disabled:t.size===0,children:n.reopen}),children:e.jsxs("div",{className:"lib-stack",children:[!t.has("banner")&&e.jsx("div",{className:"lib-box",children:e.jsx(X,{tone:"attention",variant:"banner",action:{label:n.bannerAction,onClick:F},dismiss:{onClick:i("banner")},children:n.bannerText})}),!t.has("inline")&&e.jsx(X,{tone:"attention",dismiss:{onClick:i("inline")},children:n.closableText})]})}),e.jsx(h,{title:n.todo,children:e.jsx("div",{className:"lib-stack",children:e.jsx(bs,{text:n.todoText,actionLabel:n.todoAction,onAction:F,dismissLabel:n.todoDismiss,onDismiss:F})})})]})}function F(){}function Bo(){const{S:a,state:n}=y(),t=a.library.pickers,[s,i]=d.useState(t.options[0]??""),[r,o]=d.useState(t.segments[0]??""),[l,c]=d.useState(!0),[u,p]=d.useState(!1),[m,g]=d.useState(!0),[x,b]=d.useState(!1),[f,v]=d.useState(!0),w=yt[n.theme].map(M=>({value:M.id,color:M.swatch,label:M.id})),[S,A]=d.useState(w[0]?.value??""),[C,H]=d.useState(t.choices[1]?.value??null),[z,L]=d.useState(!1),[k,T]=d.useState("workspace"),[P,U]=d.useState("recent");return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:t.select,children:e.jsx("div",{className:"lib-stack",children:e.jsx(xs,{label:t.selectLabel,value:s,onChange:M=>i(M.target.value),children:t.options.map(M=>e.jsx("option",{value:M,children:M},M))})})}),e.jsx(h,{title:t.segmented,children:e.jsx("div",{className:"lib-stack",children:e.jsx(vs,{options:t.segments.map(M=>({value:M,label:M})),value:r,onChange:o,cols:3})})}),e.jsx(h,{title:t.switches,children:e.jsxs("div",{className:"lib-stack",children:[e.jsxs("label",{className:"ui-field flex items-center justify-between gap-4",children:[e.jsxs("span",{children:[e.jsx("span",{className:"block",children:t.switchLabel}),e.jsx("span",{className:"lib-caption",children:t.switchHint})]}),e.jsx(Bn,{checked:l,onChange:c})]}),e.jsxs("label",{className:"ui-field flex items-center justify-between gap-4",children:[e.jsx("span",{children:t.switchOff}),e.jsx(Bn,{checked:u,onChange:p})]})]})}),e.jsx(h,{title:t.toggleRows,children:e.jsxs("div",{className:"lib-stack",children:[e.jsxs("div",{className:"divide-y divide-line-muted",children:[e.jsx(xe,{label:t.toggleRowLabel,info:t.toggleRowInfo,checked:m,onChange:g}),e.jsx(xe,{label:t.switchOff,checked:u,onChange:p})]}),e.jsx(xe,{variant:"plain",label:t.togglePlainLabel,hint:t.togglePlainHint,checked:x,onChange:b}),e.jsx(xe,{variant:"card",label:t.toggleCardLabel,checked:f,onChange:v})]})}),e.jsx(h,{title:t.swatches,children:e.jsx("div",{className:"lib-row",children:e.jsx(ws,{options:w,value:w.some(M=>M.value===S)?S:"",onChange:A})})}),e.jsx(h,{title:t.optionMenu,children:e.jsx("div",{className:"lib-stack",children:e.jsx(ks,{label:t.optionLabel,mono:!0,options:t.choices.map(M=>({value:M.value,triggerLabel:M.trigger,label:M.label,description:M.description})),value:C,onChange:H})})}),e.jsx(h,{title:t.dropdown,children:e.jsx("div",{className:"lib-row",children:e.jsx(ia,{open:z,setOpen:L,button:e.jsxs(j,{size:"sm","aria-haspopup":"menu","aria-expanded":z,onClick:()=>L(!z),children:[e.jsx("span",{children:t.menu}),e.jsx(jt,{})]}),children:e.jsxs(Ee,{children:[e.jsx(V,{glyph:N.pin,label:t.menuPin,onSelect:()=>L(!1)}),e.jsx(V,{glyph:N.pencil,label:t.menuRename,onSelect:()=>L(!1)}),e.jsx(V,{label:t.menuMove,onSelect:()=>L(!1)}),e.jsx(mn,{}),e.jsx(V,{glyph:N.trash,label:t.menuDelete,danger:!0,onSelect:()=>L(!1)})]})})})}),e.jsx(h,{title:t.menuRows,aside:t.menuRowsHint,children:e.jsxs("div",{className:"lib-row items-start",children:[e.jsx("div",{className:`${Ce} w-56`,children:e.jsxs(Ee,{density:"md",children:[e.jsx(V,{label:t.menuSettings}),e.jsx(V,{label:t.menuAppInfo,trailing:t.menuVersion}),e.jsx(V,{label:t.menuSignOut,danger:!0})]})}),e.jsx("div",{className:`${Ce} w-44`,children:e.jsxs(Ee,{density:"sm",children:[e.jsx(pn,{children:t.menuGroupBy}),e.jsx(pe,{glyph:N.folder,label:t.menuByWorkspace,checked:k==="workspace",onSelect:()=>T("workspace")}),e.jsx(pe,{glyph:N.robot,label:t.menuByAgent,checked:k==="agent",onSelect:()=>T("agent")}),e.jsx(mn,{}),e.jsx(pn,{children:t.menuSortBy}),e.jsx(pe,{glyph:N.clock,label:t.menuRecent,checked:P==="recent",onSelect:()=>U("recent")}),e.jsx(pe,{glyph:N.arrowUpDown,label:t.menuManual,checked:P==="manual",onSelect:()=>U("manual")})]})})]})})]})}const Oo=["brand","brand-outline","teal","neutral"];function Qe(a){return e.jsx("a",{...a,onClick:n=>n.preventDefault()})}function wt(a,n){const t=n.trim().toLowerCase();if(!t)return[];const s=a.toLowerCase(),i=[];let r=s.indexOf(t);for(;r!==-1;)i.push({start:r,end:r+t.length}),r=s.indexOf(t,r+t.length);return i}function Do(){const{S:a}=y(),n=a.library.site,[t,s]=d.useState(!1),i=d.useRef(null),r=d.useMemo(()=>hi(n.articleBody),[n.articleBody]),{activeId:o,pinTo:l}=Si(r),c=d.useMemo(()=>n.searchResults.map((m,g)=>({key:String(g),...m})),[n.searchResults]),u=d.useCallback(m=>m.trim()?c.filter(g=>[g.title,g.context,g.snippet].some(x=>x!==void 0&&wt(x,m).length>0)):[],[c]),p=m=>{i.current=m,s(!0)};return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:n.footer,aside:n.footerHint,children:e.jsxs("div",{className:"lib-stack lib-stack-wide",children:[e.jsx(Vn,{brand:{name:"PenguinHarness",logo:"/Adelie/gallery/penguin-logo.svg",tagline:n.tagline},columns:n.columns.map(m=>({title:m.title,links:m.links.map(g=>({id:g,href:"#",label:g,render:Qe}))})),copyright:n.copyright}),e.jsx(Vn,{copyright:n.copyright,links:n.lineLinks.map(m=>({id:m,href:"#",label:m,render:Qe}))})]})}),e.jsx(h,{title:n.code,aside:n.codeHint,children:e.jsxs("div",{className:"lib-stack",children:[e.jsx(yi,{code:`# Linux / macOS
curl -fsSL https://penguin.ooo/install.sh | sh`,label:"curl | sh",copy:{label:n.copy,announcement:n.copiedAnnouncement}}),e.jsxs("div",{className:"lib-row text-sm",children:[e.jsx(Se,{text:"penguin web",label:n.copy,announcement:n.copiedAnnouncement}),e.jsx(Se,{text:"# PenguinHarness",label:n.copyMarkdown,announcement:n.copiedAnnouncement,look:"pill-md"}),e.jsx(Se,{text:()=>window.location.href,label:n.copyLink,announcement:n.copiedAnnouncement,look:"text",glyph:"link"})]})]})}),e.jsx(h,{title:n.pills,aside:n.pillsHint,children:e.jsx("div",{className:"lib-row",children:Oo.map(m=>e.jsx(gi,{tone:m,children:n.pillTones[m]},m))})}),e.jsx(h,{title:n.article,aside:n.articleHint,children:e.jsxs("div",{className:"grid gap-10 sm:grid-cols-[minmax(0,1fr)_13rem]",children:[e.jsx(_i,{variant:"doc",remarkPlugins:Di,highlight:ji,children:n.articleBody}),e.jsx(Ci,{label:n.toc,entries:r,activeId:o,onNavigate:l,className:"hidden sm:block"})]})}),e.jsx(h,{title:n.sidebar,aside:n.sidebarHint,children:e.jsx("div",{className:"max-w-60",children:e.jsx(Ei,{label:n.sidebar,renderLink:Qe,search:{label:n.searchLabels.open,shortcut:Kn(),onOpen:p},sections:n.sidebarSections.map((m,g)=>({id:m.title,title:m.title,items:m.pages.map((x,b)=>({id:x,href:"#",label:x,children:g===0&&b===1?m.children.map((f,v)=>({id:f,href:"#",label:f,active:v===1})):void 0}))}))})})}),e.jsxs(h,{title:n.search,aside:n.searchHint,children:[e.jsx("div",{className:"max-w-60",children:e.jsx(Dt,{label:n.searchLabels.open,shortcut:Kn(),onOpen:p})}),e.jsx(Ai,{open:t,onClose:()=>s(!1),returnFocusRef:i,search:u,highlight:wt,onSelect:()=>{},labels:n.searchLabels})]}),e.jsx(h,{title:n.leave,aside:n.leaveHint,children:e.jsx(Mi,{labels:n.leaveLabels,children:e.jsx(zi,{href:"https://github.com/Prism-Shadow/penguin-harness",className:"text-sm underline underline-offset-2",children:n.leaveLink})})})]})}const _o=5,$o=a=>ra.includes(a);function Fo(){const a=getComputedStyle(document.documentElement),n=a.getPropertyValue("--ui-stream-reveal").trim(),t=Number.parseFloat(a.getPropertyValue("--ui-stream-rate"));return{reveal:n,rate:Number.isFinite(t)?t:0}}function qo(){const[a,n]=d.useState(null);return d.useEffect(()=>{const t=()=>n(Fo());t();const s=new MutationObserver(t);return s.observe(document.documentElement,{attributes:!0,attributeFilter:["class","data-theme","data-motion","style"]}),()=>s.disconnect()},[]),a}function Wo(a,n){const t=d.useMemo(()=>Ns(a,_o),[a]),s=d.useMemo(()=>{let o=0;return t.map(l=>(o+=l.text.length,o))},[t]),[i,r]=d.useState(0);return d.useEffect(()=>{r(0);let o=0,l=0;const c=()=>{o+=1,r(o);const p=t[o];p&&(l=window.setTimeout(c,p.gap))},u=t[0];return u&&(l=window.setTimeout(c,u.gap)),()=>window.clearTimeout(l)},[t,n]),{text:i===0?"":a.slice(0,s[i-1]),streaming:i<t.length}}function Go({tokens:a}){const{S:n}=y(),t=n.library.streaming,{reveal:s,rate:i}=a,r=$o(s),o=Ss()||document.documentElement.dataset.motion==="reduced";return e.jsxs("p",{className:"lib-caption",children:[e.jsxs("code",{className:"gf-mono",children:["--ui-stream-reveal: ",s||n.section.unset]})," · ",r?t.modes[s]:t.unset,r&&s!=="instant"&&i>0&&` · ${t.rate(i)}`,o&&` · ${t.reduced}`]})}function Uo(){const{S:a,state:n}=y(),t=a.library.streaming,s=ys(n.lang),[i,r]=d.useState(0),o=Wo(s,i),l=qo();return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:t.reply,aside:o.streaming?t.receiving:t.received,action:e.jsx(me,{onClick:()=>r(c=>c+1)}),children:e.jsxs("div",{className:"lib-box lib-stream",children:[e.jsx("div",{className:"lib-stream-sizer","aria-hidden":!0,inert:!0,children:e.jsx(On,{text:s,streaming:!1})}),e.jsx("div",{className:"lib-stream-live",children:e.jsx(On,{text:o.text,streaming:o.streaming},i)})]})}),e.jsxs(h,{title:t.output,aside:o.streaming?t.receiving:t.received,children:[e.jsxs("div",{className:"lib-stream lib-stream-output",children:[e.jsx("div",{className:"lib-stream-sizer","aria-hidden":!0,inert:!0,children:e.jsx(Dn,{format:"plain",className:_n,text:s,streaming:!1})}),e.jsx("div",{className:"lib-stream-live",children:e.jsx(Dn,{format:"plain",className:_n,settledClassName:js,text:o.text,streaming:o.streaming},i)})]}),l===null?e.jsx("p",{className:"lib-caption",children:a.intro.resolving}):e.jsx(Go,{tokens:l})]})]})}function Vo(){const{S:a}=y(),n=a.library.tabs,t=n.items.map(c=>({key:c,label:c})),[s,i]=d.useState(t[0]?.key??""),[r,o]=d.useState(t[0]?.key??""),l=t.map((c,u)=>u===t.length-1?{...c,badge:n.badgeText}:c);return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:n.basic,children:e.jsxs("div",{className:"lib-box",children:[e.jsx($n,{items:t,active:s,onChange:i}),e.jsx("p",{className:"p-4 text-sm",children:n.body(s)})]})}),e.jsx(h,{title:n.badged,children:e.jsxs("div",{className:"lib-box",children:[e.jsx($n,{items:l,active:r,onChange:o}),e.jsx("p",{className:"p-4 text-sm",children:n.body(r)})]})})]})}function Ko(){const{S:a}=y(),n=a.library.toasts;return e.jsx("div",{className:"gf-board",children:e.jsx(h,{title:n.fire,aside:n.hint,children:e.jsxs("div",{className:"lib-row",children:[e.jsx(j,{variant:"primary",onClick:()=>Cs(n.successText),children:n.success}),e.jsx(j,{onClick:()=>Et(n.infoText),children:n.info}),e.jsx(j,{onClick:()=>Ts(n.attentionText),children:n.attention}),e.jsx(j,{variant:"danger",onClick:()=>As(n.errorText),children:n.error})]})})})}const Jo="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",Yo="M9 9h9v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9zM7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1",Qo="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z";function oe({d:a}){return e.jsx("svg",{width:15,height:15,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.5",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":!0,children:e.jsx("path",{d:a})})}function Zo(){const{S:a}=y(),n=a.library.tooltips;return e.jsxs("div",{className:"gf-board",children:[e.jsx(h,{title:n.attribute,aside:n.attributeHint,children:e.jsxs("div",{className:"lib-row",children:[e.jsx(j,{size:"icon","aria-label":n.edit,"data-tooltip":n.edit,children:e.jsx(oe,{d:Jo})}),e.jsx(j,{size:"icon","aria-label":n.copy,"data-tooltip":n.copy,children:e.jsx(oe,{d:Yo})}),e.jsx(j,{size:"icon","aria-label":n.settings,"data-tooltip":n.settings,children:e.jsx(oe,{d:Qo})})]})}),e.jsx(h,{title:n.component,aside:n.componentHint,children:e.jsxs("div",{className:"lib-row",children:[e.jsx(Fn,{label:n.besideTip,placement:"right",children:e.jsx(j,{size:"icon","aria-label":n.besideTip,children:e.jsx(oe,{d:N.chevronRight})})}),e.jsx(Fn,{label:n.belowTip,placement:"bottom",children:e.jsx(j,{size:"icon","aria-label":n.belowTip,children:e.jsx(oe,{d:N.arrowDownToLine})})})]})}),e.jsx(h,{title:n.truncated,aside:n.truncatedHint,children:e.jsx("div",{className:"lib-box","data-narrow":!0,children:e.jsx("span",{className:"lib-truncated px-3 py-2","data-tooltip":n.command,"data-tooltip-content":"code",tabIndex:0,children:n.command})})})]})}const Xo={buttons:Lr,inputs:jo,pickers:Bo,toasts:Ko,notices:Po,dialogs:xo,tooltips:Zo,tabs:Vo,badges:Mr,empty:vo,loading:To,streaming:Uo,charts:ao,avatars:Cr,site:Do,files:yo,content:ho,layout:No,data:bo,machines:Ho,colour:sr,type:Sr,shape:jr,density:lr,focus:cr,motion:xr,icons:ur,hooks:hr},Yt={margin:16,dialogMin:560};function el(a,n,{margin:t,dialogMin:s}=Yt){let i=a.bottom;a.contentBottom>a.bottom&&(i=Math.max(i,a.contentBottom+t));for(const r of n)i=r.covers?Math.max(i,s,r.panelHeight+2*t):Math.max(i,r.bottom+t);return Math.ceil(Math.max(0,i))}function nl(a,n){return a.top<=1&&a.bottom>=n-1}const cn=a=>a.width>0&&a.height>0;function kt(a,n=[]){let t=-1/0;const s=a.getBoundingClientRect();cn(s)&&(t=s.bottom);for(const i of a.querySelectorAll("*")){if(n.some(o=>o.contains(i)))continue;const r=i.getBoundingClientRect();cn(r)&&(t=Math.max(t,r.bottom))}return t}function tl(a,n){let t=0;for(const s of a.querySelectorAll("*")){const i=s.getBoundingClientRect();cn(i)&&i.height<n-1&&(t=Math.max(t,i.height))}return t}function al(a){const n=a.ownerDocument.defaultView;if(!n)return[];const t=[];for(const s of a.querySelectorAll("*"))t.some(i=>i.contains(s))||n.getComputedStyle(s).position==="fixed"&&t.push(s);return t}function sl(a,n,t,s=Yt){const i=a.defaultView?.innerHeight??0,r=al(n),o={bottom:n.getBoundingClientRect().bottom,contentBottom:kt(n,r)},l=Array.from(a.body.children).filter(u=>u!==t&&u.tagName!=="SCRIPT"&&u.tagName!=="STYLE"),c=[];for(const u of[...l,...r]){const p=u.getBoundingClientRect();if(nl(p,i))c.push({bottom:p.bottom,covers:!0,panelHeight:tl(u,i)});else{const m=kt(u);m>-1/0&&c.push({bottom:m,covers:!1,panelHeight:0})}}return el(o,c,s)}function il({topic:a}){const n=Xo[a],t=d.useRef(null);return d.useEffect(()=>{const s=t.current,i=document.getElementById("root");if(!s||!i||window.parent===window)return;let r=0,o=-1;const l=()=>{r=0;const g=sl(document,s,i);g!==o&&(o=g,g!==window.innerHeight&&Wi(),window.parent.postMessage({type:Vs,height:g},"*"))},c=()=>{r===0&&(r=requestAnimationFrame(l))};c();const u=new ResizeObserver(c);u.observe(s);const p=new MutationObserver(c);p.observe(document.body,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["style","class"]}),document.fonts.ready.then(c);const m=qi(c);return()=>{u.disconnect(),p.disconnect(),m(),r!==0&&cancelAnimationFrame(r)}},[]),d.useEffect(()=>{document.fonts.ready.then(()=>{document.documentElement.dataset.galleryReady="1"})},[]),e.jsx("main",{ref:t,className:"lib-page","data-topic":a,children:e.jsx(n,{})})}const Qt=Ks(window.location.search);Es({lang:Qt.lang,signedIn:!0});Ms();if(window.parent!==window){document.documentElement.dataset.framed="1",Fi(window);const a=HTMLElement.prototype.focus;HTMLElement.prototype.focus=function(n){a.call(this,{...n,preventScroll:!0})}}const Zt=document.getElementById("root");if(!Zt)throw new Error("#root mount point not found");oa.createRoot(Zt).render(e.jsx(d.StrictMode,{children:e.jsx(zs,{highlight:Ls,children:e.jsx(Is,{children:e.jsx(Rs,{children:e.jsxs(Hs,{children:[e.jsx(Js,{children:e.jsx(il,{topic:Qt.topic})}),e.jsx(Ps,{}),e.jsx(Bs,{})]})})})})}));
