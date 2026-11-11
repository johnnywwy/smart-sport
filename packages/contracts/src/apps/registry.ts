import { opsApp } from "./ops.js";
import { orgApp } from "./org.js";
import { platformApp } from "./platform.js";
import { schoolApp } from "./school.js";
import { systemApp } from "./system.js";

export const appRegistry = {
  system: systemApp,
  platform: platformApp,
  org: orgApp,
  ops: opsApp,
  school: schoolApp,
} as const;

export const appDefinitions = Object.values(appRegistry);
export type AppCode = keyof typeof appRegistry;
export type FeatureCode<A extends AppCode> =
  keyof (typeof appRegistry)[A]["features"] & string;

type DeclaredPermissionForApp<A extends AppCode> = {
  [F in FeatureCode<A>]: (typeof appRegistry)[A]["features"][F] extends {
    readonly actions: readonly (infer Action extends string)[];
  }
    ? `${A}:${F}:${Action}`
    : never;
}[FeatureCode<A>];

export type DeclaredPermissionCode = {
  [A in AppCode]: DeclaredPermissionForApp<A>;
}[AppCode];
