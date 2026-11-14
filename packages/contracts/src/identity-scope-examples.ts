import {
  identityScopesSchema,
  setIdentityScopesSchema,
} from "./identity-scopes.js";

export const setIdentityScopesExample = setIdentityScopesSchema.parse({
  version: 0,
  scopes: [{ type: "region", value: "330000" }],
});
export const identityScopesExample = identityScopesSchema.parse({
  identityId: "019c1472-9e57-7000-8000-000000000001",
  version: 1,
  scopes: setIdentityScopesExample.scopes,
});
