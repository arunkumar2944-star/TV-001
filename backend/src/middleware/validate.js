'use strict';

/**
 * Request validation using zod schemas.
 *
 * Frontend validation is a convenience; this is the boundary that actually
 * protects the database. Parsed (and coerced) values replace the raw input so
 * controllers only ever see clean data.
 */

const ApiError = require('../utils/ApiError');

function formatIssues(zodError) {
  return zodError.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

function runSchema(schema, value, label) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = formatIssues(result.error);
    const first = details[0];
    throw ApiError.badRequest(
      first ? `${first.field}: ${first.message}` : `Invalid ${label}`,
      { details, code: 'VALIDATION_FAILED' }
    );
  }
  return result.data;
}

/**
 * @param {{body?:import('zod').ZodTypeAny, query?:import('zod').ZodTypeAny, params?:import('zod').ZodTypeAny}} schemas
 */
function validate(schemas) {
  return function validator(req, res, next) {
    try {
      if (schemas.params) req.validatedParams = runSchema(schemas.params, req.params, 'parameters');
      if (schemas.query) req.validatedQuery = runSchema(schemas.query, req.query, 'query');
      if (schemas.body) req.body = runSchema(schemas.body, req.body ?? {}, 'body');
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { validate, runSchema, formatIssues };
