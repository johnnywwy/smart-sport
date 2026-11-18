export const systemErrors = {
  90001: { status: 400, message: "参数校验失败" },
  90002: { status: 409, message: "数据已被他人修改，请刷新" },
  90003: { status: 409, message: "重复提交" },
  90004: { status: 404, message: "数据不存在或无权查看" },
  90005: { status: 429, message: "请求过于频繁" },
  90006: { status: 413, message: "请求体过大" },
  90500: { status: 500, message: "系统错误" },
} as const;

export type SystemErrorCode = keyof typeof systemErrors;

export const authErrors = {
  10001: { status: 401, message: "账号或密码错误" },
  10002: { status: 401, message: "需要图形验证码 / 验证码错误" },
  10003: { status: 401, message: "账号已锁定，请稍后再试" },
  10004: { status: 401, message: "账号已停用" },
  10005: { status: 401, message: "登录已过期，请重新登录" },
  10006: { status: 400, message: "新密码不符合要求" },
} as const;

export const identityErrors = {
  11001: { status: 404, message: "身份不存在或不属于当前账号" },
  11002: { status: 403, message: "身份已停用" },
  11003: { status: 403, message: "组织已停用" },
  11004: { status: 403, message: "该身份暂不支持登录后台" },
  11005: { status: 401, message: "已在其他页面切换身份，请刷新" },
} as const;

export const permissionErrors = {
  11101: { status: 403, message: "缺少权限" },
  11102: { status: 403, message: "分配的角色超出你的权限" },
  11103: { status: 403, message: "不能修改自己的角色" },
  11104: { status: 409, message: "组织至少保留一名管理员" },
  11105: { status: 403, message: "内置角色不可修改" },
  11106: { status: 409, message: "角色正在使用，不能删除" },
} as const;

export const organizationErrors = {
  12001: { status: 409, message: "部门名称在同级已存在" },
  12002: { status: 409, message: "部门下还有成员或子部门，不能删除" },
  12003: { status: 409, message: "不能把部门移到自己或自己的下级" },
  12004: { status: 422, message: "负责范围超出本组织可见范围" },
  12005: { status: 409, message: "学校标识码已存在" },
  12006: { status: 422, message: "学段与年限配置不合法" },
  12007: { status: 403, message: "预置部门不可删除" },
} as const;

export const academicErrors = {
  20001: { status: 409, message: "学年已存在" },
  20002: { status: 409, message: "学年已关闭，不能修改" },
} as const;

export const numberErrors = {
  30001: { status: 409, message: "编号流水已用尽，请增加流水号位数" },
  30002: { status: 409, message: "编号前缀已被其他规则使用" },
  30003: { status: 503, message: "系统时间早于编号年度，请联系管理员检查" },
} as const;

export const dictErrors = {
  30010: { status: 403, message: "系统内置字典选项只读" },
  30011: { status: 403, message: "该字典不允许新增自定义选项" },
  30012: { status: 409, message: "选项已被使用，只能停用，不能删除" },
  30013: { status: 409, message: "该字典下已存在同名选项" },
  30014: { status: 409, message: "字典选项已停用，不能用于新业务" },
} as const;

export const taskErrors = {
  30020: { status: 409, message: "当前任务状态不允许此操作" },
  30021: { status: 409, message: "此任务开始执行后不允许取消" },
} as const;

export const subscriptionErrors = {
  13001: { status: 403, message: "学校未开通该应用或已到期" },
  13002: { status: 403, message: "学校服务处于宽限期，仅可查看与导出" },
  13003: { status: 403, message: "学校服务已停用" },
  13004: { status: 403, message: "不能审核自己提交的申请" },
} as const;

export const apiErrors = {
  ...subscriptionErrors,
  ...taskErrors,
  ...systemErrors,
  ...authErrors,
  ...identityErrors,
  ...permissionErrors,
  ...organizationErrors,
  ...academicErrors,
  ...numberErrors,
  ...dictErrors,
  12008: { status: 409, message: "账号信息已存在，请使用追加身份" },
  12009: { status: 409, message: "该账号已拥有此组织身份" },
} as const;
export type ApiErrorCode = keyof typeof apiErrors;
