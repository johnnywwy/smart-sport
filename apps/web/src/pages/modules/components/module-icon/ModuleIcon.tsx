import type { ModuleCode } from "@smart-sport/contracts";
import "./ModuleIcon.css";
export function ModuleIcon({ code }: { code: ModuleCode }) {
  return (
    <span className={`module-icon module-icon-${code}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {code === "base" ? (
          <path d="m2 9 10-6 10 6-10 6zM6 12v6c4 3 8 3 12 0v-6M22 9v7" />
        ) : (
          <>
            <rect x="4" y="4" width="16" height="16" rx="4" />
            <path d="M8 9h8M8 12h8M8 15h5" />
          </>
        )}
      </svg>
    </span>
  );
}
