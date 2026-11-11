import type { IdentityList } from "@smart-sport/contracts";

type IdentityGroupType = IdentityList["groups"][number]["type"];

type IdentityIconProps = { type: IdentityGroupType };

export function IdentityIcon({ type }: IdentityIconProps) {
  const paths = {
    company: (
      <>
        <path d="M5 20V8l7-4 7 4v12" />
        <path d="M9 20v-4h6v4M9 10h.01M15 10h.01M9 13h.01M15 13h.01" />
      </>
    ),
    bureau: (
      <>
        <path d="m3 9 9-5 9 5M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M4 20h16" />
      </>
    ),
    agent: (
      <>
        <path d="M4 7h16v12H4zM8 7V5h8v2M8 12h8M12 10v4" />
      </>
    ),
    school: (
      <>
        <path d="m3 10 9-6 9 6-9 6z" />
        <path d="M7 13v4c3 2 7 2 10 0v-4M21 10v6" />
      </>
    ),
  };
  return (
    <span className={`select-org-icon select-org-icon-${type}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[type]}
      </svg>
    </span>
  );
}
