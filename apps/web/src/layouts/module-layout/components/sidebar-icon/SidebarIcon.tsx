import type { ReactNode } from "react";

const icons: Record<string, ReactNode> = {
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
      <path d="M9 3h6v5H9zM3 16h6v5H3zM15 16h6v5h-6zM12 8v4M6 16v-4h12v4" />
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
      {icons[name] ?? icons.roles}
    </svg>
  );
}
