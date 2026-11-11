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
export const apiErrors = { ...systemErrors, ...authErrors } as const;
export type ApiErrorCode = keyof typeof apiErrors;
