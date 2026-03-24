import type { ZodSchema } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../errors/index';

/**
 * Validates req.body against the given Zod schema.
 * Replaces req.body with the parsed (stripped + coerced) output.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      throw new ValidationError(errors);
    }

    req.body = result.data;
    next();
  };
}

/**
 * Validates req.query against the given Zod schema.
 * Stores parsed output back on req.query for downstream handlers.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      throw new ValidationError(errors);
    }

    req.query = result.data as typeof req.query;
    next();
  };
}

/**
 * Validates req.params against the given Zod schema.
 * Stores parsed output back on req.params for downstream handlers.
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      throw new ValidationError(errors);
    }

    req.params = result.data as typeof req.params;
    next();
  };
}
