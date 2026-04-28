import { z } from 'zod';
import { insertWorkerSchema, insertTaskSchema, insertUserSchema, updateUserSchema, loginSchema, workers, tasks, users, invitations, type Invitation } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
};

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/auth/login',
      input: loginSchema,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.validation,
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/auth/me',
      responses: {
        200: z.custom<typeof users.$inferSelect>().nullable(),
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout',
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },
  users: {
    list: {
      method: 'GET' as const,
      path: '/api/users',
      responses: {
        200: z.array(z.custom<typeof users.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/users',
      input: insertUserSchema
        .pick({ phone: true, name: true, isAdmin: true, position: true })
        .extend({
          role: z.enum(["admin", "manager", "employee", "worker"]).optional(),
        }),
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/users/:id',
      input: updateUserSchema,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  invitations: {
    list: {
      method: 'GET' as const,
      path: '/api/invitations',
      responses: {
        200: z.array(z.custom<Invitation>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/invitations',
      input: z.object({
        position: z.string().trim().min(1).max(120).nullable().optional(),
        role: z.enum(['admin', 'manager', 'employee']).optional(),
      }),
      responses: {
        201: z.object({
          id: z.number(),
          token: z.string(),
          url: z.string(),
          position: z.string().nullable(),
          isAdmin: z.boolean(),
          createdAt: z.number(),
        }),
        400: errorSchemas.validation,
      },
    },
    revoke: {
      method: 'POST' as const,
      path: '/api/invitations/:id/revoke',
      responses: {
        200: z.custom<Invitation>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    preview: {
      method: 'GET' as const,
      path: '/api/invitations/by-token/:token',
      responses: {
        200: z.union([
          z.object({ valid: z.literal(false), reason: z.enum(['not_found', 'used', 'revoked']) }),
          z.object({ valid: z.literal(true), companyName: z.string(), position: z.string().nullable() }),
        ]),
      },
    },
    accept: {
      method: 'POST' as const,
      path: '/api/invitations/by-token/:token/accept',
      input: z.object({
        phone: z.string().min(1),
        name: z.string().trim().min(1),
      }),
      responses: {
        201: z.object({
          user: z.custom<typeof users.$inferSelect>(),
          company: z.object({ id: z.number(), name: z.string() }),
        }),
        400: errorSchemas.validation,
      },
    },
  },
  workers: {
    list: {
      method: 'GET' as const,
      path: '/api/workers',
      responses: {
        200: z.array(z.custom<typeof workers.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/workers/:id',
      responses: {
        200: z.custom<typeof workers.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/workers',
      input: insertWorkerSchema,
      responses: {
        201: z.custom<typeof workers.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/workers/:id',
      input: insertWorkerSchema,
      responses: {
        200: z.custom<typeof workers.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/workers/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  tasks: {
    list: {
      method: 'GET' as const,
      path: '/api/tasks',
      responses: {
        200: z.array(z.custom<typeof tasks.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/tasks/:id',
      responses: {
        200: z.custom<typeof tasks.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/tasks',
      input: insertTaskSchema,
      responses: {
        201: z.custom<typeof tasks.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/tasks/:id',
      input: insertTaskSchema.partial(),
      responses: {
        200: z.custom<typeof tasks.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/tasks/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    complete: {
      method: 'POST' as const,
      path: '/api/tasks/:id/complete',
      responses: {
        200: z.custom<typeof tasks.$inferSelect>(),
        400: errorSchemas.validation,
        403: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    uploadPhoto: {
      method: 'POST' as const,
      path: '/api/tasks/:id/photo',
      responses: {
        200: z.object({ photoUrl: z.string() }),
        400: errorSchemas.validation,
        403: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  apiKeys: {
    list: { method: 'GET' as const, path: '/api/api-keys' },
    create: { method: 'POST' as const, path: '/api/api-keys' },
    revoke: (id: number) => ({ method: 'DELETE' as const, path: `/api/api-keys/${id}` }),
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
