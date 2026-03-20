import { readFile } from "node:fs/promises";
import { ConfigError, ParseError } from "../../shared/errors.js";
import type { LimitWindow, ProviderId, ProviderUsage } from "../../shared/types.js";

export abstract class BaseCliProvider<T> {
  abstract readonly id: ProviderId;

  protected abstract cacheFile(): string;
  protected abstract toLimits(raw: T): LimitWindow[];

  async load(cacheDir: string): Promise<ProviderUsage> {
    const path = `${cacheDir}/${this.cacheFile()}`;
    let rawText: string;
    try {
      rawText = await readFile(path, "utf-8");
    } catch {
      throw new ConfigError(`Missing cache file for ${this.id}: ${path}`);
    }

    let raw: T;
    try {
      raw = JSON.parse(rawText) as T;
    } catch {
      throw new ParseError(`Invalid JSON in cache file for ${this.id}: ${path}`);
    }

    return {
      limits: this.toLimits(raw),
    };
  }
}
