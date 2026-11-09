# 03 · 组织、学校档案、区划与部门

## 1. 目标

维护四类组织、行政区划、学校档案，以及每个组织自建的部门树和部门负责范围。

## 2. 数据

**regions**：`code`（国标区划码，主键）、`name`、`level`（1 省 · 2 市 · 3 区县）、`parent_code`、`path`（如 `330000.330100.330106`）、`status`。

**orgs**

| 字段        | 说明                                                   |
| ----------- | ------------------------------------------------------ |
| type        | `company` · `bureau` · `agent` · `school`              |
| name        |                                                        |
| code        | 系统生成，不显示                                       |
| region_code | 教育局为管辖区划；学校为所在区划；代理商为注册地，可空 |
| status      | 1 启用 · 0 停用                                        |

**school_profiles**

| 字段                                   | 说明                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| school_id                              | 主键                                                                          |
| school_code                            | 教育部学校标识码（10 位），唯一                                               |
| stages                                 | smallint[]，1 小学 · 2 初中 · 3 高中 · 4 大学                                 |
| stage_years                            | jsonb，如 `{"1":6,"2":3,"3":3,"4":4}`；小学 5/6，初中 3/4，高中 3，大学 3/4/5 |
| nature                                 | 公办 · 民办                                                                   |
| address / contact_name / contact_phone |                                                                               |

**departments**

| 字段      | 说明                                                                |
| --------- | ------------------------------------------------------------------- |
| org_id    |                                                                     |
| parent_id | 树形，根部门 parent 为空                                            |
| path      | 祖先 id 路径，用于“本部门及以下”                                    |
| name      | 同一上级下唯一                                                      |
| code      | 系统生成                                                            |
| sort      |                                                                     |
| is_preset | 公司预置部门（研发部、销售部、生产部、技术服务部）为 true，不可删除 |

**department_scopes**：`(department_id, scope_type, scope_value)`。

| 组织类型 | 允许的 scope_type   | scope_value                |
| -------- | ------------------- | -------------------------- |
| company  | `school` · `region` | 学校 id · 区划码           |
| bureau   | `region` · `school` | 辖区内的区划码 · 学校 id   |
| agent    | `school`            | 已授权学校 id              |
| school   | `grade` · `college` | 年级编码（如 13）· 学院 id |

## 3. 接口

| 方法        | 路径                                                         | 权限                             | 说明                                          |
| ----------- | ------------------------------------------------------------ | -------------------------------- | --------------------------------------------- |
| GET         | `/regions?parent=`                                           | 登录                             | 区划树按级加载                                |
| GET         | `/orgs?type&keyword&regionCode&page`                         | `platform:org:view`              | 组织列表（公司用）                            |
| POST        | `/orgs`                                                      | `platform:org:create`            | 新建教育局、代理商；学校走开通向导（spec 14） |
| PATCH       | `/orgs/:id`                                                  | `platform:org:update`            |                                               |
| POST        | `/orgs/:id/toggle`                                           | `platform:org:update`            | 启用 / 停用                                   |
| GET / PATCH | `/schools/:schoolId/profile`                                 | `school:profile:view` / `update` | 学校档案                                      |
| GET         | `/departments/tree`                                          | `org:department:view`            | 当前组织的部门树，含人数、负责范围摘要        |
| POST        | `/departments`                                               | `org:department:create`          | `{ parentId?, name }`                         |
| PATCH       | `/departments/:id`                                           | `org:department:update`          | 改名、调整上级（拖动）、排序                  |
| DELETE      | `/departments/:id`                                           | `org:department:delete`          | 有成员或子部门时拒绝                          |
| GET         | `/departments/:id/scopes`                                    | `org:department:view`            |                                               |
| PUT         | `/departments/:id/scopes`                                    | `org:department:update`          | 整体替换；返回合计可见数量                    |
| GET         | `/scope-options?type=school\|region\|grade\|college&keyword` | `org:department:update`          | 范围选择器可选项（只返回外边界内的）          |

## 4. 规则

1. 部门只属于本组织；接口按当前身份的 `org_id` 过滤，不接受外部传入的组织 id（公司超管除外，可指定 `orgId`）。
2. 调整上级时禁止形成环；更新自身及所有子孙的 `path`。
3. 部门负责范围只能选外边界内的值；代理商部门的学校在授权撤销后自动失效（计算时过滤，不删除记录，授权恢复后自动恢复）。
4. 区划按 `path` 前缀匹配：选择“浙江省”即包含其下所有市、区县及其学校，新开通的学校自动纳入。
5. 教育局的组织区划决定其辖区；教育局的部门只能选辖区内的区划或学校。
6. 部门、负责范围变化后，删除受影响身份的上下文缓存与可见范围缓存。

## 5. 错误码

| 码    | 含义                             |
| ----- | -------------------------------- |
| 12001 | 部门名称在同级已存在             |
| 12002 | 部门下还有成员或子部门，不能删除 |
| 12003 | 不能把部门移到自己的下级         |
| 12004 | 负责范围超出本组织可见范围       |
| 12005 | 学校标识码已存在                 |
| 12006 | 学段与年限配置不合法             |

## 6. 验收标准

- 代理商管理员只能看到本代理商的部门；部门负责范围的学校候选只有授权学校。
- 把“浙江销售组”的范围设为浙江省后，浙江新开通的学校无需操作即可被该组成员看到。
- 拖动部门到另一个上级后，“本部门及以下”的结果随之变化。
