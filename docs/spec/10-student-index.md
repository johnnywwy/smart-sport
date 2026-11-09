# 10 · 学生索引、升学与转学

## 1. 目标

用证件号在全平台查重；支持升学自动关联、转学双方确认；学生账号跨学校延续。

## 2. 数据（public）

**student_index**

| 字段                   | 说明                                                        |
| ---------------------- | ----------------------------------------------------------- |
| id_hash                | HMAC-SHA256（证件类型 + 证件号，平台密钥），不存明文        |
| school_id / student_id | 当前（或最后）所在学校及学校库中的学生 id                   |
| user_id                | 学生账号，M2 开通学生登录后填写；M1 为空                    |
| status                 | `studying` 在读 · `transferred_out` 转出 · `graduated` 毕业 |
| history                | jsonb，历次学校与时间                                       |

约束：同一 `id_hash` 同时最多一条 `studying`。

**transfer_requests**：no（系统编号 `ZX-…`）、id_hash、from_school_id、to_school_id、student_name（目标学校填写）、status（pending · approved · rejected · cancelled）、todo_id。

## 3. 流程

```
新学校录入学生（证件号）
 ├─ 索引无记录          → 新建学生与索引
 ├─ 原学校已毕业        → 升学：直接关联，沿用账号，索引改为新学校在读
 └─ 原学校在读          → 生成转学申请与待办（原学校处理）
                            ├─ 同意 → 原校学生改为转出；新校建档；索引改为新学校在读
                            └─ 拒绝 → 新学校不能建档，提示联系原学校
```

## 4. 接口

| 方法 | 路径                                             | 权限                      | 说明                                                                                                            |
| ---- | ------------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| POST | `/schools/:schoolId/students/check`              | `school:student:create`   | `{ idType, idNo }` → `new` · `graduated_elsewhere` · `studying_elsewhere`（不返回原学校学生明细，只返回学校名） |
| POST | `/schools/:schoolId/transfers`                   | `school:transfer:create`  | 发起转学                                                                                                        |
| GET  | `/schools/:schoolId/transfers?direction=in\|out` | `school:transfer:view`    |                                                                                                                 |
| POST | `/schools/:schoolId/transfers/:id/approve`       | `school:transfer:approve` | 原学校同意                                                                                                      |
| POST | `/schools/:schoolId/transfers/:id/reject`        | `school:transfer:approve` |                                                                                                                 |
| POST | `/schools/:schoolId/transfers/:id/cancel`        | `school:transfer:update`  | 发起方撤回                                                                                                      |

## 5. 规则

1. 证件号只在学校库加密保存；索引只有哈希，平台与教育局不能从索引反查证件号。
2. 查重接口限流（同一身份每分钟 30 次），防止批量探测。
3. 历史数据留在原学校库；新学校看不到原学校的明细。成长摘要复制属于 P1，范围另定。
4. 转学待办 7 天未处理自动提醒原学校；30 天未处理自动关闭并通知发起方。
5. 外籍、港澳台学生使用对应证件类型，同样哈希。

## 6. 错误码

| 码    | 含义                             |
| ----- | -------------------------------- |
| 20201 | 该学生在其他学校在读，需发起转学 |
| 20202 | 转学申请已存在                   |
| 20203 | 转学申请已处理                   |

## 7. 验收标准

- 同一证件号无法在两所学校同时在读。
- 原学校同意后，新学校可建档，原学校学生变为转出。
- 查重接口不会返回其他学校学生的姓名、班级等信息。
