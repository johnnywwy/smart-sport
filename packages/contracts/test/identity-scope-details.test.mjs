import assert from "node:assert/strict";
import { test } from "node:test";
import { identityScopeDetailsSchema } from "../dist/index.js";

const details = {
  identityId: "019c1472-9e57-7000-8000-000000000001",
  version: 0,
  scopes: [],
  allowedTypes: ["school", "region"],
  allowedActions: [],
};
test("本人范围读取包含版本、允许类型与操作能力，已失效项可安全回显", () => {
  assert.equal(identityScopeDetailsSchema.safeParse(details).success, true);
  assert.equal(
    identityScopeDetailsSchema.safeParse({
      ...details,
      scopes: [
        {
          type: "region",
          value: "330000",
          name: "已失效的负责范围",
          available: false,
          parentValue: null,
        },
      ],
    }).success,
    true,
  );
  assert.equal(
    identityScopeDetailsSchema.safeParse({
      ...details,
      allowedActions: ["delete"],
    }).success,
    false,
  );
  assert.equal(
    identityScopeDetailsSchema.safeParse({ ...details, version: undefined })
      .success,
    false,
  );
});
