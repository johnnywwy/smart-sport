import type {
  DataScopeOption,
  SchoolSelection,
  VisibleScope,
} from "@smart-sport/contracts";

type SchoolIdentity = {
  type: "school" | "teacher";
  schoolId: string;
  teaching?: SchoolSelection;
};
type IdentityBoundary =
  | {
      type: "company";
      boundary:
        | { kind: "all-schools" }
        | { kind: "schools"; schoolIds: string[] };
    }
  | {
      type: "bureau" | "agent";
      boundary: { kind: "schools"; schoolIds: string[] };
    }
  | SchoolIdentity
  | { type: "student"; studentId: string }
  | { type: "parent"; studentIds: string[] };

export type ScopeInput = {
  identity: IdentityBoundary;
  // Obtained from the requested permission's merged scope, not the entire identity.
  option: DataScopeOption | undefined;
  hasDepartment: boolean;
  department: readonly VisibleScope[];
  departmentAndBelow: readonly VisibleScope[];
  extra: readonly VisibleScope[];
};

const empty = (): VisibleScope => ({ kind: "schools", schoolIds: [] });
const unique = <T extends string | number>(values: readonly T[]) =>
  [...new Set(values)].sort();

function unionSchool(
  schoolId: string,
  scopes: readonly VisibleScope[],
): SchoolSelection {
  const parts = scopes.filter(
    (scope): scope is SchoolSelection =>
      scope.kind === "school" && scope.schoolId === schoolId,
  );
  if (
    parts.some(
      (part) =>
        part.grades === undefined &&
        part.classIds === undefined &&
        part.collegeIds === undefined,
    )
  ) {
    return { kind: "school", schoolId };
  }
  return {
    kind: "school",
    schoolId,
    grades: unique(parts.flatMap((part) => part.grades ?? [])),
    classIds: unique(parts.flatMap((part) => part.classIds ?? [])),
    collegeIds: unique(parts.flatMap((part) => part.collegeIds ?? [])),
  };
}

/** Resolve already-expanded departments and current-term teaching within an identity boundary. */
export function calculateVisibleScope(input: ScopeInput): VisibleScope {
  const { identity, option } = input;
  if (!option) return empty();
  if (identity.type === "student")
    return { kind: "self", studentId: identity.studentId };
  if (identity.type === "parent")
    return { kind: "children", studentIds: unique(identity.studentIds) };

  if (
    (option === "dept" || option === "dept_and_below") &&
    !input.hasDepartment
  )
    return empty();

  const selected = [
    ...(option === "dept"
      ? input.department
      : option === "dept_and_below"
        ? input.departmentAndBelow
        : []),
    ...input.extra,
  ];
  if ("schoolId" in identity) {
    if (option === "all")
      return { kind: "school", schoolId: identity.schoolId };
    if (
      identity.type === "teacher" &&
      option === "personal" &&
      identity.teaching
    )
      selected.push(identity.teaching);
    return unionSchool(identity.schoolId, selected);
  }

  const boundary = identity.boundary;
  if (option === "all")
    return boundary.kind === "all-schools"
      ? { kind: "all-schools" }
      : { kind: "schools", schoolIds: unique(boundary.schoolIds) };
  const requested = unique(
    selected.flatMap((scope) =>
      scope.kind === "schools" ? scope.schoolIds : [],
    ),
  );
  const allowed =
    boundary.kind === "schools" ? new Set(boundary.schoolIds) : undefined;
  return {
    kind: "schools",
    schoolIds: requested.filter(
      (id) => allowed === undefined || allowed.has(id),
    ),
  };
}
