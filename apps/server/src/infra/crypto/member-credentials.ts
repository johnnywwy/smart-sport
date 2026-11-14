import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { ServerConfig } from "@smart-sport/config/env";
import { SERVER_CONFIG } from "../../server-config.js";

@Injectable()
export class MemberCredentials {
  constructor(@Inject(SERVER_CONFIG) private readonly config: ServerConfig) {}

  initialPassword() {
    if (this.config.NODE_ENV !== "production") return "123456";
    for (;;) {
      const value = randomBytes(9).toString("base64url");
      if (/[A-Za-z]/.test(value) && /\d/.test(value)) return value;
    }
  }

  phoneHash(value: string) {
    return createHmac(
      "sha256",
      Buffer.from(this.config.STUDENT_HMAC_KEY, "base64"),
    )
      .update(`phone:${value}`)
      .digest("hex");
  }

  encryptPhone(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(this.config.FIELD_ENCRYPTION_KEY, "base64"),
      iv,
    );
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return `v1:${iv.toString("base64")}:${encrypted.toString("base64")}:${cipher.getAuthTag().toString("base64")}`;
  }

  maskedPhone(value: string | null) {
    if (value === null) return null;
    const [version, iv, ciphertext, tag] = value.split(":");
    if (version !== "v1" || !iv || !ciphertext || !tag)
      throw new Error("手机号密文格式无效");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(this.config.FIELD_ENCRYPTION_KEY, "base64"),
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const phone = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }
}
