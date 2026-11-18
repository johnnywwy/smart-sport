import { auditChanges } from "./audit-changes.js";

/** 标注事务内的审计写入方法；不创建事务，不在请求完成后补写日志。 */
export function Audit() {
  return <Args extends unknown[], Result>(
    _target: object,
    _key: string | symbol,
    descriptor: TypedPropertyDescriptor<(...args: Args) => Result>,
  ) => {
    const original = descriptor.value;
    if (!original) throw new Error("审计装饰器只能用于方法");
    descriptor.value = function (this: unknown, ...args: Args): Result {
      const input: unknown = args.at(-1);
      if (input === null || typeof input !== "object")
        throw new Error("审计写入必须提供记录对象");
      const prepared = [...args];
      prepared[prepared.length - 1] = {
        ...input,
        changes: auditChanges("changes" in input ? input.changes : null),
      };
      return original.apply(this, prepared as Args);
    };
  };
}
