/** OpenAPI 3.0 specification for BiliStudy's HTTP API (discovery + docs). */

import { Router, Request, Response } from "express";

function buildSpec(origin: string): object {
  return {
    openapi: "3.0.3",
    info: {
      title: "BiliStudy API",
      version: "4.0.0",
      description:
        "B 站/YouTube/播客视频总结与学习库 API。REST 接口使用 cookie 会话鉴权；MCP/Agent 接口使用 `Authorization: Bearer <API token>`（在设置页生成）。",
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "MCP/Agent 接口的 API token" },
        cookieAuth: { type: "apiKey", in: "cookie", name: "connect.sid", description: "REST 接口的登录会话" },
      },
      schemas: {
        VideoMeta: {
          type: "object",
          properties: {
            title: { type: "string" },
            author: { type: "string" },
            duration: { type: "number" },
            bvid: { type: "string" },
            link: { type: "string" },
            pic: { type: "string" },
          },
        },
        SubtitleSegment: {
          type: "object",
          properties: { from: { type: "number" }, to: { type: "number" }, content: { type: "string" } },
        },
        Chapter: {
          type: "object",
          properties: { from: { type: "number" }, to: { type: "number" }, title: { type: "string" }, detail: { type: "string" } },
        },
        SummaryResult: {
          type: "object",
          properties: {
            type: { type: "string" },
            video: { $ref: "#/components/schemas/VideoMeta" },
            summary: { type: "string" },
            transcript: { type: "string" },
            subtitle_segments: { type: "array", items: { $ref: "#/components/schemas/SubtitleSegment" } },
            chapters: { type: "array", items: { $ref: "#/components/schemas/Chapter" } },
            suggested_tags: { type: "array", items: { type: "string" } },
          },
        },
        LibraryItem: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            author: { type: "string" },
            summary: { type: "string" },
            transcript: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            chapters: { type: "array", items: { $ref: "#/components/schemas/Chapter" } },
          },
        },
        Error: {
          type: "object",
          properties: { success: { type: "boolean" }, error: { type: "string" } },
        },
      },
    },
    paths: {
      "/api/auth/register": {
        post: {
          summary: "邮箱注册",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { email: { type: "string" }, password: { type: "string" }, display_name: { type: "string" } },
                  required: ["email", "password"],
                },
              },
            },
          },
          responses: { "200": { description: "成功" }, "409": { description: "邮箱已注册" } },
        },
      },
      "/api/auth/login": {
        post: {
          summary: "邮箱登录",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { email: { type: "string" }, password: { type: "string" } },
                  required: ["email", "password"],
                },
              },
            },
          },
          responses: { "200": { description: "成功" }, "401": { description: "邮箱或密码错误" } },
        },
      },
      "/api/auth/me": {
        get: { summary: "当前登录用户", security: [{ cookieAuth: [] }], responses: { "200": { description: "用户信息" } } },
      },
      "/api/config": {
        get: { summary: "读取用户配置（公开字段）", security: [{ cookieAuth: [] }], responses: { "200": { description: "配置" } } },
        post: {
          summary: "保存用户配置",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    api_key: { type: "string" },
                    whisper_api_key: { type: "string" },
                    deepseek_model: { type: "string" },
                    deepseek_base_url: { type: "string" },
                    whisper_model: { type: "string" },
                    whisper_base_url: { type: "string" },
                    embedding_model: { type: "string" },
                    vision_model: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "保存成功" } },
        },
      },
      "/api/config/api-token": {
        get: { summary: "是否有 API token", security: [{ cookieAuth: [] }], responses: { "200": { description: "has_token" } } },
        post: { summary: "生成/重置 API token（用于 MCP/Agent）", security: [{ cookieAuth: [] }], responses: { "200": { description: "返回新 token" } } },
      },
      "/api/tasks/summarize": {
        post: {
          summary: "提交视频总结任务（异步，返回 task_id）",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { url: { type: "string" }, mode: { type: "string", enum: ["brief", "detailed", "timeline", "knowledge"] } },
                  required: ["url"],
                },
              },
            },
          },
          responses: { "200": { description: "task_id" }, "429": { description: "限流或超出每日配额" } },
        },
      },
      "/api/tasks/{id}/poll": {
        get: {
          summary: "轮询任务状态",
          security: [{ cookieAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "任务状态/结果" } },
        },
      },
      "/api/library": {
        get: {
          summary: "查询收藏库",
          security: [{ cookieAuth: [] }],
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "tag", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "page_size", in: "query", schema: { type: "integer" } },
          ],
          responses: { "200": { description: "条目列表" } },
        },
        post: {
          summary: "保存/更新收藏",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    video: { $ref: "#/components/schemas/VideoMeta" },
                    summary: { type: "string" },
                    transcript: { type: "string" },
                    subtitle_segments: { type: "array", items: { $ref: "#/components/schemas/SubtitleSegment" } },
                    chapters: { type: "array", items: { $ref: "#/components/schemas/Chapter" } },
                    tags: { type: "array", items: { type: "string" } },
                    category: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "已保存" } },
        },
      },
      "/api/library/{id}": {
        get: {
          summary: "获取单条收藏",
          security: [{ cookieAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "条目" }, "404": { description: "未找到" } },
        },
      },
      "/api/llm/ask": {
        post: {
          summary: "向知识库提问（RAG，SSE 流式）",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { question: { type: "string" }, history: { type: "array", items: { type: "object" } } },
                  required: ["question"],
                },
              },
            },
          },
          responses: { "200": { description: "SSE 流" } },
        },
      },
      "/api/mcp": {
        get: { summary: "MCP 服务信息", security: [{ bearerAuth: [] }], responses: { "200": { description: "服务信息" } } },
        post: {
          summary: "MCP JSON-RPC（Streamable HTTP）",
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
          responses: { "200": { description: "JSON-RPC 响应" }, "401": { description: "未授权" } },
        },
      },
    },
  };
}

export function createOpenApiRouter(): Router {
  const router = Router();

  router.get("/api/openapi.json", (req: Request, res: Response) => {
    const proto = req.secure ? "https" : "http";
    const host = String(req.headers.host || "127.0.0.1");
    const origin = `${proto}://${host}`;
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(buildSpec(origin));
  });

  return router;
}
