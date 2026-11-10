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
