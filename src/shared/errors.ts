export class UsageError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ConfigError extends UsageError {
  constructor(message: string) {
    super(message, "config_error");
  }
}

export class ParseError extends UsageError {
  constructor(message: string) {
    super(message, "parse_error");
  }
}

export class AuthError extends UsageError {
  constructor(message: string) {
    super(message, "auth_error");
  }
}

export class TransportError extends UsageError {
  constructor(message: string) {
    super(message, "transport_error");
  }
}
