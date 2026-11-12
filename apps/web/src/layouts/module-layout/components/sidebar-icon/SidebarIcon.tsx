import type { ReactNode } from "react";

const icons: Record<string, ReactNode> = {
  organizations: (
    <path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4" />
  ),
  onboarding: <path d="M3 21h18M5 21V8l7-4 7 4v13M10 21v-5h4v5" />,
  subscriptions: (
    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
  ),
  menus: <path d="M4 6h16M4 12h16M4 18h10" />,
  academic: (
    <path d="M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4" />
  ),
  dictionaries: (
    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6" />
  ),
  parameters: (
    <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4" />
  ),
  "number-rules": <path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" />,
  regions: (
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
  ),
  "preset-roles": <path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6z" />,
  base: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6 6 0 0 1 3.5 5.5" />
    </>
  ),
  "platform-admin": (
    <>
      <path d="m2 9 10-5 10 5-10 5zM6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" />
    </>
  ),
  workbench: (
    <>
      <path d="M3 11 12 4l9 7v9H3z" />
      <path d="M10 20v-6h4v6" />
    </>
  ),
  departments: (
    <>
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <rect x="3" y="16" width="6" height="5" rx="1" />
      <rect x="15" y="16" width="6" height="5" rx="1" />
      <path d="M12 8v4M6 16v-4h12v4" />
    </>
  ),
  members: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2.5" />
      <path d="M5.5 16a3.5 3.5 0 0 1 7 0M15 10h4M15 14h3" />
    </>
  ),
  roles: (
    <>
      <path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6z" />
    </>
  ),
  schools: (
    <>
      <path d="M3 21h18M5 21V8l7-4 7 4v13M10 21v-5h4v5" />
    </>
  ),
  colleges: (
    <>
      <path d="M3 21h18M9 21V3h6v18M3 21V9h6M15 9h6v12M11 7h2M11 11h2M11 15h2M5 13h1M5 17h1M18 13h1M18 17h1" />
    </>
  ),
  classes: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  students: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  teachers: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="m16 11 2 2 4-4" />
    </>
  ),
  rollover: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16V8M8.5 11.5 12 8l3.5 3.5" />
    </>
  ),
  transfers: (
    <>
      <path d="M4 8h14l-3-3M20 16H6l3 3" />
    </>
  ),
  "agent-grants": (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8M16 7l3 3" />
    </>
  ),
  "platform-admin:audits": (
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />
  ),
  audits: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
};
export function SidebarIcon({ name }: { name: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icons[name]}
    </svg>
  );
}
