"use client";

import { useId } from "react";

export type ClayIconName = "home" | "calendar" | "health" | "moon" | "chart" | "user" | "spark";

/** A small, consistent set of softly extruded icons; decorative beside labels. */
export function ClayIcon({ name, size = 32 }: { name: ClayIconName; size?: number }) {
  const id = useId().replace(/:/g, "");
  const green = `url(#${id}-green)`;
  const pink = `url(#${id}-pink)`;
  const cream = `url(#${id}-cream)`;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 40 40" fill="none">
      <defs>
        <linearGradient id={`${id}-green`} x1="8" y1="3" x2="31" y2="39" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D9EE96" /><stop offset="0.58" stopColor="#BEDD68" /><stop offset="1" stopColor="#9FBD50" />
        </linearGradient>
        <linearGradient id={`${id}-pink`} x1="8" y1="3" x2="29" y2="39" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD0DC" /><stop offset="0.6" stopColor="#F5A0B8" /><stop offset="1" stopColor="#D97091" />
        </linearGradient>
        <linearGradient id={`${id}-cream`} x1="10" y1="6" x2="30" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF9EC" /><stop offset="0.6" stopColor="#F7EFDE" /><stop offset="1" stopColor="#E8DCC6" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-30%" y="-30%" width="170%" height="180%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.7" floodColor="#766A55" floodOpacity=".16" />
        </filter>
      </defs>
      <g filter={`url(#${id}-shadow)`} stroke="#756A55" strokeOpacity=".1" strokeWidth=".7" strokeLinejoin="round">
        {name === "home" && <><path d="M8 19h24v13a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4Z" fill={cream} /><path d="m4 18 13-12a4 4 0 0 1 6 0l13 12a3 3 0 0 1-4 4L20 12 8 22a3 3 0 0 1-4-4Z" fill={pink} /><rect x="16" y="24" width="8" height="12" rx="3" fill={green} /></>}
        {name === "calendar" && <><rect x="6" y="8" width="28" height="28" rx="7" fill={cream} /><path d="M6 17v-3a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v3Z" fill={pink} /><path d="M13 5v8M27 5v8" stroke="#FAF5E9" strokeWidth="4" strokeLinecap="round" />{[13,20,27].map(x => <rect key={x} x={x-2} y="22" width="4" height="4" rx="1.3" fill={green} />)}<rect x="11" y="29" width="4" height="4" rx="1.3" fill={green} /><rect x="18" y="29" width="4" height="4" rx="1.3" fill={pink} /></>}
        {name === "health" && <><rect x="5" y="5" width="30" height="30" rx="10" fill={cream} /><path d="M20 30S9 24 9 16.7c0-5.6 7.2-7.5 11-2.6 3.8-4.9 11-3 11 2.6C31 24 20 30 20 30Z" fill={pink} /><path d="M12.5 21h4l2-4.5 3.2 8 2.1-3.5h3.7" stroke="#78943B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>}
        {name === "moon" && <path d="M27 6c-12-2-22 8-20 18 2 12 18 16 26 6-15 3-22-13-6-24Z" fill={green} />}
        {name === "chart" && <><rect x="7" y="21" width="7" height="13" rx="3" fill={pink} /><rect x="17" y="7" width="7" height="27" rx="3.5" fill={green} /><rect x="27" y="15" width="7" height="19" rx="3" fill={pink} /><rect x="4" y="33" width="33" height="4" rx="2" fill={cream} /></>}
        {name === "user" && <><circle cx="20" cy="20" r="16" fill={green} /><circle cx="20" cy="14" r="6" fill={cream} /><path d="M10 30c0-6 4-9 10-9s10 3 10 9c-5 5-15 5-20 0Z" fill={cream} /></>}
        {name === "spark" && <><rect x="6" y="7" width="28" height="27" rx="10" fill={pink} /><path d="m20 11 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill={cream} /></>}
      </g>
    </svg>
  );
}
