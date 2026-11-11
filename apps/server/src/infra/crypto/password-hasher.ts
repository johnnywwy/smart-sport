import { Injectable } from "@nestjs/common";
import { argon2id, hash, verify } from "argon2";

@Injectable()
export class PasswordHasher {
  // 使用已安装 argon2 版本推荐的默认成本与随机盐，存储标准 PHC 字符串。
  hash(password: string): Promise<string> {
    return hash(password, { type: argon2id });
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }
}
