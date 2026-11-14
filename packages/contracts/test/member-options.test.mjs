import assert from "node:assert/strict";
import test from "node:test";
import { memberOptionsSchema } from "../dist/index.js";

test("空组织也能声明成员新增能力，选项不接受账号凭证", () => {
  assert.deepEqual(
    memberOptionsSchema.parse({
      allowedActions: ["create"],
      departments: [],
      roles: [],
    }),
    { allowedActions: ["create"], departments: [], roles: [] },
  );
  assert.equal(
    memberOptionsSchema.safeParse({
      allowedActions: [],
      departments: [],
      roles: [],
      password: "invalid",
    }).success,
    false,
  );
  assert.equal(
    memberOptionsSchema.safeParse({
      allowedActions: ["update"],
      departments: [],
      roles: [],
    }).success,
    false,
  );
});
