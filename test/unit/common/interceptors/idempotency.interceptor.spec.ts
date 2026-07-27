import { CallHandler, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";
import { IdempotencyInterceptor } from "../../../../src/common/interceptors/idempotency.interceptor";

describe("IdempotencyInterceptor", () => {
  const cacheManager = { get: jest.fn(), set: jest.fn() };
  const response = { header: jest.fn() };
  const user = {
    wallet: "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW",
  };
  const key = "550e8400-e29b-41d4-a716-446655440000";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function context(idempotencyKey = key): ExecutionContext {
    const request = {
      headers: { "idempotency-key": idempotencyKey },
      user,
      method: "POST",
      routeOptions: { url: "/loans/create" },
      url: "/loans/create",
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  }

  it("executes and caches the first request", async () => {
    const interceptor = new IdempotencyInterceptor(cacheManager as any);
    const next: CallHandler = { handle: jest.fn(() => of({ success: true })) };
    cacheManager.get.mockResolvedValue(undefined);
    cacheManager.set.mockResolvedValue(undefined);

    await expect(
      lastValueFrom(interceptor.intercept(context(), next)),
    ).resolves.toEqual({ success: true });
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(cacheManager.set).toHaveBeenCalledWith(
      `idempotency:${user.wallet}:/loans/create:${key}`,
      { success: true },
      86400,
    );
  });

  it("returns the cached response for the same key", async () => {
    const interceptor = new IdempotencyInterceptor(cacheManager as any);
    const next: CallHandler = { handle: jest.fn(() => of({ success: true })) };
    const cached = { success: true, data: { loanId: "pending-loan" } };
    cacheManager.get.mockResolvedValue(cached);

    await expect(
      lastValueFrom(interceptor.intercept(context(), next)),
    ).resolves.toEqual(cached);
    expect(next.handle).not.toHaveBeenCalled();
    expect(response.header).toHaveBeenCalledWith(
      "X-Idempotent-Replayed",
      "true",
    );
  });

  it("executes a request with a different key", async () => {
    const interceptor = new IdempotencyInterceptor(cacheManager as any);
    const next: CallHandler = { handle: jest.fn(() => of({ success: true })) };
    const differentKey = "550e8400-e29b-41d4-a716-446655440001";
    cacheManager.get.mockResolvedValue(undefined);
    cacheManager.set.mockResolvedValue(undefined);

    await lastValueFrom(interceptor.intercept(context(differentKey), next));

    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(cacheManager.get).toHaveBeenCalledWith(
      `idempotency:${user.wallet}:/loans/create:${differentKey}`,
    );
  });

  it("does not cache handler errors", async () => {
    const interceptor = new IdempotencyInterceptor(cacheManager as any);
    const next: CallHandler = {
      handle: jest.fn(() => throwError(() => new Error("failed"))),
    };
    cacheManager.get.mockResolvedValue(undefined);

    await expect(
      lastValueFrom(interceptor.intercept(context(), next)),
    ).rejects.toThrow("failed");
    expect(cacheManager.set).not.toHaveBeenCalled();
  });
});
