import {
  type DictItem,
  dictDefinitions,
  dictItemListSchema,
  dictItemSchema,
  dictOptionsSchema,
  dictTypesSchema,
  successResponseSchema,
} from "@smart-sport/contracts";
import { sql } from "drizzle-orm";
import { v7 } from "uuid";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { migratePublic } from "../../src/database/migrate.js";
import {
  DictsRepository,
  DictsService,
} from "../../src/modules/platform/dicts/index.js";
import {
  roleInput,
  roleManagementFixture,
} from "../helpers/role-management.js";

let f: Awaited<ReturnType<typeof roleManagementFixture>>;
let repository: DictsRepository, service: DictsService;
beforeAll(async () => {
  f = await roleManagementFixture();
  repository = f.app.get(DictsRepository);
  service = f.app.get(DictsService);
  await f.pool.query(
    "CREATE TABLE public.dict_test_documents(id uuid PRIMARY KEY, value text NOT NULL)",
  );
}, 120000);
afterAll(async () => {
  await f?.stop();
}, 30000);
const input = (row: DictItem) => ({
  label: row.label,
  description: row.description,
  sort: row.sort,
  enabled: row.enabled,
  version: row.version,
});
async function create(label = `测试-${v7()}`, enabled = true) {
  const r = await f.request("/dict-types/document_type/items", "POST", {
    label,
    sort: 100,
    enabled,
  });
  expect(r.status).toBe(201);
  return successResponseSchema(dictItemSchema).parse(await r.json()).data;
}
async function list(type = "document_type", query = "", token = f.admin.token) {
  const r = await f.request(
    `/dict-types/${type}/items${query}`,
    "GET",
    undefined,
    token,
  );
  expect(r.status).toBe(200);
  return successResponseSchema(dictItemListSchema).parse(await r.json()).data;
}
async function fresh(id: string) {
  const row = (await list("document_type", "?pageSize=100")).items.find(
    (r) => r.id === id,
  );
  if (!row) throw new Error("缺少测试选项");
  return row;
}
async function snapshot() {
  return {
    items: (await f.pool.query("SELECT * FROM public.dict_items ORDER BY id"))
      .rows,
    audits: (
      await f.pool.query(
        "SELECT * FROM public.audit_logs WHERE action LIKE 'dict.%' ORDER BY id",
      )
    ).rows,
  };
}
async function actor(actions: string[]) {
  const person = await f.seed("company", null, f.admin.orgId),
    roleId = v7();
  await f.pool.query(
    `INSERT INTO public.roles(id,kind,identity_type,org_id,code,name,data_scope,base_role_id)
    SELECT $1,'custom','company',$2,$1::uuid::text,'字典测试角色','all',id FROM public.roles WHERE code='company-super-admin'`,
    [roleId, person.orgId],
  );
  await f.pool.query(
    `INSERT INTO public.role_grants(role_id,app_code,feature_code,level,actions)
    SELECT $1,app_code,code,CASE WHEN app_code='system' AND code='dict' THEN 'custom' ELSE 'none' END,
    CASE WHEN app_code='system' AND code='dict' THEN $2::text[] ELSE NULL END FROM public.features`,
    [roleId, actions],
  );
  await f.pool.query("INSERT INTO public.identity_roles VALUES($1,$2)", [
    person.identityId,
    roleId,
  ]);
  return { ...person, roleId };
}
it("迁移与内置同步幂等，完整预置七类字典、56民族及18年级", async () => {
  expect(await migratePublic(f.pool)).toEqual([]);
  const types = await f.request("/dict-types");
  expect(
    successResponseSchema(dictTypesSchema).parse(await types.json()).data,
  ).toHaveLength(7);
  expect((await list("ethnicity", "?pageSize=100")).total).toBe(56);
  expect((await list("grade")).total).toBe(18);
  for (const d of dictDefinitions) {
    const rows = (await list(d.code, "?pageSize=100")).items;
    expect(rows.filter((r) => r.isSystem)).toHaveLength(d.items.length);
    expect(
      rows
        .filter((r) => r.isSystem)
        .every((r) => r.allowedActions.length === 0),
    ).toBe(true);
  }
  const row = await create();
  await f.request(`/dict-items/${row.id}`, "PATCH", {
    ...input(row),
    enabled: false,
  });
  const before = await snapshot();
  await service.onModuleInit();
  await service.onModuleInit();
  expect(await snapshot()).toEqual(before);
});
it("所有内置选项拒绝改名、排序、停用和删除，固定类型拒绝新增", async () => {
  const row = (await list("stage")).items[0];
  if (!row) throw new Error("缺少内置选项");
  const before = await snapshot();
  for (const patch of [
    { label: "测试小学" },
    { sort: 80 },
    { enabled: false },
  ]) {
    const r = await f.request(`/dict-items/${row.id}`, "PATCH", {
      ...input(row),
      ...patch,
    });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: 30010 });
  }
  const r = await f.request(`/dict-items/${row.id}`, "DELETE", {
    version: row.version,
  });
  expect(r.status).toBe(403);
  expect(await r.json()).toMatchObject({ code: 30010 });
  for (const type of dictDefinitions.filter((d) => !d.allowCustom)) {
    const r = await f.request(`/dict-types/${type.code}/items`, "POST", {
      label: "任意值",
    });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: 30011 });
  }
  expect(await snapshot()).toEqual(before);
});
it("有效身份全局读启用下拉项，停用排除，分页查询和特殊字符搜索正常", async () => {
  const enabled = await create(`检索%_${v7()}`),
    disabled = await create(undefined, false);
  const school = await f.seed("school", "school-admin");
  const r = await f.request(
    "/dicts/document_type",
    "GET",
    undefined,
    school.token,
  );
  expect(r.status).toBe(200);
  const options = successResponseSchema(dictOptionsSchema).parse(
    await r.json(),
  ).data;
  expect(options.some((i) => i.value === enabled.value)).toBe(true);
  expect(options.some((i) => i.value === disabled.value)).toBe(false);
  expect(
    (
      await list(
        "document_type",
        `?keyword=${encodeURIComponent(enabled.label)}`,
      )
    ).items.map((i) => i.id),
  ).toEqual([enabled.id]);
  const page = await list(
    "document_type",
    "?page=2&pageSize=1&sort=label:desc&enabled=false",
  );
  expect(page.items).toHaveLength(1);
  expect(page.items[0]?.enabled).toBe(false);
  expect(page.page).toBe(2);
  expect((await fresh(disabled.id)).used).toBe(false);
});
it("新增幂等不重复写入；值由服务端生成，修改、软删和同名重建使用新值", async () => {
  const label = `幂等-${v7()}`,
    key = v7(),
    payload = { label, sort: 42, description: "说明", enabled: true };
  const a = await f.request(
    "/dict-types/document_type/items",
    "POST",
    payload,
    undefined,
    key,
  );
  expect(a.status).toBe(201);
  const row = successResponseSchema(dictItemSchema).parse(await a.json()).data;
  expect(row.value).toMatch(/^custom_[0-9a-f-]+$/);
  expect(row.allowedActions).toEqual(["update", "delete"]);
  const b = await f.request(
    "/dict-types/document_type/items",
    "POST",
    payload,
    undefined,
    key,
  );
  expect(b.status).toBe(409);
  expect(await b.json()).toMatchObject({ code: 90003, data: { id: row.id } });
  expect(
    (await list("document_type", `?keyword=${encodeURIComponent(label)}`))
      .total,
  ).toBe(1);
  const update = await f.request(`/dict-items/${row.id}`, "PATCH", {
    ...input(row),
    label: `新${label}`,
    sort: 43,
    description: "新说明",
  });
  expect(update.status).toBe(200);
  const saved = successResponseSchema(dictItemSchema).parse(
    await update.json(),
  ).data;
  expect(saved).toMatchObject({
    value: row.value,
    version: 1,
    sort: 43,
    description: "新说明",
  });
  expect(
    (
      await f.request(`/dict-items/${row.id}`, "DELETE", {
        version: saved.version,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await f.pool.query(
        "SELECT deleted_at,version FROM public.dict_items WHERE id=$1",
        [row.id],
      )
    ).rows[0],
  ).toMatchObject({ deleted_at: expect.any(Date), version: 2 });
  const recreated = await create(saved.label);
  expect(recreated.value).not.toBe(row.value);
  expect(
    (
      await f.pool.query(
        "SELECT action FROM public.audit_logs WHERE target_id=$1 ORDER BY created_at",
        [row.id],
      )
    ).rows.map((r) => r.action),
  ).toEqual(["dict.item.create", "dict.item.update", "dict.item.delete"]);
});
it("重复名称与同版本并发修改有明确冲突，失败不写状态和审计", async () => {
  const row = await create(),
    before = await snapshot();
  const duplicate = await f.request("/dict-types/document_type/items", "POST", {
    label: row.label,
  });
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({ code: 30013 });
  expect(await snapshot()).toEqual(before);
  const other = await create();
  const conflict = await f.request(`/dict-items/${other.id}`, "PATCH", {
    ...input(other),
    label: row.label,
  });
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({ code: 30013 });
  const results = await Promise.all(
    [1, 2].map((sort) =>
      f.request(`/dict-items/${row.id}`, "PATCH", { ...input(row), sort }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(await results.find((r) => r.status === 409)?.json()).toMatchObject({
    code: 90002,
  });
  expect(
    (
      await f.request(`/dict-items/${row.id}`, "DELETE", {
        version: row.version,
      })
    ).status,
  ).toBe(409);
});
it("业务使用标记随事务提交，使用后禁止删除，停用后历史仍能解析", async () => {
  const row = await create();
  const expected = { value: row.value, label: row.label };
  await repository.transaction(async (tx) => {
    expect(await service.use("document_type", row.value, tx)).toEqual(expected);
    await tx.execute(
      sql`INSERT INTO public.dict_test_documents(id,value) VALUES(${v7()},${row.value})`,
    );
  });
  let saved = await fresh(row.id);
  expect(saved.used).toBe(true);
  expect(saved.allowedActions).toEqual(["update"]);
  const r = await f.request(`/dict-items/${row.id}`, "DELETE", {
    version: saved.version,
  });
  expect(r.status).toBe(409);
  expect(await r.json()).toMatchObject({ code: 30012 });
  expect(
    (
      await f.request(`/dict-items/${row.id}`, "PATCH", {
        ...input(saved),
        enabled: false,
      })
    ).status,
  ).toBe(200);
  await expect(
    repository.transaction((tx) => service.use("document_type", row.value, tx)),
  ).rejects.toMatchObject({ code: 30014 });
  expect(
    await repository.transaction((tx) =>
      service.resolve("document_type", row.value, tx),
    ),
  ).toEqual(expected);
  await f.pool.query("DELETE FROM public.dict_test_documents WHERE value=$1", [
    row.value,
  ]);
  saved = await fresh(row.id);
  expect(
    (
      await f.request(`/dict-items/${row.id}`, "DELETE", {
        version: saved.version,
      })
    ).status,
  ).toBe(409);
});
it("业务失败及审计失败整体回滚，不残留使用标记或配置", async () => {
  const row = await create(),
    before = await snapshot();
  await expect(
    repository.transaction(async (tx) => {
      await service.use("document_type", row.value, tx);
      await tx.execute(
        sql`INSERT INTO public.dict_test_documents(id,value) VALUES(${v7()},${row.value})`,
      );
      throw new Error("业务失败");
    }),
  ).rejects.toThrow("业务失败");
  expect(await snapshot()).toEqual(before);
  expect(
    (
      await f.pool.query(
        "SELECT * FROM public.dict_test_documents WHERE value=$1",
        [row.value],
      )
    ).rowCount,
  ).toBe(0);
  const spy = vi
    .spyOn(repository, "audit")
    .mockRejectedValue(new Error("审计失败"));
  try {
    expect(
      (
        await f.request(`/dict-items/${row.id}`, "PATCH", {
          ...input(row),
          enabled: false,
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await f.request(`/dict-items/${row.id}`, "DELETE", {
          version: row.version,
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await f.request("/dict-types/document_type/items", "POST", {
          label: `回滚-${v7()}`,
        })
      ).status,
    ).toBe(500);
  } finally {
    spy.mockRestore();
  }
  expect(await snapshot()).toEqual(before);
});
it("并发使用与删除通过相同行锁串行，使用提交后删除被拒绝", async () => {
  const row = await create();
  let reached!: () => void, release!: () => void;
  const ready = new Promise<void>((r) => {
      reached = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  const using = repository.transaction(async (tx) => {
    await service.use("document_type", row.value, tx);
    reached();
    await gate;
  });
  try {
    await ready;
    const deleting = f.request(`/dict-items/${row.id}`, "DELETE", {
      version: row.version,
    });
    release();
    await using;
    expect((await deleting).status).toBe(409);
    expect((await fresh(row.id)).used).toBe(true);
  } finally {
    release();
    await using;
  }
  const unused = await create();
  expect(
    (
      await f.request(`/dict-items/${unused.id}`, "DELETE", {
        version: unused.version,
      })
    ).status,
  ).toBe(200);
  await expect(
    repository.transaction((tx) =>
      service.use("document_type", unused.value, tx),
    ),
  ).rejects.toMatchObject({ code: 90004 });
});
it("只读、无权限和学校身份均无法管理写入，行能力与类型能力准确", async () => {
  const readonly = await actor(["view"]),
    forbidden = await actor([]),
    school = await f.seed("school", "school-admin"),
    row = await create();
  expect(
    (await list("document_type", "", readonly.token)).items.every(
      (i) => i.allowedActions.length === 0,
    ),
  ).toBe(true);
  const types = await f.request(
    "/dict-types",
    "GET",
    undefined,
    readonly.token,
  );
  expect(
    successResponseSchema(dictTypesSchema)
      .parse(await types.json())
      .data.every((t) => t.allowedActions.length === 0),
  ).toBe(true);
  const before = await snapshot();
  for (const token of [readonly.token, forbidden.token, school.token]) {
    expect(
      (
        await f.request(
          "/dict-types/document_type/items",
          "POST",
          { label: "拒绝新增" },
          token,
        )
      ).status,
    ).toBe(403);
    expect(
      (await f.request(`/dict-items/${row.id}`, "PATCH", input(row), token))
        .status,
    ).toBe(403);
    expect(
      (
        await f.request(
          `/dict-items/${row.id}`,
          "DELETE",
          { version: row.version },
          token,
        )
      ).status,
    ).toBe(403);
  }
  for (const token of [forbidden.token, school.token]) {
    expect(
      (await f.request("/dict-types", "GET", undefined, token)).status,
    ).toBe(403);
    expect(
      (
        await f.request(
          "/dict-types/document_type/items",
          "GET",
          undefined,
          token,
        )
      ).status,
    ).toBe(403);
  }
  expect(await snapshot()).toEqual(before);
});
it("真实角色授权撤权后同一令牌增改删依次403、成功、403", async () => {
  const person = await actor(["view"]),
    row = await create();
  for (const level of ["view", "manage", "view"] as const) {
    const grants = roleInput(await f.detail(person.roleId));
    grants.grants = grants.grants.map((g) =>
      g.app === "system" && g.feature === "dict"
        ? { ...g, grant: { level } }
        : g,
    );
    expect(
      (await f.request(`/roles/${person.roleId}/grants`, "PUT", grants)).status,
    ).toBe(200);
    const current = await fresh(row.id),
      before = await snapshot(),
      allowed = level === "manage";
    expect(
      (
        await f.request(
          `/dict-items/${row.id}`,
          "PATCH",
          { ...input(current), sort: 7 },
          person.token,
        )
      ).status,
    ).toBe(allowed ? 200 : 403);
    const creation = await f.request(
      "/dict-types/document_type/items",
      "POST",
      { label: `授权-${v7()}` },
      person.token,
    );
    expect(creation.status).toBe(allowed ? 201 : 403);
    if (allowed) {
      const item = successResponseSchema(dictItemSchema).parse(
        await creation.json(),
      ).data;
      expect(
        (
          await f.request(
            `/dict-items/${item.id}`,
            "DELETE",
            { version: item.version },
            person.token,
          )
        ).status,
      ).toBe(200);
    } else {
      expect(
        (
          await f.request(
            `/dict-items/${row.id}`,
            "DELETE",
            { version: current.version },
            person.token,
          )
        ).status,
      ).toBe(403);
      expect(await snapshot()).toEqual(before);
    }
  }
});
it("排队时撤权在事务内重读后拒绝，数据库状态不变", async () => {
  const person = await actor(["view", "update"]),
    row = await create(),
    before = await snapshot();
  let reached!: () => void, release!: () => void;
  const ready = new Promise<void>((r) => {
      reached = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  const original = repository.lockPolicy.bind(repository);
  const spy = vi
    .spyOn(repository, "lockPolicy")
    .mockImplementation(async (tx) => {
      reached();
      await gate;
      return original(tx);
    });
  try {
    const pending = f.request(
      `/dict-items/${row.id}`,
      "PATCH",
      { ...input(row), enabled: false },
      person.token,
    );
    await ready;
    await f.pool.query(
      "UPDATE public.role_grants SET actions=ARRAY['view'] WHERE role_id=$1 AND app_code='system' AND feature_code='dict'",
      [person.roleId],
    );
    release();
    expect((await pending).status).toBe(403);
  } finally {
    release();
    spy.mockRestore();
  }
  expect(await snapshot()).toEqual(before);
});
it("严格参数、账号级令牌与无令牌拒绝；未知、软删资源404", async () => {
  const row = await create();
  expect((await fetch(`${f.base}/api/v1/dicts/stage`)).status).toBe(401);
  expect(
    (await f.request("/dicts/stage", "GET", undefined, f.admin.account)).status,
  ).toBe(401);
  for (const path of [
    "/dicts/invalid",
    "/dicts/stage?schoolId=x",
    "/dict-types/stage/items?sort=value:asc",
    "/dict-types/stage/items?enabled=0",
    "/dict-types/stage/items?pageSize=101",
  ])
    expect((await f.request(path)).status).toBe(400);
  for (const payload of [
    { ...input(row), value: "evil" },
    { ...input(row), isSystem: true },
    { ...input(row), used: false },
    { ...input(row), version: undefined },
  ])
    expect(
      (await f.request(`/dict-items/${row.id}`, "PATCH", payload)).status,
    ).toBe(400);
  expect(
    (await f.request(`/dict-items/${v7()}`, "PATCH", input(row))).status,
  ).toBe(404);
  expect(
    (await f.request(`/dict-items/${v7()}`, "DELETE", { version: 0 })).status,
  ).toBe(404);
  expect(
    (await f.request(`/dict-items/${row.id}`, "DELETE", { version: 0 })).status,
  ).toBe(200);
  expect(
    (await f.request(`/dict-items/${row.id}`, "PATCH", input(row))).status,
  ).toBe(404);
});
it("数据库保护技术值、来源、使用标记和内置启用，软删唯一名称可复用", async () => {
  const row = await create();
  for (const patch of [
    "value='evil'",
    "type_code='stage'",
    "is_system=true",
    "sort=-1",
  ])
    await expect(
      f.pool.query(`UPDATE public.dict_items SET ${patch} WHERE id=$1`, [
        row.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  await repository.transaction((tx) =>
    service.use("document_type", row.value, tx),
  );
  for (const patch of [
    "used_at=NULL",
    "used_at=now()+interval '1 day'",
    "deleted_at=now()",
  ])
    await expect(
      f.pool.query(`UPDATE public.dict_items SET ${patch} WHERE id=$1`, [
        row.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  await expect(
    f.pool.query("DELETE FROM public.dict_items WHERE id=$1", [row.id]),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    f.pool.query(
      "UPDATE public.dict_items SET enabled=false WHERE type_code='stage' AND value='1'",
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    f.pool.query(
      "DELETE FROM public.dict_items WHERE type_code='stage' AND value='1'",
    ),
  ).rejects.toMatchObject({ code: "23514" });
});
