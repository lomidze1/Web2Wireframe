var dc=Object.create,zr=Object.defineProperty,mc=Object.getOwnPropertyDescriptor,gc=Object.getOwnPropertyNames,yc=Object.getPrototypeOf,vc=Object.prototype.hasOwnProperty,bc=(t,e,r)=>e in t?zr(t,e,{
enumerable:!0,configurable:!0,writable:!0,value:r
}
):t[e]=r,wc=(t,e)=>()=>(t&&(e=t(t=0)),e),xt=(t,e)=>()=>(e||t((e={
exports:{

}

}
).exports,e),e.exports),nr=(t,e)=>{
for(var r in e)zr(t,r,{
get:e[r],enumerable:!0
}
)
}
,xc=(t,e,r,n)=>{
if(e&&typeof e=="object"||typeof e=="function")for(let o of gc(e))!vc.call(t,o)&&o!==r&&zr(t,o,{
get:()=>e[o],enumerable:!(n=mc(e,o))||n.enumerable
}
);
return t
}
,Pt=(t,e,r)=>(r=t!=null?dc(yc(t)):{

}
,xc(e||!t||!t.__esModule?zr(r,"default",{
value:t,enumerable:!0
}
):r,t)),Fo=(t,e,r)=>(bc(t,typeof e!="symbol"?e+"":e,r),r),Ac=xt((t,e)=>{
U();
var r=e.exports={

}
,n,o;
function a(){
throw new Error("setTimeout has not been defined")
}
function i(){
throw new Error("clearTimeout has not been defined")
}
(function(){
try{
typeof setTimeout=="function"?n=setTimeout:n=a
}
catch{
n=a
}
try{
typeof clearTimeout=="function"?o=clearTimeout:o=i
}
catch{
o=i
}

}
)();
function s(v){
if(n===setTimeout)return setTimeout(v,0);
if((n===a||!n)&&setTimeout)return n=setTimeout,setTimeout(v,0);
try{
return n(v,0)
}
catch{
try{
return n.call(null,v,0)
}
catch{
return n.call(this,v,0)
}

}

}
function l(v){
if(o===clearTimeout)return clearTimeout(v);
if((o===i||!o)&&clearTimeout)return o=clearTimeout,clearTimeout(v);
try{
return o(v)
}
catch{
try{
return o.call(null,v)
}
catch{
return o.call(this,v)
}

}

}
var u=[],f=!1,p,g=-1;
function w(){
!f||!p||(f=!1,p.length?u=p.concat(u):g=-1,u.length&&b())
}
function b(){
if(!f){
var v=s(w);
f=!0;
for(var x=u.length;
x;
){
for(p=u,u=[];
++g<x;
)p&&p[g].run();
g=-1,x=u.length
}
p=null,f=!1,l(v)
}

}
r.nextTick=function(v){
var x=new Array(arguments.length-1);
if(arguments.length>1)for(var k=1;
k<arguments.length;
k++)x[k-1]=arguments[k];
u.push(new h(v,x)),u.length===1&&!f&&s(b)
}
;
function h(v,x){
this.fun=v,this.array=x
}
h.prototype.run=function(){
this.fun.apply(null,this.array)
}
,r.title="browser",r.browser=!0,r.env={

}
,r.argv=[],r.version="",r.versions={

}
;
function m(){

}
r.on=m,r.addListener=m,r.once=m,r.off=m,r.removeListener=m,r.removeAllListeners=m,r.emit=m,r.prependListener=m,r.prependOnceListener=m,r.listeners=function(v){
return[]
}
,r.binding=function(v){
throw new Error("process.binding is not supported")
}
,r.cwd=function(){
return"/"
}
,r.chdir=function(v){
throw new Error("process.chdir is not supported")
}
,r.umask=function(){
return 0
}

}
),Mc=xt(t=>{
"use strict";
U(),t.byteLength=l,t.toByteArray=f,t.fromByteArray=w;
var e=[],r=[],n=typeof Uint8Array<"u"?Uint8Array:Array,o="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
for(a=0,i=o.length;
a<i;
++a)e[a]=o[a],r[o.charCodeAt(a)]=a;
var a,i;
r["-".charCodeAt(0)]=62,r["_".charCodeAt(0)]=63;
function s(b){
var h=b.length;
if(h%4>0)throw new Error("Invalid string. Length must be a multiple of 4");
var m=b.indexOf("=");
m===-1&&(m=h);
var v=m===h?0:4-m%4;
return[m,v]
}
function l(b){
var h=s(b),m=h[0],v=h[1];
return(m+v)*3/4-v
}
function u(b,h,m){
return(h+m)*3/4-m
}
function f(b){
var h,m=s(b),v=m[0],x=m[1],k=new n(u(b,v,x)),N=0,_=x>0?v-4:v,I;
for(I=0;
I<_;
I+=4)h=r[b.charCodeAt(I)]<<18|r[b.charCodeAt(I+1)]<<12|r[b.charCodeAt(I+2)]<<6|r[b.charCodeAt(I+3)],k[N++]=h>>16&255,k[N++]=h>>8&255,k[N++]=h&255;
return x===2&&(h=r[b.charCodeAt(I)]<<2|r[b.charCodeAt(I+1)]>>4,k[N++]=h&255),x===1&&(h=r[b.charCodeAt(I)]<<10|r[b.charCodeAt(I+1)]<<4|r[b.charCodeAt(I+2)]>>2,k[N++]=h>>8&255,k[N++]=h&255),k
}
function p(b){
return e[b>>18&63]+e[b>>12&63]+e[b>>6&63]+e[b&63]
}
function g(b,h,m){
for(var v,x=[],k=h;
k<m;
k+=3)v=(b[k]<<16&16711680)+(b[k+1]<<8&65280)+(b[k+2]&255),x.push(p(v));
return x.join("")
}
function w(b){
for(var h,m=b.length,v=m%3,x=[],k=16383,N=0,_=m-v;
N<_;
N+=k)x.push(g(b,N,N+k>_?_:N+k));
return v===1?(h=b[m-1],x.push(e[h>>2]+e[h<<4&63]+"==")):v===2&&(h=(b[m-2]<<8)+b[m-1],x.push(e[h>>10]+e[h>>4&63]+e[h<<2&63]+"=")),x.join("")
}

}
),Ec=xt(t=>{
U(),t.read=function(e,r,n,o,a){
var i,s,l=a*8-o-1,u=(1<<l)-1,f=u>>1,p=-7,g=n?a-1:0,w=n?-1:1,b=e[r+g];
for(g+=w,i=b&(1<<-p)-1,b>>=-p,p+=l;
p>0;
i=i*256+e[r+g],g+=w,p-=8);
for(s=i&(1<<-p)-1,i>>=-p,p+=o;
p>0;
s=s*256+e[r+g],g+=w,p-=8);
if(i===0)i=1-f;
else{
if(i===u)return s?NaN:(b?-1:1)*(1/0);
s=s+Math.pow(2,o),i=i-f
}
return(b?-1:1)*s*Math.pow(2,i-o)
}
,t.write=function(e,r,n,o,a,i){
var s,l,u,f=i*8-a-1,p=(1<<f)-1,g=p>>1,w=a===23?Math.pow(2,-24)-Math.pow(2,-77):0,b=o?0:i-1,h=o?1:-1,m=r<0||r===0&&1/r<0?1:0;
for(r=Math.abs(r),isNaN(r)||r===1/0?(l=isNaN(r)?1:0,s=p):(s=Math.floor(Math.log(r)/Math.LN2),r*(u=Math.pow(2,-s))<1&&(s--,u*=2),s+g>=1?r+=w/u:r+=w*Math.pow(2,1-g),r*u>=2&&(s++,u/=2),s+g>=p?(l=0,s=p):s+g>=1?(l=(r*u-1)*Math.pow(2,a),s=s+g):(l=r*Math.pow(2,g-1)*Math.pow(2,a),s=0));
a>=8;
e[n+b]=l&255,b+=h,l/=256,a-=8);
for(s=s<<a|l,f+=a;
f>0;
e[n+b]=s&255,b+=h,s/=256,f-=8);
e[n+b-h]|=m*128
}

}
),ao=xt(t=>{
"use strict";
U();
var e=Mc(),r=Ec(),n=typeof Symbol=="function"&&typeof Symbol.for=="function"?Symbol.for("nodejs.util.inspect.custom"):null;
t.Buffer=s,t.SlowBuffer=x,t.INSPECT_MAX_BYTES=50;
var o=2147483647;
t.kMaxLength=o,s.TYPED_ARRAY_SUPPORT=a(),!s.TYPED_ARRAY_SUPPORT&&typeof console<"u"&&typeof console.error=="function"&&console.error("This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support.");
function a(){
try{
let c=new Uint8Array(1),d={
foo:function(){
return 42
}

}
;
return Object.setPrototypeOf(d,Uint8Array.prototype),Object.setPrototypeOf(c,d),c.foo()===42
}
catch{
return!1
}

}
Object.defineProperty(s.prototype,"parent",{
enumerable:!0,get:function(){
if(s.isBuffer(this))return this.buffer
}

}
),Object.defineProperty(s.prototype,"offset",{
enumerable:!0,get:function(){
if(s.isBuffer(this))return this.byteOffset
}

}
);
function i(c){
if(c>o)throw new RangeError('The value "'+c+'" is invalid for option "size"');
let d=new Uint8Array(c);
return Object.setPrototypeOf(d,s.prototype),d
}
function s(c,d,y){
if(typeof c=="number"){
if(typeof d=="string")throw new TypeError('The "string" argument must be of type string. Received type number');
return p(c)
}
return l(c,d,y)
}
s.poolSize=8192;
function l(c,d,y){
if(typeof c=="string")return g(c,d);
if(ArrayBuffer.isView(c))return b(c);
if(c==null)throw new TypeError("The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type "+typeof c);
if(Ot(c,ArrayBuffer)||c&&Ot(c.buffer,ArrayBuffer)||typeof SharedArrayBuffer<"u"&&(Ot(c,SharedArrayBuffer)||c&&Ot(c.buffer,SharedArrayBuffer)))return h(c,d,y);
if(typeof c=="number")throw new TypeError('The "value" argument must not be of type number. Received type number');
let S=c.valueOf&&c.valueOf();
if(S!=null&&S!==c)return s.from(S,d,y);
let D=m(c);
if(D)return D;
if(typeof Symbol<"u"&&Symbol.toPrimitive!=null&&typeof c[Symbol.toPrimitive]=="function")return s.from(c[Symbol.toPrimitive]("string"),d,y);
throw new TypeError("The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type "+typeof c)
}
s.from=function(c,d,y){
return l(c,d,y)
}
,Object.setPrototypeOf(s.prototype,Uint8Array.prototype),Object.setPrototypeOf(s,Uint8Array);
function u(c){
if(typeof c!="number")throw new TypeError('"size" argument must be of type number');
if(c<0)throw new RangeError('The value "'+c+'" is invalid for option "size"')
}
function f(c,d,y){
return u(c),c<=0?i(c):d!==void 0?typeof y=="string"?i(c).fill(d,y):i(c).fill(d):i(c)
}
s.alloc=function(c,d,y){
return f(c,d,y)
}
;
function p(c){
return u(c),i(c<0?0:v(c)|0)
}
s.allocUnsafe=function(c){
return p(c)
}
,s.allocUnsafeSlow=function(c){
return p(c)
}
;
function g(c,d){
if((typeof d!="string"||d==="")&&(d="utf8"),!s.isEncoding(d))throw new TypeError("Unknown encoding: "+d);
let y=k(c,d)|0,S=i(y),D=S.write(c,d);
return D!==y&&(S=S.slice(0,D)),S
}
function w(c){
let d=c.length<0?0:v(c.length)|0,y=i(d);
for(let S=0;
S<d;
S+=1)y[S]=c[S]&255;
return y
}
function b(c){
if(Ot(c,Uint8Array)){
let d=new Uint8Array(c);
return h(d.buffer,d.byteOffset,d.byteLength)
}
return w(c)
}
function h(c,d,y){
if(d<0||c.byteLength<d)throw new RangeError('"offset" is outside of buffer bounds');
if(c.byteLength<d+(y||0))throw new RangeError('"length" is outside of buffer bounds');
let S;
return d===void 0&&y===void 0?S=new Uint8Array(c):y===void 0?S=new Uint8Array(c,d):S=new Uint8Array(c,d,y),Object.setPrototypeOf(S,s.prototype),S
}
function m(c){
if(s.isBuffer(c)){
let d=v(c.length)|0,y=i(d);
return y.length===0||c.copy(y,0,0,d),y
}
if(c.length!==void 0)return typeof c.length!="number"||oe(c.length)?i(0):w(c);
if(c.type==="Buffer"&&Array.isArray(c.data))return w(c.data)
}
function v(c){
if(c>=o)throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x"+o.toString(16)+" bytes");
return c|0
}
function x(c){
return+c!=c&&(c=0),s.alloc(+c)
}
s.isBuffer=function(c){
return c!=null&&c._isBuffer===!0&&c!==s.prototype
}
,s.compare=function(c,d){
if(Ot(c,Uint8Array)&&(c=s.from(c,c.offset,c.byteLength)),Ot(d,Uint8Array)&&(d=s.from(d,d.offset,d.byteLength)),!s.isBuffer(c)||!s.isBuffer(d))throw new TypeError('The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array');
if(c===d)return 0;
let y=c.length,S=d.length;
for(let D=0,W=Math.min(y,S);
D<W;
++D)if(c[D]!==d[D]){
y=c[D],S=d[D];
break
}
return y<S?-1:S<y?1:0
}
,s.isEncoding=function(c){
switch(String(c).toLowerCase()){
case"hex":case"utf8":case"utf-8":case"ascii":case"latin1":case"binary":case"base64":case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return!0;
default:return!1
}

}
,s.concat=function(c,d){
if(!Array.isArray(c))throw new TypeError('"list" argument must be an Array of Buffers');
if(c.length===0)return s.alloc(0);
let y;
if(d===void 0)for(d=0,y=0;
y<c.length;
++y)d+=c[y].length;
let S=s.allocUnsafe(d),D=0;
for(y=0;
y<c.length;
++y){
let W=c[y];
if(Ot(W,Uint8Array))D+W.length>S.length?(s.isBuffer(W)||(W=s.from(W)),W.copy(S,D)):Uint8Array.prototype.set.call(S,W,D);
else if(s.isBuffer(W))W.copy(S,D);
else throw new TypeError('"list" argument must be an Array of Buffers');
D+=W.length
}
return S
}
;
function k(c,d){
if(s.isBuffer(c))return c.length;
if(ArrayBuffer.isView(c)||Ot(c,ArrayBuffer))return c.byteLength;
if(typeof c!="string")throw new TypeError('The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type '+typeof c);
let y=c.length,S=arguments.length>2&&arguments[2]===!0;
if(!S&&y===0)return 0;
let D=!1;
for(;
;
)switch(d){
case"ascii":case"latin1":case"binary":return y;
case"utf8":case"utf-8":return mt(c).length;
case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return y*2;
case"hex":return y>>>1;
case"base64":return dt(c).length;
default:if(D)return S?-1:mt(c).length;
d=(""+d).toLowerCase(),D=!0
}

}
s.byteLength=k;
function N(c,d,y){
let S=!1;
if((d===void 0||d<0)&&(d=0),d>this.length||((y===void 0||y>this.length)&&(y=this.length),y<=0)||(y>>>=0,d>>>=0,y<=d))return"";
for(c||(c="utf8");
;
)switch(c){
case"hex":return $(this,d,y);
case"utf8":case"utf-8":return G(this,d,y);
case"ascii":return T(this,d,y);
case"latin1":case"binary":return F(this,d,y);
case"base64":return Y(this,d,y);
case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return Z(this,d,y);
default:if(S)throw new TypeError("Unknown encoding: "+c);
c=(c+"").toLowerCase(),S=!0
}

}
s.prototype._isBuffer=!0;
function _(c,d,y){
let S=c[d];
c[d]=c[y],c[y]=S
}
s.prototype.swap16=function(){
let c=this.length;
if(c%2!==0)throw new RangeError("Buffer size must be a multiple of 16-bits");
for(let d=0;
d<c;
d+=2)_(this,d,d+1);
return this
}
,s.prototype.swap32=function(){
let c=this.length;
if(c%4!==0)throw new RangeError("Buffer size must be a multiple of 32-bits");
for(let d=0;
d<c;
d+=4)_(this,d,d+3),_(this,d+1,d+2);
return this
}
,s.prototype.swap64=function(){
let c=this.length;
if(c%8!==0)throw new RangeError("Buffer size must be a multiple of 64-bits");
for(let d=0;
d<c;
d+=8)_(this,d,d+7),_(this,d+1,d+6),_(this,d+2,d+5),_(this,d+3,d+4);
return this
}
,s.prototype.toString=function(){
let c=this.length;
return c===0?"":arguments.length===0?G(this,0,c):N.apply(this,arguments)
}
,s.prototype.toLocaleString=s.prototype.toString,s.prototype.equals=function(c){
if(!s.isBuffer(c))throw new TypeError("Argument must be a Buffer");
return this===c?!0:s.compare(this,c)===0
}
,s.prototype.inspect=function(){
let c="",d=t.INSPECT_MAX_BYTES;
return c=this.toString("hex",0,d).replace(/(.{
2
}
)/g,"$1 ").trim(),this.length>d&&(c+=" ... "),"<Buffer "+c+">"
}
,n&&(s.prototype[n]=s.prototype.inspect),s.prototype.compare=function(c,d,y,S,D){
if(Ot(c,Uint8Array)&&(c=s.from(c,c.offset,c.byteLength)),!s.isBuffer(c))throw new TypeError('The "target" argument must be one of type Buffer or Uint8Array. Received type '+typeof c);
if(d===void 0&&(d=0),y===void 0&&(y=c?c.length:0),S===void 0&&(S=0),D===void 0&&(D=this.length),d<0||y>c.length||S<0||D>this.length)throw new RangeError("out of range index");
if(S>=D&&d>=y)return 0;
if(S>=D)return-1;
if(d>=y)return 1;
if(d>>>=0,y>>>=0,S>>>=0,D>>>=0,this===c)return 0;
let W=D-S,J=y-d,A=Math.min(W,J),P=this.slice(S,D),B=c.slice(d,y);
for(let L=0;
L<A;
++L)if(P[L]!==B[L]){
W=P[L],J=B[L];
break
}
return W<J?-1:J<W?1:0
}
;
function I(c,d,y,S,D){
if(c.length===0)return-1;
if(typeof y=="string"?(S=y,y=0):y>2147483647?y=2147483647:y<-2147483648&&(y=-2147483648),y=+y,oe(y)&&(y=D?0:c.length-1),y<0&&(y=c.length+y),y>=c.length){
if(D)return-1;
y=c.length-1
}
else if(y<0)if(D)y=0;
else return-1;
if(typeof d=="string"&&(d=s.from(d,S)),s.isBuffer(d))return d.length===0?-1:z(c,d,y,S,D);
if(typeof d=="number")return d=d&255,typeof Uint8Array.prototype.indexOf=="function"?D?Uint8Array.prototype.indexOf.call(c,d,y):Uint8Array.prototype.lastIndexOf.call(c,d,y):z(c,[d],y,S,D);
throw new TypeError("val must be string, number or Buffer")
}
function z(c,d,y,S,D){
let W=1,J=c.length,A=d.length;
if(S!==void 0&&(S=String(S).toLowerCase(),S==="ucs2"||S==="ucs-2"||S==="utf16le"||S==="utf-16le")){
if(c.length<2||d.length<2)return-1;
W=2,J/=2,A/=2,y/=2
}
function P(L,O){
return W===1?L[O]:L.readUInt16BE(O*W)
}
let B;
if(D){
let L=-1;
for(B=y;
B<J;
B++)if(P(c,B)===P(d,L===-1?0:B-L)){
if(L===-1&&(L=B),B-L+1===A)return L*W
}
else L!==-1&&(B-=B-L),L=-1
}
else for(y+A>J&&(y=J-A),B=y;
B>=0;
B--){
let L=!0;
for(let O=0;
O<A;
O++)if(P(c,B+O)!==P(d,O)){
L=!1;
break
}
if(L)return B
}
return-1
}
s.prototype.includes=function(c,d,y){
return this.indexOf(c,d,y)!==-1
}
,s.prototype.indexOf=function(c,d,y){
return I(this,c,d,y,!0)
}
,s.prototype.lastIndexOf=function(c,d,y){
return I(this,c,d,y,!1)
}
;
function R(c,d,y,S){
y=Number(y)||0;
let D=c.length-y;
S?(S=Number(S),S>D&&(S=D)):S=D;
let W=d.length;
S>W/2&&(S=W/2);
let J;
for(J=0;
J<S;
++J){
let A=parseInt(d.substr(J*2,2),16);
if(oe(A))return J;
c[y+J]=A
}
return J
}
function M(c,d,y,S){
return ne(mt(d,c.length-y),c,y,S)
}
function C(c,d,y,S){
return ne(Me(d),c,y,S)
}
function E(c,d,y,S){
return ne(dt(d),c,y,S)
}
function q(c,d,y,S){
return ne(Ie(d,c.length-y),c,y,S)
}
s.prototype.write=function(c,d,y,S){
if(d===void 0)S="utf8",y=this.length,d=0;
else if(y===void 0&&typeof d=="string")S=d,y=this.length,d=0;
else if(isFinite(d))d=d>>>0,isFinite(y)?(y=y>>>0,S===void 0&&(S="utf8")):(S=y,y=void 0);
else throw new Error("Buffer.write(string, encoding, offset[, length]) is no longer supported");
let D=this.length-d;
if((y===void 0||y>D)&&(y=D),c.length>0&&(y<0||d<0)||d>this.length)throw new RangeError("Attempt to write outside buffer bounds");
S||(S="utf8");
let W=!1;
for(;
;
)switch(S){
case"hex":return R(this,c,d,y);
case"utf8":case"utf-8":return M(this,c,d,y);
case"ascii":case"latin1":case"binary":return C(this,c,d,y);
case"base64":return E(this,c,d,y);
case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return q(this,c,d,y);
default:if(W)throw new TypeError("Unknown encoding: "+S);
S=(""+S).toLowerCase(),W=!0
}

}
,s.prototype.toJSON=function(){
return{
type:"Buffer",data:Array.prototype.slice.call(this._arr||this,0)
}

}
;
function Y(c,d,y){
return d===0&&y===c.length?e.fromByteArray(c):e.fromByteArray(c.slice(d,y))
}
function G(c,d,y){
y=Math.min(c.length,y);
let S=[],D=d;
for(;
D<y;
){
let W=c[D],J=null,A=W>239?4:W>223?3:W>191?2:1;
if(D+A<=y){
let P,B,L,O;
switch(A){
case 1:W<128&&(J=W);
break;
case 2:P=c[D+1],(P&192)===128&&(O=(W&31)<<6|P&63,O>127&&(J=O));
break;
case 3:P=c[D+1],B=c[D+2],(P&192)===128&&(B&192)===128&&(O=(W&15)<<12|(P&63)<<6|B&63,O>2047&&(O<55296||O>57343)&&(J=O));
break;
case 4:P=c[D+1],B=c[D+2],L=c[D+3],(P&192)===128&&(B&192)===128&&(L&192)===128&&(O=(W&15)<<18|(P&63)<<12|(B&63)<<6|L&63,O>65535&&O<1114112&&(J=O))
}

}
J===null?(J=65533,A=1):J>65535&&(J-=65536,S.push(J>>>10&1023|55296),J=56320|J&1023),S.push(J),D+=A
}
return H(S)
}
var j=4096;
function H(c){
let d=c.length;
if(d<=j)return String.fromCharCode.apply(String,c);
let y="",S=0;
for(;
S<d;
)y+=String.fromCharCode.apply(String,c.slice(S,S+=j));
return y
}
function T(c,d,y){
let S="";
y=Math.min(c.length,y);
for(let D=d;
D<y;
++D)S+=String.fromCharCode(c[D]&127);
return S
}
function F(c,d,y){
let S="";
y=Math.min(c.length,y);
for(let D=d;
D<y;
++D)S+=String.fromCharCode(c[D]);
return S
}
function $(c,d,y){
let S=c.length;
(!d||d<0)&&(d=0),(!y||y<0||y>S)&&(y=S);
let D="";
for(let W=d;
W<y;
++W)D+=Xt[c[W]];
return D
}
function Z(c,d,y){
let S=c.slice(d,y),D="";
for(let W=0;
W<S.length-1;
W+=2)D+=String.fromCharCode(S[W]+S[W+1]*256);
return D
}
s.prototype.slice=function(c,d){
let y=this.length;
c=~~c,d=d===void 0?y:~~d,c<0?(c+=y,c<0&&(c=0)):c>y&&(c=y),d<0?(d+=y,d<0&&(d=0)):d>y&&(d=y),d<c&&(d=c);
let S=this.subarray(c,d);
return Object.setPrototypeOf(S,s.prototype),S
}
;
function K(c,d,y){
if(c%1!==0||c<0)throw new RangeError("offset is not uint");
if(c+d>y)throw new RangeError("Trying to access beyond buffer length")
}
s.prototype.readUintLE=s.prototype.readUIntLE=function(c,d,y){
c=c>>>0,d=d>>>0,y||K(c,d,this.length);
let S=this[c],D=1,W=0;
for(;
++W<d&&(D*=256);
)S+=this[c+W]*D;
return S
}
,s.prototype.readUintBE=s.prototype.readUIntBE=function(c,d,y){
c=c>>>0,d=d>>>0,y||K(c,d,this.length);
let S=this[c+--d],D=1;
for(;
d>0&&(D*=256);
)S+=this[c+--d]*D;
return S
}
,s.prototype.readUint8=s.prototype.readUInt8=function(c,d){
return c=c>>>0,d||K(c,1,this.length),this[c]
}
,s.prototype.readUint16LE=s.prototype.readUInt16LE=function(c,d){
return c=c>>>0,d||K(c,2,this.length),this[c]|this[c+1]<<8
}
,s.prototype.readUint16BE=s.prototype.readUInt16BE=function(c,d){
return c=c>>>0,d||K(c,2,this.length),this[c]<<8|this[c+1]
}
,s.prototype.readUint32LE=s.prototype.readUInt32LE=function(c,d){
return c=c>>>0,d||K(c,4,this.length),(this[c]|this[c+1]<<8|this[c+2]<<16)+this[c+3]*16777216
}
,s.prototype.readUint32BE=s.prototype.readUInt32BE=function(c,d){
return c=c>>>0,d||K(c,4,this.length),this[c]*16777216+(this[c+1]<<16|this[c+2]<<8|this[c+3])
}
,s.prototype.readBigUInt64LE=Dt(function(c){
c=c>>>0,Tt(c,"offset");
let d=this[c],y=this[c+7];
(d===void 0||y===void 0)&&ft(c,this.length-8);
let S=d+this[++c]*2**8+this[++c]*2**16+this[++c]*2**24,D=this[++c]+this[++c]*2**8+this[++c]*2**16+y*2**24;
return BigInt(S)+(BigInt(D)<<BigInt(32))
}
),s.prototype.readBigUInt64BE=Dt(function(c){
c=c>>>0,Tt(c,"offset");
let d=this[c],y=this[c+7];
(d===void 0||y===void 0)&&ft(c,this.length-8);
let S=d*2**24+this[++c]*2**16+this[++c]*2**8+this[++c],D=this[++c]*2**24+this[++c]*2**16+this[++c]*2**8+y;
return(BigInt(S)<<BigInt(32))+BigInt(D)
}
),s.prototype.readIntLE=function(c,d,y){
c=c>>>0,d=d>>>0,y||K(c,d,this.length);
let S=this[c],D=1,W=0;
for(;
++W<d&&(D*=256);
)S+=this[c+W]*D;
return D*=128,S>=D&&(S-=Math.pow(2,8*d)),S
}
,s.prototype.readIntBE=function(c,d,y){
c=c>>>0,d=d>>>0,y||K(c,d,this.length);
let S=d,D=1,W=this[c+--S];
for(;
S>0&&(D*=256);
)W+=this[c+--S]*D;
return D*=128,W>=D&&(W-=Math.pow(2,8*d)),W
}
,s.prototype.readInt8=function(c,d){
return c=c>>>0,d||K(c,1,this.length),this[c]&128?(255-this[c]+1)*-1:this[c]
}
,s.prototype.readInt16LE=function(c,d){
c=c>>>0,d||K(c,2,this.length);
let y=this[c]|this[c+1]<<8;
return y&32768?y|4294901760:y
}
,s.prototype.readInt16BE=function(c,d){
c=c>>>0,d||K(c,2,this.length);
let y=this[c+1]|this[c]<<8;
return y&32768?y|4294901760:y
}
,s.prototype.readInt32LE=function(c,d){
return c=c>>>0,d||K(c,4,this.length),this[c]|this[c+1]<<8|this[c+2]<<16|this[c+3]<<24
}
,s.prototype.readInt32BE=function(c,d){
return c=c>>>0,d||K(c,4,this.length),this[c]<<24|this[c+1]<<16|this[c+2]<<8|this[c+3]
}
,s.prototype.readBigInt64LE=Dt(function(c){
c=c>>>0,Tt(c,"offset");
let d=this[c],y=this[c+7];
(d===void 0||y===void 0)&&ft(c,this.length-8);
let S=this[c+4]+this[c+5]*2**8+this[c+6]*2**16+(y<<24);
return(BigInt(S)<<BigInt(32))+BigInt(d+this[++c]*2**8+this[++c]*2**16+this[++c]*2**24)
}
),s.prototype.readBigInt64BE=Dt(function(c){
c=c>>>0,Tt(c,"offset");
let d=this[c],y=this[c+7];
(d===void 0||y===void 0)&&ft(c,this.length-8);
let S=(d<<24)+this[++c]*2**16+this[++c]*2**8+this[++c];
return(BigInt(S)<<BigInt(32))+BigInt(this[++c]*2**24+this[++c]*2**16+this[++c]*2**8+y)
}
),s.prototype.readFloatLE=function(c,d){
return c=c>>>0,d||K(c,4,this.length),r.read(this,c,!0,23,4)
}
,s.prototype.readFloatBE=function(c,d){
return c=c>>>0,d||K(c,4,this.length),r.read(this,c,!1,23,4)
}
,s.prototype.readDoubleLE=function(c,d){
return c=c>>>0,d||K(c,8,this.length),r.read(this,c,!0,52,8)
}
,s.prototype.readDoubleBE=function(c,d){
return c=c>>>0,d||K(c,8,this.length),r.read(this,c,!1,52,8)
}
;
function rt(c,d,y,S,D,W){
if(!s.isBuffer(c))throw new TypeError('"buffer" argument must be a Buffer instance');
if(d>D||d<W)throw new RangeError('"value" argument is out of bounds');
if(y+S>c.length)throw new RangeError("Index out of range")
}
s.prototype.writeUintLE=s.prototype.writeUIntLE=function(c,d,y,S){
if(c=+c,d=d>>>0,y=y>>>0,!S){
let J=Math.pow(2,8*y)-1;
rt(this,c,d,y,J,0)
}
let D=1,W=0;
for(this[d]=c&255;
++W<y&&(D*=256);
)this[d+W]=c/D&255;
return d+y
}
,s.prototype.writeUintBE=s.prototype.writeUIntBE=function(c,d,y,S){
if(c=+c,d=d>>>0,y=y>>>0,!S){
let J=Math.pow(2,8*y)-1;
rt(this,c,d,y,J,0)
}
let D=y-1,W=1;
for(this[d+D]=c&255;
--D>=0&&(W*=256);
)this[d+D]=c/W&255;
return d+y
}
,s.prototype.writeUint8=s.prototype.writeUInt8=function(c,d,y){
return c=+c,d=d>>>0,y||rt(this,c,d,1,255,0),this[d]=c&255,d+1
}
,s.prototype.writeUint16LE=s.prototype.writeUInt16LE=function(c,d,y){
return c=+c,d=d>>>0,y||rt(this,c,d,2,65535,0),this[d]=c&255,this[d+1]=c>>>8,d+2
}
,s.prototype.writeUint16BE=s.prototype.writeUInt16BE=function(c,d,y){
return c=+c,d=d>>>0,y||rt(this,c,d,2,65535,0),this[d]=c>>>8,this[d+1]=c&255,d+2
}
,s.prototype.writeUint32LE=s.prototype.writeUInt32LE=function(c,d,y){
return c=+c,d=d>>>0,y||rt(this,c,d,4,4294967295,0),this[d+3]=c>>>24,this[d+2]=c>>>16,this[d+1]=c>>>8,this[d]=c&255,d+4
}
,s.prototype.writeUint32BE=s.prototype.writeUInt32BE=function(c,d,y){
return c=+c,d=d>>>0,y||rt(this,c,d,4,4294967295,0),this[d]=c>>>24,this[d+1]=c>>>16,this[d+2]=c>>>8,this[d+3]=c&255,d+4
}
;
function Q(c,d,y,S,D){
gt(d,S,D,c,y,7);
let W=Number(d&BigInt(4294967295));
c[y++]=W,W=W>>8,c[y++]=W,W=W>>8,c[y++]=W,W=W>>8,c[y++]=W;
let J=Number(d>>BigInt(32)&BigInt(4294967295));
return c[y++]=J,J=J>>8,c[y++]=J,J=J>>8,c[y++]=J,J=J>>8,c[y++]=J,y
}
function at(c,d,y,S,D){
gt(d,S,D,c,y,7);
let W=Number(d&BigInt(4294967295));
c[y+7]=W,W=W>>8,c[y+6]=W,W=W>>8,c[y+5]=W,W=W>>8,c[y+4]=W;
let J=Number(d>>BigInt(32)&BigInt(4294967295));
return c[y+3]=J,J=J>>8,c[y+2]=J,J=J>>8,c[y+1]=J,J=J>>8,c[y]=J,y+8
}
s.prototype.writeBigUInt64LE=Dt(function(c,d=0){
return Q(this,c,d,BigInt(0),BigInt("0xffffffffffffffff"))
}
),s.prototype.writeBigUInt64BE=Dt(function(c,d=0){
return at(this,c,d,BigInt(0),BigInt("0xffffffffffffffff"))
}
),s.prototype.writeIntLE=function(c,d,y,S){
if(c=+c,d=d>>>0,!S){
let A=Math.pow(2,8*y-1);
rt(this,c,d,y,A-1,-A)
}
let D=0,W=1,J=0;
for(this[d]=c&255;
++D<y&&(W*=256);
)c<0&&J===0&&this[d+D-1]!==0&&(J=1),this[d+D]=(c/W>>0)-J&255;
return d+y
}
,s.prototype.writeIntBE=function(c,d,y,S){
if(c=+c,d=d>>>0,!S){
let A=Math.pow(2,8*y-1);
rt(this,c,d,y,A-1,-A)
}
let D=y-1,W=1,J=0;
for(this[d+D]=c&255;
--D>=0&&(W*=256);
)c<0&&J===0&&this[d+D+1]!==0&&(J=1),this[d+D]=(c/W>>0)-J&255;
return d+y
}
,s.prototype.writeInt8=function(c,d,y){
return c=+c,d=d>>>0,y||rt(this,c,d,1,127,-128),c<0&&(c=255+c+1),this[d]=c&255,d+1
}
,s.prototype.writeInt16LE=function(c,d,y){
return c=+c,d=d>>>0,y||rt(this,c,d,2,32767,-32768),this[d]=c&255,this[d+1]=c>>>8,d+2
}
,s.prototype.writeInt16BE=function(c,d,y){
return c=+c,d=d>>>0,y||rt(this,c,d,2,32767,-32768),this[d]=c>>>8,this[d+1]=c&255,d+2
}
,s.prototype.writeInt32LE=function(c,d,y){
return c=+c,d=d>>>0,y||rt(this,c,d,4,2147483647,-2147483648),this[d]=c&255,this[d+1]=c>>>8,this[d+2]=c>>>16,this[d+3]=c>>>24,d+4
}
,s.prototype.writeInt32BE=function(c,d,y){
return c=+c,d=d>>>0,y||rt(this,c,d,4,2147483647,-2147483648),c<0&&(c=4294967295+c+1),this[d]=c>>>24,this[d+1]=c>>>16,this[d+2]=c>>>8,this[d+3]=c&255,d+4
}
,s.prototype.writeBigInt64LE=Dt(function(c,d=0){
return Q(this,c,d,-BigInt("0x8000000000000000"),BigInt("0x7fffffffffffffff"))
}
),s.prototype.writeBigInt64BE=Dt(function(c,d=0){
return at(this,c,d,-BigInt("0x8000000000000000"),BigInt("0x7fffffffffffffff"))
}
);
function nt(c,d,y,S,D,W){
if(y+S>c.length)throw new RangeError("Index out of range");
if(y<0)throw new RangeError("Index out of range")
}
function tt(c,d,y,S,D){
return d=+d,y=y>>>0,D||nt(c,d,y,4,34028234663852886e22,-34028234663852886e22),r.write(c,d,y,S,23,4),y+4
}
s.prototype.writeFloatLE=function(c,d,y){
return tt(this,c,d,!0,y)
}
,s.prototype.writeFloatBE=function(c,d,y){
return tt(this,c,d,!1,y)
}
;
function wt(c,d,y,S,D){
return d=+d,y=y>>>0,D||nt(c,d,y,8,17976931348623157e292,-17976931348623157e292),r.write(c,d,y,S,52,8),y+8
}
s.prototype.writeDoubleLE=function(c,d,y){
return wt(this,c,d,!0,y)
}
,s.prototype.writeDoubleBE=function(c,d,y){
return wt(this,c,d,!1,y)
}
,s.prototype.copy=function(c,d,y,S){
if(!s.isBuffer(c))throw new TypeError("argument should be a Buffer");
if(y||(y=0),!S&&S!==0&&(S=this.length),d>=c.length&&(d=c.length),d||(d=0),S>0&&S<y&&(S=y),S===y||c.length===0||this.length===0)return 0;
if(d<0)throw new RangeError("targetStart out of bounds");
if(y<0||y>=this.length)throw new RangeError("Index out of range");
if(S<0)throw new RangeError("sourceEnd out of bounds");
S>this.length&&(S=this.length),c.length-d<S-y&&(S=c.length-d+y);
let D=S-y;
return this===c&&typeof Uint8Array.prototype.copyWithin=="function"?this.copyWithin(d,y,S):Uint8Array.prototype.set.call(c,this.subarray(y,S),d),D
}
,s.prototype.fill=function(c,d,y,S){
if(typeof c=="string"){
if(typeof d=="string"?(S=d,d=0,y=this.length):typeof y=="string"&&(S=y,y=this.length),S!==void 0&&typeof S!="string")throw new TypeError("encoding must be a string");
if(typeof S=="string"&&!s.isEncoding(S))throw new TypeError("Unknown encoding: "+S);
if(c.length===1){
let W=c.charCodeAt(0);
(S==="utf8"&&W<128||S==="latin1")&&(c=W)
}

}
else typeof c=="number"?c=c&255:typeof c=="boolean"&&(c=Number(c));
if(d<0||this.length<d||this.length<y)throw new RangeError("Out of range index");
if(y<=d)return this;
d=d>>>0,y=y===void 0?this.length:y>>>0,c||(c=0);
let D;
if(typeof c=="number")for(D=d;
D<y;
++D)this[D]=c;
else{
let W=s.isBuffer(c)?c:s.from(c,S),J=W.length;
if(J===0)throw new TypeError('The value "'+c+'" is invalid for argument "value"');
for(D=0;
D<y-d;
++D)this[D+d]=W[D%J]
}
return this
}
;
var ht={

}
;
function Ct(c,d,y){
ht[c]=class extends y{
constructor(){
super(),Object.defineProperty(this,"message",{
value:d.apply(this,arguments),writable:!0,configurable:!0
}
),this.name=`${
this.name
}
 [${
c
}
]`,this.stack,delete this.name
}
get code(){
return c
}
set code(S){
Object.defineProperty(this,"code",{
configurable:!0,enumerable:!0,value:S,writable:!0
}
)
}
toString(){
return`${
this.name
}
 [${
c
}
]: ${
this.message
}
`
}

}

}
Ct("ERR_BUFFER_OUT_OF_BOUNDS",function(c){
return c?`${
c
}
 is outside of buffer bounds`:"Attempt to access memory outside buffer bounds"
}
,RangeError),Ct("ERR_INVALID_ARG_TYPE",function(c,d){
return`The "${
c
}
" argument must be of type number. Received type ${
typeof d
}
`
}
,TypeError),Ct("ERR_OUT_OF_RANGE",function(c,d,y){
let S=`The value of "${
c
}
" is out of range.`,D=y;
return Number.isInteger(y)&&Math.abs(y)>2**32?D=kt(String(y)):typeof y=="bigint"&&(D=String(y),(y>BigInt(2)**BigInt(32)||y<-(BigInt(2)**BigInt(32)))&&(D=kt(D)),D+="n"),S+=` It must be ${
d
}
. Received ${
D
}
`,S
}
,RangeError);
function kt(c){
let d="",y=c.length,S=c[0]==="-"?1:0;
for(;
y>=S+4;
y-=3)d=`_${
c.slice(y-3,y)
}
${
d
}
`;
return`${
c.slice(0,y)
}
${
d
}
`
}
function Nt(c,d,y){
Tt(d,"offset"),(c[d]===void 0||c[d+y]===void 0)&&ft(d,c.length-(y+1))
}
function gt(c,d,y,S,D,W){
if(c>y||c<d){
let J=typeof d=="bigint"?"n":"",A;
throw W>3?d===0||d===BigInt(0)?A=`>= 0${
J
}
 and < 2${
J
}
 ** ${
(W+1)*8
}
${
J
}
`:A=`>= -(2${
J
}
 ** ${
(W+1)*8-1
}
${
J
}
) and < 2 ** ${
(W+1)*8-1
}
${
J
}
`:A=`>= ${
d
}
${
J
}
 and <= ${
y
}
${
J
}
`,new ht.ERR_OUT_OF_RANGE("value",A,c)
}
Nt(S,D,W)
}
function Tt(c,d){
if(typeof c!="number")throw new ht.ERR_INVALID_ARG_TYPE(d,"number",c)
}
function ft(c,d,y){
throw Math.floor(c)!==c?(Tt(c,y),new ht.ERR_OUT_OF_RANGE(y||"offset","an integer",c)):d<0?new ht.ERR_BUFFER_OUT_OF_BOUNDS:new ht.ERR_OUT_OF_RANGE(y||"offset",`>= ${
y?1:0
}
 and <= ${
d
}
`,c)
}
var Pe=/[^+/0-9A-Za-z-_]/g;
function Kt(c){
if(c=c.split("=")[0],c=c.trim().replace(Pe,""),c.length<2)return"";
for(;
c.length%4!==0;
)c=c+"=";
return c
}
function mt(c,d){
d=d||1/0;
let y,S=c.length,D=null,W=[];
for(let J=0;
J<S;
++J){
if(y=c.charCodeAt(J),y>55295&&y<57344){
if(!D){
if(y>56319){
(d-=3)>-1&&W.push(239,191,189);
continue
}
else if(J+1===S){
(d-=3)>-1&&W.push(239,191,189);
continue
}
D=y;
continue
}
if(y<56320){
(d-=3)>-1&&W.push(239,191,189),D=y;
continue
}
y=(D-55296<<10|y-56320)+65536
}
else D&&(d-=3)>-1&&W.push(239,191,189);
if(D=null,y<128){
if((d-=1)<0)break;
W.push(y)
}
else if(y<2048){
if((d-=2)<0)break;
W.push(y>>6|192,y&63|128)
}
else if(y<65536){
if((d-=3)<0)break;
W.push(y>>12|224,y>>6&63|128,y&63|128)
}
else if(y<1114112){
if((d-=4)<0)break;
W.push(y>>18|240,y>>12&63|128,y>>6&63|128,y&63|128)
}
else throw new Error("Invalid code point")
}
return W
}
function Me(c){
let d=[];
for(let y=0;
y<c.length;
++y)d.push(c.charCodeAt(y)&255);
return d
}
function Ie(c,d){
let y,S,D,W=[];
for(let J=0;
J<c.length&&!((d-=2)<0);
++J)y=c.charCodeAt(J),S=y>>8,D=y%256,W.push(D),W.push(S);
return W
}
function dt(c){
return e.toByteArray(Kt(c))
}
function ne(c,d,y,S){
let D;
for(D=0;
D<S&&!(D+y>=d.length||D>=c.length);
++D)d[D+y]=c[D];
return D
}
function Ot(c,d){
return c instanceof d||c!=null&&c.constructor!=null&&c.constructor.name!=null&&c.constructor.name===d.name
}
function oe(c){
return c!==c
}
var Xt=function(){
let c="0123456789abcdef",d=new Array(256);
for(let y=0;
y<16;
++y){
let S=y*16;
for(let D=0;
D<16;
++D)d[S+D]=c[y]+c[D]
}
return d
}
();
function Dt(c){
return typeof BigInt>"u"?ue:c
}
function ue(){
throw new Error("BigInt not supported")
}

}
),Ut,Cn,U=wc(()=>{
"use strict";
Ut=Pt(Ac()),Cn=Pt(ao())
}
),io=xt((t,e)=>{
U();
var r=o=>typeof crypto<"u"&&typeof crypto.getRandomValues=="function"?()=>{
let a=crypto.getRandomValues(new Uint8Array(1))[0];
return(a>=o?a%o:a).toString(o)
}
:()=>Math.floor(Math.random()*o).toString(o),n=(o=7,a=!1)=>Array.from({
length:o
}
,r(a?16:36)).join("");
e.exports=n,e.exports.default=n
}
),Cc=xt((t,e)=>{
U(),function(r,n){
if(typeof define=="function"&&define.amd)define("webextension-polyfill",["module"],n);
else if(typeof t<"u")n(e);
else{
var o={
exports:{

}

}
;
n(o),r.browser=o.exports
}

}
(typeof globalThis<"u"?globalThis:typeof self<"u"?self:t,function(r){
"use strict";
if(typeof globalThis!="object"||typeof chrome!="object"||!chrome||!chrome.runtime||!chrome.runtime.id)throw new Error("This script should only be loaded in a browser extension.");
if(typeof globalThis.browser>"u"||Object.getPrototypeOf(globalThis.browser)!==Object.prototype){
let n="The message port closed before a response was received.",o="Returning a Promise is the preferred way to send a reply from an onMessage/onMessageExternal listener, as the sendResponse will be removed from the specs (See https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage)",a=i=>{
let s={
alarms:{
clear:{
minArgs:0,maxArgs:1
}
,clearAll:{
minArgs:0,maxArgs:0
}
,get:{
minArgs:0,maxArgs:1
}
,getAll:{
minArgs:0,maxArgs:0
}

}
,bookmarks:{
create:{
minArgs:1,maxArgs:1
}
,get:{
minArgs:1,maxArgs:1
}
,getChildren:{
minArgs:1,maxArgs:1
}
,getRecent:{
minArgs:1,maxArgs:1
}
,getSubTree:{
minArgs:1,maxArgs:1
}
,getTree:{
minArgs:0,maxArgs:0
}
,move:{
minArgs:2,maxArgs:2
}
,remove:{
minArgs:1,maxArgs:1
}
,removeTree:{
minArgs:1,maxArgs:1
}
,search:{
minArgs:1,maxArgs:1
}
,update:{
minArgs:2,maxArgs:2
}

}
,browserAction:{
disable:{
minArgs:0,maxArgs:1,fallbackToNoCallback:!0
}
,enable:{
minArgs:0,maxArgs:1,fallbackToNoCallback:!0
}
,getBadgeBackgroundColor:{
minArgs:1,maxArgs:1
}
,getBadgeText:{
minArgs:1,maxArgs:1
}
,getPopup:{
minArgs:1,maxArgs:1
}
,getTitle:{
minArgs:1,maxArgs:1
}
,openPopup:{
minArgs:0,maxArgs:0
}
,setBadgeBackgroundColor:{
minArgs:1,maxArgs:1,fallbackToNoCallback:!0
}
,setBadgeText:{
minArgs:1,maxArgs:1,fallbackToNoCallback:!0
}
,setIcon:{
minArgs:1,maxArgs:1
}
,setPopup:{
minArgs:1,maxArgs:1,fallbackToNoCallback:!0
}
,setTitle:{
minArgs:1,maxArgs:1,fallbackToNoCallback:!0
}

}
,browsingData:{
remove:{
minArgs:2,maxArgs:2
}
,removeCache:{
minArgs:1,maxArgs:1
}
,removeCookies:{
minArgs:1,maxArgs:1
}
,removeDownloads:{
minArgs:1,maxArgs:1
}
,removeFormData:{
minArgs:1,maxArgs:1
}
,removeHistory:{
minArgs:1,maxArgs:1
}
,removeLocalStorage:{
minArgs:1,maxArgs:1
}
,removePasswords:{
minArgs:1,maxArgs:1
}
,removePluginData:{
minArgs:1,maxArgs:1
}
,settings:{
minArgs:0,maxArgs:0
}

}
,commands:{
getAll:{
minArgs:0,maxArgs:0
}

}
,contextMenus:{
remove:{
minArgs:1,maxArgs:1
}
,removeAll:{
minArgs:0,maxArgs:0
}
,update:{
minArgs:2,maxArgs:2
}

}
,cookies:{
get:{
minArgs:1,maxArgs:1
}
,getAll:{
minArgs:1,maxArgs:1
}
,getAllCookieStores:{
minArgs:0,maxArgs:0
}
,remove:{
minArgs:1,maxArgs:1
}
,set:{
minArgs:1,maxArgs:1
}

}
,devtools:{
inspectedWindow:{
eval:{
minArgs:1,maxArgs:2,singleCallbackArg:!1
}

}
,panels:{
create:{
minArgs:3,maxArgs:3,singleCallbackArg:!0
}
,elements:{
createSidebarPane:{
minArgs:1,maxArgs:1
}

}

}

}
,downloads:{
cancel:{
minArgs:1,maxArgs:1
}
,download:{
minArgs:1,maxArgs:1
}
,erase:{
minArgs:1,maxArgs:1
}
,getFileIcon:{
minArgs:1,maxArgs:2
}
,open:{
minArgs:1,maxArgs:1,fallbackToNoCallback:!0
}
,pause:{
minArgs:1,maxArgs:1
}
,removeFile:{
minArgs:1,maxArgs:1
}
,resume:{
minArgs:1,maxArgs:1
}
,search:{
minArgs:1,maxArgs:1
}
,show:{
minArgs:1,maxArgs:1,fallbackToNoCallback:!0
}

}
,extension:{
isAllowedFileSchemeAccess:{
minArgs:0,maxArgs:0
}
,isAllowedIncognitoAccess:{
minArgs:0,maxArgs:0
}

}
,history:{
addUrl:{
minArgs:1,maxArgs:1
}
,deleteAll:{
minArgs:0,maxArgs:0
}
,deleteRange:{
minArgs:1,maxArgs:1
}
,deleteUrl:{
minArgs:1,maxArgs:1
}
,getVisits:{
minArgs:1,maxArgs:1
}
,search:{
minArgs:1,maxArgs:1
}

}
,i18n:{
detectLanguage:{
minArgs:1,maxArgs:1
}
,getAcceptLanguages:{
minArgs:0,maxArgs:0
}

}
,identity:{
launchWebAuthFlow:{
minArgs:1,maxArgs:1
}

}
,idle:{
queryState:{
minArgs:1,maxArgs:1
}

}
,management:{
get:{
minArgs:1,maxArgs:1
}
,getAll:{
minArgs:0,maxArgs:0
}
,getSelf:{
minArgs:0,maxArgs:0
}
,setEnabled:{
minArgs:2,maxArgs:2
}
,uninstallSelf:{
minArgs:0,maxArgs:1
}

}
,notifications:{
clear:{
minArgs:1,maxArgs:1
}
,create:{
minArgs:1,maxArgs:2
}
,getAll:{
minArgs:0,maxArgs:0
}
,getPermissionLevel:{
minArgs:0,maxArgs:0
}
,update:{
minArgs:2,maxArgs:2
}

}
,pageAction:{
getPopup:{
minArgs:1,maxArgs:1
}
,getTitle:{
minArgs:1,maxArgs:1
}
,hide:{
minArgs:1,maxArgs:1,fallbackToNoCallback:!0
}
,setIcon:{
minArgs:1,maxArgs:1
}
,setPopup:{
minArgs:1,maxArgs:1,fallbackToNoCallback:!0
}
,setTitle:{
minArgs:1,maxArgs:1,fallbackToNoCallback:!0
}
,show:{
minArgs:1,maxArgs:1,fallbackToNoCallback:!0
}

}
,permissions:{
contains:{
minArgs:1,maxArgs:1
}
,getAll:{
minArgs:0,maxArgs:0
}
,remove:{
minArgs:1,maxArgs:1
}
,request:{
minArgs:1,maxArgs:1
}

}
,runtime:{
getBackgroundPage:{
minArgs:0,maxArgs:0
}
,getPlatformInfo:{
minArgs:0,maxArgs:0
}
,openOptionsPage:{
minArgs:0,maxArgs:0
}
,requestUpdateCheck:{
minArgs:0,maxArgs:0
}
,sendMessage:{
minArgs:1,maxArgs:3
}
,sendNativeMessage:{
minArgs:2,maxArgs:2
}
,setUninstallURL:{
minArgs:1,maxArgs:1
}

}
,sessions:{
getDevices:{
minArgs:0,maxArgs:1
}
,getRecentlyClosed:{
minArgs:0,maxArgs:1
}
,restore:{
minArgs:0,maxArgs:1
}

}
,storage:{
local:{
clear:{
minArgs:0,maxArgs:0
}
,get:{
minArgs:0,maxArgs:1
}
,getBytesInUse:{
minArgs:0,maxArgs:1
}
,remove:{
minArgs:1,maxArgs:1
}
,set:{
minArgs:1,maxArgs:1
}

}
,managed:{
get:{
minArgs:0,maxArgs:1
}
,getBytesInUse:{
minArgs:0,maxArgs:1
}

}
,sync:{
clear:{
minArgs:0,maxArgs:0
}
,get:{
minArgs:0,maxArgs:1
}
,getBytesInUse:{
minArgs:0,maxArgs:1
}
,remove:{
minArgs:1,maxArgs:1
}
,set:{
minArgs:1,maxArgs:1
}

}

}
,tabs:{
captureVisibleTab:{
minArgs:0,maxArgs:2
}
,create:{
minArgs:1,maxArgs:1
}
,detectLanguage:{
minArgs:0,maxArgs:1
}
,discard:{
minArgs:0,maxArgs:1
}
,duplicate:{
minArgs:1,maxArgs:1
}
,executeScript:{
minArgs:1,maxArgs:2
}
,get:{
minArgs:1,maxArgs:1
}
,getCurrent:{
minArgs:0,maxArgs:0
}
,getZoom:{
minArgs:0,maxArgs:1
}
,getZoomSettings:{
minArgs:0,maxArgs:1
}
,goBack:{
minArgs:0,maxArgs:1
}
,goForward:{
minArgs:0,maxArgs:1
}
,highlight:{
minArgs:1,maxArgs:1
}
,insertCSS:{
minArgs:1,maxArgs:2
}
,move:{
minArgs:2,maxArgs:2
}
,query:{
minArgs:1,maxArgs:1
}
,reload:{
minArgs:0,maxArgs:2
}
,remove:{
minArgs:1,maxArgs:1
}
,removeCSS:{
minArgs:1,maxArgs:2
}
,sendMessage:{
minArgs:2,maxArgs:3
}
,setZoom:{
minArgs:1,maxArgs:2
}
,setZoomSettings:{
minArgs:1,maxArgs:2
}
,update:{
minArgs:1,maxArgs:2
}

}
,topSites:{
get:{
minArgs:0,maxArgs:0
}

}
,webNavigation:{
getAllFrames:{
minArgs:1,maxArgs:1
}
,getFrame:{
minArgs:1,maxArgs:1
}

}
,webRequest:{
handlerBehaviorChanged:{
minArgs:0,maxArgs:0
}

}
,windows:{
create:{
minArgs:0,maxArgs:1
}
,get:{
minArgs:1,maxArgs:2
}
,getAll:{
minArgs:0,maxArgs:1
}
,getCurrent:{
minArgs:0,maxArgs:1
}
,getLastFocused:{
minArgs:0,maxArgs:1
}
,remove:{
minArgs:1,maxArgs:1
}
,update:{
minArgs:2,maxArgs:2
}

}

}
;
if(Object.keys(s).length===0)throw new Error("api-metadata.json has not been included in browser-polyfill");
class l extends WeakMap{
constructor(M,C=void 0){
super(C),this.createItem=M
}
get(M){
return this.has(M)||this.set(M,this.createItem(M)),super.get(M)
}

}
let u=R=>R&&typeof R=="object"&&typeof R.then=="function",f=(R,M)=>(...C)=>{
i.runtime.lastError?R.reject(new Error(i.runtime.lastError.message)):M.singleCallbackArg||C.length<=1&&M.singleCallbackArg!==!1?R.resolve(C[0]):R.resolve(C)
}
,p=R=>R==1?"argument":"arguments",g=(R,M)=>function(C,...E){
if(E.length<M.minArgs)throw new Error(`Expected at least ${
M.minArgs
}
 ${
p(M.minArgs)
}
 for ${
R
}
(), got ${
E.length
}
`);
if(E.length>M.maxArgs)throw new Error(`Expected at most ${
M.maxArgs
}
 ${
p(M.maxArgs)
}
 for ${
R
}
(), got ${
E.length
}
`);
return new Promise((q,Y)=>{
if(M.fallbackToNoCallback)try{
C[R](...E,f({
resolve:q,reject:Y
}
,M))
}
catch(G){
console.warn(`${
R
}
 API method doesn't seem to support the callback parameter, falling back to call it without a callback: `,G),C[R](...E),M.fallbackToNoCallback=!1,M.noCallback=!0,q()
}
else M.noCallback?(C[R](...E),q()):C[R](...E,f({
resolve:q,reject:Y
}
,M))
}
)
}
,w=(R,M,C)=>new Proxy(M,{
apply(E,q,Y){
return C.call(q,R,...Y)
}

}
),b=Function.call.bind(Object.prototype.hasOwnProperty),h=(R,M={

}
,C={

}
)=>{
let E=Object.create(null),q={
has(G,j){
return j in R||j in E
}
,get(G,j,H){
if(j in E)return E[j];
if(!(j in R))return;
let T=R[j];
if(typeof T=="function")if(typeof M[j]=="function")T=w(R,R[j],M[j]);
else if(b(C,j)){
let F=g(j,C[j]);
T=w(R,R[j],F)
}
else T=T.bind(R);
else if(typeof T=="object"&&T!==null&&(b(M,j)||b(C,j)))T=h(T,M[j],C[j]);
else if(b(C,"*"))T=h(T,M[j],C["*"]);
else return Object.defineProperty(E,j,{
configurable:!0,enumerable:!0,get(){
return R[j]
}
,set(F){
R[j]=F
}

}
),T;
return E[j]=T,T
}
,set(G,j,H,T){
return j in E?E[j]=H:R[j]=H,!0
}
,defineProperty(G,j,H){
return Reflect.defineProperty(E,j,H)
}
,deleteProperty(G,j){
return Reflect.deleteProperty(E,j)
}

}
,Y=Object.create(R);
return new Proxy(Y,q)
}
,m=R=>({
addListener(M,C,...E){
M.addListener(R.get(C),...E)
}
,hasListener(M,C){
return M.hasListener(R.get(C))
}
,removeListener(M,C){
M.removeListener(R.get(C))
}

}
),v=new l(R=>typeof R!="function"?R:function(M){
let C=h(M,{

}
,{
getContent:{
minArgs:0,maxArgs:0
}

}
);
R(C)
}
),x=!1,k=new l(R=>typeof R!="function"?R:function(M,C,E){
let q=!1,Y,G=new Promise(F=>{
Y=function($){
x||(console.warn(o,new Error().stack),x=!0),q=!0,F($)
}

}
),j;
try{
j=R(M,C,Y)
}
catch(F){
j=Promise.reject(F)
}
let H=j!==!0&&u(j);
return j!==!0&&!H&&!q?!1:((F=>{
F.then($=>{
E($)
}
,$=>{
let Z;
$&&($ instanceof Error||typeof $.message=="string")?Z=$.message:Z="An unexpected error occurred",E({
__mozWebExtensionPolyfillReject__:!0,message:Z
}
)
}
).catch($=>{
console.error("Failed to send onMessage rejected reply",$)
}
)
}
)(H?j:G),!0)
}
),N=({
reject:R,resolve:M
}
,C)=>{
i.runtime.lastError?i.runtime.lastError.message===n?M():R(new Error(i.runtime.lastError.message)):C&&C.__mozWebExtensionPolyfillReject__?R(new Error(C.message)):M(C)
}
,_=(R,M,C,...E)=>{
if(E.length<M.minArgs)throw new Error(`Expected at least ${
M.minArgs
}
 ${
p(M.minArgs)
}
 for ${
R
}
(), got ${
E.length
}
`);
if(E.length>M.maxArgs)throw new Error(`Expected at most ${
M.maxArgs
}
 ${
p(M.maxArgs)
}
 for ${
R
}
(), got ${
E.length
}
`);
return new Promise((q,Y)=>{
let G=N.bind(null,{
resolve:q,reject:Y
}
);
E.push(G),C.sendMessage(...E)
}
)
}
,I={
devtools:{
network:{
onRequestFinished:m(v)
}

}
,runtime:{
onMessage:m(k),onMessageExternal:m(k),sendMessage:_.bind(null,"sendMessage",{
minArgs:1,maxArgs:3
}
)
}
,tabs:{
sendMessage:_.bind(null,"sendMessage",{
minArgs:2,maxArgs:3
}
)
}

}
,z={
clear:{
minArgs:1,maxArgs:1
}
,get:{
minArgs:1,maxArgs:1
}
,set:{
minArgs:1,maxArgs:1
}

}
;
return s.privacy={
network:{
"*":z
}
,services:{
"*":z
}
,websites:{
"*":z
}

}
,h(i,I,s)
}
;
r.exports=a(chrome)
}
else r.exports=globalThis.browser
}
)
}
),Sc=xt((t,e)=>{
U(),e.exports=function(r){
return r&&typeof r=="object"&&typeof r.copy=="function"&&typeof r.fill=="function"&&typeof r.readUInt8=="function"
}

}
),_c=xt((t,e)=>{
U(),typeof Object.create=="function"?e.exports=function(r,n){
r.super_=n,r.prototype=Object.create(n.prototype,{
constructor:{
value:r,enumerable:!1,writable:!0,configurable:!0
}

}
)
}
:e.exports=function(r,n){
r.super_=n;
var o=function(){

}
;
o.prototype=n.prototype,r.prototype=new o,r.prototype.constructor=r
}

}
),kc=xt(t=>{
U();
var e=/%[sdj%]/g;
t.format=function(T){
if(!k(T)){
for(var F=[],$=0;
$<arguments.length;
$++)F.push(o(arguments[$]));
return F.join(" ")
}
for(var $=1,Z=arguments,K=Z.length,rt=String(T).replace(e,function(nt){
if(nt==="%%")return"%";
if($>=K)return nt;
switch(nt){
case"%s":return String(Z[$++]);
case"%d":return Number(Z[$++]);
case"%j":try{
return JSON.stringify(Z[$++])
}
catch{
return"[Circular]"
}
default:return nt
}

}
),Q=Z[$];
$<K;
Q=Z[++$])m(Q)||!z(Q)?rt+=" "+Q:rt+=" "+o(Q);
return rt
}
,t.deprecate=function(T,F){
if(_(window.process))return function(){
return t.deprecate(T,F).apply(this,arguments)
}
;
if(Ut.default.noDeprecation===!0)return T;
var $=!1;
function Z(){
if(!$){
if(Ut.default.throwDeprecation)throw new Error(F);
Ut.default.traceDeprecation?console.trace(F):console.error(F),$=!0
}
return T.apply(this,arguments)
}
return Z
}
;
var r={

}
,n;
t.debuglog=function(T){
if(_(n)&&(n=Ut.default.env.NODE_DEBUG||""),T=T.toUpperCase(),!r[T])if(new RegExp("\\b"+T+"\\b","i").test(n)){
var F=Ut.default.pid;
r[T]=function(){
var $=t.format.apply(t,arguments);
console.error("%s %d: %s",T,F,$)
}

}
else r[T]=function(){

}
;
return r[T]
}
;
function o(T,F){
var $={
seen:[],stylize:i
}
;
return arguments.length>=3&&($.depth=arguments[2]),arguments.length>=4&&($.colors=arguments[3]),h(F)?$.showHidden=F:F&&t._extend($,F),_($.showHidden)&&($.showHidden=!1),_($.depth)&&($.depth=2),_($.colors)&&($.colors=!1),_($.customInspect)&&($.customInspect=!0),$.colors&&($.stylize=a),l($,T,$.depth)
}
t.inspect=o,o.colors={
bold:[1,22],italic:[3,23],underline:[4,24],inverse:[7,27],white:[37,39],grey:[90,39],black:[30,39],blue:[34,39],cyan:[36,39],green:[32,39],magenta:[35,39],red:[31,39],yellow:[33,39]
}
,o.styles={
special:"cyan",number:"yellow",boolean:"yellow",undefined:"grey",null:"bold",string:"green",date:"magenta",regexp:"red"
}
;
function a(T,F){
var $=o.styles[F];
return $?"\x1B["+o.colors[$][0]+"m"+T+"\x1B["+o.colors[$][1]+"m":T
}
function i(T,F){
return T
}
function s(T){
var F={

}
;
return T.forEach(function($,Z){
F[$]=!0
}
),F
}
function l(T,F,$){
if(T.customInspect&&F&&C(F.inspect)&&F.inspect!==t.inspect&&!(F.constructor&&F.constructor.prototype===F)){
var Z=F.inspect($,T);
return k(Z)||(Z=l(T,Z,$)),Z
}
var K=u(T,F);
if(K)return K;
var rt=Object.keys(F),Q=s(rt);
if(T.showHidden&&(rt=Object.getOwnPropertyNames(F)),M(F)&&(rt.indexOf("message")>=0||rt.indexOf("description")>=0))return f(F);
if(rt.length===0){
if(C(F)){
var at=F.name?": "+F.name:"";
return T.stylize("[Function"+at+"]","special")
}
if(I(F))return T.stylize(RegExp.prototype.toString.call(F),"regexp");
if(R(F))return T.stylize(Date.prototype.toString.call(F),"date");
if(M(F))return f(F)
}
var nt="",tt=!1,wt=["{
","
}
"];
if(b(F)&&(tt=!0,wt=["[","]"]),C(F)){
var ht=F.name?": "+F.name:"";
nt=" [Function"+ht+"]"
}
if(I(F)&&(nt=" "+RegExp.prototype.toString.call(F)),R(F)&&(nt=" "+Date.prototype.toUTCString.call(F)),M(F)&&(nt=" "+f(F)),rt.length===0&&(!tt||F.length==0))return wt[0]+nt+wt[1];
if($<0)return I(F)?T.stylize(RegExp.prototype.toString.call(F),"regexp"):T.stylize("[Object]","special");
T.seen.push(F);
var Ct;
return tt?Ct=p(T,F,$,Q,rt):Ct=rt.map(function(kt){
return g(T,F,$,Q,kt,tt)
}
),T.seen.pop(),w(Ct,nt,wt)
}
function u(T,F){
if(_(F))return T.stylize("undefined","undefined");
if(k(F)){
var $="'"+JSON.stringify(F).replace(/^"|"$/g,"").replace(/'/g,"\\'").replace(/\\"/g,'"')+"'";
return T.stylize($,"string")
}
if(x(F))return T.stylize(""+F,"number");
if(h(F))return T.stylize(""+F,"boolean");
if(m(F))return T.stylize("null","null")
}
function f(T){
return"["+Error.prototype.toString.call(T)+"]"
}
function p(T,F,$,Z,K){
for(var rt=[],Q=0,at=F.length;
Q<at;
++Q)H(F,String(Q))?rt.push(g(T,F,$,Z,String(Q),!0)):rt.push("");
return K.forEach(function(nt){
nt.match(/^\d+$/)||rt.push(g(T,F,$,Z,nt,!0))
}
),rt
}
function g(T,F,$,Z,K,rt){
var Q,at,nt;
if(nt=Object.getOwnPropertyDescriptor(F,K)||{
value:F[K]
}
,nt.get?nt.set?at=T.stylize("[Getter/Setter]","special"):at=T.stylize("[Getter]","special"):nt.set&&(at=T.stylize("[Setter]","special")),H(Z,K)||(Q="["+K+"]"),at||(T.seen.indexOf(nt.value)<0?(m($)?at=l(T,nt.value,null):at=l(T,nt.value,$-1),at.indexOf(`
`)>-1&&(rt?at=at.split(`
`).map(function(tt){
return"  "+tt
}
).join(`
`).substr(2):at=`
`+at.split(`
`).map(function(tt){
return"   "+tt
}
).join(`
`))):at=T.stylize("[Circular]","special")),_(Q)){
if(rt&&K.match(/^\d+$/))return at;
Q=JSON.stringify(""+K),Q.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)?(Q=Q.substr(1,Q.length-2),Q=T.stylize(Q,"name")):(Q=Q.replace(/'/g,"\\'").replace(/\\"/g,'"').replace(/(^"|"$)/g,"'"),Q=T.stylize(Q,"string"))
}
return Q+": "+at
}
function w(T,F,$){
var Z=0,K=T.reduce(function(rt,Q){
return Z++,Q.indexOf(`
`)>=0&&Z++,rt+Q.replace(/\u001b\[\d\d?m/g,"").length+1
}
,0);
return K>60?$[0]+(F===""?"":F+`
 `)+" "+T.join(`,
  `)+" "+$[1]:$[0]+F+" "+T.join(", ")+" "+$[1]
}
function b(T){
return Array.isArray(T)
}
t.isArray=b;
function h(T){
return typeof T=="boolean"
}
t.isBoolean=h;
function m(T){
return T===null
}
t.isNull=m;
function v(T){
return T==null
}
t.isNullOrUndefined=v;
function x(T){
return typeof T=="number"
}
t.isNumber=x;
function k(T){
return typeof T=="string"
}
t.isString=k;
function N(T){
return typeof T=="symbol"
}
t.isSymbol=N;
function _(T){
return T===void 0
}
t.isUndefined=_;
function I(T){
return z(T)&&q(T)==="[object RegExp]"
}
t.isRegExp=I;
function z(T){
return typeof T=="object"&&T!==null
}
t.isObject=z;
function R(T){
return z(T)&&q(T)==="[object Date]"
}
t.isDate=R;
function M(T){
return z(T)&&(q(T)==="[object Error]"||T instanceof Error)
}
t.isError=M;
function C(T){
return typeof T=="function"
}
t.isFunction=C;
function E(T){
return T===null||typeof T=="boolean"||typeof T=="number"||typeof T=="string"||typeof T=="symbol"||typeof T>"u"
}
t.isPrimitive=E,t.isBuffer=Sc();
function q(T){
return Object.prototype.toString.call(T)
}
function Y(T){
return T<10?"0"+T.toString(10):T.toString(10)
}
var G=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function j(){
var T=new Date,F=[Y(T.getHours()),Y(T.getMinutes()),Y(T.getSeconds())].join(":");
return[T.getDate(),G[T.getMonth()],F].join(" ")
}
t.log=function(){
console.log("%s - %s",j(),t.format.apply(t,arguments))
}
,t.inherits=_c(),t._extend=function(T,F){
if(!F||!z(F))return T;
for(var $=Object.keys(F),Z=$.length;
Z--;
)T[$[Z]]=F[$[Z]];
return T
}
;
function H(T,F){
return Object.prototype.hasOwnProperty.call(T,F)
}

}
),Nc=xt((t,e)=>{
"use strict";
U();
var r=Ut.default.platform==="win32",n=kc();
function o(h,m){
for(var v=[],x=0;
x<h.length;
x++){
var k=h[x];
!k||k==="."||(k===".."?v.length&&v[v.length-1]!==".."?v.pop():m&&v.push(".."):v.push(k))
}
return v
}
function a(h){
for(var m=h.length-1,v=0;
v<=m&&!h[v];
v++);
for(var x=m;
x>=0&&!h[x];
x--);
return v===0&&x===m?h:v>x?[]:h.slice(v,x+1)
}
var i=/^([a-zA-Z]:|[\\\/]{
2
}
[^\\\/]+[\\\/]+[^\\\/]+)?([\\\/])?([\s\S]*?)$/,s=/^([\s\S]*?)((?:\.{
1,2
}
|[^\\\/]+?|)(\.[^.\/\\]*|))(?:[\\\/]*)$/,l={

}
;
function u(h){
var m=i.exec(h),v=(m[1]||"")+(m[2]||""),x=m[3]||"",k=s.exec(x),N=k[1],_=k[2],I=k[3];
return[v,N,_,I]
}
function f(h){
var m=i.exec(h),v=m[1]||"",x=!!v&&v[1]!==":";
return{
device:v,isUnc:x,isAbsolute:x||!!m[2],tail:m[3]
}

}
function p(h){
return"\\\\"+h.replace(/^[\\\/]+/,"").replace(/[\\\/]+/g,"\\")
}
l.resolve=function(){
for(var h="",m="",v=!1,x=arguments.length-1;
x>=-1;
x--){
var k;
if(x>=0?k=arguments[x]:h?(k=Ut.default.env["="+h],(!k||k.substr(0,3).toLowerCase()!==h.toLowerCase()+"\\")&&(k=h+"\\")):k=Ut.default.cwd(),n.isString(k)){
if(!k)continue
}
else throw new TypeError("Arguments to path.resolve must be strings");
var N=f(k),_=N.device,I=N.isUnc,z=N.isAbsolute,R=N.tail;
if(!(_&&h&&_.toLowerCase()!==h.toLowerCase())&&(h||(h=_),v||(m=R+"\\"+m,v=z),h&&v))break
}
return I&&(h=p(h)),m=o(m.split(/[\\\/]+/),!v).join("\\"),h+(v?"\\":"")+m||"."
}
,l.normalize=function(h){
var m=f(h),v=m.device,x=m.isUnc,k=m.isAbsolute,N=m.tail,_=/[\\\/]$/.test(N);
return N=o(N.split(/[\\\/]+/),!k).join("\\"),!N&&!k&&(N="."),N&&_&&(N+="\\"),x&&(v=p(v)),v+(k?"\\":"")+N
}
,l.isAbsolute=function(h){
return f(h).isAbsolute
}
,l.join=function(){
for(var h=[],m=0;
m<arguments.length;
m++){
var v=arguments[m];
if(!n.isString(v))throw new TypeError("Arguments to path.join must be strings");
v&&h.push(v)
}
var x=h.join("\\");
return/^[\\\/]{
2
}
[^\\\/]/.test(h[0])||(x=x.replace(/^[\\\/]{
2,
}
/,"\\")),l.normalize(x)
}
,l.relative=function(h,m){
h=l.resolve(h),m=l.resolve(m);
for(var v=h.toLowerCase(),x=m.toLowerCase(),k=a(m.split("\\")),N=a(v.split("\\")),_=a(x.split("\\")),I=Math.min(N.length,_.length),z=I,R=0;
R<I;
R++)if(N[R]!==_[R]){
z=R;
break
}
if(z==0)return m;
for(var M=[],R=z;
R<N.length;
R++)M.push("..");
return M=M.concat(k.slice(z)),M.join("\\")
}
,l._makeLong=function(h){
if(!n.isString(h))return h;
if(!h)return"";
var m=l.resolve(h);
return/^[a-zA-Z]\:\\/.test(m)?"\\\\?\\"+m:/^\\\\[^?.]/.test(m)?"\\\\?\\UNC\\"+m.substring(2):h
}
,l.dirname=function(h){
var m=u(h),v=m[0],x=m[1];
return!v&&!x?".":(x&&(x=x.substr(0,x.length-1)),v+x)
}
,l.basename=function(h,m){
var v=u(h)[2];
return m&&v.substr(-1*m.length)===m&&(v=v.substr(0,v.length-m.length)),v
}
,l.extname=function(h){
return u(h)[3]
}
,l.format=function(h){
if(!n.isObject(h))throw new TypeError("Parameter 'pathObject' must be an object, not "+typeof h);
var m=h.root||"";
if(!n.isString(m))throw new TypeError("'pathObject.root' must be a string or undefined, not "+typeof h.root);
var v=h.dir,x=h.base||"";
return v?v[v.length-1]===l.sep?v+x:v+l.sep+x:x
}
,l.parse=function(h){
if(!n.isString(h))throw new TypeError("Parameter 'pathString' must be a string, not "+typeof h);
var m=u(h);
if(!m||m.length!==4)throw new TypeError("Invalid path '"+h+"'");
return{
root:m[0],dir:m[0]+m[1].slice(0,-1),base:m[2],ext:m[3],name:m[2].slice(0,m[2].length-m[3].length)
}

}
,l.sep="\\",l.delimiter=";
";
var g=/^(\/?|)([\s\S]*?)((?:\.{
1,2
}
|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/,w={

}
;
function b(h){
return g.exec(h).slice(1)
}
w.resolve=function(){
for(var h="",m=!1,v=arguments.length-1;
v>=-1&&!m;
v--){
var x=v>=0?arguments[v]:Ut.default.cwd();
if(n.isString(x)){
if(!x)continue
}
else throw new TypeError("Arguments to path.resolve must be strings");
h=x+"/"+h,m=x[0]==="/"
}
return h=o(h.split("/"),!m).join("/"),(m?"/":"")+h||"."
}
,w.normalize=function(h){
var m=w.isAbsolute(h),v=h&&h[h.length-1]==="/";
return h=o(h.split("/"),!m).join("/"),!h&&!m&&(h="."),h&&v&&(h+="/"),(m?"/":"")+h
}
,w.isAbsolute=function(h){
return h.charAt(0)==="/"
}
,w.join=function(){
for(var h="",m=0;
m<arguments.length;
m++){
var v=arguments[m];
if(!n.isString(v))throw new TypeError("Arguments to path.join must be strings");
v&&(h?h+="/"+v:h+=v)
}
return w.normalize(h)
}
,w.relative=function(h,m){
h=w.resolve(h).substr(1),m=w.resolve(m).substr(1);
for(var v=a(h.split("/")),x=a(m.split("/")),k=Math.min(v.length,x.length),N=k,_=0;
_<k;
_++)if(v[_]!==x[_]){
N=_;
break
}
for(var I=[],_=N;
_<v.length;
_++)I.push("..");
return I=I.concat(x.slice(N)),I.join("/")
}
,w._makeLong=function(h){
return h
}
,w.dirname=function(h){
var m=b(h),v=m[0],x=m[1];
return!v&&!x?".":(x&&(x=x.substr(0,x.length-1)),v+x)
}
,w.basename=function(h,m){
var v=b(h)[2];
return m&&v.substr(-1*m.length)===m&&(v=v.substr(0,v.length-m.length)),v
}
,w.extname=function(h){
return b(h)[3]
}
,w.format=function(h){
if(!n.isObject(h))throw new TypeError("Parameter 'pathObject' must be an object, not "+typeof h);
var m=h.root||"";
if(!n.isString(m))throw new TypeError("'pathObject.root' must be a string or undefined, not "+typeof h.root);
var v=h.dir?h.dir+w.sep:"",x=h.base||"";
return v+x
}
,w.parse=function(h){
if(!n.isString(h))throw new TypeError("Parameter 'pathString' must be a string, not "+typeof h);
var m=b(h);
if(!m||m.length!==4)throw new TypeError("Invalid path '"+h+"'");
return m[1]=m[1]||"",m[2]=m[2]||"",m[3]=m[3]||"",{
root:m[0],dir:m[0]+m[1].slice(0,-1),base:m[2],ext:m[3],name:m[2].slice(0,m[2].length-m[3].length)
}

}
,w.sep="/",w.delimiter=":",r?e.exports=l:e.exports=w,e.exports.posix=w,e.exports.win32=l
}
),Tc=xt((t,e)=>{
U();
var r="(".charCodeAt(0),n=")".charCodeAt(0),o="'".charCodeAt(0),a='"'.charCodeAt(0),i="\\".charCodeAt(0),s="/".charCodeAt(0),l=",".charCodeAt(0),u=":".charCodeAt(0),f="*".charCodeAt(0),p="u".charCodeAt(0),g="U".charCodeAt(0),w="+".charCodeAt(0),b=/^[a-f0-9?-]+$/i;
e.exports=function(h){
for(var m=[],v=h,x,k,N,_,I,z,R,M,C=0,E=v.charCodeAt(C),q=v.length,Y=[{
nodes:m
}
],G=0,j,H="",T="",F="";
C<q;
)if(E<=32){
x=C;
do x+=1,E=v.charCodeAt(x);
while(E<=32);
_=v.slice(C,x),N=m[m.length-1],E===n&&G?F=_:N&&N.type==="div"?(N.after=_,N.sourceEndIndex+=_.length):E===l||E===u||E===s&&v.charCodeAt(x+1)!==f&&(!j||j&&j.type==="function"&&j.value!=="calc")?T=_:m.push({
type:"space",sourceIndex:C,sourceEndIndex:x,value:_
}
),C=x
}
else if(E===o||E===a){
x=C,k=E===o?"'":'"',_={
type:"string",sourceIndex:C,quote:k
}
;
do if(I=!1,x=v.indexOf(k,x+1),~x)for(z=x;
v.charCodeAt(z-1)===i;
)z-=1,I=!I;
else v+=k,x=v.length-1,_.unclosed=!0;
while(I);
_.value=v.slice(C+1,x),_.sourceEndIndex=_.unclosed?x:x+1,m.push(_),C=x+1,E=v.charCodeAt(C)
}
else if(E===s&&v.charCodeAt(C+1)===f)x=v.indexOf("*/",C),_={
type:"comment",sourceIndex:C,sourceEndIndex:x+2
}
,x===-1&&(_.unclosed=!0,x=v.length,_.sourceEndIndex=x),_.value=v.slice(C+2,x),m.push(_),C=x+2,E=v.charCodeAt(C);
else if((E===s||E===f)&&j&&j.type==="function"&&j.value==="calc")_=v[C],m.push({
type:"word",sourceIndex:C-T.length,sourceEndIndex:C+_.length,value:_
}
),C+=1,E=v.charCodeAt(C);
else if(E===s||E===l||E===u)_=v[C],m.push({
type:"div",sourceIndex:C-T.length,sourceEndIndex:C+_.length,value:_,before:T,after:""
}
),T="",C+=1,E=v.charCodeAt(C);
else if(r===E){
x=C;
do x+=1,E=v.charCodeAt(x);
while(E<=32);
if(M=C,_={
type:"function",sourceIndex:C-H.length,value:H,before:v.slice(M+1,x)
}
,C=x,H==="url"&&E!==o&&E!==a){
x-=1;
do if(I=!1,x=v.indexOf(")",x+1),~x)for(z=x;
v.charCodeAt(z-1)===i;
)z-=1,I=!I;
else v+=")",x=v.length-1,_.unclosed=!0;
while(I);
R=x;
do R-=1,E=v.charCodeAt(R);
while(E<=32);
M<R?(C!==R+1?_.nodes=[{
type:"word",sourceIndex:C,sourceEndIndex:R+1,value:v.slice(C,R+1)
}
]:_.nodes=[],_.unclosed&&R+1!==x?(_.after="",_.nodes.push({
type:"space",sourceIndex:R+1,sourceEndIndex:x,value:v.slice(R+1,x)
}
)):(_.after=v.slice(R+1,x),_.sourceEndIndex=x)):(_.after="",_.nodes=[]),C=x+1,_.sourceEndIndex=_.unclosed?x:C,E=v.charCodeAt(C),m.push(_)
}
else G+=1,_.after="",_.sourceEndIndex=C+1,m.push(_),Y.push(_),m=_.nodes=[],j=_;
H=""
}
else if(n===E&&G)C+=1,E=v.charCodeAt(C),j.after=F,j.sourceEndIndex+=F.length,F="",G-=1,Y[Y.length-1].sourceEndIndex=C,Y.pop(),j=Y[G],m=j.nodes;
else{
x=C;
do E===i&&(x+=1),x+=1,E=v.charCodeAt(x);
while(x<q&&!(E<=32||E===o||E===a||E===l||E===u||E===s||E===r||E===f&&j&&j.type==="function"&&j.value==="calc"||E===s&&j.type==="function"&&j.value==="calc"||E===n&&G));
_=v.slice(C,x),r===E?H=_:(p===_.charCodeAt(0)||g===_.charCodeAt(0))&&w===_.charCodeAt(1)&&b.test(_.slice(2))?m.push({
type:"unicode-range",sourceIndex:C,sourceEndIndex:x,value:_
}
):m.push({
type:"word",sourceIndex:C,sourceEndIndex:x,value:_
}
),C=x
}
for(C=Y.length-1;
C;
C-=1)Y[C].unclosed=!0,Y[C].sourceEndIndex=v.length;
return Y[0].nodes
}

}
),Pc=xt((t,e)=>{
U(),e.exports=function r(n,o,a){
var i,s,l,u;
for(i=0,s=n.length;
i<s;
i+=1)l=n[i],a||(u=o(l,i,n)),u!==!1&&l.type==="function"&&Array.isArray(l.nodes)&&r(l.nodes,o,a),a&&o(l,i,n)
}

}
),Ic=xt((t,e)=>{
U();
function r(o,a){
var i=o.type,s=o.value,l,u;
return a&&(u=a(o))!==void 0?u:i==="word"||i==="space"?s:i==="string"?(l=o.quote||"",l+s+(o.unclosed?"":l)):i==="comment"?"/*"+s+(o.unclosed?"":"*/"):i==="div"?(o.before||"")+s+(o.after||""):Array.isArray(o.nodes)?(l=n(o.nodes,a),i!=="function"?l:s+"("+(o.before||"")+l+(o.after||"")+(o.unclosed?"":")")):s
}
function n(o,a){
var i,s;
if(Array.isArray(o)){
for(i="",s=o.length-1;
~s;
s-=1)i=r(o[s],a)+i;
return i
}
return r(o,a)
}
e.exports=n
}
),Bc=xt((t,e)=>{
U();
var r="-".charCodeAt(0),n="+".charCodeAt(0),o=".".charCodeAt(0),a="e".charCodeAt(0),i="E".charCodeAt(0);
function s(l){
var u=l.charCodeAt(0),f;
if(u===n||u===r){
if(f=l.charCodeAt(1),f>=48&&f<=57)return!0;
var p=l.charCodeAt(2);
return f===o&&p>=48&&p<=57
}
return u===o?(f=l.charCodeAt(1),f>=48&&f<=57):u>=48&&u<=57
}
e.exports=function(l){
var u=0,f=l.length,p,g,w;
if(f===0||!s(l))return!1;
for(p=l.charCodeAt(u),(p===n||p===r)&&u++;
u<f&&(p=l.charCodeAt(u),!(p<48||p>57));
)u+=1;
if(p=l.charCodeAt(u),g=l.charCodeAt(u+1),p===o&&g>=48&&g<=57)for(u+=2;
u<f&&(p=l.charCodeAt(u),!(p<48||p>57));
)u+=1;
if(p=l.charCodeAt(u),g=l.charCodeAt(u+1),w=l.charCodeAt(u+2),(p===a||p===i)&&(g>=48&&g<=57||(g===n||g===r)&&w>=48&&w<=57))for(u+=g===n||g===r?3:2;
u<f&&(p=l.charCodeAt(u),!(p<48||p>57));
)u+=1;
return{
number:l.slice(0,u),unit:l.slice(u)
}

}

}
),Te=xt((t,e)=>{
U();
var r=Tc(),n=Pc(),o=Ic();
function a(i){
return this instanceof a?(this.nodes=r(i),this):new a(i)
}
a.prototype.toString=function(){
return Array.isArray(this.nodes)?o(this.nodes):""
}
,a.prototype.walk=function(i,s){
return n(this.nodes,i,s),this
}
,a.unit=Bc(),a.walk=n,a.stringify=o,e.exports=a
}
),Rc=xt((t,e)=>{
"use strict";
U();
var r={
a:7,c:6,h:1,l:2,m:2,r:4,q:4,s:4,t:2,v:1,z:0
}
,n=[5760,6158,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8239,8287,12288,65279];
function o(h){
return h===10||h===13||h===8232||h===8233||h===32||h===9||h===11||h===12||h===160||h>=5760&&n.indexOf(h)>=0
}
function a(h){
switch(h|32){
case 109:case 122:case 108:case 104:case 118:case 99:case 115:case 113:case 116:case 97:case 114:return!0
}
return!1
}
function i(h){
return(h|32)===97
}
function s(h){
return h>=48&&h<=57
}
function l(h){
return h>=48&&h<=57||h===43||h===45||h===46
}
function u(h){
this.index=0,this.path=h,this.max=h.length,this.result=[],this.param=0,this.err="",this.segmentStart=0,this.data=[]
}
function f(h){
for(;
h.index<h.max&&o(h.path.charCodeAt(h.index));
)h.index++
}
function p(h){
var m=h.path.charCodeAt(h.index);
if(m===48){
h.param=0,h.index++;
return
}
if(m===49){
h.param=1,h.index++;
return
}
h.err="SvgPath: arc flag can be 0 or 1 only (at pos "+h.index+")"
}
function g(h){
var m=h.index,v=m,x=h.max,k=!1,N=!1,_=!1,I=!1,z;
if(v>=x){
h.err="SvgPath: missed param (at pos "+v+")";
return
}
if(z=h.path.charCodeAt(v),(z===43||z===45)&&(v++,z=v<x?h.path.charCodeAt(v):0),!s(z)&&z!==46){
h.err="SvgPath: param should start with 0..9 or `.` (at pos "+v+")";
return
}
if(z!==46){
if(k=z===48,v++,z=v<x?h.path.charCodeAt(v):0,k&&v<x&&z&&s(z)){
h.err="SvgPath: numbers started with `0` such as `09` are illegal (at pos "+m+")";
return
}
for(;
v<x&&s(h.path.charCodeAt(v));
)v++,N=!0;
z=v<x?h.path.charCodeAt(v):0
}
if(z===46){
for(I=!0,v++;
s(h.path.charCodeAt(v));
)v++,_=!0;
z=v<x?h.path.charCodeAt(v):0
}
if(z===101||z===69){
if(I&&!N&&!_){
h.err="SvgPath: invalid float exponent (at pos "+v+")";
return
}
if(v++,z=v<x?h.path.charCodeAt(v):0,(z===43||z===45)&&v++,v<x&&s(h.path.charCodeAt(v)))for(;
v<x&&s(h.path.charCodeAt(v));
)v++;
else{
h.err="SvgPath: invalid float exponent (at pos "+v+")";
return
}

}
h.index=v,h.param=parseFloat(h.path.slice(m,v))+0
}
function w(h){
var m,v;
m=h.path[h.segmentStart],v=m.toLowerCase();
var x=h.data;
if(v==="m"&&x.length>2&&(h.result.push([m,x[0],x[1]]),x=x.slice(2),v="l",m=m==="m"?"l":"L"),v==="r")h.result.push([m].concat(x));
else for(;
x.length>=r[v]&&(h.result.push([m].concat(x.splice(0,r[v]))),!!r[v]);
);

}
function b(h){
var m=h.max,v,x,k,N,_;
if(h.segmentStart=h.index,v=h.path.charCodeAt(h.index),x=i(v),!a(v)){
h.err="SvgPath: bad command "+h.path[h.index]+" (at pos "+h.index+")";
return
}
if(N=r[h.path[h.index].toLowerCase()],h.index++,f(h),h.data=[],!N){
w(h);
return
}
for(k=!1;
;
){
for(_=N;
_>0;
_--){
if(x&&(_===3||_===4)?p(h):g(h),h.err.length){
w(h);
return
}
h.data.push(h.param),f(h),k=!1,h.index<m&&h.path.charCodeAt(h.index)===44&&(h.index++,f(h),k=!0)
}
if(!k&&(h.index>=h.max||!l(h.path.charCodeAt(h.index))))break
}
w(h)
}
e.exports=function(h){
var m=new u(h),v=m.max;
for(f(m);
m.index<v&&!m.err.length;
)b(m);
return m.result.length&&("mM".indexOf(m.result[0][0])<0?(m.err="SvgPath: string should start with `M` or `m`",m.result=[]):m.result[0][0]="M"),{
err:m.err,segments:m.result
}

}

}
),Ci=xt((t,e)=>{
"use strict";
U();
function r(o,a){
return[o[0]*a[0]+o[2]*a[1],o[1]*a[0]+o[3]*a[1],o[0]*a[2]+o[2]*a[3],o[1]*a[2]+o[3]*a[3],o[0]*a[4]+o[2]*a[5]+o[4],o[1]*a[4]+o[3]*a[5]+o[5]]
}
function n(){
if(!(this instanceof n))return new n;
this.queue=[],this.cache=null
}
n.prototype.matrix=function(o){
return o[0]===1&&o[1]===0&&o[2]===0&&o[3]===1&&o[4]===0&&o[5]===0?this:(this.cache=null,this.queue.push(o),this)
}
,n.prototype.translate=function(o,a){
return(o!==0||a!==0)&&(this.cache=null,this.queue.push([1,0,0,1,o,a])),this
}
,n.prototype.scale=function(o,a){
return(o!==1||a!==1)&&(this.cache=null,this.queue.push([o,0,0,a,0,0])),this
}
,n.prototype.rotate=function(o,a,i){
var s,l,u;
return o!==0&&(this.translate(a,i),s=o*Math.PI/180,l=Math.cos(s),u=Math.sin(s),this.queue.push([l,u,-u,l,0,0]),this.cache=null,this.translate(-a,-i)),this
}
,n.prototype.skewX=function(o){
return o!==0&&(this.cache=null,this.queue.push([1,0,Math.tan(o*Math.PI/180),1,0,0])),this
}
,n.prototype.skewY=function(o){
return o!==0&&(this.cache=null,this.queue.push([1,Math.tan(o*Math.PI/180),0,1,0,0])),this
}
,n.prototype.toArray=function(){
if(this.cache)return this.cache;
if(!this.queue.length)return this.cache=[1,0,0,1,0,0],this.cache;
if(this.cache=this.queue[0],this.queue.length===1)return this.cache;
for(var o=1;
o<this.queue.length;
o++)this.cache=r(this.cache,this.queue[o]);
return this.cache
}
,n.prototype.calc=function(o,a,i){
var s;
return this.queue.length?(this.cache||(this.cache=this.toArray()),s=this.cache,[o*s[0]+a*s[2]+(i?0:s[4]),o*s[1]+a*s[3]+(i?0:s[5])]):[o,a]
}
,e.exports=n
}
),Oc=xt((t,e)=>{
"use strict";
U();
var r=Ci(),n={
matrix:!0,scale:!0,rotate:!0,translate:!0,skewX:!0,skewY:!0
}
,o=/\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*(.+?)\s*\)[\s,]*/,a=/[\s,]+/;
e.exports=function(i){
var s=new r,l,u;
return i.split(o).forEach(function(f){
if(f.length){
if(typeof n[f]<"u"){
l=f;
return
}
switch(u=f.split(a).map(function(p){
return+p||0
}
),l){
case"matrix":u.length===6&&s.matrix(u);
return;
case"scale":u.length===1?s.scale(u[0],u[0]):u.length===2&&s.scale(u[0],u[1]);
return;
case"rotate":u.length===1?s.rotate(u[0],0,0):u.length===3&&s.rotate(u[0],u[1],u[2]);
return;
case"translate":u.length===1?s.translate(u[0],0):u.length===2&&s.translate(u[0],u[1]);
return;
case"skewX":u.length===1&&s.skewX(u[0]);
return;
case"skewY":u.length===1&&s.skewY(u[0]);
return
}

}

}
),s
}

}
),Dc=xt((t,e)=>{
"use strict";
U();
var r=Math.PI*2;
function n(i,s,l,u){
var f=i*u-s*l<0?-1:1,p=i*l+s*u;
return p>1&&(p=1),p<-1&&(p=-1),f*Math.acos(p)
}
function o(i,s,l,u,f,p,g,w,b,h){
var m=h*(i-l)/2+b*(s-u)/2,v=-b*(i-l)/2+h*(s-u)/2,x=g*g,k=w*w,N=m*m,_=v*v,I=x*k-x*_-k*N;
I<0&&(I=0),I/=x*_+k*N,I=Math.sqrt(I)*(f===p?-1:1);
var z=I*g/w*v,R=I*-w/g*m,M=h*z-b*R+(i+l)/2,C=b*z+h*R+(s+u)/2,E=(m-z)/g,q=(v-R)/w,Y=(-m-z)/g,G=(-v-R)/w,j=n(1,0,E,q),H=n(E,q,Y,G);
return p===0&&H>0&&(H-=r),p===1&&H<0&&(H+=r),[M,C,j,H]
}
function a(i,s){
var l=1.3333333333333333*Math.tan(s/4),u=Math.cos(i),f=Math.sin(i),p=Math.cos(i+s),g=Math.sin(i+s);
return[u,f,u-f*l,f+u*l,p+g*l,g-p*l,p,g]
}
e.exports=function(i,s,l,u,f,p,g,w,b){
var h=Math.sin(b*r/360),m=Math.cos(b*r/360),v=m*(i-l)/2+h*(s-u)/2,x=-h*(i-l)/2+m*(s-u)/2;
if(v===0&&x===0)return[];
if(g===0||w===0)return[];
g=Math.abs(g),w=Math.abs(w);
var k=v*v/(g*g)+x*x/(w*w);
k>1&&(g*=Math.sqrt(k),w*=Math.sqrt(k));
var N=o(i,s,l,u,f,p,g,w,h,m),_=[],I=N[2],z=N[3],R=Math.max(Math.ceil(Math.abs(z)/(r/4)),1);
z/=R;
for(var M=0;
M<R;
M++)_.push(a(I,z)),I+=z;
return _.map(function(C){
for(var E=0;
E<C.length;
E+=2){
var q=C[E+0],Y=C[E+1];
q*=g,Y*=w;
var G=m*q-h*Y,j=h*q+m*Y;
C[E+0]=G+N[0],C[E+1]=j+N[1]
}
return C
}
)
}

}
),Fc=xt((t,e)=>{
"use strict";
U();
var r=1e-10,n=Math.PI/180;
function o(a,i,s){
if(!(this instanceof o))return new o(a,i,s);
this.rx=a,this.ry=i,this.ax=s
}
o.prototype.transform=function(a){
var i=Math.cos(this.ax*n),s=Math.sin(this.ax*n),l=[this.rx*(a[0]*i+a[2]*s),this.rx*(a[1]*i+a[3]*s),this.ry*(-a[0]*s+a[2]*i),this.ry*(-a[1]*s+a[3]*i)],u=l[0]*l[0]+l[2]*l[2],f=l[1]*l[1]+l[3]*l[3],p=((l[0]-l[3])*(l[0]-l[3])+(l[2]+l[1])*(l[2]+l[1]))*((l[0]+l[3])*(l[0]+l[3])+(l[2]-l[1])*(l[2]-l[1])),g=(u+f)/2;
if(p<r*g)return this.rx=this.ry=Math.sqrt(g),this.ax=0,this;
var w=l[0]*l[1]+l[2]*l[3];
p=Math.sqrt(p);
var b=g+p/2,h=g-p/2;
return this.ax=Math.abs(w)<r&&Math.abs(b-f)<r?90:Math.atan(Math.abs(w)>Math.abs(b-f)?(b-u)/w:w/(b-f))*180/Math.PI,this.ax>=0?(this.rx=Math.sqrt(b),this.ry=Math.sqrt(h)):(this.ax+=90,this.rx=Math.sqrt(h),this.ry=Math.sqrt(b)),this
}
,o.prototype.isDegenerate=function(){
return this.rx<r*this.ry||this.ry<r*this.rx
}
,e.exports=o
}
),jc=xt((t,e)=>{
"use strict";
U();
var r=Rc(),n=Oc(),o=Ci(),a=Dc(),i=Fc();
function s(l){
if(!(this instanceof s))return new s(l);
var u=r(l);
this.segments=u.segments,this.err=u.err,this.__stack=[]
}
s.from=function(l){
if(typeof l=="string")return new s(l);
if(l instanceof s){
var u=new s("");
return u.err=l.err,u.segments=l.segments.map(function(f){
return f.slice()
}
),u.__stack=l.__stack.map(function(f){
return o().matrix(f.toArray())
}
),u
}
throw new Error("SvgPath.from: invalid param type "+l)
}
,s.prototype.__matrix=function(l){
var u=this,f;
!l.queue.length||this.iterate(function(p,g,w,b){
var h,m,v,x;
switch(p[0]){
case"v":h=l.calc(0,p[1],!0),m=h[0]===0?["v",h[1]]:["l",h[0],h[1]];
break;
case"V":h=l.calc(w,p[1],!1),m=h[0]===l.calc(w,b,!1)[0]?["V",h[1]]:["L",h[0],h[1]];
break;
case"h":h=l.calc(p[1],0,!0),m=h[1]===0?["h",h[0]]:["l",h[0],h[1]];
break;
case"H":h=l.calc(p[1],b,!1),m=h[1]===l.calc(w,b,!1)[1]?["H",h[0]]:["L",h[0],h[1]];
break;
case"a":case"A":var k=l.toArray(),N=i(p[1],p[2],p[3]).transform(k);
if(k[0]*k[3]-k[1]*k[2]<0&&(p[5]=p[5]?"0":"1"),h=l.calc(p[6],p[7],p[0]==="a"),p[0]==="A"&&p[6]===w&&p[7]===b||p[0]==="a"&&p[6]===0&&p[7]===0){
m=[p[0]==="a"?"l":"L",h[0],h[1]];
break
}
N.isDegenerate()?m=[p[0]==="a"?"l":"L",h[0],h[1]]:m=[p[0],N.rx,N.ry,N.ax,p[4],p[5],h[0],h[1]];
break;
case"m":x=g>0,h=l.calc(p[1],p[2],x),m=["m",h[0],h[1]];
break;
default:for(v=p[0],m=[v],x=v.toLowerCase()===v,f=1;
f<p.length;
f+=2)h=l.calc(p[f],p[f+1],x),m.push(h[0],h[1])
}
u.segments[g]=m
}
,!0)
}
,s.prototype.__evaluateStack=function(){
var l,u;
if(this.__stack.length){
if(this.__stack.length===1){
this.__matrix(this.__stack[0]),this.__stack=[];
return
}
for(l=o(),u=this.__stack.length;
--u>=0;
)l.matrix(this.__stack[u].toArray());
this.__matrix(l),this.__stack=[]
}

}
,s.prototype.toString=function(){
var l="",u="",f=!1;
this.__evaluateStack();
for(var p=0,g=this.segments.length;
p<g;
p++){
var w=this.segments[p],b=w[0];
b!==u||b==="m"||b==="M"?(b==="m"&&u==="z"&&(l+=" "),l+=b,f=!1):f=!0;
for(var h=1;
h<w.length;
h++){
var m=w[h];
h===1?f&&m>=0&&(l+=" "):m>=0&&(l+=" "),l+=m
}
u=b
}
return l
}
,s.prototype.translate=function(l,u){
return this.__stack.push(o().translate(l,u||0)),this
}
,s.prototype.scale=function(l,u){
return this.__stack.push(o().scale(l,!u&&u!==0?l:u)),this
}
,s.prototype.rotate=function(l,u,f){
return this.__stack.push(o().rotate(l,u||0,f||0)),this
}
,s.prototype.skewX=function(l){
return this.__stack.push(o().skewX(l)),this
}
,s.prototype.skewY=function(l){
return this.__stack.push(o().skewY(l)),this
}
,s.prototype.matrix=function(l){
return this.__stack.push(o().matrix(l)),this
}
,s.prototype.transform=function(l){
return l.trim()?(this.__stack.push(n(l)),this):this
}
,s.prototype.round=function(l){
var u=0,f=0,p=0,g=0,w;
return l=l||0,this.__evaluateStack(),this.segments.forEach(function(b){
var h=b[0].toLowerCase()===b[0];
switch(b[0]){
case"H":case"h":h&&(b[1]+=p),p=b[1]-b[1].toFixed(l),b[1]=+b[1].toFixed(l);
return;
case"V":case"v":h&&(b[1]+=g),g=b[1]-b[1].toFixed(l),b[1]=+b[1].toFixed(l);
return;
case"Z":case"z":p=u,g=f;
return;
case"M":case"m":h&&(b[1]+=p,b[2]+=g),p=b[1]-b[1].toFixed(l),g=b[2]-b[2].toFixed(l),u=p,f=g,b[1]=+b[1].toFixed(l),b[2]=+b[2].toFixed(l);
return;
case"A":case"a":h&&(b[6]+=p,b[7]+=g),p=b[6]-b[6].toFixed(l),g=b[7]-b[7].toFixed(l),b[1]=+b[1].toFixed(l),b[2]=+b[2].toFixed(l),b[3]=+b[3].toFixed(l+2),b[6]=+b[6].toFixed(l),b[7]=+b[7].toFixed(l);
return;
default:w=b.length,h&&(b[w-2]+=p,b[w-1]+=g),p=b[w-2]-b[w-2].toFixed(l),g=b[w-1]-b[w-1].toFixed(l),b.forEach(function(m,v){
!v||(b[v]=+b[v].toFixed(l))
}
);
return
}

}
),this
}
,s.prototype.iterate=function(l,u){
var f=this.segments,p={

}
,g=!1,w=0,b=0,h=0,m=0,v,x,k;
if(u||this.__evaluateStack(),f.forEach(function(N,_){
var I=l(N,_,w,b);
Array.isArray(I)&&(p[_]=I,g=!0);
var z=N[0]===N[0].toLowerCase();
switch(N[0]){
case"m":case"M":w=N[1]+(z?w:0),b=N[2]+(z?b:0),h=w,m=b;
return;
case"h":case"H":w=N[1]+(z?w:0);
return;
case"v":case"V":b=N[1]+(z?b:0);
return;
case"z":case"Z":w=h,b=m;
return;
default:w=N[N.length-2]+(z?w:0),b=N[N.length-1]+(z?b:0)
}

}
),!g)return this;
for(k=[],v=0;
v<f.length;
v++)if(typeof p[v]<"u")for(x=0;
x<p[v].length;
x++)k.push(p[v][x]);
else k.push(f[v]);
return this.segments=k,this
}
,s.prototype.abs=function(){
return this.iterate(function(l,u,f,p){
var g=l[0],w=g.toUpperCase(),b;
if(g!==w)switch(l[0]=w,g){
case"v":l[1]+=p;
return;
case"a":l[6]+=f,l[7]+=p;
return;
default:for(b=1;
b<l.length;
b++)l[b]+=b%2?f:p
}

}
,!0),this
}
,s.prototype.rel=function(){
return this.iterate(function(l,u,f,p){
var g=l[0],w=g.toLowerCase(),b;
if(g!==w&&!(u===0&&g==="M"))switch(l[0]=w,g){
case"V":l[1]-=p;
return;
case"A":l[6]-=f,l[7]-=p;
return;
default:for(b=1;
b<l.length;
b++)l[b]-=b%2?f:p
}

}
,!0),this
}
,s.prototype.unarc=function(){
return this.iterate(function(l,u,f,p){
var g,w,b,h=[],m=l[0];
return m!=="A"&&m!=="a"?null:(m==="a"?(w=f+l[6],b=p+l[7]):(w=l[6],b=l[7]),g=a(f,p,w,b,l[4],l[5],l[1],l[2],l[3]),g.length===0?[[l[0]==="a"?"l":"L",l[6],l[7]]]:(g.forEach(function(v){
h.push(["C",v[2],v[3],v[4],v[5],v[6],v[7]])
}
),h))
}
),this
}
,s.prototype.unshort=function(){
var l=this.segments,u,f,p,g,w;
return this.iterate(function(b,h,m,v){
var x=b[0],k=x.toUpperCase(),N;
!h||(k==="T"?(N=x==="t",p=l[h-1],p[0]==="Q"?(u=p[1]-m,f=p[2]-v):p[0]==="q"?(u=p[1]-p[3],f=p[2]-p[4]):(u=0,f=0),g=-u,w=-f,N||(g+=m,w+=v),l[h]=[N?"q":"Q",g,w,b[1],b[2]]):k==="S"&&(N=x==="s",p=l[h-1],p[0]==="C"?(u=p[3]-m,f=p[4]-v):p[0]==="c"?(u=p[3]-p[5],f=p[4]-p[6]):(u=0,f=0),g=-u,w=-f,N||(g+=m,w+=v),l[h]=[N?"c":"C",g,w,b[1],b[2],b[3],b[4]]))
}
),this
}
,e.exports=s
}
),$c=xt((t,e)=>{
"use strict";
U(),e.exports=jc()
}
),Lc=xt((t,e)=>{
U(),function(r,n){
"use strict";
typeof define=="function"&&define.amd?define(n):typeof t=="object"?e.exports=n():r.SAT=n()
}
(t,function(){
"use strict";
var r={

}
;
function n(M,C){
this.x=M||0,this.y=C||0
}
r.Vector=n,r.V=n,n.prototype.copy=n.prototype.copy=function(M){
return this.x=M.x,this.y=M.y,this
}
,n.prototype.clone=n.prototype.clone=function(){
return new n(this.x,this.y)
}
,n.prototype.perp=n.prototype.perp=function(){
var M=this.x;
return this.x=this.y,this.y=-M,this
}
,n.prototype.rotate=n.prototype.rotate=function(M){
var C=this.x,E=this.y;
return this.x=C*Math.cos(M)-E*Math.sin(M),this.y=C*Math.sin(M)+E*Math.cos(M),this
}
,n.prototype.reverse=n.prototype.reverse=function(){
return this.x=-this.x,this.y=-this.y,this
}
,n.prototype.normalize=n.prototype.normalize=function(){
var M=this.len();
return M>0&&(this.x=this.x/M,this.y=this.y/M),this
}
,n.prototype.add=n.prototype.add=function(M){
return this.x+=M.x,this.y+=M.y,this
}
,n.prototype.sub=n.prototype.sub=function(M){
return this.x-=M.x,this.y-=M.y,this
}
,n.prototype.scale=n.prototype.scale=function(M,C){
return this.x*=M,this.y*=typeof C<"u"?C:M,this
}
,n.prototype.project=n.prototype.project=function(M){
var C=this.dot(M)/M.len2();
return this.x=C*M.x,this.y=C*M.y,this
}
,n.prototype.projectN=n.prototype.projectN=function(M){
var C=this.dot(M);
return this.x=C*M.x,this.y=C*M.y,this
}
,n.prototype.reflect=n.prototype.reflect=function(M){
var C=this.x,E=this.y;
return this.project(M).scale(2),this.x-=C,this.y-=E,this
}
,n.prototype.reflectN=n.prototype.reflectN=function(M){
var C=this.x,E=this.y;
return this.projectN(M).scale(2),this.x-=C,this.y-=E,this
}
,n.prototype.dot=n.prototype.dot=function(M){
return this.x*M.x+this.y*M.y
}
,n.prototype.len2=n.prototype.len2=function(){
return this.dot(this)
}
,n.prototype.len=n.prototype.len=function(){
return Math.sqrt(this.len2())
}
;
function o(M,C){
this.pos=M||new n,this.r=C||0,this.offset=new n
}
r.Circle=o,o.prototype.getAABBAsBox=o.prototype.getAABBAsBox=function(){
var M=this.r,C=this.pos.clone().add(this.offset).sub(new n(M,M));
return new i(C,M*2,M*2)
}
,o.prototype.getAABB=o.prototype.getAABB=function(){
return this.getAABBAsBox().toPolygon()
}
,o.prototype.setOffset=o.prototype.setOffset=function(M){
return this.offset=M,this
}
;
function a(M,C){
this.pos=M||new n,this.angle=0,this.offset=new n,this.setPoints(C||[])
}
r.Polygon=a,a.prototype.setPoints=a.prototype.setPoints=function(M){
var C=!this.points||this.points.length!==M.length;
if(C){
var E,q=this.calcPoints=[],Y=this.edges=[],G=this.normals=[];
for(E=0;
E<M.length;
E++){
var j=M[E],H=E<M.length-1?M[E+1]:M[0];
if(j!==H&&j.x===H.x&&j.y===H.y){
M.splice(E,1),E-=1;
continue
}
q.push(new n),Y.push(new n),G.push(new n)
}

}
return this.points=M,this._recalc(),this
}
,a.prototype.setAngle=a.prototype.setAngle=function(M){
return this.angle=M,this._recalc(),this
}
,a.prototype.setOffset=a.prototype.setOffset=function(M){
return this.offset=M,this._recalc(),this
}
,a.prototype.rotate=a.prototype.rotate=function(M){
for(var C=this.points,E=C.length,q=0;
q<E;
q++)C[q].rotate(M);
return this._recalc(),this
}
,a.prototype.translate=a.prototype.translate=function(M,C){
for(var E=this.points,q=E.length,Y=0;
Y<q;
Y++)E[Y].x+=M,E[Y].y+=C;
return this._recalc(),this
}
,a.prototype._recalc=function(){
var M=this.calcPoints,C=this.edges,E=this.normals,q=this.points,Y=this.offset,G=this.angle,j=q.length,H;
for(H=0;
H<j;
H++){
var T=M[H].copy(q[H]);
T.x+=Y.x,T.y+=Y.y,G!==0&&T.rotate(G)
}
for(H=0;
H<j;
H++){
var F=M[H],$=H<j-1?M[H+1]:M[0],Z=C[H].copy($).sub(F);
E[H].copy(Z).perp().normalize()
}
return this
}
,a.prototype.getAABBAsBox=a.prototype.getAABBAsBox=function(){
for(var M=this.calcPoints,C=M.length,E=M[0].x,q=M[0].y,Y=M[0].x,G=M[0].y,j=1;
j<C;
j++){
var H=M[j];
H.x<E?E=H.x:H.x>Y&&(Y=H.x),H.y<q?q=H.y:H.y>G&&(G=H.y)
}
return new i(this.pos.clone().add(new n(E,q)),Y-E,G-q)
}
,a.prototype.getAABB=a.prototype.getAABB=function(){
return this.getAABBAsBox().toPolygon()
}
,a.prototype.getCentroid=a.prototype.getCentroid=function(){
for(var M=this.calcPoints,C=M.length,E=0,q=0,Y=0,G=0;
G<C;
G++){
var j=M[G],H=G===C-1?M[0]:M[G+1],T=j.x*H.y-H.x*j.y;
E+=(j.x+H.x)*T,q+=(j.y+H.y)*T,Y+=T
}
return Y=Y*3,E=E/Y,q=q/Y,new n(E,q)
}
;
function i(M,C,E){
this.pos=M||new n,this.w=C||0,this.h=E||0
}
r.Box=i,i.prototype.toPolygon=i.prototype.toPolygon=function(){
var M=this.pos,C=this.w,E=this.h;
return new a(new n(M.x,M.y),[new n,new n(C,0),new n(C,E),new n(0,E)])
}
;
function s(){
this.a=null,this.b=null,this.overlapN=new n,this.overlapV=new n,this.clear()
}
r.Response=s,s.prototype.clear=s.prototype.clear=function(){
return this.aInB=!0,this.bInA=!0,this.overlap=Number.MAX_VALUE,this
}
;
for(var l=[],u=0;
u<10;
u++)l.push(new n);
for(var f=[],u=0;
u<5;
u++)f.push([]);
var p=new s,g=new i(new n,1e-6,1e-6).toPolygon();
function w(M,C,E){
for(var q=Number.MAX_VALUE,Y=-Number.MAX_VALUE,G=M.length,j=0;
j<G;
j++){
var H=M[j].dot(C);
H<q&&(q=H),H>Y&&(Y=H)
}
E[0]=q,E[1]=Y
}
function b(M,C,E,q,Y,G){
var j=f.pop(),H=f.pop(),T=l.pop().copy(C).sub(M),F=T.dot(Y);
if(w(E,Y,j),w(q,Y,H),H[0]+=F,H[1]+=F,j[0]>H[1]||H[0]>j[1])return l.push(T),f.push(j),f.push(H),!0;
if(G){
var $=0;
if(j[0]<H[0])if(G.aInB=!1,j[1]<H[1])$=j[1]-H[0],G.bInA=!1;
else{
var Z=j[1]-H[0],K=H[1]-j[0];
$=Z<K?Z:-K
}
else if(G.bInA=!1,j[1]>H[1])$=j[0]-H[1],G.aInB=!1;
else{
var Z=j[1]-H[0],K=H[1]-j[0];
$=Z<K?Z:-K
}
var rt=Math.abs($);
rt<G.overlap&&(G.overlap=rt,G.overlapN.copy(Y),$<0&&G.overlapN.reverse())
}
return l.push(T),f.push(j),f.push(H),!1
}
r.isSeparatingAxis=b;
function h(M,C){
var E=M.len2(),q=C.dot(M);
return q<0?m:q>E?x:v
}
var m=-1,v=0,x=1;
function k(M,C){
var E=l.pop().copy(M).sub(C.pos).sub(C.offset),q=C.r*C.r,Y=E.len2();
return l.push(E),Y<=q
}
r.pointInCircle=k;
function N(M,C){
g.pos.copy(M),p.clear();
var E=R(g,C,p);
return E&&(E=p.aInB),E
}
r.pointInPolygon=N;
function _(M,C,E){
var q=l.pop().copy(C.pos).add(C.offset).sub(M.pos).sub(M.offset),Y=M.r+C.r,G=Y*Y,j=q.len2();
if(j>G)return l.push(q),!1;
if(E){
var H=Math.sqrt(j);
E.a=M,E.b=C,E.overlap=Y-H,E.overlapN.copy(q.normalize()),E.overlapV.copy(q).scale(E.overlap),E.aInB=M.r<=C.r&&H<=C.r-M.r,E.bInA=C.r<=M.r&&H<=M.r-C.r
}
return l.push(q),!0
}
r.testCircleCircle=_;
function I(M,C,E){
for(var q=l.pop().copy(C.pos).add(C.offset).sub(M.pos),Y=C.r,G=Y*Y,j=M.calcPoints,H=j.length,T=l.pop(),F=l.pop(),$=0;
$<H;
$++){
var Z=$===H-1?0:$+1,K=$===0?H-1:$-1,rt=0,Q=null;
T.copy(M.edges[$]),F.copy(q).sub(j[$]),E&&F.len2()>G&&(E.aInB=!1);
var at=h(T,F);
if(at===m){
T.copy(M.edges[K]);
var nt=l.pop().copy(q).sub(j[K]);
if(at=h(T,nt),at===x){
var tt=F.len();
if(tt>Y)return l.push(q),l.push(T),l.push(F),l.push(nt),!1;
E&&(E.bInA=!1,Q=F.normalize(),rt=Y-tt)
}
l.push(nt)
}
else if(at===x){
if(T.copy(M.edges[Z]),F.copy(q).sub(j[Z]),at=h(T,F),at===m){
var tt=F.len();
if(tt>Y)return l.push(q),l.push(T),l.push(F),!1;
E&&(E.bInA=!1,Q=F.normalize(),rt=Y-tt)
}

}
else{
var wt=T.perp().normalize(),tt=F.dot(wt),ht=Math.abs(tt);
if(tt>0&&ht>Y)return l.push(q),l.push(wt),l.push(F),!1;
E&&(Q=wt,rt=Y-tt,(tt>=0||rt<2*Y)&&(E.bInA=!1))
}
Q&&E&&Math.abs(rt)<Math.abs(E.overlap)&&(E.overlap=rt,E.overlapN.copy(Q))
}
return E&&(E.a=M,E.b=C,E.overlapV.copy(E.overlapN).scale(E.overlap)),l.push(q),l.push(T),l.push(F),!0
}
r.testPolygonCircle=I;
function z(M,C,E){
var q=I(C,M,E);
if(q&&E){
var Y=E.a,G=E.aInB;
E.overlapN.reverse(),E.overlapV.reverse(),E.a=E.b,E.b=Y,E.aInB=E.bInA,E.bInA=G
}
return q
}
r.testCirclePolygon=z;
function R(M,C,E){
for(var q=M.calcPoints,Y=q.length,G=C.calcPoints,j=G.length,H=0;
H<Y;
H++)if(b(M.pos,C.pos,q,G,M.normals[H],E))return!1;
for(var H=0;
H<j;
H++)if(b(M.pos,C.pos,q,G,C.normals[H],E))return!1;
return E&&(E.a=M,E.b=C,E.overlapV.copy(E.overlapN).scale(E.overlap)),!0
}
return r.testPolygonPolygon=R,r
}
)
}
);
U();
U();
U();
(function(){
"use strict";
var t=window.Document.prototype.createElement,e=window.Document.prototype.createElementNS,r=window.Document.prototype.importNode,n=window.Document.prototype.prepend,o=window.Document.prototype.append,a=window.DocumentFragment.prototype.prepend,i=window.DocumentFragment.prototype.append,s=window.Node.prototype.cloneNode,l=window.Node.prototype.appendChild,u=window.Node.prototype.insertBefore,f=window.Node.prototype.removeChild,p=window.Node.prototype.replaceChild,g=Object.getOwnPropertyDescriptor(window.Node.prototype,"textContent"),w=window.Element.prototype.attachShadow,b=Object.getOwnPropertyDescriptor(window.Element.prototype,"innerHTML"),h=window.Element.prototype.getAttribute,m=window.Element.prototype.setAttribute,v=window.Element.prototype.removeAttribute,x=window.Element.prototype.toggleAttribute,k=window.Element.prototype.getAttributeNS,N=window.Element.prototype.setAttributeNS,_=window.Element.prototype.removeAttributeNS,I=window.Element.prototype.insertAdjacentElement,z=window.Element.prototype.insertAdjacentHTML,R=window.Element.prototype.prepend,M=window.Element.prototype.append,C=window.Element.prototype.before,E=window.Element.prototype.after,q=window.Element.prototype.replaceWith,Y=window.Element.prototype.remove,G=window.HTMLElement,j=Object.getOwnPropertyDescriptor(window.HTMLElement.prototype,"innerHTML"),H=window.HTMLElement.prototype.insertAdjacentElement,T=window.HTMLElement.prototype.insertAdjacentHTML,F=new Set;
"annotation-xml color-profile font-face font-face-src font-face-uri font-face-format font-face-name missing-glyph".split(" ").forEach(function(A){
return F.add(A)
}
);
function $(A){
var P=F.has(A);
return A=/^[a-z][.0-9_a-z]*-[-.0-9_a-z]*$/.test(A),!P&&A
}
var Z=document.contains?document.contains.bind(document):document.documentElement.contains.bind(document.documentElement);
function K(A){
var P=A.isConnected;
if(P!==void 0)return P;
if(Z(A))return!0;
for(;
A&&!(A.__CE_isImportDocument||A instanceof Document);
)A=A.parentNode||(window.ShadowRoot&&A instanceof ShadowRoot?A.host:void 0);
return!(!A||!(A.__CE_isImportDocument||A instanceof Document))
}
function rt(A){
var P=A.children;
if(P)return Array.prototype.slice.call(P);
for(P=[],A=A.firstChild;
A;
A=A.nextSibling)A.nodeType===Node.ELEMENT_NODE&&P.push(A);
return P
}
function Q(A,P){
for(;
P&&P!==A&&!P.nextSibling;
)P=P.parentNode;
return P&&P!==A?P.nextSibling:null
}
function at(A,P,B){
for(var L=A;
L;
){
if(L.nodeType===Node.ELEMENT_NODE){
var O=L;
P(O);
var V=O.localName;
if(V==="link"&&O.getAttribute("rel")==="import"){
if(L=O.import,B===void 0&&(B=new Set),L instanceof Node&&!B.has(L))for(B.add(L),L=L.firstChild;
L;
L=L.nextSibling)at(L,P,B);
L=Q(A,O);
continue
}
else if(V==="template"){
L=Q(A,O);
continue
}
if(O=O.__CE_shadowRoot)for(O=O.firstChild;
O;
O=O.nextSibling)at(O,P,B)
}
L=L.firstChild?L.firstChild:Q(A,L)
}

}
function nt(){
var A=!(W==null||!W.noDocumentConstructionObserver),P=!(W==null||!W.shadyDomFastWalk);
this.m=[],this.g=[],this.j=!1,this.shadyDomFastWalk=P,this.I=!A
}
function tt(A,P,B,L){
var O=window.ShadyDOM;
if(A.shadyDomFastWalk&&O&&O.inUse){
if(P.nodeType===Node.ELEMENT_NODE&&B(P),P.querySelectorAll)for(A=O.nativeMethods.querySelectorAll.call(P,"*"),P=0;
P<A.length;
P++)B(A[P])
}
else at(P,B,L)
}
function wt(A,P){
A.j=!0,A.m.push(P)
}
function ht(A,P){
A.j=!0,A.g.push(P)
}
function Ct(A,P){
A.j&&tt(A,P,function(B){
return kt(A,B)
}
)
}
function kt(A,P){
if(A.j&&!P.__CE_patched){
P.__CE_patched=!0;
for(var B=0;
B<A.m.length;
B++)A.m[B](P);
for(B=0;
B<A.g.length;
B++)A.g[B](P)
}

}
function Nt(A,P){
var B=[];
for(tt(A,P,function(O){
return B.push(O)
}
),P=0;
P<B.length;
P++){
var L=B[P];
L.__CE_state===1?A.connectedCallback(L):ft(A,L)
}

}
function gt(A,P){
var B=[];
for(tt(A,P,function(O){
return B.push(O)
}
),P=0;
P<B.length;
P++){
var L=B[P];
L.__CE_state===1&&A.disconnectedCallback(L)
}

}
function Tt(A,P,B){
B=B===void 0?{

}
:B;
var L=B.J,O=B.upgrade||function(X){
return ft(A,X)
}
,V=[];
for(tt(A,P,function(X){
if(A.j&&kt(A,X),X.localName==="link"&&X.getAttribute("rel")==="import"){
var et=X.import;
et instanceof Node&&(et.__CE_isImportDocument=!0,et.__CE_registry=document.__CE_registry),et&&et.readyState==="complete"?et.__CE_documentLoadHandled=!0:X.addEventListener("load",function(){
var ot=X.import;
if(!ot.__CE_documentLoadHandled){
ot.__CE_documentLoadHandled=!0;
var lt=new Set;
L&&(L.forEach(function(yt){
return lt.add(yt)
}
),lt.delete(ot)),Tt(A,ot,{
J:lt,upgrade:O
}
)
}

}
)
}
else V.push(X)
}
,L),P=0;
P<V.length;
P++)O(V[P])
}
function ft(A,P){
try{
var B=P.ownerDocument,L=B.__CE_registry,O=L&&(B.defaultView||B.__CE_isImportDocument)?Xt(L,P.localName):void 0;
if(O&&P.__CE_state===void 0){
O.constructionStack.push(P);
try{
try{
if(new O.constructorFunction!==P)throw Error("The custom element constructor did not produce the element being upgraded.")
}
finally{
O.constructionStack.pop()
}

}
catch(ot){
throw P.__CE_state=2,ot
}
if(P.__CE_state=1,P.__CE_definition=O,O.attributeChangedCallback&&P.hasAttributes()){
var V=O.observedAttributes;
for(O=0;
O<V.length;
O++){
var X=V[O],et=P.getAttribute(X);
et!==null&&A.attributeChangedCallback(P,X,null,et,null)
}

}
K(P)&&A.connectedCallback(P)
}

}
catch(ot){
Kt(ot)
}

}
nt.prototype.connectedCallback=function(A){
var P=A.__CE_definition;
if(P.connectedCallback)try{
P.connectedCallback.call(A)
}
catch(B){
Kt(B)
}

}
,nt.prototype.disconnectedCallback=function(A){
var P=A.__CE_definition;
if(P.disconnectedCallback)try{
P.disconnectedCallback.call(A)
}
catch(B){
Kt(B)
}

}
,nt.prototype.attributeChangedCallback=function(A,P,B,L,O){
var V=A.__CE_definition;
if(V.attributeChangedCallback&&-1<V.observedAttributes.indexOf(P))try{
V.attributeChangedCallback.call(A,P,B,L,O)
}
catch(X){
Kt(X)
}

}
;
function Pe(A,P,B,L){
var O=P.__CE_registry;
if(O&&(L===null||L==="http://www.w3.org/1999/xhtml")&&(O=Xt(O,B)))try{
var V=new O.constructorFunction;
if(V.__CE_state===void 0||V.__CE_definition===void 0)throw Error("Failed to construct '"+B+"': The returned value was not constructed with the HTMLElement constructor.");
if(V.namespaceURI!=="http://www.w3.org/1999/xhtml")throw Error("Failed to construct '"+B+"': The constructed element's namespace must be the HTML namespace.");
if(V.hasAttributes())throw Error("Failed to construct '"+B+"': The constructed element must not have any attributes.");
if(V.firstChild!==null)throw Error("Failed to construct '"+B+"': The constructed element must not have any children.");
if(V.parentNode!==null)throw Error("Failed to construct '"+B+"': The constructed element must not have a parent node.");
if(V.ownerDocument!==P)throw Error("Failed to construct '"+B+"': The constructed element's owner document is incorrect.");
if(V.localName!==B)throw Error("Failed to construct '"+B+"': The constructed element's local name is incorrect.");
return V
}
catch(X){
return Kt(X),P=L===null?t.call(P,B):e.call(P,L,B),Object.setPrototypeOf(P,HTMLUnknownElement.prototype),P.__CE_state=2,P.__CE_definition=void 0,kt(A,P),P
}
return P=L===null?t.call(P,B):e.call(P,L,B),kt(A,P),P
}
function Kt(A){
var P="",B="",L=0,O=0;
A instanceof Error?(P=A.message,B=A.sourceURL||A.fileName||"",L=A.line||A.lineNumber||0,O=A.column||A.columnNumber||0):P="Uncaught "+String(A);
var V=void 0;
ErrorEvent.prototype.initErrorEvent===void 0?V=new ErrorEvent("error",{
cancelable:!0,message:P,filename:B,lineno:L,colno:O,error:A
}
):(V=document.createEvent("ErrorEvent"),V.initErrorEvent("error",!1,!0,P,B,L),V.preventDefault=function(){
Object.defineProperty(this,"defaultPrevented",{
configurable:!0,get:function(){
return!0
}

}
)
}
),V.error===void 0&&Object.defineProperty(V,"error",{
configurable:!0,enumerable:!0,get:function(){
return A
}

}
),window.dispatchEvent(V),V.defaultPrevented||console.error(A)
}
function mt(){
var A=this;
this.g=void 0,this.F=new Promise(function(P){
A.l=P
}
)
}
mt.prototype.resolve=function(A){
if(this.g)throw Error("Already resolved.");
this.g=A,this.l(A)
}
;
function Me(A){
var P=document;
this.l=void 0,this.h=A,this.g=P,Tt(this.h,this.g),this.g.readyState==="loading"&&(this.l=new MutationObserver(this.G.bind(this)),this.l.observe(this.g,{
childList:!0,subtree:!0
}
))
}
function Ie(A){
A.l&&A.l.disconnect()
}
Me.prototype.G=function(A){
var P=this.g.readyState;
for(P!=="interactive"&&P!=="complete"||Ie(this),P=0;
P<A.length;
P++)for(var B=A[P].addedNodes,L=0;
L<B.length;
L++)Tt(this.h,B[L])
}
;
function dt(A){
this.s=new Map,this.u=new Map,this.C=new Map,this.A=!1,this.B=new Map,this.o=function(P){
return P()
}
,this.i=!1,this.v=[],this.h=A,this.D=A.I?new Me(A):void 0
}
dt.prototype.H=function(A,P){
var B=this;
if(!(P instanceof Function))throw new TypeError("Custom element constructor getters must be functions.");
ne(this,A),this.s.set(A,P),this.v.push(A),this.i||(this.i=!0,this.o(function(){
return oe(B)
}
))
}
,dt.prototype.define=function(A,P){
var B=this;
if(!(P instanceof Function))throw new TypeError("Custom element constructors must be functions.");
ne(this,A),Ot(this,A,P),this.v.push(A),this.i||(this.i=!0,this.o(function(){
return oe(B)
}
))
}
;
function ne(A,P){
if(!$(P))throw new SyntaxError("The element name '"+P+"' is not valid.");
if(Xt(A,P))throw Error("A custom element with name '"+(P+"' has already been defined."));
if(A.A)throw Error("A custom element is already being defined.")
}
function Ot(A,P,B){
A.A=!0;
var L;
try{
var O=B.prototype;
if(!(O instanceof Object))throw new TypeError("The custom element constructor's prototype is not an object.");
var V=function(yt){
var Be=O[yt];
if(Be!==void 0&&!(Be instanceof Function))throw Error("The '"+yt+"' callback must be a function.");
return Be
}
,X=V("connectedCallback"),et=V("disconnectedCallback"),ot=V("adoptedCallback"),lt=(L=V("attributeChangedCallback"))&&B.observedAttributes||[]
}
catch(yt){
throw yt
}
finally{
A.A=!1
}
return B={
localName:P,constructorFunction:B,connectedCallback:X,disconnectedCallback:et,adoptedCallback:ot,attributeChangedCallback:L,observedAttributes:lt,constructionStack:[]
}
,A.u.set(P,B),A.C.set(B.constructorFunction,B),B
}
dt.prototype.upgrade=function(A){
Tt(this.h,A)
}
;
function oe(A){
if(A.i!==!1){
A.i=!1;
for(var P=[],B=A.v,L=new Map,O=0;
O<B.length;
O++)L.set(B[O],[]);
for(Tt(A.h,document,{
upgrade:function(ot){
if(ot.__CE_state===void 0){
var lt=ot.localName,yt=L.get(lt);
yt?yt.push(ot):A.u.has(lt)&&P.push(ot)
}

}

}
),O=0;
O<P.length;
O++)ft(A.h,P[O]);
for(O=0;
O<B.length;
O++){
for(var V=B[O],X=L.get(V),et=0;
et<X.length;
et++)ft(A.h,X[et]);
(V=A.B.get(V))&&V.resolve(void 0)
}
B.length=0
}

}
dt.prototype.get=function(A){
if(A=Xt(this,A))return A.constructorFunction
}
,dt.prototype.whenDefined=function(A){
if(!$(A))return Promise.reject(new SyntaxError("'"+A+"' is not a valid custom element name."));
var P=this.B.get(A);
if(P)return P.F;
P=new mt,this.B.set(A,P);
var B=this.u.has(A)||this.s.has(A);
return A=this.v.indexOf(A)===-1,B&&A&&P.resolve(void 0),P.F
}
,dt.prototype.polyfillWrapFlushCallback=function(A){
this.D&&Ie(this.D);
var P=this.o;
this.o=function(B){
return A(function(){
return P(B)
}
)
}

}
;
function Xt(A,P){
var B=A.u.get(P);
if(B)return B;
if(B=A.s.get(P)){
A.s.delete(P);
try{
return Ot(A,P,B())
}
catch(L){
Kt(L)
}

}

}
dt.prototype.define=dt.prototype.define,dt.prototype.upgrade=dt.prototype.upgrade,dt.prototype.get=dt.prototype.get,dt.prototype.whenDefined=dt.prototype.whenDefined,dt.prototype.polyfillDefineLazy=dt.prototype.H,dt.prototype.polyfillWrapFlushCallback=dt.prototype.polyfillWrapFlushCallback;
function Dt(A,P,B){
function L(O){
return function(V){
for(var X=[],et=0;
et<arguments.length;
++et)X[et]=arguments[et];
et=[];
for(var ot=[],lt=0;
lt<X.length;
lt++){
var yt=X[lt];
if(yt instanceof Element&&K(yt)&&ot.push(yt),yt instanceof DocumentFragment)for(yt=yt.firstChild;
yt;
yt=yt.nextSibling)et.push(yt);
else et.push(yt)
}
for(O.apply(this,X),X=0;
X<ot.length;
X++)gt(A,ot[X]);
if(K(this))for(X=0;
X<et.length;
X++)ot=et[X],ot instanceof Element&&Nt(A,ot)
}

}
B.prepend!==void 0&&(P.prepend=L(B.prepend)),B.append!==void 0&&(P.append=L(B.append))
}
function ue(A){
Document.prototype.createElement=function(P){
return Pe(A,this,P,null)
}
,Document.prototype.importNode=function(P,B){
return P=r.call(this,P,!!B),this.__CE_registry?Tt(A,P):Ct(A,P),P
}
,Document.prototype.createElementNS=function(P,B){
return Pe(A,this,B,P)
}
,Dt(A,Document.prototype,{
prepend:n,append:o
}
)
}
function c(A){
function P(L){
return function(O){
for(var V=[],X=0;
X<arguments.length;
++X)V[X]=arguments[X];
X=[];
for(var et=[],ot=0;
ot<V.length;
ot++){
var lt=V[ot];
if(lt instanceof Element&&K(lt)&&et.push(lt),lt instanceof DocumentFragment)for(lt=lt.firstChild;
lt;
lt=lt.nextSibling)X.push(lt);
else X.push(lt)
}
for(L.apply(this,V),V=0;
V<et.length;
V++)gt(A,et[V]);
if(K(this))for(V=0;
V<X.length;
V++)et=X[V],et instanceof Element&&Nt(A,et)
}

}
var B=Element.prototype;
C!==void 0&&(B.before=P(C)),E!==void 0&&(B.after=P(E)),q!==void 0&&(B.replaceWith=function(L){
for(var O=[],V=0;
V<arguments.length;
++V)O[V]=arguments[V];
V=[];
for(var X=[],et=0;
et<O.length;
et++){
var ot=O[et];
if(ot instanceof Element&&K(ot)&&X.push(ot),ot instanceof DocumentFragment)for(ot=ot.firstChild;
ot;
ot=ot.nextSibling)V.push(ot);
else V.push(ot)
}
for(et=K(this),q.apply(this,O),O=0;
O<X.length;
O++)gt(A,X[O]);
if(et)for(gt(A,this),O=0;
O<V.length;
O++)X=V[O],X instanceof Element&&Nt(A,X)
}
),Y!==void 0&&(B.remove=function(){
var L=K(this);
Y.call(this),L&&gt(A,this)
}
)
}
function d(A){
function P(O,V){
Object.defineProperty(O,"innerHTML",{
enumerable:V.enumerable,configurable:!0,get:V.get,set:function(X){
var et=this,ot=void 0;
if(K(this)&&(ot=[],tt(A,this,function(Be){
Be!==et&&ot.push(Be)
}
)),V.set.call(this,X),ot)for(var lt=0;
lt<ot.length;
lt++){
var yt=ot[lt];
yt.__CE_state===1&&A.disconnectedCallback(yt)
}
return this.ownerDocument.__CE_registry?Tt(A,this):Ct(A,this),X
}

}
)
}
function B(O,V){
O.insertAdjacentElement=function(X,et){
var ot=K(et);
return X=V.call(this,X,et),ot&&gt(A,et),K(X)&&Nt(A,et),X
}

}
function L(O,V){
function X(et,ot){
for(var lt=[];
et!==ot;
et=et.nextSibling)lt.push(et);
for(ot=0;
ot<lt.length;
ot++)Tt(A,lt[ot])
}
O.insertAdjacentHTML=function(et,ot){
if(et=et.toLowerCase(),et==="beforebegin"){
var lt=this.previousSibling;
V.call(this,et,ot),X(lt||this.parentNode.firstChild,this)
}
else if(et==="afterbegin")lt=this.firstChild,V.call(this,et,ot),X(this.firstChild,lt);
else if(et==="beforeend")lt=this.lastChild,V.call(this,et,ot),X(lt||this.firstChild,null);
else if(et==="afterend")lt=this.nextSibling,V.call(this,et,ot),X(this.nextSibling,lt);
else throw new SyntaxError("The value provided ("+String(et)+") is not one of 'beforebegin', 'afterbegin', 'beforeend', or 'afterend'.")
}

}
w&&(Element.prototype.attachShadow=function(O){
if(O=w.call(this,O),A.j&&!O.__CE_patched){
O.__CE_patched=!0;
for(var V=0;
V<A.m.length;
V++)A.m[V](O)
}
return this.__CE_shadowRoot=O
}
),b&&b.get?P(Element.prototype,b):j&&j.get?P(HTMLElement.prototype,j):ht(A,function(O){
P(O,{
enumerable:!0,configurable:!0,get:function(){
return s.call(this,!0).innerHTML
}
,set:function(V){
var X=this.localName==="template",et=X?this.content:this,ot=e.call(document,this.namespaceURI,this.localName);
for(ot.innerHTML=V;
0<et.childNodes.length;
)f.call(et,et.childNodes[0]);
for(V=X?ot.content:ot;
0<V.childNodes.length;
)l.call(et,V.childNodes[0])
}

}
)
}
),Element.prototype.setAttribute=function(O,V){
if(this.__CE_state!==1)return m.call(this,O,V);
var X=h.call(this,O);
m.call(this,O,V),V=h.call(this,O),A.attributeChangedCallback(this,O,X,V,null)
}
,Element.prototype.setAttributeNS=function(O,V,X){
if(this.__CE_state!==1)return N.call(this,O,V,X);
var et=k.call(this,O,V);
N.call(this,O,V,X),X=k.call(this,O,V),A.attributeChangedCallback(this,V,et,X,O)
}
,Element.prototype.removeAttribute=function(O){
if(this.__CE_state!==1)return v.call(this,O);
var V=h.call(this,O);
v.call(this,O),V!==null&&A.attributeChangedCallback(this,O,V,null,null)
}
,x&&(Element.prototype.toggleAttribute=function(O,V){
if(this.__CE_state!==1)return x.call(this,O,V);
var X=h.call(this,O),et=X!==null;
return V=x.call(this,O,V),et!==V&&A.attributeChangedCallback(this,O,X,V?"":null,null),V
}
),Element.prototype.removeAttributeNS=function(O,V){
if(this.__CE_state!==1)return _.call(this,O,V);
var X=k.call(this,O,V);
_.call(this,O,V);
var et=k.call(this,O,V);
X!==et&&A.attributeChangedCallback(this,V,X,et,O)
}
,H?B(HTMLElement.prototype,H):I&&B(Element.prototype,I),T?L(HTMLElement.prototype,T):z&&L(Element.prototype,z),Dt(A,Element.prototype,{
prepend:R,append:M
}
),c(A)
}
var y={

}
;
function S(A){
function P(){
var B=this.constructor,L=document.__CE_registry.C.get(B);
if(!L)throw Error("Failed to construct a custom element: The constructor was not registered with `customElements`.");
var O=L.constructionStack;
if(O.length===0)return O=t.call(document,L.localName),Object.setPrototypeOf(O,B.prototype),O.__CE_state=1,O.__CE_definition=L,kt(A,O),O;
var V=O.length-1,X=O[V];
if(X===y)throw Error("Failed to construct '"+L.localName+"': This element was already constructed.");
return O[V]=y,Object.setPrototypeOf(X,B.prototype),kt(A,X),X
}
P.prototype=G.prototype,Object.defineProperty(HTMLElement.prototype,"constructor",{
writable:!0,configurable:!0,enumerable:!1,value:P
}
),window.HTMLElement=P
}
function D(A){
function P(B,L){
Object.defineProperty(B,"textContent",{
enumerable:L.enumerable,configurable:!0,get:L.get,set:function(O){
if(this.nodeType===Node.TEXT_NODE)L.set.call(this,O);
else{
var V=void 0;
if(this.firstChild){
var X=this.childNodes,et=X.length;
if(0<et&&K(this)){
V=Array(et);
for(var ot=0;
ot<et;
ot++)V[ot]=X[ot]
}

}
if(L.set.call(this,O),V)for(O=0;
O<V.length;
O++)gt(A,V[O])
}

}

}
)
}
Node.prototype.insertBefore=function(B,L){
if(B instanceof DocumentFragment){
var O=rt(B);
if(B=u.call(this,B,L),K(this))for(L=0;
L<O.length;
L++)Nt(A,O[L]);
return B
}
return O=B instanceof Element&&K(B),L=u.call(this,B,L),O&&gt(A,B),K(this)&&Nt(A,B),L
}
,Node.prototype.appendChild=function(B){
if(B instanceof DocumentFragment){
var L=rt(B);
if(B=l.call(this,B),K(this))for(var O=0;
O<L.length;
O++)Nt(A,L[O]);
return B
}
return L=B instanceof Element&&K(B),O=l.call(this,B),L&&gt(A,B),K(this)&&Nt(A,B),O
}
,Node.prototype.cloneNode=function(B){
return B=s.call(this,!!B),this.ownerDocument.__CE_registry?Tt(A,B):Ct(A,B),B
}
,Node.prototype.removeChild=function(B){
var L=B instanceof Element&&K(B),O=f.call(this,B);
return L&&gt(A,B),O
}
,Node.prototype.replaceChild=function(B,L){
if(B instanceof DocumentFragment){
var O=rt(B);
if(B=p.call(this,B,L),K(this))for(gt(A,L),L=0;
L<O.length;
L++)Nt(A,O[L]);
return B
}
O=B instanceof Element&&K(B);
var V=p.call(this,B,L),X=K(this);
return X&&gt(A,L),O&&gt(A,B),X&&Nt(A,B),V
}
,g&&g.get?P(Node.prototype,g):wt(A,function(B){
P(B,{
enumerable:!0,configurable:!0,get:function(){
for(var L=[],O=this.firstChild;
O;
O=O.nextSibling)O.nodeType!==Node.COMMENT_NODE&&L.push(O.textContent);
return L.join("")
}
,set:function(L){
for(;
this.firstChild;
)f.call(this,this.firstChild);
L!=null&&L!==""&&l.call(this,document.createTextNode(L))
}

}
)
}
)
}
var W=window.customElements;
function J(){
var A=new nt;
S(A),ue(A),Dt(A,DocumentFragment.prototype,{
prepend:a,append:i
}
),D(A),d(A),window.CustomElementRegistry=dt,A=new dt(A),document.__CE_registry=A,Object.defineProperty(window,"customElements",{
configurable:!0,enumerable:!0,value:A
}
)
}
W&&!W.forcePolyfill&&typeof W.define=="function"&&typeof W.get=="function"||J(),window.__CE_installPolyfill=J
}
).call(self);
U();
U();
U();
U();
var zc=Pt(io(),1),qc=()=>`uid::${
(0,zc.default)(7)
}
`,Uc=(t,e=["endpointName","fingerprint"])=>typeof t=="object"&&t!==null&&e.every(r=>r in t),Hc=t=>{
if(!Uc(t))throw new TypeError("Invalid connection args");
return JSON.stringify(t)
}
,Wc=()=>{
let t=[];
return{
add:(...e)=>{
t=[...t,...e]
}
,remove:e=>{
t=typeof e=="string"?t.filter(r=>r.message.transactionId!==e):t.filter(r=>!e.includes(r))
}
,entries:()=>t
}

}
,tn=class{
static toBackground(t,e){
return t.postMessage(e)
}
static toExtensionContext(t,e){
return t.postMessage(e)
}

}
,Yc=Pt(Cc(),1),Gc=(t="")=>{
let e=qc(),r,n=[],o=Wc(),a=new Set,i=new Set,s=(u,f)=>{
switch(u.status){
case"undeliverable":n.some(p=>p.message.messageID===u.message.messageID)||(n=[...n,{
message:u.message,resolvedDestination:u.resolvedDestination
}
]);
return;
case"deliverable":n=n.reduce((p,g)=>g.resolvedDestination===u.deliverableTo?(tn.toBackground(f,{
type:"deliver",message:g.message
}
),p):[...p,g],[]);
return;
case"delivered":u.receipt.message.messageType==="message"&&o.add(u.receipt);
return;
case"incoming":u.message.messageType==="reply"&&o.remove(u.message.messageID),a.forEach(p=>p(u.message,f));
return;
case"terminated":{
let p=o.entries().filter(g=>u.fingerprint===g.to);
o.remove(p),p.forEach(({
message:g
}
)=>i.forEach(w=>w(g)))
}

}

}
,l=()=>{
r=Yc.default.runtime.connect({
name:Hc({
endpointName:t,fingerprint:e
}
)
}
),r.onMessage.addListener(s),r.onDisconnect.addListener(l),tn.toBackground(r,{
type:"sync",pendingResponses:o.entries(),pendingDeliveries:[...new Set(n.map(({
resolvedDestination:u
}
)=>u))]
}
)
}
;
return l(),{
onFailure(u){
i.add(u)
}
,onMessage(u){
a.add(u)
}
,postMessage(u){
tn.toBackground(r,{
type:"deliver",message:u
}
)
}

}

}
;
U();
var jo,Vc=(t,e,r)=>jo??(jo=new Promise(n=>{
let o=i=>{
let{
data:{
cmd:s,scope:l,context:u
}
,ports:f
}
=i;
if(s==="webext-port-offer"&&l===e&&u!==t)return window.removeEventListener("message",o),f[0].onmessage=r,f[0].postMessage("port-accepted"),n(f[0])
}
,a=()=>{
let i=new MessageChannel;
i.port1.onmessage=s=>{
if(s.data==="port-accepted")return window.removeEventListener("message",o),n(i.port1);
r?.(s)
}
,window.postMessage({
cmd:"webext-port-offer",scope:e,context:t
}
,"*",[i.port2])
}
;
window.addEventListener("message",o),t==="window"?setTimeout(a,0):a()
}
)),Zc=t=>{
let e,r=!1,n,o;
return{
enable:()=>r=!0,onMessage:a=>n=a,postMessage:async a=>{
if(t!=="content-script"&&t!=="window")throw new Error("Endpoint does not use postMessage");
if(!r)throw new Error("Communication with window has not been allowed");
return Xc(e),(await o).postMessage(a)
}
,setNamespace:a=>{
if(e)throw new Error("Namespace once set cannot be changed");
e=a,o=Vc(t,a,({
data:i
}
)=>n?.(i))
}

}

}
;
function Xc(t){
if(typeof t!="string"||t.trim().length===0)throw new Error(`webext-bridge uses window.postMessage to talk with other "window"(s) for message routingwhich is global/conflicting operation in case there are other scripts using webext-bridge. Call Bridge#setNamespace(nsps) to isolate your app. Example: setNamespace('com.facebook.react-devtools'). Make sure to use same namespace across all your scripts whereever window.postMessage is likely to be used\``)
}
U();
U();
var Jc=Object.defineProperty,Qc=Object.defineProperties,Kc=Object.getOwnPropertyDescriptors,$o=Object.getOwnPropertySymbols,tu=Object.prototype.hasOwnProperty,eu=Object.prototype.propertyIsEnumerable,Lo=(t,e,r)=>e in t?Jc(t,e,{
enumerable:!0,configurable:!0,writable:!0,value:r
}
):t[e]=r,Si=(t,e)=>{
for(var r in e||(e={

}
))tu.call(e,r)&&Lo(t,r,e[r]);
if($o)for(var r of $o(e))eu.call(e,r)&&Lo(t,r,e[r]);
return t
}
,_i=(t,e)=>Qc(t,Kc(e)),ru=/^((?:background$)|devtools|popup|options|content-script|window)(?:@(\d+)(?:\.(\d+))?)?$/,ki=t=>{
let[,e,r,n]=t.match(ru)||[];
return{
context:e,tabId:+r,frameId:n?+n:void 0
}

}
,zo=Pt(io(),1);
U();
var nu=[{
property:"name",enumerable:!1
}
,{
property:"message",enumerable:!1
}
,{
property:"stack",enumerable:!1
}
,{
property:"code",enumerable:!0
}
],Sn=Symbol(".toJSON was called"),ou=t=>{
t[Sn]=!0;
let e=t.toJSON();
return delete t[Sn],e
}
,Ni=({
from:t,seen:e,to_:r,forceEnumerable:n,maxDepth:o,depth:a
}
)=>{
let i=r||(Array.isArray(t)?[]:{

}
);
if(e.push(t),a>=o)return i;
if(typeof t.toJSON=="function"&&t[Sn]!==!0)return ou(t);
for(let[s,l]of Object.entries(t)){
if(typeof Cn.Buffer=="function"&&Cn.Buffer.isBuffer(l)){
i[s]="[object Buffer]";
continue
}
if(l!==null&&typeof l=="object"&&typeof l.pipe=="function"){
i[s]="[object Stream]";
continue
}
if(typeof l!="function"){
if(!l||typeof l!="object"){
i[s]=l;
continue
}
if(!e.includes(t[s])){
a++,i[s]=Ni({
from:t[s],seen:[...e],forceEnumerable:n,maxDepth:o,depth:a
}
);
continue
}
i[s]="[Circular]"
}

}
for(let{
property:s,enumerable:l
}
of nu)typeof t[s]=="string"&&Object.defineProperty(i,s,{
value:t[s],enumerable:n?!0:l,configurable:!0,writable:!0
}
);
return i
}
;
function au(t,e={

}
){
let{
maxDepth:r=Number.POSITIVE_INFINITY
}
=e;
return typeof t=="object"&&t!==null?Ni({
from:t,seen:[],forceEnumerable:!0,maxDepth:r,depth:0
}
):typeof t=="function"?`[Function: ${
t.name||"anonymous"
}
]`:t
}
U();
var Ti=()=>({
events:{

}
,emit(t,...e){
(this.events[t]||[]).forEach(r=>r(...e))
}
,on(t,e){
return(this.events[t]=this.events[t]||[]).push(e),()=>this.events[t]=(this.events[t]||[]).filter(r=>r!==e)
}

}
),iu=Pt(io(),1),su=(t,e,r)=>{
let n=(0,zo.default)(),o=new Map,a=new Map,i=s=>{
if(s.destination.context===t&&!s.destination.frameId&&!s.destination.tabId){
r?.(s);
let{
transactionId:l,messageID:u,messageType:f
}
=s,p=()=>{
let w=o.get(l);
if(w){
let{
err:b,data:h
}
=s;
if(b){
let m=b,v=self[m.name],x=new(typeof v=="function"?v:Error)(m.message);
for(let k in m)x[k]=m[k];
w.reject(x)
}
else w.resolve(h);
o.delete(l)
}

}
,g=async()=>{
let w,b,h=!1;
try{
let m=a.get(u);
if(typeof m=="function")w=await m({
sender:s.origin,id:u,data:s.data,timestamp:s.timestamp
}
);
else throw h=!0,new Error(`[webext-bridge] No handler registered in '${
t
}
' to accept messages with id '${
u
}
'`)
}
catch(m){
b=m
}
finally{
if(b&&(s.err=au(b)),i(_i(Si({

}
,s),{
messageType:"reply",data:w,origin:{
context:t,tabId:null
}
,destination:s.origin,hops:[]
}
)),b&&!h)throw w
}

}
;
switch(f){
case"reply":return p();
case"message":return g()
}

}
return s.hops.push(`${
t
}
::${
n
}
`),e(s)
}
;
return{
handleMessage:i,endTransaction:s=>{
o.get(s)?.reject("Transaction was ended before it could complete"),o.delete(s)
}
,sendMessage:(s,l,u="background")=>{
let f=typeof u=="string"?ki(u):u,p="Bridge#sendMessage ->";
if(!f.context)throw new TypeError(`${
p
}
 Destination must be any one of known destinations`);
return new Promise((g,w)=>{
let b={
messageID:s,data:l,destination:f,messageType:"message",transactionId:(0,zo.default)(),origin:{
context:t,tabId:null
}
,hops:[],timestamp:Date.now()
}
;
o.set(b.transactionId,{
resolve:g,reject:w
}
);
try{
i(b)
}
catch(h){
o.delete(b.transactionId),w(h)
}

}
)
}
,onMessage:(s,l)=>(a.set(s,l),()=>a.delete(s))
}

}
,$e=class{
constructor(t,e){
this.endpointRuntime=t,this.streamInfo=e,this.emitter=Ti(),this.isClosed=!1,this.handleStreamClose=()=>{
this.isClosed||(this.isClosed=!0,this.emitter.emit("closed",!0),this.emitter.events={

}
)
}
,$e.initDone||(t.onMessage("__crx_bridge_stream_transfer__",r=>{
let{
streamId:n,streamTransfer:o,action:a
}
=r.data,i=$e.openStreams.get(n);
i&&!i.isClosed&&(a==="transfer"&&i.emitter.emit("message",o),a==="close"&&($e.openStreams.delete(n),i.handleStreamClose()))
}
),$e.initDone=!0),$e.openStreams.set(this.streamInfo.streamId,this)
}
get info(){
return this.streamInfo
}
send(t){
if(this.isClosed)throw new Error("Attempting to send a message over closed stream. Use stream.onClose(<callback>) to keep an eye on stream status");
this.endpointRuntime.sendMessage("__crx_bridge_stream_transfer__",{
streamId:this.streamInfo.streamId,streamTransfer:t,action:"transfer"
}
,this.streamInfo.endpoint)
}
close(t){
t&&this.send(t),this.handleStreamClose(),this.endpointRuntime.sendMessage("__crx_bridge_stream_transfer__",{
streamId:this.streamInfo.streamId,streamTransfer:null,action:"close"
}
,this.streamInfo.endpoint)
}
onMessage(t){
return this.getDisposable("message",t)
}
onClose(t){
return this.getDisposable("closed",t)
}
getDisposable(t,e){
let r=this.emitter.on(t,e);
return Object.assign(r,{
dispose:r,close:r
}
)
}

}
,_r=$e;
_r.initDone=!1;
_r.openStreams=new Map;
var lu=t=>{
let e=new Map,r=new Map,n=Ti();
t.onMessage("__crx_bridge_stream_open__",i=>new Promise(s=>{
let{
sender:l,data:u
}
=i,{
channel:f
}
=u,p=!1,g=()=>{

}
,w=()=>{
let b=r.get(f);
typeof b=="function"?(b(new _r(t,_i(Si({

}
,u),{
endpoint:l
}
))),p&&g(),s(!0)):p||(p=!0,g=n.on("did-change-stream-callbacks",w))
}
;
w()
}
));
async function o(i,s){
if(e.has(i))throw new Error("webext-bridge: A Stream is already open at this channel");
let l=typeof s=="string"?ki(s):s,u={
streamId:(0,iu.default)(),channel:i,endpoint:l
}
,f=new _r(t,u);
return f.onClose(()=>e.delete(i)),await t.sendMessage("__crx_bridge_stream_open__",u,l),e.set(i,f),f
}
function a(i,s){
if(r.has(i))throw new Error("webext-bridge: This channel has already been claimed. Stream allows only one-on-one communication");
r.set(i,s),n.emit("did-change-stream-callbacks")
}
return{
openStream:o,onOpenStreamChannel:a
}

}
,so=Zc("content-script"),lo=Gc(),or=su("content-script",t=>{
t.destination.context==="window"?so.postMessage(t):lo.postMessage(t)
}
);
so.onMessage(t=>{
t.origin={
context:"window",tabId:null
}
,or.handleMessage(t)
}
);
lo.onMessage(or.handleMessage);
lo.onFailure(t=>{
if(t.origin.context==="window"){
so.postMessage({
type:"error",transactionID:t.transactionId
}
);
return
}
or.endTransaction(t.transactionId)
}
);
var{
sendMessage:cu,onMessage:uu
}
=or,{
openStream:oy,onOpenStreamChannel:ay
}
=lu(or);
U();
U();
var co=t=>{
if(t.stack){
let e=t.stack;
return t.cause&&(e+=`
Caused by ${
co(t.cause)
}
`),e
}
return""
}
,fu=(t,...e)=>{
let r=e[1];
return e[1]=async function(...n){
try{
return await r(...n)
}
catch(o){
return{
__error:{
message:o.message,stack:co(o)
}

}

}

}
,t(...e)
}
,hu=async(t,...e)=>{
let r=await t(...e);
if(r?.__error){
console.error(`sendMessage ${
e[0]
}
 error`,r.__error);
let n=new Error(r.__error.message);
throw n.stack+=`
`+r.__error.stack,n
}
return r
}
,Zt=function(...t){
return fu(uu,...t)
}
,le=async function(...t){
return hu(cu,...t)
}
;
U();
U();
function pu(t){
return new Set(t)
}
var du=t=>t.filter(mu),mu=t=>t!=null,qo=t=>[...pu(t)];
function gu(t,e,r,n){
let o=s=>{
let{
display:l,opacity:u,transform:f
}
=getComputedStyle(s);
return!(!l||l==="none"||u==="0"||s.nodeType===1&&s.hidden||f.startsWith("matrix(0, 0, 0, 0"))
}
,a=s=>{
if(!s.find(l=>!n(l)))return s.find(o)
}
,i=s=>du(s).filter(o).filter(n);
try{
customElements.define(`${
t
}
overlay-selector`,class extends HTMLElement{
constructor(){
super(...arguments),this.overlay=void 0,this.mouseElement=void 0,this.selected=[],this.enableMouseEvents=!1,this.multiple=!1,this.cleanups=[]
}
connectedCallback(){
this.innerHTML=`<style>
          ${
t
}
overlay-selector {

            display: block;

            z-index: 2147483646;

            position: fixed;

            outline: 1px dashed #0d99ff;

            opacity: 0.8;

            cursor: crosshair !important;

          
}

          ${
t
}
overlay-selector > div.overlay {

            display: block;

            position: fixed;

            outline: 1px solid #0d99ff;

            background: rgba(0,100,200,0.1);

            pointer-events: none;

          
}

          </style><div class="overlay"></div>`,this.overlay=this.getElementsByClassName("overlay")[0];
let s=(l,u,f)=>{
document.addEventListener(l,u,f),this.cleanups.push(()=>document.removeEventListener(l,u,f))
}
;
s("mousemove",this.onMove.bind(this)),s("scroll",this.onScroll.bind(this)),s("click",this.onClick.bind(this),!0),s("keydown",l=>{
if(l.key==="Escape")r();
else if(l.key==="\\"||l.key==="Enter"&&l.shiftKey||l.key==="Backspace"){
let u=i(qo(this.selected.map(f=>f.parentElement)));
u.length&&(l.key==="Backspace"&&this.selected.forEach(f=>f.remove()),this.setSelected(u,!1))
}
else if(l.key==="Enter"){
let u=i(Array.from(new Set(this.selected.flatMap(f=>Array.from(f.children)))));
u.length&&this.setSelected(u,!1)
}

}
)
}
disconnectedCallback(){
this.cleanups.splice(0).forEach(s=>s())
}
async onClick(s){
!s.altKey&&this.selected.length&&(this.style.pointerEvents="",s.stopPropagation(),s.preventDefault(),e(this.selected,s.shiftKey))
}
setSelected(s,l,u=!1){
if(l){
if(this.mouseElement===s[0]&&!u)return;
this.mouseElement=s[0]
}
this.selected=s;
let f=i(qo(this.selected.map(w=>w.parentElement))),p=s.flatMap(w=>Array.from(w.getClientRects())),g=f.flatMap(w=>Array.from(w.getClientRects()));
if(g.length||(g=p),p.length){
let w=Math.min(...g.map(I=>I.left)),b=Math.min(...g.map(I=>I.top)),h=Math.max(...g.map(I=>I.right)),m=Math.max(...g.map(I=>I.bottom));
this.style.left=w+"px",this.style.top=b+"px",this.style.width=h-w+"px",this.style.height=m-b+"px";
let v=Math.min(...p.map(I=>I.left)),x=Math.min(...p.map(I=>I.top)),k=Math.max(...p.map(I=>I.right)),N=Math.max(...p.map(I=>I.bottom)),_=p.map(I=>`M${
I.left-v
}
,${
I.top-x
}
 L${
I.right-v
}
,${
I.top-x
}
 L${
I.right-v
}
,${
I.bottom-x
}
 L${
I.left-v
}
,${
I.bottom-x
}
 Z`).concat(`M-2,-2 L${
k-v+2
}
,-2 L${
k-v+2
}
,0 L-2,0 Z`,`M-2,-2 L0,-2 L0,${
N-x+2
}
 L-2,${
N-x+2
}
 Z`,`M${
k-v
}
,-2 L${
k-v+2
}
,-2 L${
k-v+2
}
,${
N-x+2
}
 L${
k-v
}
,${
N-x+2
}
 Z`,`M-2,${
N-x
}
 L${
k-v+2
}
,${
N-x
}
 L${
k-v+2
}
,${
N-x+2
}
 L-2,${
N-x+2
}
 Z`).join(" ");
this.style.display="block",this.overlay.style.display="block",this.overlay.style.left=v+"px",this.overlay.style.top=x+"px",this.overlay.style.width=k-v+"px",this.overlay.style.height=N-x+"px",this.overlay.style.clipPath=`path('${
_
}
')`
}
else this.style.display="none",this.overlay.style.display="none"
}
onScroll(){
this.lastEvent&&this.onMove(this.lastEvent,!0)
}
onMove(s,l=!1){
this.lastEvent=s;
let{
clientX:u,clientY:f
}
=s;
this.style.pointerEvents="none";
let p=document.elementsFromPoint(u,f),g=a(p),w=b=>{
if(b?.shadowRoot){
let h=b.shadowRoot.elementsFromPoint(u,f),m=a(h);
return m===b?b:m?.shadowRoot?w(m):m
}
return b
}
;
this.setSelected(g?[w(g)||g]:[],!0,l),this.style.pointerEvents=s.metaKey?"":"none"
}

}
)
}
catch{

}

}
U();
var Uo="--extension-popup-styles",Pi="extension-toast",yu=()=>{
if(!document.getElementById(Uo)){
let t=document.createElement("style");
t.innerHTML="@import url('https://fonts.googleapis.com/css?family=Inter:400,600&display=swap');
",t.id=Uo,document.documentElement.appendChild(t)
}

}
,Ii=()=>{
let t=document.createElement("div");
return t.classList.add(Pi),t.style.fontSize="16px",t.style.lineHeight="1.5em",t.style.fontFamily="'Inter', 'Helvetica', sans-serif",t.style.display="grid",t.style.gap="8px",t.style.zIndex="2147483647",t.style.borderRadius="1rem",t.style.position="fixed",t.style.left="50%",t.style.top="1rem",t.style.transform="translate(-50%, 0)",t.style.padding="1rem",t.style.background="black",t.style.color="white",t.style.boxShadow="0px 2px 10px rgba(255,255,255,0.1)",t.style.minWidth="400px",t.style.maxWidth="80vw",t
}
,Bi=(t,e)=>{
let r=Ii();
r.innerHTML=t;
let n=document.createElement("button");
n.style.background="inherit",n.style.color="inherit",n.style.border="none",n.style.borderRadius="inherit",n.style.position="absolute",n.style.right="1px",n.style.top="1px",n.style.height="2rem",n.style.width="2rem",n.innerHTML="\u2715",n.addEventListener("click",()=>r.remove()),r.appendChild(n),document.documentElement.appendChild(r),setTimeout(()=>r.remove(),e)
}
,vu=t=>Bi(`\u{
1F4AC
}
 ${
t
}
`,1e4),bu=t=>{
t.includes("chrome-extension:// URL")&&(t=`There is a conflict with another Chrome extension.
    <br/><br/>
    Please disable your extensions one by one and reload the page to find which one is causing the issue.
    <br/><br/>
    Please report the problematic extension to us so we can fix compatibility as soon as possible.`),Bi(`\u274C ${
t
}

    <a target="_blank" href="mailto:support+h2d@divriots.com" style="place-self:end;
color:inherit">Contact us</a>`,2e4)
}
;
U();
var Xe="h2d-",It="h2d-toolbar",en="download-button",Ho=!!navigator.platform.match(/(Mac|iPhone|iPod|iPad)/i),Wo=0,Yo=t=>`Download ${
t
}
 element${
t>1?"s":""
}
`;
function wu(t,e){
gu(Xe,t,e,r=>!(r.id===It||r.className===Pi)),Zt("addCapture",()=>{
console.log("addCapture");
let r=document.querySelector(`#${
It
}
 button#${
en
}
`);
r&&(r.innerHTML=Yo(++Wo),r.className="")
}
),Zt("removeSelector",()=>_e()),Zt("addSelector",()=>{
if(Wo=0,document.querySelector(`${
Xe
}
overlay-selector`)||document.body.appendChild(document.createElement(`${
Xe
}
overlay-selector`)),!document.getElementById(It)){
let r=Ii();
r.innerHTML='<svg fill="none" height="24" viewBox="0 0 32 32" width="24" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><clipPath id="a"><rect height="32" rx="1" width="32"/></clipPath><g clip-path="url(#a)"><rect fill="#010706" height="32" rx="1" width="32"/><path d="m7.1938 0h-1.6124v13.8915h1.6124z" fill="#eaeaea"/><path d="m4.71318 0h-7.1938v13.8915h7.1938z" fill="#f24e1e"/><path d="m21.5814 22.2015h-13.51938v9.7985h13.51938z" fill="#eaeaea"/><path d="m32 22.2015h-8.6822v3.2248h8.6822z" fill="#eaeaea"/><path d="m7.1938 22.2015h-7.1938v9.7985h7.1938z" fill="#1abcfe"/><path d="m32 27.1628h-8.6822v4.8372h8.6822z" fill="#0acf83"/><path d="m7.1938 14.7597h-7.1938v6.5736h7.1938z" fill="#eaeaea"/><g fill="#fff"><rect height="3" rx="1" width="16" x="10" y="4"/><rect height="3" rx="1" width="8" x="10" y="10"/><rect height="3" rx="1" width="18" x="10" y="16"/></g></g></svg>',r.id=It,r.style.top="auto",r.style.bottom="1rem",r.style.borderRadius="10px",r.style.minWidth="10px",r.style.display="flex",r.style.alignItems="center",r.style.padding="10px 18px",r.style.gap="16px";
let n=document.createElement("style");
n.innerHTML=`
      #${
It
}
 {

        all: initial;

      
}

      #${
It
}
 button {

        color: white;

        background: none;

        border: none;

        padding: 0;

        display: flex;

        align-items: center;

        height: 30px;

        position: relative;

        font-size: 12px;

        line-height: 12px;

      
}

      #${
It
}
 button.hidden {

        display: none;

      
}

      #${
It
}
 button#${
en
}
 {

        border: 1px solid white;

        border-radius: 5px;

        padding-left: 8px;

        padding-right: 8px;

      
}

      #${
It
}
 button:hover {

        opacity: 1;

      
}

      #${
It
}
 button > .tooltip {

        visibility: hidden;

        position: absolute;

        bottom: calc(100% + 16px);

        left: -50%;

        border-radius: 8px;

        background-color: black;

        color: white;

        white-space: nowrap;

        font-size: 12px;

        padding: 20px;

      
}

      #${
It
}
 button:hover > .tooltip {

        visibility: visible;

      
}

      #${
It
}
 button:hover > .tooltip > .title {

        font-size: 120%;

        padding-bottom: 10px;

      
}

      #${
It
}
 button > .tooltip > .shortcut {

        display: flex;

        justify-content: space-between;

        margin-top: 4px;

      
}

      #${
It
}
 button > .tooltip > .shortcut {

        display: flex;

        gap:8px;

      
}

      #${
It
}
 button > .tooltip > .shortcut > span:last-child {

        padding-left: 3rem;

      
}

      #${
It
}
 button > .tooltip > .shortcut kdb {

        border-radius: 8px;

        padding: 2px 8px;

        background-color: rgba(255, 255, 255, 0.3);

      
}

      `,r.appendChild(n);
let o=document.createElement("button");
o.innerHTML=`<svg viewBox="0 0 512 512"  width="24" height="24" xmlns="http://www.w3.org/2000/svg"><path fill="#FFF" d="m459.576 99.307h-407.153c-28.899 0-52.423 23.53-52.423 52.429v192.879c0 37.536 30.537 68.078 68.068 68.078h375.862c37.532 0 68.069-30.542 68.069-68.078v-192.879c.001-28.899-23.524-52.429-52.423-52.429zm25.939 245.308c0 22.934-18.655 41.589-41.584 41.589h-375.863c-22.929 0-41.584-18.655-41.584-41.589v-192.879c0-14.306 11.638-25.938 25.938-25.938h407.154c14.301 0 25.938 11.633 25.938 25.938v192.879z"/><path fill="#FFF" d="m189.792 233.929h44.138v44.142h-44.138z"/><path fill="#FFF" d="m256.002 233.929h44.134v44.142h-44.134z"/><path fill="#FFF" d="m322.207 233.929h44.138v44.142h-44.138z"/><path fill="#FFF" d="m410.484 300.139h44.134v44.134h-44.134z"/><path fill="#FFF" d="m189.792 167.729h44.138v44.134h-44.138z"/><path fill="#FFF" d="m123.587 233.929h44.138v44.142h-44.138z"/><path fill="#FFF" d="m123.587 167.729h44.138v44.134h-44.138z"/><path d="m57.382 300.139h44.134v44.134h-44.134z"/><path fill="#FFF" d="m57.382 233.929h44.134v44.142h-44.134z"/><path fill="#FFF" d="m57.382 167.729h44.134v44.134h-44.134z"/><path fill="#FFF" d="m256.002 167.729h44.134v44.134h-44.134z"/><path fill="#FFF" d="m322.207 167.729h44.138v44.134h-44.138z"/><path fill="#FFF" d="m123.587 300.139h264.825v44.134h-264.825z"/><path fill="#FFF" d="m388.412 167.729h66.205v110.343h-66.205z"/></svg>
        <div class="tooltip" style="display: flex;
flex-direction: column;
gap: 10px;
width: min-content;
">
          <div class="title">Shortcuts</div>
          <div class="shortcut"><span>Capture multiple</span><span>Hold <kdb>\u21E7 Shift</kdb></span></div>
          <div class="shortcut"><span>Allow clicks without capturing</span><span>Hold <kdb>${
Ho?"\u2325 Option":"Alt"
}
</kdb></span></div>
          <div class="shortcut"><span>Disable mouse events</span><span>Hold <kdb>${
Ho?"\u2318 Cmd":"^ Ctrl"
}
</kdb></span></div>
          <div class="shortcut"><span>Select parent</span><span><kdb>\\</kdb> or <kdb>\u21E7 Shift</kdb> + <kdb>Enter</kdb></span></div>
          <div class="shortcut"><span>Select children</span><span><kdb>Enter</kdb></span></div>
          <div class="shortcut"><span>Cancel</span><span><kdb>Esc</kdb></span></div>
        </div>
        `,r.appendChild(o);
let a=document.createElement("button");
a.id=en,a.className="hidden",a.innerHTML=Yo(0),a.addEventListener("click",async s=>{
s.stopPropagation(),s.preventDefault(),await le("finalizeImport",void 0),_e()
}
),r.appendChild(a);
let i=document.createElement("button");
i.innerHTML="Cancel",i.addEventListener("click",async s=>{
s.stopPropagation(),s.preventDefault(),le("cancelCapture",void 0),_e()
}
),r.appendChild(i),document.body.appendChild(r)
}

}
)
}
function _e(){
document.querySelectorAll(`${
Xe
}
overlay-selector`).forEach(t=>t.remove()),document.getElementById(It)?.remove()
}
U();
var xu=Pt(Nc());
U();
U();
var he=class{
constructor(t){
this.stackCleaner=e=>e,this.def=t
}
addDefault(t){
if(this.def){
if(this.def.properties){
let{
properties:e,...r
}
=t;
Object.assign(this.def.properties,e),t=r
}
Object.assign(this.def,t)
}
else this.def={
...t
}

}
resetDefault(){
this.def=void 0
}
transformOptions(t){
if(!t)return;
let{
country:e,userAgent:r
}
=t,n={

}
;
return e&&(n.co=e),r&&(n.ua=r),n
}
async feature_test(t,e){
if("feature"in e){
console.error("`feature` is a reserved property for feature_test tracking.");
return
}
return this.track("feature-test",{
properties:{
feature:t,...e
}

}
)
}
async exception(t,e,r){
Ut.default.env.FIREBASE_CONFIG&&console.error(`Analytics.exception(): ${
t
}
`,e,r);
let n={
name:t
}
;
return r&&(n.details=typeof r=="string"?r:JSON.stringify(r)),this.track("exception",{
error:e,properties:n
}
)
}
catcher(t,e){
return r=>{
this.exception(t,r,e)
}

}
unhandled(t,e){
try{
let r=e();
return r&&typeof r=="object"&&"catch"in r?r.catch(this.catcher(t)):r
}
catch(r){
this.exception(t,r)
}

}
setStackCleaner(t){
this.stackCleaner=t
}
async track(t,e={

}
,r){
let n={
...this.def?.properties,...e.properties
}
;
if(e.error){
let i=e.error;
n.error_message=i.message||String(i),n.error_stack=this.stackCleaner(co(i)),delete e.error
}
let o={
event:t,version:Ut.default.env.__FIGMA_PLUGIN_VERSION__,...this.def,...e,properties:n,options:this.transformOptions(r)
}
;
if(!o.product){
console.error("Analytics.track(): `product` property is missing.");
return
}
let a=async(i,s)=>{
try{
return await fetch(`${
i
}
/pa`,{
method:"POST",body:JSON.stringify(o)
}
),!0
}
catch(l){
s&&console.error(`Analytics.track(): Unexpected error on event ${
t
}
.`,l)
}
return!1
}
;
if(he.serviceUrl)await a(he.serviceUrl,!0);
else{
let i=[...he.SHARED_SERVICE_URLS];
for(;
i.length;
){
let s=i.shift();
if(await a(s,!i.length)){
he.serviceUrl=s;
return
}

}
he.serviceUrl||(he.serviceUrl=he.SHARED_SERVICE_URLS[0])
}

}

}
,Ri=he;
Ri.SHARED_SERVICE_URLS=["https://api.divriots.com","https://api-eu.divriots.com"];
var Au=class extends Ri{
constructor(){
super({

}
),this.isInitialized=!1
}
initialize(t){
this.addDefault(t),this.isInitialized=!0
}

}
,$t=new Au;
$t.initialize({
product:"h2d",version:chrome?.runtime?.getManifest()?.version,properties:{
source:"chrome-extension"
}

}
);
$t.setStackCleaner(t=>t.replace(/chrome-extension:\/\/[^/]+/g,""));
var uo=$t;
U();
var Oi=Pt(ao());
U();
var Ft=Uint8Array,Lt=Uint16Array,qr=Uint32Array,Ur=new Ft([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0]),Hr=new Ft([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0]),_n=new Ft([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),Di=function(t,e){
for(var r=new Lt(31),n=0;
n<31;
++n)r[n]=e+=1<<t[n-1];
for(var o=new qr(r[30]),n=1;
n<30;
++n)for(var a=r[n];
a<r[n+1];
++a)o[a]=a-r[n]<<5|n;
return[r,o]
}
,Fi=Di(Ur,2),ji=Fi[0],kn=Fi[1];
ji[28]=258,kn[258]=28;
var $i=Di(Hr,0),Mu=$i[0],Go=$i[1],Nn=new Lt(32768);
for(ut=0;
ut<32768;
++ut)ae=(ut&43690)>>>1|(ut&21845)<<1,ae=(ae&52428)>>>2|(ae&13107)<<2,ae=(ae&61680)>>>4|(ae&3855)<<4,Nn[ut]=((ae&65280)>>>8|(ae&255)<<8)>>>1;
var ae,ut,ee=function(t,e,r){
for(var n=t.length,o=0,a=new Lt(e);
o<n;
++o)t[o]&&++a[t[o]-1];
var i=new Lt(e);
for(o=0;
o<e;
++o)i[o]=i[o-1]+a[o-1]<<1;
var s;
if(r){
s=new Lt(1<<e);
var l=15-e;
for(o=0;
o<n;
++o)if(t[o])for(var u=o<<4|t[o],f=e-t[o],p=i[t[o]-1]++<<f,g=p|(1<<f)-1;
p<=g;
++p)s[Nn[p]>>>l]=u
}
else for(s=new Lt(n),o=0;
o<n;
++o)t[o]&&(s[o]=Nn[i[t[o]-1]++]>>>15-t[o]);
return s
}
,ye=new Ft(288);
for(ut=0;
ut<144;
++ut)ye[ut]=8;
var ut;
for(ut=144;
ut<256;
++ut)ye[ut]=9;
var ut;
for(ut=256;
ut<280;
++ut)ye[ut]=7;
var ut;
for(ut=280;
ut<288;
++ut)ye[ut]=8;
var ut,Qe=new Ft(32);
for(ut=0;
ut<32;
++ut)Qe[ut]=5;
var ut,Eu=ee(ye,9,0),Cu=ee(ye,9,1),Su=ee(Qe,5,0),_u=ee(Qe,5,1),rn=function(t){
for(var e=t[0],r=1;
r<t.length;
++r)t[r]>e&&(e=t[r]);
return e
}
,Jt=function(t,e,r){
var n=e/8|0;
return(t[n]|t[n+1]<<8)>>(e&7)&r
}
,nn=function(t,e){
var r=e/8|0;
return(t[r]|t[r+1]<<8|t[r+2]<<16)>>(e&7)
}
,fo=function(t){
return(t+7)/8|0
}
,Li=function(t,e,r){
(e==null||e<0)&&(e=0),(r==null||r>t.length)&&(r=t.length);
var n=new(t.BYTES_PER_ELEMENT==2?Lt:t.BYTES_PER_ELEMENT==4?qr:Ft)(r-e);
return n.set(t.subarray(e,r)),n
}
,ku=["unexpected EOF","invalid block type","invalid length/literal","invalid distance","stream finished","no stream handler",,"no callback","invalid UTF-8 data","extra field too long","date not in range 1980-2099","filename too long","stream finishing","invalid zip data"],pe=function(t,e,r){
var n=new Error(e||ku[t]);
if(n.code=t,Error.captureStackTrace&&Error.captureStackTrace(n,pe),!r)throw n;
return n
}
,Nu=function(t,e,r){
var n=t.length;
if(!n||r&&r.f&&!r.l)return e||new Ft(0);
var o=!e||r,a=!r||r.i;
r||(r={

}
),e||(e=new Ft(n*3));
var i=function(tt){
var wt=e.length;
if(tt>wt){
var ht=new Ft(Math.max(wt*2,tt));
ht.set(e),e=ht
}

}
,s=r.f||0,l=r.p||0,u=r.b||0,f=r.l,p=r.d,g=r.m,w=r.n,b=n*8;
do{
if(!f){
s=Jt(t,l,1);
var h=Jt(t,l+1,3);
if(l+=3,h)if(h==1)f=Cu,p=_u,g=9,w=5;
else if(h==2){
var m=Jt(t,l,31)+257,v=Jt(t,l+10,15)+4,x=m+Jt(t,l+5,31)+1;
l+=14;
for(var k=new Ft(x),N=new Ft(19),_=0;
_<v;
++_)N[_n[_]]=Jt(t,l+_*3,7);
l+=v*3;
for(var I=rn(N),z=(1<<I)-1,R=ee(N,I,1),_=0;
_<x;
){
var M=R[Jt(t,l,z)];
l+=M&15;
var C=M>>>4;
if(C<16)k[_++]=C;
else{
var E=0,q=0;
for(C==16?(q=3+Jt(t,l,3),l+=2,E=k[_-1]):C==17?(q=3+Jt(t,l,7),l+=3):C==18&&(q=11+Jt(t,l,127),l+=7);
q--;
)k[_++]=E
}

}
var Y=k.subarray(0,m),G=k.subarray(m);
g=rn(Y),w=rn(G),f=ee(Y,g,1),p=ee(G,w,1)
}
else pe(1);
else{
var C=fo(l)+4,j=t[C-4]|t[C-3]<<8,H=C+j;
if(H>n){
a&&pe(0);
break
}
o&&i(u+j),e.set(t.subarray(C,H),u),r.b=u+=j,r.p=l=H*8,r.f=s;
continue
}
if(l>b){
a&&pe(0);
break
}

}
o&&i(u+131072);
for(var T=(1<<g)-1,F=(1<<w)-1,$=l;
;
$=l){
var E=f[nn(t,l)&T],Z=E>>>4;
if(l+=E&15,l>b){
a&&pe(0);
break
}
if(E||pe(2),Z<256)e[u++]=Z;
else if(Z==256){
$=l,f=null;
break
}
else{
var K=Z-254;
if(Z>264){
var _=Z-257,rt=Ur[_];
K=Jt(t,l,(1<<rt)-1)+ji[_],l+=rt
}
var Q=p[nn(t,l)&F],at=Q>>>4;
Q||pe(3),l+=Q&15;
var G=Mu[at];
if(at>3){
var rt=Hr[at];
G+=nn(t,l)&(1<<rt)-1,l+=rt
}
if(l>b){
a&&pe(0);
break
}
o&&i(u+131072);
for(var nt=u+K;
u<nt;
u+=4)e[u]=e[u-G],e[u+1]=e[u+1-G],e[u+2]=e[u+2-G],e[u+3]=e[u+3-G];
u=nt
}

}
r.l=f,r.p=$,r.b=u,r.f=s,f&&(s=1,r.m=g,r.d=p,r.n=w)
}
while(!s);
return u==e.length?e:Li(e,0,u)
}
,ie=function(t,e,r){
r<<=e&7;
var n=e/8|0;
t[n]|=r,t[n+1]|=r>>>8
}
,We=function(t,e,r){
r<<=e&7;
var n=e/8|0;
t[n]|=r,t[n+1]|=r>>>8,t[n+2]|=r>>>16
}
,on=function(t,e){
for(var r=[],n=0;
n<t.length;
++n)t[n]&&r.push({
s:n,f:t[n]
}
);
var o=r.length,a=r.slice();
if(!o)return[ho,0];
if(o==1){
var i=new Ft(r[0].s+1);
return i[r[0].s]=1,[i,1]
}
r.sort(function(_,I){
return _.f-I.f
}
),r.push({
s:-1,f:25001
}
);
var s=r[0],l=r[1],u=0,f=1,p=2;
for(r[0]={
s:-1,f:s.f+l.f,l:s,r:l
}
;
f!=o-1;
)s=r[r[u].f<r[p].f?u++:p++],l=r[u!=f&&r[u].f<r[p].f?u++:p++],r[f++]={
s:-1,f:s.f+l.f,l:s,r:l
}
;
for(var g=a[0].s,n=1;
n<o;
++n)a[n].s>g&&(g=a[n].s);
var w=new Lt(g+1),b=Tn(r[f-1],w,0);
if(b>e){
var n=0,h=0,m=b-e,v=1<<m;
for(a.sort(function(I,z){
return w[z.s]-w[I.s]||I.f-z.f
}
);
n<o;
++n){
var x=a[n].s;
if(w[x]>e)h+=v-(1<<b-w[x]),w[x]=e;
else break
}
for(h>>>=m;
h>0;
){
var k=a[n].s;
w[k]<e?h-=1<<e-w[k]++-1:++n
}
for(;
n>=0&&h;
--n){
var N=a[n].s;
w[N]==e&&(--w[N],++h)
}
b=e
}
return[new Ft(w),b]
}
,Tn=function(t,e,r){
return t.s==-1?Math.max(Tn(t.l,e,r+1),Tn(t.r,e,r+1)):e[t.s]=r
}
,Vo=function(t){
for(var e=t.length;
e&&!t[--e];
);
for(var r=new Lt(++e),n=0,o=t[0],a=1,i=function(l){
r[n++]=l
}
,s=1;
s<=e;
++s)if(t[s]==o&&s!=e)++a;
else{
if(!o&&a>2){
for(;
a>138;
a-=138)i(32754);
a>2&&(i(a>10?a-11<<5|28690:a-3<<5|12305),a=0)
}
else if(a>3){
for(i(o),--a;
a>6;
a-=6)i(8304);
a>2&&(i(a-3<<5|8208),a=0)
}
for(;
a--;
)i(o);
a=1,o=t[s]
}
return[r.subarray(0,n),e]
}
,Ye=function(t,e){
for(var r=0,n=0;
n<e.length;
++n)r+=t[n]*e[n];
return r
}
,Pn=function(t,e,r){
var n=r.length,o=fo(e+2);
t[o]=n&255,t[o+1]=n>>>8,t[o+2]=t[o]^255,t[o+3]=t[o+1]^255;
for(var a=0;
a<n;
++a)t[o+a+4]=r[a];
return(o+4+n)*8
}
,Zo=function(t,e,r,n,o,a,i,s,l,u,f){
ie(e,f++,r),++o[256];
for(var p=on(o,15),g=p[0],w=p[1],b=on(a,15),h=b[0],m=b[1],v=Vo(g),x=v[0],k=v[1],N=Vo(h),_=N[0],I=N[1],z=new Lt(19),R=0;
R<x.length;
++R)z[x[R]&31]++;
for(var R=0;
R<_.length;
++R)z[_[R]&31]++;
for(var M=on(z,7),C=M[0],E=M[1],q=19;
q>4&&!C[_n[q-1]];
--q);
var Y=u+5<<3,G=Ye(o,ye)+Ye(a,Qe)+i,j=Ye(o,g)+Ye(a,h)+i+14+3*q+Ye(z,C)+(2*z[16]+3*z[17]+7*z[18]);
if(Y<=G&&Y<=j)return Pn(e,f,t.subarray(l,l+u));
var H,T,F,$;
if(ie(e,f,1+(j<G)),f+=2,j<G){
H=ee(g,w,0),T=g,F=ee(h,m,0),$=h;
var Z=ee(C,E,0);
ie(e,f,k-257),ie(e,f+5,I-1),ie(e,f+10,q-4),f+=14;
for(var R=0;
R<q;
++R)ie(e,f+3*R,C[_n[R]]);
f+=3*q;
for(var K=[x,_],rt=0;
rt<2;
++rt)for(var Q=K[rt],R=0;
R<Q.length;
++R){
var at=Q[R]&31;
ie(e,f,Z[at]),f+=C[at],at>15&&(ie(e,f,Q[R]>>>5&127),f+=Q[R]>>>12)
}

}
else H=Eu,T=ye,F=Su,$=Qe;
for(var R=0;
R<s;
++R)if(n[R]>255){
var at=n[R]>>>18&31;
We(e,f,H[at+257]),f+=T[at+257],at>7&&(ie(e,f,n[R]>>>23&31),f+=Ur[at]);
var nt=n[R]&31;
We(e,f,F[nt]),f+=$[nt],nt>3&&(We(e,f,n[R]>>>5&8191),f+=Hr[nt])
}
else We(e,f,H[n[R]]),f+=T[n[R]];
return We(e,f,H[256]),f+T[256]
}
,Tu=new qr([65540,131080,131088,131104,262176,1048704,1048832,2114560,2117632]),ho=new Ft(0),Pu=function(t,e,r,n,o,a){
var i=t.length,s=new Ft(n+i+5*(1+Math.ceil(i/7e3))+o),l=s.subarray(n,s.length-o),u=0;
if(!e||i<8)for(var f=0;
f<=i;
f+=65535){
var p=f+65535;
p>=i&&(l[u>>3]=a),u=Pn(l,u+1,t.subarray(f,p))
}
else{
for(var g=Tu[e-1],w=g>>>13,b=g&8191,h=(1<<r)-1,m=new Lt(32768),v=new Lt(h+1),x=Math.ceil(r/3),k=2*x,N=function(ft){
return(t[ft]^t[ft+1]<<x^t[ft+2]<<k)&h
}
,_=new qr(25e3),I=new Lt(288),z=new Lt(32),R=0,M=0,f=0,C=0,E=0,q=0;
f<i;
++f){
var Y=N(f),G=f&32767,j=v[Y];
if(m[G]=j,v[Y]=G,E<=f){
var H=i-f;
if((R>7e3||C>24576)&&H>423){
u=Zo(t,l,0,_,I,z,M,C,q,f-q,u),C=R=M=0,q=f;
for(var T=0;
T<286;
++T)I[T]=0;
for(var T=0;
T<30;
++T)z[T]=0
}
var F=2,$=0,Z=b,K=G-j&32767;
if(H>2&&Y==N(f-K))for(var rt=Math.min(w,H)-1,Q=Math.min(32767,f),at=Math.min(258,H);
K<=Q&&--Z&&G!=j;
){
if(t[f+F]==t[f+F-K]){
for(var nt=0;
nt<at&&t[f+nt]==t[f+nt-K];
++nt);
if(nt>F){
if(F=nt,$=K,nt>rt)break;
for(var tt=Math.min(K,nt-2),wt=0,T=0;
T<tt;
++T){
var ht=f-K+T+32768&32767,Ct=m[ht],kt=ht-Ct+32768&32767;
kt>wt&&(wt=kt,j=ht)
}

}

}
G=j,j=m[G],K+=G-j+32768&32767
}
if($){
_[C++]=268435456|kn[F]<<18|Go[$];
var Nt=kn[F]&31,gt=Go[$]&31;
M+=Ur[Nt]+Hr[gt],++I[257+Nt],++z[gt],E=f+F,++R
}
else _[C++]=t[f],++I[t[f]]
}

}
u=Zo(t,l,a,_,I,z,M,C,q,f-q,u),!a&&u&7&&(u=Pn(l,u+1,ho))
}
return Li(s,0,n+fo(u)+o)
}
,Iu=function(t,e,r,n,o){
return Pu(t,e.level==null?6:e.level,e.mem==null?Math.ceil(Math.max(8,Math.min(13,Math.log(t.length)))*1.5):12+e.mem,r,n,!o)
}
;
function Bu(t,e){
return Iu(t,e||{

}
,0,0)
}
function Ru(t,e){
return Nu(t,e)
}
var Ou=typeof TextDecoder<"u"&&new TextDecoder,Du=0;
try{
Ou.decode(ho,{
stream:!0
}
),Du=1
}
catch{

}
function Fu(t){
let e=Oi.Buffer.from(t,"base64"),r=Ru(e),n=new TextDecoder().decode(r);
return JSON.parse(n)
}
function zi(t){
let e=JSON.stringify(t),r=new TextEncoder().encode(e),n=Bu(r);
return Oi.Buffer.from(n).toString("base64")
}
var qi=!1;
Zt("cancelCapture",async()=>{
console.info("received cancelCapture"),_e(),qi=!0,window.__h2d_stopScrolling=!0
}
);
window.__h2d_stopScrolling=!1;
Zt("stopScrolling",async()=>{
console.info("received stop scrolling"),window.__h2d_stopScrolling=!0
}
);
Zt("setCaptureAnalytics",({
data:t
}
)=>uo.addDefault(t));
var Ui=async(t,e)=>{
let{
doc:r,frame:n,rect:o
}
=await e(t,{
componentInfo:!1,trackDefaults:uo.def,cancelled:{
get value(){
return qi
}

}

}
).catch(p=>{
let g="Error while serializing DOM, check console logs.";
throw console.error(g,p),new Error(g,{
cause:p
}
)
}
),a=globalThis.location.host?globalThis.location.href:(0,xu.basename)(globalThis.location.pathname),i=zi({
name:a,doc:r,frame:n
}
),{
x:s,y:l,width:u,height:f
}
=o;
await le("storeSerializedFrame",{
content:i,screenshotRect:{
x:s+window.scrollX,y:l+window.scrollY,width:u,height:f
}

}
).catch(p=>{
let g="Storing serialization results failed, check console logs.";
throw console.error(g,p),new Error(g,{
cause:p
}
)
}
)
}
;
U();
U();
async function ju(t,e,r){
let n,o=new AbortController;
try{
let a=setTimeout(()=>o.abort(),5e3);
n=await e(t,{
signal:o.signal
}
).finally(()=>clearTimeout(a))
}
catch{

}
if(n?.ok){
let a=n.headers.get("content-length");
return a&&parseInt(a)>3e7?(o.abort(),{
content:"",mimeType:""
}
):{
content:r(await n.arrayBuffer()),mimeType:n.headers.get("content-type")||""
}

}

}
function $u(t){
let e="",r=new Uint8Array(t),n=r.byteLength;
for(let o=0;
o<n;
o++)e+=String.fromCharCode(r[o]);
return window.btoa(e)
}
U();
U();
U();
U();
U();
function Hi(t){
return t==="absolute"||t==="fixed"
}
function Wi(t){
return!!t?.endsWith("px")
}
var kr=t=>{
if(!t?.endsWith("px"))return 0;
let e=parseFloat(t);
return isNaN(e)?0:e
}
;
function po(t,e,r){
if(Yi(t,r))return!0;
if(r.display==="contents")return!1;
if(t){
let n=t;
for(;
n&&!He(n);
)n=n?.parentElement;
let o=n?.offsetParent;
if(n&&!o&&!(e.width>0&&e.height>0)){
let a=getComputedStyle(n).position,i=t.ownerDocument;
if(n!==i.body&&n!==i.documentElement&&a!=="fixed")return!0
}

}
return!!(r.overflowX!=="visible"&&e.width<1||r.overflowY!=="visible"&&e.height<1||Hi(r.position)&&r.clip==="rect(0px, 0px, 0px, 0px)"||r.clipPath==="inset(50%)"||r.clipPath==="inset(0px 0px 99.9% 99.9%)"||r.clipPath==="inset(0px 100% 0px 0px)"||r.position==="absolute"&&(e.x<-5e3||e.y<-5e3))
}
function Yi(t,{
transform:e,display:r
}
){
return!!(t&&He(t)&&t.hidden||r===""||r==="none"||e.startsWith("matrix(0, 0, 0, 0"))
}
function Lu(t){
return Math.sqrt(t.width**2+t.height**2)
}
var ar=t=>t.nodeType===Node.ELEMENT_NODE,zu=t=>"assignedNodes"in t,mo=t=>t.nodeType===Node.TEXT_NODE,qu=t=>t.nodeType===document.DOCUMENT_NODE,Uu="http://www.w3.org/2000/svg",Ae=t=>t.namespaceURI===Uu,Wr=t=>Ae(t)&&t.tagName==="svg",Hu=t=>Ae(t)&&t.tagName==="textPath",Wu=t=>Ae(t)&&t.tagName==="symbol",Yu=t=>Ae(t)&&"textLength"in t,Gu=t=>Ae(t)&&"getTotalLength"in t,In=t=>t.tagName==="IMG",Vu=t=>t.tagName==="BODY",Bn=t=>t.tagName==="VIDEO",Zu=t=>t.tagName==="CANVAS",go=t=>t.tagName==="BR",Gi=t=>t.tagName==="INPUT",Xu=t=>t.tagName==="PROGRESS",Ju=t=>t instanceof HTMLFormElement||t.tagName==="FORM",Xo=t=>t.tagName==="EMBED",Qu=t=>t.tagName==="SELECT",Vi=t=>t.tagName==="TEXTAREA",Ku=t=>t.tagName==="A",Nr=t=>t.tagName==="IFRAME",He=t=>"offsetWidth"in t;
function me(){
return window.name==="__h2d__sandbox"?window.parent:window
}
function tf(t){
return t.type===1
}
function Zi(t){
return t?t.indexOf(me().location.origin)===0:!0
}
var Xi=(t="*",e)=>`
${
t
}
,
${
t
}
::before,
${
t
}
::after{

  ${
e.trim()
}


}
`,Ji="animation-play-state: paused !important;
",Qi=t=>Xi(t.cssSelector||"*",`
  caret-color: transparent !important;

  transition-duration: 0ms !important;

  transition-delay: 0ms !important;

  animation-delay: 0ms !important;

  animation-duration: 1ms !important;

  animation-iteration-count: 1 !important;

  content-visibility: initial !important;

  ${
t.pauseAnimations?Ji:""
}
`),ef=".__h2d-remove-before:not(#__h2d_id_for_specificity):before,.__h2d-remove-after:not(#__h2d_id_for_specificity):after{
content:none!important
}
",rf=(t="*")=>Xi(t,`${
Ji
}
 transition-duration: 9999s !important;
`);
function nf(t=""){
let e=document.createElement("style");
return e.textContent=t+`
body > div#switches-container {

  display: none;


}

body > div#root > div > div > #artboard {

  overflow: visible;


}

body > div#root > div > div > #artboard > #gestureListenerContainer {

  overflow: visible;


}

html {

  scroll-behavior: auto !important;


}

`,e
}
var Rn=t=>{
if(t.scrollHeight<=t.clientHeight)return!1;
let e=t.ownerDocument;
if(t===e.body||t===e.documentElement||t===e.scrollingElement)return!0;
let r=getComputedStyle(t);
return["auto","scroll"].includes(r.overflowY)
}
,Jo=t=>{
let e=t;
for(;
e;
){
if(getComputedStyle(e).display==="none")return!1;
e=e.parentElement
}
return!0
}
;
function of(t){
let e=t.defaultView||me(),r=({
top:i,height:s
}
,l)=>{
let u=l.innerHeight*2/3;
return i<u&&s>=l.innerHeight-u
}
;
function n(i){
return[i,...Array.from(i.querySelectorAll("iframe")).filter(s=>s.name!=="__h2d__sandbox").filter(Jo).filter(s=>r(s.getBoundingClientRect(),e)).flatMap(s=>{
try{
if(s.contentDocument)return n(s.contentDocument)
}
catch{

}
return[]
}
).filter(s=>s!==null)]
}
function o(){
let i=n(t),s=[];
for(let l of i)for(let u of l.querySelectorAll("*")){
let f=u.getBoundingClientRect();
!r(f,e)||!Rn(u)||!Jo(u)||s.push({
element:u,rect:f,scrollRatio:u.scrollHeight/u.clientHeight
}
)
}
if(s.sort((l,u)=>u.scrollRatio*u.rect.width-l.scrollRatio*l.rect.width),s.length>0)return s[0].element
}
let a=o();
if(a)return a.__x2d_isScrollingElt=!0,a
}
async function af([t,e,r]){
let n=window.name==="__h2d__sandbox"?window.parent:window,o=()=>Math.min(t.scrollHeight,e)-n.innerHeight,a=typeof r>"u"||t.scrollTop===r?t.scrollTop+n.innerHeight/5:r;
for(;
a<o()&&!window.__h2d_stopScrolling;
)t.scrollTo({
top:a,behavior:"instant"
}
),window.__h2d_stopTasks?.(),await new Promise(i=>setTimeout(i,100)),a+=n.innerHeight/5
}
async function sf(t,e,r){
let n=0,o=await e(t),a=Math.min(Math.max(o,2e4),1e5),i=-1;
for(;
i!==0&&n<3;
){
await r([t,a,n===0?0:void 0]);
let s=await e(t);
i=s-o,o=s,n++
}

}
function*yo(t,e){
yield*e(t);
let r=document.createTreeWalker(t,NodeFilter.SHOW_ELEMENT,o=>Nr(o)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP),n;
for(;
n=r.nextNode();
)try{
let o=n.contentDocument||n.contentWindow?.document;
o?.documentElement&&(yield*yo(o,e))
}
catch{

}

}
function Yr(t,e){
return yo(t,function*(r){
if("querySelectorAll"in r)for(let n of r.querySelectorAll(e))yield n
}
)
}
var lf=t=>yo(t,function*(e){
if(e.nodeType===Node.DOCUMENT_NODE)for(let r of e.styleSheets||[])yield r
}
);
function Ki(t,e){
let r=("getBoundingClientRect"in t?t:t.documentElement).getBoundingClientRect();
return Array.from(Yr(t,e.selector)).filter(He).filter(n=>{
let o=getComputedStyle(n);
return o.visibility!=="hidden"&&!po(n,r,o)
}
)
}
function fe(t){
return"value"in t?t.value===0:!1
}
function an(t){
return t===1?!0:typeof t=="object"&&"value"in t?t.value===1&&t.unit==="number":!1
}
function cf(t){
switch(t.constructor.name){
case"CSSTranslate":return fe(t.x)&&fe(t.y)&&fe(t.z);
case"CSSRotate":return fe(t.angle);
case"CSSScale":return an(t.x)&&an(t.y)&&an(t.z);
case"CSSSkew":return fe(t.ax)&&fe(t.ay);
case"CSSSkewX":return fe(t.ax);
case"CSSSkewY":return fe(t.ay);
case"CSSPerspective":return!1;
case"CSSMatrixComponent":return t.matrix.isIdentity
}
return!1
}
U();
U();
function uf(){
return window.crypto.getRandomValues(new Uint32Array(1))[0].toString(16)
}
U();
U();
U();
U();
function vo(t){
return typeof t=="object"&&t!==null&&t.nodeType===Node.ELEMENT_NODE
}
U();
U();
U();
var Tr={
NONE:"",DESCENDANT:" ",CHILD:" > "
}
,Mt={
id:"id",class:"class",tag:"tag",attribute:"attribute",nthchild:"nthchild",nthoftype:"nthoftype"
}
;
U();
function ff(t,e){
return Object.values(t).includes(e)
}
U();
var hf="CssSelectorGenerator";
function Pr(t="unknown problem",...e){
console.warn(`${
hf
}
: ${
t
}
`,...e)
}
var pf={
selectors:[Mt.id,Mt.class,Mt.tag,Mt.attribute],includeTag:!1,whitelist:[],blacklist:[],combineWithinSelector:!0,combineBetweenSelectors:!0,root:null,maxCombinations:Number.POSITIVE_INFINITY,maxCandidates:Number.POSITIVE_INFINITY
}
;
function df(t){
return Array.isArray(t)?t.filter(e=>ff(Mt,e)):[]
}
function ts(t){
return t instanceof RegExp
}
function mf(t){
return["string","function"].includes(typeof t)||ts(t)
}
function Qo(t){
return Array.isArray(t)?t.filter(mf):[]
}
function gf(t){
return t instanceof Node
}
function Ko(t){
let e=[Node.DOCUMENT_NODE,Node.DOCUMENT_FRAGMENT_NODE,Node.ELEMENT_NODE];
return gf(t)&&e.includes(t.nodeType)
}
function es(t,e){
if(Ko(t))return t.contains(e)||Pr("element root mismatch","Provided root does not contain the element. This will most likely result in producing a fallback selector using element's real root node. If you plan to use the selector using provided root (e.g. `root.querySelector`), it will not work as intended."),t;
let r=e.getRootNode({
composed:!1
}
);
return Ko(r)?(r!==document&&Pr("shadow root inferred","You did not provide a root and the element is a child of Shadow DOM. This will produce a selector using ShadowRoot as a root. If you plan to use the selector using document as a root (e.g. `document.querySelector`), it will not work as intended."),r):wo(e)
}
function ta(t){
return typeof t=="number"?t:Number.POSITIVE_INFINITY
}
function yf(t,e={

}
){
let r=Object.assign(Object.assign({

}
,pf),e);
return{
selectors:df(r.selectors),whitelist:Qo(r.whitelist),blacklist:Qo(r.blacklist),root:es(r.root,t),combineWithinSelector:!!r.combineWithinSelector,combineBetweenSelectors:!!r.combineBetweenSelectors,includeTag:!!r.includeTag,maxCombinations:ta(r.maxCombinations),maxCandidates:ta(r.maxCandidates)
}

}
function ir(t=[]){
let[e=[],...r]=t;
return r.length===0?e:r.reduce((n,o)=>n.filter(a=>o.includes(a)),e)
}
function rs(t){
return[].concat(...t)
}
function vf(t){
return t.replace(/[|\\{

}
()[\]^$+?.]/g,"\\$&").replace(/\*/g,".+")
}
function On(t){
let e=t.map(r=>{
if(ts(r))return n=>r.test(n);
if(typeof r=="function")return n=>{
let o=r(n);
return typeof o!="boolean"?(Pr("pattern matcher function invalid","Provided pattern matching function does not return boolean. It's result will be ignored.",r),!1):o
}
;
if(typeof r=="string"){
let n=new RegExp("^"+vf(r)+"$");
return o=>n.test(o)
}
return Pr("pattern matcher invalid","Pattern matching only accepts strings, regular expressions and/or functions. This item is invalid and will be ignored.",r),()=>!1
}
);
return r=>e.some(n=>n(r))
}
function bo(t,e,r){
let n=Array.from(es(r,t[0]).querySelectorAll(e));
return n.length===t.length&&t.every(o=>n.includes(o))
}
function ns(t,e){
e=e??wo(t);
let r=[],n=t;
for(;
vo(n)&&n!==e;
)r.push(n),n=n.parentElement;
return r
}
function bf(t,e){
return ir(t.map(r=>ns(r,e)))
}
function wo(t){
return t.ownerDocument.querySelector(":root")
}
U();
var os=", ",wf=new RegExp(["^$","\\s"].join("|")),xf=new RegExp(["^$"].join("|")),as=[Mt.nthoftype,Mt.tag,Mt.id,Mt.class,Mt.attribute,Mt.nthchild];
U();
U();
U();
var Af=On(["class","id","ng-*"]);
function Mf({
name:t
}
){
return`[${
t
}
]`
}
function Ef({
name:t,value:e
}
){
return`[${
t
}
='${
e
}
']`
}
function Cf({
nodeName:t,nodeValue:e
}
,r){
let n=r.tagName.toLowerCase();
return["input","option"].includes(n)&&t==="value"||t==="src"&&e?.startsWith("data:")?!1:!Af(t)
}
function Sf({
nodeName:t,nodeValue:e
}
){
return{
name:Ke(t),value:Ke(e??void 0)
}

}
function is(t){
let e=Array.from(t.attributes).filter(r=>Cf(r,t)).map(Sf);
return[...e.map(Mf),...e.map(Ef)]
}
function _f(t){
let e=t.map(is);
return ir(e)
}
U();
function ss(t){
var e;
return((e=t.getAttribute("class"))!==null&&e!==void 0?e:"").trim().split(/\s+/).filter(r=>!xf.test(r)).map(r=>`.${
Ke(r)
}
`)
}
function kf(t){
let e=t.map(ss);
return ir(e)
}
U();
function ls(t){
var e;
let r=(e=t.getAttribute("id"))!==null&&e!==void 0?e:"",n=`#${
Ke(r)
}
`,o=t.getRootNode({
composed:!1
}
);
return!wf.test(r)&&bo([t],n,o)?[n]:[]
}
function Nf(t){
return t.length===0||t.length>1?[]:ls(t[0])
}
U();
function cs(t){
let e=t.parentNode;
if(e){
let r=Array.from(e.childNodes).filter(vo).indexOf(t);
if(r>-1)return[`:nth-child(${
String(r+1)
}
)`]
}
return[]
}
function Tf(t){
return ir(t.map(cs))
}
U();
U();
function us(t){
return[Ke(t.tagName.toLowerCase())]
}
function fs(t){
let e=[...new Set(rs(t.map(us)))];
return e.length===0||e.length>1?[]:[e[0]]
}
function hs(t){
let e=fs([t])[0],r=t.parentElement;
if(r){
let n=Array.from(r.children).filter(o=>o.tagName.toLowerCase()===e).indexOf(t);
if(n>-1)return[`${
e
}
:nth-of-type(${
String(n+1)
}
)`]
}
return[]
}
function Pf(t){
return ir(t.map(hs))
}
U();
function*If(t=[],{
maxResults:e=Number.POSITIVE_INFINITY
}
={

}
){
let r=0,n=Dn(1);
for(;
n.length<=t.length&&r<e;
)r+=1,yield n.map(o=>t[o]),n=Bf(n,t.length-1)
}
function ps(t=[],{
maxResults:e=Number.POSITIVE_INFINITY
}
={

}
){
return Array.from(If(t,{
maxResults:e
}
))
}
function Bf(t=[],e=0){
let r=t.length;
if(r===0)return[];
let n=[...t];
n[r-1]+=1;
for(let o=r-1;
o>=0;
o--)if(n[o]>e){
if(o===0)return Dn(r+1);
n[o-1]++,n[o]=n[o-1]+1
}
return n[r-1]>e?Dn(r+1):n
}
function Dn(t=1){
return Array.from(Array(t).keys())
}
U();
function Rf(t={

}
){
let e=[];
return Object.entries(t).forEach(([r,n])=>{
e=n.flatMap(o=>e.length===0?[{
[r]:o
}
]:e.map(a=>Object.assign(Object.assign({

}
,a),{
[r]:o
}
)))
}
),e
}
var Of=":".charCodeAt(0).toString(16).toUpperCase(),Df=/[ !"#$%&'()\[\]{
|
}
<>*+,./;
=?@^`~\\]/;
function Ke(t=""){
return CSS?CSS.escape(t):Ff(t)
}
function Ff(t=""){
return t.split("").map(e=>e===":"?`\\${
Of
}
 `:Df.test(e)?`\\${
e
}
`:escape(e).replace(/%/g,"\\")).join("")
}
var jf={
tag:fs,id:Nf,class:kf,attribute:_f,nthchild:Tf,nthoftype:Pf
}
,$f={
tag:us,id:ls,class:ss,attribute:is,nthchild:cs,nthoftype:hs
}
;
function Lf(t,e){
return $f[e](t)
}
function zf(t,e){
let r=jf[e];
return r(t)
}
function qf(t=[],e,r){
return t.filter(n=>r(n)||!e(n))
}
function Uf(t=[],e){
return t.sort((r,n)=>{
let o=e(r),a=e(n);
return o&&!a?-1:!o&&a?1:0
}
)
}
function Hf(t,e,r){
let n=Wf(t,r),o=Zf(n,r),a=rs(o);
return[...new Set(a)]
}
function Wf(t,e){
let{
blacklist:r,whitelist:n,combineWithinSelector:o,maxCombinations:a
}
=e,i=On(r),s=On(n),l=(u,f)=>{
let p=zf(t,f),g=qf(p,i,s),w=Uf(g,s);
return u[f]=o?ps(w,{
maxResults:a
}
):w.map(b=>[b]),u
}
;
return Yf(e).reduce(l,{

}
)
}
function Yf(t){
let{
selectors:e,includeTag:r
}
=t,n=[...e];
return r&&!n.includes("tag")&&n.push("tag"),n
}
function Gf(t){
return t.includes(Mt.tag)||t.includes(Mt.nthoftype)?[...t]:[...t,Mt.tag]
}
function Vf(t){
let{
selectors:e,combineBetweenSelectors:r,includeTag:n,maxCandidates:o
}
=t,a=r?ps(e,{
maxResults:o
}
):e.map(i=>[i]);
return n?a.map(Gf):a
}
function Zf(t,e){
return Vf(e).map(r=>Xf(r,t)).filter(r=>r.length>0)
}
function Xf(t,e){
let r={

}
;
return t.forEach(n=>{
let o=e[n];
o&&o.length>0&&(r[n]=o)
}
),Rf(r).map(Qf)
}
function Jf(t,e){
return e[t]?e[t].join(""):""
}
function Qf(t={

}
){
let e=[...as];
return t[Mt.tag]&&t[Mt.nthoftype]&&e.splice(e.indexOf(Mt.tag),1),e.map(r=>Jf(r,t)).join("")
}
function Kf(t,e){
return[...t.map(r=>e+Tr.DESCENDANT+r),...t.map(r=>e+Tr.CHILD+r)]
}
function th(t,e){
return e===""?t:Kf(t,e)
}
function eh(t,e,r="",n){
let o=Hf(t,e,n),a=th(o,r);
for(let i of a)if(bo(t,i,e))return i;
return null
}
function rh(t,e,r="",n){
if(t.length===0)return null;
let o=[t.length>1?t:[],...bf(t,e).map(a=>[a])];
for(let a of o){
let i=eh(a,e,r,n);
if(i)return{
foundElements:a,selector:i
}

}
return null
}
function nh(t){
(t instanceof NodeList||t instanceof HTMLCollection)&&(t=Array.from(t));
let e=(Array.isArray(t)?t:[t]).filter(vo);
return[...new Set(e)]
}
function oh(t){
return{
value:t,include:!1
}

}
function ah(t,e,r=Tr.NONE){
let n={

}
;
return e.forEach(o=>{
Reflect.set(n,o,Lf(t,o).map(oh))
}
),{
element:t,operator:r,selectors:n
}

}
function ih({
selectors:t,operator:e
}
){
let r=[...as];
t[Mt.tag]&&t[Mt.nthoftype]&&(r=r.filter(o=>o!==Mt.tag));
let n="";
return r.forEach(o=>{
var a;
((a=t[o])!==null&&a!==void 0?a:[]).forEach(({
value:i,include:s
}
)=>{
s&&(n+=i)
}
)
}
),e+n
}
function sh(t){
return[":root",...ns(t).reverse().map(r=>{
let n=ah(r,[Mt.nthchild],Tr.CHILD);
return n.selectors.nthchild.forEach(o=>{
o.include=!0
}
),n
}
).map(ih)].join("")
}
function lh(t){
return t.map(sh).join(os)
}
function ds(t,e={

}
){
var r;
let n=nh(t),o=yf(n[0],e),a=(r=o.root)!==null&&r!==void 0?r:wo(n[0]),i="",s=a;
function l(){
return rh(n,s,i,o)
}
let u=l();
for(;
u;
){
let{
foundElements:f,selector:p
}
=u;
if(bo(n,p,a))return p;
s=f[0],i=p,u=l()
}
return n.length>1?n.map(f=>ds(f,o)).join(os):lh(n)
}
function xo(t,e){
return Array.from(e.classList).find(r=>r.startsWith(t))
}
function ch(t){
let e=document.querySelectorAll(`[class^="${
t
}
"],[class*=" ${
t
}
"]`);
for(let r of e){
let n=xo(t,r);
n&&r.classList.remove(n)
}

}
function uh(t){
return t+uf()
}
function ms(t){
return t.nodeName==="#text"&&!t.textContent?.match(/[^ \f\t\n\r]/)
}
function*Fn(t,e){
let r=e.getRootNode();
if("host"in r)yield*Fn(t,r.host);
else{
let o=e.ownerDocument?.defaultView?.frameElement;
o&&(yield*Fn(t,o))
}
let n=xo(t,e);
n?yield`.${
n
}
`:(console.debug("Generating fallback CSS selector for",e),yield ds(e,{
root:r
}
).replace(/^:root > /,""))
}
function ea(t,e){
let r=xo(t,e);
return r||(r=uh(t),e.classList.add(r)),r
}
function fh(t,e){
let r,n,o=!1,a;
if(qu(e)&&e.defaultView?.frameElement)o=!0,r=e.defaultView.frameElement;
else if(ar(e))r=e;
else{
let i=e.parentElement;
if(e.parentElement)r=e.parentElement;
else{
let s=e.getRootNode(),l="host"in s?s.host:void 0;
i=s;
let u=l?.getAttribute("__h2d_shadowRoot");
u?a=parseInt(u):r=l
}
if(!i)throw new Error("Can't compute selector, no parent");
if(n=[...i.childNodes].filter(s=>!ms(s)).indexOf(e),n<0)throw new Error("Can't compute selector, node not found")
}
return{
selectors:r?Array.from(Fn(t,r)):[],idx:n,nodeId:a,contentDocument:o
}

}
U();
U();
U();
U();
U();
U();
U();
U();
U();
U();
U();
U();
U();
U();
U();
var{
cos:iy,sin:sy,PI:ly
}
=Math;
U();
U();
U();
var{
tan:cy
}
=Math;
U();
U();
U();
U();
U();
U();
function hh(t,e){
function r(){
this.constructor=t
}
r.prototype=e.prototype,t.prototype=new r
}
function Gr(t,e,r,n){
var o=Error.call(this,t);
return Object.setPrototypeOf&&Object.setPrototypeOf(o,Gr.prototype),o.expected=e,o.found=r,o.location=n,o.name="SyntaxError",o
}
hh(Gr,Error);
function sn(t,e,r){
return r=r||" ",t.length>e?t:(e-=t.length,r+=r.repeat(e),t+r.slice(0,e))
}
Gr.prototype.format=function(t){
var e="Error: "+this.message;
if(this.location){
var r=null,n;
for(n=0;
n<t.length;
n++)if(t[n].source===this.location.source){
r=t[n].text.split(/\r\n|\n|\r/g);
break
}
var o=this.location.start,a=this.location.source+":"+o.line+":"+o.column;
if(r){
var i=this.location.end,s=sn("",o.line.toString().length," "),l=r[o.line-1],u=o.line===i.line?i.column:l.length+1,f=u-o.column||1;
e+=`
 --> `+a+`
`+s+` |
`+o.line+" | "+l+`
`+s+" | "+sn("",o.column-1," ")+sn("",f,"^")
}
else e+=`
 at `+a
}
return e
}
;
Gr.buildMessage=function(t,e){
var r={
literal:function(u){
return'"'+o(u.text)+'"'
}
,class:function(u){
var f=u.parts.map(function(p){
return Array.isArray(p)?a(p[0])+"-"+a(p[1]):a(p)
}
);
return"["+(u.inverted?"^":"")+f.join("")+"]"
}
,any:function(){
return"any character"
}
,end:function(){
return"end of input"
}
,other:function(u){
return u.description
}

}
;
function n(u){
return u.charCodeAt(0).toString(16).toUpperCase()
}
function o(u){
return u.replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/\0/g,"\\0").replace(/\t/g,"\\t").replace(/\n/g,"\\n").replace(/\r/g,"\\r").replace(/[\x00-\x0F]/g,function(f){
return"\\x0"+n(f)
}
).replace(/[\x10-\x1F\x7F-\x9F]/g,function(f){
return"\\x"+n(f)
}
)
}
function a(u){
return u.replace(/\\/g,"\\\\").replace(/\]/g,"\\]").replace(/\^/g,"\\^").replace(/-/g,"\\-").replace(/\0/g,"\\0").replace(/\t/g,"\\t").replace(/\n/g,"\\n").replace(/\r/g,"\\r").replace(/[\x00-\x0F]/g,function(f){
return"\\x0"+n(f)
}
).replace(/[\x10-\x1F\x7F-\x9F]/g,function(f){
return"\\x"+n(f)
}
)
}
function i(u){
return r[u.type](u)
}
function s(u){
var f=u.map(i),p,g;
if(f.sort(),f.length>0){
for(p=1,g=1;
p<f.length;
p++)f[p-1]!==f[p]&&(f[g]=f[p],g++);
f.length=g
}
switch(f.length){
case 1:return f[0];
case 2:return f[0]+" or "+f[1];
default:return f.slice(0,-1).join(", ")+", or "+f[f.length-1]
}

}
function l(u){
return u?'"'+o(u)+'"':"end of input"
}
return"Expected "+s(t)+" but "+l(e)+" found."
}
;
U();
U();
U();
U();
var ct=1e-6,At=typeof Float32Array<"u"?Float32Array:Array,Se=Math.random,uy=Math.PI/180;
Math.hypot||(Math.hypot=function(){
for(var t=0,e=arguments.length;
e--;
)t+=arguments[e]*arguments[e];
return Math.sqrt(t)
}
);
var gs={

}
;
nr(gs,{
LDU:()=>Nh,add:()=>Th,adjoint:()=>xh,clone:()=>dh,copy:()=>mh,create:()=>ph,determinant:()=>Ah,equals:()=>Ih,exactEquals:()=>Ph,frob:()=>kh,fromRotation:()=>Ch,fromScaling:()=>Sh,fromValues:()=>yh,identity:()=>gh,invert:()=>wh,mul:()=>Oh,multiply:()=>ys,multiplyScalar:()=>Bh,multiplyScalarAndAdd:()=>Rh,rotate:()=>Mh,scale:()=>Eh,set:()=>vh,str:()=>_h,sub:()=>Dh,subtract:()=>vs,transpose:()=>bh
}
);
U();
function ph(){
var t=new At(4);
return At!=Float32Array&&(t[1]=0,t[2]=0),t[0]=1,t[3]=1,t
}
function dh(t){
var e=new At(4);
return e[0]=t[0],e[1]=t[1],e[2]=t[2],e[3]=t[3],e
}
function mh(t,e){
return t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[3],t
}
function gh(t){
return t[0]=1,t[1]=0,t[2]=0,t[3]=1,t
}
function yh(t,e,r,n){
var o=new At(4);
return o[0]=t,o[1]=e,o[2]=r,o[3]=n,o
}
function vh(t,e,r,n,o){
return t[0]=e,t[1]=r,t[2]=n,t[3]=o,t
}
function bh(t,e){
if(t===e){
var r=e[1];
t[1]=e[2],t[2]=r
}
else t[0]=e[0],t[1]=e[2],t[2]=e[1],t[3]=e[3];
return t
}
function wh(t,e){
var r=e[0],n=e[1],o=e[2],a=e[3],i=r*a-o*n;
return i?(i=1/i,t[0]=a*i,t[1]=-n*i,t[2]=-o*i,t[3]=r*i,t):null
}
function xh(t,e){
var r=e[0];
return t[0]=e[3],t[1]=-e[1],t[2]=-e[2],t[3]=r,t
}
function Ah(t){
return t[0]*t[3]-t[2]*t[1]
}
function ys(t,e,r){
var n=e[0],o=e[1],a=e[2],i=e[3],s=r[0],l=r[1],u=r[2],f=r[3];
return t[0]=n*s+a*l,t[1]=o*s+i*l,t[2]=n*u+a*f,t[3]=o*u+i*f,t
}
function Mh(t,e,r){
var n=e[0],o=e[1],a=e[2],i=e[3],s=Math.sin(r),l=Math.cos(r);
return t[0]=n*l+a*s,t[1]=o*l+i*s,t[2]=n*-s+a*l,t[3]=o*-s+i*l,t
}
function Eh(t,e,r){
var n=e[0],o=e[1],a=e[2],i=e[3],s=r[0],l=r[1];
return t[0]=n*s,t[1]=o*s,t[2]=a*l,t[3]=i*l,t
}
function Ch(t,e){
var r=Math.sin(e),n=Math.cos(e);
return t[0]=n,t[1]=r,t[2]=-r,t[3]=n,t
}
function Sh(t,e){
return t[0]=e[0],t[1]=0,t[2]=0,t[3]=e[1],t
}
function _h(t){
return"mat2("+t[0]+", "+t[1]+", "+t[2]+", "+t[3]+")"
}
function kh(t){
return Math.hypot(t[0],t[1],t[2],t[3])
}
function Nh(t,e,r,n){
return t[2]=n[2]/n[0],r[0]=n[0],r[1]=n[1],r[3]=n[3]-t[2]*r[1],[t,e,r]
}
function Th(t,e,r){
return t[0]=e[0]+r[0],t[1]=e[1]+r[1],t[2]=e[2]+r[2],t[3]=e[3]+r[3],t
}
function vs(t,e,r){
return t[0]=e[0]-r[0],t[1]=e[1]-r[1],t[2]=e[2]-r[2],t[3]=e[3]-r[3],t
}
function Ph(t,e){
return t[0]===e[0]&&t[1]===e[1]&&t[2]===e[2]&&t[3]===e[3]
}
function Ih(t,e){
var r=t[0],n=t[1],o=t[2],a=t[3],i=e[0],s=e[1],l=e[2],u=e[3];
return Math.abs(r-i)<=ct*Math.max(1,Math.abs(r),Math.abs(i))&&Math.abs(n-s)<=ct*Math.max(1,Math.abs(n),Math.abs(s))&&Math.abs(o-l)<=ct*Math.max(1,Math.abs(o),Math.abs(l))&&Math.abs(a-u)<=ct*Math.max(1,Math.abs(a),Math.abs(u))
}
function Bh(t,e,r){
return t[0]=e[0]*r,t[1]=e[1]*r,t[2]=e[2]*r,t[3]=e[3]*r,t
}
function Rh(t,e,r,n){
return t[0]=e[0]+r[0]*n,t[1]=e[1]+r[1]*n,t[2]=e[2]+r[2]*n,t[3]=e[3]+r[3]*n,t
}
var Oh=ys,Dh=vs,Vr={

}
;
nr(Vr,{
add:()=>w0,adjoint:()=>Hh,clone:()=>jh,copy:()=>$h,create:()=>Fh,determinant:()=>Wh,equals:()=>E0,exactEquals:()=>M0,frob:()=>b0,fromQuat:()=>c0,fromQuat2:()=>o0,fromRotation:()=>t0,fromRotationTranslation:()=>xs,fromRotationTranslationScale:()=>s0,fromRotationTranslationScaleOrigin:()=>l0,fromScaling:()=>Kh,fromTranslation:()=>Qh,fromValues:()=>Lh,fromXRotation:()=>e0,fromYRotation:()=>r0,fromZRotation:()=>n0,frustum:()=>u0,getRotation:()=>i0,getScaling:()=>As,getTranslation:()=>a0,identity:()=>bs,invert:()=>Uh,lookAt:()=>g0,mul:()=>C0,multiply:()=>ws,multiplyScalar:()=>x0,multiplyScalarAndAdd:()=>A0,ortho:()=>d0,orthoNO:()=>Es,orthoZO:()=>m0,perspective:()=>f0,perspectiveFromFieldOfView:()=>p0,perspectiveNO:()=>Ms,perspectiveZO:()=>h0,rotate:()=>Vh,rotateX:()=>Zh,rotateY:()=>Xh,rotateZ:()=>Jh,scale:()=>Gh,set:()=>zh,str:()=>v0,sub:()=>S0,subtract:()=>Cs,targetTo:()=>y0,translate:()=>Yh,transpose:()=>qh
}
);
U();
function Fh(){
var t=new At(16);
return At!=Float32Array&&(t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0),t[0]=1,t[5]=1,t[10]=1,t[15]=1,t
}
function jh(t){
var e=new At(16);
return e[0]=t[0],e[1]=t[1],e[2]=t[2],e[3]=t[3],e[4]=t[4],e[5]=t[5],e[6]=t[6],e[7]=t[7],e[8]=t[8],e[9]=t[9],e[10]=t[10],e[11]=t[11],e[12]=t[12],e[13]=t[13],e[14]=t[14],e[15]=t[15],e
}
function $h(t,e){
return t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[3],t[4]=e[4],t[5]=e[5],t[6]=e[6],t[7]=e[7],t[8]=e[8],t[9]=e[9],t[10]=e[10],t[11]=e[11],t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15],t
}
function Lh(t,e,r,n,o,a,i,s,l,u,f,p,g,w,b,h){
var m=new At(16);
return m[0]=t,m[1]=e,m[2]=r,m[3]=n,m[4]=o,m[5]=a,m[6]=i,m[7]=s,m[8]=l,m[9]=u,m[10]=f,m[11]=p,m[12]=g,m[13]=w,m[14]=b,m[15]=h,m
}
function zh(t,e,r,n,o,a,i,s,l,u,f,p,g,w,b,h,m){
return t[0]=e,t[1]=r,t[2]=n,t[3]=o,t[4]=a,t[5]=i,t[6]=s,t[7]=l,t[8]=u,t[9]=f,t[10]=p,t[11]=g,t[12]=w,t[13]=b,t[14]=h,t[15]=m,t
}
function bs(t){
return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=1,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=1,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t
}
function qh(t,e){
if(t===e){
var r=e[1],n=e[2],o=e[3],a=e[6],i=e[7],s=e[11];
t[1]=e[4],t[2]=e[8],t[3]=e[12],t[4]=r,t[6]=e[9],t[7]=e[13],t[8]=n,t[9]=a,t[11]=e[14],t[12]=o,t[13]=i,t[14]=s
}
else t[0]=e[0],t[1]=e[4],t[2]=e[8],t[3]=e[12],t[4]=e[1],t[5]=e[5],t[6]=e[9],t[7]=e[13],t[8]=e[2],t[9]=e[6],t[10]=e[10],t[11]=e[14],t[12]=e[3],t[13]=e[7],t[14]=e[11],t[15]=e[15];
return t
}
function Uh(t,e){
var r=e[0],n=e[1],o=e[2],a=e[3],i=e[4],s=e[5],l=e[6],u=e[7],f=e[8],p=e[9],g=e[10],w=e[11],b=e[12],h=e[13],m=e[14],v=e[15],x=r*s-n*i,k=r*l-o*i,N=r*u-a*i,_=n*l-o*s,I=n*u-a*s,z=o*u-a*l,R=f*h-p*b,M=f*m-g*b,C=f*v-w*b,E=p*m-g*h,q=p*v-w*h,Y=g*v-w*m,G=x*Y-k*q+N*E+_*C-I*M+z*R;
return G?(G=1/G,t[0]=(s*Y-l*q+u*E)*G,t[1]=(o*q-n*Y-a*E)*G,t[2]=(h*z-m*I+v*_)*G,t[3]=(g*I-p*z-w*_)*G,t[4]=(l*C-i*Y-u*M)*G,t[5]=(r*Y-o*C+a*M)*G,t[6]=(m*N-b*z-v*k)*G,t[7]=(f*z-g*N+w*k)*G,t[8]=(i*q-s*C+u*R)*G,t[9]=(n*C-r*q-a*R)*G,t[10]=(b*I-h*N+v*x)*G,t[11]=(p*N-f*I-w*x)*G,t[12]=(s*M-i*E-l*R)*G,t[13]=(r*E-n*M+o*R)*G,t[14]=(h*k-b*_-m*x)*G,t[15]=(f*_-p*k+g*x)*G,t):null
}
function Hh(t,e){
var r=e[0],n=e[1],o=e[2],a=e[3],i=e[4],s=e[5],l=e[6],u=e[7],f=e[8],p=e[9],g=e[10],w=e[11],b=e[12],h=e[13],m=e[14],v=e[15];
return t[0]=s*(g*v-w*m)-p*(l*v-u*m)+h*(l*w-u*g),t[1]=-(n*(g*v-w*m)-p*(o*v-a*m)+h*(o*w-a*g)),t[2]=n*(l*v-u*m)-s*(o*v-a*m)+h*(o*u-a*l),t[3]=-(n*(l*w-u*g)-s*(o*w-a*g)+p*(o*u-a*l)),t[4]=-(i*(g*v-w*m)-f*(l*v-u*m)+b*(l*w-u*g)),t[5]=r*(g*v-w*m)-f*(o*v-a*m)+b*(o*w-a*g),t[6]=-(r*(l*v-u*m)-i*(o*v-a*m)+b*(o*u-a*l)),t[7]=r*(l*w-u*g)-i*(o*w-a*g)+f*(o*u-a*l),t[8]=i*(p*v-w*h)-f*(s*v-u*h)+b*(s*w-u*p),t[9]=-(r*(p*v-w*h)-f*(n*v-a*h)+b*(n*w-a*p)),t[10]=r*(s*v-u*h)-i*(n*v-a*h)+b*(n*u-a*s),t[11]=-(r*(s*w-u*p)-i*(n*w-a*p)+f*(n*u-a*s)),t[12]=-(i*(p*m-g*h)-f*(s*m-l*h)+b*(s*g-l*p)),t[13]=r*(p*m-g*h)-f*(n*m-o*h)+b*(n*g-o*p),t[14]=-(r*(s*m-l*h)-i*(n*m-o*h)+b*(n*l-o*s)),t[15]=r*(s*g-l*p)-i*(n*g-o*p)+f*(n*l-o*s),t
}
function Wh(t){
var e=t[0],r=t[1],n=t[2],o=t[3],a=t[4],i=t[5],s=t[6],l=t[7],u=t[8],f=t[9],p=t[10],g=t[11],w=t[12],b=t[13],h=t[14],m=t[15],v=e*i-r*a,x=e*s-n*a,k=e*l-o*a,N=r*s-n*i,_=r*l-o*i,I=n*l-o*s,z=u*b-f*w,R=u*h-p*w,M=u*m-g*w,C=f*h-p*b,E=f*m-g*b,q=p*m-g*h;
return v*q-x*E+k*C+N*M-_*R+I*z
}
function ws(t,e,r){
var n=e[0],o=e[1],a=e[2],i=e[3],s=e[4],l=e[5],u=e[6],f=e[7],p=e[8],g=e[9],w=e[10],b=e[11],h=e[12],m=e[13],v=e[14],x=e[15],k=r[0],N=r[1],_=r[2],I=r[3];
return t[0]=k*n+N*s+_*p+I*h,t[1]=k*o+N*l+_*g+I*m,t[2]=k*a+N*u+_*w+I*v,t[3]=k*i+N*f+_*b+I*x,k=r[4],N=r[5],_=r[6],I=r[7],t[4]=k*n+N*s+_*p+I*h,t[5]=k*o+N*l+_*g+I*m,t[6]=k*a+N*u+_*w+I*v,t[7]=k*i+N*f+_*b+I*x,k=r[8],N=r[9],_=r[10],I=r[11],t[8]=k*n+N*s+_*p+I*h,t[9]=k*o+N*l+_*g+I*m,t[10]=k*a+N*u+_*w+I*v,t[11]=k*i+N*f+_*b+I*x,k=r[12],N=r[13],_=r[14],I=r[15],t[12]=k*n+N*s+_*p+I*h,t[13]=k*o+N*l+_*g+I*m,t[14]=k*a+N*u+_*w+I*v,t[15]=k*i+N*f+_*b+I*x,t
}
function Yh(t,e,r){
var n=r[0],o=r[1],a=r[2],i,s,l,u,f,p,g,w,b,h,m,v;
return e===t?(t[12]=e[0]*n+e[4]*o+e[8]*a+e[12],t[13]=e[1]*n+e[5]*o+e[9]*a+e[13],t[14]=e[2]*n+e[6]*o+e[10]*a+e[14],t[15]=e[3]*n+e[7]*o+e[11]*a+e[15]):(i=e[0],s=e[1],l=e[2],u=e[3],f=e[4],p=e[5],g=e[6],w=e[7],b=e[8],h=e[9],m=e[10],v=e[11],t[0]=i,t[1]=s,t[2]=l,t[3]=u,t[4]=f,t[5]=p,t[6]=g,t[7]=w,t[8]=b,t[9]=h,t[10]=m,t[11]=v,t[12]=i*n+f*o+b*a+e[12],t[13]=s*n+p*o+h*a+e[13],t[14]=l*n+g*o+m*a+e[14],t[15]=u*n+w*o+v*a+e[15]),t
}
function Gh(t,e,r){
var n=r[0],o=r[1],a=r[2];
return t[0]=e[0]*n,t[1]=e[1]*n,t[2]=e[2]*n,t[3]=e[3]*n,t[4]=e[4]*o,t[5]=e[5]*o,t[6]=e[6]*o,t[7]=e[7]*o,t[8]=e[8]*a,t[9]=e[9]*a,t[10]=e[10]*a,t[11]=e[11]*a,t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15],t
}
function Vh(t,e,r,n){
var o=n[0],a=n[1],i=n[2],s=Math.hypot(o,a,i),l,u,f,p,g,w,b,h,m,v,x,k,N,_,I,z,R,M,C,E,q,Y,G,j;
return s<ct?null:(s=1/s,o*=s,a*=s,i*=s,l=Math.sin(r),u=Math.cos(r),f=1-u,p=e[0],g=e[1],w=e[2],b=e[3],h=e[4],m=e[5],v=e[6],x=e[7],k=e[8],N=e[9],_=e[10],I=e[11],z=o*o*f+u,R=a*o*f+i*l,M=i*o*f-a*l,C=o*a*f-i*l,E=a*a*f+u,q=i*a*f+o*l,Y=o*i*f+a*l,G=a*i*f-o*l,j=i*i*f+u,t[0]=p*z+h*R+k*M,t[1]=g*z+m*R+N*M,t[2]=w*z+v*R+_*M,t[3]=b*z+x*R+I*M,t[4]=p*C+h*E+k*q,t[5]=g*C+m*E+N*q,t[6]=w*C+v*E+_*q,t[7]=b*C+x*E+I*q,t[8]=p*Y+h*G+k*j,t[9]=g*Y+m*G+N*j,t[10]=w*Y+v*G+_*j,t[11]=b*Y+x*G+I*j,e!==t&&(t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15]),t)
}
function Zh(t,e,r){
var n=Math.sin(r),o=Math.cos(r),a=e[4],i=e[5],s=e[6],l=e[7],u=e[8],f=e[9],p=e[10],g=e[11];
return e!==t&&(t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[3],t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15]),t[4]=a*o+u*n,t[5]=i*o+f*n,t[6]=s*o+p*n,t[7]=l*o+g*n,t[8]=u*o-a*n,t[9]=f*o-i*n,t[10]=p*o-s*n,t[11]=g*o-l*n,t
}
function Xh(t,e,r){
var n=Math.sin(r),o=Math.cos(r),a=e[0],i=e[1],s=e[2],l=e[3],u=e[8],f=e[9],p=e[10],g=e[11];
return e!==t&&(t[4]=e[4],t[5]=e[5],t[6]=e[6],t[7]=e[7],t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15]),t[0]=a*o-u*n,t[1]=i*o-f*n,t[2]=s*o-p*n,t[3]=l*o-g*n,t[8]=a*n+u*o,t[9]=i*n+f*o,t[10]=s*n+p*o,t[11]=l*n+g*o,t
}
function Jh(t,e,r){
var n=Math.sin(r),o=Math.cos(r),a=e[0],i=e[1],s=e[2],l=e[3],u=e[4],f=e[5],p=e[6],g=e[7];
return e!==t&&(t[8]=e[8],t[9]=e[9],t[10]=e[10],t[11]=e[11],t[12]=e[12],t[13]=e[13],t[14]=e[14],t[15]=e[15]),t[0]=a*o+u*n,t[1]=i*o+f*n,t[2]=s*o+p*n,t[3]=l*o+g*n,t[4]=u*o-a*n,t[5]=f*o-i*n,t[6]=p*o-s*n,t[7]=g*o-l*n,t
}
function Qh(t,e){
return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=1,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=1,t[11]=0,t[12]=e[0],t[13]=e[1],t[14]=e[2],t[15]=1,t
}
function Kh(t,e){
return t[0]=e[0],t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=e[1],t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=e[2],t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t
}
function t0(t,e,r){
var n=r[0],o=r[1],a=r[2],i=Math.hypot(n,o,a),s,l,u;
return i<ct?null:(i=1/i,n*=i,o*=i,a*=i,s=Math.sin(e),l=Math.cos(e),u=1-l,t[0]=n*n*u+l,t[1]=o*n*u+a*s,t[2]=a*n*u-o*s,t[3]=0,t[4]=n*o*u-a*s,t[5]=o*o*u+l,t[6]=a*o*u+n*s,t[7]=0,t[8]=n*a*u+o*s,t[9]=o*a*u-n*s,t[10]=a*a*u+l,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t)
}
function e0(t,e){
var r=Math.sin(e),n=Math.cos(e);
return t[0]=1,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=n,t[6]=r,t[7]=0,t[8]=0,t[9]=-r,t[10]=n,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t
}
function r0(t,e){
var r=Math.sin(e),n=Math.cos(e);
return t[0]=n,t[1]=0,t[2]=-r,t[3]=0,t[4]=0,t[5]=1,t[6]=0,t[7]=0,t[8]=r,t[9]=0,t[10]=n,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t
}
function n0(t,e){
var r=Math.sin(e),n=Math.cos(e);
return t[0]=n,t[1]=r,t[2]=0,t[3]=0,t[4]=-r,t[5]=n,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=1,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t
}
function xs(t,e,r){
var n=e[0],o=e[1],a=e[2],i=e[3],s=n+n,l=o+o,u=a+a,f=n*s,p=n*l,g=n*u,w=o*l,b=o*u,h=a*u,m=i*s,v=i*l,x=i*u;
return t[0]=1-(w+h),t[1]=p+x,t[2]=g-v,t[3]=0,t[4]=p-x,t[5]=1-(f+h),t[6]=b+m,t[7]=0,t[8]=g+v,t[9]=b-m,t[10]=1-(f+w),t[11]=0,t[12]=r[0],t[13]=r[1],t[14]=r[2],t[15]=1,t
}
function o0(t,e){
var r=new At(3),n=-e[0],o=-e[1],a=-e[2],i=e[3],s=e[4],l=e[5],u=e[6],f=e[7],p=n*n+o*o+a*a+i*i;
return p>0?(r[0]=(s*i+f*n+l*a-u*o)*2/p,r[1]=(l*i+f*o+u*n-s*a)*2/p,r[2]=(u*i+f*a+s*o-l*n)*2/p):(r[0]=(s*i+f*n+l*a-u*o)*2,r[1]=(l*i+f*o+u*n-s*a)*2,r[2]=(u*i+f*a+s*o-l*n)*2),xs(t,e,r),t
}
function a0(t,e){
return t[0]=e[12],t[1]=e[13],t[2]=e[14],t
}
function As(t,e){
var r=e[0],n=e[1],o=e[2],a=e[4],i=e[5],s=e[6],l=e[8],u=e[9],f=e[10];
return t[0]=Math.hypot(r,n,o),t[1]=Math.hypot(a,i,s),t[2]=Math.hypot(l,u,f),t
}
function i0(t,e){
var r=new At(3);
As(r,e);
var n=1/r[0],o=1/r[1],a=1/r[2],i=e[0]*n,s=e[1]*o,l=e[2]*a,u=e[4]*n,f=e[5]*o,p=e[6]*a,g=e[8]*n,w=e[9]*o,b=e[10]*a,h=i+f+b,m=0;
return h>0?(m=Math.sqrt(h+1)*2,t[3]=.25*m,t[0]=(p-w)/m,t[1]=(g-l)/m,t[2]=(s-u)/m):i>f&&i>b?(m=Math.sqrt(1+i-f-b)*2,t[3]=(p-w)/m,t[0]=.25*m,t[1]=(s+u)/m,t[2]=(g+l)/m):f>b?(m=Math.sqrt(1+f-i-b)*2,t[3]=(g-l)/m,t[0]=(s+u)/m,t[1]=.25*m,t[2]=(p+w)/m):(m=Math.sqrt(1+b-i-f)*2,t[3]=(s-u)/m,t[0]=(g+l)/m,t[1]=(p+w)/m,t[2]=.25*m),t
}
function s0(t,e,r,n){
var o=e[0],a=e[1],i=e[2],s=e[3],l=o+o,u=a+a,f=i+i,p=o*l,g=o*u,w=o*f,b=a*u,h=a*f,m=i*f,v=s*l,x=s*u,k=s*f,N=n[0],_=n[1],I=n[2];
return t[0]=(1-(b+m))*N,t[1]=(g+k)*N,t[2]=(w-x)*N,t[3]=0,t[4]=(g-k)*_,t[5]=(1-(p+m))*_,t[6]=(h+v)*_,t[7]=0,t[8]=(w+x)*I,t[9]=(h-v)*I,t[10]=(1-(p+b))*I,t[11]=0,t[12]=r[0],t[13]=r[1],t[14]=r[2],t[15]=1,t
}
function l0(t,e,r,n,o){
var a=e[0],i=e[1],s=e[2],l=e[3],u=a+a,f=i+i,p=s+s,g=a*u,w=a*f,b=a*p,h=i*f,m=i*p,v=s*p,x=l*u,k=l*f,N=l*p,_=n[0],I=n[1],z=n[2],R=o[0],M=o[1],C=o[2],E=(1-(h+v))*_,q=(w+N)*_,Y=(b-k)*_,G=(w-N)*I,j=(1-(g+v))*I,H=(m+x)*I,T=(b+k)*z,F=(m-x)*z,$=(1-(g+h))*z;
return t[0]=E,t[1]=q,t[2]=Y,t[3]=0,t[4]=G,t[5]=j,t[6]=H,t[7]=0,t[8]=T,t[9]=F,t[10]=$,t[11]=0,t[12]=r[0]+R-(E*R+G*M+T*C),t[13]=r[1]+M-(q*R+j*M+F*C),t[14]=r[2]+C-(Y*R+H*M+$*C),t[15]=1,t
}
function c0(t,e){
var r=e[0],n=e[1],o=e[2],a=e[3],i=r+r,s=n+n,l=o+o,u=r*i,f=n*i,p=n*s,g=o*i,w=o*s,b=o*l,h=a*i,m=a*s,v=a*l;
return t[0]=1-p-b,t[1]=f+v,t[2]=g-m,t[3]=0,t[4]=f-v,t[5]=1-u-b,t[6]=w+h,t[7]=0,t[8]=g+m,t[9]=w-h,t[10]=1-u-p,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,t
}
function u0(t,e,r,n,o,a,i){
var s=1/(r-e),l=1/(o-n),u=1/(a-i);
return t[0]=a*2*s,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=a*2*l,t[6]=0,t[7]=0,t[8]=(r+e)*s,t[9]=(o+n)*l,t[10]=(i+a)*u,t[11]=-1,t[12]=0,t[13]=0,t[14]=i*a*2*u,t[15]=0,t
}
function Ms(t,e,r,n,o){
var a=1/Math.tan(e/2),i;
return t[0]=a/r,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=a,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[11]=-1,t[12]=0,t[13]=0,t[15]=0,o!=null&&o!==1/0?(i=1/(n-o),t[10]=(o+n)*i,t[14]=2*o*n*i):(t[10]=-1,t[14]=-2*n),t
}
var f0=Ms;
function h0(t,e,r,n,o){
var a=1/Math.tan(e/2),i;
return t[0]=a/r,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=a,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[11]=-1,t[12]=0,t[13]=0,t[15]=0,o!=null&&o!==1/0?(i=1/(n-o),t[10]=o*i,t[14]=o*n*i):(t[10]=-1,t[14]=-n),t
}
function p0(t,e,r,n){
var o=Math.tan(e.upDegrees*Math.PI/180),a=Math.tan(e.downDegrees*Math.PI/180),i=Math.tan(e.leftDegrees*Math.PI/180),s=Math.tan(e.rightDegrees*Math.PI/180),l=2/(i+s),u=2/(o+a);
return t[0]=l,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=u,t[6]=0,t[7]=0,t[8]=-((i-s)*l*.5),t[9]=(o-a)*u*.5,t[10]=n/(r-n),t[11]=-1,t[12]=0,t[13]=0,t[14]=n*r/(r-n),t[15]=0,t
}
function Es(t,e,r,n,o,a,i){
var s=1/(e-r),l=1/(n-o),u=1/(a-i);
return t[0]=-2*s,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=-2*l,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=2*u,t[11]=0,t[12]=(e+r)*s,t[13]=(o+n)*l,t[14]=(i+a)*u,t[15]=1,t
}
var d0=Es;
function m0(t,e,r,n,o,a,i){
var s=1/(e-r),l=1/(n-o),u=1/(a-i);
return t[0]=-2*s,t[1]=0,t[2]=0,t[3]=0,t[4]=0,t[5]=-2*l,t[6]=0,t[7]=0,t[8]=0,t[9]=0,t[10]=u,t[11]=0,t[12]=(e+r)*s,t[13]=(o+n)*l,t[14]=a*u,t[15]=1,t
}
function g0(t,e,r,n){
var o,a,i,s,l,u,f,p,g,w,b=e[0],h=e[1],m=e[2],v=n[0],x=n[1],k=n[2],N=r[0],_=r[1],I=r[2];
return Math.abs(b-N)<ct&&Math.abs(h-_)<ct&&Math.abs(m-I)<ct?bs(t):(f=b-N,p=h-_,g=m-I,w=1/Math.hypot(f,p,g),f*=w,p*=w,g*=w,o=x*g-k*p,a=k*f-v*g,i=v*p-x*f,w=Math.hypot(o,a,i),w?(w=1/w,o*=w,a*=w,i*=w):(o=0,a=0,i=0),s=p*i-g*a,l=g*o-f*i,u=f*a-p*o,w=Math.hypot(s,l,u),w?(w=1/w,s*=w,l*=w,u*=w):(s=0,l=0,u=0),t[0]=o,t[1]=s,t[2]=f,t[3]=0,t[4]=a,t[5]=l,t[6]=p,t[7]=0,t[8]=i,t[9]=u,t[10]=g,t[11]=0,t[12]=-(o*b+a*h+i*m),t[13]=-(s*b+l*h+u*m),t[14]=-(f*b+p*h+g*m),t[15]=1,t)
}
function y0(t,e,r,n){
var o=e[0],a=e[1],i=e[2],s=n[0],l=n[1],u=n[2],f=o-r[0],p=a-r[1],g=i-r[2],w=f*f+p*p+g*g;
w>0&&(w=1/Math.sqrt(w),f*=w,p*=w,g*=w);
var b=l*g-u*p,h=u*f-s*g,m=s*p-l*f;
return w=b*b+h*h+m*m,w>0&&(w=1/Math.sqrt(w),b*=w,h*=w,m*=w),t[0]=b,t[1]=h,t[2]=m,t[3]=0,t[4]=p*m-g*h,t[5]=g*b-f*m,t[6]=f*h-p*b,t[7]=0,t[8]=f,t[9]=p,t[10]=g,t[11]=0,t[12]=o,t[13]=a,t[14]=i,t[15]=1,t
}
function v0(t){
return"mat4("+t[0]+", "+t[1]+", "+t[2]+", "+t[3]+", "+t[4]+", "+t[5]+", "+t[6]+", "+t[7]+", "+t[8]+", "+t[9]+", "+t[10]+", "+t[11]+", "+t[12]+", "+t[13]+", "+t[14]+", "+t[15]+")"
}
function b0(t){
return Math.hypot(t[0],t[1],t[2],t[3],t[4],t[5],t[6],t[7],t[8],t[9],t[10],t[11],t[12],t[13],t[14],t[15])
}
function w0(t,e,r){
return t[0]=e[0]+r[0],t[1]=e[1]+r[1],t[2]=e[2]+r[2],t[3]=e[3]+r[3],t[4]=e[4]+r[4],t[5]=e[5]+r[5],t[6]=e[6]+r[6],t[7]=e[7]+r[7],t[8]=e[8]+r[8],t[9]=e[9]+r[9],t[10]=e[10]+r[10],t[11]=e[11]+r[11],t[12]=e[12]+r[12],t[13]=e[13]+r[13],t[14]=e[14]+r[14],t[15]=e[15]+r[15],t
}
function Cs(t,e,r){
return t[0]=e[0]-r[0],t[1]=e[1]-r[1],t[2]=e[2]-r[2],t[3]=e[3]-r[3],t[4]=e[4]-r[4],t[5]=e[5]-r[5],t[6]=e[6]-r[6],t[7]=e[7]-r[7],t[8]=e[8]-r[8],t[9]=e[9]-r[9],t[10]=e[10]-r[10],t[11]=e[11]-r[11],t[12]=e[12]-r[12],t[13]=e[13]-r[13],t[14]=e[14]-r[14],t[15]=e[15]-r[15],t
}
function x0(t,e,r){
return t[0]=e[0]*r,t[1]=e[1]*r,t[2]=e[2]*r,t[3]=e[3]*r,t[4]=e[4]*r,t[5]=e[5]*r,t[6]=e[6]*r,t[7]=e[7]*r,t[8]=e[8]*r,t[9]=e[9]*r,t[10]=e[10]*r,t[11]=e[11]*r,t[12]=e[12]*r,t[13]=e[13]*r,t[14]=e[14]*r,t[15]=e[15]*r,t
}
function A0(t,e,r,n){
return t[0]=e[0]+r[0]*n,t[1]=e[1]+r[1]*n,t[2]=e[2]+r[2]*n,t[3]=e[3]+r[3]*n,t[4]=e[4]+r[4]*n,t[5]=e[5]+r[5]*n,t[6]=e[6]+r[6]*n,t[7]=e[7]+r[7]*n,t[8]=e[8]+r[8]*n,t[9]=e[9]+r[9]*n,t[10]=e[10]+r[10]*n,t[11]=e[11]+r[11]*n,t[12]=e[12]+r[12]*n,t[13]=e[13]+r[13]*n,t[14]=e[14]+r[14]*n,t[15]=e[15]+r[15]*n,t
}
function M0(t,e){
return t[0]===e[0]&&t[1]===e[1]&&t[2]===e[2]&&t[3]===e[3]&&t[4]===e[4]&&t[5]===e[5]&&t[6]===e[6]&&t[7]===e[7]&&t[8]===e[8]&&t[9]===e[9]&&t[10]===e[10]&&t[11]===e[11]&&t[12]===e[12]&&t[13]===e[13]&&t[14]===e[14]&&t[15]===e[15]
}
function E0(t,e){
var r=t[0],n=t[1],o=t[2],a=t[3],i=t[4],s=t[5],l=t[6],u=t[7],f=t[8],p=t[9],g=t[10],w=t[11],b=t[12],h=t[13],m=t[14],v=t[15],x=e[0],k=e[1],N=e[2],_=e[3],I=e[4],z=e[5],R=e[6],M=e[7],C=e[8],E=e[9],q=e[10],Y=e[11],G=e[12],j=e[13],H=e[14],T=e[15];
return Math.abs(r-x)<=ct*Math.max(1,Math.abs(r),Math.abs(x))&&Math.abs(n-k)<=ct*Math.max(1,Math.abs(n),Math.abs(k))&&Math.abs(o-N)<=ct*Math.max(1,Math.abs(o),Math.abs(N))&&Math.abs(a-_)<=ct*Math.max(1,Math.abs(a),Math.abs(_))&&Math.abs(i-I)<=ct*Math.max(1,Math.abs(i),Math.abs(I))&&Math.abs(s-z)<=ct*Math.max(1,Math.abs(s),Math.abs(z))&&Math.abs(l-R)<=ct*Math.max(1,Math.abs(l),Math.abs(R))&&Math.abs(u-M)<=ct*Math.max(1,Math.abs(u),Math.abs(M))&&Math.abs(f-C)<=ct*Math.max(1,Math.abs(f),Math.abs(C))&&Math.abs(p-E)<=ct*Math.max(1,Math.abs(p),Math.abs(E))&&Math.abs(g-q)<=ct*Math.max(1,Math.abs(g),Math.abs(q))&&Math.abs(w-Y)<=ct*Math.max(1,Math.abs(w),Math.abs(Y))&&Math.abs(b-G)<=ct*Math.max(1,Math.abs(b),Math.abs(G))&&Math.abs(h-j)<=ct*Math.max(1,Math.abs(h),Math.abs(j))&&Math.abs(m-H)<=ct*Math.max(1,Math.abs(m),Math.abs(H))&&Math.abs(v-T)<=ct*Math.max(1,Math.abs(v),Math.abs(T))
}
var C0=ws,S0=Cs,Ss={

}
;
nr(Ss,{
add:()=>P0,angle:()=>K0,bezier:()=>W0,ceil:()=>I0,clone:()=>_0,copy:()=>N0,create:()=>_s,cross:()=>q0,dist:()=>s1,distance:()=>Is,div:()=>i1,divide:()=>Ps,dot:()=>Os,equals:()=>n1,exactEquals:()=>r1,floor:()=>B0,forEach:()=>f1,fromValues:()=>k0,hermite:()=>H0,inverse:()=>L0,len:()=>c1,length:()=>ks,lerp:()=>U0,max:()=>O0,min:()=>R0,mul:()=>a1,multiply:()=>Ts,negate:()=>$0,normalize:()=>z0,random:()=>Y0,rotateX:()=>X0,rotateY:()=>J0,rotateZ:()=>Q0,round:()=>D0,scale:()=>F0,scaleAndAdd:()=>j0,set:()=>T0,sqrDist:()=>l1,sqrLen:()=>u1,squaredDistance:()=>Bs,squaredLength:()=>Rs,str:()=>e1,sub:()=>o1,subtract:()=>Ns,transformMat3:()=>V0,transformMat4:()=>G0,transformQuat:()=>Z0,zero:()=>t1
}
);
U();
function _s(){
var t=new At(3);
return At!=Float32Array&&(t[0]=0,t[1]=0,t[2]=0),t
}
function _0(t){
var e=new At(3);
return e[0]=t[0],e[1]=t[1],e[2]=t[2],e
}
function ks(t){
var e=t[0],r=t[1],n=t[2];
return Math.hypot(e,r,n)
}
function k0(t,e,r){
var n=new At(3);
return n[0]=t,n[1]=e,n[2]=r,n
}
function N0(t,e){
return t[0]=e[0],t[1]=e[1],t[2]=e[2],t
}
function T0(t,e,r,n){
return t[0]=e,t[1]=r,t[2]=n,t
}
function P0(t,e,r){
return t[0]=e[0]+r[0],t[1]=e[1]+r[1],t[2]=e[2]+r[2],t
}
function Ns(t,e,r){
return t[0]=e[0]-r[0],t[1]=e[1]-r[1],t[2]=e[2]-r[2],t
}
function Ts(t,e,r){
return t[0]=e[0]*r[0],t[1]=e[1]*r[1],t[2]=e[2]*r[2],t
}
function Ps(t,e,r){
return t[0]=e[0]/r[0],t[1]=e[1]/r[1],t[2]=e[2]/r[2],t
}
function I0(t,e){
return t[0]=Math.ceil(e[0]),t[1]=Math.ceil(e[1]),t[2]=Math.ceil(e[2]),t
}
function B0(t,e){
return t[0]=Math.floor(e[0]),t[1]=Math.floor(e[1]),t[2]=Math.floor(e[2]),t
}
function R0(t,e,r){
return t[0]=Math.min(e[0],r[0]),t[1]=Math.min(e[1],r[1]),t[2]=Math.min(e[2],r[2]),t
}
function O0(t,e,r){
return t[0]=Math.max(e[0],r[0]),t[1]=Math.max(e[1],r[1]),t[2]=Math.max(e[2],r[2]),t
}
function D0(t,e){
return t[0]=Math.round(e[0]),t[1]=Math.round(e[1]),t[2]=Math.round(e[2]),t
}
function F0(t,e,r){
return t[0]=e[0]*r,t[1]=e[1]*r,t[2]=e[2]*r,t
}
function j0(t,e,r,n){
return t[0]=e[0]+r[0]*n,t[1]=e[1]+r[1]*n,t[2]=e[2]+r[2]*n,t
}
function Is(t,e){
var r=e[0]-t[0],n=e[1]-t[1],o=e[2]-t[2];
return Math.hypot(r,n,o)
}
function Bs(t,e){
var r=e[0]-t[0],n=e[1]-t[1],o=e[2]-t[2];
return r*r+n*n+o*o
}
function Rs(t){
var e=t[0],r=t[1],n=t[2];
return e*e+r*r+n*n
}
function $0(t,e){
return t[0]=-e[0],t[1]=-e[1],t[2]=-e[2],t
}
function L0(t,e){
return t[0]=1/e[0],t[1]=1/e[1],t[2]=1/e[2],t
}
function z0(t,e){
var r=e[0],n=e[1],o=e[2],a=r*r+n*n+o*o;
return a>0&&(a=1/Math.sqrt(a)),t[0]=e[0]*a,t[1]=e[1]*a,t[2]=e[2]*a,t
}
function Os(t,e){
return t[0]*e[0]+t[1]*e[1]+t[2]*e[2]
}
function q0(t,e,r){
var n=e[0],o=e[1],a=e[2],i=r[0],s=r[1],l=r[2];
return t[0]=o*l-a*s,t[1]=a*i-n*l,t[2]=n*s-o*i,t
}
function U0(t,e,r,n){
var o=e[0],a=e[1],i=e[2];
return t[0]=o+n*(r[0]-o),t[1]=a+n*(r[1]-a),t[2]=i+n*(r[2]-i),t
}
function H0(t,e,r,n,o,a){
var i=a*a,s=i*(2*a-3)+1,l=i*(a-2)+a,u=i*(a-1),f=i*(3-2*a);
return t[0]=e[0]*s+r[0]*l+n[0]*u+o[0]*f,t[1]=e[1]*s+r[1]*l+n[1]*u+o[1]*f,t[2]=e[2]*s+r[2]*l+n[2]*u+o[2]*f,t
}
function W0(t,e,r,n,o,a){
var i=1-a,s=i*i,l=a*a,u=s*i,f=3*a*s,p=3*l*i,g=l*a;
return t[0]=e[0]*u+r[0]*f+n[0]*p+o[0]*g,t[1]=e[1]*u+r[1]*f+n[1]*p+o[1]*g,t[2]=e[2]*u+r[2]*f+n[2]*p+o[2]*g,t
}
function Y0(t,e){
e=e||1;
var r=Se()*2*Math.PI,n=Se()*2-1,o=Math.sqrt(1-n*n)*e;
return t[0]=Math.cos(r)*o,t[1]=Math.sin(r)*o,t[2]=n*e,t
}
function G0(t,e,r){
var n=e[0],o=e[1],a=e[2],i=r[3]*n+r[7]*o+r[11]*a+r[15];
return i=i||1,t[0]=(r[0]*n+r[4]*o+r[8]*a+r[12])/i,t[1]=(r[1]*n+r[5]*o+r[9]*a+r[13])/i,t[2]=(r[2]*n+r[6]*o+r[10]*a+r[14])/i,t
}
function V0(t,e,r){
var n=e[0],o=e[1],a=e[2];
return t[0]=n*r[0]+o*r[3]+a*r[6],t[1]=n*r[1]+o*r[4]+a*r[7],t[2]=n*r[2]+o*r[5]+a*r[8],t
}
function Z0(t,e,r){
var n=r[0],o=r[1],a=r[2],i=r[3],s=e[0],l=e[1],u=e[2],f=o*u-a*l,p=a*s-n*u,g=n*l-o*s,w=o*g-a*p,b=a*f-n*g,h=n*p-o*f,m=i*2;
return f*=m,p*=m,g*=m,w*=2,b*=2,h*=2,t[0]=s+f+w,t[1]=l+p+b,t[2]=u+g+h,t
}
function X0(t,e,r,n){
var o=[],a=[];
return o[0]=e[0]-r[0],o[1]=e[1]-r[1],o[2]=e[2]-r[2],a[0]=o[0],a[1]=o[1]*Math.cos(n)-o[2]*Math.sin(n),a[2]=o[1]*Math.sin(n)+o[2]*Math.cos(n),t[0]=a[0]+r[0],t[1]=a[1]+r[1],t[2]=a[2]+r[2],t
}
function J0(t,e,r,n){
var o=[],a=[];
return o[0]=e[0]-r[0],o[1]=e[1]-r[1],o[2]=e[2]-r[2],a[0]=o[2]*Math.sin(n)+o[0]*Math.cos(n),a[1]=o[1],a[2]=o[2]*Math.cos(n)-o[0]*Math.sin(n),t[0]=a[0]+r[0],t[1]=a[1]+r[1],t[2]=a[2]+r[2],t
}
function Q0(t,e,r,n){
var o=[],a=[];
return o[0]=e[0]-r[0],o[1]=e[1]-r[1],o[2]=e[2]-r[2],a[0]=o[0]*Math.cos(n)-o[1]*Math.sin(n),a[1]=o[0]*Math.sin(n)+o[1]*Math.cos(n),a[2]=o[2],t[0]=a[0]+r[0],t[1]=a[1]+r[1],t[2]=a[2]+r[2],t
}
function K0(t,e){
var r=t[0],n=t[1],o=t[2],a=e[0],i=e[1],s=e[2],l=Math.sqrt(r*r+n*n+o*o),u=Math.sqrt(a*a+i*i+s*s),f=l*u,p=f&&Os(t,e)/f;
return Math.acos(Math.min(Math.max(p,-1),1))
}
function t1(t){
return t[0]=0,t[1]=0,t[2]=0,t
}
function e1(t){
return"vec3("+t[0]+", "+t[1]+", "+t[2]+")"
}
function r1(t,e){
return t[0]===e[0]&&t[1]===e[1]&&t[2]===e[2]
}
function n1(t,e){
var r=t[0],n=t[1],o=t[2],a=e[0],i=e[1],s=e[2];
return Math.abs(r-a)<=ct*Math.max(1,Math.abs(r),Math.abs(a))&&Math.abs(n-i)<=ct*Math.max(1,Math.abs(n),Math.abs(i))&&Math.abs(o-s)<=ct*Math.max(1,Math.abs(o),Math.abs(s))
}
var o1=Ns,a1=Ts,i1=Ps,s1=Is,l1=Bs,c1=ks,u1=Rs,f1=function(){
var t=_s();
return function(e,r,n,o,a,i){
var s,l;
for(r||(r=3),n||(n=0),o?l=Math.min(o*r+n,e.length):l=e.length,s=n;
s<l;
s+=r)t[0]=e[s],t[1]=e[s+1],t[2]=e[s+2],a(t,t,i),e[s]=t[0],e[s+1]=t[1],e[s+2]=t[2];
return e
}

}
(),Ao={

}
;
nr(Ao,{
add:()=>g1,ceil:()=>y1,clone:()=>h1,copy:()=>d1,create:()=>Ds,cross:()=>k1,dist:()=>L1,distance:()=>Ls,div:()=>$1,divide:()=>$s,dot:()=>_1,equals:()=>D1,exactEquals:()=>O1,floor:()=>v1,forEach:()=>H1,fromValues:()=>p1,inverse:()=>C1,len:()=>q1,length:()=>qs,lerp:()=>N1,max:()=>w1,min:()=>b1,mul:()=>j1,multiply:()=>js,negate:()=>E1,normalize:()=>S1,random:()=>T1,round:()=>x1,scale:()=>A1,scaleAndAdd:()=>M1,set:()=>m1,sqrDist:()=>z1,sqrLen:()=>U1,squaredDistance:()=>zs,squaredLength:()=>Us,str:()=>R1,sub:()=>F1,subtract:()=>Fs,transformMat4:()=>P1,transformQuat:()=>I1,zero:()=>B1
}
);
U();
function Ds(){
var t=new At(4);
return At!=Float32Array&&(t[0]=0,t[1]=0,t[2]=0,t[3]=0),t
}
function h1(t){
var e=new At(4);
return e[0]=t[0],e[1]=t[1],e[2]=t[2],e[3]=t[3],e
}
function p1(t,e,r,n){
var o=new At(4);
return o[0]=t,o[1]=e,o[2]=r,o[3]=n,o
}
function d1(t,e){
return t[0]=e[0],t[1]=e[1],t[2]=e[2],t[3]=e[3],t
}
function m1(t,e,r,n,o){
return t[0]=e,t[1]=r,t[2]=n,t[3]=o,t
}
function g1(t,e,r){
return t[0]=e[0]+r[0],t[1]=e[1]+r[1],t[2]=e[2]+r[2],t[3]=e[3]+r[3],t
}
function Fs(t,e,r){
return t[0]=e[0]-r[0],t[1]=e[1]-r[1],t[2]=e[2]-r[2],t[3]=e[3]-r[3],t
}
function js(t,e,r){
return t[0]=e[0]*r[0],t[1]=e[1]*r[1],t[2]=e[2]*r[2],t[3]=e[3]*r[3],t
}
function $s(t,e,r){
return t[0]=e[0]/r[0],t[1]=e[1]/r[1],t[2]=e[2]/r[2],t[3]=e[3]/r[3],t
}
function y1(t,e){
return t[0]=Math.ceil(e[0]),t[1]=Math.ceil(e[1]),t[2]=Math.ceil(e[2]),t[3]=Math.ceil(e[3]),t
}
function v1(t,e){
return t[0]=Math.floor(e[0]),t[1]=Math.floor(e[1]),t[2]=Math.floor(e[2]),t[3]=Math.floor(e[3]),t
}
function b1(t,e,r){
return t[0]=Math.min(e[0],r[0]),t[1]=Math.min(e[1],r[1]),t[2]=Math.min(e[2],r[2]),t[3]=Math.min(e[3],r[3]),t
}
function w1(t,e,r){
return t[0]=Math.max(e[0],r[0]),t[1]=Math.max(e[1],r[1]),t[2]=Math.max(e[2],r[2]),t[3]=Math.max(e[3],r[3]),t
}
function x1(t,e){
return t[0]=Math.round(e[0]),t[1]=Math.round(e[1]),t[2]=Math.round(e[2]),t[3]=Math.round(e[3]),t
}
function A1(t,e,r){
return t[0]=e[0]*r,t[1]=e[1]*r,t[2]=e[2]*r,t[3]=e[3]*r,t
}
function M1(t,e,r,n){
return t[0]=e[0]+r[0]*n,t[1]=e[1]+r[1]*n,t[2]=e[2]+r[2]*n,t[3]=e[3]+r[3]*n,t
}
function Ls(t,e){
var r=e[0]-t[0],n=e[1]-t[1],o=e[2]-t[2],a=e[3]-t[3];
return Math.hypot(r,n,o,a)
}
function zs(t,e){
var r=e[0]-t[0],n=e[1]-t[1],o=e[2]-t[2],a=e[3]-t[3];
return r*r+n*n+o*o+a*a
}
function qs(t){
var e=t[0],r=t[1],n=t[2],o=t[3];
return Math.hypot(e,r,n,o)
}
function Us(t){
var e=t[0],r=t[1],n=t[2],o=t[3];
return e*e+r*r+n*n+o*o
}
function E1(t,e){
return t[0]=-e[0],t[1]=-e[1],t[2]=-e[2],t[3]=-e[3],t
}
function C1(t,e){
return t[0]=1/e[0],t[1]=1/e[1],t[2]=1/e[2],t[3]=1/e[3],t
}
function S1(t,e){
var r=e[0],n=e[1],o=e[2],a=e[3],i=r*r+n*n+o*o+a*a;
return i>0&&(i=1/Math.sqrt(i)),t[0]=r*i,t[1]=n*i,t[2]=o*i,t[3]=a*i,t
}
function _1(t,e){
return t[0]*e[0]+t[1]*e[1]+t[2]*e[2]+t[3]*e[3]
}
function k1(t,e,r,n){
var o=r[0]*n[1]-r[1]*n[0],a=r[0]*n[2]-r[2]*n[0],i=r[0]*n[3]-r[3]*n[0],s=r[1]*n[2]-r[2]*n[1],l=r[1]*n[3]-r[3]*n[1],u=r[2]*n[3]-r[3]*n[2],f=e[0],p=e[1],g=e[2],w=e[3];
return t[0]=p*u-g*l+w*s,t[1]=-(f*u)+g*i-w*a,t[2]=f*l-p*i+w*o,t[3]=-(f*s)+p*a-g*o,t
}
function N1(t,e,r,n){
var o=e[0],a=e[1],i=e[2],s=e[3];
return t[0]=o+n*(r[0]-o),t[1]=a+n*(r[1]-a),t[2]=i+n*(r[2]-i),t[3]=s+n*(r[3]-s),t
}
function T1(t,e){
e=e||1;
var r,n,o,a,i,s;
do r=Se()*2-1,n=Se()*2-1,i=r*r+n*n;
while(i>=1);
do o=Se()*2-1,a=Se()*2-1,s=o*o+a*a;
while(s>=1);
var l=Math.sqrt((1-i)/s);
return t[0]=e*r,t[1]=e*n,t[2]=e*o*l,t[3]=e*a*l,t
}
function P1(t,e,r){
var n=e[0],o=e[1],a=e[2],i=e[3];
return t[0]=r[0]*n+r[4]*o+r[8]*a+r[12]*i,t[1]=r[1]*n+r[5]*o+r[9]*a+r[13]*i,t[2]=r[2]*n+r[6]*o+r[10]*a+r[14]*i,t[3]=r[3]*n+r[7]*o+r[11]*a+r[15]*i,t
}
function I1(t,e,r){
var n=e[0],o=e[1],a=e[2],i=r[0],s=r[1],l=r[2],u=r[3],f=u*n+s*a-l*o,p=u*o+l*n-i*a,g=u*a+i*o-s*n,w=-i*n-s*o-l*a;
return t[0]=f*u+w*-i+p*-l-g*-s,t[1]=p*u+w*-s+g*-i-f*-l,t[2]=g*u+w*-l+f*-s-p*-i,t[3]=e[3],t
}
function B1(t){
return t[0]=0,t[1]=0,t[2]=0,t[3]=0,t
}
function R1(t){
return"vec4("+t[0]+", "+t[1]+", "+t[2]+", "+t[3]+")"
}
function O1(t,e){
return t[0]===e[0]&&t[1]===e[1]&&t[2]===e[2]&&t[3]===e[3]
}
function D1(t,e){
var r=t[0],n=t[1],o=t[2],a=t[3],i=e[0],s=e[1],l=e[2],u=e[3];
return Math.abs(r-i)<=ct*Math.max(1,Math.abs(r),Math.abs(i))&&Math.abs(n-s)<=ct*Math.max(1,Math.abs(n),Math.abs(s))&&Math.abs(o-l)<=ct*Math.max(1,Math.abs(o),Math.abs(l))&&Math.abs(a-u)<=ct*Math.max(1,Math.abs(a),Math.abs(u))
}
var F1=Fs,j1=js,$1=$s,L1=Ls,z1=zs,q1=qs,U1=Us,H1=function(){
var t=Ds();
return function(e,r,n,o,a,i){
var s,l;
for(r||(r=4),n||(n=0),o?l=Math.min(o*r+n,e.length):l=e.length,s=n;
s<l;
s+=r)t[0]=e[s],t[1]=e[s+1],t[2]=e[s+2],t[3]=e[s+3],a(t,t,i),e[s]=t[0],e[s+1]=t[1],e[s+2]=t[2],e[s+3]=t[3];
return e
}

}
(),Hs={

}
;
nr(Hs,{
add:()=>Z1,angle:()=>mp,ceil:()=>X1,clone:()=>W1,copy:()=>G1,create:()=>Ws,cross:()=>sp,dist:()=>Ep,distance:()=>Zs,div:()=>Mp,divide:()=>Vs,dot:()=>ip,equals:()=>bp,exactEquals:()=>vp,floor:()=>J1,forEach:()=>_p,fromValues:()=>Y1,inverse:()=>op,len:()=>wp,length:()=>Js,lerp:()=>lp,max:()=>K1,min:()=>Q1,mul:()=>Ap,multiply:()=>Gs,negate:()=>np,normalize:()=>ap,random:()=>cp,rotate:()=>dp,round:()=>tp,scale:()=>ep,scaleAndAdd:()=>rp,set:()=>V1,sqrDist:()=>Cp,sqrLen:()=>Sp,squaredDistance:()=>Xs,squaredLength:()=>Qs,str:()=>yp,sub:()=>xp,subtract:()=>Ys,transformMat2:()=>up,transformMat2d:()=>fp,transformMat3:()=>hp,transformMat4:()=>pp,zero:()=>gp
}
);
U();
function Ws(){
var t=new At(2);
return At!=Float32Array&&(t[0]=0,t[1]=0),t
}
function W1(t){
var e=new At(2);
return e[0]=t[0],e[1]=t[1],e
}
function Y1(t,e){
var r=new At(2);
return r[0]=t,r[1]=e,r
}
function G1(t,e){
return t[0]=e[0],t[1]=e[1],t
}
function V1(t,e,r){
return t[0]=e,t[1]=r,t
}
function Z1(t,e,r){
return t[0]=e[0]+r[0],t[1]=e[1]+r[1],t
}
function Ys(t,e,r){
return t[0]=e[0]-r[0],t[1]=e[1]-r[1],t
}
function Gs(t,e,r){
return t[0]=e[0]*r[0],t[1]=e[1]*r[1],t
}
function Vs(t,e,r){
return t[0]=e[0]/r[0],t[1]=e[1]/r[1],t
}
function X1(t,e){
return t[0]=Math.ceil(e[0]),t[1]=Math.ceil(e[1]),t
}
function J1(t,e){
return t[0]=Math.floor(e[0]),t[1]=Math.floor(e[1]),t
}
function Q1(t,e,r){
return t[0]=Math.min(e[0],r[0]),t[1]=Math.min(e[1],r[1]),t
}
function K1(t,e,r){
return t[0]=Math.max(e[0],r[0]),t[1]=Math.max(e[1],r[1]),t
}
function tp(t,e){
return t[0]=Math.round(e[0]),t[1]=Math.round(e[1]),t
}
function ep(t,e,r){
return t[0]=e[0]*r,t[1]=e[1]*r,t
}
function rp(t,e,r,n){
return t[0]=e[0]+r[0]*n,t[1]=e[1]+r[1]*n,t
}
function Zs(t,e){
var r=e[0]-t[0],n=e[1]-t[1];
return Math.hypot(r,n)
}
function Xs(t,e){
var r=e[0]-t[0],n=e[1]-t[1];
return r*r+n*n
}
function Js(t){
var e=t[0],r=t[1];
return Math.hypot(e,r)
}
function Qs(t){
var e=t[0],r=t[1];
return e*e+r*r
}
function np(t,e){
return t[0]=-e[0],t[1]=-e[1],t
}
function op(t,e){
return t[0]=1/e[0],t[1]=1/e[1],t
}
function ap(t,e){
var r=e[0],n=e[1],o=r*r+n*n;
return o>0&&(o=1/Math.sqrt(o)),t[0]=e[0]*o,t[1]=e[1]*o,t
}
function ip(t,e){
return t[0]*e[0]+t[1]*e[1]
}
function sp(t,e,r){
var n=e[0]*r[1]-e[1]*r[0];
return t[0]=t[1]=0,t[2]=n,t
}
function lp(t,e,r,n){
var o=e[0],a=e[1];
return t[0]=o+n*(r[0]-o),t[1]=a+n*(r[1]-a),t
}
function cp(t,e){
e=e||1;
var r=Se()*2*Math.PI;
return t[0]=Math.cos(r)*e,t[1]=Math.sin(r)*e,t
}
function up(t,e,r){
var n=e[0],o=e[1];
return t[0]=r[0]*n+r[2]*o,t[1]=r[1]*n+r[3]*o,t
}
function fp(t,e,r){
var n=e[0],o=e[1];
return t[0]=r[0]*n+r[2]*o+r[4],t[1]=r[1]*n+r[3]*o+r[5],t
}
function hp(t,e,r){
var n=e[0],o=e[1];
return t[0]=r[0]*n+r[3]*o+r[6],t[1]=r[1]*n+r[4]*o+r[7],t
}
function pp(t,e,r){
var n=e[0],o=e[1];
return t[0]=r[0]*n+r[4]*o+r[12],t[1]=r[1]*n+r[5]*o+r[13],t
}
function dp(t,e,r,n){
var o=e[0]-r[0],a=e[1]-r[1],i=Math.sin(n),s=Math.cos(n);
return t[0]=o*s-a*i+r[0],t[1]=o*i+a*s+r[1],t
}
function mp(t,e){
var r=t[0],n=t[1],o=e[0],a=e[1],i=Math.sqrt(r*r+n*n)*Math.sqrt(o*o+a*a),s=i&&(r*o+n*a)/i;
return Math.acos(Math.min(Math.max(s,-1),1))
}
function gp(t){
return t[0]=0,t[1]=0,t
}
function yp(t){
return"vec2("+t[0]+", "+t[1]+")"
}
function vp(t,e){
return t[0]===e[0]&&t[1]===e[1]
}
function bp(t,e){
var r=t[0],n=t[1],o=e[0],a=e[1];
return Math.abs(r-o)<=ct*Math.max(1,Math.abs(r),Math.abs(o))&&Math.abs(n-a)<=ct*Math.max(1,Math.abs(n),Math.abs(a))
}
var wp=Js,xp=Ys,Ap=Gs,Mp=Vs,Ep=Zs,Cp=Xs,Sp=Qs,_p=function(){
var t=Ws();
return function(e,r,n,o,a,i){
var s,l;
for(r||(r=2),n||(n=0),o?l=Math.min(o*r+n,e.length):l=e.length,s=n;
s<l;
s+=r)t[0]=e[s],t[1]=e[s+1],a(t,t,i),e[s]=t[0],e[s+1]=t[1];
return e
}

}
();
U();
var{
create:kp,transformMat4:Np
}
=Ao,{
copy:Tp,create:Pp,determinant:Ip,invert:Bp,transpose:Rp
}
=Vr,{
create:Op,cross:Dp,dot:fr,length:ln,normalize:cn
}
=Ss;
function Fp(t){
if(!jp(t))return null;
let e=Tp(Pp(),t);
for(let h=0;
h<3;
h++)e[4*h+3]=0;
if(e[15]=1,Math.abs(Ip(e))<1e-8)return null;
let r;
if(t[3]!==0||t[7]!==0||t[11]!==0){
let h=[t[3],t[7],t[11],t[15]];
if(!Bp(e,e))return null;
Rp(e,e),r=Np(kp(),h,e),t[3]=t[7]=t[11]=0,t[15]=1
}
else r=[0,0,0,1];
let n=t[12],o=t[13],a=t[14],i=[[],[],[]];
for(let h=0;
h<3;
h++)i[h][0]=t[4*h+0],i[h][1]=t[4*h+1],i[h][2]=t[4*h+2];
let s=[1,1,1];
s[0]=ln(i[0]),cn(i[0],i[0]);
let l=fr(i[0],i[1]);
i[1]=un(i[1],i[0],1,-l),s[1]=ln(i[1]),cn(i[1],i[1]),l/=s[1];
let u=fr(i[0],i[2]);
i[2]=un(i[2],i[0],1,-u);
let f=fr(i[1],i[2]);
i[2]=un(i[2],i[1],1,-f),s[2]=ln(i[2]),cn(i[2],i[2]),u/=s[2],f/=s[2];
let p=Dp(Op(),i[1],i[2]);
if(fr(i[0],p)<0){
for(let h=0;
h<3;
h++)if(i[h][h]<0){
s[h]*=-1,l*=-1,i[h][0]*=-1,i[h][1]*=-1,i[h][2]*=-1;
break
}

}
let g=Math.asin(-i[0][2]),w,b;
return Math.cos(g)!==0?(w=Math.atan2(i[1][2],i[2][2]),b=Math.atan2(i[0][1],i[0][0])):(w=Math.atan2(-i[2][0],i[1][1]),b=0),{
perspective:r,translateX:n,translateY:o,translateZ:a,rotateX:w,rotateY:g,rotateZ:b,scales:s,skew:Math.atan(l),skewX:u,skewY:f
}

}
function un(t,e,r,n){
return[r*t[0]+n*e[0],r*t[1]+n*e[1],r*t[2]+n*e[2]]
}
function jp(t){
let e=t[15];
if(e===0)return!1;
for(let r=0;
r<16;
r++)t[r]/=e;
return!0
}
U();
function zt(t,e){
return Math.round(t*e)/e
}
var{
distance:Ks
}
=Hs,{
invert:fy,multiply:hy
}
=gs,{
multiply:$p,invert:Lp,create:zp
}
=Vr,{
create:qp,transformMat4:Up
}
=Ao;
function tl(t){
let e=Ks([t[0],t[1]],[t[2],t[3]]);
return isNaN(e)&&console.error({
q:t
}
),e
}
function Hp(t){
let e=Ks([t[0],t[1]],[t[6],t[7]]);
return isNaN(e)&&console.error({
q:t
}
),e
}
function Wp({
a:t,b:e,c:r,d:n,e:o,f:a
}
){
return[t,e,0,0,r,n,0,0,0,0,1,0,o,a,0,1]
}
function Yp(){
return[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
}
function Mo(...t){
if(t.length===0)return Yp();
let e=[];
return t.reduce((r,n)=>$p(e,r,n))
}
function Gp(t){
return Fp([...t])
}
function hr(t,e){
return Up(qp(),e,t)
}
function el(t,e){
return[...hr(t,[e[0],e[1],0,1]).slice(0,2),...hr(t,[e[2],e[3],0,1]).slice(0,2),...hr(t,[e[4],e[5],0,1]).slice(0,2),...hr(t,[e[6],e[7],0,1]).slice(0,2)]
}
function Vp(t){
return Lp(zp(),t)
}
function ra(t,e){
return[1,0,0,0,0,1,0,0,0,0,1,0,t,e,0,1]
}
var py=180/Math.PI;
function Zp(t,e=!1){
let r=e?" ":",";
return!t[2]&&!t[3]&&!t[6]&&!t[7]&&!t[8]&&!t[9]&&t[10]===1&&!t[11]&&!t[14]&&t[15]===1?`matrix(${
[t[0],t[1],t[4],t[5],t[12],t[13]].join(r)
}
)`:`matrix3d(${
t.join(r)
}
)`
}
var Xp=Pt(Te(),1),{
stringify:dy
}
=Xp.default,Jp={
width:"width",height:"height",left:"left",top:"top",right:"right",bottom:"bottom",marginTop:"margin-top",marginLeft:"margin-left",marginRight:"margin-right",marginBottom:"margin-bottom",gridTemplateColumns:"grid-template-columns",gridTemplateRows:"grid-template-rows",transformOrigin:"transform-origin"
}
;
function Qp(t){
return Object.entries(t)
}
var Kp=Qp(Jp),td=["accentColor","alignItems","alignSelf","aspectRatio","appearance","backdropFilter","backgroundBlendMode","backgroundClip","backgroundColor","backgroundImage","backgroundOrigin","backgroundPosition","backgroundRepeat","backgroundSize","borderBottomLeftRadius","borderBottomRightRadius","borderBottomStyle","borderColor","borderLeftStyle","borderRightStyle","borderStyle","borderTopLeftRadius","borderTopRightRadius","borderTopStyle","borderWidth","boxShadow","boxSizing","clip","clipPath","color","content","display","direction","fill","filter","flexBasis","flexDirection","flexWrap","float","fontFamily","fontSize","fontStretch","fontStyle","fontVariationSettings","fontWeight","gap","gridArea","gridAutoFlow","gridTemplateAreas","isolation","justifyItems","justifyContent","justifySelf","letterSpacing","lineHeight","listStyleType","margin","maxHeight","maxWidth","minHeight","minWidth","mixBlendMode","objectFit","objectPosition","outlineColor","outlineOffset","outlineStyle","outlineWidth","overflow","overflowX","overflowY","padding","pointerEvents","position","rotate","scale","textAlign","textDecoration","textDecorationLine","textOverflow","textShadow","textTransform","transform","verticalAlign","visibility","webkitMaskClip","webkitMaskImage","webkitMaskOrigin","webkitMaskPosition","webkitMaskRepeat","webkitMaskSize","webkitTextFillColor","webkitTextStrokeColor","webkitTextStrokeWidth","whiteSpace","writingMode","zIndex"],rl={
accentColor:"auto",alignItems:"normal",alignSelf:"auto",aspectRatio:"auto",appearance:"none",backdropFilter:"none",backgroundBlendMode:"normal",backgroundClip:"border-box",backgroundImage:"none",backgroundOrigin:"padding-box",backgroundPosition:"0% 0%",backgroundRepeat:"repeat",backgroundSize:"auto",borderBottomStyle:"solid",borderLeftStyle:"solid",borderRightStyle:"solid",borderStyle:"solid",borderTopStyle:"solid",borderWidth:"0px",borderBottomLeftRadius:"0px",borderBottomRightRadius:"0px",borderTopLeftRadius:"0px",borderTopRightRadius:"0px",boxSizing:"border-box",boxShadow:"none",clip:"auto",clipPath:"none",content:"normal",direction:"ltr",fill:"rgb(0, 0, 0)",filter:"none",flexBasis:"auto",flexDirection:"row",flexWrap:"nowrap",float:"none",fontStretch:"100%",fontWeight:"400",gap:"normal",gridAutoFlow:"row",gridArea:"auto",gridTemplateAreas:"none",gridTemplateColumns:"none",gridTemplateRows:"none",isolation:"auto",fontStyle:"normal",fontVariationSettings:"normal",justifyContent:"normal",justifyItems:"normal",justifySelf:"auto",letterSpacing:"normal",listStyleType:"disc",margin:"0px",marginBottom:"0px",marginLeft:"0px",marginRight:"0px",marginTop:"0px",maxHeight:"none",maxWidth:"none",minHeight:"auto",minWidth:"auto",mixBlendMode:"normal",objectFit:"fill",objectPosition:"50% 50%",outlineOffset:"0px",outlineStyle:"none",outlineWidth:"0px",overflow:"visible",overflowX:"visible",overflowY:"visible",padding:"0px",pointerEvents:"auto",position:"static",rotate:"none",scale:"none",textAlign:"start",textDecoration:"rgb(0, 0, 0)",textDecorationLine:"none",textOverflow:"clip",textShadow:"none",textTransform:"none",transform:"none",transformOrigin:"50% 50%",verticalAlign:"baseline",visibility:"visible",webkitMaskImage:"none",webkitMaskClip:"border-box",webkitMaskOrigin:"border-box",webkitMaskPosition:"0% 0%",webkitMaskRepeat:"repeat",webkitMaskSize:"auto",webkitTextFillColor:"rgb(0, 0, 0)",webkitTextStrokeColor:"rgb(0, 0, 0)",webkitTextStrokeWidth:"0px",whiteSpace:"normal",writingMode:"horizontal-tb",zIndex:"auto"
}
;
function ed(t,e){
return rd(t.split(" ").map(e))
}
function rd(t){
switch(t.length){
case 1:return[t[0],t[0],t[0],t[0]];
case 2:return[t[0],t[1],t[0],t[1]];
case 3:return[t[0],t[1],t[2],t[1]];
case 4:return t
}
throw new Error(`Unexpected css spec: [${
t.join()
}
]`)
}
function nd({
position:t,transform:e,filter:r,backdropFilter:n
}
){
return e!=="none"||t!=="static"||r!=="none"||n!=="none"
}
function od(t,[e,r,n,o]){
return{
x:t.x+o,y:t.y+e,width:t.width-o-r,height:t.height-e-n,quad:[(t.quad?.[0]||t.x)+o,(t.quad?.[1]||t.y)+e,(t.quad?.[2]||t.x+t.width)-r,(t.quad?.[3]||t.y)+e,(t.quad?.[4]||t.x+t.width)-r,(t.quad?.[5]||t.y+t.height)-n,(t.quad?.[6]||t.x)+o,(t.quad?.[7]||t.y+t.height)-n]
}

}
function fn(t,e="0px"){
return od(t,ed(e,kr))
}
function ad(t,e,r){
switch(e){
case"padding-box":return fn(t,r?.borderWidth);
case"content-box":return fn(fn(t,r?.borderWidth),r?.padding);
case"border-box":default:return t
}

}
function Eo({
x:t,y:e,width:r,height:n
}
){
return{
x:t,y:e,width:r,height:n
}

}
function nl(t){
return{
x:t[0],y:t[1],width:tl(t),height:Hp(t),quad:t
}

}
function id(t){
let e=[t[0],t[2],t[4],t[6]],r=[t[1],t[3],t[5],t[7]],n=Math.min(...e),o=Math.min(...r),a=Math.max(...e)-n,i=Math.max(...r)-o;
return{
x:n,y:o,width:a,height:i,quad:t
}

}
function ol({
x:t,y:e,width:r,height:n
}
){
return[t,e,t+r,e,t+r,e+n,t,e+n]
}
function sd(t,e){
return t===e?!0:!t||!e?!1:zt(t.x-e.x,10)===0&&zt(t.y-e.y,10)===0&&zt(t.width-e.width,10)===0&&zt(t.height-e.height,10)===0
}
function ld(t,e){
return{
x:zt(t.x,e),y:zt(t.y,e),width:zt(t.width,e),height:zt(t.height,e)
}

}
function al(t,e){
return{
...ld(t,e),quad:t.quad.map(r=>zt(r,e))
}

}
function Ir(t){
return t.filter(e=>e.type!=="space")
}
function na(t){
return cd(t,",")
}
function cd(t,e){
let r=[],n=0;
for(let o=0;
o<t.length;
o++)t[o].type==="div"&&t[o].value===e&&(r.push(Ir(t.slice(n,o))),n=o+1);
return r.push(Ir(t.slice(n))),r
}
U();
U();
U();
var oa=(t,e)=>{
let r=ud(t,e);
if(!r)return"";
let{
type:n,quality:o
}
=r;
return t.toDataURL(n,o)
}
;
function ud(t,e){
let r=t.getContext("2d"),n=!1,o=!0;
if(r){
let a=r.getImageData(0,0,t.width,t.height);
n=pd(a),o=hd(a)
}
if(!n)return e?.mode!=="lossy"&&(e?.mode==="lossless"||t.width*t.height<=1024*1024||o)?{
type:"image/png"
}
:{
type:"image/jpeg",quality:.75
}

}
var fd=t=>t.toDataURL("image/jpeg",.75);
function hd({
data:t
}
){
for(let e=3;
e<t.length;
e+=4)if(t[e]!==255)return!0;
return!1
}
function pd({
data:t
}
){
for(let e=3;
e<t.length;
e+=4)if(t[e]!==0)return!1;
return!0
}
async function dd(t){
let e=n=>{
try{
return t.getContext(n)
}
catch{
return null
}

}
,r=e("webgl2")||e("webgl");
return r&&!r.getContextAttributes()?.preserveDrawingBuffer?new Promise(n=>{
globalThis.requestAnimationFrame(()=>n(oa(t)))
}
):oa(t)
}
var md=async({
node:t,el:e
}
)=>{
if(!e)return;
let r;
if(In(e)?r=e.currentSrc||e.src:Bn(e)?r=e.poster||e.currentSrc||e.src:Zu(e)&&(r=await dd(e)),r?.startsWith("blob:"))try{
await fetch(r)
}
catch(n){
if(Bn(e)||In(e)){
if(r=gd(e,r),!r)throw n
}
else throw n
}
r&&(t.$url=r)
}
;
function gd(t,e){
let r=Bn(t);
try{
let n=document.createElement("canvas");
n.width=r?t.videoWidth:t.naturalWidth,n.height=r?t.videoHeight:t.naturalHeight,n.getContext("2d").drawImage(t,0,0),e=r?fd(n):n.toDataURL("image/png")
}
catch{
return
}
return e
}
U();
U();
var yd=Pt(Te(),1);
U();
var my=Pt(Te(),1);
U();
U();
function bt(t,e){
let r=t.length;
Array.isArray(t[0])||(t=[t]),Array.isArray(e[0])||(e=e.map(i=>[i]));
let n=e[0].length,o=e[0].map((i,s)=>e.map(l=>l[s])),a=t.map(i=>o.map(s=>{
let l=0;
if(!Array.isArray(i)){
for(let u of s)l+=i*u;
return l
}
for(let u=0;
u<i.length;
u++)l+=i[u]*(s[u]||0);
return l
}
));
return r===1&&(a=a[0]),n===1?a.map(i=>i[0]):a
}
function sr(t){
return ge(t)==="string"
}
function ge(t){
return(Object.prototype.toString.call(t).match(/^\[object\s+(.*?)\]$/)[1]||"").toLowerCase()
}
function Br(t,{
precision:e,unit:r
}
){
return ve(t)?"none":il(t,e)+(r??"")
}
function ve(t){
return Number.isNaN(t)||t instanceof Number&&t?.none
}
function Et(t){
return ve(t)?0:t
}
function il(t,e){
if(t===0)return 0;
let r=~~t,n=0;
r&&e&&(n=~~Math.log10(Math.abs(r))+1);
let o=10**(e-n);
return Math.floor(t*o+.5)/o
}
var vd={
deg:1,grad:.9,rad:180/Math.PI,turn:360
}
;
function sl(t){
if(!t)return;
t=t.trim();
let e=/^([a-z]+)\((.+?)\)$/i,r=/^-?[\d.]+$/,n=/%|deg|g?rad|turn$/,o=/\/?\s*(none|[-\w.]+(?:%|deg|g?rad|turn)?)/g,a=t.match(e);
if(a){
let i=[];
return a[2].replace(o,(s,l)=>{
let u=l.match(n),f=l;
if(u){
let p=u[0],g=f.slice(0,-p.length);
p==="%"?(f=new Number(g/100),f.type="<percentage>"):(f=new Number(g*vd[p]),f.type="<angle>",f.unit=p)
}
else r.test(f)?(f=new Number(f),f.type="<number>"):f==="none"&&(f=new Number(NaN),f.none=!0);
s.startsWith("/")&&(f=f instanceof Number?f:new Number(f),f.alpha=!0),typeof f=="object"&&f instanceof Number&&(f.raw=l),i.push(f)
}
),{
name:a[1].toLowerCase(),rawName:a[1],rawArgs:a[2],args:i
}

}

}
function ll(t){
return t[t.length-1]
}
function tr(t,e,r){
return isNaN(t)?e:isNaN(e)?t:t+(e-t)*r
}
function cl(t,e,r){
return(r-t)/(e-t)
}
function Co(t,e,r){
return tr(e[0],e[1],cl(t[0],t[1],r))
}
function ul(t){
return t.map(e=>e.split("|").map(r=>{
r=r.trim();
let n=r.match(/^(<[a-z]+>)\[(-?[.\d]+),\s*(-?[.\d]+)\]?$/);
if(n){
let o=new String(n[1]);
return o.range=[+n[2],+n[3]],o
}
return r
}
))
}
function fl(t,e,r){
return Math.max(Math.min(r,e),t)
}
function Zr(t,e){
return Math.sign(t)===Math.sign(e)?t:-t
}
function te(t,e){
return Zr(Math.abs(t)**e,t)
}
function So(t,e){
return e===0?0:t/e
}
function hl(t,e,r=0,n=t.length){
for(;
r<n;
){
let o=r+n>>1;
t[o]<e?r=o+1:n=o
}
return r
}
var bd=Object.freeze({
__proto__:null,bisectLeft:hl,clamp:fl,copySign:Zr,interpolate:tr,interpolateInv:cl,isNone:ve,isString:sr,last:ll,mapRange:Co,multiplyMatrices:bt,parseCoordGrammar:ul,parseFunction:sl,serializeNumber:Br,skipNone:Et,spow:te,toPrecision:il,type:ge,zdiv:So
}
),wd=class{
add(t,e,r){
if(typeof arguments[0]!="string"){
for(var t in arguments[0])this.add(t,arguments[0][t],arguments[1]);
return
}
(Array.isArray(t)?t:[t]).forEach(function(n){
this[n]=this[n]||[],e&&this[n][r?"unshift":"push"](e)
}
,this)
}
run(t,e){
this[t]=this[t]||[],this[t].forEach(function(r){
r.call(e&&e.context?e.context:e,e)
}
)
}

}
,be=new wd,Yt={
gamut_mapping:"css",precision:5,deltaE:"76",verbose:globalThis?.process?.env?.NODE_ENV?.toLowerCase()!=="test",warn:function(t){
this.verbose&&globalThis?.console?.warn?.(t)
}

}
,jt={
D50:[.3457/.3585,1,(1-.3457-.3585)/.3585],D65:[.3127/.329,1,(1-.3127-.329)/.329]
}
;
function jn(t){
return Array.isArray(t)?t:jt[t]
}
function Rr(t,e,r,n={

}
){
if(t=jn(t),e=jn(e),!t||!e)throw new TypeError(`Missing white point to convert ${
t?"":"from"
}
${
!t&&!e?"/":""
}
${
e?"":"to"
}
`);
if(t===e)return r;
let o={
W1:t,W2:e,XYZ:r,options:n
}
;
if(be.run("chromatic-adaptation-start",o),o.M||(o.W1===jt.D65&&o.W2===jt.D50?o.M=[[1.0479297925449969,.022946870601609652,-.05019226628920524],[.02962780877005599,.9904344267538799,-.017073799063418826],[-.009243040646204504,.015055191490298152,.7518742814281371]]:o.W1===jt.D50&&o.W2===jt.D65&&(o.M=[[.955473421488075,-.02309845494876471,.06325924320057072],[-.0283697093338637,1.0099953980813041,.021041441191917323],[.012314014864481998,-.020507649298898964,1.330365926242124]])),be.run("chromatic-adaptation-end",o),o.M)return bt(o.M,o.XYZ);
throw new TypeError("Only Bradford CAT with white points D50 and D65 supported for now.")
}
var xd=new Set(["<number>","<percentage>","<angle>"]);
function aa(t,e,r,n){
return Object.entries(t.coords).map(([o,a],i)=>{
let s=e.coordGrammar[i],l=n[i],u=l?.type,f;
if(l.none?f=s.find(w=>xd.has(w)):f=s.find(w=>w==u),!f){
let w=a.name||o;
throw new TypeError(`${
u??l.raw
}
 not allowed for ${
w
}
 in ${
r
}
()`)
}
let p=f.range;
u==="<percentage>"&&(p||=[0,1]);
let g=a.range||a.refRange;
return p&&g&&(n[i]=Co(p,g,n[i])),f
}
)
}
function pl(t,{
meta:e
}
={

}
){
let r={
str:String(t)?.trim()
}
;
if(be.run("parse-start",r),r.color)return r.color;
if(r.parsed=sl(r.str),r.parsed){
let n=r.parsed.name;
if(n==="color"){
let o=r.parsed.args.shift(),a=o.startsWith("--")?o.substring(2):`--${
o
}
`,i=[o,a],s=r.parsed.rawArgs.indexOf("/")>0?r.parsed.args.pop():1;
for(let f of it.all){
let p=f.getFormat("color");
if(p&&(i.includes(p.id)||p.ids?.filter(g=>i.includes(g)).length)){
let g=Object.keys(f.coords).map((b,h)=>r.parsed.args[h]||0),w;
return p.coordGrammar&&(w=aa(f,p,"color",g)),e&&Object.assign(e,{
formatId:"color",types:w
}
),p.id.startsWith("--")&&!o.startsWith("--")&&Yt.warn(`${
f.name
}
 is a non-standard space and not currently supported in the CSS spec. Use prefixed color(${
p.id
}
) instead of color(${
o
}
).`),o.startsWith("--")&&!p.id.startsWith("--")&&Yt.warn(`${
f.name
}
 is a standard space and supported in the CSS spec. Use color(${
p.id
}
) instead of prefixed color(${
o
}
).`),{
spaceId:f.id,coords:g,alpha:s
}

}

}
let l="",u=o in it.registry?o:a;
if(u in it.registry){
let f=it.registry[u].formats?.color?.id;
f&&(l=`Did you mean color(${
f
}
)?`)
}
throw new TypeError(`Cannot parse color(${
o
}
). `+(l||"Missing a plugin?"))
}
else for(let o of it.all){
let a=o.getFormat(n);
if(a&&a.type==="function"){
let i=1;
(a.lastAlpha||ll(r.parsed.args).alpha)&&(i=r.parsed.args.pop());
let s=r.parsed.args,l;
return a.coordGrammar&&(l=aa(o,a,n,s)),e&&Object.assign(e,{
formatId:a.name,types:l
}
),{
spaceId:o.id,coords:s,alpha:i
}

}

}

}
else for(let n of it.all)for(let o in n.formats){
let a=n.formats[o];
if(a.type!=="custom"||a.test&&!a.test(r.str))continue;
let i=a.parse(r.str);
if(i)return i.alpha??=1,e&&(e.formatId=o),i
}
throw new TypeError(`Could not parse ${
t
}
 as a color. Missing a plugin?`)
}
function st(t){
if(Array.isArray(t))return t.map(st);
if(!t)throw new TypeError("Empty color reference");
sr(t)&&(t=pl(t));
let e=t.space||t.spaceId;
return e instanceof it||(t.space=it.get(e)),t.alpha===void 0&&(t.alpha=1),t
}
var Ad=75e-6,Qt=class{
constructor(t){
this.id=t.id,this.name=t.name,this.base=t.base?Qt.get(t.base):null,this.aliases=t.aliases,this.base&&(this.fromBase=t.fromBase,this.toBase=t.toBase);
let e=t.coords??this.base.coords;
for(let n in e)"name"in e[n]||(e[n].name=n);
this.coords=e;
let r=t.white??this.base.white??"D65";
this.white=jn(r),this.formats=t.formats??{

}
;
for(let n in this.formats){
let o=this.formats[n];
o.type||="function",o.name||=n
}
this.formats.color?.id||(this.formats.color={
...this.formats.color??{

}
,id:t.cssId||this.id
}
),t.gamutSpace?this.gamutSpace=t.gamutSpace==="self"?this:Qt.get(t.gamutSpace):this.isPolar?this.gamutSpace=this.base:this.gamutSpace=this,this.gamutSpace.isUnbounded&&(this.inGamut=(n,o)=>!0),this.referred=t.referred,Object.defineProperty(this,"path",{
value:Md(this).reverse(),writable:!1,enumerable:!0,configurable:!0
}
),be.run("colorspace-init-end",this)
}
inGamut(t,{
epsilon:e=Ad
}
={

}
){
if(!this.equals(this.gamutSpace))return t=this.to(this.gamutSpace,t),this.gamutSpace.inGamut(t,{
epsilon:e
}
);
let r=Object.values(this.coords);
return t.every((n,o)=>{
let a=r[o];
if(a.type!=="angle"&&a.range){
if(Number.isNaN(n))return!0;
let[i,s]=a.range;
return(i===void 0||n>=i-e)&&(s===void 0||n<=s+e)
}
return!0
}
)
}
get isUnbounded(){
return Object.values(this.coords).every(t=>!("range"in t))
}
get cssId(){
return this.formats?.color?.id||this.id
}
get isPolar(){
for(let t in this.coords)if(this.coords[t].type==="angle")return!0;
return!1
}
getFormat(t){
if(typeof t=="object")return t=ia(t,this),t;
let e;
return t==="default"?e=Object.values(this.formats)[0]:e=this.formats[t],e?(e=ia(e,this),e):null
}
equals(t){
return t?this===t||this.id===t||this.id===t.id:!1
}
to(t,e){
if(arguments.length===1){
let i=st(t);
[t,e]=[i.space,i.coords]
}
if(t=Qt.get(t),this.equals(t))return e;
e=e.map(i=>Number.isNaN(i)?0:i);
let r=this.path,n=t.path,o,a;
for(let i=0;
i<r.length&&r[i].equals(n[i]);
i++)o=r[i],a=i;
if(!o)throw new Error(`Cannot convert between color spaces ${
this
}
 and ${
t
}
: no connection space was found`);
for(let i=r.length-1;
i>a;
i--)e=r[i].toBase(e);
for(let i=a+1;
i<n.length;
i++)e=n[i].fromBase(e);
return e
}
from(t,e){
if(arguments.length===1){
let r=st(t);
[t,e]=[r.space,r.coords]
}
return t=Qt.get(t),t.to(this,e)
}
toString(){
return`${
this.name
}
 (${
this.id
}
)`
}
getMinCoords(){
let t=[];
for(let e in this.coords){
let r=this.coords[e],n=r.range||r.refRange;
t.push(n?.min??0)
}
return t
}
static get all(){
return[...new Set(Object.values(Qt.registry))]
}
static register(t,e){
if(arguments.length===1&&(e=arguments[0],t=e.id),e=this.get(e),this.registry[t]&&this.registry[t]!==e)throw new Error(`Duplicate color space registration: '${
t
}
'`);
if(this.registry[t]=e,arguments.length===1&&e.aliases)for(let r of e.aliases)this.register(r,e);
return e
}
static get(t,...e){
if(!t||t instanceof Qt)return t;
if(ge(t)==="string"){
let r=Qt.registry[t.toLowerCase()];
if(!r)throw new TypeError(`No color space found with id = "${
t
}
"`);
return r
}
if(e.length)return Qt.get(...e);
throw new TypeError(`${
t
}
 is not a valid color space`)
}
static resolveCoord(t,e){
let r=ge(t),n,o;
if(r==="string"?t.includes(".")?[n,o]=t.split("."):[n,o]=[,t]:Array.isArray(t)?[n,o]=t:(n=t.space,o=t.coordId),n=Qt.get(n),n||(n=e),!n)throw new TypeError(`Cannot resolve coordinate reference ${
t
}
: No color space specified and relative references are not allowed here`);
if(r=ge(o),r==="number"||r==="string"&&o>=0){
let s=Object.entries(n.coords)[o];
if(s)return{
space:n,id:s[0],index:o,...s[1]
}

}
n=Qt.get(n);
let a=o.toLowerCase(),i=0;
for(let s in n.coords){
let l=n.coords[s];
if(s.toLowerCase()===a||l.name?.toLowerCase()===a)return{
space:n,id:s,index:i,...l
}
;
i++
}
throw new TypeError(`No "${
o
}
" coordinate found in ${
n.name
}
. Its coordinates are: ${
Object.keys(n.coords).join(", ")
}
`)
}

}
,it=Qt;
Fo(it,"registry",{

}
),Fo(it,"DEFAULT_FORMAT",{
type:"functions",name:"color"
}
);
function Md(t){
let e=[t];
for(let r=t;
r=r.base;
)e.push(r);
return e
}
function ia(t,{
coords:e
}
={

}
){
if(t.coords&&!t.coordGrammar){
t.type||="function",t.name||="color",t.coordGrammar=ul(t.coords);
let r=Object.entries(e).map(([n,o],a)=>{
let i=t.coordGrammar[a][0],s=o.range||o.refRange,l=i.range,u="";
return i=="<percentage>"?(l=[0,100],u="%"):i=="<angle>"&&(u="deg"),{
fromRange:s,toRange:l,suffix:u
}

}
);
t.serializeCoords=(n,o)=>n.map((a,i)=>{
let{
fromRange:s,toRange:l,suffix:u
}
=r[i];
return s&&l&&(a=Co(s,l,a)),a=Br(a,{
precision:o,unit:u
}
),a
}
)
}
return t
}
var Bt=new it({
id:"xyz-d65",name:"XYZ D65",coords:{
x:{
name:"X"
}
,y:{
name:"Y"
}
,z:{
name:"Z"
}

}
,white:"D65",formats:{
color:{
ids:["xyz-d65","xyz"]
}

}
,aliases:["xyz"]
}
),qt=class extends it{
constructor(t){
t.coords||(t.coords={
r:{
range:[0,1],name:"Red"
}
,g:{
range:[0,1],name:"Green"
}
,b:{
range:[0,1],name:"Blue"
}

}
),t.base||(t.base=Bt),t.toXYZ_M&&t.fromXYZ_M&&(t.toBase??=e=>{
let r=bt(t.toXYZ_M,e);
return this.white!==this.base.white&&(r=Rr(this.white,this.base.white,r)),r
}
,t.fromBase??=e=>(e=Rr(this.base.white,this.white,e),bt(t.fromXYZ_M,e))),t.referred??="display",super(t)
}

}
;
function lr(t,e){
return t=st(t),!e||t.space.equals(e)?t.coords.slice():(e=it.get(e),e.from(t))
}
function Ht(t,e){
t=st(t);
let{
space:r,index:n
}
=it.resolveCoord(e,t.space);
return lr(t,r)[n]
}
function _o(t,e,r){
return t=st(t),e=it.get(e),t.coords=e.to(t.space,r),t
}
_o.returns="color";
function ce(t,e,r){
if(t=st(t),arguments.length===2&&ge(arguments[1])==="object"){
let n=arguments[1];
for(let o in n)ce(t,o,n[o])
}
else{
typeof r=="function"&&(r=r(Ht(t,e)));
let{
space:n,index:o
}
=it.resolveCoord(e,t.space),a=lr(t,n);
a[o]=r,_o(t,n,a)
}
return t
}
ce.returns="color";
var ko=new it({
id:"xyz-d50",name:"XYZ D50",white:"D50",base:Bt,fromBase:t=>Rr(Bt.white,"D50",t),toBase:t=>Rr("D50",Bt.white,t)
}
),Ed=216/24389,sa=24/116,pr=24389/27,hn=jt.D50,Wt=new it({
id:"lab",name:"Lab",coords:{
l:{
refRange:[0,100],name:"Lightness"
}
,a:{
refRange:[-125,125]
}
,b:{
refRange:[-125,125]
}

}
,white:hn,base:ko,fromBase(t){
let e=t.map((r,n)=>r/hn[n]).map(r=>r>Ed?Math.cbrt(r):(pr*r+16)/116);
return[116*e[1]-16,500*(e[0]-e[1]),200*(e[1]-e[2])]
}
,toBase(t){
let e=[];
return e[1]=(t[0]+16)/116,e[0]=t[1]/500+e[1],e[2]=e[1]-t[2]/200,[e[0]>sa?Math.pow(e[0],3):(116*e[0]-16)/pr,t[0]>8?Math.pow((t[0]+16)/116,3):t[0]/pr,e[2]>sa?Math.pow(e[2],3):(116*e[2]-16)/pr].map((r,n)=>r*hn[n])
}
,formats:{
lab:{
coords:["<number> | <percentage>","<number> | <percentage>[-1,1]","<number> | <percentage>[-1,1]"]
}

}

}
);
function re(t){
return(t%360+360)%360
}
function Cd(t,e){
if(t==="raw")return e;
let[r,n]=e.map(re),o=n-r;
return t==="increasing"?o<0&&(n+=360):t==="decreasing"?o>0&&(r+=360):t==="longer"?-180<o&&o<180&&(o>0?r+=360:n+=360):t==="shorter"&&(o>180?r+=360:o<-180&&(n+=360)),[r,n]
}
var er=new it({
id:"lch",name:"LCH",coords:{
l:{
refRange:[0,100],name:"Lightness"
}
,c:{
refRange:[0,150],name:"Chroma"
}
,h:{
refRange:[0,360],type:"angle",name:"Hue"
}

}
,base:Wt,fromBase(t){
let[e,r,n]=t,o,a=.02;
return Math.abs(r)<a&&Math.abs(n)<a?o=NaN:o=Math.atan2(n,r)*180/Math.PI,[e,Math.sqrt(r**2+n**2),re(o)]
}
,toBase(t){
let[e,r,n]=t;
return r<0&&(r=0),isNaN(n)&&(n=0),[e,r*Math.cos(n*Math.PI/180),r*Math.sin(n*Math.PI/180)]
}
,formats:{
lch:{
coords:["<number> | <percentage>","<number> | <percentage>","<number> | <angle>"]
}

}

}
),la=25**7,Or=Math.PI,ca=180/Or,Re=Or/180;
function ua(t){
let e=t*t;
return e*e*e*t
}
function dl(t,e,{
kL:r=1,kC:n=1,kH:o=1
}
={

}
){
[t,e]=st([t,e]);
let[a,i,s]=Wt.from(t),l=er.from(Wt,[a,i,s])[1],[u,f,p]=Wt.from(e),g=er.from(Wt,[u,f,p])[1];
l<0&&(l=0),g<0&&(g=0);
let w=(l+g)/2,b=ua(w),h=.5*(1-Math.sqrt(b/(b+la))),m=(1+h)*i,v=(1+h)*f,x=Math.sqrt(m**2+s**2),k=Math.sqrt(v**2+p**2),N=m===0&&s===0?0:Math.atan2(s,m),_=v===0&&p===0?0:Math.atan2(p,v);
N<0&&(N+=2*Or),_<0&&(_+=2*Or),N*=ca,_*=ca;
let I=u-a,z=k-x,R=_-N,M=N+_,C=Math.abs(R),E;
x*k===0?E=0:C<=180?E=R:R>180?E=R-360:R<-180?E=R+360:Yt.warn("the unthinkable has happened");
let q=2*Math.sqrt(k*x)*Math.sin(E*Re/2),Y=(a+u)/2,G=(x+k)/2,j=ua(G),H;
x*k===0?H=M:C<=180?H=M/2:M<360?H=(M+360)/2:H=(M-360)/2;
let T=(Y-50)**2,F=1+.015*T/Math.sqrt(20+T),$=1+.045*G,Z=1;
Z-=.17*Math.cos((H-30)*Re),Z+=.24*Math.cos(2*H*Re),Z+=.32*Math.cos((3*H+6)*Re),Z-=.2*Math.cos((4*H-63)*Re);
let K=1+.015*G*Z,rt=30*Math.exp(-1*((H-275)/25)**2),Q=2*Math.sqrt(j/(j+la)),at=-1*Math.sin(2*rt*Re)*Q,nt=(I/(r*F))**2;
return nt+=(z/(n*$))**2,nt+=(q/(o*K))**2,nt+=at*(z/(n*$))*(q/(o*K)),Math.sqrt(nt)
}
var Sd=[[.819022437996703,.3619062600528904,-.1288737815209879],[.0329836539323885,.9292868615863434,.0361446663506424],[.0481771893596242,.2642395317527308,.6335478284694309]],_d=[[1.2268798758459243,-.5578149944602171,.2813910456659647],[-.0405757452148008,1.112286803280317,-.0717110580655164],[-.0763729366746601,-.4214933324022432,1.5869240198367816]],kd=[[.210454268309314,.7936177747023054,-.0040720430116193],[1.9779985324311684,-2.42859224204858,.450593709617411],[.0259040424655478,.7827717124575296,-.8086757549230774]],Nd=[[1,.3963377773761749,.2158037573099136],[1,-.1055613458156586,-.0638541728258133],[1,-.0894841775298119,-1.2914855480194092]],Le=new it({
id:"oklab",name:"Oklab",coords:{
l:{
refRange:[0,1],name:"Lightness"
}
,a:{
refRange:[-.4,.4]
}
,b:{
refRange:[-.4,.4]
}

}
,white:"D65",base:Bt,fromBase(t){
let e=bt(Sd,t).map(r=>Math.cbrt(r));
return bt(kd,e)
}
,toBase(t){
let e=bt(Nd,t).map(r=>r**3);
return bt(_d,e)
}
,formats:{
oklab:{
coords:["<percentage> | <number>","<number> | <percentage>[-1,1]","<number> | <percentage>[-1,1]"]
}

}

}
);
function $n(t,e){
[t,e]=st([t,e]);
let[r,n,o]=Le.from(t),[a,i,s]=Le.from(e),l=r-a,u=n-i,f=o-s;
return Math.sqrt(l**2+u**2+f**2)
}
var Td=75e-6;
function ke(t,e,{
epsilon:r=Td
}
={

}
){
t=st(t),e||(e=t.space),e=it.get(e);
let n=t.coords;
return e!==t.space&&(n=e.from(t)),e.inGamut(n,{
epsilon:r
}
)
}
function ze(t){
return{
space:t.space,coords:t.coords.slice(),alpha:t.alpha
}

}
function ml(t,e,r="lab"){
r=it.get(r);
let n=r.from(t),o=r.from(e);
return Math.sqrt(n.reduce((a,i,s)=>{
let l=o[s];
return isNaN(i)||isNaN(l)?a:a+(l-i)**2
}
,0))
}
function Pd(t,e){
return ml(t,e,"lab")
}
var Id=Math.PI,fa=Id/180;
function Bd(t,e,{
l:r=2,c:n=1
}
={

}
){
[t,e]=st([t,e]);
let[o,a,i]=Wt.from(t),[,s,l]=er.from(Wt,[o,a,i]),[u,f,p]=Wt.from(e),g=er.from(Wt,[u,f,p])[1];
s<0&&(s=0),g<0&&(g=0);
let w=o-u,b=s-g,h=a-f,m=i-p,v=h**2+m**2-b**2,x=.511;
o>=16&&(x=.040975*o/(1+.01765*o));
let k=.0638*s/(1+.0131*s)+.638,N;
Number.isNaN(l)&&(l=0),l>=164&&l<=345?N=.56+Math.abs(.2*Math.cos((l+168)*fa)):N=.36+Math.abs(.4*Math.cos((l+35)*fa));
let _=Math.pow(s,4),I=Math.sqrt(_/(_+1900)),z=k*(I*N+1-I),R=(w/(r*x))**2;
return R+=(b/(n*k))**2,R+=v/z**2,Math.sqrt(R)
}
var ha=203,No=new it({
id:"xyz-abs-d65",cssId:"--xyz-abs-d65",name:"Absolute XYZ D65",coords:{
x:{
refRange:[0,9504.7],name:"Xa"
}
,y:{
refRange:[0,1e4],name:"Ya"
}
,z:{
refRange:[0,10888.3],name:"Za"
}

}
,base:Bt,fromBase(t){
return t.map(e=>Math.max(e*ha,0))
}
,toBase(t){
return t.map(e=>Math.max(e/ha,0))
}

}
),dr=1.15,mr=.66,pa=2610/2**14,Rd=2**14/2610,da=3424/2**12,ma=2413/2**7,ga=2392/2**7,Od=1.7*2523/2**5,ya=2**5/(1.7*2523),gr=-.56,pn=16295499532821565e-27,Dd=[[.41478972,.579999,.014648],[-.20151,1.120649,.0531008],[-.0166008,.2648,.6684799]],Fd=[[1.9242264357876067,-1.0047923125953657,.037651404030618],[.35031676209499907,.7264811939316552,-.06538442294808501],[-.09098281098284752,-.3127282905230739,1.5227665613052603]],jd=[[.5,.5,0],[3.524,-4.066708,.542708],[.199076,1.096799,-1.295875]],$d=[[1,.1386050432715393,.05804731615611886],[.9999999999999999,-.1386050432715393,-.05804731615611886],[.9999999999999998,-.09601924202631895,-.8118918960560388]],gl=new it({
id:"jzazbz",name:"Jzazbz",coords:{
jz:{
refRange:[0,1],name:"Jz"
}
,az:{
refRange:[-.5,.5]
}
,bz:{
refRange:[-.5,.5]
}

}
,base:No,fromBase(t){
let[e,r,n]=t,o=dr*e-(dr-1)*n,a=mr*r-(mr-1)*e,i=bt(Dd,[o,a,n]).map(function(f){
let p=da+ma*(f/1e4)**pa,g=1+ga*(f/1e4)**pa;
return(p/g)**Od
}
),[s,l,u]=bt(jd,i);
return[(1+gr)*s/(1+gr*s)-pn,l,u]
}
,toBase(t){
let[e,r,n]=t,o=(e+pn)/(1+gr-gr*(e+pn)),a=bt($d,[o,r,n]).map(function(p){
let g=da-p**ya,w=ga*p**ya-ma;
return 1e4*(g/w)**Rd
}
),[i,s,l]=bt(Fd,a),u=(i+(dr-1)*l)/dr,f=(s+(mr-1)*u)/mr;
return[u,f,l]
}
,formats:{
color:{
coords:["<number> | <percentage>","<number> | <percentage>[-1,1]","<number> | <percentage>[-1,1]"]
}

}

}
),Ln=new it({
id:"jzczhz",name:"JzCzHz",coords:{
jz:{
refRange:[0,1],name:"Jz"
}
,cz:{
refRange:[0,1],name:"Chroma"
}
,hz:{
refRange:[0,360],type:"angle",name:"Hue"
}

}
,base:gl,fromBase(t){
let[e,r,n]=t,o,a=2e-4;
return Math.abs(r)<a&&Math.abs(n)<a?o=NaN:o=Math.atan2(n,r)*180/Math.PI,[e,Math.sqrt(r**2+n**2),re(o)]
}
,toBase(t){
return[t[0],t[1]*Math.cos(t[2]*Math.PI/180),t[1]*Math.sin(t[2]*Math.PI/180)]
}

}
);
function Ld(t,e){
[t,e]=st([t,e]);
let[r,n,o]=Ln.from(t),[a,i,s]=Ln.from(e),l=r-a,u=n-i;
Number.isNaN(o)&&Number.isNaN(s)?(o=0,s=0):Number.isNaN(o)?o=s:Number.isNaN(s)&&(s=o);
let f=o-s,p=2*Math.sqrt(n*i)*Math.sin(f/2*(Math.PI/180));
return Math.sqrt(l**2+u**2+p**2)
}
var yl=3424/4096,vl=2413/128,bl=2392/128,va=2610/16384,zd=2523/32,qd=16384/2610,ba=32/2523,Ud=[[.3592832590121217,.6976051147779502,-.035891593232029],[-.1920808463704993,1.100476797037432,.0753748658519118],[.0070797844607479,.0748396662186362,.8433265453898765]],Hd=[[2048/4096,2048/4096,0],[6610/4096,-13613/4096,7003/4096],[17933/4096,-17390/4096,-543/4096]],Wd=[[.9999999999999998,.0086090370379328,.111029625003026],[.9999999999999998,-.0086090370379328,-.1110296250030259],[.9999999999999998,.5600313357106791,-.3206271749873188]],Yd=[[2.0701522183894223,-1.3263473389671563,.2066510476294053],[.3647385209748072,.6805660249472273,-.0453045459220347],[-.0497472075358123,-.0492609666966131,1.1880659249923042]],zn=new it({
id:"ictcp",name:"ICTCP",coords:{
i:{
refRange:[0,1],name:"I"
}
,ct:{
refRange:[-.5,.5],name:"CT"
}
,cp:{
refRange:[-.5,.5],name:"CP"
}

}
,base:No,fromBase(t){
let e=bt(Ud,t);
return Gd(e)
}
,toBase(t){
let e=Vd(t);
return bt(Yd,e)
}

}
);
function Gd(t){
let e=t.map(function(r){
let n=yl+vl*(r/1e4)**va,o=1+bl*(r/1e4)**va;
return(n/o)**zd
}
);
return bt(Hd,e)
}
function Vd(t){
return bt(Wd,t).map(function(e){
let r=Math.max(e**ba-yl,0),n=vl-bl*e**ba;
return 1e4*(r/n)**qd
}
)
}
function Zd(t,e){
[t,e]=st([t,e]);
let[r,n,o]=zn.from(t),[a,i,s]=zn.from(e);
return 720*Math.sqrt((r-a)**2+.25*(n-i)**2+(o-s)**2)
}
var Xd=jt.D65,wl=.42,wa=1/wl,dn=2*Math.PI,xl=[[.401288,.650173,-.051461],[-.250268,1.204414,.045854],[-.002079,.048952,.953127]],Jd=[[1.8620678550872327,-1.0112546305316843,.14918677544445175],[.38752654323613717,.6214474419314753,-.008973985167612518],[-.015841498849333856,-.03412293802851557,1.0499644368778496]],Qd=[[460,451,288],[460,-891,-261],[460,-220,-6300]],Kd={
dark:[.8,.525,.8],dim:[.9,.59,.9],average:[1,.69,1]
}
,Ce={
h:[20.14,90,164.25,237.53,380.14],e:[.8,.7,1,1.2,.8],H:[0,100,200,300,400]
}
,tm=180/Math.PI,xa=Math.PI/180;
function Al(t,e){
return t.map(r=>{
let n=te(e*Math.abs(r)*.01,wl);
return 400*Zr(n,r)/(n+27.13)
}
)
}
function em(t,e){
let r=100/e*27.13**wa;
return t.map(n=>{
let o=Math.abs(n);
return Zr(r*te(o/(400-o),wa),n)
}
)
}
function rm(t){
let e=re(t);
e<=Ce.h[0]&&(e+=360);
let r=hl(Ce.h,e)-1,[n,o]=Ce.h.slice(r,r+2),[a,i]=Ce.e.slice(r,r+2),s=Ce.H[r],l=(e-n)/a;
return s+100*l/(l+(o-e)/i)
}
function nm(t){
let e=(t%400+400)%400,r=Math.floor(.01*e);
e=e%100;
let[n,o]=Ce.h.slice(r,r+2),[a,i]=Ce.e.slice(r,r+2);
return re((e*(i*n-a*o)-100*n*i)/(e*(i-a)-100*i))
}
function Ml(t,e,r,n,o){
let a={

}
;
a.discounting=o,a.refWhite=t,a.surround=n;
let i=t.map(b=>b*100);
a.la=e,a.yb=r;
let s=i[1],l=bt(xl,i);
n=Kd[a.surround];
let u=n[0];
a.c=n[1],a.nc=n[2];
let f=(1/(5*a.la+1))**4;
a.fl=f*a.la+.1*(1-f)*(1-f)*Math.cbrt(5*a.la),a.flRoot=a.fl**.25,a.n=a.yb/s,a.z=1.48+Math.sqrt(a.n),a.nbb=.725*a.n**-.2,a.ncb=a.nbb;
let p=o?1:Math.max(Math.min(u*(1-1/3.6*Math.exp((-a.la-42)/92)),1),0);
a.dRgb=l.map(b=>tr(1,s/b,p)),a.dRgbInv=a.dRgb.map(b=>1/b);
let g=l.map((b,h)=>b*a.dRgb[h]),w=Al(g,a.fl);
return a.aW=a.nbb*(2*w[0]+w[1]+.05*w[2]),a
}
var Aa=Ml(Xd,64/Math.PI*.2,20,"average",!1);
function qn(t,e){
if(!(t.J!==void 0^t.Q!==void 0))throw new Error("Conversion requires one and only one: 'J' or 'Q'");
if(!(t.C!==void 0^t.M!==void 0^t.s!==void 0))throw new Error("Conversion requires one and only one: 'C', 'M' or 's'");
if(!(t.h!==void 0^t.H!==void 0))throw new Error("Conversion requires one and only one: 'h' or 'H'");
if(t.J===0||t.Q===0)return[0,0,0];
let r=0;
t.h!==void 0?r=re(t.h)*xa:r=nm(t.H)*xa;
let n=Math.cos(r),o=Math.sin(r),a=0;
t.J!==void 0?a=te(t.J,1/2)*.1:t.Q!==void 0&&(a=.25*e.c*t.Q/((e.aW+4)*e.flRoot));
let i=0;
t.C!==void 0?i=t.C/a:t.M!==void 0?i=t.M/e.flRoot/a:t.s!==void 0&&(i=4e-4*t.s**2*(e.aW+4)/e.c);
let s=te(i*Math.pow(1.64-Math.pow(.29,e.n),-.73),10/9),l=.25*(Math.cos(r+2)+3.8),u=e.aW*te(a,2/e.c/e.z),f=5e4/13*e.nc*e.ncb*l,p=u/e.nbb,g=23*(p+.305)*So(s,23*f+s*(11*n+108*o)),w=g*n,b=g*o,h=em(bt(Qd,[p,w,b]).map(m=>m*1/1403),e.fl);
return bt(Jd,h.map((m,v)=>m*e.dRgbInv[v])).map(m=>m/100)
}
function El(t,e){
let r=t.map(k=>k*100),n=Al(bt(xl,r).map((k,N)=>k*e.dRgb[N]),e.fl),o=n[0]+(-12*n[1]+n[2])/11,a=(n[0]+n[1]-2*n[2])/9,i=(Math.atan2(a,o)%dn+dn)%dn,s=.25*(Math.cos(i+2)+3.8),l=5e4/13*e.nc*e.ncb*So(s*Math.sqrt(o**2+a**2),n[0]+n[1]+1.05*n[2]+.305),u=te(l,.9)*Math.pow(1.64-Math.pow(.29,e.n),.73),f=e.nbb*(2*n[0]+n[1]+.05*n[2]),p=te(f/e.aW,.5*e.c*e.z),g=100*te(p,2),w=4/e.c*p*(e.aW+4)*e.flRoot,b=u*p,h=b*e.flRoot,m=re(i*tm),v=rm(m),x=50*te(e.c*u/(e.aW+4),1/2);
return{
J:g,C:b,h:m,s:x,Q:w,M:h,H:v
}

}
var om=new it({
id:"cam16-jmh",cssId:"--cam16-jmh",name:"CAM16-JMh",coords:{
j:{
refRange:[0,100],name:"J"
}
,m:{
refRange:[0,105],name:"Colorfulness"
}
,h:{
refRange:[0,360],type:"angle",name:"Hue"
}

}
,base:Bt,fromBase(t){
let e=El(t,Aa);
return[e.J,e.M,e.h]
}
,toBase(t){
return qn({
J:t[0],M:t[1],h:t[2]
}
,Aa)
}

}
),am=jt.D65,im=216/24389,Cl=24389/27;
function sm(t){
return 116*(t>im?Math.cbrt(t):(Cl*t+16)/116)-16
}
function Un(t){
return t>8?Math.pow((t+16)/116,3):t/Cl
}
function lm(t,e){
let[r,n,o]=t,a=[],i=0;
if(o===0)return[0,0,0];
let s=Un(o);
o>0?i=.00379058511492914*o**2+.608983189401032*o+.9155088574762233:i=9514440756550361e-21*o**2+.08693057439788597*o-21.928975842194614;
let l=2e-12,u=15,f=0,p=1/0;
for(;
f<=u;
){
a=qn({
J:i,C:n,h:r
}
,e);
let g=Math.abs(a[1]-s);
if(g<p){
if(g<=l)return a;
p=g
}
i=i-(a[1]-s)*i/(2*a[1]),f+=1
}
return qn({
J:i,C:n,h:r
}
,e)
}
function cm(t,e){
let r=sm(t[1]);
if(r===0)return[0,0,0];
let n=El(t,To);
return[re(n.h),n.C,r]
}
var To=Ml(am,200/Math.PI*Un(50),Un(50)*100,"average",!1),rr=new it({
id:"hct",name:"HCT",coords:{
h:{
refRange:[0,360],type:"angle",name:"Hue"
}
,c:{
refRange:[0,145],name:"Colorfulness"
}
,t:{
refRange:[0,100],name:"Tone"
}

}
,base:Bt,fromBase(t){
return cm(t)
}
,toBase(t){
return lm(t,To)
}
,formats:{
color:{
id:"--hct",coords:["<number> | <angle>","<percentage> | <number>","<percentage> | <number>"]
}

}

}
),um=Math.PI/180,Ma=[1,.007,.0228];
function Ea(t){
t[1]<0&&(t=rr.fromBase(rr.toBase(t)));
let e=Math.log(Math.max(1+Ma[2]*t[1]*To.flRoot,1))/Ma[2],r=t[0]*um,n=e*Math.cos(r),o=e*Math.sin(r);
return[t[2],n,o]
}
function fm(t,e){
[t,e]=st([t,e]);
let[r,n,o]=Ea(rr.from(t)),[a,i,s]=Ea(rr.from(e));
return Math.sqrt((r-a)**2+(n-i)**2+(o-s)**2)
}
var qe={
deltaE76:Pd,deltaECMC:Bd,deltaE2000:dl,deltaEJz:Ld,deltaEITP:Zd,deltaEOK:$n,deltaEHCT:fm
}
;
function hm(t){
let e=t?Math.floor(Math.log10(Math.abs(t))):0;
return Math.max(parseFloat(`1e${
e-2
}
`),1e-6)
}
var Ca={
hct:{
method:"hct.c",jnd:2,deltaEMethod:"hct",blackWhiteClamp:{

}

}
,"hct-tonal":{
method:"hct.c",jnd:0,deltaEMethod:"hct",blackWhiteClamp:{
channel:"hct.t",min:0,max:100
}

}

}
;
function we(t,{
method:e=Yt.gamut_mapping,space:r=void 0,deltaEMethod:n="",jnd:o=2,blackWhiteClamp:a={

}

}
={

}
){
if(t=st(t),sr(arguments[1])?r=arguments[1]:r||(r=t.space),r=it.get(r),ke(t,r,{
epsilon:0
}
))return t;
let i;
if(e==="css")i=pm(t,{
space:r
}
);
else{
if(e!=="clip"&&!ke(t,r)){
Object.prototype.hasOwnProperty.call(Ca,e)&&({
method:e,jnd:o,deltaEMethod:n,blackWhiteClamp:a
}
=Ca[e]);
let s=dl;
if(n!==""){
for(let u in qe)if("deltae"+n.toLowerCase()===u.toLowerCase()){
s=qe[u];
break
}

}
let l=we(vt(t,r),{
method:"clip",space:r
}
);
if(s(t,l)>o){
if(Object.keys(a).length===3){
let v=it.resolveCoord(a.channel),x=Ht(vt(t,v.space),v.id);
if(ve(x)&&(x=0),x>=a.max)return vt({
space:"xyz-d65",coords:jt.D65
}
,t.space);
if(x<=a.min)return vt({
space:"xyz-d65",coords:[0,0,0]
}
,t.space)
}
let u=it.resolveCoord(e),f=u.space,p=u.id,g=vt(t,f);
g.coords.forEach((v,x)=>{
ve(v)&&(g.coords[x]=0)
}
);
let w=(u.range||u.refRange)[0],b=hm(o),h=w,m=Ht(g,p);
for(;
m-h>b;
){
let v=ze(g);
v=we(v,{
space:r,method:"clip"
}
),s(g,v)-o<b?h=Ht(g,p):m=Ht(g,p),ce(g,p,(h+m)/2)
}
i=vt(g,r)
}
else i=l
}
else i=vt(t,r);
if(e==="clip"||!ke(i,r,{
epsilon:0
}
)){
let s=Object.values(r.coords).map(l=>l.range||[]);
i.coords=i.coords.map((l,u)=>{
let[f,p]=s[u];
return f!==void 0&&(l=Math.max(f,l)),p!==void 0&&(l=Math.min(l,p)),l
}
)
}

}
return r!==t.space&&(i=vt(i,t.space)),t.coords=i.coords,t
}
we.returns="color";
var Sa={
WHITE:{
space:Le,coords:[1,0,0]
}
,BLACK:{
space:Le,coords:[0,0,0]
}

}
;
function pm(t,{
space:e
}
={

}
){
t=st(t),e||(e=t.space),e=it.get(e);
let r=it.get("oklch");
if(e.isUnbounded)return vt(t,e);
let n=vt(t,r),o=n.coords[0];
if(o>=1){
let g=vt(Sa.WHITE,e);
return g.alpha=t.alpha,vt(g,e)
}
if(o<=0){
let g=vt(Sa.BLACK,e);
return g.alpha=t.alpha,vt(g,e)
}
if(ke(n,e,{
epsilon:0
}
))return vt(n,e);
function a(g){
let w=vt(g,e),b=Object.values(e.coords);
return w.coords=w.coords.map((h,m)=>{
if("range"in b[m]){
let[v,x]=b[m].range;
return fl(v,h,x)
}
return h
}
),w
}
let i=0,s=n.coords[1],l=!0,u=ze(n),f=a(u),p=$n(f,u);
if(p<.02)return f;
for(;
s-i>1e-4;
){
let g=(i+s)/2;
if(u.coords[1]=g,l&&ke(u,e,{
epsilon:0
}
))i=g;
else if(f=a(u),p=$n(f,u),p<.02){
if(.02-p<1e-4)break;
l=!1,i=g
}
else s=g
}
return f
}
function vt(t,e,{
inGamut:r
}
={

}
){
t=st(t),e=it.get(e);
let n=e.from(t),o={
space:e,coords:n,alpha:t.alpha
}
;
return r&&(o=we(o,r===!0?void 0:r)),o
}
vt.returns="color";
function Je(t,{
precision:e=Yt.precision,format:r="default",inGamut:n=!0,...o
}
={

}
){
let a;
t=st(t);
let i=r;
r=t.space.getFormat(r)??t.space.getFormat("default")??it.DEFAULT_FORMAT;
let s=t.coords.slice();
if(n||=r.toGamut,n&&!ke(t)&&(s=we(ze(t),n===!0?void 0:n).coords),r.type==="custom")if(o.precision=e,r.serialize)a=r.serialize(s,t.alpha,o);
else throw new TypeError(`format ${
i
}
 can only be used to parse colors, not for serialization`);
else{
let l=r.name||"color";
r.serializeCoords?s=r.serializeCoords(s,e):e!==null&&(s=s.map(g=>Br(g,{
precision:e
}
)));
let u=[...s];
if(l==="color"){
let g=r.id||r.ids?.[0]||t.space.id;
u.unshift(g)
}
let f=t.alpha;
e!==null&&(f=Br(f,{
precision:e
}
));
let p=t.alpha>=1||r.noAlpha?"":`${
r.commas?",":" /"
}
 ${
f
}
`;
a=`${
l
}
(${
u.join(r.commas?", ":" ")
}
${
p
}
)`
}
return a
}
var dm=[[.6369580483012914,.14461690358620832,.1688809751641721],[.2627002120112671,.6779980715188708,.05930171646986196],[0,.028072693049087428,1.060985057710791]],mm=[[1.716651187971268,-.355670783776392,-.25336628137366],[-.666684351832489,1.616481236634939,.0157685458139111],[.017639857445311,-.042770613257809,.942103121235474]],Xr=new qt({
id:"rec2020-linear",cssId:"--rec2020-linear",name:"Linear REC.2020",white:"D65",toXYZ_M:dm,fromXYZ_M:mm
}
),yr=1.09929682680944,_a=.018053968510807,Sl=new qt({
id:"rec2020",name:"REC.2020",base:Xr,toBase(t){
return t.map(function(e){
return e<_a*4.5?e/4.5:Math.pow((e+yr-1)/yr,1/.45)
}
)
}
,fromBase(t){
return t.map(function(e){
return e>=_a?yr*Math.pow(e,.45)-(yr-1):4.5*e
}
)
}

}
),gm=[[.4865709486482162,.26566769316909306,.1982172852343625],[.2289745640697488,.6917385218365064,.079286914093745],[0,.04511338185890264,1.043944368900976]],ym=[[2.493496911941425,-.9313836179191239,-.40271078445071684],[-.8294889695615747,1.7626640603183463,.023624685841943577],[.03584583024378447,-.07617238926804182,.9568845240076872]],_l=new qt({
id:"p3-linear",cssId:"--display-p3-linear",name:"Linear P3",white:"D65",toXYZ_M:gm,fromXYZ_M:ym
}
),vm=[[.41239079926595934,.357584339383878,.1804807884018343],[.21263900587151027,.715168678767756,.07219231536073371],[.01933081871559182,.11919477979462598,.9505321522496607]],_t=[[3.2409699419045226,-1.537383177570094,-.4986107602930034],[-.9692436362808796,1.8759675015077202,.04155505740717559],[.05563007969699366,-.20397695888897652,1.0569715142428786]],kl=new qt({
id:"srgb-linear",name:"Linear sRGB",white:"D65",toXYZ_M:vm,fromXYZ_M:_t
}
),ka={
aliceblue:[240/255,248/255,1],antiquewhite:[250/255,235/255,215/255],aqua:[0,1,1],aquamarine:[127/255,1,212/255],azure:[240/255,1,1],beige:[245/255,245/255,220/255],bisque:[1,228/255,196/255],black:[0,0,0],blanchedalmond:[1,235/255,205/255],blue:[0,0,1],blueviolet:[138/255,43/255,226/255],brown:[165/255,42/255,42/255],burlywood:[222/255,184/255,135/255],cadetblue:[95/255,158/255,160/255],chartreuse:[127/255,1,0],chocolate:[210/255,105/255,30/255],coral:[1,127/255,80/255],cornflowerblue:[100/255,149/255,237/255],cornsilk:[1,248/255,220/255],crimson:[220/255,20/255,60/255],cyan:[0,1,1],darkblue:[0,0,139/255],darkcyan:[0,139/255,139/255],darkgoldenrod:[184/255,134/255,11/255],darkgray:[169/255,169/255,169/255],darkgreen:[0,100/255,0],darkgrey:[169/255,169/255,169/255],darkkhaki:[189/255,183/255,107/255],darkmagenta:[139/255,0,139/255],darkolivegreen:[85/255,107/255,47/255],darkorange:[1,140/255,0],darkorchid:[153/255,50/255,204/255],darkred:[139/255,0,0],darksalmon:[233/255,150/255,122/255],darkseagreen:[143/255,188/255,143/255],darkslateblue:[72/255,61/255,139/255],darkslategray:[47/255,79/255,79/255],darkslategrey:[47/255,79/255,79/255],darkturquoise:[0,206/255,209/255],darkviolet:[148/255,0,211/255],deeppink:[1,20/255,147/255],deepskyblue:[0,191/255,1],dimgray:[105/255,105/255,105/255],dimgrey:[105/255,105/255,105/255],dodgerblue:[30/255,144/255,1],firebrick:[178/255,34/255,34/255],floralwhite:[1,250/255,240/255],forestgreen:[34/255,139/255,34/255],fuchsia:[1,0,1],gainsboro:[220/255,220/255,220/255],ghostwhite:[248/255,248/255,1],gold:[1,215/255,0],goldenrod:[218/255,165/255,32/255],gray:[128/255,128/255,128/255],green:[0,128/255,0],greenyellow:[173/255,1,47/255],grey:[128/255,128/255,128/255],honeydew:[240/255,1,240/255],hotpink:[1,105/255,180/255],indianred:[205/255,92/255,92/255],indigo:[75/255,0,130/255],ivory:[1,1,240/255],khaki:[240/255,230/255,140/255],lavender:[230/255,230/255,250/255],lavenderblush:[1,240/255,245/255],lawngreen:[124/255,252/255,0],lemonchiffon:[1,250/255,205/255],lightblue:[173/255,216/255,230/255],lightcoral:[240/255,128/255,128/255],lightcyan:[224/255,1,1],lightgoldenrodyellow:[250/255,250/255,210/255],lightgray:[211/255,211/255,211/255],lightgreen:[144/255,238/255,144/255],lightgrey:[211/255,211/255,211/255],lightpink:[1,182/255,193/255],lightsalmon:[1,160/255,122/255],lightseagreen:[32/255,178/255,170/255],lightskyblue:[135/255,206/255,250/255],lightslategray:[119/255,136/255,153/255],lightslategrey:[119/255,136/255,153/255],lightsteelblue:[176/255,196/255,222/255],lightyellow:[1,1,224/255],lime:[0,1,0],limegreen:[50/255,205/255,50/255],linen:[250/255,240/255,230/255],magenta:[1,0,1],maroon:[128/255,0,0],mediumaquamarine:[102/255,205/255,170/255],mediumblue:[0,0,205/255],mediumorchid:[186/255,85/255,211/255],mediumpurple:[147/255,112/255,219/255],mediumseagreen:[60/255,179/255,113/255],mediumslateblue:[123/255,104/255,238/255],mediumspringgreen:[0,250/255,154/255],mediumturquoise:[72/255,209/255,204/255],mediumvioletred:[199/255,21/255,133/255],midnightblue:[25/255,25/255,112/255],mintcream:[245/255,1,250/255],mistyrose:[1,228/255,225/255],moccasin:[1,228/255,181/255],navajowhite:[1,222/255,173/255],navy:[0,0,128/255],oldlace:[253/255,245/255,230/255],olive:[128/255,128/255,0],olivedrab:[107/255,142/255,35/255],orange:[1,165/255,0],orangered:[1,69/255,0],orchid:[218/255,112/255,214/255],palegoldenrod:[238/255,232/255,170/255],palegreen:[152/255,251/255,152/255],paleturquoise:[175/255,238/255,238/255],palevioletred:[219/255,112/255,147/255],papayawhip:[1,239/255,213/255],peachpuff:[1,218/255,185/255],peru:[205/255,133/255,63/255],pink:[1,192/255,203/255],plum:[221/255,160/255,221/255],powderblue:[176/255,224/255,230/255],purple:[128/255,0,128/255],rebeccapurple:[102/255,51/255,153/255],red:[1,0,0],rosybrown:[188/255,143/255,143/255],royalblue:[65/255,105/255,225/255],saddlebrown:[139/255,69/255,19/255],salmon:[250/255,128/255,114/255],sandybrown:[244/255,164/255,96/255],seagreen:[46/255,139/255,87/255],seashell:[1,245/255,238/255],sienna:[160/255,82/255,45/255],silver:[192/255,192/255,192/255],skyblue:[135/255,206/255,235/255],slateblue:[106/255,90/255,205/255],slategray:[112/255,128/255,144/255],slategrey:[112/255,128/255,144/255],snow:[1,250/255,250/255],springgreen:[0,1,127/255],steelblue:[70/255,130/255,180/255],tan:[210/255,180/255,140/255],teal:[0,128/255,128/255],thistle:[216/255,191/255,216/255],tomato:[1,99/255,71/255],turquoise:[64/255,224/255,208/255],violet:[238/255,130/255,238/255],wheat:[245/255,222/255,179/255],white:[1,1,1],whitesmoke:[245/255,245/255,245/255],yellow:[1,1,0],yellowgreen:[154/255,205/255,50/255]
}
,Na=Array(3).fill("<percentage> | <number>[0, 255]"),Ta=Array(3).fill("<number>[0, 255]"),Ue=new qt({
id:"srgb",name:"sRGB",base:kl,fromBase:t=>t.map(e=>{
let r=e<0?-1:1,n=e*r;
return n>.0031308?r*(1.055*n**(1/2.4)-.055):12.92*e
}
),toBase:t=>t.map(e=>{
let r=e<0?-1:1,n=e*r;
return n<=.04045?e/12.92:r*((n+.055)/1.055)**2.4
}
),formats:{
rgb:{
coords:Na
}
,rgb_number:{
name:"rgb",commas:!0,coords:Ta,noAlpha:!0
}
,color:{

}
,rgba:{
coords:Na,commas:!0,lastAlpha:!0
}
,rgba_number:{
name:"rgba",commas:!0,coords:Ta
}
,hex:{
type:"custom",toGamut:!0,test:t=>/^#([a-f0-9]{
3,4
}
){
1,2
}
$/i.test(t),parse(t){
t.length<=5&&(t=t.replace(/[a-f0-9]/gi,"$&$&"));
let e=[];
return t.replace(/[a-f0-9]{
2
}
/gi,r=>{
e.push(parseInt(r,16)/255)
}
),{
spaceId:"srgb",coords:e.slice(0,3),alpha:e.slice(3)[0]
}

}
,serialize:(t,e,{
collapse:r=!0
}
={

}
)=>{
e<1&&t.push(e),t=t.map(a=>Math.round(a*255));
let n=r&&t.every(a=>a%17===0);
return"#"+t.map(a=>n?(a/17).toString(16):a.toString(16).padStart(2,"0")).join("")
}

}
,keyword:{
type:"custom",test:t=>/^[a-z]+$/i.test(t),parse(t){
t=t.toLowerCase();
let e={
spaceId:"srgb",coords:null,alpha:1
}
;
if(t==="transparent"?(e.coords=ka.black,e.alpha=0):e.coords=ka[t],e.coords)return e
}

}

}

}
),Nl=new qt({
id:"p3",cssId:"display-p3",name:"P3",base:_l,fromBase:Ue.fromBase,toBase:Ue.toBase
}
);
Yt.display_space=Ue;
var bm;
if(typeof CSS<"u"&&CSS.supports)for(let t of[Wt,Sl,Nl]){
let e=t.getMinCoords(),r=Je({
space:t,coords:e,alpha:1
}
);
if(CSS.supports("color",r)){
Yt.display_space=t;
break
}

}
function wm(t,{
space:e=Yt.display_space,...r
}
={

}
){
let n=Je(t,r);
if(typeof CSS>"u"||CSS.supports("color",n)||!Yt.display_space)n=new String(n),n.color=t;
else{
let o=t;
if((t.coords.some(ve)||ve(t.alpha))&&!(bm??=CSS.supports("color","hsl(none 50% 50%)"))&&(o=ze(t),o.coords=o.coords.map(Et),o.alpha=Et(o.alpha),n=Je(o,r),CSS.supports("color",n)))return n=new String(n),n.color=o,n;
o=vt(o,e),n=new String(Je(o,r)),n.color=o
}
return n
}
function xm(t,e){
return t=st(t),e=st(e),t.space===e.space&&t.alpha===e.alpha&&t.coords.every((r,n)=>r===e.coords[n])
}
function xe(t){
return Ht(t,[Bt,"y"])
}
function Tl(t,e){
ce(t,[Bt,"y"],e)
}
function Am(t){
Object.defineProperty(t.prototype,"luminance",{
get(){
return xe(this)
}
,set(e){
Tl(this,e)
}

}
)
}
var Mm=Object.freeze({
__proto__:null,getLuminance:xe,register:Am,setLuminance:Tl
}
);
function Em(t,e){
t=st(t),e=st(e);
let r=Math.max(xe(t),0),n=Math.max(xe(e),0);
return n>r&&([r,n]=[n,r]),(r+.05)/(n+.05)
}
var Cm=.56,Sm=.57,_m=.62,km=.65,Pa=.022,Nm=1.414,Tm=.1,Pm=5e-4,Im=1.14,Ia=.027,Bm=1.14;
function Ba(t){
return t>=Pa?t:t+(Pa-t)**Nm
}
function Oe(t){
let e=t<0?-1:1,r=Math.abs(t);
return e*Math.pow(r,2.4)
}
function Rm(t,e){
e=st(e),t=st(t);
let r,n,o,a,i,s;
e=vt(e,"srgb"),[a,i,s]=e.coords;
let l=Oe(a)*.2126729+Oe(i)*.7151522+Oe(s)*.072175;
t=vt(t,"srgb"),[a,i,s]=t.coords;
let u=Oe(a)*.2126729+Oe(i)*.7151522+Oe(s)*.072175,f=Ba(l),p=Ba(u),g=p>f;
return Math.abs(p-f)<Pm?n=0:g?(r=p**Cm-f**Sm,n=r*Im):(r=p**km-f**_m,n=r*Bm),Math.abs(n)<Tm?o=0:n>0?o=n-Ia:o=n+Ia,o*100
}
function Om(t,e){
t=st(t),e=st(e);
let r=Math.max(xe(t),0),n=Math.max(xe(e),0);
n>r&&([r,n]=[n,r]);
let o=r+n;
return o===0?0:(r-n)/o
}
var Dm=5e4;
function Fm(t,e){
t=st(t),e=st(e);
let r=Math.max(xe(t),0),n=Math.max(xe(e),0);
return n>r&&([r,n]=[n,r]),n===0?Dm:(r-n)/n
}
function jm(t,e){
t=st(t),e=st(e);
let r=Ht(t,[Wt,"l"]),n=Ht(e,[Wt,"l"]);
return Math.abs(r-n)
}
var $m=216/24389,Ra=24/116,vr=24389/27,mn=jt.D65,Hn=new it({
id:"lab-d65",name:"Lab D65",coords:{
l:{
refRange:[0,100],name:"Lightness"
}
,a:{
refRange:[-125,125]
}
,b:{
refRange:[-125,125]
}

}
,white:mn,base:Bt,fromBase(t){
let e=t.map((r,n)=>r/mn[n]).map(r=>r>$m?Math.cbrt(r):(vr*r+16)/116);
return[116*e[1]-16,500*(e[0]-e[1]),200*(e[1]-e[2])]
}
,toBase(t){
let e=[];
return e[1]=(t[0]+16)/116,e[0]=t[1]/500+e[1],e[2]=e[1]-t[2]/200,[e[0]>Ra?Math.pow(e[0],3):(116*e[0]-16)/vr,t[0]>8?Math.pow((t[0]+16)/116,3):t[0]/vr,e[2]>Ra?Math.pow(e[2],3):(116*e[2]-16)/vr].map((r,n)=>r*mn[n])
}
,formats:{
"lab-d65":{
coords:["<number> | <percentage>","<number> | <percentage>[-1,1]","<number> | <percentage>[-1,1]"]
}

}

}
),gn=Math.pow(5,.5)*.5+.5;
function Lm(t,e){
t=st(t),e=st(e);
let r=Ht(t,[Hn,"l"]),n=Ht(e,[Hn,"l"]),o=Math.abs(Math.pow(r,gn)-Math.pow(n,gn)),a=Math.pow(o,1/gn)*Math.SQRT2-40;
return a<7.5?0:a
}
var Er=Object.freeze({
__proto__:null,contrastAPCA:Rm,contrastDeltaPhi:Lm,contrastLstar:jm,contrastMichelson:Om,contrastWCAG21:Em,contrastWeber:Fm
}
);
function zm(t,e,r={

}
){
sr(r)&&(r={
algorithm:r
}
);
let{
algorithm:n,...o
}
=r;
if(!n){
let a=Object.keys(Er).map(i=>i.replace(/^contrast/,"")).join(", ");
throw new TypeError(`contrast() function needs a contrast algorithm. Please specify one of: ${
a
}
`)
}
t=st(t),e=st(e);
for(let a in Er)if("contrast"+n.toLowerCase()===a.toLowerCase())return Er[a](t,e,o);
throw new TypeError(`Unknown contrast algorithm: ${
n
}
`)
}
function Jr(t){
let[e,r,n]=lr(t,Bt),o=e+15*r+3*n;
return[4*e/o,9*r/o]
}
function Pl(t){
let[e,r,n]=lr(t,Bt),o=e+r+n;
return[e/o,r/o]
}
function qm(t){
Object.defineProperty(t.prototype,"uv",{
get(){
return Jr(this)
}

}
),Object.defineProperty(t.prototype,"xy",{
get(){
return Pl(this)
}

}
)
}
var Um=Object.freeze({
__proto__:null,register:qm,uv:Jr,xy:Pl
}
);
function Ze(t,e,r={

}
){
sr(r)&&(r={
method:r
}
);
let{
method:n=Yt.deltaE,...o
}
=r;
for(let a in qe)if("deltae"+n.toLowerCase()===a.toLowerCase())return qe[a](t,e,o);
throw new TypeError(`Unknown deltaE method: ${
n
}
`)
}
function Hm(t,e=.25){
let r=[it.get("oklch","lch"),"l"];
return ce(t,r,n=>n*(1+e))
}
function Wm(t,e=.25){
let r=[it.get("oklch","lch"),"l"];
return ce(t,r,n=>n*(1-e))
}
var Ym=Object.freeze({
__proto__:null,darken:Wm,lighten:Hm
}
);
function Il(t,e,r=.5,n={

}
){
return[t,e]=[st(t),st(e)],ge(r)==="object"&&([r,n]=[.5,r]),cr(t,e,n)(r)
}
function Bl(t,e,r={

}
){
let n;
Po(t)&&([n,r]=[t,e],[t,e]=n.rangeArgs.colors);
let{
maxDeltaE:o,deltaEMethod:a,steps:i=2,maxSteps:s=1e3,...l
}
=r;
n||([t,e]=[st(t),st(e)],n=cr(t,e,l));
let u=Ze(t,e),f=o>0?Math.max(i,Math.ceil(u/o)+1):i,p=[];
if(s!==void 0&&(f=Math.min(f,s)),f===1)p=[{
p:.5,color:n(.5)
}
];
else{
let g=1/(f-1);
p=Array.from({
length:f
}
,(w,b)=>{
let h=b*g;
return{
p:h,color:n(h)
}

}
)
}
if(o>0){
let g=p.reduce((w,b,h)=>{
if(h===0)return 0;
let m=Ze(b.color,p[h-1].color,a);
return Math.max(w,m)
}
,0);
for(;
g>o;
){
g=0;
for(let w=1;
w<p.length&&p.length<s;
w++){
let b=p[w-1],h=p[w],m=(h.p+b.p)/2,v=n(m);
g=Math.max(g,Ze(v,b.color),Ze(v,h.color)),p.splice(w,0,{
p:m,color:n(m)
}
),w++
}

}

}
return p=p.map(g=>g.color),p
}
function cr(t,e,r={

}
){
if(Po(t)){
let[l,u]=[t,e];
return cr(...l.rangeArgs.colors,{
...l.rangeArgs.options,...u
}
)
}
let{
space:n,outputSpace:o,progression:a,premultiplied:i
}
=r;
t=st(t),e=st(e),t=ze(t),e=ze(e);
let s={
colors:[t,e],options:r
}
;
if(n?n=it.get(n):n=it.registry[Yt.interpolationSpace]||t.space,o=o?it.get(o):n,t=vt(t,n),e=vt(e,n),t=we(t),e=we(e),n.coords.h&&n.coords.h.type==="angle"){
let l=r.hue=r.hue||"shorter",u=[n,"h"],[f,p]=[Ht(t,u),Ht(e,u)];
isNaN(f)&&!isNaN(p)?f=p:isNaN(p)&&!isNaN(f)&&(p=f),[f,p]=Cd(l,[f,p]),ce(t,u,f),ce(e,u,p)
}
return i&&(t.coords=t.coords.map(l=>l*t.alpha),e.coords=e.coords.map(l=>l*e.alpha)),Object.assign(l=>{
l=a?a(l):l;
let u=t.coords.map((g,w)=>{
let b=e.coords[w];
return tr(g,b,l)
}
),f=tr(t.alpha,e.alpha,l),p={
space:n,coords:u,alpha:f
}
;
return i&&(p.coords=p.coords.map(g=>g/f)),o!==n&&(p=vt(p,o)),p
}
,{
rangeArgs:s
}
)
}
function Po(t){
return ge(t)==="function"&&!!t.rangeArgs
}
Yt.interpolationSpace="lab";
function Gm(t){
t.defineFunction("mix",Il,{
returns:"color"
}
),t.defineFunction("range",cr,{
returns:"function<color>"
}
),t.defineFunction("steps",Bl,{
returns:"array<color>"
}
)
}
var Vm=Object.freeze({
__proto__:null,isRange:Po,mix:Il,range:cr,register:Gm,steps:Bl
}
),Rl=new it({
id:"hsl",name:"HSL",coords:{
h:{
refRange:[0,360],type:"angle",name:"Hue"
}
,s:{
range:[0,100],name:"Saturation"
}
,l:{
range:[0,100],name:"Lightness"
}

}
,base:Ue,fromBase:t=>{
let e=Math.max(...t),r=Math.min(...t),[n,o,a]=t,[i,s,l]=[NaN,0,(r+e)/2],u=e-r;
if(u!==0){
switch(s=l===0||l===1?0:(e-l)/Math.min(l,1-l),e){
case n:i=(o-a)/u+(o<a?6:0);
break;
case o:i=(a-n)/u+2;
break;
case a:i=(n-o)/u+4
}
i=i*60
}
return s<0&&(i+=180,s=Math.abs(s)),i>=360&&(i-=360),[i,s*100,l*100]
}
,toBase:t=>{
let[e,r,n]=t;
e=e%360,e<0&&(e+=360),r/=100,n/=100;
function o(a){
let i=(a+e/30)%12,s=r*Math.min(n,1-n);
return n-s*Math.max(-1,Math.min(i-3,9-i,1))
}
return[o(0),o(8),o(4)]
}
,formats:{
hsl:{
coords:["<number> | <angle>","<percentage>","<percentage>"]
}
,hsla:{
coords:["<number> | <angle>","<percentage>","<percentage>"],commas:!0,lastAlpha:!0
}

}

}
),Ol=new it({
id:"hsv",name:"HSV",coords:{
h:{
refRange:[0,360],type:"angle",name:"Hue"
}
,s:{
range:[0,100],name:"Saturation"
}
,v:{
range:[0,100],name:"Value"
}

}
,base:Rl,fromBase(t){
let[e,r,n]=t;
r/=100,n/=100;
let o=n+r*Math.min(n,1-n);
return[e,o===0?0:200*(1-n/o),100*o]
}
,toBase(t){
let[e,r,n]=t;
r/=100,n/=100;
let o=n*(1-r/2);
return[e,o===0||o===1?0:(n-o)/Math.min(o,1-o)*100,o*100]
}
,formats:{
color:{
id:"--hsv",coords:["<number> | <angle>","<percentage> | <number>","<percentage> | <number>"]
}

}

}
),Zm=new it({
id:"hwb",name:"HWB",coords:{
h:{
refRange:[0,360],type:"angle",name:"Hue"
}
,w:{
range:[0,100],name:"Whiteness"
}
,b:{
range:[0,100],name:"Blackness"
}

}
,base:Ol,fromBase(t){
let[e,r,n]=t;
return[e,n*(100-r)/100,100-n]
}
,toBase(t){
let[e,r,n]=t;
r/=100,n/=100;
let o=r+n;
if(o>=1){
let s=r/o;
return[e,0,s*100]
}
let a=1-n,i=a===0?0:1-r/a;
return[e,i*100,a*100]
}
,formats:{
hwb:{
coords:["<number> | <angle>","<percentage> | <number>","<percentage> | <number>"]
}

}

}
),Xm=[[.5766690429101305,.1855582379065463,.1882286462349947],[.29734497525053605,.6273635662554661,.07529145849399788],[.02703136138641234,.07068885253582723,.9913375368376388]],Jm=[[2.0415879038107465,-.5650069742788596,-.34473135077832956],[-.9692436362808795,1.8759675015077202,.04155505740717557],[.013444280632031142,-.11836239223101838,1.0151749943912054]],Dl=new qt({
id:"a98rgb-linear",cssId:"--a98-rgb-linear",name:"Linear Adobe\xAE 98 RGB compatible",white:"D65",toXYZ_M:Xm,fromXYZ_M:Jm
}
),Qm=new qt({
id:"a98rgb",cssId:"a98-rgb",name:"Adobe\xAE 98 RGB compatible",base:Dl,toBase:t=>t.map(e=>Math.pow(Math.abs(e),563/256)*Math.sign(e)),fromBase:t=>t.map(e=>Math.pow(Math.abs(e),256/563)*Math.sign(e))
}
),Km=[[.7977666449006423,.13518129740053308,.0313477341283922],[.2880748288194013,.711835234241873,8993693872564e-17],[0,0,.8251046025104602]],tg=[[1.3457868816471583,-.25557208737979464,-.05110186497554526],[-.5446307051249019,1.5082477428451468,.02052744743642139],[0,0,1.2119675456389452]],Fl=new qt({
id:"prophoto-linear",cssId:"--prophoto-rgb-linear",name:"Linear ProPhoto",white:"D50",base:ko,toXYZ_M:Km,fromXYZ_M:tg
}
),eg=1/512,rg=16/512,ng=new qt({
id:"prophoto",cssId:"prophoto-rgb",name:"ProPhoto",base:Fl,toBase(t){
return t.map(e=>e<rg?e/16:e**1.8)
}
,fromBase(t){
return t.map(e=>e>=eg?e**(1/1.8):16*e)
}

}
),og=new it({
id:"oklch",name:"Oklch",coords:{
l:{
refRange:[0,1],name:"Lightness"
}
,c:{
refRange:[0,.4],name:"Chroma"
}
,h:{
refRange:[0,360],type:"angle",name:"Hue"
}

}
,white:"D65",base:Le,fromBase(t){
let[e,r,n]=t,o,a=2e-4;
return Math.abs(r)<a&&Math.abs(n)<a?o=NaN:o=Math.atan2(n,r)*180/Math.PI,[e,Math.sqrt(r**2+n**2),re(o)]
}
,toBase(t){
let[e,r,n]=t,o,a;
return isNaN(n)?(o=0,a=0):(o=r*Math.cos(n*Math.PI/180),a=r*Math.sin(n*Math.PI/180)),[e,o,a]
}
,formats:{
oklch:{
coords:["<percentage> | <number>","<number> | <percentage>[0,1]","<number> | <angle>"]
}

}

}
),jl=jt.D65,ag=216/24389,Oa=24389/27,[Da,Fa]=Jr({
space:Bt,coords:jl
}
),$l=new it({
id:"luv",name:"Luv",coords:{
l:{
refRange:[0,100],name:"Lightness"
}
,u:{
refRange:[-215,215]
}
,v:{
refRange:[-215,215]
}

}
,white:jl,base:Bt,fromBase(t){
let e=[Et(t[0]),Et(t[1]),Et(t[2])],r=e[1],[n,o]=Jr({
space:Bt,coords:e
}
);
if(!Number.isFinite(n)||!Number.isFinite(o))return[0,0,0];
let a=r<=ag?Oa*r:116*Math.cbrt(r)-16;
return[a,13*a*(n-Da),13*a*(o-Fa)]
}
,toBase(t){
let[e,r,n]=t;
if(e===0||ve(e))return[0,0,0];
r=Et(r),n=Et(n);
let o=r/(13*e)+Da,a=n/(13*e)+Fa,i=e<=8?e/Oa:Math.pow((e+16)/116,3);
return[i*(9*o/(4*a)),i,i*((12-3*o-20*a)/(4*a))]
}
,formats:{
color:{
id:"--luv",coords:["<number> | <percentage>","<number> | <percentage>[-1,1]","<number> | <percentage>[-1,1]"]
}

}

}
),Io=new it({
id:"lchuv",name:"LChuv",coords:{
l:{
refRange:[0,100],name:"Lightness"
}
,c:{
refRange:[0,220],name:"Chroma"
}
,h:{
refRange:[0,360],type:"angle",name:"Hue"
}

}
,base:$l,fromBase(t){
let[e,r,n]=t,o,a=.02;
return Math.abs(r)<a&&Math.abs(n)<a?o=NaN:o=Math.atan2(n,r)*180/Math.PI,[e,Math.sqrt(r**2+n**2),re(o)]
}
,toBase(t){
let[e,r,n]=t;
return r<0&&(r=0),isNaN(n)&&(n=0),[e,r*Math.cos(n*Math.PI/180),r*Math.sin(n*Math.PI/180)]
}
,formats:{
color:{
id:"--lchuv",coords:["<number> | <percentage>","<number> | <percentage>","<number> | <angle>"]
}

}

}
),ig=216/24389,sg=24389/27,ja=_t[0][0],$a=_t[0][1],yn=_t[0][2],La=_t[1][0],za=_t[1][1],vn=_t[1][2],qa=_t[2][0],Ua=_t[2][1],bn=_t[2][2];
function De(t,e,r){
let n=e/(Math.sin(r)-t*Math.cos(r));
return n<0?1/0:n
}
function Dr(t){
let e=Math.pow(t+16,3)/1560896,r=e>ig?e:t/sg,n=r*(284517*ja-94839*yn),o=r*(838422*yn+769860*$a+731718*ja),a=r*(632260*yn-126452*$a),i=r*(284517*La-94839*vn),s=r*(838422*vn+769860*za+731718*La),l=r*(632260*vn-126452*za),u=r*(284517*qa-94839*bn),f=r*(838422*bn+769860*Ua+731718*qa),p=r*(632260*bn-126452*Ua);
return{
r0s:n/a,r0i:o*t/a,r1s:n/(a+126452),r1i:(o-769860)*t/(a+126452),g0s:i/l,g0i:s*t/l,g1s:i/(l+126452),g1i:(s-769860)*t/(l+126452),b0s:u/p,b0i:f*t/p,b1s:u/(p+126452),b1i:(f-769860)*t/(p+126452)
}

}
function Ha(t,e){
let r=e/360*Math.PI*2,n=De(t.r0s,t.r0i,r),o=De(t.r1s,t.r1i,r),a=De(t.g0s,t.g0i,r),i=De(t.g1s,t.g1i,r),s=De(t.b0s,t.b0i,r),l=De(t.b1s,t.b1i,r);
return Math.min(n,o,a,i,s,l)
}
var lg=new it({
id:"hsluv",name:"HSLuv",coords:{
h:{
refRange:[0,360],type:"angle",name:"Hue"
}
,s:{
range:[0,100],name:"Saturation"
}
,l:{
range:[0,100],name:"Lightness"
}

}
,base:Io,gamutSpace:Ue,fromBase(t){
let[e,r,n]=[Et(t[0]),Et(t[1]),Et(t[2])],o;
if(e>99.9999999)o=0,e=100;
else if(e<1e-8)o=0,e=0;
else{
let a=Dr(e),i=Ha(a,n);
o=r/i*100
}
return[n,o,e]
}
,toBase(t){
let[e,r,n]=[Et(t[0]),Et(t[1]),Et(t[2])],o;
if(n>99.9999999)n=100,o=0;
else if(n<1e-8)n=0,o=0;
else{
let a=Dr(n);
o=Ha(a,e)/100*r
}
return[n,o,e]
}
,formats:{
color:{
id:"--hsluv",coords:["<number> | <angle>","<percentage> | <number>","<percentage> | <number>"]
}

}

}
);
_t[0][0];
_t[0][1];
_t[0][2];
_t[1][0];
_t[1][1];
_t[1][2];
_t[2][0];
_t[2][1];
_t[2][2];
function Fe(t,e){
return Math.abs(e)/Math.sqrt(Math.pow(t,2)+1)
}
function Wa(t){
let e=Fe(t.r0s,t.r0i),r=Fe(t.r1s,t.r1i),n=Fe(t.g0s,t.g0i),o=Fe(t.g1s,t.g1i),a=Fe(t.b0s,t.b0i),i=Fe(t.b1s,t.b1i);
return Math.min(e,r,n,o,a,i)
}
var cg=new it({
id:"hpluv",name:"HPLuv",coords:{
h:{
refRange:[0,360],type:"angle",name:"Hue"
}
,s:{
range:[0,100],name:"Saturation"
}
,l:{
range:[0,100],name:"Lightness"
}

}
,base:Io,gamutSpace:"self",fromBase(t){
let[e,r,n]=[Et(t[0]),Et(t[1]),Et(t[2])],o;
if(e>99.9999999)o=0,e=100;
else if(e<1e-8)o=0,e=0;
else{
let a=Dr(e),i=Wa(a);
o=r/i*100
}
return[n,o,e]
}
,toBase(t){
let[e,r,n]=[Et(t[0]),Et(t[1]),Et(t[2])],o;
if(n>99.9999999)n=100,o=0;
else if(n<1e-8)n=0,o=0;
else{
let a=Dr(n);
o=Wa(a)/100*r
}
return[n,o,e]
}
,formats:{
color:{
id:"--hpluv",coords:["<number> | <angle>","<percentage> | <number>","<percentage> | <number>"]
}

}

}
),Ya=203,Ga=2610/2**14,ug=2**14/2610,fg=2523/2**5,Va=2**5/2523,Za=3424/2**12,Xa=2413/2**7,Ja=2392/2**7,hg=new qt({
id:"rec2100pq",cssId:"rec2100-pq",name:"REC.2100-PQ",base:Xr,toBase(t){
return t.map(function(e){
return(Math.max(e**Va-Za,0)/(Xa-Ja*e**Va))**ug*1e4/Ya
}
)
}
,fromBase(t){
return t.map(function(e){
let r=Math.max(e*Ya/1e4,0),n=Za+Xa*r**Ga,o=1+Ja*r**Ga;
return(n/o)**fg
}
)
}

}
),Qa=.17883277,Ka=.28466892,ti=.55991073,wn=3.7743,pg=new qt({
id:"rec2100hlg",cssId:"rec2100-hlg",name:"REC.2100-HLG",referred:"scene",base:Xr,toBase(t){
return t.map(function(e){
return e<=.5?e**2/3*wn:(Math.exp((e-ti)/Qa)+Ka)/12*wn
}
)
}
,fromBase(t){
return t.map(function(e){
return e/=wn,e<=1/12?Math.sqrt(3*e):Qa*Math.log(12*e-Ka)+ti
}
)
}

}
),Ll={

}
;
be.add("chromatic-adaptation-start",t=>{
t.options.method&&(t.M=zl(t.W1,t.W2,t.options.method))
}
);
be.add("chromatic-adaptation-end",t=>{
t.M||(t.M=zl(t.W1,t.W2,t.options.method))
}
);
function Qr({
id:t,toCone_M:e,fromCone_M:r
}
){
Ll[t]=arguments[0]
}
function zl(t,e,r="Bradford"){
let n=Ll[r],[o,a,i]=bt(n.toCone_M,t),[s,l,u]=bt(n.toCone_M,e),f=[[s/o,0,0],[0,l/a,0],[0,0,u/i]],p=bt(f,n.toCone_M);
return bt(n.fromCone_M,p)
}
Qr({
id:"von Kries",toCone_M:[[.40024,.7076,-.08081],[-.2263,1.16532,.0457],[0,0,.91822]],fromCone_M:[[1.8599363874558397,-1.1293816185800916,.21989740959619328],[.3611914362417676,.6388124632850422,-6370596838649899e-21],[0,0,1.0890636230968613]]
}
);
Qr({
id:"Bradford",toCone_M:[[.8951,.2664,-.1614],[-.7502,1.7135,.0367],[.0389,-.0685,1.0296]],fromCone_M:[[.9869929054667121,-.14705425642099013,.15996265166373122],[.4323052697233945,.5183602715367774,.049291228212855594],[-.00852866457517732,.04004282165408486,.96848669578755]]
}
);
Qr({
id:"CAT02",toCone_M:[[.7328,.4296,-.1624],[-.7036,1.6975,.0061],[.003,.0136,.9834]],fromCone_M:[[1.0961238208355142,-.27886900021828726,.18274517938277307],[.4543690419753592,.4735331543074117,.07209780371722911],[-.009627608738429355,-.00569803121611342,1.0153256399545427]]
}
);
Qr({
id:"CAT16",toCone_M:[[.401288,.650173,-.051461],[-.250268,1.204414,.045854],[-.002079,.048952,.953127]],fromCone_M:[[1.862067855087233,-1.0112546305316845,.14918677544445172],[.3875265432361372,.6214474419314753,-.008973985167612521],[-.01584149884933386,-.03412293802851557,1.0499644368778496]]
}
);
Object.assign(jt,{
A:[1.0985,1,.35585],C:[.98074,1,1.18232],D55:[.95682,1,.92149],D75:[.94972,1,1.22638],E:[1,1,1],F2:[.99186,1,.67393],F7:[.95041,1,1.08747],F11:[1.00962,1,.6435]
}
);
jt.ACES=[.32168/.33767,1,(1-.32168-.33767)/.33767];
var dg=[[.6624541811085053,.13400420645643313,.1561876870049078],[.27222871678091454,.6740817658111484,.05368951740793705],[-.005574649490394108,.004060733528982826,1.0103391003129971]],mg=[[1.6410233796943257,-.32480329418479,-.23642469523761225],[-.6636628587229829,1.6153315916573379,.016756347685530137],[.011721894328375376,-.008284441996237409,.9883948585390215]],ql=new qt({
id:"acescg",cssId:"--acescg",name:"ACEScg",coords:{
r:{
range:[0,65504],name:"Red"
}
,g:{
range:[0,65504],name:"Green"
}
,b:{
range:[0,65504],name:"Blue"
}

}
,referred:"scene",white:jt.ACES,toXYZ_M:dg,fromXYZ_M:mg
}
),br=2**-16,xn=-.35828683,wr=(Math.log2(65504)+9.72)/17.52,gg=new qt({
id:"acescc",cssId:"--acescc",name:"ACEScc",coords:{
r:{
range:[xn,wr],name:"Red"
}
,g:{
range:[xn,wr],name:"Green"
}
,b:{
range:[xn,wr],name:"Blue"
}

}
,referred:"scene",base:ql,toBase(t){
let e=-.3013698630136986;
return t.map(function(r){
return r<=e?(2**(r*17.52-9.72)-br)*2:r<wr?2**(r*17.52-9.72):65504
}
)
}
,fromBase(t){
return t.map(function(e){
return e<=0?(Math.log2(br)+9.72)/17.52:e<br?(Math.log2(br+e*.5)+9.72)/17.52:(Math.log2(e)+9.72)/17.52
}
)
}

}
),ei=Object.freeze({
__proto__:null,A98RGB:Qm,A98RGB_Linear:Dl,ACEScc:gg,ACEScg:ql,CAM16_JMh:om,HCT:rr,HPLuv:cg,HSL:Rl,HSLuv:lg,HSV:Ol,HWB:Zm,ICTCP:zn,JzCzHz:Ln,Jzazbz:gl,LCH:er,LCHuv:Io,Lab:Wt,Lab_D65:Hn,Luv:$l,OKLCH:og,OKLab:Le,P3:Nl,P3_Linear:_l,ProPhoto:ng,ProPhoto_Linear:Fl,REC_2020:Sl,REC_2020_Linear:Xr,REC_2100_HLG:pg,REC_2100_PQ:hg,XYZ_ABS_D65:No,XYZ_D50:ko,XYZ_D65:Bt,sRGB:Ue,sRGB_Linear:kl
}
),pt=class{
constructor(...t){
let e;
t.length===1&&(e=st(t[0]));
let r,n,o;
e?(r=e.space||e.spaceId,n=e.coords,o=e.alpha):[r,n,o]=t,Object.defineProperty(this,"space",{
value:it.get(r),writable:!1,enumerable:!0,configurable:!0
}
),this.coords=n?n.slice():[0,0,0],this.alpha=o>1||o===void 0?1:o<0?0:o;
for(let a=0;
a<this.coords.length;
a++)this.coords[a]==="NaN"&&(this.coords[a]=NaN);
for(let a in this.space.coords)Object.defineProperty(this,a,{
get:()=>this.get(a),set:i=>this.set(a,i)
}
)
}
get spaceId(){
return this.space.id
}
clone(){
return new pt(this.space,this.coords,this.alpha)
}
toJSON(){
return{
spaceId:this.spaceId,coords:this.coords,alpha:this.alpha
}

}
display(...t){
let e=wm(this,...t);
return e.color=new pt(e.color),e
}
static get(t,...e){
return t instanceof pt?t:new pt(t,...e)
}
static defineFunction(t,e,r=e){
let{
instance:n=!0,returns:o
}
=r,a=function(...i){
let s=e(...i);
if(o==="color")s=pt.get(s);
else if(o==="function<color>"){
let l=s;
s=function(...u){
let f=l(...u);
return pt.get(f)
}
,Object.assign(s,l)
}
else o==="array<color>"&&(s=s.map(l=>pt.get(l)));
return s
}
;
t in pt||(pt[t]=a),n&&(pt.prototype[t]=function(...i){
return a(this,...i)
}
)
}
static defineFunctions(t){
for(let e in t)pt.defineFunction(e,t[e],t[e])
}
static extend(t){
if(t.register)t.register(pt);
else for(let e in t)pt.defineFunction(e,t[e])
}

}
;
pt.defineFunctions({
get:Ht,getAll:lr,set:ce,setAll:_o,to:vt,equals:xm,inGamut:ke,toGamut:we,distance:ml,toString:Je
}
);
Object.assign(pt,{
util:bd,hooks:be,WHITES:jt,Space:it,spaces:it.registry,parse:pl,defaults:Yt
}
);
for(let t of Object.keys(ei))it.register(ei[t]);
for(let t in it.registry)Wn(t,it.registry[t]);
be.add("colorspace-init-end",t=>{
Wn(t.id,t),t.aliases?.forEach(e=>{
Wn(e,t)
}
)
}
);
function Wn(t,e){
let r=t.replace(/-/g,"_");
Object.defineProperty(pt.prototype,r,{
get(){
let n=this.getAll(t);
return typeof Proxy>"u"?n:new Proxy(n,{
has:(o,a)=>{
try{
return it.resolveCoord([e,a]),!0
}
catch{

}
return Reflect.has(o,a)
}
,get:(o,a,i)=>{
if(a&&typeof a!="symbol"&&!(a in o)){
let{
index:s
}
=it.resolveCoord([e,a]);
if(s>=0)return o[s]
}
return Reflect.get(o,a,i)
}
,set:(o,a,i,s)=>{
if(a&&typeof a!="symbol"&&!(a in o)||a>=0){
let{
index:l
}
=it.resolveCoord([e,a]);
if(l>=0)return o[l]=i,this.setAll(t,o),!0
}
return Reflect.set(o,a,i,s)
}

}
)
}
,set(n){
this.setAll(t,n)
}
,configurable:!0,enumerable:!0
}
)
}
pt.extend(qe);
pt.extend({
deltaE:Ze
}
);
Object.assign(pt,{
deltaEMethods:qe
}
);
pt.extend(Ym);
pt.extend({
contrast:zm
}
);
pt.extend(Um);
pt.extend(Mm);
pt.extend(Vm);
pt.extend(Er);
function yg(t,e=!1){
if(typeof t=="string")try{
let r=new pt(t),{
r:n,g:o,b:a
}
=r.srgb,i=+r.alpha,s=l=>Math.max(0,Math.min(1,l));
return{
r:s(n),g:s(o),b:s(a),a:i
}

}
catch(r){
e||console.error("toRGBA",r.message,t)
}
else return t
}
var{
stringify:gy,unit:yy
}
=yd.default;
function Yn(t,e){
if(t.endsWith("px"))return parseFloat(t);
if(t.endsWith("%"))return parseFloat(t)/100*e
}
U();
var Bo=Pt(Te(),1),{
fromRotation:vg,create:Gn,scale:bg
}
=Vr;
function Ul(t){
let e,r=u=>{
e=Ro(e,u)
}
,{
transform:n,rotate:o,scale:a
}
=t,i=xg(o);
i&&r(i);
let s=wg(a);
s&&r(s);
let l=Hl(n);
return l&&r(l),e
}
function Hl(t){
if(t&&t!=="none"){
let e=(0,Bo.default)(t).nodes[0];
if(e){
if(e.type==="function"&&e.value==="matrix"){
let[r,n,o,a,i,s]=na(e.nodes).map(([l])=>parseFloat(l.value));
return Wp({
a:r,b:n,c:o,d:a,e:i,f:s
}
)
}
else if(e.type==="function"&&e.value==="matrix3d")return na(e.nodes).map(([r])=>parseFloat(r.value))
}

}

}
function wg(t){
if(t&&t!=="none"){
let e=(0,Bo.default)(t),r=Ir(e.nodes),n=parseFloat(r[0].value),o=n,a=1;
return r.length>=2&&(o=parseFloat(r[1].value),r.length===3&&(a=parseFloat(r[2].value))),bg(Gn(),Gn(),[n,o,a])
}

}
function xg(t){
if(t&&t!=="none"){
let e=(0,Bo.default)(t),r=Ir(e.nodes),n=[0,0,1],o=r[0];
switch(r.length){
case 2:{
switch(r[0].value){
case"x":n=[1,0,0];
break;
case"y":n=[0,1,0];
break;
default:n=[0,0,1];
break
}
o=r[1];
break
}
case 4:{
n=r.slice(0,3).map(i=>parseFloat(i.value)),o=r[3];
break
}

}
let a=parseFloat(o.value);
if(!isNaN(a))return vg(Gn(),a*Math.PI/180,n)
}

}
function Ro(t,e){
return t?e?Mo(t,e):t:e
}
U();
function Ag(t){
return(t&64512)===55296
}
function Wl(t,e=0){
if(!t||e<0||e>=t.length)return 0;
if(Ag(t.charCodeAt(e)))return 2;
let r=1;
for(;
e+r<t.length;
){
let n=t.codePointAt(e+r);
if(!n||!Mg(n))break;
r+=n>65535?2:1
}
return r
}
function Mg(t){
return t===void 0?!1:Gt.all(t)
}
var Gt={
_common:t=>t>=768&&t<=879,_arabic:t=>t>=1611&&t<=1631||t===1648,_hebrew:t=>t>=1456&&t<=1469||t===1471,_devanagari:t=>t>=2362&&t<=2383||t>=2385&&t<=2391,_thai:t=>t>=3633&&t<=3642||t>=3653&&t<=3662||t===8204||t===8205,_cyrillic:t=>t>=11744&&t<=11775||t>=1155&&t<=1161,_tibetan:t=>t>=3864&&t<=3865||t>=3893&&t<=3897||t>=3953&&t<=3972||t>=3974&&t<=3991||t>=3993&&t<=4028,_myanmar:t=>t>=4151&&t<=4158||t>=4184&&t<=4190||t>=4209&&t<=4212||t>=4226&&t<=4237||t===4253,_korean:t=>t>=12334&&t<=12335,_japanese:t=>t===12441||t===12442,_emojiModifiers:t=>t>=127995&&t<=127999||t===65038||t===65039||t===9792||t===9794||t===9877||t===9878||t===9992||t===10084||t===8205,all:t=>Gt._common(t)||Gt._arabic(t)||Gt._hebrew(t)||Gt._devanagari(t)||Gt._thai(t)||Gt._cyrillic(t)||Gt._tibetan(t)||Gt._myanmar(t)||Gt._korean(t)||Gt._japanese(t)||Gt._emojiModifiers(t)
}
;
async function Yl(t,e,r){
if(!e)return;
let[n,o]=e.split("#"),a=me().document;
return n&&(a=await(t[n]??(t[n]=n===document.location.href?document:fetch(n).then(i=>i.text()).then(i=>new DOMParser().parseFromString(i,"image/svg+xml"))))),!o&&n?a.firstElementChild:Eg(a,o,r)
}
function Eg(t,e,r=""){
try{
return t.querySelector(`${
r
}
#${
e
}
`)
}
catch{
return t.querySelector(`${
r
}
[id="${
e
}
"]`)
}

}
var Cg=async(t,e)=>{
for(let r of Yr(e,"use"))try{
r.removeAttribute("id");
let n=r.href?.animVal,o=await Yl(t,n);
if(o){
let a=o.id,i=o.outerHTML;
o.tagName!=="symbol"&&(i=`<defs>${
i
}
</defs>`),r.href.baseVal=`#${
a
}
`,r.outerHTML=i+r.outerHTML
}

}
catch(n){
console.error("Error querying <use> tag href",n)
}

}
,Gl=["alignment-baseline","baseline-shift","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-rendering","direction","dominant-baseline","fill","fill-opacity","fill-rule","filter","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","image-rendering","letter-spacing","lighting-color","marker-end","marker-mid","marker-start","mask","opacity","pointer-events","shape-rendering","stop-color","stop-opacity","stroke","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke-width","text-decoration","text-anchor","text-decoration","text-rendering","transform","unicode-bidi","user-select","vector-effect","visibility","word-spacing","writing-mode"],Sg={
"alignment-baseline":"auto","baseline-shift":"0px","clip-path":"none","clip-rule":"nonzero",color:"rgb(0, 0, 0)","color-interpolation":"srgb","color-interpolation-filters":"linearrgb","color-rendering":"auto",direction:"ltr","dominant-baseline":"auto",fill:"rgb(0, 0, 0)","fill-opacity":"1","fill-rule":"nonzero",filter:"none","flood-color":"rgb(0, 0, 0)","flood-opacity":"1","font-family":"","font-size":"16px","font-size-adjust":"none","font-stretch":"100%","font-style":"normal","font-variant":"normal","font-weight":"400","image-rendering":"auto","letter-spacing":"normal","lighting-color":"rgb(255, 255, 255)","marker-end":"none","marker-mid":"none","marker-start":"none",mask:"none",opacity:"1","pointer-events":"auto","shape-rendering":"auto","stop-color":"rgb(0, 0, 0)","stop-opacity":"1",stroke:"none","stroke-dasharray":"none","stroke-dashoffset":"0px","stroke-linecap":"butt","stroke-linejoin":"miter","stroke-miterlimit":"4","stroke-opacity":"1","stroke-width":"1px","text-anchor":"start","text-decoration":"rgb(0, 0, 0)","text-rendering":"auto",transform:"none","unicode-bidi":"normal","user-select":"auto","vector-effect":"none",visibility:"visible","word-spacing":"0px","writing-mode":"horizontal-tb"
}
,_g=new Set(["clip-rule","color","color-interpolation","color-interpolation-filters","color-rendering","direction","dominant-baseline","fill","fill-opacity","fill-rule","font","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","image-rendering","letter-spacing","line-height","marker-end","marker-mid","marker-start","pointer-events","stroke","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke-width","text-align","text-anchor","text-decoration","text-indent","text-rendering","text-transform","unicode-bidi","user-select","visibility","white-space","word-spacing","writing-mode"]);
function Vl(t,e,r,n){
let o=t.parentElement&&Ae(t.parentElement)?getComputedStyle(t.parentElement):null,a=Ig(t);
for(let i of Gl){
r.style.removeProperty(i);
let s=e.getPropertyValue(i),l=r.getAttribute(i),u=l;
if(o&&_g.has(i)&&(u??(u=o.getPropertyValue(i))),u??(u=Sg[i]),u=ri(i,u,n),s=ri(i,s,n),!!s){
if(i==="stroke-dasharray"&&Gu(t)){
let f=t.getTotalLength(),p=parseFloat(s.split(", ")[0]);
!isNaN(p)&&p>=f&&(s="none")
}
s!==l&&(!l&&!a&&s===u||Ut.default.env.VITEST&&i==="font-family"||r.setAttribute(i,s))
}

}

}
function ri(t,e,r){
if(e?.startsWith("lch(")||e?.startsWith("lab(")||e?.startsWith("oklab(")||e?.startsWith("oklch("))try{
e=new pt(e).to("srgb").toString()
}
catch(n){
$t.exception("fixColor",n,{
key:t,value:e
}
)
}
return e=e?.replace(/url\((['"])(.*?)\1\)/g,"url($2)"),e?.endsWith("%")&&Gl.includes(t)&&(e=(Yn(e,Lu(r))??0).toString()),e
}
var kg=t=>Array.from(Yr(t,"animate, animateMotion, animateTransform")).map(e=>{
let r=e,n=r.parentElement;
for(;
n!==null&&n!==t;
){
if(n instanceof SVGSVGElement)return n.pauseAnimations(),r.beginElement(),n;
n=n.parentElement
}

}
).filter(e=>!!e);
function Ng(t,e){
let r,n=getComputedStyle(t),{
width:o,height:a
}
=n;
o!=="auto"&&e.setAttribute("width",o),a!=="auto"&&e.setAttribute("height",a),t.getAttribute("viewBox")?r=Eo(t.viewBox.animVal):(r={
x:0,y:0,width:kr(n.width),height:kr(n.height)
}
,e.setAttribute("viewBox",`0 0 ${
r.width
}
 ${
r.height
}
`)),Zl(t,r,e)
}
function Zl(t,e,r){
for(let n=0;
n<t.children.length;
n++){
let o=t.children[n],a=r.children[n],i={
...e
}
;
if(Wr(o)||Wu(o)){
let s=o.getAttribute("width");
if(s){
let u=Yn(s,e.width);
u&&(i.width=u)
}
else a.setAttribute("width",`${
e.width
}
px`);
let l=o.getAttribute("height");
if(l){
let u=Yn(l,e.height);
u&&(i.height=u)
}
else a.setAttribute("height",`${
e.height
}
px`);
o.getAttribute("viewBox")?i=Eo(o.viewBox.animVal):a.setAttribute("viewBox",`0 0 ${
i.width
}
 ${
i.height
}
`)
}
Zl(o,i,a)
}

}
function Tg(t,e,r){
try{
let n=Hl(r.transform);
if(n){
let[o,a]=r.transformOrigin.split(" ").map(parseFloat),i=Zp(Mo(ra(o,a),n,ra(-o,-a)),!0);
e.setAttribute("transform",i)
}
if(r.textTransform==="uppercase"&&e.childNodes.forEach(o=>mo(o)&&o.nodeValue&&(o.nodeValue=o.nodeValue?.toUpperCase())),Hu(t)){
let o=e.parentElement;
if(o){
let a=e.textContent?.trim()||"";
for(let i=0;
i<a.length;
i++){
let s=i,l=t.getStartPositionOfChar(i),u=(i+=Wl(a,i)-1)+1,f=t.getEndPositionOfChar(i),p=Math.hypot(f.x-l.x,f.y-l.y),g=Math.atan2(f.y-l.y,f.x-l.x)*(180/Math.PI);
if(p!==0){
let w=document.createElementNS("http://www.w3.org/2000/svg","tspan");
Vl(w,r,w,t.ownerSVGElement.viewBox.animVal),w.setAttribute("x",String(l.x)),w.setAttribute("y",String(l.y)),w.setAttribute("rotate",String(g)),w.textContent=a.slice(s,u),o.appendChild(w)
}

}

}

}

}
catch(n){
$t.exception("fixUnsupportedFeatures",n)
}

}
async function Pg(t){
return Promise.all(Array.from(t.querySelectorAll("image")).map(async e=>{
let r=e.href.animVal;
if(!r||r.startsWith("data:"))return;
let n=await fetch(r).then(async o=>{
if(!o.ok)return;
let a=await o.blob();
return new Promise((i,s)=>{
let l=new FileReader;
l.onloadend=()=>i(l.result),l.onerror=s,l.readAsDataURL(a)
}
)
}
).catch(()=>{

}
);
n&&e.setAttribute("href",n)
}
))
}
function Xl(t,e){
if(ar(t)&&Ae(t)){
let r=e,n=getComputedStyle(t);
Vl(t,n,r,(Wr(t)?t:t.ownerSVGElement).viewBox.animVal),Tg(t,r,n);
for(let o of r.attributes)o.name.includes(";
")&&r.removeAttribute(o.name);
Array.from(t.childNodes).map((o,a)=>({
child:o,targetChild:r.childNodes[a]
}
)).forEach(({
child:o,targetChild:a
}
)=>{
Xl(o,a)
}
)
}

}
function Ig(t){
return t.tagName==="tspan"
}
U();
U();
function Jl(t){
return!!t&&!t.match(/[\u0000-\u001F\u007F-\u009F]/u)&&t!=="."
}
U();
function Vn(t,e){
return r=>{
if(e.isConnected)throw r;
console.warn(`Missing node catcher (${
t
}
)`,r)
}

}
var Zn=async({
text:t,parent:e,rect:r,node:n,pseudo:o,computedStyle:a,isEllipsis:i,isTruncated:s,ctx:l
}
)=>{
if(!t.length||!e)return;
a||(a=getComputedStyle(e));
let u=t,f=n&&ar(n)&&go(n);
if(f){
if(a.display==="none")return
}
else{
if(po(e,e.getBoundingClientRect(),a)||!o&&(r.height<1||r.width<1))return;
u=Og(a.whiteSpace,t)
}
let p={
type:"TEXT",...al(r,100),value:u
}
;
if(i&&(p.isEllipsis=!0),s&&(p.isTruncated=!0),o&&(p.isContent=!0),!f&&(a.lineHeight==="normal"||a.lineHeight==="0px")&&(p.exactLineHeight=Bg(e,a)),!f){
let g=await Ql(l,n?.textContent?.trim()?n:e,a,o);
Jl(g?.familyName)&&(p.font=g?.familyName,p.platformFont=g)
}
return p
}
;
function Bg(t,e){
var r;
let n=`${
e.fontSize
}
-${
e.fontFamily
}
`,o=(r=t.ownerDocument).__h2d_cache||(r.__h2d_cache={

}
);
if(n in o)return o[n];
let a=document.createElement("span"),i=(u,f)=>a.style.setProperty(u,f,"important");
i("position","relative"),i("top","-1000px"),i("padding","0px"),a.innerHTML="X",t.appendChild(a);
let s=a.getBoundingClientRect().height;
a.innerHTML+="<br>X";
let l=a.getBoundingClientRect().height-s;
return t.removeChild(a),o[n]=l,l
}
async function Ql(t,e,r,n){
if(n)return(await globalThis.getPlatformFontForNode?.({
node:e,pseudo:n
}
).catch(Vn("getPlatformFontForNode",e)))?.[0];
let o=e.textContent;
if(!o)return;
let a={
family:r.fontFamily,weight:r.fontWeight,style:r.fontStyle,stretch:r.fontStretch,"font-variation-settings":r.fontVariationSettings
}
,i=JSON.stringify(a),s=f=>{
let p=f.charCodeAt(0);
return p>=0&&p<=127
}
,l=await t.platformFontCache[i],u=new Promise(async(f,p)=>{
try{
if(l){
let h=!0;
for(let m of o)if(!(s(m)&&l.ascii||l.chars.has(m))){
h=!1;
break
}
if(h)return f({
toCache:l,res:l.res
}
)
}
let g=await globalThis.getPlatformFontForNode?.({
node:e
}
).catch(Vn("getPlatformFontForNode",e)),w=g?.[0],b=l;
if(g?.length===1&&(!l||Rg(l.res,w))&&w){
b||(b={
chars:new Set,res:w,ascii:!1
}
);
for(let h of o)s(h)?b.ascii=!0:b.chars.add(h)
}
f({
toCache:b,res:w
}
)
}
catch(g){
p(g)
}

}
);
return t.platformFontCache[i]=u.then(f=>f.toCache),u.then(f=>f.res)
}
var Rg=(t,e)=>t.familyName===e.familyName&&t.postScriptName===e.postScriptName;
function Og(t,e){
switch(t){
case"normal":case"nowrap":case"pre-line":return e.replace(/[\t\r\n\f ]+/g," ");
case"pre":case"pre-wrap":return e.replace(/[\t]+/g," ");
case"break-spaces":return e.replace(/[\t]+/g,"").replace(/ +/g,"\xA0");
default:return e
}

}
U();
var Dg=Pt(Te(),1),Fg=Pt($c(),1);
function jg(t){
let e={

}
,r=Object.getPrototypeOf(t),n=Object.getPrototypeOf(r),o=Object.getPrototypeOf(n),a=Object.getPrototypeOf(o),i=Object.getPrototypeOf(a),s=Object.getPrototypeOf(i);
return Object.setPrototypeOf(e,r),new Proxy(e,{
get(l,u){
let f=Object.getOwnPropertyDescriptor(r,u)||Object.getOwnPropertyDescriptor(n,u)||Object.getOwnPropertyDescriptor(o,u)||Object.getOwnPropertyDescriptor(a,u)||Object.getOwnPropertyDescriptor(i,u)||Object.getOwnPropertyDescriptor(s,u);
if(f)return f.value?f.value.bind?f.value.bind(t):f.value:f.get?.apply(t)
}

}
)
}
async function Kl(t,e,r,n,o){
t&&Ju(t)&&(t=jg(t));
let a={
...al(r,100),type:"FRAME",tag:t?.tagName.toLowerCase()||"pseudo",classList:String(t?.classList||"").split(" ").filter(n.classListFilter||Boolean)
}
,i=a.attr={

}
,s=a.styles={

}
;
function l(p,g){
let w=rl[p];
g!==w&&(s[p]=g)
}
let u;
if(t){
if(n.callbacks?.onElement?.(t,a),Gi(t))i.type=t.type,t.type==="checkbox"&&t.indeterminate&&(i.indeterminate=!0),(t.type==="checkbox"||t.type==="radio")&&t.checked&&(i.checked=!0);
else if(In(t))i.naturalHeight=t.naturalHeight,i.naturalWidth=t.naturalWidth,i.srcset=t.srcset,i.alt=t.alt;
else if(Vu(t))i.baseURI=t.baseURI;
else if(Ku(t)){
let g=Lg(t);
g&&(i.href=g)
}
else Vi(t)&&(i.rows=t.rows,s.resize=e.resize);
let p=t.ariaLabel||t.getAttribute("data-framer-name");
p&&(i.ariaLabel=p),t.ariaHasPopup&&(i.ariaHasPopup=t.ariaHasPopup),t.role&&(i.role=t.role),t.id&&(i.id=t.id),t.part?.length===1&&(i.part=t.part.value),t.tagName?.toLowerCase()!=="foreignobject"&&(u=t.computedStyleMap())
}
for(let[p,g]of Kp)l(p,u?u.get(g).toString():e[p]);
for(let p of td)l(p,e[p]);
if(u&&s.transform!=="none"){
let p=Array.from(u.get("transform")).filter(g=>!cf(g));
p.length&&(s.transform2=p.map(g=>g.toString()).join(" "),s.transformOrigin2=e.transformOrigin)
}
if(s.position==="fixed"&&s.bottom==="auto"&&s.top==="auto"&&(s.top=e.top),s.clipPath&&s.clipPath!=="none"){
let p=(0,Dg.default)(s.clipPath).nodes.pop();
if(p?.type==="function"&&p.value==="url"){
let g=p.nodes[0].value,w=await Yl(n.svgRefCache,g,"clipPath");
if(w){
let b=w,h=b.innerHTML;
b.clipPathUnits.baseVal===2&&(console.warn("Partial support clipPathUnits, only <path>"),h=h.replace(/(d=")([^"]*)/g,(m,v,x)=>v+(0,Fg.default)(x).scale(r.width,r.height))),a.svgClip=h
}

}

}
if(s.order=parseInt(e.order),s.flexGrow=parseFloat(e.flexGrow),s.flexShrink=parseFloat(e.flexShrink),s.opacity=parseFloat(e.opacity),a?.tag==="fieldset"){
let p=t?.querySelector("legend");
if(p){
let g=getComputedStyle(p);
if(g.float==="none"&&!Hi(g.position)){
let w=await Kr(p,n,o);
a.$legendHeight=w.height
}

}

}
t.__x2d_isScrollingElt&&(a.isScrollingElt=!0);
let f=$g(t);
return f&&(a.comment=f),a
}
function $g(t){
let e=t;
for(;
e;
){
if(e=e.previousSibling,!e)return;
if(e.nodeType===Node.COMMENT_NODE)return zg(e.nodeValue);
if(e.nodeType!==Node.TEXT_NODE)return
}

}
function Lg(t){
let e=t.href;
if(!(!e||e==="javascript:void(0)")){
if(e.startsWith("javascript:")){
console.log(`Unsupported JS link: ${
e
}
`);
return
}
try{
let r=new URL(e);
return r.protocol==="mailto:"?r.protocol+r.pathname:new URL(r.pathname,r.origin).href+r.hash
}
catch{
console.debug("Invalid url:"+e)
}

}

}
function zg(t){
if(!t)return;
let e=t.trim().split(`
`)[0].trim();
if(!e.startsWith("END")&&(e=e.replace(/^(?:BEGIN|START)\w*/,""),e=e.replace(/^\W+/,"").replace(/\W+$/,""),!(e.length<=2)))return e.length>100&&(e=e.slice(0,100)+"..."),e
}
U();
var Cr=Pt(Te(),1);
U();
var ni={
aliceblue:"#f0f8ff",antiquewhite:"#faebd7",aqua:"#00ffff",aquamarine:"#7fffd4",azure:"#f0ffff",beige:"#f5f5dc",bisque:"#ffe4c4",black:"#000000",blanchedalmond:"#ffebcd",blue:"#0000ff",blueviolet:"#8a2be2",brown:"#a52a2a",burlywood:"#deb887",cadetblue:"#5f9ea0",chartreuse:"#7fff00",chocolate:"#d2691e",coral:"#ff7f50",cornflowerblue:"#6495ed",cornsilk:"#fff8dc",crimson:"#dc143c",cyan:"#00ffff",darkblue:"#00008b",darkcyan:"#008b8b",darkgoldenrod:"#b8860b",darkgray:"#a9a9a9",darkgreen:"#006400",darkgrey:"#a9a9a9",darkkhaki:"#bdb76b",darkmagenta:"#8b008b",darkolivegreen:"#556b2f",darkorange:"#ff8c00",darkorchid:"#9932cc",darkred:"#8b0000",darksalmon:"#e9967a",darkseagreen:"#8fbc8f",darkslateblue:"#483d8b",darkslategray:"#2f4f4f",darkslategrey:"#2f4f4f",darkturquoise:"#00ced1",darkviolet:"#9400d3",deeppink:"#ff1493",deepskyblue:"#00bfff",dimgray:"#696969",dimgrey:"#696969",dodgerblue:"#1e90ff",firebrick:"#b22222",floralwhite:"#fffaf0",forestgreen:"#228b22",fuchsia:"#ff00ff",gainsboro:"#dcdcdc",ghostwhite:"#f8f8ff",gold:"#ffd700",goldenrod:"#daa520",gray:"#808080",green:"#008000",greenyellow:"#adff2f",grey:"#808080",honeydew:"#f0fff0",hotpink:"#ff69b4",indianred:"#cd5c5c",indigo:"#4b0082",ivory:"#fffff0",khaki:"#f0e68c",lavender:"#e6e6fa",lavenderblush:"#fff0f5",lawngreen:"#7cfc00",lemonchiffon:"#fffacd",lightblue:"#add8e6",lightcoral:"#f08080",lightcyan:"#e0ffff",lightgoldenrodyellow:"#fafad2",lightgray:"#d3d3d3",lightgreen:"#90ee90",lightgrey:"#d3d3d3",lightpink:"#ffb6c1",lightsalmon:"#ffa07a",lightseagreen:"#20b2aa",lightskyblue:"#87cefa",lightslategray:"#778899",lightslategrey:"#778899",lightsteelblue:"#b0c4de",lightyellow:"#ffffe0",lime:"#00ff00",limegreen:"#32cd32",linen:"#faf0e6",magenta:"#ff00ff",maroon:"#800000",mediumaquamarine:"#66cdaa",mediumblue:"#0000cd",mediumorchid:"#ba55d3",mediumpurple:"#9370db",mediumseagreen:"#3cb371",mediumslateblue:"#7b68ee",mediumspringgreen:"#00fa9a",mediumturquoise:"#48d1cc",mediumvioletred:"#c71585",midnightblue:"#191970",mintcream:"#f5fffa",mistyrose:"#ffe4e1",moccasin:"#ffe4b5",navajowhite:"#ffdead",navy:"#000080",oldlace:"#fdf5e6",olive:"#808000",olivedrab:"#6b8e23",orange:"#ffa500",orangered:"#ff4500",orchid:"#da70d6",palegoldenrod:"#eee8aa",palegreen:"#98fb98",paleturquoise:"#afeeee",palevioletred:"#db7093",papayawhip:"#ffefd5",peachpuff:"#ffdab9",peru:"#cd853f",pink:"#ffc0cb",plum:"#dda0dd",powderblue:"#b0e0e6",purple:"#800080",red:"#ff0000",rosybrown:"#bc8f8f",royalblue:"#4169e1",saddlebrown:"#8b4513",salmon:"#fa8072",sandybrown:"#f4a460",seagreen:"#2e8b57",seashell:"#fff5ee",sienna:"#a0522d",silver:"#c0c0c0",skyblue:"#87ceeb",slateblue:"#6a5acd",slategray:"#708090",slategrey:"#708090",snow:"#fffafa",springgreen:"#00ff7f",steelblue:"#4682b4",tan:"#d2b48c",teal:"#008080",thistle:"#d8bfd8",tomato:"#ff6347",transparent:"#00000000",turquoise:"#40e0d0",violet:"#ee82ee",wheat:"#f5deb3",white:"#ffffff",whitesmoke:"#f5f5f5",yellow:"#ffff00",yellowgreen:"#9acd32"
}
;
U();
var vy=new Object,tc=async(t,e)=>{
let r=[];
for(let n=0;
n<t.length;
n++)n in t&&(r[n]=Promise.resolve(t[n]).then(o=>e(o,n,t)));
return Promise.all(r)
}
;
function qg(t){
if(!t)return[];
let e=t.media?.mediaText;
if(t.disabled)return[];
if(e&&!window.matchMedia(e).matches)return[];
try{
return Array.from(t.cssRules)
}
catch{
return[]
}

}
async function Xn(t,e=!1){
return(await tc(qg(t),async r=>{
if(r.type===CSSRule.IMPORT_RULE){
let n=r.styleSheet;
if(!n)return[];
let{
sheet:o,isCrossDomain:a
}
=await ec(n);
return Xn(o,a)
}
else if(r.type===CSSRule.MEDIA_RULE)return Xn(r);
return[{
rule:r
}
]
}
)).flatMap(r=>r.map(({
rule:n,isCrossDomain:o
}
)=>({
rule:n,isCrossDomain:e||o
}
)))
}
async function ec(t){
if(Zi(t.href))return{
sheet:t
}
;
let e=new CSSStyleSheet,r=await window.getAssetWithCDP?.(t.href);
return r&&await e.replace(r),e.disabled=t.disabled,e.media.mediaText=t.media.mediaText,{
sheet:e,isCrossDomain:!0
}

}
function Ug(t){
return tc(Array.from(lf(t)),async e=>{
let{
sheet:r,isCrossDomain:n
}
=await ec(e);
return(await Xn(r,n)).filter(o=>o.rule.type===CSSRule.STYLE_RULE)
}
).then(e=>e.flatMap(r=>r))
}
function*Hg(t){
for(let e of t.styleSheets)if(Zi(e.href))try{
for(let r of e.cssRules)if(!!tf(r)&&!!document.querySelector(r.selectorText))for(let n of r.style){
if(!/^--/.test(n))continue;
let o=r.style.getPropertyValue(n).trim();
o&&(yield[n,o])
}

}
catch{

}

}
function*Wg(t){
for(let e in t){
let r=t[e];
r in ni&&(r=ni[r]);
let n=Yg(r);
if(n){
let{
r:a,g:i,b:s,a:l
}
=n;
r=`rgba(${
a
}
, ${
i
}
, ${
s
}
 / ${
l
}
)`
}
if(r[0]>="0"&&r[0]<="9")continue;
let o=yg(r,!0);
o&&(yield[e,o])
}

}
function Yg(t){
let e=(0,Cr.default)(t),r=[],n=!1,o="";
if(e.walk(f=>{
n||(f.type==="word"?f.value==="none"||/^\d+%?$/.test(f.value)?r.push(f.value):n=!0:f.type==="div"&&f.value===","?o?o&&o!=="comma"&&(n=!0):o="comma":f.type==="space"?r.length>0&&!o?o="space":o==="comma"||o==="space"&&r.length>0:f.type==="div"&&f.value==="/"?r.length!==3&&(n=!0):n=!0)
}
),n)return;
let a=r.map(f=>f==="none"?"0":f);
if(a.length<3||a.length>4)return;
let[i,s,l,u="1"]=a;
return{
r:i,g:s,b:l,a:u
}

}
function Gg(t){
let e=Object.fromEntries(Hg(t));
return Vg(e),Array.from(Wg(e))
}
function Vg(t){
let e=Object.fromEntries(Object.entries(t).map(([r,n])=>[r,(0,Cr.default)(n)]));
for(let r in t){
let n=e[r],o=[r],a=(i,s,l)=>{
if(i.type==="function"&&i.value==="var"){
let u=i.nodes[0].value;
if(o.includes(u)){
delete e[r];
return
}
if(o.push(u),u in e){
l.splice(s,1,...e[u].nodes);
let f=l[s];
a(l[s],s,l),f.type==="function"&&Cr.default.walk(f.nodes,a)
}
else i.nodes.length===3&&l.splice(s,1,i.nodes[2])
}

}
;
n.walk(a)
}
for(let r in e)t[r]=Cr.default.stringify(e[r].nodes)
}
var by=Pt(ao(),1),Ee=Pt(Lc(),1);
U();
U();
U();
var Sr={

}
,Jn={

}
;
function Zg(t,e){
for(var r=e,n=0;
n<t.length;
n++){
var o=n===t.length-1,a=t.charAt(n),i=r[a]||(r[a]={
chars:{

}

}
);
o&&(i.self=t),r=i.chars
}

}
function oi(t){
if(t.length===0)return Sr;
for(var e={

}
,r=0,n=t;
r<n.length;
r++){
var o=n[r];
Zg(o,e)
}
return e
}
function Xg(t){
if(t.length===0)return Jn;
for(var e={

}
,r=0,n=t;
r<n.length;
r++){
var o=n[r];
e[o]=!0
}
return e
}
U();
var xr={

}
,ai={
type:"String",optional:!0
}
;
function Jg(t){
var e={
type:"NoArgument",optional:!1
}
;
function r(i){
if(e.type&&e.type!==i&&e.type!=="NoArgument")throw new Error('Conflicting pseudo-class argument type: "'.concat(e.type,'" vs "').concat(i,'".'));
e.type=i
}
for(var n=0,o=t;
n<o.length;
n++){
var a=o[n];
a==="NoArgument"&&(e.optional=!0),a==="Formula"&&r("Formula"),a==="FormulaOfSelector"&&(r("Formula"),e.ofSelector=!0),a==="String"&&r("String"),a==="Selector"&&r("Selector")
}
return e
}
function Qg(t){
for(var e={

}
,r=0,n=Object.keys(t);
r<n.length;
r++){
var o=n[r],a=t[o];
if(a)for(var i=0,s=a;
i<s.length;
i++){
var l=s[i];
(e[l]||(e[l]=[])).push(o)
}

}
return e
}
function ii(t){
for(var e=Qg(t),r={

}
,n=0,o=Object.keys(e);
n<o.length;
n++){
var a=o[n],i=e[a];
i&&(r[a]=Jg(i))
}
return r
}
U();
var Fr=function(){
return Fr=Object.assign||function(t){
for(var e,r=1,n=arguments.length;
r<n;
r++){
e=arguments[r];
for(var o in e)Object.prototype.hasOwnProperty.call(e,o)&&(t[o]=e[o])
}
return t
}
,Fr.apply(this,arguments)
}
,Kg={

}
,Qn={
wildcard:!0
}
;
function t2(t){
return t?typeof t=="boolean"?Qn:t:Kg
}
function e2(t,e){
return function(r,n){
return e(t(r),t(n))
}

}
function r2(t){
return function(e,r){
var n=t(e,r);
if(!n)throw new Error("Syntax definition cannot be null or undefined.");
return n
}

}
function si(t,e){
return function(r,n){
return n===!0?t:e(r===!0?t:r,n)
}

}
function je(t){
return function(e,r){
if(!r||!e)return r;
if(typeof r!="object"||r===null)throw new Error("Unexpected syntax definition extension type: ".concat(r,"."));
for(var n=Fr({

}
,e),o=0,a=Object.entries(r);
o<a.length;
o++){
var i=a[o],s=i[0],l=i[1],u=t[s];
n[s]=u(e[s],l)
}
return n
}

}
function se(t,e){
return e!==void 0?e:t
}
function An(t,e){
return e?t?t.concat(e):e:t
}
function li(t,e){
if(!e)return t;
if(!t)return e;
for(var r=Fr({

}
,t),n=0,o=Object.entries(e);
n<o.length;
n++){
var a=o[n],i=a[0],s=a[1];
if(!s){
delete r[i];
continue
}
var l=t[i];
if(!l){
r[i]=s;
continue
}
r[i]=l.concat(s)
}
return r
}
var ur=r2(je({
baseSyntax:se,tag:si(Qn,je({
wildcard:se
}
)),ids:se,classNames:se,namespace:si(Qn,je({
wildcard:se
}
)),combinators:An,attributes:je({
operators:An,caseSensitivityModifiers:An,unknownCaseSensitivityModifiers:se
}
),pseudoClasses:je({
unknown:se,definitions:li
}
),pseudoElements:je({
unknown:se,notation:se,definitions:e2(function(t){
return Array.isArray(t)?{
NoArgument:t
}
:t
}
,li)
}
)
}
)),rc={
tag:{

}
,ids:!0,classNames:!0,combinators:[],pseudoElements:{
unknown:"reject",notation:"singleColon",definitions:["first-letter","first-line"]
}
,pseudoClasses:{
unknown:"reject",definitions:{
NoArgument:["link","visited","active"]
}

}

}
,nc=ur(rc,{
tag:{
wildcard:!0
}
,combinators:[">","+"],attributes:{
unknownCaseSensitivityModifiers:"reject",operators:["=","~=","|="]
}
,pseudoElements:{
definitions:["before","after"]
}
,pseudoClasses:{
unknown:"reject",definitions:{
NoArgument:["hover","focus","first-child"],String:["lang"]
}

}

}
),Kn=ur(nc,{
namespace:{
wildcard:!0
}
,combinators:["~"],attributes:{
operators:["^=","$=","*="]
}
,pseudoElements:{
notation:"both"
}
,pseudoClasses:{
definitions:{
NoArgument:["root","last-child","first-of-type","last-of-type","only-child","only-of-type","empty","target","enabled","disabled","checked","indeterminate"],Formula:["nth-child","nth-last-child","nth-of-type","nth-last-of-type"],Selector:["not"]
}

}

}
),to=ur(Kn,{
combinators:["||"],attributes:{
caseSensitivityModifiers:["i","I","s","S"]
}
,pseudoClasses:{
definitions:{
NoArgument:["any-link","local-link","target-within","scope","current","past","future","focus-within","focus-visible","read-write","read-only","placeholder-shown","default","valid","invalid","in-range","out-of-range","required","optional","blank","user-invalid"],Formula:["nth-col","nth-last-col"],String:["dir"],FormulaOfSelector:["nth-child","nth-last-child"],Selector:["current","is","where","has"]
}

}

}
),n2=ur(to,{
pseudoElements:{
unknown:"accept"
}
,pseudoClasses:{
unknown:"accept"
}
,attributes:{
unknownCaseSensitivityModifiers:"accept"
}

}
),ci={
css1:rc,css2:nc,css3:Kn,"selectors-3":Kn,"selectors-4":to,latest:to,progressive:n2
}
;
U();
function Ge(t){
return t>="a"&&t<="z"||t>="A"&&t<="Z"||t==="-"||t==="_"||t==="\\"||t>="\xA0"
}
function ui(t){
return t>="a"&&t<="z"||t>="A"&&t<="Z"||t>="0"&&t<="9"||t==="-"||t==="_"||t>="\xA0"
}
function Ve(t){
return t>="a"&&t<="f"||t>="A"&&t<="F"||t>="0"&&t<="9"
}
var o2={
"!":!0,'"':!0,"#":!0,$:!0,"%":!0,"&":!0,"'":!0,"(":!0,")":!0,"*":!0,"+":!0,",":!0,".":!0,"/":!0,";
":!0,"<":!0,"=":!0,">":!0,"?":!0,"@":!0,"[":!0,"\\":!0,"]":!0,"^":!0,"`":!0,"{
":!0,"|":!0,"
}
":!0,"~":!0
}
,a2={
"\n":!0,"\r":!0,"	":!0,"\f":!0,"\v":!0
}
,i2={
" ":!0,"	":!0,"\n":!0,"\r":!0,"\f":!0
}
,s2={
'"':!0,"'":!0
}
,Mn={
0:!0,1:!0,2:!0,3:!0,4:!0,5:!0,6:!0,7:!0,8:!0,9:!0
}
,l2=6;
function Vt(t){
for(var e=t.length,r="",n=0;
n<e;
){
var o=t.charAt(n);
if(o2[o]||o==="-"&&n===1&&t.charAt(0)==="-")r+="\\"+o;
else if(o==="-"||o==="_"||o>="A"&&o<="Z"||o>="a"&&o<="z"||o>="0"&&o<="9"&&n!==0&&!(n===1&&t.charAt(0)==="-"))r+=o;
else{
var a=o.charCodeAt(0);
if((a&63488)===55296){
var i=t.charCodeAt(n++);
if((a&64512)!==55296||(i&64512)!==56320)throw Error("UCS-2(decode): illegal sequence");
a=((a&1023)<<10)+(i&1023)+65536
}
r+="\\"+a.toString(16)+" "
}
n++
}
return r.trim()
}
function c2(t){
for(var e=t.length,r="",n=0;
n<e;
){
var o=t.charAt(n);
o==='"'?o='\\"':o==="\\"?o="\\\\":a2[o]&&(o="\\"+o.charCodeAt(0).toString(16)+(n===e-1?"":" ")),r+=o,n++
}
return'"'.concat(r,'"')
}
var En="css-selector-parser parse error: ";
function u2(t){
t===void 0&&(t={

}
);
var e=t.syntax,r=e===void 0?"latest":e,n=t.substitutes,o=t.strict,a=o===void 0?!0:o,i=typeof r=="object"?r:ci[r];
i.baseSyntax&&(i=ur(ci[i.baseSyntax],i));
var s=i.tag?[!0,Boolean(t2(i.tag).wildcard)]:[!1,!1],l=s[0],u=s[1],f=Boolean(i.ids),p=Boolean(i.classNames),g=Boolean(i.namespace),w=i.namespace&&(i.namespace===!0||i.namespace.wildcard===!0);
if(g&&!l)throw new Error("".concat(En,"Namespaces cannot be enabled while tags are disabled."));
var b=Boolean(n),h=i.combinators?oi(i.combinators):Sr,m=i.attributes?[!0,i.attributes.operators?oi(i.attributes.operators):Sr,i.attributes.caseSensitivityModifiers?Xg(i.attributes.caseSensitivityModifiers):Jn,i.attributes.unknownCaseSensitivityModifiers==="accept"]:[!1,Sr,Jn,!1],v=m[0],x=m[1],k=m[2],N=m[3],_=N||Object.keys(k).length>0,I=i.pseudoClasses?[!0,i.pseudoClasses.definitions?ii(i.pseudoClasses.definitions):xr,i.pseudoClasses.unknown==="accept"]:[!1,xr,!1],z=I[0],R=I[1],M=I[2],C=i.pseudoElements?[!0,i.pseudoElements.notation==="singleColon"||i.pseudoElements.notation==="both",!i.pseudoElements.notation||i.pseudoElements.notation==="doubleColon"||i.pseudoElements.notation==="both",i.pseudoElements.definitions?ii(Array.isArray(i.pseudoElements.definitions)?{
NoArgument:i.pseudoElements.definitions
}
:i.pseudoElements.definitions):xr,i.pseudoElements.unknown==="accept"]:[!1,!1,!1,xr,!1],E=C[0],q=C[1],Y=C[2],G=C[3],j=C[4],H="",T=H.length,F=0,$="",Z=function(c){
return $===c
}
,K=function(){
return Z("*")||Ge($)
}
,rt=function(c){
F=c,$=H.charAt(F)
}
,Q=function(){
F++,$=H.charAt(F)
}
,at=function(){
var c=$;
return F++,$=H.charAt(F),c
}
;
function nt(c){
var d=Math.min(T-1,F),y=new Error("".concat(En).concat(c," Pos: ").concat(d,"."));
throw y.position=d,y.name="ParserError",y
}
function tt(c,d){
if(!c)return nt(d)
}
var wt=function(){
tt(F<T,"Unexpected end of input.")
}
,ht=function(){
return F>=T
}
,Ct=function(c){
tt(F<T,'Expected "'.concat(c,'" but end of input reached.')),tt($===c,'Expected "'.concat(c,'" but "').concat($,'" found.')),F++,$=H.charAt(F)
}
;
function kt(c){
var d=Nt(c,F);
if(d)return F+=d.length,$=H.charAt(F),d
}
function Nt(c,d){
var y=H.charAt(d),S=c[y];
if(S){
var D=Nt(S.chars,d+1);
if(D)return D;
if(S.self)return S.self
}

}
function gt(){
for(var c=at(),d=1;
Ve($)&&d<l2;
)c+=at(),d++;
return Kt(),String.fromCharCode(parseInt(c,16))
}
function Tt(c){
var d="";
for(Ct(c);
F<T;
){
if(Z(c))return Q(),d;
Z("\\")?(Q(),Z(c)?(d+=c,Q()):$===`
`||$==="\f"?Q():$==="\r"?(Q(),Z(`
`)&&Q()):Ve($)?d+=gt():(d+=$,Q())):(d+=$,Q())
}
return d
}
function ft(){
if(!Ge($))return null;
for(var c="";
Z("-");
)c+=$,Q();
for(c==="-"&&!ui($)&&!Z("\\")&&nt("Identifiers cannot consist of a single hyphen."),a&&c.length>=2&&nt("Identifiers cannot start with two hyphens with strict mode on."),Mn[$]&&nt("Identifiers cannot start with hyphens followed by digits.");
F<T;
)if(ui($))c+=at();
else if(Z("\\"))Q(),wt(),Ve($)?c+=gt():c+=at();
else break;
return c
}
function Pe(){
for(var c="";
F<T&&!Z(")");
)if(Z("\\")){
if(Q(),ht()&&!a)return(c+"\\").trim();
wt(),Ve($)?c+=gt():c+=at()
}
else c+=at();
return c.trim()
}
function Kt(){
if($===" "||$==="	"||$==="\f"||$===`
`){
Q();
return
}
$==="\r"&&Q(),$===`
`&&Q()
}
function mt(){
for(;
i2[$];
)Q()
}
function Me(c){
c===void 0&&(c=!1),mt();
for(var d=[ue(c)];
Z(",");
)Q(),mt(),d.push(ue(c));
return{
type:"Selector",rules:d
}

}
function Ie(){
Ct("["),mt();
var c;
if(Z("|")){
tt(g,"Namespaces are not enabled."),Q();
var d=ft();
tt(d,"Expected attribute name."),c={
type:"Attribute",name:d,namespace:{
type:"NoNamespace"
}

}

}
else if(Z("*")){
tt(g,"Namespaces are not enabled."),tt(w,"Wildcard namespace is not enabled."),Q(),Ct("|");
var y=ft();
tt(y,"Expected attribute name."),c={
type:"Attribute",name:y,namespace:{
type:"WildcardNamespace"
}

}

}
else{
var S=ft();
if(tt(S,"Expected attribute name."),c={
type:"Attribute",name:S
}
,Z("|")){
var D=F;
if(Q(),Ge($)){
tt(g,"Namespaces are not enabled.");
var W=ft();
tt(W,"Expected attribute name."),c={
type:"Attribute",name:W,namespace:{
type:"NamespaceName",name:S
}

}

}
else rt(D)
}

}
if(tt(c.name,"Expected attribute name."),mt(),ht()&&!a)return c;
if(Z("]"))Q();
else{
if(c.operator=kt(x),tt(c.operator,"Expected a valid attribute selector operator."),mt(),wt(),s2[$])c.value={
type:"String",value:Tt($)
}
;
else if(b&&Z("$")){
Q();
var J=ft();
tt(J,"Expected substitute name."),c.value={
type:"Substitution",name:J
}

}
else{
var A=ft();
tt(A,"Expected attribute value."),c.value={
type:"String",value:A
}

}
if(mt(),ht()&&!a)return c;
if(!Z("]")){
var P=ft();
if(tt(P,"Expected end of attribute selector."),c.caseSensitivityModifier=P,tt(_,"Attribute case sensitivity modifiers are not enabled."),tt(N||k[c.caseSensitivityModifier],"Unknown attribute case sensitivity modifier."),mt(),ht()&&!a)return c
}
Ct("]")
}
return c
}
function dt(){
for(var c="";
Mn[$];
)c+=at();
return tt(c!=="","Formula parse error."),parseInt(c)
}
var ne=function(){
return Z("-")||Z("+")||Mn[$]
}
;
function Ot(){
if(Z("e")||Z("o")){
var c=ft();
if(c==="even")return mt(),[2,0];
if(c==="odd")return mt(),[2,1]
}
var d=null,y=1;
if(Z("-")&&(Q(),y=-1),ne()&&(Z("+")&&Q(),d=dt(),!Z("\\")&&!Z("n")))return[0,d*y];
d===null&&(d=1),d*=y;
var S;
if(Z("\\")?(Q(),Ve($)?S=gt():S=at()):S=at(),tt(S==="n",'Formula parse error: expected "n".'),mt(),Z("+")||Z("-")){
var D=Z("+")?1:-1;
return Q(),mt(),[d,D*dt()]
}
else return[d,0]
}
function oe(c,d,y){
var S;
if(Z("(")){
if(Q(),mt(),b&&Z("$")){
Q();
var D=ft();
tt(D,"Expected substitute name."),S={
type:"Substitution",name:D
}

}
else if(y.type==="String")S={
type:"String",value:Pe()
}
,tt(S.value,"Expected ".concat(d," argument value."));
else if(y.type==="Selector")S=Me(!0);
else if(y.type==="Formula"){
var W=Ot(),J=W[0],A=W[1];
if(S={
type:"Formula",a:J,b:A
}
,y.ofSelector&&(mt(),Z("o")||Z("\\"))){
var P=ft();
tt(P==="of","Formula of selector parse error."),mt(),S={
type:"FormulaOfSelector",a:J,b:A,selector:ue()
}

}

}
else return nt("Invalid ".concat(d," signature."));
if(mt(),ht()&&!a)return S;
Ct(")")
}
else tt(y.optional,"Argument is required for ".concat(d,' "').concat(c,'".'));
return S
}
function Xt(){
if(Z("*"))return tt(u,"Wildcard tag name is not enabled."),Q(),{
type:"WildcardTag"
}
;
if(Ge($)){
tt(l,"Tag names are not enabled.");
var c=ft();
return tt(c,"Expected tag name."),{
type:"TagName",name:c
}

}
else return nt("Expected tag name.")
}
function Dt(){
if(Z("*")){
var c=F;
if(Q(),!Z("|")||(Q(),!K()))return rt(c),Xt();
tt(g,"Namespaces are not enabled."),tt(w,"Wildcard namespace is not enabled.");
var d=Xt();
return d.namespace={
type:"WildcardNamespace"
}
,d
}
else if(Z("|")){
tt(g,"Namespaces are not enabled."),Q();
var d=Xt();
return d.namespace={
type:"NoNamespace"
}
,d
}
else if(Ge($)){
var y=ft();
if(tt(y,"Expected tag name."),!Z("|"))return tt(l,"Tag names are not enabled."),{
type:"TagName",name:y
}
;
var c=F;
if(Q(),!K())return rt(c),{
type:"TagName",name:y
}
;
tt(g,"Namespaces are not enabled.");
var d=Xt();
return d.namespace={
type:"NamespaceName",name:y
}
,d
}
else return nt("Expected tag name.")
}
function ue(c){
var d,y;
c===void 0&&(c=!1);
var S={
type:"Rule",items:[]
}
;
if(c){
var D=kt(h);
D&&(S.combinator=D,mt())
}
for(;
F<T;
)if(K())tt(S.items.length===0,"Unexpected tag/namespace start."),S.items.push(Dt());
else if(Z("|")){
var W=F;
if(Q(),K())tt(S.items.length===0,"Unexpected tag/namespace start."),rt(W),S.items.push(Dt());
else{
rt(W);
break
}

}
else if(Z(".")){
tt(p,"Class names are not enabled."),Q();
var J=ft();
tt(J,"Expected class name."),S.items.push({
type:"ClassName",name:J
}
)
}
else if(Z("#")){
tt(f,"IDs are not enabled."),Q();
var A=ft();
tt(A,"Expected ID name."),S.items.push({
type:"Id",name:A
}
)
}
else if(Z("["))tt(v,"Attributes are not enabled."),S.items.push(Ie());
else if(Z(":")){
var P=!1,B=!1;
Q(),Z(":")&&(tt(E,"Pseudo elements are not enabled."),tt(Y,"Pseudo elements double colon notation is not enabled."),P=!0,Q());
var L=ft();
if(tt(P||L,"Expected pseudo-class name."),tt(!P||L,"Expected pseudo-element name."),tt(L,"Expected pseudo-class name."),tt(!P||j||Object.prototype.hasOwnProperty.call(G,L),'Unknown pseudo-element "'.concat(L,'".')),B=E&&(P||!P&&q&&Object.prototype.hasOwnProperty.call(G,L)),B){
var O=(d=G[L])!==null&&d!==void 0?d:j&&ai,V={
type:"PseudoElement",name:L
}
,X=oe(L,"pseudo-element",O);
X&&(tt(X.type!=="Formula"&&X.type!=="FormulaOfSelector","Pseudo-elements cannot have formula argument."),V.argument=X),S.items.push(V)
}
else{
tt(z,"Pseudo-classes are not enabled.");
var O=(y=R[L])!==null&&y!==void 0?y:M&&ai;
tt(O,'Unknown pseudo-class: "'.concat(L,'".'));
var X=oe(L,"pseudo-class",O),et={
type:"PseudoClass",name:L
}
;
X&&(et.argument=X),S.items.push(et)
}

}
else break;
if(S.items.length===0)return ht()?nt("Expected rule but end of input reached."):nt('Expected rule but "'.concat($,'" found.'));
if(mt(),!ht()&&!Z(",")&&!Z(")")){
var D=kt(h);
mt(),S.nestedRule=ue(),S.nestedRule.combinator=D
}
return S
}
return function(c){
if(typeof c!="string")throw new Error("".concat(En,"Expected string input."));
return H=c,T=H.length,F=0,$=H.charAt(0),Me()
}

}
U();
var oc="css-selector-parser render error: ";
function fi(t){
if(t.type==="WildcardNamespace")return"*|";
if(t.type==="NamespaceName")return"".concat(Vt(t.name),"|");
if(t.type==="NoNamespace")return"|";
throw new Error("".concat(oc,"Unknown namespace type: ").concat(t.type,"."))
}
function f2(t){
return"$".concat(Vt(t.name))
}
function hi(t,e){
if(t){
var r="".concat(t===1?"":t===-1?"-":t,"n");
return e&&(r+="".concat(e>0?"+":"").concat(e)),r
}
else return String(e)
}
function de(t){
if(t.type==="Selector")return t.rules.map(de).join(", ");
if(t.type==="Rule"){
var e="",r=t.items,n=t.combinator,o=t.nestedRule;
n&&(e+="".concat(n," "));
for(var a=0,i=r;
a<i.length;
a++){
var s=i[a];
e+=de(s)
}
return o&&(e+=" ".concat(de(o))),e
}
else if(t.type==="TagName"||t.type==="WildcardTag"){
var e="",l=t.namespace;
return l&&(e+=fi(l)),t.type==="TagName"?e+=Vt(t.name):t.type==="WildcardTag"&&(e+="*"),e
}
else{
if(t.type==="Id")return"#".concat(Vt(t.name));
if(t.type==="ClassName")return".".concat(Vt(t.name));
if(t.type==="Attribute"){
var u=t.name,l=t.namespace,f=t.operator,p=t.value,g=t.caseSensitivityModifier,e="[";
if(l&&(e+=fi(l)),e+=Vt(u),f&&p){
if(e+=f,p.type==="String")e+=c2(p.value);
else if(p.type==="Substitution")e+=f2(p);
else throw new Error("Unknown attribute value type: ".concat(p.type,"."));
g&&(e+=" ".concat(Vt(g)))
}
return e+="]",e
}
else if(t.type==="PseudoClass"){
var w=t.name,b=t.argument,e=":".concat(Vt(w));
return b&&(e+="(".concat(b.type==="String"?Vt(b.value):de(b),")")),e
}
else if(t.type==="PseudoElement"){
var h=t.name,b=t.argument,e="::".concat(Vt(h));
return b&&(e+="(".concat(b.type==="String"?Vt(b.value):de(b),")")),e
}
else{
if(t.type==="String")throw new Error("".concat(oc,"String cannot be rendered outside of context."));
if(t.type==="Formula")return hi(t.a,t.b);
if(t.type==="FormulaOfSelector")return hi(t.a,t.b)+" of "+de(t.selector);
if(t.type==="Substitution")return"$".concat(Vt(t.name))
}

}
throw new Error("Unknown type specified to render method: ".concat(t.type,"."))
}
U();
var St=function(){
return St=Object.assign||function(t){
for(var e,r=1,n=arguments.length;
r<n;
r++){
e=arguments[r];
for(var o in e)Object.prototype.hasOwnProperty.call(e,o)&&(t[o]=e[o])
}
return t
}
,St.apply(this,arguments)
}
;
function Rt(t){
return function(e,r){
var n;
return n={

}
,n[e]=function(o){
return St({
type:t
}
,o)
}
,n[r]=function(o){
return typeof o=="object"&&o!==null&&o.type===t
}
,n
}

}
var wy=St(St(St(St(St(St(St(St(St(St(St(St(St(St(St(St({

}
,Rt("Selector")("selector","isSelector")),Rt("Rule")("rule","isRule")),Rt("TagName")("tagName","isTagName")),Rt("Id")("id","isId")),Rt("ClassName")("className","isClassName")),Rt("WildcardTag")("wildcardTag","isWildcardTag")),Rt("NamespaceName")("namespaceName","isNamespaceName")),Rt("WildcardNamespace")("wildcardNamespace","isWildcardNamespace")),Rt("NoNamespace")("noNamespace","isNoNamespace")),Rt("Attribute")("attribute","isAttribute")),Rt("PseudoClass")("pseudoClass","isPseudoClass")),Rt("PseudoElement")("pseudoElement","isPseudoElement")),Rt("String")("string","isString")),Rt("Formula")("formula","isFormula")),Rt("FormulaOfSelector")("formulaOfSelector","isFormulaOfSelector")),Rt("Substitution")("substitution","isSubstitution"));
U();
function h2(t){
return t.filter(p2)
}
function p2(t){
return t!=null
}
U();
function d2(t){
return new Error(t)
}
U();
var m2=[{
host:"www\\.figma\\.com",pathname:"^/make/",source:"figma",selector:'iframe[src*=".figma.site/preview_page"],iframe[title="Preview"]',kind:"Preview",click:'[data-testid="segmented-control-preview"]'
}
,{
host:"v0\\.(dev|app)",pathname:"^/(chat|community)/",source:"v0",selector:'iframe[src*=".vusercontent.net"]',kind:"Preview",disableVariations:!0
}
,{
host:"bolt\\.new",pathname:"^/~/",source:"bolt",selector:'iframe[src*="webcontainer-api.io"],iframe[title="Bolt preview"]',kind:"Preview"
}
,{
host:"claude\\.ai|claude\\.site",pathname:"^/(chat|public\\/artifacts)/",source:"claude",selector:'iframe[src*="claudeusercontent.com"],iframe[title="Claude content"]',kind:"Artifact"
}
,{
host:"gemini\\.google\\.com",pathname:"(/app|^/share)/",source:"gemini",selector:'iframe[src*="scf.usercontent.goog/gemini-code-immersive"]',kind:"Preview"
}
,{
host:"aistudio\\.google\\.com",pathname:"^/apps/",source:"aistudio",selector:'iframe[title*="Preview"]',kind:"Preview"
}
,{
host:"replit\\.com",pathname:"^/@",source:"replit",selector:'iframe[src*=".replit.dev"],iframe[title="webview"]',kind:"Preview"
}
,{
host:"chatgpt\\.com",pathname:"^/(c|canvas)/",source:"chatgpt",selector:'iframe[src*="web-sandbox.oaiusercontent.com"]:not([title="relay"])',kind:"Canvas"
}
,{
host:"www\\.genspark\\.ai",pathname:"^/(agents|slides|autopilotagent_viewer)",source:"genspark",selector:'iframe[src*="gensparkspace.com"],iframe[src*="genspark.site/slide_agent"],iframe[src*="genspark.ai/api/files"]',kind:"Preview"
}
,{
host:"\\.gensparkspace\\.com",source:"genspark",selector:'iframe[src*="genspark.site/slide_agent"],iframe[src*="genspark.ai/api/files"]',kind:"Slide"
}
,{
host:"app\\.polymet\\.ai",pathname:"^/canvas/",source:"polymet",selector:"iframe:not([title])[srcdoc]",kind:"Canvas"
}
,{
host:"skywork\\.ai",pathname:"^/(project|web|share)/",source:"skywork",selector:".website-wrapper iframe, .PPTPreview-box .ppt-page, .pptV2-detail-page-main-list-item .ppt-page",kind:"Canvas"
}
,{
host:"lovable\\.dev",pathname:"^/projects/",source:"Lovable.dev",selector:'iframe[src*=".lovableproject.com/"], iframe[src*=".lovable.app/"]',kind:"Preview",click:'.bg-affirmative-primary[aria-label="Code viewer"][data-state="closed"], [data-testid="mobile-view-preview-button"]'
}
,{
host:"www\\.magicpath\\.ai",source:"Magicpath",selector:'iframe[src*="api.magicpath.ai/components/"]',kind:"Component"
}
,{
host:"manus\\.im",pathname:"^/(app|share/file)/",source:"Manus",selector:"#manus-computer-detail iframe",kind:"Preview"
}
,{
host:"www\\.(create\\.xyz|createanything\\.com)",pathname:"^/(build|app)/",source:"Create.xyz",selector:'iframe[src*=".createdusercontent.com"], iframe[src*=".createdevserver.com/"]',kind:"Preview"
}
,{
host:"gamma\\.app",pathname:"^/(docs)/",source:"Gamma.app",selector:'[data-node-view-content-inner="document"] .card-body',kind:"Preview"
}
,{
host:"uxpilot\\.ai",pathname:"^/(a|s)/",source:"UXPilot",selector:"iframe[srcdoc]",kind:"Preview"
}
,{
host:"webflow\\.com",pathname:"^/templates/",source:"webflow",selector:'iframe[src*=".webflow.io"],iframe.mp-iframe',kind:"Template"
}
,{
host:"preview\\.themeforest\\.net",source:"themeforest",selector:'iframe[name="preview-frame"]',kind:"Template"
}
,{
host:"^.*\\.wix\\.com$",pathname:"^/website-template/",source:"wix",selector:'iframe[src*="www.wix.com"]',kind:"Template"
}
,{
host:"themes\\.shopify\\.com",pathname:"^/themes/",source:"Shopify",selector:'iframe[src*=".myshopify.com"][title="Theme preview demo"]',click:'div[data-action="click->demo-store#scrollAndActivate"]',kind:"Template"
}
,{
host:"readdy\\.ai",pathname:"^/project/",source:"Readdy",selector:'iframe[src*="readdy.ai/viewer/"]',kind:"Preview"
}
,{
host:"notion\\.so",source:"Notion",selector:"main#main.notion-frame",kind:"Preview"
}
],g2="https://html.to.design/assets/previews.config.json",pi,ac=async t=>{
pi??=await fetch(g2).then(e=>e.json()).catch(()=>m2);
for(let{
host:e,pathname:r,...n
}
of pi)if(!!new RegExp(e).test(t.host)&&!(r&&!new RegExp(r).test(t.pathname)))return n
}
,di=Pt(Te(),1);
U();
U();
function y2(t,e){
if(e??(e=me().document),t?.selector){
let r=Ki(e,t);
if(r.length){
let n=r[0];
for(;
(n=n?.parentElement)&&n!==n.ownerDocument.documentElement&&!r.every(o=>n?.contains(o)&&Rn(n));
);
return n&&Rn(n)?n:void 0
}

}
return of(e)
}
async function ic(t,e){
let r=await y2(t,e);
return r?(await sf(r,n=>n.scrollHeight,af),()=>(r.scrollTo({
top:0,behavior:"instant"
}
),new Promise(n=>setTimeout(n,100)))):()=>{

}

}
U();
function Ar(t,e,r=!1){
let n=Date.now(),o=gi[t]||(gi[t]={
self:0,count:0,err:0,real:0
}
);
o.count++,o.pending||(o.pending=0,eo[t]=n),o.pending++;
let a,i=!0;
try{
a=e(o),i=!1
}
finally{
i&&o.err++,o.self+=Date.now()-n
}
let s=r?()=>console.log(`${
t
}
${
i?" (errored)":""
}
: ${
Date.now()-n
}
ms`):void 0;
return a&&typeof a=="object"&&"then"in a?(i=!0,a.then(l=>(o.async=(o.async??0)+(Date.now()-n),i=!1,l)).finally(()=>{
mi(o,t),i&&o.err++,s?.()
}
)):(s?.(),mi(o,t),a)
}
function mi(t,e,r=!0){
let n=eo[e];
t.pending&&--t.pending===0&&n&&(t.real+=Date.now()-n,delete eo[e],r&&delete t.pending)
}
var gi={

}
,eo={

}
;
U();
function v2(t){
return t===".SF NS"?"SF Pro Text":t?.replace(" (Fontations)","")
}
var ro=async(t,e,r,n,o,a,i,s)=>{
if(o||(o=getComputedStyle(t)),o.visibility!=="visible"||r&&!r.includes(o.position))return;
let l=s||await Kr(t,n,a);
if(!(t?.tagName==="BODY"||t?.tagName==="HTML")&&po(t,l,o))return;
let u=e[e.length-1],f=await Kl(t,o,l,n,a);
return!t&&u&&(o.width===getComputedStyle(u).width&&(f.styles.width="100%"),o.height===getComputedStyle(u).height&&(f.styles.height="100%")),i&&(b2(t)&&(f.styles.width="fit-content"),w2(t)&&(f.styles.height="fit-content")),await md({
node:f,el:t
}
),f
}
;
function b2(t){
if(!t.parentElement||Wi(t.computedStyleMap().get("width")?.toString()))return!1;
let e=getComputedStyle(t),r=t.parentElement.style.paddingRight,{
width:n
}
=e;
t.parentElement.style.paddingRight="";
let o=e.width!==n;
return t.parentElement.style.paddingRight="1px",o||=e.width!==n,t.parentElement.style.paddingRight=r,!o
}
function w2(t){
if(!t.parentElement||Wi(t.computedStyleMap().get("height")?.toString()))return!1;
let e=getComputedStyle(t),r=t.parentElement.style.paddingBottom,{
height:n
}
=e;
t.parentElement.style.paddingBottom="";
let o=e.height!==n;
return t.parentElement.style.paddingBottom="1px",o||=e.height!==n,t.parentElement.style.paddingBottom=r,!o
}
async function x2(t){
if(zu(t))return{
nodes:t.assignedNodes({
flatten:!0
}
)||[]
}
;
if(window.getShadowRoot&&He(t)&&t.hasAttribute("__h2d_shadowRoot")){
let e=window.getShadowRoot(t);
if(e)return{
nodes:[...e.childNodes]
}

}
if(Gi(t)||Qu(t)||Vi(t)||Xu(t)||t.tagName==="DETAILS"||t.hasAttribute("__h2d_shadowRoot")||Xo(t)){
let e=await(Xo(t)?window.fetchContentDocument:window.fetchShadowRoot)?.(t);
if(e){
let r=window[e];
if(r)return{
nodes:[...r.childNodes]
}

}
return{
nodes:[]
}

}
return t.shadowRoot?{
nodes:[...t.shadowRoot.childNodes],isolatedStyles:!0
}
:Nr(t)?{
nodes:t.contentDocument?[t.contentDocument.documentElement]:[],isolatedStyles:!0
}
:{
nodes:[...t.childNodes]
}

}
async function jr(t){
let e=await t;
return e?[e]:[]
}
function A2(t,e,r){
let{
platformFontCache:n,svgRefCache:o,...a
}
=e;
return globalThis.serializeIFrame(t,a,r)
}
function M2(t,e){
let r=e.length-1,n=t;
for(;
;
){
let{
webkitLineClamp:o,webkitBoxOrient:a,display:i
}
=n;
if(i==="-webkit-box"||i==="flow-root")return o!=="none"&&a==="vertical"?Number(o):void 0;
if(--r<0)return;
n=getComputedStyle(e[r])
}

}
var Oo=class extends Error{
constructor(){
super("Serialization was cancelled")
}

}
;
async function no(t,e,r,n,o,a,i=!1){
if(r.cancelled?.value)throw new Oo;
if(mo(t)){
if(a)return[];
let s=e[e.length-1],l=getComputedStyle(s);
if(l.visibility!=="visible")return[];
let u=await B2(r,t,l,e,n,o);
return Promise.all(u.map(({
s:f,q:p,isEllipsis:g,isTruncated:w
}
)=>Zn({
text:f,parent:s,rect:nl(p),node:t,computedStyle:l,isEllipsis:g,isTruncated:w,ctx:r
}
))).then(f=>f.filter(Boolean))
}
else if(ar(t)){
if(r.excludedEls&&r.excludedEls.has(t))return[];
let s=getComputedStyle(t),l=Ro(Ul(s),n);
if(Wr(t)){
let u=t.cloneNode(!0);
if(Ng(t,u),t===document.children[0])return[{
x:0,y:0,width:0,height:0,quad:[0,0,0,0,0,0,0,0],type:"SVG",svg:u.outerHTML.replace(/\s+/g," ")
}
];
let f=await ro(t,e,a,r,s,l,i);
if(f){
Xl(t,u),await fc(r,t,u),await Pg(u),await j2(t,u,r,s,f,e,o,l,a);
let p=P2(f,u.outerHTML.replace(/\s+/g," "));
(f.children||(f.children=[])).unshift(p)
}
return jr(f)
}
else{
if(["NOSCRIPT","SCRIPT","STYLE"].includes(t.tagName))return[];
if(go(t))return jr(Zn({
text:`
`,parent:t,rect:await Kr(t,r,l),node:t,ctx:r
}
));
{
let u=()=>sc(t,e,a,r,o,s,l,i),f=E2(t,r);
f&&r.hoverDepth++;
let p=await u();
return p?.length===1&&f&&r.hoverElements.push({
el:t,node:p[0],run:u,depth:r.hoverDepth,hoverRule:f
}
),p
}

}

}
return[]
}
function E2(t,e){
for(let r=0;
r<e.hoverRules.length;
r++)try{
if(t.matches(e.hoverRules[r]))return e.hoverRules[r]
}
catch(n){
console.log(`Invalid hover selector: ${
e.hoverRules[r]
}
, dropping it`,n),e.hoverRules.splice(r--,1),$t.exception("getLayersFor:matchesHoverRule1",n)
}
for(let r=0;
r<e.hoverRulesChildren.length;
r++)try{
if(t.querySelector(e.hoverRulesChildren[r]))return e.hoverRulesChildren[r]
}
catch(n){
console.log(`Invalid hover selector: ${
e.hoverRulesChildren[r]
}
, dropping it`,n),e.hoverRulesChildren.splice(r--,1),$t.exception("getLayersFor:matchesHoverRule2",n)
}

}
function C2(t,e){
for(let r=0;
r<t.length;
r++){
let n=t[r],o=t.getPropertyValue(n);
e.style.setProperty(n,o)
}

}
function S2(t){
return t.replace(/\\([0-9A-Fa-f]{
1,6
}
)\s*|\\(.)/g,(e,r,n)=>{
if(r!==void 0){
let o=parseInt(r,16);
return String.fromCharCode(o)
}
return n!==void 0?n:e
}
)
}
async function sc(t,e,r,n,o,a,i,s){
if(Yi(t,a))return[];
let l=await ro(t,e,r,n,a,i,s);
if(a.contentVisibility==="hidden")return jr(l);
let u=r?.includes(a.position)?void 0:r;
if(!l){
let v=nd(a);
if(r&&v)return[];
let x=a.visibility!=="visible";
if(!r&&!x&&v)return[];
x||(u=["absolute","fixed"])
}
let f=getComputedStyle(t,"::marker"),p=getComputedStyle(t,":before"),g=getComputedStyle(t,":after"),w,b,h,m=[];
try{
if(a.listStyle&&a.display==="list-item"&&f.content!=="none"||p.content&&p.content!=="none"||g.content&&g.content!=="none"){
let I=await globalThis.fetchBeforeAfter?.(t).catch(Vn("fetchBeforeAfter",t));
for(let{
pseudoType:z,key:R,border:M
}
of I||[]){
let C=R?window[R]:void 0;
async function E(q){
if(q.content!=="normal"){
let Y=q.content.match(/^"(.*)"$/)?.[1];
if(Y?.trim()){
let G=t.ownerDocument.head||t.ownerDocument.documentElement;
if(!t.ownerDocument.getElementById("__h2d_pseudo_disable")){
let H=document.createElement("style");
H.id="__h2d_pseudo_disable",H.textContent=ef,G.appendChild(H)
}
let j=document.createElement("span");
C2(q,j),t.classList.add(`__h2d-remove-${
z
}
`),j.classList.add("__h2d-remove-before","__h2d-remove-after"),j.textContent=S2(Y),z==="before"?t.insertBefore(j,t.firstChild):t.appendChild(j);
try{
return await no(j,[...e,t],n,i,o,u).catch(yi)
}
finally{
j.remove(),t.classList.remove(`__h2d-remove-${
z
}
`)
}

}

}
return ro(C,[...e,t],u,n,q,i,!1,$r(M,n,!0)).catch(yi).then(Y=>Y?[Y]:void 0)
}
z==="before"&&!t.classList.contains("__h2d-remove-before")?b=await E(p):z==="after"&&!t.classList.contains("__h2d-remove-after")?h=await E(g):z==="marker"&&(w=Zn({
node:C,parent:t,text:"\u2022",rect:ad($r(M,n,!0),"content-box",f),computedStyle:f,pseudo:z,ctx:n
}
))
}

}
let v=async()=>{
if(l){
let I=Mo(...n.state.cssTransform?[n.state.cssTransform]:[],...i?[i]:[]),z=await globalThis.getBoxModel(t);
if(z)if(z.content[0]===0&&z.content[1]===0){
let R=Lr(z.content,n,!0);
I[12]=R[0],I[13]=R[1]
}
else I[12]=z.content[0],I[13]=z.content[1];
return I
}

}
,x,k;
if(Nr(t)){
if(!l)return[];
k=await v();
let I=t.contentDocument;
if(I){
let z=oo(t,I);
await ic(void 0,I).then(R=>R()),l.doc=z
}
else{
let z=await A2(t,n,{
cssTransform:k,rootCssTransform:k
}
);
if(z){
let{
frame:R,doc:M
}
=z;
l.doc=M,l.offsetCoords=!!R.offsetCoords,delete R.offsetCoords,x=[R]
}
else console.warn("Unable to serialize cross-domain iframe",t.src||t.srcdoc),x=[]
}

}
if(!x){
o=D2(l,a,o);
let{
nodes:I,isolatedStyles:z
}
=await x2(t);
x=[];
for(let R of I)x.push(await no(R,[...e,t],{
...n,platformFontCache:z?{

}
:n.platformFontCache,state:Nr(t)?{
...n.state,cssTransform:k
}
:n.state
}
,i,o,u).catch(M=>{
if(M instanceof Oo)throw M;
console.warn("Error on",R,M)
}
))
}
let N=[];
w&&N.push(w),b&&N.push(b),N.push(...x),h&&N.push(h);
let _=(await Promise.all(N)).filter(Boolean).flatMap(I=>I);
if(_.length){
if(!l){
let I=await Kr(t,n,i);
if(a.display==="")return[];
l=await Kl(t,a,I,n,i)
}
l.children=_
}
return jr(l)
}
finally{
m.forEach(v=>v())
}

}
function yi(t){
console.warn(t)
}
function $r(t,e,r){
return nl(Lr(t,e,r))
}
function Lr(t,e,r){
let n=r?e.state.rootCssTransform:e.state.cssTransform;
return n?el(n,t):t
}
function lc({
nestedRule:t,items:e,combinator:r,...n
}
){
let o=e.filter(a=>a.type!=="PseudoClass"||a.name!=="hover");
if(o.length!==e.length)return{
rule:{
...n,items:o
}
,combinator:r,nestedRule:t
}
;
if(t){
let a=lc(t);
if(a)return{
...a,rule:{
...n,items:e,combinator:r,nestedRule:a.rule
}

}

}

}
async function _2(t,e={

}
,r={

}
){
let n=await cc(t,e,r);
if(!n.frame)throw new Error("Serialized frame is empty");
return n
}
async function cc(t,e={

}
,r={

}
){
e.trackDefaults&&$t.initialize(e.trackDefaults);
let n=Date.now();
if(!t)throw new Error("Cannot serialize empty or null element");
let o=await ac(t.ownerDocument.location);
if(o){
let u=Ki(t,o);
if(u.length){
let f=u[0].getBoundingClientRect(),p={
type:"FRAME",tag:"$",styles:rl
}
,g={

}
,w=[];
for(let b of u){
let h=[];
try{
u.length===1?h.push(xi(b,{
position:"fixed",top:"0",left:"0",padding:"0",width:"100vw",height:"100vh"
}
)):b.scrollIntoView();
let m=b;
do h.push(xi(m,{
transform:"none"
}
));
while((m=m.parentElement)&&m!==document.body);
let v=await cc(b,e,r);
v.frame&&((p.children??=[]).push(v.frame),v.assets&&Object.assign(g,v.assets),v.cssProps&&w.push(...v.cssProps))
}
finally{
h.forEach(m=>m())
}

}
if(!p.children?.length)throw new Error("Serialized frames are empty");
return{
frame:p,doc:oo(t),assets:g,cssProps:w,rect:f
}

}

}
let a=t.getBoundingClientRect(),i={
...e,platformFontCache:{

}
,svgRefCache:{

}
,hoverRules:[],hoverRulesChildren:[],hoverDepth:0,hoverElements:[],state:r
}
,s=T2();
await Cg(i.svgRefCache,t);
let l=kg(t).map(u=>()=>u.unpauseAnimations());
try{
let u=function(v){
!v.parentElement||(u(v.parentElement),p=Ro(p,Ul(getComputedStyle(v))),f.push(v))
}
,f=[],p;
u(t);
let g=u2({
strict:!1
}
),w=await Ar("fetchStyleRules",()=>Ug(t.ownerDocument),!0).catch(v=>($t.exception("serializeDom:fetchStyleRules",v),[]));
if(Ar("patchRound",()=>{
{
let v=w.filter(({
isCrossDomain:x
}
)=>!x).map(({
rule:x
}
)=>k2(x)).reduce((x,k)=>x+k,0);
v>0&&$t.track("serializeDom:patchRoundFnValues",{
properties:{
patchedTotal:v
}

}
)
}

}
),e.withHoverElements){
let v=new Set,x=new Set;
try{
Ar("fetchHoverStyles",()=>w.filter(({
rule:k
}
)=>k.selectorText.includes(":hover")).forEach(({
rule:k
}
)=>{
try{
let N=g(k.selectorText);
return h2(N.rules.map(lc)).map(({
rule:_,nestedRule:I
}
)=>{
let z=de(_);
if(z)v.add(z);
else if(I?.combinator===">"){
let R=de(I);
R&&x.add(`:scope ${
R
}
`)
}

}
)
}
catch{

}

}
),!0)
}
catch(k){
$t.exception("serializeDom:fetchHoverStyles",k)
}
i.hoverRules.push(...v),i.hoverRulesChildren.push(...x),console.log(`Found ${
i.hoverRules.length
}
 hover rules, ${
i.hoverRulesChildren.length
}
 child hover rules`)
}
let b=(await Ar("getLayersFor",()=>no(t,f,i,p,[],void 0,!0),!0))[0];
if(b?.type==="TEXT")throw d2("Unexpected text layer");
let h;
b?.type==="FRAME"&&b.doc?(h=b.doc,b=b.children[0]):h=oo(t);
let m={
frame:b,doc:h,rect:a
}
;
if(!b)return m;
if(e.withHoverElements){
let v=Date.now();
console.log(`Transforming ${
i.hoverElements.length
}
 hover elements`);
let x=0,k=0,N,_=!1;
try{
let I=t.ownerDocument.getElementById("__h2d_anim_pause");
I&&(console.log("Removing animation pauser"),HTMLElement.prototype.remove.call(I));
async function z(R){
let M=i.hoverElements.splice(0);
console.log(`Processing hover elements ${
R
}
: ${
M.length
}
`);
for(let C=0;
M.length>0;
C++){
if(Date.now()-v>2e4){
_=!0;
return
}
let E=M.filter(({
depth:q
}
)=>q===C);
console.log(`Processing hover elements step ${
R
}
${
C
}
: ${
E.length
}
`),M=M.filter(({
depth:q
}
)=>q!==C),E.forEach(({
el:q
}
)=>{
let Y=F2(q.ownerDocument);
Y&&l.push(()=>Y.remove())
}
),await Promise.all(E.map(({
el:q
}
)=>globalThis.forcePseudoState({
node:q,forcedPseudoClasses:["hover"]
}
))),await Promise.all(E.map(({
run:q,node:Y
}
)=>q().then(G=>{
k++,G.length===1&&(Y.hover=G[0])
}
).catch(G=>{
N||=G,x++
}
))),await z(R+C+"/"),await Promise.all(E.map(({
el:q
}
)=>globalThis.forcePseudoState({
node:q,forcedPseudoClasses:[]
}
)))
}

}
await z("/")
}
catch(I){
$t.exception("serializeDom:transformHoverElements",I)
}
N&&$t.exception("serializeDom:transformHoverElements",N,{
errorCount:x
}
),$t.feature_test("hoverElements",{
rules:i.hoverRules.length,elements:k,errors:x,aborted:_,duration:Date.now()-v
}
)
}
return e.withCssProps&&(m.cssProps=Gg(t.ownerDocument)),console.log("CDP perf counters",s),m
}
finally{
console.log("serializeDom",Date.now()-n,"ms"),l.forEach(u=>{
try{
u()
}
catch(f){
console.warn("Error during cleanup",f)
}

}
)
}

}
function k2(t){
let e=0,r=t.style;
for(let n=0;
n<r.length;
n++){
let o=r[n],a=r.getPropertyValue(o);
if(a&&a.includes("round(")){
let i=N2(a),s=r.getPropertyPriority(o);
r.setProperty(o,i,s),e++
}

}
return e
}
function N2(t){
let e=(0,di.default)(t);
function r(n){
for(let o=0;
o<n.length;
o++){
let a=n[o];
a.type==="function"&&a.value==="round"&&a.nodes.length>=2?n[o]=a.nodes[2]:a.nodes&&r(a.nodes)
}

}
return r(e.nodes),di.default.stringify(e.nodes)
}
function oo(t,e=me().document){
let r=e.body||e.children[0];
return{
title:e.title,innerHeight:me().innerHeight,innerWidth:me().innerWidth,fontSize:parseFloat(getComputedStyle(r).fontSize),baseURI:t.baseURI,bgColor:function(){
let n=e.createElementNS("http://www.w3.org/1999/xhtml","div");
n.style.color="Canvas",r.appendChild(n);
let o=window.getComputedStyle(n).color;
return r.removeChild(n),o
}
()
}

}
function T2(){
let t={

}
,e=function(r,n=!1){
let o=globalThis,a=o[`${
r
}
.bak`]||globalThis[r];
!a||(o[`${
r
}
.bak`]=a,o[r]=function(i){
return t[r]=(t[r]||0)+1,a(i)
}
)
}
;
return e("getBoxModel"),e("getAssetWithCDP",!0),e("getContentQuads"),e("fetchBeforeAfter"),e("getPlatformFontForNode"),e("forcePseudoState"),e("fetchShadowRoot"),t
}
async function Kr(t,e,r){
if(!go(t)&&uc(r)){
let o=await globalThis.getBoxModel(t);
if(o)return $r(o.border,e,!0)
}
let n=Eo(t.getBoundingClientRect());
return $r(ol(n),e,!1)
}
function P2(t,e){
return{
x:t.x,y:t.y,width:t.width,height:t.height,quad:t.quad,type:"SVG",svg:e
}

}
function I2(t){
if(t.length<=1)return t;
let e=[],r=t[0];
for(let n=1;
n<t.length;
n++){
let o=t[n];
r[2]===o[0]&&r[3]===o[1]&&r[4]===o[6]&&r[5]===o[7]?r=[r[0],r[1],o[2],o[3],o[4],o[5],r[6],r[7]]:(e.push(r),r=o)
}
return e.push(r),e
}
function Mr(t,e,r=0){
return t.x>=e.x-r&&t.x+t.width<=e.x+e.width+r&&t.y>=e.y-r&&t.y+t.height<=e.y+e.height+r
}
async function B2(t,e,r,n,o,a){
let{
direction:i,textOverflow:s
}
=r,l=M2(r,n)!==void 0||s==="ellipsis",u=i==="rtl",f=e.ownerDocument.createRange(),p=e.textContent?.replace(/[\u2028\u2029]/g," ")??"",g=l||uc(o),w=await R2(e,g);
l||(w=I2(w));
let b=[],h=!1,m=!1,v="",x=[],k=null;
for(let N=0;
N<p.length;
){
let _=Wl(p,N);
f.setStart(e,N),f.setEnd(e,N+_);
let I=f.getBoundingClientRect(),z={
start:N,length:_,rect:I,isSpace:p.slice(N,N+_).trim()===""
}
;
k?z.isSpace&&Mr(z.rect,k.rect)||(k.isSpace&&Mr(k.rect,z.rect)||x.push(k),k=z):k=z,N+=_
}
k&&x.push(k),f.detach();
for(let N=0;
N<w.length;
N++){
if(t.cancelled?.value)throw new Oo;
let _=w[N],I=Lr(_,t,g),z=_;
if(g&&t.state.cssTransform){
let E=Vp(t.state.cssTransform);
E&&(z=el(E,I))
}
if(a.find(E=>O2(I,E))||tl(_)===0)continue;
let R=id(z),M=x.find(E=>Mr(E.rect,R,g?.01:0)),C=x.findLast(E=>Mr(E.rect,R,g?.01:0));
if(M&&C&&(M!==C||sd(M.rect,R))){
let E=p.slice(M.start,C.start+C.length),q={
s:E,q:_
}
;
if(h)h=!1,q.isEllipsis=!0,q.s="\u2026";
else if(m)q.isTruncated=!0,q.fullText=v,h=!0,m=!1;
else if(N<w.length-1){
let Y=w[N+1];
if(u?_[2]===Y[2]&&_[3]===Y[3]:_[0]===Y[0]&&_[1]===Y[1]){
m=!0,v=E;
continue
}

}
b.push(q)
}
else(h||l)&&(h=!1,b.push({
s:"\u2026",q:_,isEllipsis:!0
}
))
}
return b.forEach(N=>{
N.q=Lr(N.q,t,g)
}
),b
}
function uc(t){
if(!t)return!1;
let e=Gp(t);
return e?!!(e.rotateX||e.rotateY||e.rotateZ||e.skew||e.skewX||e.skewY):!1
}
async function R2(t,e){
if(e)return globalThis.getContentQuads?.(t);
let r=document.createRange();
r.selectNode(t);
let n=r.getClientRects(),o=Array.from(n).map(ol);
return r.detach(),o
}
function vi(t){
return new Ee.default.Polygon(new Ee.default.Vector,[new Ee.default.Vector(t[0],t[1]),new Ee.default.Vector(t[2],t[3]),new Ee.default.Vector(t[4],t[5]),new Ee.default.Vector(t[6],t[7])])
}
function O2(t,e){
return!(0,Ee.testPolygonPolygon)(vi(t),vi(e))
}
function D2(t,e,r){
let n=e.overflowX==="scroll"||e.overflowX==="auto"||t?.tag==="body",o=e.overflowY==="scroll"||e.overflowY==="auto"||t?.tag==="body";
if(n&&o)return[];
if(n&&(r=r.map(bi)),o&&(r=r.map(wi)),t&&(e.overflowX==="hidden"||e.overflowY==="hidden")){
let a=t.tag!=="body"&&e.display!=="contents"&&(e.overflowX==="hidden"||t.tag==="iframe"),i=t.tag!=="body"&&e.display!=="contents"&&(e.overflowY==="hidden"||t.tag==="iframe");
if(a||i){
let s=t.quad;
return a||(s=bi(s)),i||(s=wi(s)),[...r,s]
}

}
return r
}
function bi(t){
return t[1]!==t[3]&&console.warn("Unclipping of rotated quad unsupported yet"),[-999999,t[1],999999,t[3],999999,t[5],-999999,t[7]]
}
function wi(t){
return t[0]!==t[6]&&console.warn("Unclipping of rotated quad unsupported yet"),[t[0],-999999,t[2],-999999,t[4],999999,t[6],999999]
}
function xi(t,e){
let r={

}
;
for(let n in e)r[n]=t.style[n],t.style[n]=e[n];
return()=>Object.assign(t.style,r)
}
function F2(t){
if(!t.getElementById("__hover_instantAnimations")){
let e=t.createElement("style");
return e.id="__hover_instantAnimations",e.textContent=Qi({
pauseAnimations:!0
}
),t.head.appendChild(e),e
}

}
async function fc(t,e,r){
if(ar(e)&&Ae(e)){
let n=r;
if(Yu(e)){
let o=await Ql(t,e,getComputedStyle(e),void 0);
Jl(o?.familyName)&&(n.setAttribute("data-platform-font-familyName",v2(o.familyName)),n.setAttribute("data-platform-font-postScriptName",o.postScriptName))
}
await Promise.all(Array.from(e.childNodes).map((o,a)=>fc(t,o,r.childNodes[a])))
}

}
async function j2(t,e,r,n,o,a,i,s,l){
let u=m=>{
let v=e.viewBox.baseVal[m];
return v?zt(kr(n[m])/v,1e3):1
}
,f=u("width"),p=u("height"),g=t.getAttribute("preserveAspectRatio")==="none"?`${
f
}
 ${
p
}
`:`${
Math.min(f,p)
}
`,w=t.computedStyleMap(),b=w.get("width"),h=w.get("height");
for(let m of t.querySelectorAll("foreignObject")){
let v=$2(m,n,b,h,f,p,g);
(o.children??=[]).push(...await sc(m,[...a,t],l,r,i,v,s,!1))
}
for(let m of e.querySelectorAll("foreignObject"))m.remove()
}
function $2(t,e,r,n,o,a,i){
let s=t.getBBox(),l=t.computedStyleMap(),u=l.get("width"),f=l.get("height"),p=Ai(u,r,o),g=Ai(f,n,a);
return{
...e,transformOrigin:"0px 0px",scale:i,position:"absolute",left:`${
zt(s.x*o,10)
}
px`,top:`${
zt(s.y*a,10)
}
px`,width:p,height:g
}

}
function Ai(t,e,r){
return!t||!e||!Mi(t)||!Mi(e)?"auto":t.unit==="percent"&&e.unit==="percent"?`${
zt(t.value*e.value/(100*r),1)
}
%`:t.unit==="px"&&e.unit==="percent"||e.unit==="px"&&t.unit==="percent"?`${
zt(t.value*e.value/(100*r),1)
}
px`:"auto"
}
function Mi(t){
return"unit"in t
}
U();
function L2(t){
switch(t){
case"number":case"string":case"boolean":return!0;
default:return!1
}

}
function Ne(t){
return Object.fromEntries(Object.entries(t||{

}
).filter(([,e])=>e==null||L2(typeof e)))
}
function z2(t){
let e=U2(t);
if(e||(e=Y2(t),e)||(e=G2(t),e)||(e=V2(t),e)||(e=Z2(t),e))return e;
if(t.tagName.indexOf("-")>=0){
let r=Object.fromEntries(Object.getOwnPropertyNames(t).map(o=>[o,t[o]]));
return{
framework:"web-component",name:t.tagName.toLowerCase(),props:Ne(r)
}

}
if(t.hasAttribute("s2d-component")){
let r=t.getAttribute("s2d-component"),n=Object.fromEntries(Array.from(t.classList).map(o=>[o,!0]));
return{
framework:"html",name:r,props:Ne(n)
}

}

}
function q2(t){
let e=Object.keys(t).find(i=>i.startsWith("__reactFiber$")||i.startsWith("__reactInternalInstance$"));
if(!e)return;
let r=t[e];
if(r==null)return;
r._currentElement;
let n=r,o,a;
for(;
n=n.return,!(!n||H2(n));
){
let i=n.type?.displayName||n.elementType?.displayName||n.elementType?.__docgenInfo?.displayName;
if(typeof i!="string")continue;
let[s,l]=W2(i);
if(!l&&s){
if(s.endsWith("Provider"))break;
a=n,o=s
}

}
if(!(!o||!a))return{
name:o,fiber:a
}

}
function U2(t){
let e=q2(t);
if(e){
let{
name:r,fiber:n
}
=e;
return{
framework:"react",name:r,props:Ne(n.memoizedProps)
}

}

}
function H2(t){
return typeof t.type=="string"
}
function W2(t){
if(t==null)return[null,null];
let e=null;
if(t.indexOf("(")>=0){
let r=t.match(/[^()]+/g);
r!=null&&(t=r.pop(),e=r)
}
return[t,e]
}
function Y2(t){
let e=t.__vueParentComponent;
if(e?.type){
let{
type:r,props:n
}
=e,o=r.name||r._componentTag||r.__vdevtools_guessedName||r.__name;
if(o)return{
framework:"vue3",name:o,props:{
...Ne(n)
}

}

}

}
function G2(t){
let e=t.__vue__;
for(;
e;
){
let r=e._vnode?.componentInstance||e,n=r.$options||r.fnOptions||{

}
,o=n.displayName||n.name||n._componentTag;
if(o){
let i=Ne(Object.fromEntries(Object.keys(r.$options.props||{

}
).map(s=>[s,r[s]])));
return{
framework:"vue2",name:o,props:i
}

}
let a=e.$children;
if(a.length===1&&a[0].$el==e.$el)e=a[0];
else return
}

}
function V2(t){
let e=(window.name==="__h2d__sandbox"?window.parent:window).__SVELTE_DEVTOOLS__;
if(e?.svelteVersion){
let{
getNode:r,serializeNode:n
}
=e,o=r(t)?.parent;
for(;
o;
){
switch(o.type){
case"component":return{
framework:"svelte",name:o.tagName,props:Ne(Object.fromEntries((n(o)?.detail?.attributes||[]).map(({
key:a,value:i
}
)=>[a,i])))
}
;
case"element":return;
case"block":case"slot":break
}
o=o.parent
}

}

}
function Z2(t){
let e=t.__ngContext__;
if(e){
let r=e.component??window.ng?.getComponent?.(t);
return r?{
name:r.constructor.name.replace(/^_/,""),framework:"angular",props:Ne(Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(r)).filter(([n])=>!/^__ng/.test(n)).map(([n,{
value:o
}
])=>[n,o])))
}
:void 0
}

}
function X2(t){
if(t.componentInfo){
if(t.callbacks?.onElement)throw new Error("TODO merge callbacks");
(t.callbacks??={

}
).onElement=(e,r)=>{
let n=z2(e);
n&&(r.$meta=n)
}
,t.withHoverElements=!0,t.withCssProps=!0
}
return t
}
async function J2(t,e={

}
,r={

}
){
return _2(t,X2(e),r)
}
U();
function hc(t,e=0){
let r=t.children,n=[void 0,"before","after"].flatMap(o=>{
let a=getComputedStyle(t,o);
return[a.transitionDuration,a.animationDuration]
}
).flatMap(o=>o.split(", ")).filter(o=>o!=="0s");
n.length>0&&(e=Math.max(e,n.map(o=>parseFloat(o.slice(0,-1))).reduce((o,a)=>a>o?a:o,0)*1e3)),t.shadowRoot&&(r=t.shadowRoot.children);
for(let o=0;
o<r.length;
o++)e=hc(r[o],e);
return e
}
U();
function Q2(){
return new Promise(t=>{
requestAnimationFrame(()=>{
t()
}
)
}
)
}
var K2=(t,e)=>new Promise((r,n)=>setTimeout(()=>{
e&&"errorOnTimeout"in e?n(new Error(e.errorOnTimeout)):r(e?.value)
}
,t)),xy=Symbol();
function ty(t,e,r){
return globalThis.fetchShadowRoot=async function(n){
return r("fetchShadowRoot",{
selector:e(t,n)
}
)
}
,globalThis.getShadowRoot=function(n){
return chrome.dom.openOrClosedShadowRoot(n)
}
,globalThis.fetchContentDocument=async function(n){
return r("fetchContentDocument",{
selector:e(t,n)
}
)
}
,globalThis.fetchBeforeAfter=async function(n){
return r("fetchBeforeAfter",{
selector:e(t,n)
}
)
}
,globalThis.getPlatformFontForNode=async function({
node:n,pseudo:o
}
){
return r("getPlatformFontForNode",{
selector:e(t,n),pseudo:o
}
)
}
,globalThis.forcePseudoState=async function({
node:n,forcedPseudoClasses:o
}
){
return r("forcePseudoState",{
selector:e(t,n),forcedPseudoClasses:o
}
)
}
,globalThis.getBoxModel=async function(n){
return r("getBoxModel",{
selector:e(t,n)
}
)
}
,globalThis.getContentQuads=async function(n){
return mo(n)&&ms(n)?[]:r("getContentQuads",{
selector:e(t,n)
}
)
}
,globalThis.getAssetWithCDP=async function(n){
return r("getAssetWithCDP",{
url:n
}
)
}
,globalThis.serializeIFrame=async function(n,o,a){
let i=await r("serializeIFrame",{
selector:e(t,n),url:n.srcdoc?.slice(0,80)||n.src,state:a,opts:o
}
);
if(!i)return;
let{
frame:s,doc:l
}
=Fu(i.compressedFrame);
if(s)return s.$assetsMeta=i.$assetsMeta,s.offsetCoords=i.offsetCoords,{
frame:s,doc:l
}

}
,async(n,o,a)=>{
let i=nf(Qi({
pauseAnimations:!0
}
));
try{
let l=function(h){
let m=document.createTreeWalker(h,NodeFilter.SHOW_ELEMENT);
do{
let v=m.currentNode;
if(He(v)){
let x=chrome?.dom?.openOrClosedShadowRoot(v);
if(x&&l(x),v.tagName==="IFRAME")try{
let k=v,N=k.contentDocument??k.contentWindow?.document;
N?.body&&l(N.body)
}
catch{

}
ea(t,v)
}
else Wr(v)&&ea(t,v)
}
while(m.nextNode())
}
;
var s=l;
(document.head||document.documentElement).appendChild(i);
let u=Math.min(1e3,hc(n));
u>0&&(console.log(`Waiting for existing transition to finish (${
u
}
ms)`),await new Promise(h=>setTimeout(h,u))),l(n),await Promise.race([Q2(),K2(50)]);
let{
cleanupClassNames:f=!0,...p
}
=o||{

}
,{
doc:g,frame:w,rect:b
}
=await J2(n,{
withHoverElements:!0,...p,trackDefaults:uo.def,classListFilter:h=>!!h&&!h.startsWith(t)
}
,a).finally(()=>{
f&&ch(t)
}
);
return{
doc:g,frame:w,rect:b
}

}
finally{
try{
HTMLElement.prototype.remove.call(i)
}
catch(l){
console.error("Failed to remove custom css with instant animation",l)
}
console.debug(`DOM conversion for ${
document.baseURI
}
 end.`)
}

}

}
function ey(t){
let e=async n=>{
let o=n?.data,a=o.respId;
if(!(o?.type!=="cdp-call"||!a))try{
let{
cmd:i,args:s
}
=o,l=await le(i,s);
n.source?.postMessage({
type:"cdp-call-response",respId:a,result:l
}
,{
targetOrigin:"*"
}
)
}
catch(i){
console.error("CDP CALL ERROR",i),n.source?.postMessage({
type:"cdp-call-response",respId:a,error:i
}
,{
targetOrigin:"*"
}
)
}

}
;
window.addEventListener("message",e);
let r=ty(t,fh,le);
return{
serialize:(...n)=>r(...n),cleanup:()=>window.removeEventListener("message",e)
}

}
U();
async function ry(t){
if(!t?.click)return;
let e=me().document.querySelector(t.click);
e&&He(e)&&e.click()
}
yu();
var Ei=0,{
serialize:Do,cleanup:ny
}
=ey(Xe);
Zt("cleanup",()=>ny());
wu(async(t,e)=>{
let r=0;
if(t.length)for(let o of t)await Ui(o,Do).then(()=>r++).catch(a=>le("importFailed",a.message||String(a))).catch(a=>{
throw _e(),a
}
);
let n=!e&&!Ei;
Ei+=r,n?(await le("finalizeImport",void 0),_e()):await le("addCapture",void 0,"content-script")
}
,()=>{
le("cancelCapture",void 0,"background"),_e()
}
);
Zt("toastError",({
data:t
}
)=>bu(t));
Zt("toastInfo",({
data:t
}
)=>vu(t));
Zt("fetchResource",({
data:{
url:t
}

}
)=>ju(t,globalThis.fetch,$u));
Zt("serializeBody",async({
data:{
opts:t,state:e
}

}
)=>{
let r=await pc();
return Do(document.documentElement,{
...t,cleanupClassNames:!1
}
,e).then(({
frame:n,doc:o
}
)=>zi({
frame:n,doc:o
}
)).finally(r)
}
);
Zt("convertBody",async({
data:t
}
)=>{
let e=await pc(t);
await Ui(document.documentElement,Do).finally(e)
}
);
async function pc(t){
let e=await ac(document.location);
await ry(e);
let r=await ic(e,document),n;
t?.width&&(n=document.createElement("style"),n.innerText="body::-webkit-scrollbar{
display:none
}
",(document.head||document.documentElement).appendChild(n));
for(let o of Yr(document,"body")){
o.id??="__x2d_body";
let a=o.ownerDocument,i=a.createElement("style");
i.id="__h2d_anim_pause",i.textContent=rf(),(a.head||a.documentElement).appendChild(i)
}
return await r(),()=>n?.remove()
}
window.contentScriptId??=Date.now();
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 *//*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *//** @preserve SAT.js - Version 0.9.0 - Copyright 2012 - 2021 - Jim Riecken <jimr@jimr.ca> - released under the MIT License. https://github.com/jriecken/sat-js *///! javascript-obfuscator:disable
//! javascript-obfuscator:enable
