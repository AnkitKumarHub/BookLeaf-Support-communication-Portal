import { z } from "zod";
import { errorEnvelope, pageMeta } from "./common.js";
import { routeRecords, type ResponseDoc, type RouteRecord } from "./define-route.js";

type JsonSchema = Record<string, unknown>;

const ACCESS_TEXT = {
  public: "Public.",
  user: "Any signed-in user.",
  author: "Authors only.",
  admin: "Admins only.",
} as const;

// Builds the OpenAPI 3.1 document from the routes registered with defineRoutes.
// Call after the routers are mounted.
export function buildOpenApiDocument(): JsonSchema {
  const paths: Record<string, Record<string, unknown>> = {};
  const tags = new Set<string>();

  for (const record of routeRecords.values()) {
    tags.add(record.tag);
    paths[record.path] ??= {};
    paths[record.path]![record.method] = operation(record);
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "BookLeaf Author Support API",
      version: "1.0.0",
      description: [
        "REST API for the BookLeaf author and admin portals.",
        "",
        "Auth uses HttpOnly cookies. Call `POST /api/v1/auth/login` first; the browser then sends `bookleaf_access` on every request from this page.",
        "Every success body is `{ data, meta? }`. Every error body is `{ error: { code, message, fields? } }`.",
        "A validation error returns the first problem as `message` and names that field in `fields`.",
      ].join("\n"),
    },
    servers: [{ url: "/" }],
    tags: [...tags].map((name) => ({ name })),
    components: {
      securitySchemes: {
        accessCookie: { type: "apiKey", in: "cookie", name: "bookleaf_access" },
        refreshCookie: { type: "apiKey", in: "cookie", name: "bookleaf_refresh" },
      },
      schemas: { Error: toSchema(errorEnvelope, "output") },
    },
    paths,
  };
}

function operation({ spec, tag }: RouteRecord): Record<string, unknown> {
  const op: Record<string, unknown> = {
    tags: [tag],
    summary: spec.summary,
    description: [spec.description, ACCESS_TEXT[spec.access]].filter(Boolean).join("\n\n"),
    security: spec.access === "public" ? [] : [{ accessCookie: [] }],
  };

  const parameters = [...params(spec.params, "path"), ...params(spec.query, "query")];
  if (parameters.length > 0) op.parameters = parameters;

  if (spec.fileField) {
    op.requestBody = {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            required: [spec.fileField],
            properties: { [spec.fileField]: { type: "string", format: "binary" } },
          },
        },
      },
    };
  } else if (spec.body) {
    op.requestBody = { required: true, content: { "application/json": { schema: toSchema(spec.body, "input") } } };
  }

  // Standard errors every route of this kind can return, unless the route says otherwise.
  const responses: Record<number, ResponseDoc> = {};
  if (spec.body || spec.query || spec.params || spec.fileField) responses[400] = "Invalid input. `message` is the first problem.";
  if (spec.access !== "public") responses[401] = "No session, or the access token expired.";
  if (spec.access === "author" || spec.access === "admin") responses[403] = "Signed in with the wrong role.";
  Object.assign(responses, spec.responses);

  op.responses = Object.fromEntries(
    Object.entries(responses).map(([status, doc]) => [status, response(doc)]),
  );
  return op;
}

function params(schema: z.ZodType | undefined, location: "path" | "query"): JsonSchema[] {
  if (!schema) return [];
  const json = toSchema(schema, "input");
  const properties = (json.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((json.required ?? []) as string[]);
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === "path" || required.has(name),
    schema: property,
    ...(typeof property.description === "string" ? { description: property.description } : {}),
  }));
}

function response(doc: ResponseDoc): JsonSchema {
  if (typeof doc === "string") {
    return { description: doc, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
  }
  if (doc instanceof z.ZodType) {
    return { description: "OK", content: { "application/json": { schema: dataEnvelope(doc, false) } } };
  }
  if (doc.contentType) {
    return {
      description: doc.description,
      content: { [doc.contentType]: { schema: { type: "string" }, ...(doc.example ? { example: doc.example } : {}) } },
    };
  }
  if (!doc.schema) return { description: doc.description };
  return {
    description: doc.description,
    content: { "application/json": { schema: dataEnvelope(doc.schema, doc.paged ?? false) } },
  };
}

function dataEnvelope(schema: z.ZodType, paged: boolean): JsonSchema {
  const properties: JsonSchema = { data: toSchema(schema, "output") };
  if (paged) properties.meta = toSchema(pageMeta, "output");
  return { type: "object", required: ["data"], properties };
}

function toSchema(schema: z.ZodType, io: "input" | "output"): JsonSchema {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as JsonSchema;
  return json;
}
