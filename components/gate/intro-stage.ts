/**
 * Decided before the first paint, from the page itself: a first visit gets the
 * whole opening, a later one a short fade, reduced motion none at all. The
 * stage is a data attribute on <html>, so CSS alone times the opening and ends
 * it even if the page's script is slow to arrive.
 */
export const SEEN_KEY = "moonpatch:intro";

export const decideIntro = `(function(){try{var d=document.documentElement;if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;var seen=null;try{seen=localStorage.getItem("${SEEN_KEY}");localStorage.setItem("${SEEN_KEY}","1")}catch(e){}d.dataset.intro=seen?"repeat":"first"}catch(e){}})()`;
