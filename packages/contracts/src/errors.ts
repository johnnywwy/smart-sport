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

export const apiErrors = {
  ...systemErrors,
  ...authErrors,
  ...identityErrors,
  ...permissionErrors,
} as const;
export type ApiErrorCode = keyof typeof apiErrors;
