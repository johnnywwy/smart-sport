# 09 · 学校基础数据

## 1. 目标

在学校库中维护院系专业（仅大学）、行政班、教学班、学生、教师与任课，作为所有运动业务的基础。

层级关系：大学是 学院 → 专业 → 行政班 → 学生；中小学没有学院和专业，是 学段年级 → 行政班 → 学生。教学班不在这条线上，按学期开设，学生可来自多个行政班。

## 2. 数据（学校库）

| 表                         | 关键字段                                                                                                                                | 说明                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `colleges` 学院            | name、sort                                                                                                                              | 仅大学；行政班的上两级                                                            |
| `majors` 专业              | college_id、name                                                                                                                        | 仅大学；属于一个学院，行政班的上一级                                              |
| `classes` 行政班           | stage、entry_year、class_no、name（可空）、college_id、major_id、status                                                                 | 唯一 `(stage, entry_year, class_no, major_id)`；显示名由年级计算，如“三年级(1)班” |
| `teaching_classes` 教学班  | academic_year_id、semester_id、name、sport_item_code（可空）、status                                                                    | 按学期开设                                                                        |
| `teaching_class_students`  | teaching_class_id、student_id                                                                                                           | 学生可来自多个行政班                                                              |
| `students`                 | student_no、name、gender、birthday、id_type、id_card_enc、id_card_hash、class_id、status（在读 · 转出 · 毕业 · 休学）、student_index_id | 学号校内唯一                                                                      |
| `student_enrollments`      | (student_id, academic_year_id)、class_id                                                                                                | 学年学籍                                                                          |
| `teacher_profiles`         | identity_id、user_id、name、gender、phone_enc                                                                                           | 本校教师档案，与平台身份一一对应                                                  |
| `teacher_assignments` 任课 | teacher_profile_id、class_kind（admin · teaching）、class_id、academic_year_id、semester_id（教学班）、subject（默认 pe）、is_head      |                                                                                   |

## 3. 接口（均为 `/schools/:schoolId/...`，`@SchoolScoped()`）

| 资源     | 接口                                                                                                                                | 功能模块                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 院系专业 | `GET/POST/PATCH/DELETE colleges`、`majors`                                                                                          | `school:college`        |
| 行政班   | `GET classes?academicYearId&stage&grade&keyword`、`POST`、`PATCH /:id`、`DELETE /:id`、`POST classes/import`、`POST classes/export` | `school:class`          |
| 教学班   | `GET teaching-classes?semesterId`、`POST`、`PATCH`、`DELETE`、`PUT /:id/students`、导入导出                                         | `school:teaching-class` |
| 学生     | `GET students?classId&teachingClassId&status&keyword&page`、`GET /:id`、`POST`、`PATCH`、`DELETE`、导入、导出                       | `school:student`        |
| 教师     | `GET teachers`、`POST`（创建账号与 teacher 身份）、`PATCH`、`DELETE`（停用身份）、导入、导出                                        | `school:teacher`        |
| 任课     | `GET assignments?academicYearId`、`PUT assignments`（批量设置）、`POST assignments/copy-from-last-year`                             | `school:teacher`        |

列表返回的班级包含：显示名、年级名称、学生数、任课教师；学生包含：脱敏证件号、行政班显示名、所在教学班。

## 4. 规则

1. 所有查询经 `scopeFilter`：学校管理员按部门年级 / 学院过滤；教师“本人负责”按任教班级（行政班 + 教学班）过滤。
2. 新增学生必须填证件号，先走学生索引查重（spec 10），通过后在同一事务内写学生、学籍、索引（同数据源）或经 outbox（跨数据源）。
3. 新增教师：填姓名、手机号或用户名；平台已存在同手机号的账号时提示“该账号已存在，将为其追加本校教师身份”，由学校管理员确认；默认角色“体育教师”。
4. 删除班级前必须没有在读学生；删除为软删除。删除学院前必须没有专业，删除专业前必须没有行政班。
5. 大学的行政班必须填学院和专业，且专业属于所填学院；非大学学校不能填，院系专业接口对非大学学校返回 404。
6. 教学班学生必须是本校在读学生。
7. 导入模板（Zod 定义）：
   - 班级：学段、入学年份、班号、院系 / 专业（大学）
   - 学生：学号、姓名、性别、出生日期、证件类型、证件号、学段、入学年份、班号（或班级显示名）
   - 教师：姓名、手机号、性别、任教班级
     年级可填名称或编码。

## 5. 错误码

| 码    | 含义                             |
| ----- | -------------------------------- |
| 20101 | 班级已存在                       |
| 20102 | 班级下仍有在读学生               |
| 20103 | 学号已存在                       |
| 20104 | 学生不在本校或不在读             |
| 20105 | 教师账号已存在，需确认追加身份   |
| 20106 | 学院下仍有专业，或专业下仍有班级 |

## 6. 验收标准

- 体育教师只能看到自己任教的行政班和教学班学生。
- 年级组长（负责 23）的学生列表只包含初三学生。
- 导入 1000 名学生时，错误行（证件号重复、班级不存在）在预览中逐行列出，其余可正常导入。
- 学生详情页证件号默认脱敏，有“查看敏感信息”权限者点击显示并留审计。
