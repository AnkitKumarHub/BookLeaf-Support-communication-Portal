import type { NextFunction, Request, RequestHandler, Response, Router } from "express";
import type { z } from "zod";
import { requireAdmin, requireAuth, requireAuthor } from "../app/auth/auth.middleware.js";
import { AppError } from "../app/shared/errors.js";

// One call per route: it registers the Express handler, validates the input,
// and records the route for the OpenAPI document. Docs and routes cannot drift
// because they come from the same declaration.

type Schema = z.ZodType | undefined;
type Out<S extends Schema> = S extends z.ZodType ? z.output<S> : undefined;

export type Access = "public" | "user" | "author" | "admin";

// A response is a Zod schema (wrapped in { data } in the docs), a string (the
// standard error envelope with that description), or a custom entry.
export type ResponseDoc =
  | z.ZodType
  | string
  | {
      description: string;
      schema?: z.ZodType;
      paged?: boolean;
      contentType?: string;
      example?: string;
    };

export type RouteSpec<B extends Schema, Q extends Schema, P extends Schema> = {
  summary: string;
  description?: string;
  access: Access;
  body?: B;
  query?: Q;
  params?: P;
  // Documents the request as multipart/form-data with one binary field.
  fileField?: string;
  middlewares?: RequestHandler[];
  responses: Record<number, ResponseDoc>;
  handler: (
    req: ValidRequest<{ body: Out<B>; query: Out<Q>; params: Out<P> }>,
    res: Response,
  ) => unknown;
};

// The validated input, typed from the route's schemas.
export type ValidRequest<T extends { body?: unknown; query?: unknown; params?: unknown }> = Request & {
  valid: {
    body: T extends { body: infer B } ? B : undefined;
    query: T extends { query: infer Q } ? Q : undefined;
    params: T extends { params: infer P } ? P : undefined;
  };
};

export type RouteRecord = {
  method: "get" | "post" | "patch" | "put" | "delete";
  path: string;
  tag: string;
  spec: RouteSpec<Schema, Schema, Schema>;
};

// Read by document.ts. Keyed so building the app twice does not duplicate routes.
export const routeRecords = new Map<string, RouteRecord>();

const ACCESS_MIDDLEWARE: Record<Access, RequestHandler | null> = {
  public: null,
  user: requireAuth,
  author: requireAuthor,
  admin: requireAdmin,
};

export function defineRoutes(router: Router, options: { basePath: string; tag: string }) {
  function add<B extends Schema = undefined, Q extends Schema = undefined, P extends Schema = undefined>(
    method: RouteRecord["method"],
    path: string,
    spec: RouteSpec<B, Q, P>,
  ) {
    const fullPath = `${options.basePath}${path}`.replace(/:(\w+)/g, "{$1}");
    routeRecords.set(`${method} ${fullPath}`, {
      method,
      path: fullPath,
      tag: options.tag,
      spec: spec as unknown as RouteSpec<Schema, Schema, Schema>,
    });

    const access = ACCESS_MIDDLEWARE[spec.access];
    router[method](
      path,
      // Auth first, so a request without a session gets 401 before any 400.
      ...(access ? [access] : []),
      ...(spec.middlewares ?? []),
      validate(spec),
      async (req: Request, res: Response) => {
        await spec.handler(req as ValidRequest<{ body: Out<B>; query: Out<Q>; params: Out<P> }>, res);
      },
    );
  }

  return {
    get: <B extends Schema = undefined, Q extends Schema = undefined, P extends Schema = undefined>(path: string, spec: RouteSpec<B, Q, P>) => add("get", path, spec),
    post: <B extends Schema = undefined, Q extends Schema = undefined, P extends Schema = undefined>(path: string, spec: RouteSpec<B, Q, P>) => add("post", path, spec),
    patch: <B extends Schema = undefined, Q extends Schema = undefined, P extends Schema = undefined>(path: string, spec: RouteSpec<B, Q, P>) => add("patch", path, spec),
  };
}

function validate(spec: { body?: Schema; query?: Schema; params?: Schema }): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const valid = {
      // A missing JSON body is treated as {} so field rules give the message.
      body: parse(spec.body, req.body ?? {}),
      query: parse(spec.query, req.query),
      params: parse(spec.params, req.params),
    };
    (req as Request & { valid: typeof valid }).valid = valid;
    next();
  };
}

// On failure: 400 with the first issue's message, and that field in `fields`.
function parse(schema: Schema, input: unknown): unknown {
  if (!schema) return undefined;
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue?.path.map(String).join(".");
  const message = issue?.message ?? "Please correct the request.";
  throw AppError.validation(message, field ? { [field]: message } : {});
}
