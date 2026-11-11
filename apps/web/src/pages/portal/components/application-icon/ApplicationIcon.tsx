import "./ApplicationIcon.css";
import type { AvailableApp } from "@smart-sport/contracts";
export function ApplicationIcon({ code }: { code: AvailableApp["code"] }) {
  const paths = {
    system: (
      <>
        <path d="M4 6h8m6 0h2M4 12h2m6 0h8M4 18h10" />
        <circle cx="15" cy="6" r="2" />
        <circle cx="9" cy="12" r="2" />
        <circle cx="17" cy="18" r="2" />
      </>
    ),
    platform: (
      <>
        <path d="M4 21V5h10v16M14 9h6v12M8 9h2m-2 4h2m-2 4h2M2 21h20" />
      </>
    ),
    org: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5" />
      </>
    ),
    ops: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="m8 11 3 3 5-6M8 17h8" />
      </>
    ),
    school: (
      <>
        <path d="m2 9 10-6 10 6-10 6zM6 12v6c4 3 8 3 12 0v-6M22 9v7" />
      </>
    ),
  };
  return (
    <span className={`portal-app-icon portal-app-icon-${code}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[code]}
      </svg>
    </span>
  );
}
