"use client";

import { useId } from "react";

export type ClayIconName =
  | "home"
  | "calendar"
  | "health"
  | "moon"
  | "chart"
  | "user"
  | "spark"
  | "automation"
  | "category"
  | "alarm"
  | "connection"
  | "profile"
  | "privacy";

type ClayIconProps = {
  className?: string;
  name: ClayIconName;
  size?: number;
};

/** Matte, pillowy icons shared by navigation, connection cards, and settings. */
export function ClayIcon({ className, name, size = 32 }: ClayIconProps) {
  const id = useId().replace(/:/g, "");
  const shadow = `url(#${id}-shadow)`;
  const deepShadow = `url(#${id}-deep-shadow)`;
  const avocado = "#C7E477";
  const avocadoDark = "#667D31";
  const pink = "#F58FAC";
  const pinkDark = "#A83F65";
  const cream = "#FFF8EB";

  return (
    <svg
      aria-hidden="true"
      className={`clay-icon${className ? ` ${className}` : ""}`}
      fill="none"
      height={size}
      viewBox="0 0 48 48"
      width={size}
    >
      <defs>
        <filter id={`${id}-shadow`} x="-35%" y="-35%" width="180%" height="190%">
          <feDropShadow dx="0" dy="2.4" floodColor="#5C533F" floodOpacity=".17" stdDeviation="1.8" />
        </filter>
        <filter id={`${id}-deep-shadow`} x="-35%" y="-35%" width="180%" height="195%">
          <feDropShadow dx="0" dy="3.2" floodColor="#5C533F" floodOpacity=".2" stdDeviation="2.2" />
        </filter>
      </defs>

      {name === "home" && (
        <g filter={shadow} strokeLinejoin="round">
          <path d="M10 22.5h28v16.2a4.3 4.3 0 0 1-4.3 4.3H14.3a4.3 4.3 0 0 1-4.3-4.3Z" fill={cream} />
          <path d="m5 21 15.6-13.6a5.2 5.2 0 0 1 6.8 0L43 21a3.8 3.8 0 0 1-5 5.7L24 14.5 10 26.7A3.8 3.8 0 0 1 5 21Z" fill={pink} />
          <rect fill={avocado} height="15" rx="3.8" width="10" x="19" y="28" />
          <path d="M10.5 21.7 23 10.8" stroke="#FFF" strokeLinecap="round" strokeOpacity=".38" strokeWidth="2.1" />
        </g>
      )}

      {name === "calendar" && (
        <g filter={shadow} strokeLinejoin="round">
          <rect fill={cream} height="38" rx="10" width="38" x="5" y="7" />
          <path d="M5 20v-5A8 8 0 0 1 13 7h22a8 8 0 0 1 8 8v5Z" fill={pink} />
          <path d="M14 5v9M34 5v9" stroke={cream} strokeLinecap="round" strokeWidth="5" />
          {[14, 24, 34].map((x) => <rect fill={avocado} height="6" key={x} rx="2.2" width="6" x={x - 3} y="26" />)}
          <rect fill={pink} height="6" rx="2.2" width="6" x="11" y="35" />
          <rect fill={avocado} height="6" rx="2.2" width="6" x="21" y="35" />
        </g>
      )}

      {name === "health" && (
        <g filter={shadow}>
          <rect fill={cream} height="40" rx="15" width="40" x="4" y="4" />
          <path d="M24 38S10 30.7 10 20.7c0-7.5 9.6-9.9 14-3.5 4.4-6.4 14-4 14 3.5C38 30.7 24 38 24 38Z" fill={pink} />
          <path d="M14 26h5l2.6-6 4.1 10 2.7-4.2H34" stroke={avocadoDark} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
        </g>
      )}

      {name === "moon" && (
        <g filter={shadow}>
          <path d="M33 6.5C18.6 4 7.8 15.3 10.2 28.2 13 43 33.7 46.3 42 33.7 24.2 37.3 15.8 16.7 33 6.5Z" fill={avocado} />
          <path d="M18 33c-4.8-6.7-2.5-15.8 4-20.4" stroke="#FFF" strokeLinecap="round" strokeOpacity=".35" strokeWidth="2.2" />
        </g>
      )}

      {name === "chart" && (
        <g filter={shadow}>
          <rect fill={pink} height="17" rx="4" width="8" x="6" y="25" />
          <rect fill={avocado} height="33" rx="4" width="8" x="20" y="9" />
          <rect fill={pink} height="24" rx="4" width="8" x="34" y="18" />
          <rect fill={cream} height="5" rx="2.5" width="44" x="2" y="41" />
        </g>
      )}

      {(name === "user" || name === "profile") && (
        <g filter={shadow}>
          {name === "profile" && <rect fill={cream} height="42" rx="15" width="42" x="3" y="3" />}
          <circle cx="24" cy="24" fill={avocado} r={name === "profile" ? 16 : 20} />
          <circle cx="24" cy="18.5" fill={cream} r="7" />
          <path d="M12.5 37.5c1.3-7.4 5.2-11 11.5-11s10.2 3.6 11.5 11c-6 5-17 5-23 0Z" fill={cream} />
        </g>
      )}

      {name === "spark" && (
        <g filter={shadow}>
          <rect fill={pink} height="38" rx="14" width="38" x="5" y="5" />
          <path d="m24 10 4.1 9.9L38 24l-9.9 4.1L24 38l-4.1-9.9L10 24l9.9-4.1Z" fill={cream} />
        </g>
      )}

      {name === "automation" && (
        <g filter={deepShadow}>
          <rect fill={pink} height="42" rx="15" width="42" x="3" y="3" />
          <rect fill={cream} height="13" rx="6.5" width="29" x="9.5" y="21" />
          <circle cx="17" cy="27.5" fill={avocadoDark} r="5.2" />
          <path d="m34.5 9.5 1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6Z" fill={cream} />
        </g>
      )}

      {name === "category" && (
        <g filter={deepShadow}>
          <rect fill={avocado} height="42" rx="15" width="42" x="3" y="3" />
          {[13, 27].flatMap((x) => [13, 27].map((y) => <rect fill={cream} height="10" key={`${x}-${y}`} rx="3.6" width="10" x={x - 5} y={y - 5} />))}
          <circle cx="30.5" cy="30.5" fill={pink} r="2.4" />
        </g>
      )}

      {name === "alarm" && (
        <g filter={deepShadow} strokeLinecap="round" strokeLinejoin="round">
          <rect fill={cream} height="42" rx="15" width="42" x="3" y="3" />
          <path d="m14 15-4-4M34 15l4-4" stroke={pinkDark} strokeWidth="4.5" />
          <circle cx="24" cy="26" fill={pink} r="13" />
          <circle cx="24" cy="26" fill={cream} r="8.2" />
          <path d="M24 21v5l4 2.5" stroke={avocadoDark} strokeWidth="2.7" />
          <path d="m17 39-2 3M31 39l2 3" stroke={pinkDark} strokeWidth="3.2" />
        </g>
      )}

      {name === "connection" && (
        <g filter={deepShadow} strokeLinecap="round">
          <rect fill={avocado} height="42" rx="15" width="42" x="3" y="3" />
          <path d="m21 30-3 3a7 7 0 1 1-10-10l5-5a7 7 0 0 1 10 0" stroke={cream} strokeWidth="5.5" />
          <path d="m27 18 3-3a7 7 0 1 1 10 10l-5 5a7 7 0 0 1-10 0" stroke={cream} strokeWidth="5.5" />
          <path d="m18.5 29.5 11-11" stroke={pinkDark} strokeWidth="3" />
        </g>
      )}

      {name === "privacy" && (
        <g filter={deepShadow} strokeLinecap="round" strokeLinejoin="round">
          <rect fill="#F7B0C3" height="42" rx="15" width="42" x="3" y="3" />
          <path d="M14 17h20l-1.5 22h-17Z" fill={cream} />
          <path d="M12 15h24M19 15v-5h10v5" stroke={pinkDark} strokeWidth="3.4" />
          <path d="M21 23v9M27 23v9" stroke={pink} strokeWidth="3" />
        </g>
      )}
    </svg>
  );
}
