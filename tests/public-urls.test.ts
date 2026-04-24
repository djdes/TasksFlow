import { afterEach, describe, expect, it } from "vitest";
import type { Request } from "express";

import {
  getPublicTasksflowBaseUrl,
  getPublicWesetupBaseUrl,
  toPublicWesetupUrl,
} from "../server/public-urls";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function req(headers: Request["headers"], protocol = "http"): Request {
  return { headers, protocol } as Request;
}

describe("public URL helpers", () => {
  it("uses production TasksFlow domain instead of localhost fallback", () => {
    process.env.NODE_ENV = "production";
    delete process.env.TASKSFLOW_PUBLIC_URL;
    delete process.env.APP_PUBLIC_URL;
    delete process.env.APP_URL;
    delete process.env.PUBLIC_URL;

    expect(
      getPublicTasksflowBaseUrl(
        req({
          origin: "http://localhost:3002",
          host: "localhost:5001",
        })
      )
    ).toBe("https://tasksflow.ru");
  });

  it("uses forwarded production host for return links", () => {
    process.env.NODE_ENV = "production";
    delete process.env.TASKSFLOW_PUBLIC_URL;

    expect(
      getPublicTasksflowBaseUrl(
        req({
          "x-forwarded-proto": "https",
          "x-forwarded-host": "tasksflow.ru",
        })
      )
    ).toBe("https://tasksflow.ru");
  });

  it("rewrites localhost WeSetup fill URLs to the public domain in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.WESETUP_PUBLIC_URL;

    const publicBaseUrl = getPublicWesetupBaseUrl("http://localhost:3000");
    expect(publicBaseUrl).toBe("https://wesetup.ru");

    expect(
      toPublicWesetupUrl(
        "http://localhost:3000/task-fill/77?token=abc",
        publicBaseUrl
      )
    ).toBe("https://wesetup.ru/task-fill/77?token=abc");
  });

  it("keeps real WeSetup absolute URLs intact", () => {
    process.env.NODE_ENV = "production";

    expect(
      toPublicWesetupUrl(
        "https://wesetup.ru/task-fill/77?token=abc",
        "https://wesetup.ru"
      )
    ).toBe("https://wesetup.ru/task-fill/77?token=abc");
  });
});
