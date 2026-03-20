/// <reference types="chrome" />

import { AuthError, ParseError, TransportError } from "../../shared/errors.js";
import type { ProviderId } from "../../shared/types.js";

export interface FetchContext {
  windowId: number | undefined;
  createHiddenTab: (url: string, windowId: number | undefined) => Promise<chrome.tabs.Tab>;
  sendToHost: (payload: Record<string, unknown>) => void;
}

export interface ProviderFetchResult {
  ok: true;
}

export abstract class BaseExtensionProvider {
  abstract readonly id: ProviderId;
  abstract fetch(ctx: FetchContext): Promise<ProviderFetchResult>;

  protected throwAuth(msg: string): never {
    throw new AuthError(msg);
  }

  protected throwParse(msg: string): never {
    throw new ParseError(msg);
  }

  protected throwTransport(msg: string): never {
    throw new TransportError(msg);
  }
}
