import{e as l,W as t,aL as n}from"./index-Cb36hODB.js";import{k as s}from"./kuwaitTime-WMSitwzr.js";/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=l("LogIn",[["path",{d:"M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4",key:"u53s6r"}],["polyline",{points:"10 17 15 12 10 7",key:"1ail0h"}],["line",{x1:"15",x2:"3",y1:"12",y2:"12",key:"v6grx8"}]]);function c(e,a="09:00",r=60){return t({date:s(e),schedules:[],records:[{clockIn:e,clockOut:null}]},{defaultStart:a,graceMinutes:r}).lateClass??n(0)}function b(e,a="17:00"){return!e||!a?!1:(t({date:s(e),schedules:[],records:[{clockIn:e,clockOut:e}]},{defaultEnd:a}).hoursEarly??0)>0}const m={"On time":"bg-emerald-100 text-emerald-700 border-emerald-200","Minor late":"bg-amber-50 text-amber-600 border-amber-200",Late:"bg-amber-100 text-amber-700 border-amber-300","Serious late":"bg-rose-100 text-rose-700 border-rose-200"};export{u as L,m as a,b as i,c as l};
