import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import {
  type SystemParamKey,
  systemParamValueSchema,
} from "@smart-sport/contracts";
import {
  ParamsRepository,
  type ParamTransaction,
} from "./params.repository.js";
@Injectable()
export class ParamsService implements OnModuleInit {
  constructor(
    @Inject(ParamsRepository) private readonly repository: ParamsRepository,
  ) {}
  onModuleInit() {
    return this.repository.initialize();
  }
  /** 业务读取代码声明的参数；允许复用业务事务，不使用跨实例不一致的内存缓存。 */
  async get(key: SystemParamKey, tx?: ParamTransaction) {
    const row = await this.repository.value(key, tx);
    if (!row) throw new Error(`系统参数未初始化：${key}`);
    return systemParamValueSchema(key).parse(row.value);
  }
}
