# 08 · 学年学期、学段年级与学年切换

## 1. 目标

全平台统一学年学期；年级由入学年份动态计算；每年暑假通过学年切换完成升级与毕业。

## 2. 学段与年级编码

| 学段 | 编码 | 年限（可配） | 年级编码                         |
| ---- | ---- | ------------ | -------------------------------- |
| 小学 | 1    | 6（可 5）    | 11 一年级 … 16 六年级            |
| 初中 | 2    | 3（可 4）    | 21 初一 … 23 初三（四年制到 24） |
| 高中 | 3    | 3            | 31 高一 … 33 高三                |
| 大学 | 4    | 4（可 3、5） | 41 大一 … 45                     |

```
年级序号 = 学年起始年 − 入学年份 + 1
年级编码 = 学段编码 × 10 + 年级序号
序号 < 1：未入学；序号 > 该校该学段年限：已毕业
```

计算函数放在 `packages/domain/grade.ts`，前后端共用；年限取学校档案 `stage_years`。界面显示名称（“三年级”“初一”“大二”），不显示编码。

## 3. 数据

**academic_years**：name（如“2026-2027学年”）、start_date、end_date、is_current（部分唯一索引）、status（draft · current · closed）。

**semesters**：academic_year_id、term（1、2）、name、start_date、end_date、is_current（部分唯一索引）。

**school_rollovers**（public）：academic_year_id、school_id、status（pending · running · done · failed）、summary jsonb、confirmed_by、confirmed_at。

## 4. 接口

| 方法  | 路径                              | 权限                     | 说明                                                                                                  |
| ----- | --------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| GET   | `/academic-years`                 | 登录                     | 含学期                                                                                                |
| GET   | `/academic-years/current`         | 登录                     | 当前学年与学期                                                                                        |
| POST  | `/academic-years`                 | `system:academic:create` | `{ startYear }`，自动生成名称与两个学期，默认日期 9/1–次年 8/31，第一学期 9/1–1/31，第二学期 2/1–7/31 |
| PATCH | `/semesters/:id`                  | `system:academic:update` | 调整起止日期                                                                                          |
| POST  | `/semesters/:id/set-current`      | `system:academic:update` | 设为当前学期，同时切换当前学年                                                                        |
| POST  | `/academic-years/:id/rollover`    | `system:academic:update` | 为全部学校发起学年切换（生成每校任务）                                                                |
| GET   | `/schools/:schoolId/rollover`     | `school:rollover:view`   | 本校切换预检查与状态                                                                                  |
| POST  | `/schools/:schoolId/rollover/run` | `school:rollover:update` | 执行本校切换                                                                                          |

## 5. 学年切换流程（每校）

1. **预检查**：未分班学生、无任课教师的班级、待确认转学，列出清单（不阻断）。
2. **生成学籍**：为在读学生按当前班级生成新学年 `student_enrollments`。
3. **毕业处理**：年级序号超过年限的班级归档；学生状态改为“毕业”，学生索引同步为毕业（spec 10）。
4. **任课复制**：上学年任课关系复制到新学年，学校可再调整。
5. **教学班**：按学期开设，不复制，上学期教学班归档。
6. **完成**：记录 summary（升级人数、毕业人数等），学校管理员确认。

- 在 worker 中按学校执行，可重跑（幂等：已生成的记录跳过）。
- 切换完成后清除该校身份的数据范围缓存。

## 6. 规则

1. 同一时刻只有一个当前学年、一个当前学期。
2. 新建学年默认 draft；设为当前前应先完成各校切换（未完成的学校在首页提示）。
3. 学年已 closed 后只读。
4. 前端顶栏的学年学期选择器默认当前学期；所有学校业务查询带 `academicYearId` / `semesterId`。

## 7. 错误码

| 码    | 含义                 |
| ----- | -------------------- |
| 20001 | 学年已存在           |
| 20002 | 学年已关闭，不能修改 |
| 20003 | 本校学年切换正在执行 |

## 8. 验收标准

- 2024 级小学班级在 2026-2027 学年显示为三年级，在 2027-2028 学年自动显示为四年级。
- 五年制小学的 2021 级在 2026-2027 学年显示为已毕业，不出现在在读班级中。
- 学年切换重跑不会产生重复学籍。
